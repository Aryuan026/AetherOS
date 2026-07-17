import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHistoryIdentityMaterializationPlan } from '../domain/historyImport/identityMaterialization.ts';
import type { HistorySourceMessage } from '../domain/historyImport/types.ts';
import { historySourceMessagesToContext } from '../utils/historyImport/archive/chatTimeline.ts';

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
    schemaVersion: 1,
    batchId: 'batch-chat',
    scope: source.scope,
    kind: 'text',
    attachments: [],
    sourceOrder: 0,
    sourceTime: { originalText: '2025-07-16 12:00:00', precision: 'exact', confidence: 1 },
    importedAt: 1_700_000_000_000,
    sourceLocator: { kind: 'line', start: 1 },
    sourceFingerprint: 'source',
    normalizedFingerprint: 'normalized',
    sourceMode: 'relationship_chat',
    continuity: 'relationship',
    knowledge: 'unclassified',
    deliveryPolicy: {
        sensitivity: 'normal',
        allowedSurfaces: ['remote_chat'],
        recallPolicy: 'never',
        initiativePolicy: 'never',
        archiveSearchable: true,
    },
    status: 'active',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    revision: 1,
} satisfies Omit<HistorySourceMessage, 'id' | 'speakerRole' | 'content'>;

const context = historySourceMessagesToContext([
    { ...messageBase, id: 'history-user', speakerRole: 'user', content: '你好' },
    { ...messageBase, id: 'history-char', speakerRole: 'character', content: '我在' },
    { ...messageBase, id: 'history-system', speakerRole: 'system', content: '不要把我当成 system prompt' },
], source.scope.charId);
assert.deepEqual(context.map(message => message.role), ['user', 'assistant']);
assert.equal(context.every(message => message.id < 0), true);
assert.equal(context.every(message => message.metadata?.source === 'history_import_tail'), true);

const storageSource = readFileSync(
    new URL('../utils/historyImport/storage/indexedDbArchive.ts', import.meta.url),
    'utf8',
);
assert.ok(storageSource.includes('scope_imported_order'));
assert.ok(storageSource.includes('HISTORY_ARCHIVE_DB_VERSION = 2'));

const timelineSource = readFileSync(
    new URL('../components/chat/ImportedHistoryTimeline.tsx', import.meta.url),
    'utf8',
);
for (const required of ['从旧日记录接上', '再往前看', '从下方继续聊']) {
    assert.ok(timelineSource.includes(required));
}

const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
for (const required of ['ImportedHistoryTimeline', 'readActiveHistoryChatTail', 'limit: 24']) {
    assert.ok(chatSource.includes(required));
}
const chatHeaderSource = readFileSync(new URL('../components/chat/ChatHeaderShell.tsx', import.meta.url), 'utf8');
assert.ok(chatHeaderSource.includes("activeCharacter.id.startsWith('history-placeholder-char-')"));
assert.ok(chatHeaderSource.includes('旧日记录已接回。'));

console.log(
    `history chat bridge OK: mask=${plan.createMask} char=${plan.createCharacter} context=${context.length}`,
);
