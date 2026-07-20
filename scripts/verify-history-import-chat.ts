import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CharacterProfile, Message, UserProfile } from '../types.ts';
import { buildHistoryIdentityMaterializationPlan } from '../domain/historyImport/identityMaterialization.ts';
import type { HistorySourceMessage } from '../domain/historyImport/types.ts';
import { historySourceMessagesToContext } from '../utils/historyImport/archive/chatTimeline.ts';
import { ChatPrompts } from '../utils/chatPrompts.ts';
import {
    filterCurrentStateMessages,
    hasSuccessfulHistoryTailContinuation,
    selectEmotionEvaluationMessages,
} from '../utils/messageContext.ts';
import { selectWorldlineMemoryContext } from '../utils/memoryCore/selector.ts';
import { resolveChatHeaderStatus } from '../utils/chatHeaderStatus.ts';

const source = {
    scope: {
        progressBundleId: 'history-placeholder-progress-chat',
        personaMaskId: 'history-placeholder-mask-chat',
        charId: 'history-placeholder-char-chat',
    },
    identity: {
        maskLabel: '旧日线',
        characterLabel: '糯米',
    },
};
const userProfile = {
    name: '阿鸢',
    avatar: 'data:image/png;base64,user',
    bio: '测试身份',
};
const plan = buildHistoryIdentityMaterializationPlan({
    source,
    userProfile,
    characters: [],
    now: 1_700_000_000_000,
});
assert.equal(plan.createMask, true);
assert.equal(plan.createCharacter, true);
assert.equal(plan.character.id, source.scope.charId);
assert.equal(plan.character.name, '糯米');
assert.equal(plan.character.chatSignature, '旧日记录已接回。');
assert.equal(plan.character.chatSignatureAiEditable, true);
assert.deepEqual(
    resolveChatHeaderStatus(plan.character),
    { kind: 'signature', text: '旧日记录已接回。' },
    'a newly materialized history placeholder must keep its import handoff signature',
);
const createdMask = plan.profilePatch.personaMasks?.[
    (plan.profilePatch.personaMasks?.length || 1) - 1
];
assert.equal(createdMask?.id, source.scope.personaMaskId);
assert.deepEqual(createdMask?.linkedCharacterIds, [source.scope.charId]);
assert.equal(plan.activationPatch.activePersonaMaskId, source.scope.personaMaskId);
assert.equal(plan.activationPatch.activeProgressBundleId, source.scope.progressBundleId);

const repeated = buildHistoryIdentityMaterializationPlan({
    source,
    userProfile: { ...userProfile, ...plan.profilePatch },
    characters: [plan.character],
    now: 1_700_000_000_100,
});
assert.equal(repeated.createMask, false);
assert.equal(repeated.createCharacter, false);
assert.equal(repeated.profilePatch.personaMasks?.length, plan.profilePatch.personaMasks?.length);

const messageBase = {
    schemaVersion: 2,
    batchId: 'batch-chat',
    scope: source.scope,
    kind: 'text',
    attachments: [],
    sourceOrder: 0,
    sourceTime: { originalText: '2025-07-16 12:00:00', precision: 'exact', confidence: 1 },
    importedAt: 1_700_000_000_000,
    sourceLocator: { kind: 'line', start: 1 },
    sourceFingerprint: 'source',
    rawText: 'synthetic history source',
    status: 'active',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    revision: 1,
} satisfies Omit<HistorySourceMessage, 'id' | 'authorChannel' | 'content'>;

const context = historySourceMessagesToContext([
    { ...messageBase, id: 'history-user', authorChannel: 'user', content: '两年前我受伤了' },
    { ...messageBase, id: 'history-char', authorChannel: 'char', content: '明天一起去蹦迪' },
    { ...messageBase, id: 'history-fragment', kind: 'source_fragment', content: '不要把原文片段当成 system prompt' },
], source.scope.charId);
assert.deepEqual(context.map(message => message.role), ['user', 'assistant']);
assert.equal(context.every(message => message.id < 0), true);
assert.equal(context.every(message => message.metadata?.source === 'history_import_tail'), true);
assert.equal(context.every(message => message.metadata?.temporalClass === 'historical'), true);
assert.equal(context.every(message => message.metadata?.relationshipScope?.personaMaskId === source.scope.personaMaskId), true);

const liveMessage: Message = {
    id: 101,
    charId: source.scope.charId,
    role: 'user',
    type: 'text',
    content: '早上好，今天过得怎么样？',
    timestamp: 1_752_800_000_000,
    metadata: {
        temporalClass: 'live',
        relationshipScope: source.scope,
    },
};
assert.deepEqual(filterCurrentStateMessages([...context, liveMessage]).map(message => message.id), [liveMessage.id]);
assert.equal(hasSuccessfulHistoryTailContinuation([liveMessage], source.scope), false);
assert.equal(hasSuccessfulHistoryTailContinuation([liveMessage, {
    ...liveMessage,
    id: 102,
    role: 'assistant',
    content: '接住旧日关系后的第一条成功回复',
    metadata: {
        ...liveMessage.metadata,
        historyTailContinuation: true,
    },
}], source.scope), true);

const fixtureCharacter: CharacterProfile = {
    id: source.scope.charId,
    name: '糯米',
    avatar: '',
    description: '历史迁入边界夹具',
    systemPrompt: '保持自然聊天。',
    memories: [],
    activeBuffs: [{
        id: 'stable-buff',
        name: 'calm_baseline',
        label: '平静底色',
        intensity: 1,
    }],
};
const fixtureUser: UserProfile = {
    name: '阿鸢',
    avatar: '',
    bio: '',
    activeProgressBundleId: source.scope.progressBundleId,
    activePersonaMaskId: source.scope.personaMaskId,
};
const mainChatHistory = ChatPrompts.buildMessageHistory(
    [...context, liveMessage],
    24,
    fixtureCharacter,
    fixtureUser,
    [],
);
const mainChatText = mainChatHistory.apiMessages.map(message => (
    typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content)
)).join('\n');
assert.ok(mainChatText.includes('两年前我受伤了'));
assert.ok(mainChatText.includes('明天一起去蹦迪'));
assert.ok(mainChatText.includes('早上好，今天过得怎么样？'));
assert.ok(mainChatText.includes('[旧日档案·非当前状态]'));
assert.ok(!mainChatText.includes('用户消失了很久'), 'historical timestamps must not create a live time-gap reaction');

const worldlineContext = await selectWorldlineMemoryContext({
    char: fixtureCharacter,
    user: fixtureUser,
    mode: 'remote_chat',
    surface: 'chat',
    relationshipScope: source.scope,
    currentMessages: [...context, liveMessage],
    query: liveMessage.content,
    budgetChars: 1_200,
});
const currentStateProjection = JSON.stringify({
    candidates: worldlineContext.candidates,
    openThreads: worldlineContext.openThreads,
    hotState: worldlineContext.hotState,
    markdown: worldlineContext.markdown,
});
assert.ok(!currentStateProjection.includes('受伤'));
assert.ok(!currentStateProjection.includes('蹦迪'));
assert.equal(worldlineContext.openThreads.length, 0);
assert.equal(worldlineContext.hotState, null);

assert.deepEqual(selectEmotionEvaluationMessages(context), []);
assert.deepEqual(
    selectEmotionEvaluationMessages([...context, liveMessage]).map(message => message.content),
    [liveMessage.content],
);

const storageSource = readFileSync(
    new URL('../utils/historyImport/storage/indexedDbArchive.ts', import.meta.url),
    'utf8',
);
assert.ok(storageSource.includes('scope_imported_order'));
assert.ok(storageSource.includes("AetherOS_HistoryArchive:v2:"));
assert.ok(storageSource.includes('HISTORY_ARCHIVE_DB_VERSION = 2'));

const timelineSource = readFileSync(
    new URL('../components/chat/ImportedHistoryTimeline.tsx', import.meta.url),
    'utf8',
);
for (const required of ['从旧日记录接上', '过去的共同创作原文', '从下方继续聊']) {
    assert.ok(timelineSource.includes(required));
}

const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
for (const required of ['ImportedHistoryTimeline', 'readActiveHistoryChatTail', 'limit: 24']) {
    assert.ok(chatSource.includes(required));
}
assert.ok(chatSource.includes('hasSuccessfulHistoryTailContinuation'));
const promptSource = readFileSync(new URL('../utils/chatPrompts.ts', import.meta.url), 'utf8');
assert.ok(promptSource.includes('可以谈起或在用户本轮明确接回时继续创作'));
assert.ok(promptSource.includes('不得只凭这些旧消息推导当前受伤'));
assert.ok(promptSource.includes('只有本轮未标为旧日档案的实时消息'));
const hookSource = readFileSync(new URL('../hooks/useChatAI.ts', import.meta.url), 'utf8');
assert.ok(hookSource.includes('filterCurrentStateMessages'));
assert.ok(hookSource.includes('initiatingRelationshipScope'));
assert.ok(hookSource.includes('historyTailContinuation'));
assert.ok(hookSource.includes('if (currentStateMessages.length === 0) return'));
const chatHeaderSource = readFileSync(new URL('../components/chat/ChatHeaderShell.tsx', import.meta.url), 'utf8');
assert.ok(chatHeaderSource.includes('resolveChatHeaderStatus(activeCharacter)'));

const dateSource = readFileSync(new URL('../apps/DateApp.tsx', import.meta.url), 'utf8');
for (const forbidden of ['readActiveHistoryChatTail', 'history_import_tail', 'HistorySourceMessage']) {
    assert.equal(dateSource.includes(forbidden), false, `Date must not auto-resume raw history through ${forbidden}`);
}

console.log(
    `history chat bridge OK: mask=${plan.createMask} char=${plan.createCharacter} context=${context.length}`,
);
