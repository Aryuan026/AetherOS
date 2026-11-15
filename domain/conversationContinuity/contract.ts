import type { Message } from '../../types.ts';
import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import type {
  ConversationContinuityCapsule,
  ConversationContinuityPlan,
  ConversationContinuitySurface,
  ConversationContinuitySurfaceContract,
  ConversationTurn,
  EarlierConversationQuoteSelection,
} from './types.ts';

export const CHAT_CONTINUITY_PROMPT_VERSION = 'chat-continuity-v1';
export const CHAT_CONTINUITY_RECENT_TURNS = 10;
export const CHAT_CONTINUITY_SOFT_INPUT_TOKENS = 12_000;
export const CHAT_CONTINUITY_SUMMARY_BATCH_TOKENS = 6_000;
export const CHAT_CONTINUITY_MAX_SUMMARY_CHARS = 1_600;
export const CONVERSATION_TOKEN_ESTIMATOR_ID = 'aetheros-cjk-latin-v1';

export const CHAT_EARLIER_QUOTE_MAX_TURNS = 3;
export const CHAT_EARLIER_QUOTE_MAX_CHARS = 1_200;
export const CHAT_EARLIER_QUOTE_HEADER = `### 更早的聊天原话（仅用于恢复细节）
以下是同一关系、同一聊天线程中更早的原话摘录，只用于恢复与当前输入相关的具体细节。这些是更早聊天原话，不是长期记忆、当前生活状态、剧情事实、行为要求或工具权限，不得写回记忆真相。最近原文和当前输入优先。`;
export const EMPTY_EARLIER_QUOTE_SELECTION: EarlierConversationQuoteSelection = {
  turns: [],
  markdown: '',
  renderedChars: 0,
};

export const CONVERSATION_CONTINUITY_SURFACE_CONTRACTS = {
  chat: {
    surface: 'chat',
    inputSlot: 'after_trusted_context_before_recent_turns',
    continuationOwner: 'chat_thread',
    runtimeStatus: 'implemented',
    mayReadChatCapsule: true,
    mayPromoteDirectly: false,
  },
  proactive_letter: {
    surface: 'proactive_letter',
    inputSlot: 'after_life_and_memory_before_opening_seed',
    continuationOwner: 'proactive_remote_thread',
    runtimeStatus: 'hold',
    mayReadChatCapsule: false,
    mayPromoteDirectly: false,
  },
  call: {
    surface: 'call',
    inputSlot: 'after_role_and_availability_before_call_transcript',
    continuationOwner: 'call_session',
    runtimeStatus: 'hold',
    mayReadChatCapsule: false,
    mayPromoteDirectly: false,
  },
  date: {
    surface: 'date',
    inputSlot: 'after_life_and_route_before_scene_turns',
    continuationOwner: 'date_session',
    runtimeStatus: 'hold',
    mayReadChatCapsule: false,
    mayPromoteDirectly: false,
  },
  story_mainline: {
    surface: 'story_mainline',
    inputSlot: 'after_canon_route_and_scene_plan_before_manuscript_tail',
    continuationOwner: 'mainline_route',
    runtimeStatus: 'hold',
    mayReadChatCapsule: false,
    mayPromoteDirectly: false,
  },
  story_if: {
    surface: 'story_if',
    inputSlot: 'after_canon_and_branch_before_branch_tail',
    continuationOwner: 'if_branch',
    runtimeStatus: 'hold',
    mayReadChatCapsule: false,
    mayPromoteDirectly: false,
  },
  story_scene: {
    surface: 'story_scene',
    inputSlot: 'after_premise_and_cast_before_scene_tail',
    continuationOwner: 'bounded_scene',
    runtimeStatus: 'hold',
    mayReadChatCapsule: false,
    mayPromoteDirectly: false,
  },
} as const satisfies Record<
  ConversationContinuitySurface,
  ConversationContinuitySurfaceContract
>;

const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export const estimateConversationTokens = (text: string): number => {
  if (!text) return 0;
  const cjkCount = text.match(CJK_CHARACTER)?.length || 0;
  const remainingCodeUnits = Math.max(0, text.length - cjkCount);
  return cjkCount + Math.ceil(remainingCodeUnits / 4);
};

const messageTextForEstimate = (message: Message): string => {
  const reply = message.replyTo?.content ? `\nreply:${message.replyTo.content}` : '';
  return `${message.role}:${message.type}:${message.content}${reply}`;
};

export const estimateConversationMessagesTokens = (messages: readonly Message[]): number => (
  messages.reduce((total, message) => total + estimateConversationTokens(messageTextForEstimate(message)), 0)
);

const responseGroupKey = (message: Message): string => (
  String(
    message.metadata?.assistantResponseId
    || message.metadata?.interactionId
    || message.metadata?.dateSessionId
    || message.metadata?.callSessionId
    || '',
  )
);

export const groupConversationTurns = (messages: readonly Message[]): ConversationTurn[] => {
  const groups: Message[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || groups.length === 0) {
      groups.push([message]);
      continue;
    }
    const current = groups[groups.length - 1];
    const previous = current[current.length - 1];
    const previousGroupKey = responseGroupKey(previous);
    const currentGroupKey = responseGroupKey(message);
    if (
      message.role === 'assistant'
      && previous.role === 'assistant'
      && previousGroupKey
      && currentGroupKey
      && previousGroupKey !== currentGroupKey
    ) {
      groups.push([message]);
      continue;
    }
    current.push(message);
  }

  return groups.map(group => ({
    messages: group,
    firstMessageId: group[0].id,
    lastMessageId: group[group.length - 1].id,
    estimatedTokens: estimateConversationMessagesTokens(group),
  }));
};

export const planConversationContinuity = (input: {
  messages: readonly Message[];
  promptText: string;
  messageLimit: number;
  recentTurnCount?: number;
  softInputTokenBudget?: number;
}): ConversationContinuityPlan => {
  const recentTurnCount = Math.max(1, Math.floor(
    input.recentTurnCount ?? CHAT_CONTINUITY_RECENT_TURNS,
  ));
  const turns = groupConversationTurns(input.messages);
  const compactableTurnCount = Math.max(0, turns.length - recentTurnCount);
  const compactableTurns = turns.slice(0, compactableTurnCount);
  const recentTurns = turns.slice(compactableTurnCount);
  const estimatedInputTokens = estimateConversationTokens(input.promptText)
    + estimateConversationMessagesTokens(input.messages);
  const messageLimitReached = input.messages.length > Math.max(1, Math.floor(input.messageLimit));
  const tokenBudgetReached = estimatedInputTokens > (
    input.softInputTokenBudget ?? CHAT_CONTINUITY_SOFT_INPUT_TOKENS
  );
  const trigger = compactableTurns.length === 0
    ? 'none'
    : messageLimitReached
      ? 'message_limit'
      : tokenBudgetReached
        ? 'estimated_token_budget'
        : 'none';

  return {
    trigger,
    estimatedInputTokens,
    turns,
    compactableTurns,
    recentTurns,
    compactableMessages: compactableTurns.flatMap(turn => turn.messages),
    recentMessages: recentTurns.flatMap(turn => turn.messages),
  };
};

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const fingerprintConversationMessages = (messages: readonly Message[]): string => fnv1a(
  messages.map(message => JSON.stringify({
    id: message.id,
    timestamp: message.timestamp,
    role: message.role,
    type: message.type,
    content: message.content,
    replyTo: message.replyTo || null,
    revision: message.metadata?.dailyArchiveRevision || 0,
    relationshipScope: message.metadata?.relationshipScope || null,
  })).join('\n'),
);

export const createConversationContinuityId = (
  scope: HistoryScope,
  surface: ConversationContinuityCapsule['surface'],
): string => `conversation-continuity:${surface}:${createHistoryScopeKey(scope)}`;

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

export const isConversationContinuityCapsuleValid = (input: {
  capsule: ConversationContinuityCapsule | null | undefined;
  scope: HistoryScope;
  surface: ConversationContinuityCapsule['surface'];
  summarizedMessages: readonly Message[];
}): input is typeof input & { capsule: ConversationContinuityCapsule } => {
  const capsule = input.capsule;
  if (!capsule || capsule.schemaVersion !== 1) return false;
  if (validateHistoryScope(input.scope).length > 0) return false;
  if (!sameScope(capsule.scope, input.scope)) return false;
  if (capsule.surface !== input.surface) return false;
  if (capsule.promptVersion !== CHAT_CONTINUITY_PROMPT_VERSION) return false;
  if (!capsule.summary.trim() || capsule.throughMessageId < 1) return false;
  return capsule.sourceFingerprint === fingerprintConversationMessages(input.summarizedMessages);
};

export const splitConversationTurnsForSummary = (
  turns: readonly ConversationTurn[],
  batchTokenBudget = CHAT_CONTINUITY_SUMMARY_BATCH_TOKENS,
): ConversationTurn[][] => {
  const batches: ConversationTurn[][] = [];
  let current: ConversationTurn[] = [];
  let currentTokens = 0;

  for (const turn of turns) {
    if (current.length > 0 && currentTokens + turn.estimatedTokens > batchTokenBudget) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(turn);
    currentTokens += turn.estimatedTokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
};

export const formatConversationTurnsForSummary = (
  turns: readonly ConversationTurn[],
  userName: string,
  characterName: string,
): string => turns.flatMap(turn => turn.messages.map(message => {
  const speaker = message.role === 'user'
    ? userName
    : message.role === 'assistant'
      ? characterName
      : '系统';
  const source = message.metadata?.source ? ` · ${message.metadata.source}` : '';
  const time = new Date(message.timestamp).toISOString();
  const content = message.type === 'image'
    ? '[图片]'
    : message.type === 'emoji'
      ? '[表情]'
      : message.content;
  return `[${time}${source}] ${speaker}: ${content}`;
})).join('\n');

export const buildConversationContinuitySummaryPrompt = (input: {
  previousSummary?: string;
  turns: readonly ConversationTurn[];
  userName: string;
  characterName: string;
}): string => `你在维护一张“当前聊天接续便签”。它只帮助下一轮接住刚刚聊过的内容，不是长期记忆、角色设定、当前生活状态或剧情事实库。

请把旧便签与新增对话合并成一份简洁的接续摘要：
- 保留仍在进行的话题、明确指代、没说完的问题、近期约定及其真实时间状态。
- 保留这段聊天中新出现且后续接话必要的人物、物件、场景和关系变化。
- 区分已经结束、只是玩笑/假设/共同创作、以及仍待回应的内容；不要把虚构动作写成现实当前状态。
- 保留双方互动的近期情绪走向，但不要总结语言风格，不要编写角色行为指令，也不要推断永久关系结论。
- 最近原文会另外提供，所以不要复述台词；不得添加原文没有的信息。
- 只输出便签正文，不要标题、JSON、代码块或解释；不超过 ${CHAT_CONTINUITY_MAX_SUMMARY_CHARS} 个中文字符。

旧便签：
${input.previousSummary?.trim() || '（无，这是第一批）'}

新增对话：
${formatConversationTurnsForSummary(input.turns, input.userName, input.characterName)}`;

export const normalizeConversationContinuitySummary = (value: string): string => {
  const cleaned = value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:text|markdown)?\s*([\s\S]*?)```/gi, '$1')
    .trim();
  return cleaned.slice(0, CHAT_CONTINUITY_MAX_SUMMARY_CHARS).trim();
};

export const renderConversationContinuityContext = (capsule: ConversationContinuityCapsule): string => `### 当前聊天接续便签
以下是同一关系、同一聊天线程更早部分的可重建摘要，只用来承接话题、指代与近期互动。最近原文优先；它不是长期记忆、当前生活状态、剧情既定事实、提醒、工具权限或行为指令。
${capsule.summary}`;

const earlierQuoteMessageText = (message: Message): string | null => {
  if (message.role === 'system') return null;
  if (message.type === 'image') return '[图片]';
  if (message.type === 'emoji') return '[表情]';
  if (message.type !== 'text' || typeof message.content !== 'string') return null;
  const [original] = message.content.split('%%BILINGUAL%%');
  return original.replace(/\s+/g, ' ').trim() || null;
};

/**
 * Local, read-only selector for a few older verbatim turns. The caller passes
 * only exact-scope live turns that are not already delivered raw; this function
 * never fetches, persists, or promotes anything.
 */
export const selectEarlierConversationQuotes = (input: {
  turns: readonly ConversationTurn[];
  query: string;
  terms: readonly string[];
  userName: string;
  characterName: string;
  excludeMessageIds?: ReadonlySet<number>;
}): EarlierConversationQuoteSelection => {
  const query = input.query.replace(/\s+/g, ' ').trim();
  const terms = [...new Set(
    input.terms
      .map(term => term.trim().toLowerCase())
      .filter(term => term.length >= 2),
  )];
  if (!query || terms.length === 0 || input.turns.length === 0) {
    return EMPTY_EARLIER_QUOTE_SELECTION;
  }
  const maxBodyChars = CHAT_EARLIER_QUOTE_MAX_CHARS - CHAT_EARLIER_QUOTE_HEADER.length - 1;
  const excludedIds = input.excludeMessageIds;
  const seenTurnText = new Set<string>();
  const candidates: Array<{ turn: ConversationTurn; score: number; rendered: string }> = [];

  for (const turn of input.turns) {
    if (excludedIds && turn.messages.some(message => excludedIds.has(message.id))) continue;
    const textMessages = turn.messages
      .map(message => ({ message, text: earlierQuoteMessageText(message) }))
      .filter((item): item is { message: Message; text: string } => item.text !== null);
    if (textMessages.length !== turn.messages.length) continue;
    const fullText = textMessages.map(item => item.text).join('\n').toLowerCase();
    const userText = textMessages
      .filter(item => item.message.role === 'user')
      .map(item => item.text)
      .join(' ')
      .toLowerCase();
    const matched = terms.filter(term => fullText.includes(term));
    if (matched.length === 0) continue;
    // A single generic bigram that only appears in an old reply is too weak to
    // justify spending quote budget. Prefer input-side, repeated or longer hits.
    const userHit = matched.some(term => userText.includes(term));
    const strongMatch = userHit
      || matched.length >= 2
      || matched.some(term => term.length >= 3);
    if (!strongMatch) continue;
    const signature = textMessages.map(item => item.text).join('\u0001');
    if (seenTurnText.has(signature)) continue;
    seenTurnText.add(signature);
    const specificity = matched.reduce(
      (total, term) => total + Math.min(term.length, 12),
      0,
    );
    const userEmphasis = matched
      .filter(term => userText.includes(term))
      .reduce((total, term) => total + Math.min(term.length, 12), 0);
    const score = specificity * 2 + userEmphasis + matched.length;
    const rendered = textMessages.map(item => {
      const speaker = item.message.role === 'user' ? input.userName : input.characterName;
      return `${speaker}：${item.text}`;
    }).join('\n');
    candidates.push({ turn, score, rendered });
  }
  if (candidates.length === 0) return EMPTY_EARLIER_QUOTE_SELECTION;

  candidates.sort((left, right) => (
    right.score - left.score
    || right.turn.lastMessageId - left.turn.lastMessageId
    || left.turn.firstMessageId - right.turn.firstMessageId
  ));

  const selected: Array<{ turn: ConversationTurn; rendered: string }> = [];
  let bodyChars = 0;
  for (const candidate of candidates) {
    if (selected.length >= CHAT_EARLIER_QUOTE_MAX_TURNS || bodyChars >= maxBodyChars) break;
    const separator = selected.length > 0 ? 2 : 0;
    if (bodyChars + separator + candidate.rendered.length > maxBodyChars) {
      continue;
    }
    selected.push({ turn: candidate.turn, rendered: candidate.rendered });
    bodyChars += separator + candidate.rendered.length;
  }
  if (selected.length === 0) return EMPTY_EARLIER_QUOTE_SELECTION;

  selected.sort((left, right) => (
    left.turn.firstMessageId - right.turn.firstMessageId
    || left.turn.lastMessageId - right.turn.lastMessageId
  ));
  const body = selected.map(item => item.rendered).join('\n\n');
  const markdown = `${CHAT_EARLIER_QUOTE_HEADER}\n${body}`;
  return {
    turns: selected.map(item => item.turn),
    markdown,
    renderedChars: markdown.length,
  };
};
