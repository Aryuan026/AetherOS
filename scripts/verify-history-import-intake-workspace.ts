import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import {
    MAX_HISTORY_PREVIEW_ROWS,
    buildHistoryImportPreview,
} from '../utils/historyImport/parsers/sourcePreview.ts';
import {
    HISTORY_INTAKE_WORKSPACE_DB_NAME,
    HISTORY_INTAKE_WORKSPACE_STORES,
    createHistoryIntakeWorkspaceFromSource,
    deleteHistoryIntakeWorkspaceDatabase,
    getLatestHistoryIntakeWorkspace,
    iterateHistoryIntakeWorkspaceRows,
    openHistoryIntakeWorkspaceDatabase,
} from '../utils/historyImport/storage/intakeWorkspace.ts';

const ROW_COUNT = 1_201;
const T0 = 1_768_406_700_000;
const bindingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: 'intake-fixture-001',
    mask: { id: 'mask-intake', label: '工作台面具', progressBundleId: 'progress-intake' },
    character: { id: 'char-intake', label: '糯米' },
});
const lines = Array.from({ length: ROW_COUNT }, (_, index) => (
    `${index % 2 === 0 ? 'user' : 'assistant'}:第 ${index + 1} 条旧对话\n`
    + `timestamp:2024-05-${String((index % 28) + 1).padStart(2, '0')} 08:00:00`
));
const source = {
    name: 'intake-large.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode(lines.join('\n')),
    bindingDraft,
};

const boundedPreview = await buildHistoryImportPreview(source);
assert.equal(boundedPreview.rows.length, MAX_HISTORY_PREVIEW_ROWS);
assert.equal(boundedPreview.truncated, true);
assert.equal(boundedPreview.totalPreviewRowCount, ROW_COUNT);

await deleteHistoryIntakeWorkspaceDatabase();
const workspace = await createHistoryIntakeWorkspaceFromSource({
    bindingDraft,
    now: T0,
    source: {
        name: source.name,
        mimeType: source.mimeType,
        bytes: source.bytes,
    },
});
assert.equal(workspace.status, 'ready');
assert.equal(workspace.persistedRowCount, ROW_COUNT);
assert.equal(workspace.recordableRowCount, ROW_COUNT);
assert.equal(workspace.counts.uncertain, 0);
assert.equal(workspace.counts.duplicates, 0);
assert.equal('settings' in workspace, false);
assert.equal('decision' in workspace, false);
assert.equal('speakerCandidates' in workspace, false);

const rows = [];
for await (const row of iterateHistoryIntakeWorkspaceRows(workspace.id)) rows.push(row);
assert.equal(rows.length, ROW_COUNT);
assert.deepEqual(rows.slice(0, 4).map(row => row.source.authorChannel), ['user', 'char', 'user', 'char']);
assert.equal(rows.every(row => row.recordable), true);
assert.equal((await getLatestHistoryIntakeWorkspace())?.id, workspace.id);

const database = await openHistoryIntakeWorkspaceDatabase();
try {
    assert.deepEqual(
        Array.from(database.objectStoreNames).sort(),
        Object.values(HISTORY_INTAKE_WORKSPACE_STORES).sort(),
    );
} finally {
    database.close();
}
assert.equal(HISTORY_INTAKE_WORKSPACE_DB_NAME, 'AetherOS_HistoryIntake:v2');

await deleteHistoryIntakeWorkspaceDatabase();
const mixed = await createHistoryIntakeWorkspaceFromSource({
    bindingDraft,
    now: T0 + 10,
    source: {
        name: 'intake-mixed.txt',
        mimeType: 'text/plain',
        bytes: new TextEncoder().encode([
            'user:我把旧聊天带回来了',
            'timestamp:2025-07-16 12:04:35',
            'assistant:我会接住它',
            'timestamp:2025-07-16 12:04:36',
            '（三年后）这段没有作者标签，但仍是原始证据。',
            'user:',
            'timestamp:2025-07-16 12:04:37',
        ].join('\n')),
    },
});
assert.equal(mixed.recordableRowCount, 3);
const mixedRows = [];
for await (const row of iterateHistoryIntakeWorkspaceRows(mixed.id)) mixedRows.push(row);
assert.deepEqual(
    mixedRows.filter(row => row.recordable).map(row => row.source.authorChannel),
    ['user', 'char', undefined],
);
assert.equal(
    mixedRows.find(row => row.source.content.includes('原始证据'))?.source.kind,
    'source_fragment',
);
assert.equal(
    mixedRows.find(row => row.source.issues.includes('empty_content'))?.recordable,
    false,
);

const storageSource = readFileSync(
    new URL('../utils/historyImport/storage/intakeWorkspace.ts', import.meta.url),
    'utf8',
);
for (const required of [
    'AetherOS_HistoryIntake:v2',
    'history_intake_manifests',
    'history_intake_rows',
    'workspace_order',
    "durability: 'strict'",
    'HISTORY_INTAKE_WORKSPACE_WRITE_CHUNK = 500',
]) assert.ok(storageSource.includes(required), `intake workspace must expose ${required}`);

const productSources = [
    '../apps/HistoryImportApp.tsx',
    '../components/history-import/HistorySourceIntake.tsx',
    '../components/history-import/HistoryArchiveCommit.tsx',
    '../domain/historyImport/intakeWorkspace.ts',
    '../domain/historyImport/archiveImport.ts',
    '../utils/historyImport/storage/intakeWorkspace.ts',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
for (const forbidden of [
    'reviewDecision',
    'speakerMappings',
    'sourceMode',
    'timezonePolicy',
    'metadataConfirmedByUser',
    '逐条确认',
    '待确认',
]) assert.equal(productSources.includes(forbidden), false, `intake path must not retain ${forbidden}`);

await deleteHistoryIntakeWorkspaceDatabase();
console.log(`history intake workspace OK: rows=${ROW_COUNT} mixed=${mixed.recordableRowCount}`);
