import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { APIConfig, Message, MessageRelationshipScope } from '../types.ts';
import {
  CHAT_EARLIER_QUOTE_DEFAULT_WEEKS,
  CHAT_EARLIER_QUOTE_HEADER,
  CHAT_EARLIER_QUOTE_MAX_CHARS,
  CHAT_EARLIER_QUOTE_MAX_TURNS,
  CHAT_EARLIER_QUOTE_MAX_WEEKS,
  CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS,
  CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES,
  CHAT_EARLIER_QUOTE_SCAN_MAX_RAW_CHARS,
  CHAT_EARLIER_QUOTE_SCAN_MAX_VISITS,
  CHAT_EARLIER_QUOTE_WEEK_MS,
  CONVERSATION_TOKEN_ESTIMATOR_ID,
  CONVERSATION_CONTINUITY_SURFACE_CONTRACTS,
  earlierQuoteCutoff,
  estimateConversationTokens,
  fingerprintConversationMessages,
  groupConversationTurns,
  normalizeEarlierQuoteWeeks,
  planConversationContinuity,
  renderConversationContinuityContext,
  selectEarlierConversationQuotes,
} from '../domain/conversationContinuity/index.ts';
import {
  buildEarlierQuoteRecallTurns,
  readEarlierQuoteRecallWindow,
  prepareChatConversationContinuity,
  type EarlierQuoteRecallWindow,
} from '../utils/conversationContinuity.ts';
import { DB } from '../utils/db.ts';
import { ChatPrompts } from '../utils/chatPrompts.ts';
import {
  classifyWorldlineDelivery,
  extractExplicitRecallCueTerms,
} from '../utils/memoryCore/deliveryProfile.ts';

const apiConfig: APIConfig = {
  baseUrl: 'https://continuity.test/v1',
  apiKey: 'test-key',
  model: 'test-dialogue-model',
};
const scope: MessageRelationshipScope = {
  progressBundleId: 'bundle-continuity',
  personaMaskId: 'mask-continuity',
  charId: 'char-continuity',
};

const message = (
  id: number,
  role: Message['role'],
  content: string,
  metadata: Message['metadata'] = {},
): Message => ({
  id,
  charId: scope.charId,
  role,
  type: 'text',
  content,
  timestamp: Date.UTC(2026, 7, 9, 8, 0, id),
  metadata: {
    temporalClass: 'live',
    relationshipScope: scope,
    ...metadata,
  },
});

const turnsFixture = (count: number): Message[] => {
  const messages: Message[] = [];
  for (let turn = 1; turn <= count; turn += 1) {
    const userId = messages.length + 1;
    const responseId = `response-${turn}`;
    messages.push(message(userId, 'user', `用户第 ${turn} 轮`));
    messages.push(message(userId + 1, 'assistant', `角色第 ${turn} 轮上半`, {
      assistantResponseId: responseId,
    }));
    messages.push(message(userId + 2, 'assistant', `角色第 ${turn} 轮下半`, {
      assistantResponseId: responseId,
    }));
  }
  return messages;
};

assert.equal(CONVERSATION_TOKEN_ESTIMATOR_ID, 'aetheros-cjk-latin-v1');
assert.equal(CONVERSATION_CONTINUITY_SURFACE_CONTRACTS.chat.runtimeStatus, 'implemented');
assert.equal(CONVERSATION_CONTINUITY_SURFACE_CONTRACTS.chat.mayReadChatCapsule, true);
for (const [surface, contract] of Object.entries(CONVERSATION_CONTINUITY_SURFACE_CONTRACTS)) {
  assert.equal(contract.surface, surface);
  assert.equal(contract.mayPromoteDirectly, false);
  if (surface !== 'chat') {
    assert.equal(contract.runtimeStatus, 'hold');
    assert.equal(contract.mayReadChatCapsule, false);
  }
}
assert.equal(estimateConversationTokens('你好世界'), 4);
assert.ok(estimateConversationTokens('hello world') >= 2);

const twelveTurns = turnsFixture(12);
const grouped = groupConversationTurns(twelveTurns);
assert.equal(grouped.length, 12);
assert.equal(grouped[0].messages.length, 3);
assert.equal(grouped[0].firstMessageId, 1);
assert.equal(grouped[0].lastMessageId, 3);
const proactiveGroups = groupConversationTurns([
  message(200, 'assistant', '第一封主动来信', { interactionId: 'proactive-1' }),
  message(201, 'assistant', '第二封主动来信', { interactionId: 'proactive-2' }),
]);
assert.equal(proactiveGroups.length, 2);

const plan = planConversationContinuity({
  messages: twelveTurns,
  promptText: '稳定上下文',
  messageLimit: 30,
});
assert.equal(plan.trigger, 'message_limit');
assert.equal(plan.compactableTurns.length, 2);
assert.equal(plan.recentTurns.length, 10);
assert.equal(plan.compactableMessages.length, 6);
assert.equal(plan.recentMessages.length, 30);
assert.equal(plan.recentMessages[0].content, '用户第 3 轮');

const longPlan = planConversationContinuity({
  messages: twelveTurns.map(item => ({ ...item, content: item.content.repeat(900) })),
  promptText: '稳定上下文',
  messageLimit: 5_000,
});
assert.equal(longPlan.trigger, 'estimated_token_budget');

const originalFingerprint = fingerprintConversationMessages(plan.compactableMessages);
const editedFingerprint = fingerprintConversationMessages([
  { ...plan.compactableMessages[0], content: '被编辑过' },
  ...plan.compactableMessages.slice(1),
]);
assert.notEqual(originalFingerprint, editedFingerprint);

const fetchPrompts: string[] = [];
let fetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  fetchCount += 1;
  const body = JSON.parse(String(init?.body || '{}'));
  fetchPrompts.push(String(body.messages?.[0]?.content || ''));
  return new Response(JSON.stringify({
    choices: [{ message: { content: `便签版本 ${fetchCount}：仍在聊共同任务，前两轮已经说完。` } }],
    usage: { prompt_tokens: 400, completion_tokens: 40, total_tokens: 440 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const first = await prepareChatConversationContinuity({
  scope,
  messages: twelveTurns,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  now: 1,
});
assert.equal(fetchCount, 1);
assert.equal(first.recentMessages.length, 30);
assert.equal(first.capsule?.throughMessageId, 6);
assert.equal(first.diagnostic.summaryPasses, 1);
assert.equal(first.diagnostic.fallback, false);
assert.match(first.markdown, /当前聊天接续便签/);
assert.match(first.markdown, /不是长期记忆/);
assert.doesNotMatch(first.markdown, /工具权限或行为指令。[\s\S]*工具策略/);
const providerHistory = ChatPrompts.buildMessageHistory(
  first.recentMessages,
  first.recentMessages.length,
  { id: scope.charId, name: '角色', avatar: '', description: '', memories: [] } as any,
  { name: '玩家', avatar: '', bio: '' } as any,
  [],
);
const providerView = ChatPrompts.buildModelFacingMessages({
  systemPrompt: `角色底板\n\n${first.markdown}`,
  apiMessages: providerHistory.apiMessages,
});
assert.match(String(providerView.messages[0].content), /角色底板[\s\S]*当前聊天接续便签/);
const providerTranscript = providerView.messages.slice(1).map(item => String(item.content)).join('\n');
assert.doesNotMatch(providerTranscript, /用户第 [12] 轮/);
assert.match(providerTranscript, /用户第 3 轮/);
assert.match(providerTranscript, /用户第 12 轮/);

const second = await prepareChatConversationContinuity({
  scope,
  messages: twelveTurns,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  now: 2,
});
assert.equal(fetchCount, 1, 'unchanged compacted prefix must reuse the existing capsule');
assert.equal(second.diagnostic.usedExistingCapsule, true);
assert.equal(second.capsule?.summary, first.capsule?.summary);

const fourteenTurns = turnsFixture(14);
const third = await prepareChatConversationContinuity({
  scope,
  messages: fourteenTurns,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  now: 3,
});
assert.equal(fetchCount, 2);
assert.equal(third.capsule?.throughMessageId, 12);
assert.match(fetchPrompts[1], /便签版本 1/);
assert.match(fetchPrompts[1], /用户第 3 轮/);
assert.doesNotMatch(fetchPrompts[1], /用户第 1 轮/);

const edited = fourteenTurns.map(item => item.id === 1
  ? { ...item, content: '第一轮已经由玩家改正' }
  : item);
const fourth = await prepareChatConversationContinuity({
  scope,
  messages: edited,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  now: 4,
});
assert.equal(fetchCount, 3);
assert.equal(fourth.diagnostic.usedExistingCapsule, false);
assert.match(fetchPrompts[2], /第一轮已经由玩家改正/);
assert.doesNotMatch(fetchPrompts[2], /便签版本 2/);

const historical = message(100, 'assistant', '两年前受伤了', {
  temporalClass: 'historical',
  source: 'history_import_tail',
});
const withHistorical = await prepareChatConversationContinuity({
  scope,
  messages: [...edited, historical],
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  now: 5,
});
assert.equal(fetchCount, 3);
assert.equal(withHistorical.recentMessages.some(item => item.id === historical.id), false);

const excludedSurfaceMessages = [
  message(101, 'assistant', '见面里的动作', { source: 'date' }),
  message(102, 'assistant', '电话里的原话', { source: 'call' }),
  message(103, 'system', '隐藏工具日志', { hidden: true }),
  message(104, 'system', '主动来信提示', { proactiveHint: true }),
];
const withoutOtherSurfaceEvidence = await prepareChatConversationContinuity({
  scope,
  messages: [...edited, ...excludedSurfaceMessages],
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  now: 6,
});
for (const excluded of excludedSurfaceMessages) {
  assert.equal(
    withoutOtherSurfaceEvidence.recentMessages.some(item => item.id === excluded.id),
    false,
  );
}

const capsuleMarkdown = renderConversationContinuityContext(fourth.capsule!);
assert.match(capsuleMarkdown, /最近原文优先/);
assert.match(capsuleMarkdown, /当前生活状态/);

const otherScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-continuity-other',
};
const otherScopeMessages = twelveTurns.map(item => ({
  ...item,
  metadata: { ...item.metadata, relationshipScope: otherScope },
}));
const otherRelationship = await prepareChatConversationContinuity({
  scope: otherScope,
  messages: otherScopeMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '另一位玩家',
  characterName: '角色',
});
assert.equal(fetchCount, 4);
assert.equal(otherRelationship.diagnostic.usedExistingCapsule, false);
assert.notEqual(otherRelationship.capsule?.id, fourth.capsule?.id);

const failingScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-summary-failure',
};
const failingMessages = twelveTurns.map(item => ({
  ...item,
  metadata: { ...item.metadata, relationshipScope: failingScope },
}));
globalThis.fetch = (async () => {
  throw new Error('mock summary unavailable');
}) as typeof fetch;
const failed = await prepareChatConversationContinuity({
  scope: failingScope,
  messages: failingMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
});
assert.equal(failed.diagnostic.fallback, true);
assert.equal(failed.markdown, '');
assert.equal(failed.recentMessages.length, 30);

let quoteFetchCount = 0;
const quoteFetchMock = (async () => {
  quoteFetchCount += 1;
  return new Response(JSON.stringify({
    choices: [{ message: { content: '固定接续便签：仍在聊当前话题。' } }],
    usage: { prompt_tokens: 300, completion_tokens: 30, total_tokens: 330 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
globalThis.fetch = quoteFetchMock;

const scopedFor = (
  messages: readonly Message[],
  targetScope: MessageRelationshipScope,
): Message[] => messages.map(item => ({
  ...item,
  charId: targetScope.charId,
  metadata: { ...item.metadata, relationshipScope: targetScope },
}));

const earlierQuoteWindowFor = (
  messages: readonly Message[],
  targetScope: MessageRelationshipScope,
  options: {
    weeks?: number;
    scannedMessages?: number;
    scannedChars?: number;
    admittedMessages?: number;
    admittedChars?: number;
    truncatedBy?: EarlierQuoteRecallWindow['truncatedBy'];
    hideBeforeMessageId?: number;
  } = {},
): EarlierQuoteRecallWindow => ({
  weeks: options.weeks ?? CHAT_EARLIER_QUOTE_DEFAULT_WEEKS,
  turns: buildEarlierQuoteRecallTurns({
    messages,
    scope: targetScope,
    hideBeforeMessageId: options.hideBeforeMessageId,
  }),
  scannedMessages: options.scannedMessages ?? messages.length,
  scannedChars: options.scannedChars ?? messages.reduce(
    (total, item) => total + (item.type === 'text' ? item.content.length : 0),
    0,
  ),
  admittedMessages: options.admittedMessages ?? messages.length,
  admittedChars: options.admittedChars ?? messages.reduce(
    (total, item) => total + (item.type === 'text' ? item.content.length : 0),
    0,
  ),
  truncatedBy: options.truncatedBy ?? 'none',
  windowRead: true,
});

const providerMessagesFor = (
  result: Awaited<ReturnType<typeof prepareChatConversationContinuity>>,
) => {
  let prompt = '角色底板';
  if (result.markdown) prompt += `\n\n${result.markdown}\n`;
  if (result.earlierQuoteMarkdown) prompt += `\n\n${result.earlierQuoteMarkdown}\n`;
  const history = ChatPrompts.buildMessageHistory(
    result.recentMessages,
    result.recentMessages.length,
    {
      id: result.recentMessages[0]?.charId || scope.charId,
      name: '角色',
      avatar: '',
      description: '',
      memories: [],
    } as any,
    { name: '玩家', avatar: '', bio: '' } as any,
    [],
  );
  return ChatPrompts.buildModelFacingMessages({
    systemPrompt: prompt,
    apiMessages: history.apiMessages,
  });
};

const quoteMessages = turnsFixture(14).map(item => {
  if (item.id === 4) return { ...item, content: '我还记得那次手术记录，夹在蓝色文件夹里。' };
  if (item.id === 5) return { ...item, content: '我把它夹在蓝色文件夹里了。' };
  if (item.id === 10) return { ...item, content: '复查记录在抽屉第二层。' };
  if (item.id === 12) return { ...item, content: '对，绿色封面那本复查记录。' };
  if (item.id === 40) return { ...item, content: '你还记得手术记录和复查记录吗？' };
  return item;
});

const disabledScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-disabled',
};
const disabledDefault = await prepareChatConversationContinuity({
  scope: disabledScope,
  messages: scopedFor(quoteMessages, disabledScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
});
assert.equal(disabledDefault.earlierQuoteMarkdown, '');
assert.equal(disabledDefault.diagnostic.earlierQuoteTurns, 0);
assert.equal(disabledDefault.diagnostic.earlierQuoteChars, 0);

const explicitOffScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-explicit-off',
};
const explicitOff = await prepareChatConversationContinuity({
  scope: explicitOffScope,
  messages: scopedFor(quoteMessages, explicitOffScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: false,
});
assert.equal(explicitOff.earlierQuoteMarkdown, '');
const disabledProvider = providerMessagesFor(disabledDefault);
const explicitOffProvider = providerMessagesFor(explicitOff);
assert.deepEqual(explicitOffProvider.messages, disabledProvider.messages);
assert.doesNotMatch(String(disabledProvider.messages[0].content), /更早的聊天原话/);

const enabledScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-enabled',
};
const fetchBeforeEnabled = quoteFetchCount;
const enabled = await prepareChatConversationContinuity({
  scope: enabledScope,
  messages: scopedFor(quoteMessages, enabledScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: 2,
  earlierQuoteWindow: earlierQuoteWindowFor(
    scopedFor(quoteMessages, enabledScope),
    enabledScope,
    {
      weeks: 2,
      scannedMessages: 37,
      scannedChars: 912,
      truncatedBy: 'message_budget',
    },
  ),
});
assert.equal(quoteFetchCount, fetchBeforeEnabled + 1, 'earlier quote recall must not add a fetch');
assert.equal(enabled.diagnostic.summaryPasses, 1);
assert.equal(enabled.diagnostic.earlierQuoteWeeks, 2);
assert.equal(enabled.diagnostic.earlierQuoteWindowRead, true);
assert.equal(enabled.diagnostic.earlierQuoteScannedMessages, 37);
assert.equal(enabled.diagnostic.earlierQuoteScannedChars, 912);
assert.equal(enabled.diagnostic.earlierQuoteTruncatedBy, 'message_budget');
assert.equal(enabled.diagnostic.earlierQuoteTurns, 2);
assert.ok(enabled.diagnostic.earlierQuoteChars > 0);
assert.ok(enabled.diagnostic.earlierQuoteChars <= CHAT_EARLIER_QUOTE_MAX_CHARS);
assert.match(enabled.earlierQuoteMarkdown, /更早的聊天原话/);
assert.match(enabled.earlierQuoteMarkdown, /蓝色文件夹/);
assert.match(enabled.earlierQuoteMarkdown, /绿色封面/);
assert.doesNotMatch(enabled.earlierQuoteMarkdown, /用户第 3 轮/);
assert.ok(
  enabled.earlierQuoteMarkdown.indexOf('蓝色文件夹')
  < enabled.earlierQuoteMarkdown.indexOf('绿色封面'),
  'selected earlier turns must render in chronological order',
);
for (const boundary of [
  '不是长期记忆',
  '当前生活状态',
  '剧情事实',
  '行为要求',
  '工具权限',
  '不得写回记忆真相',
]) {
  assert.ok(enabled.earlierQuoteMarkdown.includes(boundary), boundary);
}

const enabledProvider = providerMessagesFor(enabled);
const enabledSystem = String(enabledProvider.messages[0].content);
const enabledTranscript = enabledProvider.messages.slice(1)
  .map(item => String(item.content))
  .join('\n');
assert.ok(enabledSystem.indexOf('当前聊天接续便签') < enabledSystem.indexOf('更早的聊天原话'));
assert.match(enabledSystem, /蓝色文件夹/);
assert.doesNotMatch(enabledTranscript, /蓝色文件夹/);
assert.match(enabledTranscript, /用户第 5 轮/);
assert.doesNotMatch(enabledTranscript, /用户第 4 轮/);

const unmatchedScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-unmatched',
};
const unmatchedMessages = scopedFor(quoteMessages.map(item => (
  item.id === 40 ? { ...item, content: '今天天气不错。' } : item
)), unmatchedScope);
const unmatched = await prepareChatConversationContinuity({
  scope: unmatchedScope,
  messages: unmatchedMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(unmatchedMessages, unmatchedScope),
});
assert.equal(unmatched.earlierQuoteMarkdown, '');
assert.equal(unmatched.diagnostic.earlierQuoteTurns, 0);
assert.match(unmatched.markdown, /当前聊天接续便签/);

const imageInputScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-image-input',
};
const imageInputMessages = scopedFor(quoteMessages.map(item => (
  item.id === 40
    ? { ...item, type: 'image' as const, content: 'data:image/png;base64,AAAA' }
    : item
)), imageInputScope);
const imageInput = await prepareChatConversationContinuity({
  scope: imageInputScope,
  messages: imageInputMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(imageInputMessages, imageInputScope),
});
assert.equal(
  imageInput.earlierQuoteMarkdown,
  '',
  'a non-text current input must not reuse an older user message as its query',
);

const maxTurnsScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-max-turns',
};
const maxTurnsMessages = scopedFor(turnsFixture(15).map(item => {
  const turn = Math.ceil(item.id / 3);
  if (item.id === 43) return { ...item, content: '针线盒还在吗？' };
  if (turn <= 5 && item.role === 'user') return { ...item, content: `针线盒-${turn} 在这里` };
  return item;
}), maxTurnsScope);
const maxTurns = await prepareChatConversationContinuity({
  scope: maxTurnsScope,
  messages: maxTurnsMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(maxTurnsMessages, maxTurnsScope),
});
assert.equal(maxTurns.diagnostic.earlierQuoteTurns, 3);
assert.match(maxTurns.earlierQuoteMarkdown, /针线盒-5/);
assert.match(maxTurns.earlierQuoteMarkdown, /针线盒-4/);
assert.match(maxTurns.earlierQuoteMarkdown, /针线盒-3/);
assert.doesNotMatch(maxTurns.earlierQuoteMarkdown, /针线盒-2/);
assert.doesNotMatch(maxTurns.earlierQuoteMarkdown, /针线盒-1/);
assert.ok(
  maxTurns.earlierQuoteMarkdown.indexOf('针线盒-3')
  < maxTurns.earlierQuoteMarkdown.indexOf('针线盒-4')
  && maxTurns.earlierQuoteMarkdown.indexOf('针线盒-4')
  < maxTurns.earlierQuoteMarkdown.indexOf('针线盒-5'),
);

const budgetScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-budget',
};
const budgetMessages = scopedFor(turnsFixture(24).map(item => {
  const turn = Math.ceil(item.id / 3);
  if (item.id === 70) return { ...item, content: '预算关键词里的细节是什么？' };
  if (turn <= 14) {
    return {
      ...item,
      content: `${item.role === 'user' ? `预算关键词${turn}` : '旧原话细节'}${'细节'.repeat(80)}`,
    };
  }
  return item;
}), budgetScope);
const budget = await prepareChatConversationContinuity({
  scope: budgetScope,
  messages: budgetMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(budgetMessages, budgetScope),
});
assert.ok(budget.diagnostic.earlierQuoteTurns >= 1);
assert.ok(budget.diagnostic.earlierQuoteTurns <= 3);
assert.ok(budget.diagnostic.earlierQuoteChars <= CHAT_EARLIER_QUOTE_MAX_CHARS);

const longTurnScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-long-turn',
};
const longTurnMessages: Message[] = [
  message(1, 'user', '超长原话主题是什么？', { relationshipScope: longTurnScope }),
  ...Array.from({ length: 5 }, (_, index) => message(
    2 + index,
    'assistant',
    `超长原话主题${index}${'细节'.repeat(200)}`,
    { relationshipScope: longTurnScope, assistantResponseId: 'long-turn-1' },
  )),
];
for (let turn = 1; turn <= 10; turn += 1) {
  longTurnMessages.push(message(100 + turn * 2, 'user', (
    turn === 10 ? '最近第10轮：超长原话主题是什么？' : `最近第${turn}轮`
  ), { relationshipScope: longTurnScope }));
  longTurnMessages.push(message(101 + turn * 2, 'assistant', `角色最近第${turn}轮`, {
    relationshipScope: longTurnScope,
    assistantResponseId: `recent-${turn}`,
  }));
}
const longTurn = await prepareChatConversationContinuity({
  scope: longTurnScope,
  messages: longTurnMessages,
  promptText: '角色底板',
  messageLimit: 10,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(longTurnMessages, longTurnScope),
});
assert.equal(longTurn.diagnostic.earlierQuoteTurns, 0);
assert.equal(longTurn.diagnostic.earlierQuoteChars, 0);
assert.equal(longTurn.earlierQuoteMarkdown, '', 'an over-budget turn must not be clipped into a partial quote');

const unsupportedTurnScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-unsupported-turn',
};
const unsupportedTurnMessages = scopedFor(turnsFixture(12).map(item => {
  if (item.id === 1) return { ...item, type: 'transfer' as const, content: '半轮关键词转账' };
  if (item.id === 2) return { ...item, content: '半轮关键词的角色回复' };
  if (item.id === 34) return { ...item, content: '还记得半轮关键词吗？' };
  return item;
}), unsupportedTurnScope);
const unsupportedTurn = await prepareChatConversationContinuity({
  scope: unsupportedTurnScope,
  messages: unsupportedTurnMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(unsupportedTurnMessages, unsupportedTurnScope),
});
assert.equal(unsupportedTurn.earlierQuoteMarkdown, '', 'unsupported message types must skip the whole turn');
assert.doesNotMatch(enabled.earlierQuoteMarkdown, /2026-08-09/, 'the optional quote block must not invent UTC display time');

const scopeIsolation: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-isolation',
};
const foreignScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-foreign',
};
const isolatedMessages = [
  ...scopedFor(quoteMessages, scopeIsolation),
  message(201, 'user', '手术记录在另一个面具的珊瑚原话里', {
    relationshipScope: foreignScope,
  }),
  message(202, 'assistant', '另一个面具的珊瑚原话回答', {
    relationshipScope: foreignScope,
  }),
];
const isolated = await prepareChatConversationContinuity({
  scope: scopeIsolation,
  messages: isolatedMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(isolatedMessages, scopeIsolation),
});
assert.match(isolated.earlierQuoteMarkdown, /蓝色文件夹/);
assert.doesNotMatch(isolated.earlierQuoteMarkdown, /珊瑚/);

const exclusionScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-exclusions',
};
const exclusionExtras = [
  message(101, 'user', '手术记录在隐藏工具日志里', {
    relationshipScope: exclusionScope,
    hidden: true,
  }),
  message(102, 'assistant', '主动提示里的手术记录', {
    relationshipScope: exclusionScope,
    proactiveHint: true,
  }),
  message(103, 'assistant', '见面里的手术记录-约会', {
    relationshipScope: exclusionScope,
    source: 'date',
  }),
  message(104, 'assistant', '电话里的手术记录-通话', {
    relationshipScope: exclusionScope,
    source: 'call',
  }),
  message(105, 'assistant', '旧日档案里的手术记录', {
    relationshipScope: exclusionScope,
    temporalClass: 'historical',
  }),
  message(106, 'assistant', '导入尾巴里的手术记录', {
    relationshipScope: exclusionScope,
    source: 'history_import_tail',
  }),
];
const excludedQuote = await prepareChatConversationContinuity({
  scope: exclusionScope,
  messages: [...scopedFor(quoteMessages, exclusionScope), ...exclusionExtras],
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(
    [...scopedFor(quoteMessages, exclusionScope), ...exclusionExtras],
    exclusionScope,
  ),
});
assert.match(excludedQuote.earlierQuoteMarkdown, /蓝色文件夹/);
for (const marker of [
  '隐藏工具日志',
  '主动提示里的手术记录',
  '见面里的手术记录',
  '电话里的手术记录',
  '旧日档案里的手术记录',
  '导入尾巴里的手术记录',
]) {
  assert.doesNotMatch(excludedQuote.earlierQuoteMarkdown, new RegExp(marker));
}

const hideBeforeScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-hide-before',
};
const hideBeforeMessages = scopedFor(quoteMessages, hideBeforeScope);
const hideBeforeResult = await prepareChatConversationContinuity({
  scope: hideBeforeScope,
  messages: hideBeforeMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(hideBeforeMessages, hideBeforeScope, {
    hideBeforeMessageId: 7,
  }),
});
assert.doesNotMatch(hideBeforeResult.earlierQuoteMarkdown, /蓝色文件夹/);
assert.match(hideBeforeResult.earlierQuoteMarkdown, /绿色封面/);

const failureQuoteScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-summary-failure',
};
globalThis.fetch = (async () => {
  throw new Error('mock summary unavailable with earlier quote recall');
}) as typeof fetch;
const failedWithQuote = await prepareChatConversationContinuity({
  scope: failureQuoteScope,
  messages: scopedFor(quoteMessages, failureQuoteScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(
    scopedFor(quoteMessages, failureQuoteScope),
    failureQuoteScope,
  ),
});
assert.equal(failedWithQuote.diagnostic.fallback, true);
assert.equal(failedWithQuote.markdown, '');
assert.equal(failedWithQuote.recentMessages.length, 30);
assert.match(failedWithQuote.earlierQuoteMarkdown, /蓝色文件夹/);
globalThis.fetch = quoteFetchMock;

const editScope: MessageRelationshipScope = {
  ...scope,
  personaMaskId: 'mask-earlier-quote-edit',
};
const beforeEditMessages = scopedFor(quoteMessages.map(item => (
  item.id === 5 ? { ...item, content: '旧版原话-红色文件夹。' } : item
)), editScope);
const beforeEdit = await prepareChatConversationContinuity({
  scope: editScope,
  messages: beforeEditMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(beforeEditMessages, editScope),
});
assert.match(beforeEdit.earlierQuoteMarkdown, /旧版原话-红色文件夹/);
const afterEditMessages = beforeEditMessages.map(item => (
  item.id === 5 ? { ...item, content: '改后原话-绿色文件夹。' } : item
));
const afterEdit = await prepareChatConversationContinuity({
  scope: editScope,
  messages: afterEditMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(afterEditMessages, editScope),
});
assert.match(afterEdit.earlierQuoteMarkdown, /改后原话-绿色文件夹/);
assert.doesNotMatch(afterEdit.earlierQuoteMarkdown, /旧版原话-红色文件夹/);

assert.equal(CHAT_EARLIER_QUOTE_MAX_TURNS, 3);
assert.equal(CHAT_EARLIER_QUOTE_MAX_CHARS, 1_200);
assert.equal(CHAT_EARLIER_QUOTE_DEFAULT_WEEKS, 1);
assert.equal(CHAT_EARLIER_QUOTE_MAX_WEEKS, 3);
assert.equal(CHAT_EARLIER_QUOTE_WEEK_MS, 7 * 24 * 60 * 60 * 1000);
assert.equal(CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES, 900);
assert.equal(CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS, 32_000);
assert.match(CHAT_EARLIER_QUOTE_HEADER, /更早的聊天原话/);
assert.match(CHAT_EARLIER_QUOTE_HEADER, /不是长期记忆/);

assert.equal(normalizeEarlierQuoteWeeks(undefined), 1);
assert.equal(normalizeEarlierQuoteWeeks(null), 1);
assert.equal(normalizeEarlierQuoteWeeks('not-a-number'), 1);
assert.equal(normalizeEarlierQuoteWeeks(0), 1);
assert.equal(normalizeEarlierQuoteWeeks(-4), 1);
assert.equal(normalizeEarlierQuoteWeeks(1), 1);
assert.equal(normalizeEarlierQuoteWeeks(2), 2);
assert.equal(normalizeEarlierQuoteWeeks(3), 3);
assert.equal(normalizeEarlierQuoteWeeks(2.9), 2);
assert.equal(normalizeEarlierQuoteWeeks('2'), 2);
assert.equal(normalizeEarlierQuoteWeeks(4), 3);
assert.equal(normalizeEarlierQuoteWeeks(99), 3);
const quoteAnchor = Date.UTC(2026, 10, 15, 12, 0, 0);
assert.equal(
  earlierQuoteCutoff(quoteAnchor, 1),
  quoteAnchor - CHAT_EARLIER_QUOTE_WEEK_MS,
);
assert.equal(
  earlierQuoteCutoff(quoteAnchor, 99),
  quoteAnchor - (CHAT_EARLIER_QUOTE_MAX_WEEKS * CHAT_EARLIER_QUOTE_WEEK_MS),
);

const seedMessagesDirect = async (messages: readonly Message[]): Promise<void> => {
  await DB.getMessagesByCharId('__earlier_quote_seed_warmup__');
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('AetherOS_Data');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('messages', 'readwrite');
      const store = transaction.objectStore('messages');
      messages.forEach(item => store.put(item));
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    };
  });
};

const rangeScope: MessageRelationshipScope = {
  progressBundleId: 'bundle-earlier-quote-range',
  personaMaskId: 'mask-earlier-quote-range',
  charId: 'char-earlier-quote-range',
};
const rangeMessages: Message[] = [];
let rangeMessageId = 1_000_000;
for (let turn = 1; turn <= 14; turn += 1) {
  const ageDays = turn === 1 ? 30 : turn === 2 ? 22 : turn === 3 ? 15 : turn === 4 ? 8 : 0;
  const timestamp = ageDays > 0
    ? quoteAnchor - (ageDays * 24 * 60 * 60 * 1000)
    : quoteAnchor - ((14 - turn) * 60_000);
  const userContent = turn === 14
    ? '还记得回看范围测试吗？'
    : (turn >= 2 && turn <= 4 ? `回看范围测试-${turn}` : `最近第${turn}轮`);
  const assistantContent = turn >= 2 && turn <= 4
    ? `回看范围测试-${turn} 的原话回复`
    : `最近第${turn}轮回复`;
  rangeMessages.push({
    ...message(rangeMessageId++, 'user', userContent, { relationshipScope: rangeScope }),
    charId: rangeScope.charId,
    timestamp,
  });
  rangeMessages.push({
    ...message(rangeMessageId++, 'assistant', assistantContent, {
      relationshipScope: rangeScope,
    }),
    charId: rangeScope.charId,
    timestamp,
  });
}
await seedMessagesDirect(rangeMessages);

const rangeResults: Record<number, Awaited<ReturnType<typeof prepareChatConversationContinuity>>> = {};
for (const weeks of [1, 2, 3]) {
  const window = await readEarlierQuoteRecallWindow({
    scope: rangeScope,
    weeks,
    anchorTimestamp: quoteAnchor,
  });
  assert.equal(window.weeks, weeks);
  assert.equal(window.windowRead, true);
  assert.equal(window.truncatedBy, 'day');
  assert.equal(window.turns.length, weeks - 1);
  assert.ok(window.scannedMessages >= 21);
  const result = await prepareChatConversationContinuity({
    scope: rangeScope,
    messages: rangeMessages,
    promptText: '角色底板',
    messageLimit: 20,
    apiConfig,
    userName: '玩家',
    characterName: '角色',
    earlierQuoteRecall: true,
    earlierQuoteWeeks: weeks,
    earlierQuoteWindow: window,
  });
  rangeResults[weeks] = result;
  assert.equal(result.diagnostic.earlierQuoteWeeks, weeks);
  assert.equal(result.diagnostic.earlierQuoteWindowRead, true);
  assert.equal(result.diagnostic.earlierQuoteScannedMessages, window.scannedMessages);
  assert.equal(result.diagnostic.earlierQuoteScannedChars, window.scannedChars);
  assert.equal(result.diagnostic.earlierQuoteTruncatedBy, 'day');
  assert.equal(result.diagnostic.earlierQuoteTurns, weeks - 1);
}
assert.equal(rangeResults[1].earlierQuoteMarkdown, '');
assert.match(rangeResults[2].earlierQuoteMarkdown, /回看范围测试-4/);
assert.doesNotMatch(rangeResults[2].earlierQuoteMarkdown, /回看范围测试-3/);
assert.match(rangeResults[3].earlierQuoteMarkdown, /回看范围测试-4/);
assert.match(rangeResults[3].earlierQuoteMarkdown, /回看范围测试-3/);
assert.doesNotMatch(rangeResults[3].earlierQuoteMarkdown, /回看范围测试-2/);

const productionRead = await prepareChatConversationContinuity({
  scope: rangeScope,
  messages: rangeMessages,
  promptText: '角色底板',
  messageLimit: 20,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: 2,
});
assert.equal(productionRead.diagnostic.earlierQuoteWindowRead, true);
assert.equal(productionRead.diagnostic.earlierQuoteWeeks, 2);
assert.match(productionRead.earlierQuoteMarkdown, /回看范围测试-4/);
assert.doesNotMatch(productionRead.earlierQuoteMarkdown, /回看范围测试-3/);

const clampedReaderWindow = await readEarlierQuoteRecallWindow({
  scope: rangeScope,
  weeks: 99,
  anchorTimestamp: quoteAnchor,
});
assert.equal(clampedReaderWindow.weeks, CHAT_EARLIER_QUOTE_MAX_WEEKS);
assert.equal(clampedReaderWindow.turns.length, 2);

const boundaryScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-boundary',
  personaMaskId: 'mask-earlier-quote-boundary',
  charId: 'char-earlier-quote-boundary',
};
const boundarySince = quoteAnchor - CHAT_EARLIER_QUOTE_WEEK_MS;
const boundaryMessages: Message[] = [
  {
    ...message(3_000_000, 'user', '边界外的旧原话', { relationshipScope: boundaryScope }),
    charId: boundaryScope.charId,
    groupId: 'group-before-day-boundary',
    timestamp: boundarySince - 1,
  },
  {
    ...message(3_000_001, 'assistant', '边界内刚好一周的原话', {
      relationshipScope: boundaryScope,
    }),
    charId: boundaryScope.charId,
    timestamp: boundarySince,
  },
  {
    ...message(3_000_002, 'user', '边界内的当前消息', { relationshipScope: boundaryScope }),
    charId: boundaryScope.charId,
    timestamp: quoteAnchor,
  },
];
await seedMessagesDirect(boundaryMessages);
const boundaryScan = await DB.getBoundedRecentMessagesByCharId({
  charId: boundaryScope.charId,
  since: boundarySince,
  maxMessages: CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES,
  maxChars: CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS,
});
assert.deepEqual(
  boundaryScan.messages.map(item => item.content),
  ['边界内刚好一周的原话', '边界内的当前消息'],
);
assert.equal(boundaryScan.truncatedBy, 'day');
assert.equal(boundaryScan.scannedMessages, 3);

const charBudgetScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-char-budget',
  personaMaskId: 'mask-earlier-quote-char-budget',
  charId: 'char-earlier-quote-char-budget',
};
const charBudgetMessages: Message[] = Array.from({ length: 100 }, (_, index) => ({
  ...message(
    4_000_000 + index,
    index % 2 === 0 ? 'user' : 'assistant',
    `字符预算-${index}${'细节'.repeat(485)}`,
    { relationshipScope: charBudgetScope },
  ),
  charId: charBudgetScope.charId,
  timestamp: quoteAnchor - (index * 1_000),
}));
await seedMessagesDirect(charBudgetMessages);
const charBudgetWindow = await readEarlierQuoteRecallWindow({
  scope: charBudgetScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
assert.equal(charBudgetWindow.truncatedBy, 'char_budget');
assert.equal(charBudgetWindow.scannedMessages, 33);
assert.ok(charBudgetWindow.turns.every(turn => turn.messages[0]?.role === 'user'));
assert.equal(
  charBudgetWindow.turns.some(turn => turn.messages.some(item => item.id === 4_000_067)),
  false,
  'a scan stopping inside a turn must drop the leading partial turn',
);
assert.ok(charBudgetWindow.scannedChars <= CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS);

const oversizedMessageScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-oversized-message',
  personaMaskId: 'mask-earlier-quote-oversized-message',
  charId: 'char-earlier-quote-oversized-message',
};
await seedMessagesDirect([{
  ...message(4_100_000, 'user', '超长原话'.repeat(CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS), {
    relationshipScope: oversizedMessageScope,
  }),
  charId: oversizedMessageScope.charId,
  timestamp: quoteAnchor,
}]);
const oversizedMessageScan = await DB.getBoundedRecentMessagesByCharId({
  charId: oversizedMessageScope.charId,
  since: quoteAnchor - CHAT_EARLIER_QUOTE_WEEK_MS,
  maxMessages: CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES,
  maxChars: CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS,
});
assert.equal(oversizedMessageScan.truncatedBy, 'char_budget');
assert.equal(oversizedMessageScan.scannedMessages, 1);
assert.equal(oversizedMessageScan.scannedChars, 0);
assert.deepEqual(oversizedMessageScan.messages, []);

const denseScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-dense',
  personaMaskId: 'mask-earlier-quote-dense',
  charId: 'char-earlier-quote-dense',
};
const denseMessages: Message[] = Array.from({ length: 10_000 }, (_, index) => ({
  ...message(
    5_000_000 + index,
    index % 2 === 0 ? 'user' : 'assistant',
    `一万条密集历史-${index}`,
    { relationshipScope: denseScope },
  ),
  charId: denseScope.charId,
  timestamp: quoteAnchor - ((index % 600) * 1_000),
}));
await seedMessagesDirect(denseMessages);
const denseWindow = await readEarlierQuoteRecallWindow({
  scope: denseScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
assert.equal(denseWindow.truncatedBy, 'message_budget');
assert.equal(denseWindow.scannedMessages, CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES);
assert.equal(denseWindow.admittedMessages, CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES);
assert.ok(
  denseWindow.turns.length <= Math.ceil(CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES / 2),
  'ten thousand rows must stop at the recalibrated candidate budget, not grow with history',
);

// A noisy newest prefix must not consume the exact-scope candidate budget.
// 1,700 other-scope/group/hidden/proactive/date/call/history-import rows sit
// above one relevant old turn in the same week.
const noisyScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-noisy',
  personaMaskId: 'mask-earlier-quote-noisy',
  charId: 'char-earlier-quote-noisy',
};
const otherNoiseScope: MessageRelationshipScope = {
  progressBundleId: 'bundle-earlier-quote-noisy-other',
  personaMaskId: 'mask-earlier-quote-noisy-other',
  charId: noisyScope.charId,
};
const noisyMessages: Message[] = [];
let noisyId = 8_000_000;
const oldNoisyTimestamp = quoteAnchor - (6 * 24 * 60 * 60 * 1000);
noisyMessages.push({
  ...message(noisyId++, 'user', '蓝色文件夹里的复查记录你收好了吗？', {
    relationshipScope: noisyScope,
  }),
  charId: noisyScope.charId,
  timestamp: oldNoisyTimestamp,
});
noisyMessages.push({
  ...message(noisyId++, 'assistant', '嗯，我放在蓝色文件夹里了。', {
    relationshipScope: noisyScope,
  }),
  charId: noisyScope.charId,
  timestamp: oldNoisyTimestamp + 1_000,
});
const noisyBaseTimestamp = quoteAnchor - (4 * 24 * 60 * 60 * 1000);
const pushNoise = (
  count: number,
  marker: string,
  metadata: Message['metadata'] = {},
  extra: Partial<Message> = {},
): void => {
  for (let index = 0; index < count; index += 1) {
    noisyMessages.push({
      id: noisyId++,
      charId: noisyScope.charId,
      role: index % 2 === 0 ? 'user' : 'assistant',
      type: 'text',
      content: `${marker}-${index}`,
      timestamp: noisyBaseTimestamp + (noisyMessages.length * 30_000),
      metadata: {
        temporalClass: 'live',
        relationshipScope: noisyScope,
        ...metadata,
      },
      ...extra,
    });
  }
};
pushNoise(600, '其他面具噪音', { relationshipScope: otherNoiseScope });
pushNoise(300, '群聊噪音', {}, { groupId: 'group-earlier-quote-noise' });
pushNoise(150, '隐藏噪音', { hidden: true });
pushNoise(150, '主动噪音', { proactiveHint: true });
pushNoise(100, '约会噪音', { source: 'date' });
pushNoise(100, '通话噪音', { source: 'call' });
pushNoise(100, '导入噪音', {
  source: 'history_import_tail',
  temporalClass: 'historical',
});
pushNoise(200, '同范围闲聊噪音', { relationshipScope: noisyScope });
const noisyRecentMessages: Message[] = [];
for (let turn = 1; turn <= 10; turn += 1) {
  const timestamp = quoteAnchor - ((11 - turn) * 60_000);
  noisyRecentMessages.push({
    ...message(noisyId++, 'user', `最近第${turn}轮`, {
      relationshipScope: noisyScope,
    }),
    charId: noisyScope.charId,
    timestamp,
  });
  noisyRecentMessages.push({
    ...message(noisyId++, 'assistant', `最近第${turn}轮回复`, {
      relationshipScope: noisyScope,
      assistantResponseId: `noisy-recent-${turn}`,
    }),
    charId: noisyScope.charId,
    timestamp,
  });
}
noisyRecentMessages.push({
  ...message(noisyId++, 'user', '你还记得蓝色文件夹里的复查记录吗？', {
    relationshipScope: noisyScope,
  }),
  charId: noisyScope.charId,
  timestamp: quoteAnchor,
});
noisyRecentMessages.push({
  ...message(noisyId++, 'assistant', '记得。', { relationshipScope: noisyScope }),
  charId: noisyScope.charId,
  timestamp: quoteAnchor,
});
noisyMessages.push(...noisyRecentMessages);
await seedMessagesDirect(noisyMessages);

const noisyWindow = await readEarlierQuoteRecallWindow({
  scope: noisyScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
assert.ok(
  noisyWindow.scannedMessages > CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES,
  'the read must walk past one full candidate budget of rejected raw rows',
);
assert.ok(noisyWindow.scannedMessages < CHAT_EARLIER_QUOTE_SCAN_MAX_VISITS);
assert.equal(noisyWindow.admittedMessages, 224);
assert.ok(noisyWindow.admittedChars <= CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS);
assert.equal(noisyWindow.truncatedBy, 'none');
assert.ok(
  noisyWindow.turns.some(turn => turn.messages.some(item => item.content.includes('蓝色文件夹'))),
  'the relevant old turn behind the noisy prefix must enter the candidates',
);
assert.ok(noisyWindow.turns.every(turn => turn.messages.every(item => (
  item.metadata?.relationshipScope?.personaMaskId === noisyScope.personaMaskId
))));
for (const marker of [
  '其他面具噪音',
  '群聊噪音',
  '隐藏噪音',
  '主动噪音',
  '约会噪音',
  '通话噪音',
  '导入噪音',
]) {
  assert.equal(
    noisyWindow.turns.some(turn => turn.messages.some(item => item.content.includes(marker))),
    false,
    `${marker} must not enter the exact-scope candidates`,
  );
}

const fetchBeforeNoisyRecall = quoteFetchCount;
const noisyRecall = await prepareChatConversationContinuity({
  scope: noisyScope,
  messages: noisyRecentMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: 1,
});
assert.equal(quoteFetchCount, fetchBeforeNoisyRecall, 'noisy recall must not add a fetch');
assert.equal(
  noisyRecall.diagnostic.earlierQuoteScannedMessages,
  noisyWindow.scannedMessages,
);
assert.equal(
  noisyRecall.diagnostic.earlierQuoteAdmittedMessages,
  noisyWindow.admittedMessages,
);
assert.equal(noisyRecall.diagnostic.earlierQuoteTurns, 1);
assert.match(noisyRecall.earlierQuoteMarkdown, /蓝色文件夹/);
for (const marker of [
  '其他面具噪音',
  '群聊噪音',
  '隐藏噪音',
  '主动噪音',
  '约会噪音',
  '通话噪音',
  '导入噪音',
  '同范围闲聊噪音',
]) {
  assert.doesNotMatch(noisyRecall.earlierQuoteMarkdown, new RegExp(marker));
}
const noisyProvider = providerMessagesFor(noisyRecall);
const noisySystem = String(noisyProvider.messages[0].content);
assert.match(noisySystem, /蓝色文件夹/);
for (const marker of [
  '其他面具噪音',
  '群聊噪音',
  '隐藏噪音',
  '主动噪音',
  '约会噪音',
  '通话噪音',
  '导入噪音',
  '同范围闲聊噪音',
]) {
  assert.doesNotMatch(noisySystem, new RegExp(marker));
}

// Ten thousand noise rows still stop at the explicit raw cursor cap instead of
// turning into an unbounded scan; the relevant row beyond that cap is not read.
const noiseCapScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-noise-cap',
  personaMaskId: 'mask-earlier-quote-noise-cap',
  charId: 'char-earlier-quote-noise-cap',
};
const noiseCapOtherScope: MessageRelationshipScope = {
  progressBundleId: 'bundle-earlier-quote-noise-cap-other',
  personaMaskId: 'mask-earlier-quote-noise-cap-other',
  charId: noiseCapScope.charId,
};
let noiseCapId = 9_000_000;
const noiseCapMessages: Message[] = [
  {
    ...message(noiseCapId++, 'user', '蓝色文件夹硬上限旧原话', {
      relationshipScope: noiseCapScope,
    }),
    charId: noiseCapScope.charId,
    timestamp: quoteAnchor - (6 * 24 * 60 * 60 * 1000),
  },
  {
    ...message(noiseCapId++, 'assistant', '蓝色文件夹硬上限旧回复', {
      relationshipScope: noiseCapScope,
    }),
    charId: noiseCapScope.charId,
    timestamp: quoteAnchor - (6 * 24 * 60 * 60 * 1000) + 1_000,
  },
];
for (let index = 0; index < 10_000; index += 1) {
  noiseCapMessages.push({
    id: noiseCapId++,
    charId: noiseCapScope.charId,
    role: index % 2 === 0 ? 'user' : 'assistant',
    type: 'text',
    content: `硬上限噪音-${index}`,
    timestamp: quoteAnchor - (5 * 24 * 60 * 60 * 1000) + (index * 20_000),
    metadata: {
      temporalClass: 'live',
      relationshipScope: noiseCapOtherScope,
    },
  });
}
for (let turn = 1; turn <= 10; turn += 1) {
  const timestamp = quoteAnchor - ((11 - turn) * 60_000);
  noiseCapMessages.push({
    ...message(noiseCapId++, 'user', `硬上限最近第${turn}轮`, {
      relationshipScope: noiseCapScope,
    }),
    charId: noiseCapScope.charId,
    timestamp,
  });
  noiseCapMessages.push({
    ...message(noiseCapId++, 'assistant', `硬上限最近第${turn}轮回复`, {
      relationshipScope: noiseCapScope,
      assistantResponseId: `noise-cap-recent-${turn}`,
    }),
    charId: noiseCapScope.charId,
    timestamp,
  });
}
noiseCapMessages.push({
  ...message(noiseCapId++, 'user', '还记得蓝色文件夹硬上限旧原话吗？', {
    relationshipScope: noiseCapScope,
  }),
  charId: noiseCapScope.charId,
  timestamp: quoteAnchor,
});
await seedMessagesDirect(noiseCapMessages);
const noiseCapWindow = await readEarlierQuoteRecallWindow({
  scope: noiseCapScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
assert.equal(noiseCapWindow.truncatedBy, 'visit_budget');
assert.equal(noiseCapWindow.scannedMessages, CHAT_EARLIER_QUOTE_SCAN_MAX_VISITS);
assert.ok(noiseCapWindow.scannedChars <= CHAT_EARLIER_QUOTE_SCAN_MAX_RAW_CHARS);
assert.ok(noiseCapWindow.admittedMessages <= 22);
assert.equal(
  noiseCapWindow.turns.some(turn => turn.messages.some(item => item.content.includes('蓝色文件夹'))),
  false,
  'a row beyond the hard raw cursor cap must not be read',
);

const rawCharCapScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-raw-char-cap',
  personaMaskId: 'mask-earlier-quote-raw-char-cap',
  charId: 'char-earlier-quote-raw-char-cap',
};
const rawCharCapOtherScope: MessageRelationshipScope = {
  ...rawCharCapScope,
  personaMaskId: 'mask-earlier-quote-raw-char-cap-other',
};
await seedMessagesDirect([
  {
    ...message(9_100_000, 'user', '原始字符上限之后的相关旧原话', {
      relationshipScope: rawCharCapScope,
    }),
    charId: rawCharCapScope.charId,
    timestamp: quoteAnchor - (6 * 24 * 60 * 60 * 1000),
  },
  ...[1, 2].map(index => ({
    ...message(
      9_100_000 + index,
      index === 1 ? 'user' : 'assistant',
      `原始字符上限噪音-${index}-${'x'.repeat(40_000)}`,
      { relationshipScope: rawCharCapOtherScope },
    ),
    charId: rawCharCapScope.charId,
    timestamp: quoteAnchor - ((3 - index) * 60_000),
  })),
]);
const rawCharCapWindow = await readEarlierQuoteRecallWindow({
  scope: rawCharCapScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
assert.equal(rawCharCapWindow.truncatedBy, 'raw_char_budget');
assert.equal(rawCharCapWindow.scannedMessages, 2);
assert.equal(rawCharCapWindow.admittedMessages, 0);
assert.ok(rawCharCapWindow.scannedChars < CHAT_EARLIER_QUOTE_SCAN_MAX_RAW_CHARS);
assert.equal(rawCharCapWindow.turns.length, 0);

// Natural companion queries reproduced from the 2026-11-20 browser evidence.
// Filler turns are ordinary short chat, so common conversational characters
// repeat across the candidate window exactly as they do in real use. The old
// rain/observatory turn must not be delivered for the unrelated luggage
// question, while the rain paraphrase must still recover it without any fetch.
const naturalScope: MessageRelationshipScope = {
  progressBundleId: 'bundle-earlier-quote-natural',
  personaMaskId: 'mask-earlier-quote-natural',
  charId: 'char-earlier-quote-natural',
};
const naturalFillerLines: ReadonlyArray<readonly [string, string]> = [
  ['今天下班有点晚，路上车很多。', '好，那你路上小心，我等你。'],
  ['刚吃完饭，准备下楼散步。', '嗯，散步的时候别走太远。'],
  ['今天降温了，外面风很大。', '那你多穿一点，别着凉。'],
  ['刚才在收拾房间，翻到好多旧东西。', '你说得对，我慢慢收，不着急。'],
  ['明天要早起开会，今晚得早点睡。', '好，那我明晚再找你聊天。'],
  ['楼下新开了一家面馆，味道还不错。', '听起来是不错，下次一起去。'],
  ['手机快没电了，先充一会儿。', '好，充上电再慢慢说。'],
  ['刚才看到一只很胖的橘猫。', '哈哈，它是不是又在晒太阳。'],
  ['今天事情有点多，脑子转不动了，你说怎么办？', '那就先歇一会儿，别硬撑。'],
  ['周末想去书店逛逛。', '好呀，逛完记得回来跟我说。'],
  ['刚洗完衣服，阳台风挺大的。', '那记得收衣服，别被吹跑了。'],
  ['今天心情还不错。', '那就好，是不是轻松一点了。'],
];
const naturalMessages: Message[] = [];
let naturalMessageId = 12_000_000;
const appendNaturalTurn = (
  userContent: string,
  assistantContent: string,
  timestamp: number,
): void => {
  naturalMessages.push({
    ...message(naturalMessageId++, 'user', userContent, {
      relationshipScope: naturalScope,
    }),
    charId: naturalScope.charId,
    timestamp,
  });
  naturalMessages.push({
    ...message(naturalMessageId++, 'assistant', assistantContent, {
      relationshipScope: naturalScope,
    }),
    charId: naturalScope.charId,
    timestamp,
  });
};
appendNaturalTurn(
  '下周下雨的时候，我们去旧天文台。我会带一把靛蓝色的伞。',
  '好，那天我会等你，记得带伞。',
  quoteAnchor - (6 * 24 * 60 * 60 * 1000),
);
for (let turn = 1; turn <= 6; turn += 1) {
  const [userLine, assistantLine] = naturalFillerLines[turn - 1];
  appendNaturalTurn(
    userLine,
    assistantLine,
    quoteAnchor - (5 * 24 * 60 * 60 * 1000) + (turn * 60_000),
  );
}
appendNaturalTurn(
  '我们说过那个绿色行李箱，放到储藏室最上面了。',
  '对，绿色的那个，我收好了。',
  quoteAnchor - (4 * 24 * 60 * 60 * 1000),
);
for (let turn = 7; turn <= 18; turn += 1) {
  const [userLine, assistantLine] = naturalFillerLines[(turn - 1) % naturalFillerLines.length];
  appendNaturalTurn(
    userLine,
    assistantLine,
    quoteAnchor - (3 * 24 * 60 * 60 * 1000) + (turn * 60_000),
  );
}
await seedMessagesDirect(naturalMessages);

const naturalWindow = await readEarlierQuoteRecallWindow({
  scope: naturalScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
const naturalWindowHas = (marker: string): boolean => naturalWindow.turns.some(
  turn => turn.messages.some(item => item.content.includes(marker)),
);
assert.equal(naturalWindow.truncatedBy, 'none');
assert.equal(
  naturalWindowHas('旧天文台'),
  true,
  'the observed old rain turn must be present in the candidate window',
);
assert.equal(
  naturalWindowHas('绿色行李箱'),
  true,
  'the luggage control turn must be present in the candidate window',
);

const naturalQuery = async (
  queryText: string,
): Promise<Awaited<ReturnType<typeof prepareChatConversationContinuity>>> => {
  const queryMessage: Message = {
    ...message(12_100_000, 'user', queryText, { relationshipScope: naturalScope }),
    charId: naturalScope.charId,
    timestamp: quoteAnchor,
  };
  return prepareChatConversationContinuity({
    scope: naturalScope,
    messages: [...naturalMessages, queryMessage],
    promptText: '角色底板',
    messageLimit: 20,
    apiConfig,
    userName: '玩家',
    characterName: '角色',
    earlierQuoteRecall: true,
    earlierQuoteWeeks: 1,
    earlierQuoteWindow: naturalWindow,
  });
};

const naturalExact = await naturalQuery('靛蓝色的伞');
assert.equal(naturalExact.diagnostic.earlierQuoteTurns, 1);
assert.match(naturalExact.earlierQuoteMarkdown, /旧天文台/);
assert.doesNotMatch(naturalExact.earlierQuoteMarkdown, /绿色行李箱/);

const naturalNearWording = await naturalQuery('旧天文台那次下雨，你说会带的伞');
assert.equal(
  naturalNearWording.diagnostic.earlierQuoteTurns,
  0,
  'known_local_cross_clause_abstain: place, weather and umbrella are in different clauses',
);
assert.equal(naturalNearWording.earlierQuoteMarkdown, '');

const naturalParaphrase = await naturalQuery('那次说好的雨天碰头地点是哪儿？');
assert.equal(
  naturalParaphrase.diagnostic.earlierQuoteTurns,
  0,
  'a deep rain/meeting synonym may honestly abstain instead of using a scattered-character seam',
);
assert.equal(naturalParaphrase.earlierQuoteMarkdown, '');

const naturalContradiction = await naturalQuery('我们不是说好不去旧天文台了吗？');
assert.equal(naturalContradiction.diagnostic.earlierQuoteTurns, 1);
assert.match(naturalContradiction.earlierQuoteMarkdown, /旧天文台/);
assert.doesNotMatch(naturalContradiction.earlierQuoteMarkdown, /绿色行李箱/);

// The exact 2026-11-20 false positive, with the real luggage turn present: the
// answer now selects the luggage turn and not the unrelated rain turn.
const naturalLuggage = await naturalQuery('我们说过绿色行李箱吗？');
assert.equal(naturalLuggage.diagnostic.earlierQuoteTurns, 1);
assert.match(naturalLuggage.earlierQuoteMarkdown, /绿色行李箱/);
assert.doesNotMatch(naturalLuggage.earlierQuoteMarkdown, /旧天文台/);

const naturalBarePronoun = await naturalQuery('那件事后来怎么样了？');
assert.equal(naturalBarePronoun.diagnostic.earlierQuoteTurns, 0);
assert.equal(naturalBarePronoun.earlierQuoteMarkdown, '');

// The real prepare path must also receive the weak topic-cue birthday recall,
// not only the direct selector matrix.
const birthdayScope: MessageRelationshipScope = {
  progressBundleId: 'bundle-earlier-quote-birthday',
  personaMaskId: 'mask-earlier-quote-birthday',
  charId: 'char-earlier-quote-birthday',
};
const birthdayMessages: Message[] = [
  {
    ...message(12_400_000, 'user', '生日那天去河边咖啡馆，我想点红丝绒蛋糕。', {
      relationshipScope: birthdayScope,
    }),
    charId: birthdayScope.charId,
  },
  {
    ...message(12_400_001, 'assistant', '好，我会提前订靠窗的位置。', {
      relationshipScope: birthdayScope,
    }),
    charId: birthdayScope.charId,
  },
];
for (let turn = 0; turn < 12; turn += 1) {
  const [userLine, assistantLine] = naturalFillerLines[turn % naturalFillerLines.length];
  birthdayMessages.push({
    ...message(12_400_100 + (turn * 2), 'user', userLine, {
      relationshipScope: birthdayScope,
    }),
    charId: birthdayScope.charId,
  });
  birthdayMessages.push({
    ...message(12_400_101 + (turn * 2), 'assistant', assistantLine, {
      relationshipScope: birthdayScope,
    }),
    charId: birthdayScope.charId,
  });
}
const birthdayQueryMessage: Message = {
  ...message(12_401_000, 'user', '生日准备去哪家店吃哪种甜点？', {
    relationshipScope: birthdayScope,
  }),
  charId: birthdayScope.charId,
};
const birthdayRecall = await prepareChatConversationContinuity({
  scope: birthdayScope,
  messages: [...birthdayMessages, birthdayQueryMessage],
  promptText: '角色底板',
  messageLimit: 10,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: 1,
  earlierQuoteWindow: earlierQuoteWindowFor(birthdayMessages, birthdayScope),
});
assert.equal(
  birthdayRecall.diagnostic.earlierQuoteTurns,
  0,
  'a category paraphrase may honestly abstain instead of treating 店/甜点 as entity evidence',
);
assert.equal(birthdayRecall.earlierQuoteMarkdown, '');

// The observed negative window: the only older relevant-looking turn is the
// rain turn, and the luggage question must select zero turns rather than one
// unrelated marker. A single generic bigram such as 我们 cannot spend budget.
const negativeScope: MessageRelationshipScope = {
  progressBundleId: 'bundle-earlier-quote-natural-negative',
  personaMaskId: 'mask-earlier-quote-natural-negative',
  charId: 'char-earlier-quote-natural-negative',
};
const negativeMessages: Message[] = [];
let negativeMessageId = 12_200_000;
const appendNegativeTurn = (
  userContent: string,
  assistantContent: string,
  timestamp: number,
): void => {
  negativeMessages.push({
    ...message(negativeMessageId++, 'user', userContent, {
      relationshipScope: negativeScope,
    }),
    charId: negativeScope.charId,
    timestamp,
  });
  negativeMessages.push({
    ...message(negativeMessageId++, 'assistant', assistantContent, {
      relationshipScope: negativeScope,
    }),
    charId: negativeScope.charId,
    timestamp,
  });
};
appendNegativeTurn(
  '下周下雨的时候，我们去旧天文台。我会带一把靛蓝色的伞。',
  '好，那天我会等你，记得带伞。',
  quoteAnchor - (6 * 24 * 60 * 60 * 1000),
);
for (let turn = 1; turn <= 19; turn += 1) {
  const [userLine, assistantLine] = naturalFillerLines[(turn - 1) % naturalFillerLines.length];
  appendNegativeTurn(
    userLine,
    assistantLine,
    quoteAnchor - (5 * 24 * 60 * 60 * 1000) + (turn * 60_000),
  );
}
await seedMessagesDirect(negativeMessages);
const negativeWindow = await readEarlierQuoteRecallWindow({
  scope: negativeScope,
  weeks: 1,
  anchorTimestamp: quoteAnchor,
});
assert.equal(
  negativeWindow.turns.some(turn => turn.messages.some(
    item => item.content.includes('旧天文台'),
  )),
  true,
  'the negative assertion is only meaningful if the unrelated old turn was admitted',
);
const negativeQueryMessage: Message = {
  ...message(12_300_000, 'user', '我们说过绿色行李箱吗？', {
    relationshipScope: negativeScope,
  }),
  charId: negativeScope.charId,
  timestamp: quoteAnchor,
};
const naturalNegative = await prepareChatConversationContinuity({
  scope: negativeScope,
  messages: [...negativeMessages, negativeQueryMessage],
  promptText: '角色底板',
  messageLimit: 20,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: 1,
  earlierQuoteWindow: negativeWindow,
});
assert.equal(
  naturalNegative.diagnostic.earlierQuoteTurns,
  0,
  'an unrelated generic-term query must select zero earlier turns',
);
assert.equal(naturalNegative.diagnostic.earlierQuoteChars, 0);
assert.equal(naturalNegative.earlierQuoteMarkdown, '');

// Main-controller production-selector matrix (2026-11-21 return). The
// selector is exercised directly at the full review window, a browser-sized
// window and a minimal plural window. Positives require exactly the expected
// turn; negatives require exactly zero turns. Deep synonym-only paraphrases
// are declared abstentions (zero), never hits.
const reviewBaseTurns: ReadonlyArray<readonly [string, string]> = [
  ['下周下雨的时候，我们去旧天文台。我会带一把靛蓝色的伞。', '好，那天我会等你，记得带伞。'],
  ['生日那天去河边咖啡馆，我想点红丝绒蛋糕。', '好，我会提前订靠窗的位置。'],
  ['我们说过那个绿色行李箱，放到储藏室最上面了。', '对，绿色的那个，我收好了。'],
  ['白色耳机落在书房第二层抽屉里了。', '知道了，明天出门前提醒你。'],
  ['橘猫周五下午三点要去松林宠物医院。', '我记下了，到时候别忘了带检查单。'],
];
const reviewFillerTurns: ReadonlyArray<readonly [string, string]> = [
  ['今天下班有点晚，路上车很多。', '好，那你路上小心，我等你。'],
  ['刚吃完饭，准备下楼散步。', '嗯，散步的时候别走太远。'],
  ['今天降温了，外面风很大。', '那你多穿一点，别着凉。'],
  ['刚才在收拾房间，翻到好多旧东西。', '慢慢收，不着急。'],
  ['明天要早起开会，今晚得早点睡。', '好，那我明晚再找你聊天。'],
  ['楼下新开了一家面馆，味道还不错。', '听起来不错，下次一起去。'],
  ['手机快没电了，先充一会儿。', '好，充上电再慢慢说。'],
  ['刚才看到一只很胖的橘猫。', '哈哈，它是不是又在晒太阳。'],
  ['今天事情有点多，脑子转不动了。', '那就先歇一会儿，别硬撑。'],
  ['周末想去书店逛逛。', '好呀，逛完回来跟我说。'],
  ['刚洗完衣服，阳台风挺大的。', '记得收衣服，别被吹跑了。'],
  ['今天心情还不错。', '那就好，是不是轻松一点了。'],
  ['午后喝了一杯热茶。', '听着就很舒服。'],
  ['厨房的灯有点暗。', '有空换个亮一点的灯泡吧。'],
  ['刚刚把桌面整理干净了。', '看着清爽，心情也会好一点。'],
  ['外面有人在放音乐。', '声音大吗，会不会吵到你。'],
  ['晚饭吃了番茄鸡蛋面。', '那碗面一定热乎乎的。'],
  ['今天走了很长一段路。', '辛苦了，回去好好歇着。'],
  ['窗台上的花长出新叶子了。', '它被你照顾得很好。'],
  ['刚才忘记给水杯加水。', '现在补上就好。'],
];
const reviewMarkers = [
  '旧天文台',
  '红丝绒蛋糕',
  '绿色行李箱',
  '白色耳机',
  '松林宠物医院',
];
let reviewMessageId = 14_000_000;
const reviewTurnsFor = (fillerCount: number, includeLuggage = true) => {
  const messages: Message[] = [];
  const addTurn = (user: string, assistant: string): void => {
    messages.push(message(reviewMessageId++, 'user', user));
    messages.push(message(reviewMessageId++, 'assistant', assistant));
  };
  for (const [user, assistant] of reviewBaseTurns) {
    if (!includeLuggage && user.includes('绿色行李箱')) continue;
    addTurn(user, assistant);
  }
  for (let index = 0; index < fillerCount; index += 1) {
    const [user, assistant] = reviewFillerTurns[index % reviewFillerTurns.length];
    addTurn(user, assistant);
  }
  return groupConversationTurns(messages);
};

const reviewCases: ReadonlyArray<{
  query: string;
  expected: string | null;
  note: string;
}> = [
  { query: '靛蓝色的伞放哪儿了？', expected: null, note: 'known_local_cross_clause_abstain: umbrella and place are in different clauses' },
  { query: '那次说好的雨天碰头地点是哪儿？', expected: null, note: 'deep synonym rain abstention' },
  { query: '碰面那天我答应拿什么颜色的雨具？', expected: null, note: 'deep synonym umbrella abstention' },
  { query: '生日准备去哪家店吃哪种甜点？', expected: null, note: 'category paraphrase abstention' },
  { query: '庆祝生日时订的是靠窗还是露台？', expected: '红丝绒蛋糕', note: 'birthday detail' },
  { query: '我们说过绿色行李箱吗？', expected: '绿色行李箱', note: 'exact luggage' },
  { query: '那件事后来怎么样了？', expected: null, note: 'bare pronoun abstain' },
  { query: '今晚换个地方吃什么？', expected: null, note: 'unrelated dinner' },
  { query: '今天雨下得很大，晚饭吃什么？', expected: null, note: 'current rain unrelated' },
  { query: '我想买一把浅蓝色的新伞。', expected: null, note: 'new umbrella, no recall ask' },
  { query: '窗外的天很蓝，等会儿去散步吧。', expected: null, note: 'unrelated sky' },
  { query: '刚才看到一个白色柜子。', expected: null, note: 'unrelated white object' },
  { query: '周五下午我要开会。', expected: null, note: 'same date, unrelated event' },
  { query: '河边今天风真大。', expected: null, note: 'same place fragment' },
  { query: '我想吃红色包装的饼干。', expected: null, note: 'same color, unrelated food' },
  { query: '储藏室是不是该打扫了？', expected: null, note: 'same place, unrelated intent' },
  { query: '你还记得我们说过什么吗？', expected: null, note: 'generic recall cue' },
  { query: '上回约着避雨，我们准备在哪见？', expected: null, note: 'deep synonym rain abstention' },
  { query: '我那副浅色的听歌东西收在哪里？', expected: null, note: 'deep synonym headphone abstention' },
  { query: '带猫看医生是星期几几点？', expected: null, note: 'deep synonym vet abstention' },
];

for (const fillerCount of [20, 10, 5]) {
  const reviewTurns = reviewTurnsFor(fillerCount);
  for (const item of reviewCases) {
    const result = selectEarlierConversationQuotes({
      turns: reviewTurns,
      query: item.query,
      userName: '玩家',
      characterName: '角色',
    });
    if (item.expected === null) {
      assert.equal(
        result.turns.length,
        0,
        `${item.note} must abstain at filler=${fillerCount}`,
      );
      assert.equal(result.markdown, '');
      continue;
    }
    assert.equal(
      result.turns.length,
      1,
      `${item.note} must return exactly one turn at filler=${fillerCount}`,
    );
    assert.deepEqual(
      reviewMarkers.filter(marker => result.markdown.includes(marker)),
      [item.expected],
      `${item.note} must select only the expected turn at filler=${fillerCount}`,
    );
  }

  // The exact generic false positive: a window with no luggage turn must
  // return zero turns for the luggage question.
  const withoutLuggage = reviewTurnsFor(fillerCount, false);
  const missingLuggage = selectEarlierConversationQuotes({
    turns: withoutLuggage,
    query: '我们说过绿色行李箱吗？',
    userName: '玩家',
    characterName: '角色',
  });
  assert.equal(
    missingLuggage.turns.length,
    0,
    `the luggage question must abstain without a luggage turn at filler=${fillerCount}`,
  );
  assert.equal(missingLuggage.markdown, '');
}

// 2026-11-21 main-controller blind matrix. These wordings were not available
// while the selector was tuned; their expected values are fixed here and are
// exercised at the full, browser-sized and minimal plural windows.
const blindBaseTurns: ReadonlyArray<readonly [string, string]> = [
  ['下周下雨的时候，我们去旧天文台。我会带一把靛蓝色的伞。', '好，那天我会等你，记得带伞。'],
  ['生日那天去河边咖啡馆，我想点红丝绒蛋糕。', '好，我会提前订靠窗的位置。'],
  ['我们说过那个绿色行李箱，放到储藏室最上面了。', '对，绿色的那个，我收好了。'],
  ['白色耳机落在书房第二层抽屉里了。', '知道了，明天出门前提醒你。'],
  ['橘猫周五下午三点要去松林宠物医院。', '我记下了，到时候别忘了带检查单。'],
];
const blindFillerTurns: ReadonlyArray<readonly [string, string]> = [
  ['今天下班有点晚，路上车很多。', '好，那你路上小心，我等你。'],
  ['刚吃完饭，准备下楼散步。', '嗯，散步的时候别走太远。'],
  ['今天降温了，外面风很大。', '那你多穿一点，别着凉。'],
  ['明天要早起开会，今晚得早点睡。', '好，那我明晚再找你聊天。'],
  ['楼下新开了一家面馆，味道还不错。', '听起来不错，下次一起去。'],
  ['手机快没电了，先充一会儿。', '好，充上电再慢慢说。'],
  ['刚才看到一只很胖的橘猫。', '哈哈，它是不是又在晒太阳。'],
  ['周末想去书店逛逛。', '好呀，逛完回来跟我说。'],
  ['刚洗完衣服，阳台风挺大的。', '记得收衣服，别被吹跑了。'],
  ['午后喝了一杯热茶。', '听着就很舒服。'],
  ['厨房的灯有点暗。', '有空换个亮一点的灯泡吧。'],
  ['刚刚把桌面整理干净了。', '看着清爽，心情也会好一点。'],
  ['外面有人在放音乐。', '声音大吗，会不会吵到你。'],
  ['晚饭吃了番茄鸡蛋面。', '那碗面一定热乎乎的。'],
  ['今天走了很长一段路。', '辛苦了，回去好好歇着。'],
  ['窗台上的花长出新叶子了。', '它被你照顾得很好。'],
  ['刚才忘记给水杯加水。', '现在补上就好。'],
  ['昨晚睡得不太踏实。', '今天早点休息，别硬撑。'],
  ['下午路过一家花店。', '门口的花好看吗。'],
  ['冰箱里还剩两个橙子。', '记得趁新鲜吃掉。'],
];
const blindCases: ReadonlyArray<{
  query: string;
  expected: string | null;
  note: string;
}> = [
  { query: '那把靛蓝雨伞我们约在哪儿用？', expected: null, note: 'known_local_cross_clause_abstain: umbrella and place are in different clauses' },
  { query: '之前约好下雨见面的地方，还记得吗？', expected: null, note: 'known_local_cross_clause_abstain: rain and place are in different clauses' },
  { query: '生日那次靠窗的店叫什么，甜点是什么？', expected: '红丝绒蛋糕', note: 'birthday mixed detail' },
  { query: '河边那家过生日的店，我们订了什么位置？', expected: null, note: 'known_local_cross_message_abstain: cafe and reserved position are in different messages' },
  { query: '绿色的行李箱最后搁到哪儿了？', expected: null, note: 'known_local_cross_clause_abstain: luggage and place are in different clauses' },
  { query: '书房里那副白色耳机收在哪一层？', expected: '白色耳机', note: 'headphone detail' },
  { query: '橘猫去松林医院是哪天几点？', expected: '松林宠物医院', note: 'vet exactish' },
  { query: '那天的红丝绒蛋糕，是准备在哪里吃？', expected: null, note: 'known_local_cross_clause_abstain: cake and place are in different clauses' },
  { query: '第一次看到这么大的雨。', expected: null, note: 'current first-time rain statement' },
  { query: '第一次见到这么胖的橘猫。', expected: null, note: 'current first-time cat statement' },
  { query: '纪念品放哪儿了？', expected: null, note: 'generic souvenir question' },
  { query: '那天我下班很晚。', expected: null, note: 'deictic current-life statement' },
  { query: '之前手机没电，现在已经充好了。', expected: null, note: 'resolved phone statement' },
  { query: '周五下午宠物店有活动。', expected: null, note: 'same schedule unrelated event' },
  { query: '我们说好以后再买箱子。', expected: null, note: 'future box plan' },
  { query: '刚才看到绿色的柜子。', expected: null, note: 'green cabinet' },
  { query: '生日快到了，今天先聊点别的。', expected: null, note: 'birthday current statement' },
  { query: '以前河边风很大，今天倒还好。', expected: null, note: 'river current weather' },
  { query: '我想起书房该打扫了。', expected: null, note: 'study cleaning' },
  { query: '忘了给橘猫添水。', expected: null, note: 'cat care now' },
  { query: '刚才看到白色耳机广告。', expected: null, note: 'new headphone ad' },
  { query: '纪念一下今天第一次做蛋糕。', expected: null, note: 'new cake event' },
  { query: '以前我也喜欢红色。', expected: null, note: 'generic old color preference' },
  { query: '那天你说天气会变冷。', expected: null, note: 'generic old weather' },
];
let blindMessageId = 15_000_000;
const blindTurnsFor = (fillerCount: number) => {
  const messages: Message[] = [];
  const addTurn = (user: string, assistant: string): void => {
    messages.push(message(blindMessageId++, 'user', user));
    messages.push(message(blindMessageId++, 'assistant', assistant));
  };
  for (const [user, assistant] of blindBaseTurns) addTurn(user, assistant);
  for (let index = 0; index < fillerCount; index += 1) {
    const [user, assistant] = blindFillerTurns[index % blindFillerTurns.length];
    addTurn(user, assistant);
  }
  return groupConversationTurns(messages);
};

for (const fillerCount of [20, 10, 5]) {
  const blindTurns = blindTurnsFor(fillerCount);
  for (const item of blindCases) {
    const result = selectEarlierConversationQuotes({
      turns: blindTurns,
      query: item.query,
      userName: '玩家',
      characterName: '角色',
    });
    if (item.expected === null) {
      assert.equal(
        result.turns.length,
        0,
        `${item.note} must abstain at blind filler=${fillerCount}`,
      );
      assert.equal(result.markdown, '');
      continue;
    }
    assert.equal(
      result.turns.length,
      1,
      `${item.note} must return exactly one turn at blind filler=${fillerCount}`,
    );
    assert.deepEqual(
      reviewMarkers.filter(marker => result.markdown.includes(marker)),
      [item.expected],
      `${item.note} must select only the expected turn at blind filler=${fillerCount}`,
    );
  }
}

// 2026-11-21 second main-controller blind matrix. Same five old turns, new
// unseen wordings; fixed expectations, exercised at three window sizes.
const blind2FillerTurns: ReadonlyArray<readonly [string, string]> = [
  ['今天下班有点晚，路上车很多。', '路上小心，我等你。'],
  ['刚吃完饭，准备下楼散步。', '别走太远。'],
  ['楼下新开了一家面馆。', '下次一起去。'],
  ['手机快没电了。', '先充电吧。'],
  ['周末想去书店逛逛。', '逛完告诉我。'],
  ['刚洗完衣服。', '记得收衣服。'],
  ['午后喝了一杯热茶。', '听着很舒服。'],
  ['窗台上的花长新叶子了。', '它被照顾得很好。'],
];
const blind2Cases: ReadonlyArray<{
  query: string;
  expected: string | null;
  note: string;
}> = [
  { query: '下周下雨我们是约在旧天文台吗？', expected: '旧天文台', note: 'past plan contains future frame' },
  { query: '周五下午橘猫去的是哪家医院？', expected: '松林宠物医院', note: 'past appointment contains weekday' },
  { query: '刚才忽然想起那副白色耳机，放在书房哪一层来着？', expected: '白色耳机', note: 'explicit recall after current preface' },
  { query: '我们是不是说好生日那天在河边吃红丝绒？', expected: null, note: 'known_local_cross_clause_abstain: cake and river are in different clauses' },
  { query: '储藏室最上面那个绿色行李箱还在吗？', expected: null, note: 'known_local_cross_clause_abstain: luggage and storage are in different clauses' },
  { query: '松林宠物医院的预约是三点吗？', expected: '松林宠物医院', note: 'appointment time' },
  { query: '白色耳机 第二层抽屉', expected: '白色耳机', note: 'short detail fragment' },
  { query: '白色耳机广告在哪里买？', expected: null, note: 'new product ad' },
  { query: '白色耳机和黑色耳机哪个更好看？', expected: null, note: 'product comparison' },
  { query: '绿色行李箱卖多少钱？', expected: null, note: 'new shopping question' },
  { query: '绿色行李箱和蓝色行李箱哪个更结实？', expected: null, note: 'product comparison luggage' },
  { query: '松林宠物医院怎么挂号？', expected: null, note: 'current registration info' },
  { query: '松林宠物医院评价怎么样？', expected: null, note: 'current review info' },
  { query: '书房第二层抽屉坏了怎么修？', expected: null, note: 'same place new problem' },
  { query: '河边咖啡馆有什么新品饮料？', expected: null, note: 'current cafe menu' },
];
let blind2MessageId = 16_000_000;
const blind2TurnsFor = (fillerCount: number) => {
  const messages: Message[] = [];
  const addTurn = (user: string, assistant: string): void => {
    messages.push(message(blind2MessageId++, 'user', user));
    messages.push(message(blind2MessageId++, 'assistant', assistant));
  };
  for (const [user, assistant] of blindBaseTurns) addTurn(user, assistant);
  for (let index = 0; index < fillerCount; index += 1) {
    const [user, assistant] = blind2FillerTurns[index % blind2FillerTurns.length];
    addTurn(user, assistant);
  }
  return groupConversationTurns(messages);
};

for (const fillerCount of [20, 10, 5]) {
  const blind2Turns = blind2TurnsFor(fillerCount);
  for (const item of blind2Cases) {
    const result = selectEarlierConversationQuotes({
      turns: blind2Turns,
      query: item.query,
      userName: '玩家',
      characterName: '角色',
    });
    if (item.expected === null) {
      assert.equal(
        result.turns.length,
        0,
        `${item.note} must abstain at blind2 filler=${fillerCount}`,
      );
      assert.equal(result.markdown, '');
      continue;
    }
    assert.equal(
      result.turns.length,
      1,
      `${item.note} must return exactly one turn at blind2 filler=${fillerCount}`,
    );
    assert.deepEqual(
      reviewMarkers.filter(marker => result.markdown.includes(marker)),
      [item.expected],
      `${item.note} must select only the expected turn at blind2 filler=${fillerCount}`,
    );
  }
}

// Runtime guard: the selector must never print a user query or candidate text.
{
  const originalConsoleLog = console.log;
  let selectorLogs = 0;
  console.log = (...args: unknown[]) => {
    selectorLogs += 1;
    originalConsoleLog(...args);
  };
  try {
    selectEarlierConversationQuotes({
      turns: blind2TurnsFor(0),
      query: '你还记得手术记录和复查记录吗？',
      userName: '玩家',
      characterName: '角色',
    });
  } finally {
    console.log = originalConsoleLog;
  }
  assert.equal(selectorLogs, 0, 'the selector must not write queries or candidate text to console');
}

// 2026-11-21 third main-controller blind matrix: period-terminated recall,
// no-punctuation recall, and same-entity/current-information negatives.
const blind3FillerTurns: ReadonlyArray<readonly [string, string]> = [
  ['今天下班有点晚。', '路上小心。'],
  ['刚吃完饭。', '下楼走走吧。'],
  ['手机快没电了。', '先充一会儿。'],
  ['周末想逛书店。', '回来告诉我。'],
  ['窗台的花长新叶了。', '照顾得真好。'],
];
const blind3Cases: ReadonlyArray<{
  query: string;
  expected: string | null;
  note: string;
}> = [
  { query: '你还记得白色耳机收在哪里了。', expected: '白色耳机', note: 'recall question typed with period' },
  { query: '橘猫预约三点去松林宠物医院，对不对。', expected: '松林宠物医院', note: 'appointment confirmation with period' },
  { query: '生日那天我们订的红丝绒蛋糕，对吧。', expected: '红丝绒蛋糕', note: 'birthday confirmation with period' },
  { query: '下周说好去旧天文台来着。', expected: '旧天文台', note: 'old plan fragment with period' },
  { query: '绿色行李箱最后放哪儿了', expected: null, note: 'known_local_cross_clause_abstain: luggage and storage are in different clauses' },
  { query: '白色耳机是放在书房第二层吗', expected: '白色耳机', note: 'location confirmation no punctuation' },
  { query: '之前是不是在旧天文台碰头', expected: '旧天文台', note: 'explicit recall no punctuation' },
  { query: '白色耳机还在卖吗？', expected: null, note: 'retail availability not old storage' },
  { query: '河边咖啡馆还在营业吗？', expected: null, note: 'business status not birthday plan' },
  { query: '松林宠物医院是谁开的？', expected: null, note: 'ownership fact not appointment' },
  { query: '河边咖啡馆是什么装修风格？', expected: null, note: 'decor fact not birthday plan' },
  { query: '书房第二层抽屉是什么材质？', expected: null, note: 'material fact not headphone storage' },
  { query: '绿色行李箱是谁家的？', expected: null, note: 'ownership fact absent from old turn' },
  { query: '旧天文台是哪年建的？', expected: null, note: 'history fact absent from old turn' },
  { query: '靛蓝色的伞是什么牌子？', expected: null, note: 'brand fact absent from old turn' },
];
let blind3MessageId = 17_000_000;
const blind3TurnsFor = (fillerCount: number) => {
  const messages: Message[] = [];
  const addTurn = (user: string, assistant: string): void => {
    messages.push(message(blind3MessageId++, 'user', user));
    messages.push(message(blind3MessageId++, 'assistant', assistant));
  };
  for (const [user, assistant] of blindBaseTurns) addTurn(user, assistant);
  for (let index = 0; index < fillerCount; index += 1) {
    const [user, assistant] = blind3FillerTurns[index % blind3FillerTurns.length];
    addTurn(user, assistant);
  }
  return groupConversationTurns(messages);
};

for (const fillerCount of [20, 10, 5]) {
  const blind3Turns = blind3TurnsFor(fillerCount);
  for (const item of blind3Cases) {
    const result = selectEarlierConversationQuotes({
      turns: blind3Turns,
      query: item.query,
      userName: '玩家',
      characterName: '角色',
    });
    if (item.expected === null) {
      assert.equal(
        result.turns.length,
        0,
        `${item.note} must abstain at blind3 filler=${fillerCount}`,
      );
      assert.equal(result.markdown, '');
      continue;
    }
    assert.equal(
      result.turns.length,
      1,
      `${item.note} must return exactly one turn at blind3 filler=${fillerCount}`,
    );
    assert.deepEqual(
      reviewMarkers.filter(marker => result.markdown.includes(marker)),
      [item.expected],
      `${item.note} must select only the expected turn at blind3 filler=${fillerCount}`,
    );
  }
}

// 2026-11-21 fourth main-controller blind matrix: recall intent only opens;
// the candidate must still prove it contains the requested old detail.
const blind4Cases: ReadonlyArray<{
  query: string;
  expected: string | null;
  note: string;
}> = [
  { query: '你还记得白色耳机收在哪儿了吗？', expected: '白色耳机', note: 'recall cue plus supported location slot' },
  { query: '之前那个绿色行李箱放在哪一层来着？', expected: null, note: 'known_local_cross_clause_abstain: recall cue cannot join luggage and storage clauses' },
  { query: '上次橘猫预约的是几点？', expected: '松林宠物医院', note: 'recall cue plus supported time slot' },
  { query: '生日那天订的是靠窗吗？', expected: '红丝绒蛋糕', note: 'recall cue plus supported seat detail' },
  { query: '那次下雨约的是旧天文台，对吧？', expected: '旧天文台', note: 'recall confirmation with supported place' },
  { query: '你还记得白色耳机是什么牌子吗？', expected: null, note: 'recall cue must not invent brand' },
  { query: '之前那个绿色行李箱是谁的？', expected: null, note: 'recall cue must not invent ownership' },
  { query: '上次松林宠物医院是谁开的？', expected: null, note: 'recall cue must not invent operator' },
  { query: '生日那天河边咖啡馆是什么装修风格？', expected: null, note: 'recall cue must not invent decor' },
  { query: '那次靛蓝色的伞是什么牌子来着？', expected: null, note: 'confirmation must not invent umbrella brand' },
  { query: '之前说过白色耳机，现在我想买新的。', expected: null, note: 'old cue inside a current purchase statement' },
  { query: '生日那天的河边咖啡馆今天关门了。', expected: null, note: 'old cue inside a current business update' },
  { query: '上次的绿色行李箱今天送去修理了。', expected: null, note: 'old cue inside a current repair update' },
  { query: '那天橘猫现在已经不去松林宠物医院了。', expected: null, note: 'old cue inside a current cancellation update' },
  { query: '刚想起旧天文台，最近那里开放吗？', expected: null, note: 'recall preface plus current public-status question' },
];
let blind4MessageId = 18_000_000;
const blind4TurnsFor = (fillerCount: number) => {
  const messages: Message[] = [];
  const addTurn = (user: string, assistant: string): void => {
    messages.push(message(blind4MessageId++, 'user', user));
    messages.push(message(blind4MessageId++, 'assistant', assistant));
  };
  for (const [user, assistant] of blindBaseTurns) addTurn(user, assistant);
  for (let index = 0; index < fillerCount; index += 1) {
    const [user, assistant] = blind3FillerTurns[index % blind3FillerTurns.length];
    addTurn(user, assistant);
  }
  return groupConversationTurns(messages);
};

for (const fillerCount of [20, 10, 5]) {
  const blind4Turns = blind4TurnsFor(fillerCount);
  for (const item of blind4Cases) {
    const result = selectEarlierConversationQuotes({
      turns: blind4Turns,
      query: item.query,
      userName: '玩家',
      characterName: '角色',
    });
    if (item.expected === null) {
      assert.equal(
        result.turns.length,
        0,
        `${item.note} must abstain at blind4 filler=${fillerCount}`,
      );
      assert.equal(result.markdown, '');
      continue;
    }
    assert.equal(
      result.turns.length,
      1,
      `${item.note} must return exactly one turn at blind4 filler=${fillerCount}`,
    );
    assert.deepEqual(
      reviewMarkers.filter(marker => result.markdown.includes(marker)),
      [item.expected],
      `${item.note} must select only the expected turn at blind4 filler=${fillerCount}`,
    );
  }
}

// 2026-11-21 fifth main-controller blind matrix: one same-clause anchor plus
// same-message detail; cross-message, cross-clause, composed-entity and
// unpunctuated-current inputs must abstain.
const blind5Cases: ReadonlyArray<{
  name: string;
  user: string;
  assistant: string;
  query: string;
  expected: string | null;
  note: string;
}> = [
  {
    name: 'location-positive',
    user: '那把银灰色折叠伞，我放进玄关鞋柜下层了。',
    assistant: '好，出门前我提醒你去鞋柜拿。',
    query: '银灰色折叠伞放哪儿了？',
    expected: null,
    note: 'known_local_cross_clause_abstain: umbrella and storage are in different clauses',
  },
  {
    name: 'location-cross-message-negative',
    user: '那把银灰色折叠伞挺轻的。',
    assistant: '门禁卡放进玄关鞋柜下层了。',
    query: '银灰色折叠伞放哪儿了？',
    expected: null,
    note: 'location in another message must not bind',
  },
  {
    name: 'time-positive',
    user: '橘猫去松林诊所的复诊约在周六上午十点。',
    assistant: '我记住了，周六早一点出门。',
    query: '橘猫去松林诊所约的几点来着？',
    expected: '橘猫去松林诊所的复诊',
    note: 'same-message time fact',
  },
  {
    name: 'time-cross-message-negative',
    user: '橘猫要去松林诊所复诊。',
    assistant: '我周六上午十点去剪头发。',
    query: '橘猫去松林诊所约的几点来着？',
    expected: null,
    note: 'time in another message must not bind',
  },
  {
    name: 'owner-positive',
    user: '门边那辆黄色自行车是小黎的。',
    assistant: '好，我不会推错车。',
    query: '黄色自行车是谁的来着？',
    expected: '黄色自行车',
    note: 'same-message owner fact',
  },
  {
    name: 'owner-cross-message-negative',
    user: '门边那辆黄色自行车链条松了。',
    assistant: '小黎的红色围巾还在车筐里。',
    query: '黄色自行车是谁的来着？',
    expected: null,
    note: 'owner in another message must not bind',
  },
  {
    name: 'entity-binding-positive',
    user: '白色耳机在第二层，蓝色钥匙在第三层。',
    assistant: '两个位置我都记下了。',
    query: '白色耳机在哪一层？',
    expected: '白色耳机',
    note: 'same-clause entity and location',
  },
  {
    name: 'entity-composition-negative',
    user: '白色耳机在第二层，蓝色钥匙在第三层。',
    assistant: '两个位置我都记下了。',
    query: '蓝色耳机在哪一层？',
    expected: null,
    note: 'different clauses must not compose an entity',
  },
  {
    name: 'price-positive',
    user: '蓝色水杯的价格是二十九元。',
    assistant: '这个价格还可以。',
    query: '蓝色水杯是什么价格来着？',
    expected: '蓝色水杯',
    note: 'same-message price fact',
  },
  {
    name: 'price-cross-message-negative',
    user: '蓝色水杯被小林带走了。',
    assistant: '新的价格表放在桌上。',
    query: '蓝色水杯是什么价格来着？',
    expected: null,
    note: 'price in another message must not bind',
  },
  {
    name: 'alternative-positive',
    user: '那天早餐我点的是美式。',
    assistant: '对，你没有点拿铁。',
    query: '之前早餐点的是拿铁还是美式来着？',
    expected: '早餐我点的是美式',
    note: 'one complete alternative side',
  },
  {
    name: 'plain-present-negative',
    user: '北门花店把淡紫色花束包好了。',
    assistant: '取花时记得核对名字。',
    query: '之前说的淡紫色花束，现在我已经取到了。',
    expected: null,
    note: 'current statement must abstain',
  },
  {
    name: 'unpunctuated-current-update-negative',
    user: '我们说过那个绿色行李箱，放到储藏室最上面了。',
    assistant: '对，绿色的那个，我收好了。',
    query: '上次绿色行李箱今天送去修理了',
    expected: null,
    note: 'unpunctuated current update must abstain',
  },
  {
    name: 'unpunctuated-current-status-negative',
    user: '生日那天去河边咖啡馆，我想点红丝绒蛋糕。',
    assistant: '好，我会提前订靠窗的位置。',
    query: '生日那天河边咖啡馆今天关门了',
    expected: null,
    note: 'unpunctuated current status must abstain',
  },
  {
    name: 'unpunctuated-unsupported-property-negative',
    user: '白色耳机落在书房第二层抽屉里了。',
    assistant: '知道了，明天出门前提醒你。',
    query: '白色耳机广告在哪里买',
    expected: null,
    note: 'unpunctuated unsupported property must abstain',
  },
  {
    name: 'unpunctuated-supported-location-positive',
    user: '绿色行李箱放到储藏室最上面了。',
    assistant: '对，绿色的那个，我收好了。',
    query: '绿色行李箱最后放哪儿了',
    expected: '绿色行李箱',
    note: 'unpunctuated location fact',
  },
];

for (const [index, item] of blind5Cases.entries()) {
  const pair = groupConversationTurns([
    message(19_000_000 + (index * 2), 'user', item.user),
    message(19_000_001 + (index * 2), 'assistant', item.assistant),
  ]);
  const result = selectEarlierConversationQuotes({
    turns: pair,
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, `${item.name}: ${item.note}`);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, `${item.name}: ${item.note}`);
  assert.ok(
    item.user.includes(item.expected),
    `${item.name}: expected marker must be in the user fact`,
  );
  assert.match(result.markdown, new RegExp(item.expected));
}

// 2026-11-21 sixth main-controller blind matrix: a single clause must carry
// entity, detail and slot evidence; unsupported property/numeric asks abstain.
const blind6Cases: ReadonlyArray<{
  name: string;
  user: string;
  assistant: string;
  query: string;
  expected: string | null;
  note: string;
}> = [
  {
    name: 'album-location-positive',
    user: '那本米白色相册压在客厅矮柜下面。',
    assistant: '好，下次翻照片去矮柜拿。',
    query: '米白色相册收哪儿了？',
    expected: '米白色相册',
    note: 'same-clause location fact',
  },
  {
    name: 'ticket-location-paraphrase-positive',
    user: '我把演出票夹在旧日记本最后一页。',
    assistant: '记下了，出门前别忘记拿。',
    query: '演出票藏到哪儿去了？',
    expected: '演出票',
    note: 'same-clause location paraphrase',
  },
  {
    name: 'dentist-time-positive',
    user: '牙科复诊排在周三下午四点。',
    assistant: '我会提前提醒你。',
    query: '牙科复诊约的几点来着？',
    expected: '牙科复诊',
    note: 'same-clause time fact',
  },
  {
    name: 'cup-owner-positive',
    user: '木纹保温杯是阿洛的。',
    assistant: '好，我不会拿错。',
    query: '木纹保温杯是谁的来着？',
    expected: '木纹保温杯',
    note: 'same-clause owner fact',
  },
  {
    name: 'bell-price-positive',
    user: '黄铜小铃铛的价格是四十八元。',
    assistant: '这个价格还算合适。',
    query: '黄铜小铃铛多少钱来着？',
    expected: '黄铜小铃铛',
    note: 'same-clause numeric answer',
  },
  {
    name: 'unpunctuated-location-positive',
    user: '灰绿色帆布包放在衣柜左边了。',
    assistant: '下次出门去衣柜拿。',
    query: '灰绿色帆布包最后放哪了',
    expected: '灰绿色帆布包',
    note: 'unpunctuated same-clause location',
  },
  {
    name: 'location-same-message-cross-clause-negative',
    user: '银灰色折叠伞挺轻的，门禁卡放进玄关鞋柜下层了。',
    assistant: '好，我记住门禁卡的位置了。',
    query: '银灰色折叠伞放哪儿了？',
    expected: null,
    note: 'another clause entity must not supply location',
  },
  {
    name: 'time-same-message-cross-clause-negative',
    user: '橘猫要去松林诊所复诊，我周六上午十点去剪头发。',
    assistant: '这两件事都别忘了。',
    query: '橘猫去松林诊所约的几点来着？',
    expected: null,
    note: 'another clause event must not supply time',
  },
  {
    name: 'entity-composition-same-clause-negative',
    user: '蓝色钥匙压在白色耳机旁边。',
    assistant: '两个东西都在桌面上。',
    query: '蓝色耳机放哪儿了？',
    expected: null,
    note: 'two entities in one clause must not compose a third',
  },
  {
    name: 'price-same-message-cross-clause-negative',
    user: '蓝色水杯被小林带走了，新的价格表放在桌上。',
    assistant: '好，我去问小林。',
    query: '蓝色水杯是什么价格来着？',
    expected: null,
    note: 'another clause price must not bind the cup',
  },
  {
    name: 'owner-same-message-cross-clause-negative',
    user: '黄色自行车的链条松了，红色围巾是小黎的。',
    assistant: '我先把围巾收起来。',
    query: '黄色自行车是谁的来着？',
    expected: null,
    note: 'another clause owner must not bind the bicycle',
  },
  {
    name: 'unsupported-price-negative',
    user: '黄铜小铃铛挂在门边，风吹时会响。',
    assistant: '声音应该很清脆。',
    query: '黄铜小铃铛多少钱来着？',
    expected: null,
    note: 'entity without a numeric answer must abstain',
  },
  {
    name: 'unsupported-age-negative',
    user: '那只白猫喜欢趴在窗台晒太阳。',
    assistant: '它看起来很放松。',
    query: '那只白猫几岁了？',
    expected: null,
    note: 'entity without an age answer must abstain',
  },
  {
    name: 'unsupported-brand-same-message-negative',
    user: '木纹保温杯放在餐桌上，品牌手册收进抽屉了。',
    assistant: '我把手册和杯子分开放了。',
    query: '木纹保温杯是什么牌子来着？',
    expected: null,
    note: 'brand word in another clause must not bind the cup',
  },
];

for (const [index, item] of blind6Cases.entries()) {
  const pair = groupConversationTurns([
    message(20_000_000 + (index * 2), 'user', item.user),
    message(20_000_001 + (index * 2), 'assistant', item.assistant),
  ]);
  const result = selectEarlierConversationQuotes({
    turns: pair,
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, `${item.name}: ${item.note}`);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, `${item.name}: ${item.note}`);
  assert.ok(item.user.includes(item.expected), `${item.name}: expected marker`);
  assert.match(result.markdown, new RegExp(item.expected));
}

// Owner-approved narrow entity insertion variant: one bounded gap in the same
// clause; exact still wins. Relation/coordinator gaps must be rejected.
const variantAliasCases: ReadonlyArray<{
  name: string;
  user: string;
  assistant: string;
  query: string;
  expected: string | null;
  note: string;
}> = [
  {
    name: 'clinic-alias-positive',
    user: '松林宠物医院复诊定在周五上午九点。',
    assistant: '我记住了。',
    query: '松林医院复诊约的几点？',
    expected: '松林宠物医院',
    note: 'one insertion gap 宠物 in the same clause',
  },
  {
    name: 'umbrella-alias-positive',
    user: '我会把一把靛蓝色的伞放在玄关鞋柜。',
    assistant: '好，我记着。',
    query: '靛蓝雨伞放哪儿了？',
    expected: null,
    note: 'known_local_lexical_variant_abstain: 靛蓝雨伞 -> 靛蓝色的伞 drops 雨',
  },
  {
    name: 'coordinator-gap-negative',
    user: '蓝色杯和耳机都在桌面上。',
    assistant: '两个都在。',
    query: '蓝色耳机放哪儿了？',
    expected: null,
    note: 'coordinator 和 inside the insertion gap',
  },
  {
    name: 'coordinator-relation-gap-negative',
    user: '橘猫和诊所都在街角。',
    assistant: '知道了。',
    query: '橘猫诊所几点开门？',
    expected: null,
    note: 'coordinator 和 inside the insertion gap',
  },
  {
    name: 'pronoun-gap-negative',
    user: '生日我买了蛋糕。',
    assistant: '好。',
    query: '生日蛋糕是什么味道？',
    expected: null,
    note: 'pronoun 我 inside the insertion gap',
  },
  {
    name: 'spatial-gap-negative',
    user: '松林附近医院上午九点开门。',
    assistant: '知道了。',
    query: '松林医院几点开门？',
    expected: null,
    note: 'spatial word 附近 inside the insertion gap',
  },
];

for (const [index, item] of variantAliasCases.entries()) {
  const pair = groupConversationTurns([
    message(21_000_000 + (index * 2), 'user', item.user),
    message(21_000_001 + (index * 2), 'assistant', item.assistant),
  ]);
  const result = selectEarlierConversationQuotes({
    turns: pair,
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, `${item.name}: ${item.note}`);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, `${item.name}: ${item.note}`);
  assert.match(result.markdown, new RegExp(item.expected));
}

// 2026-11-21 seventh main-controller blind matrix: exact/variant entity in one
// clause, unit-bound quantity, and no cross-clause location/owner seam.
const blind7Cases: ReadonlyArray<{
  name: string;
  user: string;
  assistant: string;
  query: string;
  expected: string | null;
  note: string;
}> = [
  {
    name: 'brand-before-entity-positive',
    user: '木纹保温杯的牌子是膳魔师。',
    assistant: '好，我记住这个牌子了。',
    query: '什么牌子的木纹保温杯来着？',
    expected: '木纹保温杯',
    note: 'property before the entity',
  },
  {
    name: 'price-unit-positive',
    user: '黄铜小铃铛花了四十八元。',
    assistant: '这个价格还算合适。',
    query: '黄铜小铃铛多少钱来着？',
    expected: '黄铜小铃铛',
    note: 'currency unit matches price',
  },
  {
    name: 'age-unit-positive',
    user: '窗台那只白猫已经三岁了。',
    assistant: '三岁还很活泼。',
    query: '那只白猫几岁了？',
    expected: '白猫',
    note: 'age unit matches age',
  },
  {
    name: 'location-positive',
    user: '银灰色折叠伞放在玄关鞋柜下层。',
    assistant: '出门前记得去鞋柜拿。',
    query: '银灰色折叠伞放哪儿了？',
    expected: '银灰色折叠伞',
    note: 'same-clause storage relation',
  },
  {
    name: 'owner-positive',
    user: '松林诊所是林医生开的。',
    assistant: '原来是林医生的诊所。',
    query: '松林诊所是谁开的来着？',
    expected: '松林诊所',
    note: 'same-clause ownership relation',
  },
  {
    name: 'time-positive',
    user: '橘猫复诊定在周五上午九点。',
    assistant: '周五早上别睡过头。',
    query: '橘猫复诊约的几点来着？',
    expected: '橘猫复诊',
    note: 'same-clause time fact',
  },
  {
    name: 'price-wrong-unit-negative',
    user: '黄铜小铃铛有两斤重。',
    assistant: '拿在手里确实沉。',
    query: '黄铜小铃铛多少钱来着？',
    expected: null,
    note: 'weight is not currency',
  },
  {
    name: 'age-wrong-unit-negative',
    user: '窗台那只白猫有三斤重。',
    assistant: '它最近胃口不错。',
    query: '那只白猫几岁了？',
    expected: null,
    note: 'weight is not age',
  },
  {
    name: 'location-temporal-zai-negative',
    user: '银灰色折叠伞在下雨天很好用。',
    assistant: '伞面大，挡雨确实方便。',
    query: '银灰色折叠伞放哪儿了？',
    expected: null,
    note: 'temporal 在 is not location',
  },
  {
    name: 'owner-open-door-negative',
    user: '松林诊所今天开门，门口排了几个人。',
    assistant: '今天看起来挺忙。',
    query: '松林诊所是谁开的来着？',
    expected: null,
    note: '开门 is not ownership',
  },
  {
    name: 'elided-location-cross-subject-negative',
    user: '银灰色折叠伞挺轻的，我把门禁卡放进玄关鞋柜下层了。',
    assistant: '好，我记住门禁卡的位置了。',
    query: '银灰色折叠伞放哪儿了？',
    expected: null,
    note: 'no elided cross-clause location',
  },
  {
    name: 'bounded-gap-entity-composition-negative',
    user: '蓝色杯和耳机都在桌面上。',
    assistant: '两个东西都别忘了拿。',
    query: '蓝色耳机放哪儿了？',
    expected: null,
    note: 'coordinator gap cannot compose the entity',
  },
];

for (const [index, item] of blind7Cases.entries()) {
  const pair = groupConversationTurns([
    message(22_000_000 + (index * 2), 'user', item.user),
    message(22_000_001 + (index * 2), 'assistant', item.assistant),
  ]);
  const result = selectEarlierConversationQuotes({
    turns: pair,
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, `${item.name}: ${item.note}`);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, `${item.name}: ${item.note}`);
  assert.match(result.markdown, new RegExp(item.expected));
}

// 2026-11-21 eighth main-controller blind matrix: match spans, full-character
// variants, local-fact slot binding, current gate before noun-run fallback.
const blind8Cases: ReadonlyArray<{
  name: string;
  oldUser: string;
  oldAssistant: string;
  query: string;
  expected: string | null;
  note: string;
}> = [
  {
    name: 'exact-location-natural-positive',
    oldUser: '湖蓝马克杯放在书架第二层。',
    oldAssistant: '下次泡茶就去第二层拿。',
    query: '湖蓝马克杯搁哪儿了？',
    expected: '湖蓝马克杯',
    note: 'exact same-clause location',
  },
  {
    name: 'variant-location-natural-positive',
    oldUser: '星光陶瓷杯收在橱柜上层。',
    oldAssistant: '我记住是在橱柜上层。',
    query: '星光杯收哪儿了？',
    expected: '星光陶瓷杯',
    note: 'narrow insertion variant',
  },
  {
    name: 'exact-price-natural-positive',
    oldUser: '那只木雕小鹿花了八十六元。',
    oldAssistant: '八十六元买到还挺合适。',
    query: '木雕小鹿当时多少钱？',
    expected: '木雕小鹿',
    note: '当时 is a recall frame, currency unit bound',
  },
  {
    name: 'exact-owner-natural-positive',
    oldUser: '月桂书屋是周奶奶经营的。',
    oldAssistant: '难怪店里总有很温柔的气氛。',
    query: '月桂书屋是谁经营的来着？',
    expected: '月桂书屋',
    note: 'explicit ownership relation',
  },
  {
    name: 'exact-time-natural-positive',
    oldUser: '橙子体检预约在星期二上午十点。',
    oldAssistant: '星期二早上我们别迟到。',
    query: '橙子体检约了几点？',
    expected: '橙子体检',
    note: 'same-clause time',
  },
  {
    name: 'later-valid-variant-after-rejected-prefix-positive',
    oldUser: '松林附近医院不是那家而松林宠物医院在北街里面。',
    oldAssistant: '对，要找的是北街那家。',
    query: '松林医院在哪儿？',
    expected: '松林宠物医院',
    note: 'scan all variant occurrences after a rejected prefix',
  },
  {
    name: 'common-measure-word-positive',
    oldUser: '我把奶油白手账本收进床头柜第二个抽屉。',
    oldAssistant: '好，床头柜第二个抽屉。',
    query: '那本奶油白手账本放哪里了？',
    expected: '奶油白手账本',
    note: 'leading common measure word',
  },
  {
    name: 'variant-must-not-drop-query-middle-negative',
    oldUser: '红色水杯机放在桌面上。',
    oldAssistant: '桌面上的机器别碰倒。',
    query: '红色耳机放哪儿了？',
    expected: null,
    note: 'variant must not drop query middle characters',
  },
  {
    name: 'location-must-bind-to-entity-negative',
    oldUser: '银灰色折叠伞很轻而门禁卡放在鞋柜里面。',
    oldAssistant: '鞋柜里的是门禁卡。',
    query: '银灰色折叠伞放哪儿了？',
    expected: null,
    note: 'another fact subject cannot lend location',
  },
  {
    name: 'price-must-bind-to-entity-negative',
    oldUser: '黄铜铃铛很沉而玻璃花瓶花了四十八元。',
    oldAssistant: '四十八元买的是玻璃花瓶。',
    query: '黄铜铃铛多少钱来着？',
    expected: null,
    note: 'another fact subject cannot lend price',
  },
  {
    name: 'age-must-bind-to-entity-negative',
    oldUser: '窗台白猫很活泼而院里的橘猫已经三岁了。',
    oldAssistant: '三岁的是院里的橘猫。',
    query: '窗台白猫几岁了？',
    expected: null,
    note: 'another fact subject cannot lend age',
  },
  {
    name: 'owner-must-bind-to-entity-negative',
    oldUser: '松林诊所今天很忙而青石诊所是李医生经营的。',
    oldAssistant: '李医生经营的是青石诊所。',
    query: '松林诊所是谁经营的？',
    expected: null,
    note: 'another fact subject cannot lend ownership',
  },
  {
    name: 'time-must-bind-to-entity-negative',
    oldUser: '橘猫复诊还没定而白猫复诊约在周五上午九点。',
    oldAssistant: '周五九点的是白猫。',
    query: '橘猫复诊约的几点？',
    expected: null,
    note: 'another fact subject cannot lend time',
  },
  {
    name: 'current-update-must-not-open-recall-negative',
    oldUser: '我把藤编篮子收在阳台柜子里。',
    oldAssistant: '阳台柜子里会比较干燥。',
    query: '我现在想买一个新的藤编篮子。',
    expected: null,
    note: 'current/action gate precedes noun-run fallback',
  },
  {
    name: 'bare-recall-scaffold-negative',
    oldUser: '我把藤编篮子收在阳台柜子里。',
    oldAssistant: '阳台柜子里会比较干燥。',
    query: '你还记得我们以前说过什么吗？',
    expected: null,
    note: 'bare recall scaffold cannot invent relevance',
  },
];

for (const [index, item] of blind8Cases.entries()) {
  const pair = groupConversationTurns([
    message(23_000_000 + (index * 2), 'user', item.oldUser),
    message(23_000_001 + (index * 2), 'assistant', item.oldAssistant),
  ]);
  const result = selectEarlierConversationQuotes({
    turns: pair,
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, `${item.name}: ${item.note}`);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, `${item.name}: ${item.note}`);
  assert.match(result.markdown, new RegExp(item.expected));
}

// 2026-11-21 ninth main-controller blind matrix: proper names/ordinals must
// survive normalization; span-local answer values only; no query-char drop.
const blind9Cases: ReadonlyArray<{
  name: string;
  turns: ReadonlyArray<readonly [string, string]>;
  query: string;
  expected: string | null;
  include?: string;
  exclude?: string;
}> = [
  {
    name: 'proper-name-prefix',
    turns: [['本田车钥匙收在书桌左边抽屉。', '左边抽屉放的是本田车钥匙。'], ['丰田车钥匙收在玄关小盒子里。', '玄关小盒子放的是丰田车钥匙。']],
    query: '本田车钥匙放哪里了？', expected: '本田车钥匙', include: '本田车钥匙', exclude: '丰田车钥匙',
  },
  {
    name: 'ordinal-name',
    turns: [['一号药箱放在卧室高柜。', '卧室高柜里是一号药箱。'], ['二号药箱放在客厅矮柜。', '客厅矮柜里是二号药箱。']],
    query: '一号药箱放哪儿了？', expected: '一号药箱', include: '一号药箱', exclude: '二号药箱',
  },
  {
    name: 'variant-query-char-drop',
    turns: [['蓝色相机放在窗边架子上。', '窗边架子上的是相机。']],
    query: '蓝色耳机放哪里了？', expected: null,
  },
  {
    name: 'location-cross-bingqie',
    turns: [['银灰色折叠伞很轻并且门禁卡放在鞋柜里面。', '鞋柜里面的是门禁卡。']],
    query: '银灰色折叠伞放哪里了？', expected: null,
  },
  {
    name: 'price-cross-lingwai',
    turns: [['黄铜铃铛有点沉另外玻璃花瓶花了四十八元。', '四十八元买的是玻璃花瓶。']],
    query: '黄铜铃铛多少钱来着？', expected: null,
  },
  {
    name: 'time-cross-ranhou',
    turns: [['橘猫复诊还没定然后白猫复诊约在周五上午九点。', '周五九点的是白猫。']],
    query: '橘猫复诊约的几点？', expected: null,
  },
  {
    name: 'location-bare-lai',
    turns: [['银灰色折叠伞明天记得带来。', '明天别忘了伞。']],
    query: '银灰色折叠伞放哪里了？', expected: null,
  },
  {
    name: 'location-bare-liu',
    turns: [['藤编篮子先留着。', '好，先不处理篮子。']],
    query: '藤编篮子放哪里了？', expected: null,
  },
  {
    name: 'owner-bare-boss',
    turns: [['松林诊所旁边那位老板很热情。', '那位老板经常和人打招呼。']],
    query: '松林诊所是谁开的？', expected: null,
  },
  {
    name: 'age-word-without-answer',
    turns: [['窗台白猫的年龄我没问。', '下次见到医生再问年龄。']],
    query: '窗台白猫几岁了？', expected: null,
  },
  {
    name: 'price-aggregate',
    turns: [['黄铜铃铛和玻璃花瓶一共四十八元。', '两样东西合计四十八元。']],
    query: '黄铜铃铛多少钱？', expected: null,
  },
  {
    name: 'exact-location-control',
    turns: [['薄荷绿水壶收在餐边柜下面。', '餐边柜下面放的是水壶。']],
    query: '薄荷绿水壶收哪儿了？', expected: '薄荷绿水壶',
  },
  {
    name: 'insertion-variant-control',
    turns: [['月光陶瓷盘放在厨房高柜里。', '厨房高柜里是那只盘子。']],
    query: '月光盘放哪儿了？', expected: '月光陶瓷盘',
  },
  {
    name: 'price-control',
    turns: [['木纹相框花了六十五元。', '六十五元买到很合适。']],
    query: '木纹相框当时多少钱？', expected: '六十五元',
  },
];

for (const [caseIndex, item] of blind9Cases.entries()) {
  const messages: Message[] = [];
  for (const [turnIndex, [user, assistant]] of item.turns.entries()) {
    messages.push(message(24_000_000 + (caseIndex * 10) + (turnIndex * 2), 'user', user));
    messages.push(message(24_000_001 + (caseIndex * 10) + (turnIndex * 2), 'assistant', assistant));
  }
  const result = selectEarlierConversationQuotes({
    turns: groupConversationTurns(messages),
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, item.name);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, item.name);
  assert.match(result.markdown, new RegExp(item.expected));
  if (item.include) assert.match(result.markdown, new RegExp(item.include));
  if (item.exclude) assert.doesNotMatch(result.markdown, new RegExp(item.exclude));
}

// 2026-11-22 tenth main-controller blind matrix: proper names/ordinals survive
// query normalization; pre-entity answers bind the entity span.
const blind10Cases: ReadonlyArray<{
  name: string;
  turns: ReadonlyArray<readonly [string, string]>;
  query: string;
  expected: string | null;
  include?: string;
  exclude?: string;
}> = [
  {
    name: 'proper-name-week',
    turns: [['周记本收在床头柜里。', '床头柜里是周记本。'], ['日记本收在书桌抽屉里。', '书桌抽屉里是日记本。']],
    query: '周记本放哪儿了？', expected: '周记本', include: '周记本', exclude: '日记本',
  },
  {
    name: 'proper-name-place-words',
    turns: [['里约书店是周奶奶开的。', '周奶奶一直经营里约书店。'], ['枫叶书店是林叔叔开的。', '林叔叔一直经营枫叶书店。']],
    query: '里约书店是谁开的？', expected: '里约书店', include: '周奶奶', exclude: '林叔叔',
  },
  {
    name: 'proper-name-location-noun',
    turns: [['地方志收在书房最上层。', '最上层放的是那本地方志。']],
    query: '地方志收哪儿了？', expected: '地方志', include: '最上层',
  },
  {
    name: 'proper-name-time-noun',
    turns: [['时间胶囊埋在花园银杏树下。', '银杏树下是时间胶囊。']],
    query: '时间胶囊埋哪儿了？', expected: '时间胶囊', include: '银杏树下',
  },
  {
    name: 'price-before-entity',
    turns: [['六十五元买的木纹相框摆在书架上。', '那个木纹相框很合适。']],
    query: '木纹相框当时多少钱？', expected: '木纹相框', include: '六十五元',
  },
  {
    name: 'owner-before-entity',
    turns: [['周奶奶开的月桂书屋就在河边。', '月桂书屋是她经营很多年的店。']],
    query: '月桂书屋是谁开的？', expected: '月桂书屋', include: '周奶奶',
  },
  {
    name: 'location-before-entity',
    turns: [['书桌左边抽屉里放着薄荷绿水壶。', '薄荷绿水壶已经收好了。']],
    query: '薄荷绿水壶放哪儿了？', expected: '薄荷绿水壶', include: '书桌左边抽屉',
  },
  {
    name: 'time-before-entity',
    turns: [['周五上午九点给橘猫复诊。', '复诊那天别迟到。']],
    query: '橘猫复诊约的几点？', expected: '橘猫复诊', include: '周五上午九点',
  },
  {
    name: 'price-before-other-entity',
    turns: [['六十五元买的相框摆好了，木纹闹钟很好看。', '木纹闹钟是朋友送的。']],
    query: '木纹闹钟当时多少钱？', expected: null,
  },
  {
    name: 'owner-before-other-entity',
    turns: [['周奶奶开的月桂书屋旁边是松林诊所。', '松林诊所今天很安静。']],
    query: '松林诊所是谁开的？', expected: null,
  },
  {
    name: 'location-before-other-entity',
    turns: [['书桌左边抽屉里放着门禁卡，薄荷绿水壶很轻。', '水壶拿着不累。']],
    query: '薄荷绿水壶放哪儿了？', expected: null,
  },
  {
    name: 'vague-location',
    turns: [['时间胶囊已经收好了。', '嗯，已经妥善放好。']],
    query: '时间胶囊放哪儿了？', expected: null,
  },
];

for (const [caseIndex, item] of blind10Cases.entries()) {
  const messages: Message[] = [];
  for (const [turnIndex, [user, assistant]] of item.turns.entries()) {
    messages.push(message(25_000_000 + (caseIndex * 10) + (turnIndex * 2), 'user', user));
    messages.push(message(25_000_001 + (caseIndex * 10) + (turnIndex * 2), 'assistant', assistant));
  }
  const result = selectEarlierConversationQuotes({
    turns: groupConversationTurns(messages),
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, item.name);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, item.name);
  assert.match(result.markdown, new RegExp(item.expected));
  if (item.include) assert.match(result.markdown, new RegExp(item.include));
  if (item.exclude) assert.doesNotMatch(result.markdown, new RegExp(item.exclude));
}

// 2026-11-22 eleventh main-controller blind matrix: boundary parsing preserves
// proper names containing pronouns, negation, ordinals and memory words.
const blind11Cases: ReadonlyArray<{
  name: string;
  turns: ReadonlyArray<readonly [string, string]>;
  query: string;
  expected: string | null;
  include?: string;
  exclude?: string;
}> = [
  {
    name: 'pronoun-name',
    turns: [['你我书屋是周奶奶开的。', '周奶奶经营你我书屋。'], ['月桂书屋是林叔叔开的。', '林叔叔经营月桂书屋。']],
    query: '你我书屋是谁开的？', expected: '你我书屋', include: '周奶奶', exclude: '林叔叔',
  },
  {
    name: 'pronoun-object-name',
    turns: [['他山石摆件收在电视柜里。', '电视柜里是他山石摆件。'], ['青山石摆件收在玄关柜里。', '玄关柜里是青山石摆件。']],
    query: '他山石摆件放哪儿了？', expected: '他山石摆件', include: '电视柜', exclude: '玄关柜',
  },
  {
    name: 'negation-album-name',
    turns: [['说好不哭唱片放在黑胶架第二层。', '第二层是说好不哭唱片。'], ['别哭唱片放在黑胶架最下层。', '最下层是别哭唱片。']],
    query: '说好不哭唱片放哪儿了？', expected: '说好不哭唱片', include: '第二层', exclude: '最下层',
  },
  {
    name: 'ordinal-film-name',
    turns: [['第一次的离别影碟放在卧室高柜。', '高柜里是第一次的离别影碟。'], ['离别影碟放在客厅矮柜。', '矮柜里是离别影碟。']],
    query: '第一次的离别影碟收哪儿了？', expected: '第一次的离别影碟', include: '卧室高柜', exclude: '客厅矮柜',
  },
  {
    name: 'memory-word-game-name',
    turns: [['纪念碑谷画册摆在书房窗边。', '窗边是纪念碑谷画册。'], ['碑谷画册摆在客厅书架。', '客厅书架上是碑谷画册。']],
    query: '纪念碑谷画册摆哪儿了？', expected: '纪念碑谷画册', include: '书房窗边', exclude: '客厅书架',
  },
  {
    name: 'relation-verb-boundary-control',
    turns: [['银杏叶标本夹在植物百科第三页。', '第三页是银杏叶标本。']],
    query: '银杏叶标本夹在哪里？', expected: '银杏叶标本', include: '第三页',
  },
  {
    name: 'current-statement-abstain',
    turns: [['你我书屋是周奶奶开的。', '周奶奶经营你我书屋。']],
    query: '我现在想去你我书屋买书。', expected: null,
  },
];

for (const [caseIndex, item] of blind11Cases.entries()) {
  const messages: Message[] = [];
  for (const [turnIndex, [user, assistant]] of item.turns.entries()) {
    messages.push(message(26_000_000 + (caseIndex * 10) + (turnIndex * 2), 'user', user));
    messages.push(message(26_000_001 + (caseIndex * 10) + (turnIndex * 2), 'assistant', assistant));
  }
  const result = selectEarlierConversationQuotes({
    turns: groupConversationTurns(messages),
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, item.name);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, item.name);
  assert.match(result.markdown, new RegExp(item.expected));
  if (item.include) assert.match(result.markdown, new RegExp(item.include));
  if (item.exclude) assert.doesNotMatch(result.markdown, new RegExp(item.exclude));
}

// 2026-11-22 twelfth main-controller blind matrix: long proper names must
// survive boundary parsing; no length cap may truncate them.
const blind12Cases: ReadonlyArray<{
  name: string;
  turns: ReadonlyArray<readonly [string, string]>;
  query: string;
  expected: string | null;
  include?: string;
  exclude?: string;
}> = [
  {
    name: 'long-ordinal-title',
    turns: [['第一次的亲密接触影碟珍藏版收在卧室高柜。', '卧室高柜里是珍藏版。'], ['亲密接触影碟珍藏版收在客厅矮柜。', '客厅矮柜里是普通版。']],
    query: '第一次的亲密接触影碟珍藏版收哪儿了？', expected: '第一次的亲密接触影碟珍藏版', include: '卧室高柜', exclude: '客厅矮柜',
  },
  {
    name: 'long-recall-word-album',
    turns: [['我们说好不分手演唱会蓝光碟放在影音柜上层。', '上层是那张蓝光碟。'], ['分手演唱会蓝光碟放在影音柜下层。', '下层是另一张碟。']],
    query: '我们说好不分手演唱会蓝光碟放哪儿了？', expected: '我们说好不分手演唱会蓝光碟', include: '影音柜上层', exclude: '影音柜下层',
  },
  {
    name: 'long-pronoun-notebook',
    turns: [['你我他的秘密花园手账本夹在旅行书第三页。', '第三页夹着那本手账。'], ['秘密花园手账本夹在植物百科第五页。', '第五页夹着普通手账。']],
    query: '你我他的秘密花园手账本夹在哪里？', expected: '你我他的秘密花园手账本', include: '旅行书第三页', exclude: '植物百科第五页',
  },
  {
    name: 'long-relation-char-film',
    turns: [['放牛班的春天电影原声唱片摆在黑胶架顶层。', '顶层是电影原声。'], ['牛班春天电影原声唱片摆在黑胶架底层。', '底层是另一张原声。']],
    query: '放牛班的春天电影原声唱片摆哪儿了？', expected: '放牛班的春天电影原声唱片', include: '黑胶架顶层', exclude: '黑胶架底层',
  },
  {
    name: 'long-title-current-abstain',
    turns: [['第一次的亲密接触影碟珍藏版收在卧室高柜。', '卧室高柜里是珍藏版。']],
    query: '我现在想买第一次的亲密接触影碟珍藏版。', expected: null,
  },
  {
    name: 'ordinary-long-control',
    turns: [['银杏叶植物百科图鉴精装本收在书房玻璃柜。', '玻璃柜里是那本图鉴。']],
    query: '银杏叶植物百科图鉴精装本收哪儿了？', expected: '银杏叶植物百科图鉴精装本', include: '书房玻璃柜',
  },
];

for (const [caseIndex, item] of blind12Cases.entries()) {
  const messages: Message[] = [];
  for (const [turnIndex, [user, assistant]] of item.turns.entries()) {
    messages.push(message(27_000_000 + (caseIndex * 10) + (turnIndex * 2), 'user', user));
    messages.push(message(27_000_001 + (caseIndex * 10) + (turnIndex * 2), 'assistant', assistant));
  }
  const result = selectEarlierConversationQuotes({
    turns: groupConversationTurns(messages),
    query: item.query,
    userName: '玩家',
    characterName: '角色',
  });
  if (item.expected === null) {
    assert.equal(result.turns.length, 0, item.name);
    assert.equal(result.markdown, '');
    continue;
  }
  assert.equal(result.turns.length, 1, item.name);
  assert.match(result.markdown, new RegExp(item.expected));
  if (item.include) assert.match(result.markdown, new RegExp(item.include));
  if (item.exclude) assert.doesNotMatch(result.markdown, new RegExp(item.exclude));
}

// Root-cause guards: a referenced object is not the located subject, current
// shopping questions cannot borrow an old storage slot, and separate asks do
// not share slot requirements.
const auditTurns = (...pairs: ReadonlyArray<readonly [string, string]>) => {
  let nextId = 27_100_000;
  return groupConversationTurns(pairs.flatMap(([user, assistant]) => [
    message(nextId++, 'user', user),
    message(nextId++, 'assistant', assistant),
  ]));
};
assert.equal(selectEarlierConversationQuotes({
  turns: auditTurns(['门禁卡放在白色耳机旁边。', '好。']),
  query: '白色耳机放哪儿了？', userName: '玩家', characterName: '角色',
}).turns.length, 0, 'a location reference object is not the located subject');
assert.equal(selectEarlierConversationQuotes({
  turns: auditTurns(['白色耳机落在书房第二层抽屉里。', '好。']),
  query: '白色耳机在哪里买？', userName: '玩家', characterName: '角色',
}).turns.length, 0, 'a current purchase question cannot borrow an old storage slot');
for (const query of ['白色耳机哪里有卖？', '白色耳机哪家有卖？', '白色耳机哪家店能买到？', '生日礼物在哪里买？']) {
  assert.equal(selectEarlierConversationQuotes({
    turns: auditTurns(['白色耳机落在书房第二层抽屉里。', '生日礼物收好了。']),
    query, userName: '玩家', characterName: '角色',
  }).turns.length, 0, `${query} is a current purchase question`);
}
assert.equal(selectEarlierConversationQuotes({
  turns: auditTurns(['我去松林医院复查了。', '复查很顺利。']),
  query: '松林医院在哪里？', userName: '玩家', characterName: '角色',
}).turns.length, 0, 'visiting a place is not a concrete location answer');
const independentAsks = selectEarlierConversationQuotes({
  turns: auditTurns(
    ['白色耳机放在书房第二层。', '记下了。'],
    ['木纹杯是小林的。', '不会拿错。'],
  ),
  query: '白色耳机放哪儿了，木纹杯是谁的？',
  userName: '玩家', characterName: '角色',
});
assert.equal(independentAsks.turns.length, 2, 'separate asks keep separate slot requirements');
assert.match(independentAsks.markdown, /白色耳机/);
assert.match(independentAsks.markdown, /木纹杯/);
const coordinatedTitle = selectEarlierConversationQuotes({
  turns: auditTurns(
    ['理论还需要慢慢学。', '别着急。'],
    ['实践是另一件事。', '是的。'],
    ['《理论与实践》收在书柜顶层。', '我记住了。'],
  ),
  query: '你还记得《理论与实践》吗？',
  userName: '玩家', characterName: '角色',
});
assert.equal(coordinatedTitle.turns.length, 1, 'a coordinated title remains one ask');
assert.match(coordinatedTitle.markdown, /《理论与实践》收在/);
const titleAndListItem = selectEarlierConversationQuotes({
  turns: auditTurns(
    ['《理论与实践》收在书柜顶层。', '我记住了。'],
    ['手术记录放在档案盒里。', '好。'],
  ),
  query: '你还记得《理论与实践》和手术记录吗？',
  userName: '玩家', characterName: '角色',
});
assert.equal(titleAndListItem.turns.length, 2, 'a title and an external list item remain separate asks');
assert.match(titleAndListItem.markdown, /《理论与实践》收在/);
assert.match(titleAndListItem.markdown, /手术记录放在/);

// The shared explicit-recall lexicon is reused verbatim: event/topic cues can
// support weak topic evidence, while generic recall actions/deictic time cues
// only grant intent. Existing memory delivery classification is unchanged.
const recallCueTerms = extractExplicitRecallCueTerms('你还记得生日那天说好的约定吗？');
for (const cue of ['还记', '生日', '那天', '说好', '约定']) {
  assert.ok(recallCueTerms.includes(cue), cue);
}
assert.deepEqual(extractExplicitRecallCueTerms('今天路上车很多。'), []);
assert.equal(
  classifyWorldlineDelivery({ mode: 'remote_chat', query: '你还记得生日吗？' })
    .reasons.includes('explicit_recall'),
  true,
);

// Short-message density: the 140-turn fixture is the non-regression neighbour;
// the 150-turn fixture puts the six-day-old target behind 301 newer admitted
// rows (current message plus 150 complete turns), which is exactly where the
// former 300-message budget lost it. Both reads stay inside the explicit
// 900-message / 32,000-character / 1,800-visit / 64,000-raw-character bounds.
const densityRecallFor = async (
  label: string,
  fillerTurns: number,
): Promise<{
  window: EarlierQuoteRecallWindow;
  recall: Awaited<ReturnType<typeof prepareChatConversationContinuity>>;
}> => {
  const densityScope: MessageRelationshipScope = {
    progressBundleId: `bundle-earlier-quote-density-${label}`,
    personaMaskId: `mask-earlier-quote-density-${label}`,
    charId: `char-earlier-quote-density-${label}`,
  };
  const densityMessages: Message[] = [];
  let densityMessageId = 13_000_000 + (fillerTurns * 10);
  const pushDensityMessage = (
    role: Message['role'],
    content: string,
    timestamp: number,
  ): void => {
    densityMessages.push({
      ...message(densityMessageId++, role, content, { relationshipScope: densityScope }),
      charId: densityScope.charId,
      timestamp,
    });
  };
  pushDensityMessage(
    'user',
    '密度回看：下周下雨的时候，我们去旧天文台。我会带一把靛蓝色的伞。',
    quoteAnchor - (6 * 24 * 60 * 60 * 1000),
  );
  pushDensityMessage(
    'assistant',
    '密度回看回复：好，我带伞。',
    quoteAnchor - (6 * 24 * 60 * 60 * 1000) + 1_000,
  );
  for (let turn = 1; turn <= fillerTurns; turn += 1) {
    const timestamp = quoteAnchor - (5 * 24 * 60 * 60 * 1000) + (turn * 60_000);
    pushDensityMessage('user', `密度闲聊第${turn}轮，今天路上车有点多。`, timestamp);
    pushDensityMessage('assistant', `密度闲聊回复第${turn}轮，那你慢一点。`, timestamp + 1_000);
  }
  pushDensityMessage('user', '靛蓝色的伞放在哪儿了？', quoteAnchor);
  await seedMessagesDirect(densityMessages);
  const window = await readEarlierQuoteRecallWindow({
    scope: densityScope,
    weeks: 1,
    anchorTimestamp: quoteAnchor,
  });
  const recall = await prepareChatConversationContinuity({
    scope: densityScope,
    messages: densityMessages,
    promptText: '角色底板',
    messageLimit: 20,
    apiConfig,
    userName: '玩家',
    characterName: '角色',
    earlierQuoteRecall: true,
    earlierQuoteWeeks: 1,
    earlierQuoteWindow: window,
  });
  return { window, recall };
};

const density140 = await densityRecallFor('140', 140);
assert.equal(density140.window.truncatedBy, 'none');
assert.equal(density140.window.admittedMessages, 283);
assert.equal(
  density140.window.turns[0]?.messages[0]?.content.includes('密度回看'),
  true,
  'the 140-turn fixture must admit the six-day-old target',
);
assert.equal(
  density140.recall.diagnostic.earlierQuoteTurns,
  0,
  'known_local_cross_clause_abstain: umbrella and place are in different clauses',
);
assert.equal(density140.recall.earlierQuoteMarkdown, '');

const density150 = await densityRecallFor('150', 150);
assert.equal(density150.window.truncatedBy, 'none');
assert.equal(density150.window.admittedMessages, 303);
assert.ok(
  density150.window.admittedMessages > 300,
  'the 150-turn fixture must cross the former 300-message cliff',
);
assert.ok(
  density150.window.admittedMessages <= CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES,
  'the recalibrated message budget stays a hard bound',
);
assert.ok(density150.window.scannedChars <= CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS);
assert.equal(
  density150.window.turns[0]?.messages[0]?.content.includes('密度回看'),
  true,
  'the 150-turn fixture must keep the six-day-old target',
);
assert.equal(
  density150.recall.diagnostic.earlierQuoteTurns,
  0,
  'known_local_cross_clause_abstain: umbrella and place are in different clauses',
);
assert.equal(density150.recall.earlierQuoteMarkdown, '');
assert.equal(density150.recall.diagnostic.earlierQuoteTruncatedBy, 'none');

const boundedScanOriginal = DB.getBoundedRecentMessagesByCharId;
let boundedScanCalls = 0;
DB.getBoundedRecentMessagesByCharId = async (input) => {
  boundedScanCalls += 1;
  return boundedScanOriginal(input);
};
try {
  const offNoReadScope: MessageRelationshipScope = {
    ...scope,
    progressBundleId: 'bundle-earlier-quote-off-no-read',
    personaMaskId: 'mask-earlier-quote-off-no-read',
    charId: 'char-earlier-quote-off-no-read',
  };
  const offNoRead = await prepareChatConversationContinuity({
    scope: offNoReadScope,
    messages: scopedFor(quoteMessages, offNoReadScope),
    promptText: '角色底板',
    messageLimit: 30,
    apiConfig,
    userName: '玩家',
    characterName: '角色',
  });
  assert.equal(boundedScanCalls, 0, 'the setting being off must not read the recall window');
  assert.equal(offNoRead.diagnostic.earlierQuoteWindowRead, false);

  const onOneReadScope: MessageRelationshipScope = {
    ...scope,
    progressBundleId: 'bundle-earlier-quote-on-one-read',
    personaMaskId: 'mask-earlier-quote-on-one-read',
    charId: 'char-earlier-quote-on-one-read',
  };
  const onOneRead = await prepareChatConversationContinuity({
    scope: onOneReadScope,
    messages: scopedFor(quoteMessages, onOneReadScope),
    promptText: '角色底板',
    messageLimit: 30,
    apiConfig,
    userName: '玩家',
    characterName: '角色',
    earlierQuoteRecall: true,
    earlierQuoteWeeks: 1,
  });
  assert.equal(boundedScanCalls, 1, 'the setting being on must use exactly one bounded recall read');
  assert.equal(onOneRead.diagnostic.earlierQuoteWindowRead, true);
  assert.equal(onOneRead.diagnostic.earlierQuoteScannedMessages, 0);
  assert.equal(onOneRead.earlierQuoteMarkdown, '');
} finally {
  DB.getBoundedRecentMessagesByCharId = boundedScanOriginal;
}

const clampHighScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-clamp-high',
  personaMaskId: 'mask-earlier-quote-clamp-high',
  charId: 'char-earlier-quote-clamp-high',
};
const clampHigh = await prepareChatConversationContinuity({
  scope: clampHighScope,
  messages: scopedFor(quoteMessages, clampHighScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: 99,
  earlierQuoteWindow: earlierQuoteWindowFor(
    scopedFor(quoteMessages, clampHighScope),
    clampHighScope,
  ),
});
assert.equal(clampHigh.diagnostic.earlierQuoteWeeks, 3);

const clampLowScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-clamp-low',
  personaMaskId: 'mask-earlier-quote-clamp-low',
  charId: 'char-earlier-quote-clamp-low',
};
const clampLow = await prepareChatConversationContinuity({
  scope: clampLowScope,
  messages: scopedFor(quoteMessages, clampLowScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWeeks: -5,
  earlierQuoteWindow: earlierQuoteWindowFor(
    scopedFor(quoteMessages, clampLowScope),
    clampLowScope,
  ),
});
assert.equal(clampLow.diagnostic.earlierQuoteWeeks, 1);

const defaultWeeksScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-default-weeks',
  personaMaskId: 'mask-earlier-quote-default-weeks',
  charId: 'char-earlier-quote-default-weeks',
};
const defaultWeeks = await prepareChatConversationContinuity({
  scope: defaultWeeksScope,
  messages: scopedFor(quoteMessages, defaultWeeksScope),
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: earlierQuoteWindowFor(
    scopedFor(quoteMessages, defaultWeeksScope),
    defaultWeeksScope,
  ),
});
assert.equal(defaultWeeks.diagnostic.earlierQuoteWeeks, 1);

const partialTurnScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-partial-turn',
  personaMaskId: 'mask-earlier-quote-partial-turn',
  charId: 'char-earlier-quote-partial-turn',
};
const partialTurnMessages = scopedFor(quoteMessages, partialTurnScope).slice(1);
const partialTurnWindow = buildEarlierQuoteRecallTurns({
  messages: partialTurnMessages,
  scope: partialTurnScope,
});
assert.ok(partialTurnWindow.length > 0);
for (const turn of partialTurnWindow) {
  assert.equal(turn.messages[0]?.role, 'user', 'a scan boundary must not emit a half turn');
}
assert.equal(
  partialTurnWindow.some(turn => turn.messages.some(item => item.id === 1)),
  false,
);

const mixedBudgetScope: MessageRelationshipScope = {
  ...scope,
  progressBundleId: 'bundle-earlier-quote-mixed-budget',
  personaMaskId: 'mask-earlier-quote-mixed-budget',
  charId: 'char-earlier-quote-mixed-budget',
};
const mixedBudgetMessages: Message[] = [];
let mixedBudgetId = 6_000_000;
for (let turn = 1; turn <= 12; turn += 1) {
  const timestamp = quoteAnchor - ((12 - turn) * 60_000);
  const huge = turn === 1;
  const short = turn === 2;
  const userContent = huge
    ? `大轮标记${'细节'.repeat(1_000)}`
    : short
      ? '短轮标记 复查记录'
      : `最近第${turn}轮`;
  const assistantContent = huge
    ? `大轮标记回复${'细节'.repeat(1_000)}`
    : short
      ? '短轮标记回复 绿色封面'
      : `最近第${turn}轮回复`;
  mixedBudgetMessages.push({
    ...message(mixedBudgetId++, 'user', userContent, { relationshipScope: mixedBudgetScope }),
    charId: mixedBudgetScope.charId,
    timestamp,
  });
  mixedBudgetMessages.push({
    ...message(mixedBudgetId++, 'assistant', assistantContent, {
      relationshipScope: mixedBudgetScope,
    }),
    charId: mixedBudgetScope.charId,
    timestamp,
  });
}
mixedBudgetMessages.push({
  ...message(mixedBudgetId, 'user', '还记得大轮标记和短轮标记吗？', {
    relationshipScope: mixedBudgetScope,
  }),
  charId: mixedBudgetScope.charId,
  timestamp: quoteAnchor,
});
mixedBudgetMessages.push({
  ...message(mixedBudgetId + 1, 'assistant', '最近第12轮回复', {
    relationshipScope: mixedBudgetScope,
  }),
  charId: mixedBudgetScope.charId,
  timestamp: quoteAnchor,
});
const mixedBudgetWindow = earlierQuoteWindowFor(
  mixedBudgetMessages,
  mixedBudgetScope,
);
const mixedBudget = await prepareChatConversationContinuity({
  scope: mixedBudgetScope,
  messages: mixedBudgetMessages,
  promptText: '角色底板',
  messageLimit: 20,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
  earlierQuoteWindow: mixedBudgetWindow,
});
assert.match(mixedBudget.earlierQuoteMarkdown, /短轮标记回复/);
assert.doesNotMatch(
  mixedBudget.earlierQuoteMarkdown,
  /大轮标记/,
  'an over-budget turn must be skipped whole instead of being clipped',
);

const chatRuntimeSource = readFileSync(new URL('../hooks/useChatAI.ts', import.meta.url), 'utf8');
const chatSettingsSource = readFileSync(new URL('../components/chat/ChatModals.tsx', import.meta.url), 'utf8');
const chatAppSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const characterTypeSource = readFileSync(new URL('../types.ts', import.meta.url), 'utf8');
const continuityUtilitySource = readFileSync(
  new URL('../utils/conversationContinuity.ts', import.meta.url),
  'utf8',
);
const dbSource = readFileSync(new URL('../utils/db.ts', import.meta.url), 'utf8');
const domainContinuitySource = readFileSync(
  new URL('../domain/conversationContinuity/contract.ts', import.meta.url),
  'utf8',
);
const continuityContractSource = readFileSync(
  new URL('../docs/CONVERSATION_CONTINUITY_CONTRACT.md', import.meta.url),
  'utf8',
);
assert.match(chatRuntimeSource, /prepareChatConversationContinuity/);
assert.match(chatRuntimeSource, /earlierQuoteRecall: char\.earlierQuoteRecallEnabled === true/);
assert.match(chatRuntimeSource, /earlierQuoteWeeks: char\.earlierQuoteRecallWeeks/);
assert.match(chatRuntimeSource, /hideBeforeMessageId: char\.hideBeforeMessageId/);
assert.match(chatRuntimeSource, /continuity\.markdown/);
assert.match(chatRuntimeSource, /continuity\.earlierQuoteMarkdown/);
assert.ok(
  chatRuntimeSource.indexOf('continuity.markdown')
  < chatRuntimeSource.indexOf('continuity.earlierQuoteMarkdown'),
  'quote block must be appended after the continuity capsule',
);
assert.match(chatRuntimeSource, /Math\.max\(1, contextMsgs\.length\)/);
assert.match(chatRuntimeSource, /const fullHistory = await readScopedAllMessages\(\)/);
assert.match(
  chatRuntimeSource,
  /filter\(message => !char\.hideBeforeMessageId \|\| message\.id >= char\.hideBeforeMessageId\)/,
);
assert.match(chatSettingsSource, /接续整理上限/);
assert.match(chatSettingsSource, /保留最近 10 轮原文/);
assert.match(chatSettingsSource, /参考更早的聊天原话/);
assert.match(chatSettingsSource, /默认关闭/);
assert.match(chatSettingsSource, /回看范围/);
assert.match(chatSettingsSource, /\[1, 2, 3\]/);
assert.match(
  chatAppSource,
  /const \[settingsEarlierQuoteRecall, setSettingsEarlierQuoteRecall\] = useState\(false\)/,
);
assert.match(
  chatAppSource,
  /const \[settingsEarlierQuoteWeeks, setSettingsEarlierQuoteWeeks\] = useState\(1\)/,
);
assert.match(chatAppSource, /earlierQuoteRecallEnabled: settingsEarlierQuoteRecall/);
assert.match(
  chatAppSource,
  /setSettingsEarlierQuoteWeeks\(normalizeEarlierQuoteWeeks\(char\.earlierQuoteRecallWeeks\)\)/,
);
assert.match(
  chatAppSource,
  /earlierQuoteRecallWeeks: normalizeEarlierQuoteWeeks\(settingsEarlierQuoteWeeks\)/,
);
assert.match(characterTypeSource, /earlierQuoteRecallEnabled\?: boolean/);
assert.match(characterTypeSource, /earlierQuoteRecallWeeks\?: number/);
assert.match(continuityUtilitySource, /getBoundedRecentMessagesByCharId/);
assert.match(continuityUtilitySource, /turns: earlierQuoteCandidates/);
assert.doesNotMatch(continuityUtilitySource, /turns: plan\.compactableTurns/);
assert.match(continuityUtilitySource, /CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES/);
assert.match(continuityUtilitySource, /CHAT_EARLIER_QUOTE_SCAN_MAX_CHARS/);
assert.match(continuityUtilitySource, /CHAT_EARLIER_QUOTE_SCAN_MAX_VISITS/);
assert.match(continuityUtilitySource, /CHAT_EARLIER_QUOTE_SCAN_MAX_RAW_CHARS/);
assert.match(continuityUtilitySource, /accept: message => isEarlierQuoteRecallMessage/);
assert.match(domainContinuitySource, /CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES = 900/);
assert.doesNotMatch(domainContinuitySource, /EARLIER_QUOTE_QUERY_GRAMMAR|earlierQuoteAskContent/);
assert.match(domainContinuitySource, /EARLIER_QUOTE_ASK_SHAPE/);
assert.match(domainContinuitySource, /EARLIER_QUOTE_LOCATION_QUERY/);
assert.match(domainContinuitySource, /EARLIER_QUOTE_TIME_QUERY/);
assert.match(domainContinuitySource, /EARLIER_QUOTE_OWNER_QUERY/);
assert.match(domainContinuitySource, /EarlierQuoteEntityMatch/);
assert.match(domainContinuitySource, /earlierQuoteEntityMatches/);
assert.match(domainContinuitySource, /EARLIER_QUOTE_VARIANT_GAP_REJECT/);
assert.match(domainContinuitySource, /earlierQuoteAskMatches/);
assert.match(domainContinuitySource, /EARLIER_QUOTE_ANSWER_GAP/);
assert.doesNotMatch(domainContinuitySource, /input\.terms|messageTexts|fullText/);
assert.doesNotMatch(domainContinuitySource, /生日|庆祝|抽屉|关门|开放/);
assert.doesNotMatch(
  domainContinuitySource,
  /生日|庆祝|抽屉|关门|开放/,
  'matrix-specific test words must not live in the production selector',
);
assert.doesNotMatch(domainContinuitySource, /earlierQuoteLocationContext|clauseBound|maxGap|message\.text/);
assert.doesNotMatch(domainContinuitySource, /\[dbg\]/);
assert.doesNotMatch(domainContinuitySource, /console\.log/);
assert.doesNotMatch(
  domainContinuitySource,
  /genericCharacters|GENERIC_CHARACTERS|earlierQuoteContentGroupsForText|earlierQuoteBestContentGroups|earlierQuoteCoversCharacters|fullText|messageTexts/,
  'the turn-level character bag, generic topic mask and second coverage bag must be removed, not layered over',
);
assert.doesNotMatch(
  domainContinuitySource,
  /earlierQuoteRareCharacterScore|EARLIER_QUOTE_RARE_CHARACTER_WINDOW_RATIO|EARLIER_QUOTE_GENERIC_SCAFFOLD_PATTERN/,
  'the rare-character/DF and phrase-scaffold heuristics must be removed, not layered over',
);
assert.doesNotMatch(
  domainContinuitySource,
  /const strongMatch = userHit/,
  'a lone generic bigram must not anchor a quote by itself',
);
assert.match(dbSource, /getBoundedRecentMessagesByCharId/);
assert.match(dbSource, /index\.openCursor\(IDBKeyRange\.only\(input\.charId\), 'prev'\)/);
assert.match(dbSource, /maxVisits/);
assert.match(dbSource, /maxRawChars/);
assert.match(dbSource, /visit_budget/);
assert.match(dbSource, /raw_char_budget/);
assert.match(continuityContractSource, /Optional Earlier Verbatim Quotes/);
assert.match(continuityContractSource, /at most three complete/i);
assert.match(continuityContractSource, /one,\s+two or three weeks/);
assert.match(continuityContractSource, /bounded reverse scan/);
assert.match(continuityContractSource, /1,800 cursor visits/);
assert.match(continuityContractSource, /off by default/i);
assert.match(continuityContractSource, /900-message \/ 32,000-character/);
assert.match(continuityContractSource, /900 admitted messages/);
assert.match(continuityContractSource, /never depends on\s+sentence-final punctuation/);
assert.match(continuityContractSource, /intent gate/);
assert.match(continuityContractSource, /true question/);
assert.match(continuityContractSource, /predicate-free\s+noun fragment/);
assert.match(continuityContractSource, /one anchored boundary parser/);
assert.match(continuityContractSource, /no\s+second global deletion grammar/);
assert.match(continuityContractSource, /same clause/);
assert.match(continuityContractSource, /numeric answer/);
assert.match(continuityContractSource, /no domain blacklist/);
assert.match(continuityContractSource, /Deep synonym-only paraphrases/);
assert.match(continuityContractSource, /insertion variant/);
assert.match(continuityContractSource, /returns the match span/);
assert.match(continuityContractSource, /query-middle character/);
assert.match(continuityContractSource, /local fact/);
assert.match(continuityContractSource, /current\/action/);
assert.match(continuityContractSource, /known_local_cross_clause_abstain/);
assert.match(continuityContractSource, /no message-level fallback/);
assert.match(continuityContractSource, /exact receives\s+a higher score than variant/i);
assert.match(continuityContractSource, /no topic\/synonym\s+dictionary/i);

globalThis.fetch = originalFetch;
console.log('conversation continuity contract: OK');
