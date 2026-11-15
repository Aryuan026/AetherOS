import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { APIConfig, Message, MessageRelationshipScope } from '../types.ts';
import {
  CHAT_EARLIER_QUOTE_HEADER,
  CHAT_EARLIER_QUOTE_MAX_CHARS,
  CHAT_EARLIER_QUOTE_MAX_TURNS,
  CONVERSATION_TOKEN_ESTIMATOR_ID,
  CONVERSATION_CONTINUITY_SURFACE_CONTRACTS,
  estimateConversationTokens,
  fingerprintConversationMessages,
  groupConversationTurns,
  planConversationContinuity,
  renderConversationContinuityContext,
} from '../domain/conversationContinuity/index.ts';
import { prepareChatConversationContinuity } from '../utils/conversationContinuity.ts';
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
  metadata: { ...item.metadata, relationshipScope: targetScope },
}));

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
});
assert.equal(quoteFetchCount, fetchBeforeEnabled + 1, 'earlier quote recall must not add a fetch');
assert.equal(enabled.diagnostic.summaryPasses, 1);
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
const isolated = await prepareChatConversationContinuity({
  scope: scopeIsolation,
  messages: [
    ...scopedFor(quoteMessages, scopeIsolation),
    message(201, 'user', '手术记录在另一个面具的珊瑚原话里', {
      relationshipScope: foreignScope,
    }),
    message(202, 'assistant', '另一个面具的珊瑚原话回答', {
      relationshipScope: foreignScope,
    }),
  ],
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
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
const hideBeforeMessages = scopedFor(quoteMessages, hideBeforeScope)
  .filter(item => item.id >= 7);
const hideBeforeResult = await prepareChatConversationContinuity({
  scope: hideBeforeScope,
  messages: hideBeforeMessages,
  promptText: '角色底板',
  messageLimit: 30,
  apiConfig,
  userName: '玩家',
  characterName: '角色',
  earlierQuoteRecall: true,
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
});
assert.match(afterEdit.earlierQuoteMarkdown, /改后原话-绿色文件夹/);
assert.doesNotMatch(afterEdit.earlierQuoteMarkdown, /旧版原话-红色文件夹/);

assert.equal(CHAT_EARLIER_QUOTE_MAX_TURNS, 3);
assert.equal(CHAT_EARLIER_QUOTE_MAX_CHARS, 1_200);
assert.match(CHAT_EARLIER_QUOTE_HEADER, /更早的聊天原话/);
assert.match(CHAT_EARLIER_QUOTE_HEADER, /不是长期记忆/);

const chatRuntimeSource = readFileSync(new URL('../hooks/useChatAI.ts', import.meta.url), 'utf8');
const chatSettingsSource = readFileSync(new URL('../components/chat/ChatModals.tsx', import.meta.url), 'utf8');
const chatAppSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const characterTypeSource = readFileSync(new URL('../types.ts', import.meta.url), 'utf8');
const continuityContractSource = readFileSync(
  new URL('../docs/CONVERSATION_CONTINUITY_CONTRACT.md', import.meta.url),
  'utf8',
);
assert.match(chatRuntimeSource, /prepareChatConversationContinuity/);
assert.match(chatRuntimeSource, /earlierQuoteRecall: char\.earlierQuoteRecallEnabled === true/);
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
assert.match(
  chatAppSource,
  /const \[settingsEarlierQuoteRecall, setSettingsEarlierQuoteRecall\] = useState\(false\)/,
);
assert.match(chatAppSource, /earlierQuoteRecallEnabled: settingsEarlierQuoteRecall/);
assert.match(characterTypeSource, /earlierQuoteRecallEnabled\?: boolean/);
assert.match(continuityContractSource, /Optional Earlier Verbatim Quotes/);
assert.match(continuityContractSource, /at most three complete earlier live turns/);
assert.match(continuityContractSource, /off by default/i);

globalThis.fetch = originalFetch;
console.log('conversation continuity contract: OK');
