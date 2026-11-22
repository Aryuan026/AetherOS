import type { Message } from '../../types.ts';
import { extractExplicitRecallCueTerms } from '../../utils/memoryCore/deliveryProfile';
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
export const CHAT_EARLIER_QUOTE_DEFAULT_WEEKS = 1;
export const CHAT_EARLIER_QUOTE_MAX_WEEKS = 3;
export const CHAT_EARLIER_QUOTE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Internal, non-configurable safety bounds for the one bounded reverse scan
 * that feeds earlier-quote recall. They bound local access only; they are not
 * a product-visible range and may be recalibrated by the owner.
 *
 * `MAX_MESSAGES` / `MAX_CHARS` are candidate budgets: only rows that pass the
 * exact-scope/exclusion filter consume them. `MAX_VISITS` / `MAX_RAW_CHARS` are
 * separate hard caps on raw cursor work so rows rejected by scope/exclusion do
 * not exhaust the candidate budget, while the scan remains a bounded walk.
 *
 * The candidate message budget is calibrated to the character budget instead
 * of an arbitrary 300-row page: 900 admitted messages at the 32,000-character
 * cap is about 35 characters per message. Short-message chat therefore reaches
 * a target that sits behind 150 later complete turns instead of stopping at
 * 300 admitted rows, while the scan still cannot exceed 1,800 raw visits /
 * 64,000 raw characters / 32,000 admitted characters.
 *
 * Technical lineage: this admission split adapts the scan-pool-before-demotion
 * pattern in NousResearch/hermes-agent main snapshot
 * `9dd9421f1dd7be7b629873da7a42fb213d595a54` (source blob
 * `160ac306a9859c510f00539d9567fdedd50bed78`; `tools/session_search_tool.py`:
 * `_DISCOVER_SCAN_LIMIT`, demotion before dedupe, `_READ_MAX_CONTENT`, with
 * regressions in `tests/tools/test_session_search.py`; MIT License, Copyright
 * (c) 2025 Nous Research). AetherOS implements the bounded local cursor itself;
 * no upstream source code was copied.
 */
export const CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES = 900;
export const CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS = 32_000;
export const CHAT_EARLIER_QUOTE_SCAN_MAX_VISITS = 1_800;
export const CHAT_EARLIER_QUOTE_SCAN_MAX_RAW_CHARS = 64_000;
export const CHAT_EARLIER_QUOTE_HEADER = `### 更早的聊天原话（仅用于恢复细节）
以下是同一关系、同一聊天线程中更早的原话摘录，只用于恢复与当前输入相关的具体细节。这些是更早聊天原话，不是长期记忆、当前生活状态、剧情事实、行为要求或工具权限，不得写回记忆真相。最近原文和当前输入优先。`;
export const EMPTY_EARLIER_QUOTE_SELECTION: EarlierConversationQuoteSelection = {
  turns: [],
  markdown: '',
  renderedChars: 0,
};

export const normalizeEarlierQuoteWeeks = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return CHAT_EARLIER_QUOTE_DEFAULT_WEEKS;
  return Math.min(
    CHAT_EARLIER_QUOTE_MAX_WEEKS,
    Math.max(CHAT_EARLIER_QUOTE_DEFAULT_WEEKS, Math.floor(parsed)),
  );
};

export const earlierQuoteCutoff = (
  anchorTimestamp: number,
  weeks: unknown,
): number => {
  const anchor = Number.isFinite(anchorTimestamp) ? anchorTimestamp : Date.now();
  return anchor - (normalizeEarlierQuoteWeeks(weeks) * CHAT_EARLIER_QUOTE_WEEK_MS);
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

const EARLIER_QUOTE_ASK_SHAPE = /[？?]|吗|呢|哪|什么|谁|几点|多少|几(?:岁|个|只|次|件|本|张|杯|瓶|把|台|部|楼)|怎么|为什么|是不是|对不对|对吧|是吧|来着|还是|或者/;
const EARLIER_QUOTE_LOCATION_QUERY = /(?:哪儿|哪里|在哪|还在吗|还在不在|在(?!还|卖|营业|吗|不|没)|位置|地方|见面|碰头|(?:放|收|搁|落|藏)(?:在|到|哪)|约在|约的是(?!几点|谁|什么|多少|哪年|哪天))/;
const EARLIER_QUOTE_TIME_QUERY = /(?:几点|哪年|哪月|几月|哪日|几号|哪天|什么时候|星期几|周几|[零一二三四五六七八九十两\d]+点)/;
const EARLIER_QUOTE_COMPARISON = /(?:哪个|更|最好)/;
const EARLIER_QUOTE_OWNER_QUERY = /谁(?:的|家|开|经营|创办)/;
const EARLIER_QUOTE_CURRENT_MARKER = /(?:今天|今晚|现在|最近|已经|还没|刚刚|刚才|等会儿|以后|明天|下周|这次)/;
const EARLIER_QUOTE_ACTION_MARKER = /(?:买|卖|修|做|取|送|去|来|想|要|带|给|放|收|搁|落|藏|订|预约)/;
const EARLIER_QUOTE_CURRENT_ACTION_QUERY = /(?:哪(?:里|儿|家(?:店)?)?|什么地方)(?:可以买|能买|有卖|买得到|买|卖|修|做|取|送)(?:到)?|(?:可以买|能买|买|卖|修|做|取|送)(?:到)?(?:在)?(?:哪(?:里|儿|家(?:店)?)?|什么地方)/;
const EARLIER_QUOTE_TIME_EVIDENCE = /[零一二三四五六七八九十两\d]+点|(?:周|星期)[一二三四五六日天]|今天|明天|昨天|那天|\d+[年月日号]/;
interface EarlierQuoteMessageEvidence { readonly clauses: readonly string[]; }
interface EarlierQuoteTurnEvidence { readonly turn: ConversationTurn; readonly rendered: string; readonly signature: string; readonly messages: readonly EarlierQuoteMessageEvidence[]; }
interface EarlierQuoteAsk { readonly entity: string; readonly details: readonly string[]; readonly location: boolean; readonly time: boolean; readonly owner: boolean; readonly quantity: boolean; readonly unit: string; }
const earlierQuoteClauses = (text: string): string[] => (
  text.split(/[，,。！!？?；;\n]+/).map(clause => clause.trim()).filter(Boolean)
);

const earlierQuoteContentRuns = (text: string): string[] => (
  text.toLowerCase().split(/[^\u4e00-\u9fffa-z0-9]+/).filter(Boolean)
);
type EarlierQuoteEntityMatchKind = 'exact' | 'variant';

interface EarlierQuoteEntityMatch { readonly kind: EarlierQuoteEntityMatchKind; readonly start: number; readonly end: number; }

const EARLIER_QUOTE_VARIANT_GAP_REJECT = /[\s，。！？；、]|和|与|及|或|跟|同|并|我|你|他|她|它|我们|你们|他们|在|到|从|向|把|被|给|旁边|附近|上下|里外|前后/;

const earlierQuoteEntityMatches = (
  entity: string,
  clause: string,
): EarlierQuoteEntityMatch[] => {
  if (entity.length === 0) return [];
  const matches: EarlierQuoteEntityMatch[] = [];
  let exact = clause.indexOf(entity);
  while (exact >= 0) {
    matches.push({ kind: 'exact', start: exact, end: exact + entity.length });
    exact = clause.indexOf(entity, exact + 1);
  }
  if (entity.length < 3) return matches;
  for (let prefixLength = entity.length - 1; prefixLength >= 2; prefixLength -= 1) {
    const prefix = entity.slice(0, prefixLength);
    for (let suffixLength = 1; suffixLength <= entity.length - prefixLength; suffixLength += 1) {
      const suffix = entity.slice(entity.length - suffixLength);
      if (prefixLength + suffixLength !== entity.length) continue;
      let start = clause.indexOf(prefix);
      while (start >= 0) {
        let end = clause.indexOf(suffix, start + prefix.length);
        while (end >= 0) {
          const gap = clause.slice(start + prefix.length, end);
          if (
            gap.length > 0
            && gap.length <= 4
            && !EARLIER_QUOTE_VARIANT_GAP_REJECT.test(gap)
            && gap.replace(/[的之]/g, '').length <= 2
          ) {
            matches.push({ kind: 'variant', start, end: end + suffix.length });
          }
          end = clause.indexOf(suffix, end + 1);
        }
        start = clause.indexOf(prefix, start + 1);
      }
    }
  }
  return matches;
};

const buildEarlierQuoteTurnEvidence = (input: {
  turn: ConversationTurn;
  userName: string;
  characterName: string;
}): EarlierQuoteTurnEvidence | null => {
  const textMessages = input.turn.messages
    .map(message => ({ message, text: earlierQuoteMessageText(message) }))
    .filter((item): item is { message: Message; text: string } => item.text !== null);
  if (textMessages.length !== input.turn.messages.length) return null;
  return {
    turn: input.turn,
    rendered: textMessages.map(item => {
      const speaker = item.message.role === 'user' ? input.userName : input.characterName;
      return `${speaker}：${item.text}`;
    }).join('\n'),
    signature: textMessages.map(item => item.text).join('\u0001'),
    messages: textMessages.map(item => {
      const text = item.text.toLowerCase();
      return { clauses: earlierQuoteClauses(text) };
    }),
  };
};

const EARLIER_QUOTE_LEADING_BOUNDARY = /^(?:你还记得|你还记不记得|你记得|还记得|请问|想问|我想问|我们是不是说好|之前说过|之前那个|之前|上次|那天|那次|以前|当时|刚才忽然想起|刚才|我想起|我记得|那[本只支把张件条辆台部杯瓶盒包份双套副个位名家间座扇片块颗粒根串束朵棵株匹头群对排行])/;
const EARLIER_QUOTE_TRAILING_BOUNDARY = /(?:对不对|对吧|是吧|来着|还记得吗|记得吗|还在不在|还在吗|还在|吗|呢|吧|了)$/;

const earlierQuoteBoundaryEntity = (query: string): string => {
  let text = query.toLowerCase().replace(/[？?。！!]+$/g, '').trim();
  text = text.replace(EARLIER_QUOTE_LEADING_BOUNDARY, '').trim();
  text = text.replace(EARLIER_QUOTE_LEADING_BOUNDARY, '').replace(/^(?:那|这)(?:本|只|支|把|张|件|条|辆|台|部|杯|瓶|盒|包|份|双|套|副|个|位|名|家|间|座|扇|片|块|颗|粒|根|串|束|朵|棵|株|匹|头|群|对|排|行)/, '').trim();
  while (EARLIER_QUOTE_TRAILING_BOUNDARY.test(text)) {
    text = text.replace(EARLIER_QUOTE_TRAILING_BOUNDARY, '').trim();
  }
  const measure = /(?:那|这)(?:本|只|支|把|张|件|条|辆|台|部|杯|瓶|盒|包|份|双|套|副|个|位|名|家|间|座|扇|片|块|颗|粒|根|串|束|朵|棵|株|匹|头|群|对|排|行)([^，,。！？\s]+)$/.exec(text);
  if (measure) text = measure[1];
  const nestedDetail = /^(.+?)(?:里的|中的)(?:细节|内容)是什么$/.exec(text);
  if (nestedDetail?.[1] && nestedDetail[1].length >= 2) return nestedDetail[1].trim();
  const describedPlace = /(?:那次|那天|时)([^，,。！？]{2,6})的(?:店|位置)(?:叫什么|是什么)$/.exec(text);
  if (describedPlace?.[1]) return describedPlace[1].trim();
  const referencedPlace = /^([^，,。！？\s]{2,6})那家[^，,。！？]*店[^，,。！？]*(?:什么位置)$/.exec(text);
  if (referencedPlace?.[1]) return referencedPlace[1].trim();
  const property = /^什么([^的]{1,4})的(.+)$/.exec(text);
  if (property) return property[2].trim();
  const bookedDetail = /订的是([^，,。！？]+)$/.exec(text);
  if (bookedDetail?.[1] && bookedDetail[1].length >= 2) return bookedDetail[1].trim();
  const destinationTime = /^.+?去(.+?)是哪天几点$/.exec(text);
  if (destinationTime?.[1] && destinationTime[1].length >= 2) return destinationTime[1].trim();
  const activityTime = /^(.+?去.+?)约的几点$/.exec(text);
  if (activityTime?.[1] && activityTime[1].length >= 2) return activityTime[1].trim();
  const subjectDestination = /^(?:(?:周|星期)[一二三四五六日天](?:上午|下午|晚上|早上|中午)?)?(.+?)去的是哪家(?:医院|店)?$/.exec(text);
  if (subjectDestination?.[1] && subjectDestination[1].length >= 2) return subjectDestination[1].trim();
  const plannedPlace = /(?:约在|(?<!预)约的是)([^，,。！？]+)$/.exec(text);
  if (plannedPlace?.[1] && plannedPlace[1].length >= 2) return plannedPlace[1].trim();
  const trailingEntity = /(?:订的|说的是|(?<!预)约的是|说好去|约好去|去)([^，,。！？]+)$/.exec(text);
  if (trailingEntity?.[1] && trailingEntity[1].length >= 2) return trailingEntity[1].trim();
  const locatedEntity = /(?:是不是)?在([^，,。！？]+?)(?:见面|碰头)$/.exec(text);
  if (locatedEntity?.[1] && locatedEntity[1].length >= 2) return locatedEntity[1].trim();
  const boundary = /(?:放在|放到|放哪|收在|收进|收到|收哪|夹在|夹哪|摆在|摆哪|挂在|挂哪|藏在|藏到|藏哪|搁在|搁哪|落在|落哪|埋在|埋哪|插在|插哪|停在|存进|塞进|压到|预约|是谁|多少钱|几岁|几点|约的几点|是什么|叫什么|在哪|哪儿|哪里|多少|哪家|哪一个|哪个)/.exec(text);
  if (!boundary) {
    return !EARLIER_QUOTE_ASK_SHAPE.test(text)
      && !EARLIER_QUOTE_CURRENT_MARKER.test(text)
      && !EARLIER_QUOTE_ACTION_MARKER.test(text)
      && text.length >= 2
      ? text
      : '';
  }
  if (boundary.index < 2) return '';
  const entity = text.slice(0, boundary.index).replace(/[，,。！？\s]+$/g, '').replace(/(?:最后|当时|现在|以前|之前|来着|的|了|是)+$/,'').trim();
  if (entity.length < 2) return '';
  return entity;
};

const earlierQuoteAskForText = (
  text: string,
  allowAlternative = false,
  sharedRecallIntent = false,
): EarlierQuoteAsk | null => {
  const locationQuery = EARLIER_QUOTE_LOCATION_QUERY.test(text)
    && !/(?:是|是不是)约在[^，,。！？]+吗/.test(text)
    && !/(?<!预)约的是[^，,。！？]+(?:对吧|是吧|吗)$/.test(text)
    && !/(?:之前|以前|上次|那次|那天|当时).*是不是在[^，,。！？]+(?:见面|碰头)$/.test(text);
  const timeQuery = EARLIER_QUOTE_TIME_QUERY.test(text);
  const fragmentRuns = earlierQuoteContentRuns(text);
  const fragmentMode = !sharedRecallIntent
    && !EARLIER_QUOTE_ASK_SHAPE.test(text)
    && !EARLIER_QUOTE_CURRENT_MARKER.test(text)
    && !EARLIER_QUOTE_ACTION_MARKER.test(text)
    && fragmentRuns.length > 1;
  const alternativeOption = allowAlternative
    ? /(?:订的|约的)是([^，,。！？]+)$/.exec(text)?.[1]?.trim() ?? ''
    : '';
  const entity = alternativeOption.length >= 2
    ? alternativeOption
    : fragmentMode
      ? fragmentRuns[0]
      : earlierQuoteBoundaryEntity(text);
  if (entity.length < 2) return null;
  const location = locationQuery;
  const time = timeQuery;
  const escapedEntity = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixedEntity = new RegExp(`^(.{2,12}?)(?:那|这)(?:个|本|副|只|件|条|辆|台|部|张)?${escapedEntity}`).exec(text);
  const prefixDetail = prefixedEntity?.[1]
    ?.replace(EARLIER_QUOTE_LEADING_BOUNDARY, '')
    .replace(/(?:里|内)$/, '')
    .trim() ?? '';
  const propertyQuery = text
    .replace(/[？?。！!]+$/g, '')
    .replace(EARLIER_QUOTE_TRAILING_BOUNDARY, '')
    .trim();
  const prefixedProperty = /^什么([^的]{1,4})的/.exec(propertyQuery)?.[1]?.trim() ?? '';
  const askedProperty = /是什么([^，,。！？?]{2,8})$/.exec(propertyQuery)?.[1]?.trim() ?? '';
  const details = [
    ...(prefixDetail.length >= 2 ? [prefixDetail] : []),
    ...(prefixedProperty.length >= 2 ? [prefixedProperty] : []),
    ...(askedProperty.length >= 2 ? [askedProperty] : []),
    ...(fragmentMode ? fragmentRuns.slice(1).filter(run => run.length >= 2) : []),
  ];
  const entityOnlyAllowed = (
    extractExplicitRecallCueTerms(text).length > 0
    || /(?:说过|讲过|聊过|提过|问过|说好|约好|是约在|约的是)/.test(text)
    || sharedRecallIntent
    || (
      !EARLIER_QUOTE_ASK_SHAPE.test(text)
      && !EARLIER_QUOTE_CURRENT_MARKER.test(text)
      && !EARLIER_QUOTE_ACTION_MARKER.test(text)
      && earlierQuoteContentRuns(text).join('').length >= 4
    )
    || /(?:是什么|是谁|叫什么|哪家|哪个)/.test(text)
    || allowAlternative
    || location || time
    || EARLIER_QUOTE_OWNER_QUERY.test(text)
    || /多少|几(?:岁|个|只|次|件|本|张|杯|瓶|把|台|部|楼)/.test(text)
  );
  if (!entityOnlyAllowed && details.length === 0) return null;
  return {
    entity, details, location, time,
    owner: EARLIER_QUOTE_OWNER_QUERY.test(text),
    quantity: /多少|几(?:岁|个|只|次|件|本|张|杯|瓶|把|台|部|楼)/.test(text),
    unit: /多少钱|价格|价钱/.test(text) ? 'currency'
      : /几岁|年龄/.test(text) ? 'age'
        : (/(?:几|多少)([\u4e00-\u9fff])/.exec(text)?.[1] ?? ''),
  };
};

const EARLIER_QUOTE_LOCATION_RELATION = /(?:放|收|搁|落|藏|夹|塞|摆|挂|压|存|埋|插|停)(?:在|到|进|入|于|下|上|里|旁|边)?|(?:在|到|进)[^。！？]{0,10}(?:里|上|下(?!雨)|内|外|旁|边|面)(?=$|[，。！？、\s]|了|的|面)|(?:在|到|进)第[零一二三四五六七八九十百\d]+/;
const EARLIER_QUOTE_OWNER_RELATION = /(?:是|属于|归)([^。！？]{1,12})(?:的|开的|经营的|创办的)/;
const EARLIER_QUOTE_ANSWER_GAP = /(?:花|买|购|价格|售价|钱|一共|合计|总计|已经|排|定|约|预约|安排|要)/g;
const EARLIER_QUOTE_GAP_GLUE = /(?:的|了|着|过|是|在|到|去|来|进|把|被|给|让|送|为|和|与|及|或|跟|同|并|会|得|我们|你们|他们|我|你|他|她|它)/g;

const earlierQuoteGapContent = (gap: string, allowed: readonly string[] = []): string => {
  let cleaned = gap.replace(EARLIER_QUOTE_ANSWER_GAP, ' ').replace(/[0-9]+/g, ' ');
  for (const term of allowed) cleaned = cleaned.split(term).join(' ');
  return cleaned.replace(EARLIER_QUOTE_GAP_GLUE, '').replace(/[^\u4e00-\u9fffa-z0-9]+/g, '');
};

const earlierQuoteGapEmpty = (gap: string, allowed: readonly string[] = []): boolean => (
  earlierQuoteGapContent(gap, allowed).length === 0
);

const earlierQuoteLocationEvidence = (
  clause: string,
  start: number,
  end: number,
): boolean => {
  const before = clause.slice(0, start);
  const after = clause.slice(end);
  const beforeRelation = [...before.matchAll(new RegExp(EARLIER_QUOTE_LOCATION_RELATION.source, 'g'))].pop();
  if (
    beforeRelation
    && !/(?:在|到|进|入|于)$/.test(beforeRelation[0])
    && earlierQuoteGapEmpty(before.slice((beforeRelation.index ?? 0) + beforeRelation[0].length))
  ) {
    const place = before.slice(0, beforeRelation.index ?? 0);
    if (/(?:里|上|下|内|外|旁|边|面)$/.test(place)) {
      return true;
    }
  }
  const relation = EARLIER_QUOTE_LOCATION_RELATION.exec(after);
  if (!relation) return false;
  if (!earlierQuoteGapEmpty(after.slice(0, relation.index))) return false;
  const rest = after.slice(relation.index + relation[0].length);
  if (
    !/(?:在|到|进|入|于|下|上|里|旁|边|第)/.test(relation[0])
    && /^(?:好|妥善|完|起来)?(?:了|着)?$/.test(rest)
  ) return false;
  const restRuns = earlierQuoteContentRuns(rest);
  const restChars = restRuns.reduce((total, run) => total + run.length, 0);
  return restChars >= 2 || /(?:里|上|下|内|外|旁|边|面|第)/.test(relation[0]);
};

const earlierQuoteEvidenceIn = (
  clause: string,
  ask: EarlierQuoteAsk,
  match: EarlierQuoteEntityMatch,
): boolean => {
  const after = clause.slice(match.end);
  if (!ask.details.every(detail => after.includes(detail))) return false;
  if (ask.location) {
    if (ask.entity === '位置' && earlierQuoteContentRuns(clause.slice(0, match.start)).length > 0) {
      return true;
    }
    if (!earlierQuoteLocationEvidence(clause, match.start, match.end)) return false;
  }
  if (ask.quantity) {
    const number = '[零一二三四五六七八九十百千万两\\d]+';
    const unit = ask.unit === 'currency' ? '(?:元|块|角|分)' : ask.unit === 'age' ? '岁' : ask.unit;
    const pattern = new RegExp(`${number}${unit}`);
    const afterValue = pattern.exec(after);
    const beforeText = clause.slice(0, match.start);
    const beforeValue = [...beforeText.matchAll(new RegExp(pattern.source, 'g'))].pop();
    const afterOk = afterValue !== null && earlierQuoteGapEmpty(after.slice(0, afterValue.index));
    const beforeOk = beforeValue !== undefined
      && earlierQuoteGapEmpty(beforeText.slice((beforeValue.index ?? 0) + beforeValue[0].length));
    if (!afterOk && !beforeOk) return false;
  }
  if (ask.time) {
    const afterValue = EARLIER_QUOTE_TIME_EVIDENCE.exec(after);
    const beforeText = clause.slice(0, match.start);
    const beforeValue = [...beforeText.matchAll(new RegExp(EARLIER_QUOTE_TIME_EVIDENCE.source, 'g'))].pop();
    const afterGap = afterValue === null ? '' : after.slice(0, afterValue.index);
    const afterOk = afterValue !== null && earlierQuoteGapContent(afterGap, ask.details).length <= 2;
    const beforeGap = beforeValue === undefined ? '' : beforeText.slice((beforeValue.index ?? 0) + beforeValue[0].length);
    const beforeOk = beforeValue !== undefined
      && earlierQuoteGapContent(beforeGap, ask.details).length <= 2;
    if (!afterOk && !beforeOk) return false;
  }
  if (ask.owner) {
    const relation = EARLIER_QUOTE_OWNER_RELATION.exec(after);
    if (!relation || !earlierQuoteGapEmpty(after.slice(0, relation.index))) return false;
    if (earlierQuoteContentRuns(relation[1]).length === 0) return false;
  }
  return true;
};

const earlierQuoteAskMatches = (
  item: EarlierQuoteTurnEvidence,
  ask: EarlierQuoteAsk,
): EarlierQuoteEntityMatchKind | null => {
  if (ask.entity.length === 0) return null;
  let variant: EarlierQuoteEntityMatchKind | null = null;
  for (const message of item.messages) {
    for (const clause of message.clauses) {
      for (const match of earlierQuoteEntityMatches(ask.entity, clause)) {
        if (!earlierQuoteEvidenceIn(clause, ask, match)) continue;
        if (match.kind === 'exact') return 'exact';
        variant = 'variant';
      }
    }
  }
  return variant;
};

const earlierQuoteSplitCoordinatedAsks = (text: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  let titleDepth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[\u300a\u300c\u300e\u201c]/.test(char)) titleDepth += 1;
    else if (/[\u300b\u300d\u300f\u201d]/.test(char)) titleDepth = Math.max(0, titleDepth - 1);
    else if (titleDepth === 0 && /[和与、]/.test(char)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
};

const earlierQuoteAsksForQuery = (query: string): EarlierQuoteAsk[] => {
  const segments = query.split(/[，,。！!？?；;\n]+/).filter(segment => (
    earlierQuoteContentRuns(segment).length > 0
  ));
  const parts: Array<{ text: string; alternative: boolean; sharedRecallIntent: boolean }> = [];
  let context = '';
  for (const segment of segments) {
    if (!EARLIER_QUOTE_ASK_SHAPE.test(segment)) {
      context = `${context} ${segment}`.trim();
      continue;
    }
    const text = `${context} ${segment}`.trim();
    context = '';
    if (EARLIER_QUOTE_COMPARISON.test(text)) {
      parts.push({ text, alternative: false, sharedRecallIntent: false });
      continue;
    }
    if (/(?:还是|或者)/.test(segment)) {
      parts.push(...text.split(/(?:还是|或者)/).map(part => ({
        text: part, alternative: true, sharedRecallIntent: false,
      })));
      continue;
    }
    const coordinatedParts = earlierQuoteSplitCoordinatedAsks(text);
    if (coordinatedParts.length > 1) {
      const sharedRecallIntent = extractExplicitRecallCueTerms(text).length > 0
        || /(?:说过|讲过|聊过|提过|问过|说好|约好)/.test(text);
      parts.push(...coordinatedParts.map(part => ({
        text: part, alternative: false, sharedRecallIntent,
      })));
      continue;
    }
    parts.push({ text, alternative: false, sharedRecallIntent: false });
  }
  if (context && parts.length === 0) {
    parts.push({ text: context, alternative: false, sharedRecallIntent: false });
  }
  return parts
    .map(part => earlierQuoteAskForText(
      part.text,
      part.alternative,
      part.sharedRecallIntent,
    ))
    .filter((ask): ask is EarlierQuoteAsk => ask !== null);
};

const earlierQuoteHasAskShape = (query: string): boolean => {
  const hasStructuralRecallIntent = /(?:记得|想起|之前|以前|上次|那次|那天|当时|说过|讲过|聊过|提过|问过|说好|约好|是约在|来着|对不对|对吧|是吧)/.test(query);
  const hasRecallIntent = extractExplicitRecallCueTerms(query).length > 0 || hasStructuralRecallIntent;
  if (EARLIER_QUOTE_CURRENT_ACTION_QUERY.test(query) && !hasStructuralRecallIntent) return false;
  if (!hasRecallIntent && EARLIER_QUOTE_CURRENT_MARKER.test(query)) return false;
  if (EARLIER_QUOTE_ASK_SHAPE.test(query)) return true;
  if (extractExplicitRecallCueTerms(query).length > 0) return false;
  if (EARLIER_QUOTE_CURRENT_MARKER.test(query) || EARLIER_QUOTE_ACTION_MARKER.test(query)) {
    return false;
  }
  return earlierQuoteContentRuns(query).join('').length >= 4;
};

export const selectEarlierConversationQuotes = (input: {
  turns: readonly ConversationTurn[];
  query: string;
  userName: string;
  characterName: string;
  excludeMessageIds?: ReadonlySet<number>;
}): EarlierConversationQuoteSelection => {
  const query = input.query.replace(/\s+/g, ' ').trim();
  if (!query || input.turns.length === 0) {
    return EMPTY_EARLIER_QUOTE_SELECTION;
  }

  const asks = earlierQuoteAsksForQuery(query);
  if (asks.length === 0 || !earlierQuoteHasAskShape(query)) {
    return EMPTY_EARLIER_QUOTE_SELECTION;
  }
  const maxBodyChars = CHAT_EARLIER_QUOTE_MAX_CHARS - CHAT_EARLIER_QUOTE_HEADER.length - 1;
  const excludedIds = input.excludeMessageIds;
  const seenTurnText = new Set<string>();
  const candidates: Array<{ turn: ConversationTurn; score: number; rendered: string }> = [];
  const evidence: EarlierQuoteTurnEvidence[] = [];

  for (const turn of input.turns) {
    if (excludedIds && turn.messages.some(message => excludedIds.has(message.id))) continue;
    const item = buildEarlierQuoteTurnEvidence({
      turn,
      userName: input.userName,
      characterName: input.characterName,
    });
    if (item) evidence.push(item);
  }
  if (evidence.length === 0) return EMPTY_EARLIER_QUOTE_SELECTION;

  const pushCandidate = (item: EarlierQuoteTurnEvidence, score: number): void => {
    if (seenTurnText.has(item.signature)) return;
    seenTurnText.add(item.signature);
    candidates.push({ turn: item.turn, score, rendered: item.rendered });
  };

  const strongCandidates: Array<{ item: EarlierQuoteTurnEvidence; score: number }> = [];
  for (const item of evidence) {
    let score = 0;
    for (const ask of asks) {
      const match = earlierQuoteAskMatches(item, ask);
      if (!match) continue;
      const askScore = ask.entity.length + ask.details.reduce(
        (total, detail) => total + detail.length,
        0,
      ) + (match === 'exact' ? 1000 : 0);
      if (askScore > score) score = askScore;
    }
    if (score > 0) strongCandidates.push({ item, score });
  }

  const byScore = (
    left: { item: EarlierQuoteTurnEvidence; score: number },
    right: { item: EarlierQuoteTurnEvidence; score: number },
  ): number => (
    right.score - left.score
    || right.item.turn.lastMessageId - left.item.turn.lastMessageId
    || left.item.turn.firstMessageId - right.item.turn.firstMessageId
  );

  if (strongCandidates.length > 0) {
    strongCandidates.sort(byScore);
    for (const candidate of strongCandidates) pushCandidate(candidate.item, candidate.score);
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
