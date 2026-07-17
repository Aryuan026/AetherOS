import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buildHistoryArchiveImportPlan,
    streamHistorySourceMessagesFromReview,
} from '../domain/historyImport/archiveImport.ts';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import {
    createHistoryReviewWorkspaceManifest,
    createHistoryReviewWorkspaceRow,
    freezeHistoryReviewWorkspaceDecision,
    type HistoryReviewWorkspaceManifest,
    type HistoryReviewWorkspaceRowRecord,
} from '../domain/historyImport/reviewWorkspace.ts';
import type { HistorySpeakerMapping } from '../domain/historyImport/types.ts';
import { buildHistoryImportFullPreview } from '../utils/historyImport/parsers/sourcePreview.ts';

const T0 = 1_768_406_800_000;
const bindingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: 'archive-import-fixture',
    mask: { id: 'mask-archive', label: '阿鸢', progressBundleId: 'progress-archive' },
    character: { id: 'char-archive', label: '糯米' },
});
const preview = await buildHistoryImportFullPreview({
    name: 'archive-import.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode([
        '[2024-05-01 08:00] 阿鸢：第一句',
        '[2024-05-01 08:01] 阿鸢：接在上一句后面',
        '[2024-05-01 08:02] 糯米：这一句排除',
        '[2024-05-01 08:03] 糯米：最后一句',
    ].join('\n')),
    bindingDraft,
});
assert.equal(preview.rows.length, 4);

const created = createHistoryReviewWorkspaceManifest({ preview, bindingDraft, now: T0 });
const mappings: HistorySpeakerMapping[] = preview.speakerCandidates.map(candidate => ({
    sourceLabel: candidate.label,
    role: candidate.label === '阿鸢' ? 'user' : 'character',
    targetId: candidate.label === '阿鸢' ? preview.scope.personaMaskId : preview.scope.charId,
    confidence: 1,
    confirmedByUser: true,
}));
const reviewing: HistoryReviewWorkspaceManifest = {
    ...created,
    status: 'reviewing',
    persistedRowCount: preview.rows.length,
    settings: {
        sourceMode: 'relationship_chat',
        timezonePolicy: 'source',
        metadataConfirmedByUser: true,
        speakerMappings: mappings,
    },
};
const rows = preview.rows.map(source => createHistoryReviewWorkspaceRow({
    workspaceId: reviewing.id,
    source,
    now: T0,
}));
rows[1] = {
    ...rows[1],
    source: {
        ...rows[1].source,
        previousMeaningfulRowId: rows[0].source.id,
        issues: [...rows[1].source.issues, 'possible_continuation'],
    },
    review: {
        ...rows[1].review,
        resolution: 'merged',
        mergeIntoRowId: rows[0].source.id,
    },
    bucket: 'excluded',
    attentionKey: 0,
};
rows[2] = {
    ...rows[2],
    review: { ...rows[2].review, resolution: 'excluded' },
    bucket: 'excluded',
    attentionKey: 0,
};

const asAsync = async function* (
    values: HistoryReviewWorkspaceRowRecord[],
): AsyncGenerator<HistoryReviewWorkspaceRowRecord> {
    for (const value of values) yield JSON.parse(JSON.stringify(value)) as HistoryReviewWorkspaceRowRecord;
};

const decision = await freezeHistoryReviewWorkspaceDecision({
    manifest: reviewing,
    records: asAsync(rows),
});
assert.deepEqual(decision.counts, { included: 2, excluded: 1, merged: 1, edited: 0 });
const complete: HistoryReviewWorkspaceManifest = {
    ...reviewing,
    status: 'review_complete',
    decision,
};
const plan = await buildHistoryArchiveImportPlan({ manifest: complete, now: T0 + 1 });
const messages = [];
for await (const message of streamHistorySourceMessagesFromReview({
    plan,
    manifest: complete,
    records: asAsync(rows),
    importedAt: T0 + 2,
})) messages.push(message);

assert.equal(messages.length, 2);
assert.equal(messages[0].content, '第一句\n接在上一句后面');
assert.equal(messages[0].sourceFragments?.length, 2);
assert.equal(messages[0].sourceFragments?.[1].rowId, rows[1].source.id);
assert.equal(messages.some(message => message.content.includes('这一句排除')), false);
assert.equal(messages.every(message => message.deliveryPolicy.archiveSearchable), true);
assert.equal(messages.every(message => message.deliveryPolicy.recallPolicy === 'never'), true);
assert.equal(messages.every(message => message.continuity === 'relationship'), true);

const repeated = [];
for await (const message of streamHistorySourceMessagesFromReview({
    plan,
    manifest: complete,
    records: asAsync(rows),
    importedAt: T0 + 99,
})) repeated.push(message);
assert.deepEqual(repeated.map(message => message.id), messages.map(message => message.id));
assert.deepEqual(
    repeated.map(message => message.sourceFingerprint),
    messages.map(message => message.sourceFingerprint),
);
assert.deepEqual(
    repeated.map(message => message.normalizedFingerprint),
    messages.map(message => message.normalizedFingerprint),
);

const editedRows = rows.map(row => JSON.parse(JSON.stringify(row)) as HistoryReviewWorkspaceRowRecord);
editedRows[0] = {
    ...editedRows[0],
    review: {
        ...editedRows[0].review,
        resolution: 'edited',
        content: '第一句（人工修正）',
    },
};
const editedDecision = await freezeHistoryReviewWorkspaceDecision({
    manifest: reviewing,
    records: asAsync(editedRows),
});
const editedManifest: HistoryReviewWorkspaceManifest = {
    ...reviewing,
    status: 'review_complete',
    decision: editedDecision,
};
const editedPlan = await buildHistoryArchiveImportPlan({ manifest: editedManifest, now: T0 + 3 });
const editedMessages = [];
for await (const message of streamHistorySourceMessagesFromReview({
    plan: editedPlan,
    manifest: editedManifest,
    records: asAsync(editedRows),
    importedAt: T0 + 4,
})) editedMessages.push(message);
assert.equal(editedPlan.batch.id, plan.batch.id);
assert.notEqual(editedPlan.decisionFingerprint, plan.decisionFingerprint);
assert.equal(editedMessages[0].id, messages[0].id);
assert.equal(editedMessages[0].sourceFingerprint, messages[0].sourceFingerprint);
assert.notEqual(editedMessages[0].normalizedFingerprint, messages[0].normalizedFingerprint);

const storageSource = readFileSync(
    new URL('../utils/historyImport/storage/indexedDbArchive.ts', import.meta.url),
    'utf8',
);
for (const required of [
    'AetherOS_HistoryArchive:v1:',
    'AetherOS_HistoryArchive_Control',
    'HISTORY_ARCHIVE_MAX_CHUNK_RECORDS = 500',
    "durability: 'strict'",
    'retainedPreviousDatabaseIds',
    'lastVerifiedBackupReceipt',
    'activateImportedHistoryArchive',
    "activationKind: 'import_commit'",
    'refusing to delete the active history archive database',
    'active history archive changed while the rescue was being verified',
]) {
    assert.ok(storageSource.includes(required), `formal archive storage must expose ${required}`);
}
for (const forbidden of [
    '.getAll(',
    "open('AetherOS_Data'",
    'localStorage',
    'sessionStorage',
    'fetch(',
]) {
    assert.equal(storageSource.includes(forbidden), false, `formal archive storage must avoid ${forbidden}`);
}

const rescueSource = readFileSync(
    new URL('../utils/systemBackup/historyArchiveRescue.ts', import.meta.url),
    'utf8',
);
for (const required of [
    'confirmHistoryBackupExternalSave',
    'createHistoryTemporaryRestorePlan',
    'restoreAndVerifyHistoryArchiveDatabase',
    'markHistoryBackupRestoreVerified',
    'activateVerifiedHistoryArchive',
]) {
    assert.ok(rescueSource.includes(required), `formal rescue flow must expose ${required}`);
}
assert.ok(rescueSource.includes('Historical conversation import must not call this module'));

const commitSource = readFileSync(
    new URL('../components/history-import/HistoryArchiveCommit.tsx', import.meta.url),
    'utf8',
);
for (const required of [
    'activatePreparedHistoryArchiveCandidate',
    '导入本机',
    '不会上传',
]) {
    assert.ok(commitSource.includes(required), `history import commit UI must expose ${required}`);
}
for (const forbidden of [
    'createHistoryArchiveRescue',
    'recoverySecret',
    '下载加密救援文件',
    '选择刚下载的救援文件',
]) {
    assert.equal(commitSource.includes(forbidden), false, `history import commit UI must avoid ${forbidden}`);
}

console.log(
    `history archive mapping OK: source=${rows.length} committed=${messages.length} merged=${messages[0].sourceFragments?.length}`,
);
