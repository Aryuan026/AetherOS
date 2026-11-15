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
} from '../domain/conversationContinuity/index.ts';
import {
  buildEarlierQuoteRecallTurns,
  readEarlierQuoteRecallWindow,
  prepareChatConversationContinuity,
  type EarlierQuoteRecallWindow,
} from '../utils/conversationContinuity.ts';
import { DB } from '../utils/db.ts';
import { ChatPrompts } from '../utils/chatPrompts.ts';

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
assert.equal(CHAT_EARLIER_QUOTE_SCAN_MAX_MESSAGES, 300);
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
assert.ok(denseWindow.turns.length < 200, 'ten thousand rows must not become an unbounded window');

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
assert.match(dbSource, /getBoundedRecentMessagesByCharId/);
assert.match(dbSource, /index\.openCursor\(IDBKeyRange\.only\(input\.charId\), 'prev'\)/);
assert.match(continuityContractSource, /Optional Earlier Verbatim Quotes/);
assert.match(continuityContractSource, /at most three complete/i);
assert.match(continuityContractSource, /one,\s+two or three weeks/);
assert.match(continuityContractSource, /bounded reverse scan/);
assert.match(continuityContractSource, /off by default/i);

globalThis.fetch = originalFetch;
console.log('conversation continuity contract: OK');
