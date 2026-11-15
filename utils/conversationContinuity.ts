import type { APIConfig, Message } from '../types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  CHAT_CONTINUITY_PROMPT_VERSION,
  CONVERSATION_TOKEN_ESTIMATOR_ID,
  EMPTY_EARLIER_QUOTE_SELECTION,
  buildConversationContinuitySummaryPrompt,
  createConversationContinuityId,
  fingerprintConversationMessages,
  isConversationContinuityCapsuleValid,
  normalizeConversationContinuitySummary,
  planConversationContinuity,
  renderConversationContinuityContext,
  selectEarlierConversationQuotes,
  splitConversationTurnsForSummary,
  type ConversationContinuityCapsule,
  type ConversationTurn,
  type EarlierConversationQuoteSelection,
} from '../domain/conversationContinuity/index.ts';
import {
  isHistoricalContextMessage,
  messageMatchesRelationshipScope,
} from './messageContext.ts';
import { extractMemorySearchTerms } from './memoryCore/deliveryProfile';
import { DB } from './db.ts';
import { safeFetchJson } from './safeApi.ts';

export interface PreparedChatConversationContinuity {
  readonly recentMessages: Message[];
  readonly capsule?: ConversationContinuityCapsule;
  readonly markdown: string;
  /** Optional older verbatim turns. Empty when disabled, unmatched, or skipped. */
  readonly earlierQuoteMarkdown: string;
  readonly diagnostic: {
    readonly estimatorId: string;
    readonly trigger: 'message_limit' | 'estimated_token_budget' | 'none';
    readonly estimatedInputTokens: number;
    readonly rawMessageCount: number;
    readonly deliveredMessageCount: number;
    readonly summaryPasses: number;
    readonly compactedThroughMessageId?: number;
    readonly usedExistingCapsule: boolean;
    readonly fallback: boolean;
    readonly earlierQuoteTurns: number;
    readonly earlierQuoteChars: number;
  };
}

const capsuleAssetId = (scope: HistoryScope): string => (
  createConversationContinuityId(scope, 'chat')
);

const loadChatContinuityCapsule = async (
  scope: HistoryScope,
): Promise<ConversationContinuityCapsule | null> => {
  const value = await DB.getAssetRaw(capsuleAssetId(scope));
  return value && typeof value === 'object'
    ? value as ConversationContinuityCapsule
    : null;
};

const saveChatContinuityCapsule = async (
  capsule: ConversationContinuityCapsule,
): Promise<void> => {
  await DB.saveAssetRaw(capsule.id, capsule);
};

const deleteChatContinuityCapsule = async (scope: HistoryScope): Promise<void> => {
  await DB.deleteAsset(capsuleAssetId(scope));
};

const responseText = (data: any): string => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(item => typeof item === 'string' ? item : String(item?.text || ''))
    .join('\n');
};

const summarizeTurns = async (input: {
  apiConfig: APIConfig;
  turns: readonly ConversationTurn[];
  previousSummary?: string;
  userName: string;
  characterName: string;
}): Promise<{ summary: string; promptTokens?: number; completionTokens?: number }> => {
  const baseUrl = input.apiConfig.baseUrl.replace(/\/+$/, '');
  const prompt = buildConversationContinuitySummaryPrompt({
    previousSummary: input.previousSummary,
    turns: input.turns,
    userName: input.userName,
    characterName: input.characterName,
  });
  const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${input.apiConfig.apiKey || 'sk-none'}`,
    },
    body: JSON.stringify({
      model: input.apiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 1800,
      stream: false,
    }),
  });
  const summary = normalizeConversationContinuitySummary(responseText(data));
  if (!summary) throw new Error('聊天接续整理没有返回可用内容');
  return {
    summary,
    promptTokens: Number.isFinite(data?.usage?.prompt_tokens)
      ? data.usage.prompt_tokens
      : undefined,
    completionTokens: Number.isFinite(data?.usage?.completion_tokens)
      ? data.usage.completion_tokens
      : undefined,
  };
};

const messagesThrough = (messages: readonly Message[], throughMessageId: number): Message[] => (
  messages.filter(message => message.id <= throughMessageId)
);

const turnsAfter = (turns: readonly ConversationTurn[], throughMessageId: number): ConversationTurn[] => (
  turns.filter(turn => turn.lastMessageId > throughMessageId)
);

export const prepareChatConversationContinuity = async (input: {
  scope: HistoryScope;
  messages: readonly Message[];
  promptText: string;
  messageLimit: number;
  apiConfig: APIConfig;
  userName: string;
  characterName: string;
  /** Chat-only opt-in. Off by default; no fetch and no persistence. */
  earlierQuoteRecall?: boolean;
  now?: number;
}): Promise<PreparedChatConversationContinuity> => {
  const scopedLiveMessages = input.messages.filter(message => (
    !isHistoricalContextMessage(message)
    && messageMatchesRelationshipScope(message, input.scope)
    && message.metadata?.hidden !== true
    && message.metadata?.proactiveHint !== true
    && message.metadata?.source !== 'date'
    && message.metadata?.source !== 'call'
  ));
  const plan = planConversationContinuity({
    messages: scopedLiveMessages,
    promptText: input.promptText,
    messageLimit: input.messageLimit,
  });
  const latestUserMessage = input.earlierQuoteRecall
    ? [...scopedLiveMessages].reverse().find(message => message.role === 'user')
    : undefined;
  const earlierQuoteQuery = latestUserMessage?.type === 'text'
    && typeof latestUserMessage.content === 'string'
      ? latestUserMessage.content
      : '';
  const earlierQuoteFor = (
    deliveredMessages: readonly Message[],
  ): EarlierConversationQuoteSelection => {
    if (!input.earlierQuoteRecall || !earlierQuoteQuery.trim()) {
      return EMPTY_EARLIER_QUOTE_SELECTION;
    }
    try {
      return selectEarlierConversationQuotes({
        turns: plan.compactableTurns,
        query: earlierQuoteQuery,
        terms: extractMemorySearchTerms(earlierQuoteQuery),
        userName: input.userName,
        characterName: input.characterName,
        excludeMessageIds: new Set(deliveredMessages.map(message => message.id)),
      });
    } catch (error) {
      console.warn(
        '[Chat Continuity] Earlier quote selection skipped; keeping the normal path:',
        error,
      );
      return EMPTY_EARLIER_QUOTE_SELECTION;
    }
  };
  const storedCapsule = await loadChatContinuityCapsule(input.scope);
  const storedSourceMessages = storedCapsule
    ? messagesThrough(scopedLiveMessages, storedCapsule.throughMessageId)
    : [];
  const storedCapsuleIsValid = isConversationContinuityCapsuleValid({
    capsule: storedCapsule,
    scope: input.scope,
    surface: 'chat',
    summarizedMessages: storedSourceMessages,
  });
  const validStoredCapsule = storedCapsuleIsValid ? storedCapsule! : undefined;

  if (plan.trigger === 'none') {
    if (storedCapsule) await deleteChatContinuityCapsule(input.scope);
    const earlierQuote = earlierQuoteFor(scopedLiveMessages);
    return {
      recentMessages: [...scopedLiveMessages],
      markdown: '',
      earlierQuoteMarkdown: earlierQuote.markdown,
      diagnostic: {
        estimatorId: CONVERSATION_TOKEN_ESTIMATOR_ID,
        trigger: 'none',
        estimatedInputTokens: plan.estimatedInputTokens,
        rawMessageCount: scopedLiveMessages.length,
        deliveredMessageCount: scopedLiveMessages.length,
        summaryPasses: 0,
        usedExistingCapsule: false,
        fallback: false,
        earlierQuoteTurns: earlierQuote.turns.length,
        earlierQuoteChars: earlierQuote.renderedChars,
      },
    };
  }

  const targetMessages = [...plan.compactableMessages];
  const targetThroughMessageId = targetMessages[targetMessages.length - 1]?.id;
  if (!targetThroughMessageId) {
    const earlierQuote = earlierQuoteFor(scopedLiveMessages);
    return {
      recentMessages: [...scopedLiveMessages],
      markdown: '',
      earlierQuoteMarkdown: earlierQuote.markdown,
      diagnostic: {
        estimatorId: CONVERSATION_TOKEN_ESTIMATOR_ID,
        trigger: plan.trigger,
        estimatedInputTokens: plan.estimatedInputTokens,
        rawMessageCount: scopedLiveMessages.length,
        deliveredMessageCount: scopedLiveMessages.length,
        summaryPasses: 0,
        usedExistingCapsule: false,
        fallback: false,
        earlierQuoteTurns: earlierQuote.turns.length,
        earlierQuoteChars: earlierQuote.renderedChars,
      },
    };
  }

  let summary = validStoredCapsule?.summary || '';
  const deltaTurns = validStoredCapsule
    ? turnsAfter(plan.compactableTurns, validStoredCapsule.throughMessageId)
    : [...plan.compactableTurns];
  let summaryPasses = 0;

  try {
    for (const batch of splitConversationTurnsForSummary(deltaTurns)) {
      const result = await summarizeTurns({
        apiConfig: input.apiConfig,
        turns: batch,
        previousSummary: summary,
        userName: input.userName,
        characterName: input.characterName,
      });
      summary = result.summary;
      summaryPasses += 1;
      console.log(
        `🧶 [Chat Continuity] summary pass=${summaryPasses}`
        + ` prompt_tokens=${result.promptTokens ?? 'unknown'}`
        + ` completion_tokens=${result.completionTokens ?? 'unknown'}`,
      );
    }

    if (!summary) throw new Error('聊天接续便签为空');
    const capsule: ConversationContinuityCapsule = {
      schemaVersion: 1,
      id: capsuleAssetId(input.scope),
      scope: { ...input.scope },
      surface: 'chat',
      summary,
      throughMessageId: targetThroughMessageId,
      sourceFingerprint: fingerprintConversationMessages(targetMessages),
      promptVersion: CHAT_CONTINUITY_PROMPT_VERSION,
      updatedAt: input.now ?? Date.now(),
    };
    await saveChatContinuityCapsule(capsule);
    const earlierQuote = earlierQuoteFor(plan.recentMessages);
    return {
      recentMessages: [...plan.recentMessages],
      capsule,
      markdown: renderConversationContinuityContext(capsule),
      earlierQuoteMarkdown: earlierQuote.markdown,
      diagnostic: {
        estimatorId: CONVERSATION_TOKEN_ESTIMATOR_ID,
        trigger: plan.trigger,
        estimatedInputTokens: plan.estimatedInputTokens,
        rawMessageCount: scopedLiveMessages.length,
        deliveredMessageCount: plan.recentMessages.length,
        summaryPasses,
        compactedThroughMessageId: targetThroughMessageId,
        usedExistingCapsule: storedCapsuleIsValid,
        fallback: false,
        earlierQuoteTurns: earlierQuote.turns.length,
        earlierQuoteChars: earlierQuote.renderedChars,
      },
    };
  } catch (error) {
    console.warn('[Chat Continuity] Could not refresh the continuity capsule:', error);
    const fallbackCapsule = validStoredCapsule;
    const fallbackMessages = fallbackCapsule
      ? scopedLiveMessages.filter(message => message.id > fallbackCapsule.throughMessageId)
      : scopedLiveMessages.slice(-Math.max(1, input.messageLimit));
    const earlierQuote = earlierQuoteFor(fallbackMessages);
    return {
      recentMessages: fallbackMessages,
      capsule: fallbackCapsule,
      markdown: fallbackCapsule ? renderConversationContinuityContext(fallbackCapsule) : '',
      earlierQuoteMarkdown: earlierQuote.markdown,
      diagnostic: {
        estimatorId: CONVERSATION_TOKEN_ESTIMATOR_ID,
        trigger: plan.trigger,
        estimatedInputTokens: plan.estimatedInputTokens,
        rawMessageCount: scopedLiveMessages.length,
        deliveredMessageCount: fallbackMessages.length,
        summaryPasses,
        compactedThroughMessageId: fallbackCapsule?.throughMessageId,
        usedExistingCapsule: Boolean(fallbackCapsule),
        fallback: true,
        earlierQuoteTurns: earlierQuote.turns.length,
        earlierQuoteChars: earlierQuote.renderedChars,
      },
    };
  }
};
