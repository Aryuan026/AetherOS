import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import {
    HISTORY_REVIEW_DECISION_CHUNK_ROWS,
    assessHistoryReviewWorkspace,
    createHistoryReviewWorkspaceManifest,
    createHistoryReviewWorkspaceRow,
    freezeHistoryReviewWorkspaceDecision,
    type HistoryReviewWorkspaceManifest,
    type HistoryReviewWorkspaceRowRecord,
} from '../domain/historyImport/reviewWorkspace.ts';
import type { HistorySpeakerMapping } from '../domain/historyImport/types.ts';
import {
    MAX_HISTORY_PREVIEW_ROWS,
    buildHistoryImportFullPreview,
    buildHistoryImportPreview,
} from '../utils/historyImport/parsers/sourcePreview.ts';

const ROW_COUNT = 1_201;
const T0 = 1_768_406_700_000;
const bindingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: 'workspace-fixture-001',
    mask: {
        id: 'mask-workspace',
        label: '工作台面具',
        progressBundleId: 'progress-workspace',
    },
    character: { id: 'char-workspace', label: '糯米' },
});
const lines = Array.from({ length: ROW_COUNT }, (_, index) => (
    `[2024-05-01 08:${(index % 60).toString().padStart(2, '0')}] ${index % 2 === 0 ? '阿鸢' : '糯米'}：第 ${index + 1} 条旧对话`
));
const source = {
    name: 'workspace-large.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode(lines.join('\n')),
    bindingDraft,
};

const boundedPreview = await buildHistoryImportPreview(source);
assert.equal(boundedPreview.rows.length, MAX_HISTORY_PREVIEW_ROWS);
assert.equal(boundedPreview.truncated, true);
assert.equal(boundedPreview.totalPreviewRowCount, ROW_COUNT);

const fullPreview = await buildHistoryImportFullPreview(source);
assert.equal(fullPreview.rows.length, ROW_COUNT);
assert.equal(fullPreview.materializedRowCount, ROW_COUNT);
assert.equal(fullPreview.truncated, false);
assert.equal(fullPreview.rows[1].previousMeaningfulRowId, undefined);

const createdManifest = createHistoryReviewWorkspaceManifest({
    preview: fullPreview,
    bindingDraft,
    now: T0,
});
const mappings: HistorySpeakerMapping[] = fullPreview.speakerCandidates.map(candidate => ({
    sourceLabel: candidate.label,
    role: candidate.label === '阿鸢' ? 'user' : 'character',
    targetId: candidate.label === '阿鸢'
        ? fullPreview.scope.personaMaskId
        : fullPreview.scope.charId,
    confidence: 1,
    confirmedByUser: true,
}));
const manifest: HistoryReviewWorkspaceManifest = {
    ...createdManifest,
    status: 'reviewing',
    persistedRowCount: ROW_COUNT,
    settings: {
        sourceMode: 'relationship_chat',
        timezonePolicy: 'source',
        metadataConfirmedByUser: true,
        speakerMappings: mappings,
    },
    revision: createdManifest.revision + 4,
};
const records = fullPreview.rows.map(sourceRow => createHistoryReviewWorkspaceRow({
    workspaceId: manifest.id,
    source: sourceRow,
    now: T0,
}));
assert.equal(records.every(record => record.attentionKey === 0), true);

const asAsyncPages = async function* (
    values: HistoryReviewWorkspaceRowRecord[],
    pageSize: number,
    serializeBetweenPages = false,
): AsyncGenerator<HistoryReviewWorkspaceRowRecord> {
    for (let offset = 0; offset < values.length; offset += pageSize) {
        const page = values.slice(offset, offset + pageSize);
        const restored = serializeBetweenPages
            ? JSON.parse(JSON.stringify(page)) as HistoryReviewWorkspaceRowRecord[]
            : page;
        for (const record of restored) yield record;
        await Promise.resolve();
    }
};

const uninterrupted = await freezeHistoryReviewWorkspaceDecision({
    manifest,
    records: asAsyncPages(records, ROW_COUNT),
});
const legacyUncheckedManifest: HistoryReviewWorkspaceManifest = {
    ...manifest,
    settings: {
        ...manifest.settings,
        metadataConfirmedByUser: false,
    },
};
const legacyUncheckedAssessment = assessHistoryReviewWorkspace({
    manifest: legacyUncheckedManifest,
    attentionRows: 0,
    includedRows: ROW_COUNT,
    excludedRows: 0,
});
assert.equal(
    legacyUncheckedAssessment.canComplete,
    true,
    'obsolete source-context consent state must not block a complete workspace',
);
const legacyUnchecked = await freezeHistoryReviewWorkspaceDecision({
    manifest: legacyUncheckedManifest,
    records: asAsyncPages(records, 211, true),
});
const resumed = await freezeHistoryReviewWorkspaceDecision({
    manifest: JSON.parse(JSON.stringify(manifest)) as HistoryReviewWorkspaceManifest,
    records: asAsyncPages(records, 137, true),
});
assert.equal(uninterrupted.fingerprint, resumed.fingerprint);
assert.equal(uninterrupted.fingerprint, legacyUnchecked.fingerprint);
assert.equal(uninterrupted.id, resumed.id);
assert.deepEqual(uninterrupted.chunkDigests, resumed.chunkDigests);
assert.equal(uninterrupted.chunkRowLimit, HISTORY_REVIEW_DECISION_CHUNK_ROWS);
assert.equal(uninterrupted.chunkDigests.length, 3);
assert.equal(uninterrupted.totalRowCount, ROW_COUNT);
assert.equal(uninterrupted.counts.included, ROW_COUNT);
assert.equal(uninterrupted.counts.excluded, 0);
assert.equal(uninterrupted.counts.merged, 0);
assert.equal(uninterrupted.persistence, 'indexeddb_workspace');
assert.equal(uninterrupted.productionWriteAllowed, false);

const pendingRecords = records.map(record => ({ ...record, review: { ...record.review } }));
pendingRecords[700] = {
    ...pendingRecords[700],
    review: { ...pendingRecords[700].review, resolution: 'pending' },
    bucket: 'pending',
    attentionKey: 1,
};
await assert.rejects(
    freezeHistoryReviewWorkspaceDecision({
        manifest,
        records: asAsyncPages(pendingRecords, 89, true),
    }),
    /仍未确认/,
);

const reversed = [...records];
[reversed[500], reversed[501]] = [reversed[501], reversed[500]];
await assert.rejects(
    freezeHistoryReviewWorkspaceDecision({
        manifest,
        records: asAsyncPages(reversed, 101),
    }),
    /顺序必须严格递增/,
);

const storageSource = readFileSync(
    new URL('../utils/historyImport/storage/reviewWorkspace.ts', import.meta.url),
    'utf8',
);
for (const required of [
    "AetherOS_HistoryImport_Workspace",
    "review_workspaces",
    "review_workspace_rows",
    "workspace_order",
    "workspace_bucket_order",
    "workspace_attention_order",
    "durability: 'strict'",
    'HISTORY_REVIEW_WORKSPACE_WRITE_CHUNK = 500',
]) {
    assert.ok(storageSource.includes(required), `review workspace storage must expose ${required}`);
}
for (const forbidden of [
    "from '../../db'",
    "from '../../../db'",
    'AetherOS_Data',
    "objectStore('messages')",
    'localStorage',
    'sessionStorage',
    'fetch(',
]) {
    assert.equal(storageSource.includes(forbidden), false, `review workspace must avoid ${forbidden}`);
}

const pagedReviewSource = readFileSync(
    new URL('../components/history-import/HistoryPagedReview.tsx', import.meta.url),
    'utf8',
);
assert.ok(pagedReviewSource.includes('workspace.counts.parsed'));
assert.ok(pagedReviewSource.includes('workspace.counts.skipped'));
assert.ok(pagedReviewSource.includes('自动忽略'));
assert.ok(pagedReviewSource.includes('record.source.sourceTime.originalText'));

console.log(
    `history review workspace OK: rows=${ROW_COUNT} preview=${MAX_HISTORY_PREVIEW_ROWS} chunks=${uninterrupted.chunkDigests.length} resumed=${uninterrupted.fingerprint === resumed.fingerprint}`,
);
