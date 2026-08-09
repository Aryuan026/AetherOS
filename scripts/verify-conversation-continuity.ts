import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { APIConfig, Message, MessageRelationshipScope } from '../types.ts';
import {
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

const chatRuntimeSource = readFileSync(new URL('../hooks/useChatAI.ts', import.meta.url), 'utf8');
const chatSettingsSource = readFileSync(new URL('../components/chat/ChatModals.tsx', import.meta.url), 'utf8');
assert.match(chatRuntimeSource, /prepareChatConversationContinuity/);
assert.match(chatRuntimeSource, /continuity\.markdown/);
assert.match(chatRuntimeSource, /Math\.max\(1, contextMsgs\.length\)/);
assert.match(chatSettingsSource, /接续整理上限/);
assert.match(chatSettingsSource, /保留最近 10 轮原文/);

globalThis.fetch = originalFetch;
console.log('conversation continuity contract: OK');
