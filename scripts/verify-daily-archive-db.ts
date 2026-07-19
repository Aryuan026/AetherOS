import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import type { MessageRelationshipScope, UserProfile } from '../types.ts';
import { DB } from '../utils/db.ts';
import {
    getDailyArchiveDocument,
    listAllDailyArchiveDocuments,
    listAllDailyArchiveMessageRevisions,
    listDailyArchiveMessageRevisions,
    replaceDailyArchiveDocuments,
} from '../utils/dailyArchive/storage.ts';

const runId = `db-scope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const timestamp = new Date(2025, 6, 18, 9, 30, 0).getTime();
const dateKey = '2025-07-18';

const scopeFor = (mask: string, charId: string): MessageRelationshipScope => ({
    progressBundleId: `${runId}-progress-${mask}`,
    personaMaskId: `${runId}-mask-${mask}`,
    charId,
});

const profileFor = (scope: MessageRelationshipScope): UserProfile => ({
    name: '归属测试用户',
    avatar: '',
    bio: '',
    activeProgressBundleId: scope.progressBundleId,
    activePersonaMaskId: scope.personaMaskId,
    personaMasks: [{
        id: scope.personaMaskId,
        label: scope.personaMaskId,
        name: '归属测试用户',
        avatar: '',
        bio: '',
        linkedCharacterIds: [scope.charId],
        progressBundleId: scope.progressBundleId,
        createdAt: timestamp,
        updatedAt: timestamp,
    }],
});

const activate = async (scope: MessageRelationshipScope): Promise<void> => {
    await DB.saveUserProfile(profileFor(scope));
    await DB.getUserProfile();
};

const documentFor = (scope: MessageRelationshipScope) => getDailyArchiveDocument({
    scope,
    dateKey,
});

const scopedMetadata = (scope: MessageRelationshipScope) => ({
    temporalClass: 'live' as const,
    relationshipScope: scope,
});

const editChar = `${runId}-edit-char`;
const editScopeA = scopeFor('A', editChar);
const editScopeB = scopeFor('B', editChar);
await activate(editScopeA);
const editId = await DB.saveMessage({
    charId: editChar,
    role: 'user',
    type: 'text',
    content: '面具 A 的原句',
    timestamp,
    metadata: scopedMetadata(editScopeA),
});
const storedEditMessage = (await DB.getMessagesByCharId(editChar)).find(message => message.id === editId);
assert.deepEqual(storedEditMessage?.metadata?.relationshipScope, editScopeA);
await DB.updateMessageMetadata(editId, { relationshipScope: editScopeB });
const afterMutationAttempt = (await DB.getMessagesByCharId(editChar)).find(message => message.id === editId);
assert.deepEqual(afterMutationAttempt?.metadata?.relationshipScope, editScopeA, 'relationship scope must be immutable');

await activate(editScopeB);
await DB.updateMessage(editId, '面具 A 编辑后的原句');
const editedA = await documentFor(editScopeA);
assert.equal(editedA?.messages.find(message => message.sourceRecordId === String(editId))?.content, '面具 A 编辑后的原句');
assert.equal(editedA?.messages.find(message => message.sourceRecordId === String(editId))?.revision, 2);
assert.equal(await documentFor(editScopeB), null, 'switching masks must not mirror an edit into the active mask');

await DB.deleteMessage(editId);
const deletedA = await documentFor(editScopeA);
assert.equal(deletedA?.messages.find(message => message.sourceRecordId === String(editId))?.status, 'tombstoned');
assert.equal(deletedA?.messageCount, 0);
assert.equal(await documentFor(editScopeB), null, 'switching masks must not mirror a tombstone into the active mask');
const editRevisions = await listDailyArchiveMessageRevisions({ messageId: `live:${editChar}:${editId}` });
assert.deepEqual(editRevisions.map(revision => revision.revision), [1, 2]);
assert.equal(editRevisions[0].message.content, '面具 A 的原句');
assert.equal(editRevisions[1].message.content, '面具 A 编辑后的原句');

const delayedChar = `${runId}-delayed-char`;
const delayedScopeA = scopeFor('A', delayedChar);
const delayedScopeB = scopeFor('B', delayedChar);
await activate(delayedScopeA);
await DB.saveMessage({
    charId: delayedChar,
    role: 'user',
    type: 'text',
    content: '从 A 发起这一轮',
    timestamp: timestamp + 10,
    metadata: scopedMetadata(delayedScopeA),
});
await activate(delayedScopeB);
const delayedReplyId = await DB.saveMessage({
    charId: delayedChar,
    role: 'assistant',
    type: 'text',
    content: '切到 B 后才到达的回复',
    timestamp: timestamp + 20,
    metadata: scopedMetadata(delayedScopeA),
});
const delayedA = await documentFor(delayedScopeA);
assert.ok(delayedA?.messages.some(message => message.sourceRecordId === String(delayedReplyId)));
assert.equal(await documentFor(delayedScopeB), null, 'a delayed reply must retain the initiating relationship scope');

const isolatedChar = `${runId}-isolated-char`;
const isolatedScopeA = scopeFor('A', isolatedChar);
const isolatedScopeB = scopeFor('B', isolatedChar);
await activate(isolatedScopeA);
const isolatedAId = await DB.saveMessage({
    charId: isolatedChar,
    role: 'user',
    type: 'text',
    content: 'A 关系里的话',
    timestamp: timestamp + 30,
    metadata: scopedMetadata(isolatedScopeA),
});
await activate(isolatedScopeB);
const isolatedBId = await DB.saveMessage({
    charId: isolatedChar,
    role: 'user',
    type: 'text',
    content: 'B 关系里的话',
    timestamp: timestamp + 40,
    metadata: scopedMetadata(isolatedScopeB),
});
const isolatedA = await documentFor(isolatedScopeA);
const isolatedB = await documentFor(isolatedScopeB);
assert.deepEqual(isolatedA?.messages.filter(message => message.status === 'active').map(message => message.sourceRecordId), [String(isolatedAId)]);
assert.deepEqual(isolatedB?.messages.filter(message => message.status === 'active').map(message => message.sourceRecordId), [String(isolatedBId)]);

const batchChar = `${runId}-batch-char`;
const batchScopeA = scopeFor('A', batchChar);
const batchScopeB = scopeFor('B', batchChar);
await activate(batchScopeA);
const batchAId = await DB.saveMessage({
    charId: batchChar,
    role: 'user',
    type: 'text',
    content: '批量删除里的 A',
    timestamp: timestamp + 42,
    metadata: scopedMetadata(batchScopeA),
});
await activate(batchScopeB);
const batchBId = await DB.saveMessage({
    charId: batchChar,
    role: 'user',
    type: 'text',
    content: '批量删除里的 B',
    timestamp: timestamp + 44,
    metadata: scopedMetadata(batchScopeB),
});
await DB.deleteMessages([batchAId, batchBId]);
assert.equal((await documentFor(batchScopeA))?.messages.find(message => message.sourceRecordId === String(batchAId))?.status, 'tombstoned');
assert.equal((await documentFor(batchScopeB))?.messages.find(message => message.sourceRecordId === String(batchBId))?.status, 'tombstoned');

await DB.clearMessages(isolatedChar);
const clearedA = await documentFor(isolatedScopeA);
const clearedB = await documentFor(isolatedScopeB);
assert.equal(clearedA?.messages.find(message => message.sourceRecordId === String(isolatedAId))?.status, 'tombstoned');
assert.equal(clearedB?.messages.find(message => message.sourceRecordId === String(isolatedBId))?.status, 'tombstoned');
assert.equal(clearedA?.messageCount, 0);
assert.equal(clearedB?.messageCount, 0);

const unscopedChar = `${runId}-unscoped-char`;
const unscopedScopeB = scopeFor('B', unscopedChar);
await activate(unscopedScopeB);
const unscopedId = await DB.saveMessage({
    charId: unscopedChar,
    role: 'user',
    type: 'text',
    content: '没有关系归属的旧消息',
    timestamp: timestamp + 50,
});
const unscopedStored = (await DB.getMessagesByCharId(unscopedChar)).find(message => message.id === unscopedId);
assert.equal(unscopedStored?.metadata?.relationshipScope, null, 'saveMessage must not infer the active mask');
await DB.updateMessage(unscopedId, '没有关系归属的消息被编辑');
await DB.deleteMessage(unscopedId);
assert.equal(await documentFor(unscopedScopeB), null, 'messages without scope must fail closed');

const backupDocuments = await listAllDailyArchiveDocuments();
const backupRevisions = await listAllDailyArchiveMessageRevisions();
const restoreFactory = new IDBFactory();
await replaceDailyArchiveDocuments({
    documents: backupDocuments,
    revisions: backupRevisions,
    factory: restoreFactory,
});
assert.deepEqual(
    (await listAllDailyArchiveMessageRevisions(restoreFactory)).map(revision => revision.id),
    backupRevisions.map(revision => revision.id),
    'full-device restore must retain superseded source revisions',
);

console.log('daily archive DB integration OK: immutable scopes, revision backup, delayed replies, batch/clear tombstones and unscoped fail-closed');
