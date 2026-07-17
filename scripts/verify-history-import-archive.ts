import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import {
    buildHistoryArchiveImportPlan,
    streamHistorySourceMessagesFromIntake,
} from '../domain/historyImport/archiveImport.ts';
import { HISTORY_IMPORT_STORE_NAMES } from '../domain/historyImport/contract.ts';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import {
    createHistoryIntakeWorkspaceManifest,
    createHistoryIntakeWorkspaceRow,
    type HistoryIntakeWorkspaceManifest,
    type HistoryIntakeWorkspaceRowRecord,
} from '../domain/historyImport/intakeWorkspace.ts';
import type { HistorySourceMessage } from '../domain/historyImport/types.ts';
import {
    activatePreparedHistoryArchiveCandidate,
    prepareHistoryArchiveCandidateFromWorkspace,
} from '../utils/historyImport/archive/importCandidate.ts';
import { buildHistoryImportFullPreview } from '../utils/historyImport/parsers/sourcePreview.ts';
import {
    getActiveHistoryArchive,
    openHistoryArchiveDatabase,
    readHistoryArchiveSections,
} from '../utils/historyImport/storage/indexedDbArchive.ts';
import {
    createHistoryIntakeWorkspaceFromSource,
    deleteHistoryIntakeWorkspaceDatabase,
} from '../utils/historyImport/storage/intakeWorkspace.ts';

const T0 = 1_768_406_800_000;
const bindingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: 'archive-intake-fixture',
    mask: { id: 'mask-archive', label: '阿鸢', progressBundleId: 'progress-archive' },
    character: { id: 'char-archive', label: '糯米' },
});
const preview = await buildHistoryImportFullPreview({
    name: 'archive-intake.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode([
        'user:（拉住 A 的手腕）没关系啦，小 C 也没说什么呀，对吧 B',
        'timestamp:2024-05-01 08:00:00',
        'assistant:（将你拉向一边）B，你去看看 C 怎么样了',
        'timestamp:2024-05-01 08:01:00',
        '三年后，这段没有作者标记的场景说明仍要保留。',
        'user:',
        'timestamp:2024-05-01 08:02:00',
    ].join('\n')),
    bindingDraft,
});
const preparing = createHistoryIntakeWorkspaceManifest({ preview, bindingDraft, now: T0 });
const manifest: HistoryIntakeWorkspaceManifest = {
    ...preparing,
    status: 'ready',
    persistedRowCount: preview.rows.length,
};
const rows = preview.rows.map(source => createHistoryIntakeWorkspaceRow({
    workspaceId: manifest.id,
    source,
    now: T0,
}));

const asAsync = async function* (
    values: HistoryIntakeWorkspaceRowRecord[],
): AsyncGenerator<HistoryIntakeWorkspaceRowRecord> {
    for (const value of values) yield JSON.parse(JSON.stringify(value)) as HistoryIntakeWorkspaceRowRecord;
};

const plan = await buildHistoryArchiveImportPlan({ manifest, now: T0 + 1 });
const messages = [];
for await (const message of streamHistorySourceMessagesFromIntake({
    plan,
    manifest,
    records: asAsync(rows),
    importedAt: T0 + 2,
})) messages.push(message);

assert.equal(messages.length, 3);
assert.deepEqual(messages.map(message => message.authorChannel), ['user', 'char', undefined]);
assert.equal(messages[0].content.includes('小 C'), true);
assert.equal(messages[1].content.includes('B，你去看看 C'), true);
assert.equal(messages[2].kind, 'source_fragment');
assert.equal(messages[2].content, '三年后，这段没有作者标记的场景说明仍要保留。');
assert.equal(messages.every(message => message.rawText.length > 0), true);
assert.equal(messages.some(message => message.content === ''), false);
assert.equal(plan.batch.intakeFingerprint, manifest.intakeFingerprint);
assert.equal('sourceMode' in plan.batch, false);
assert.equal('timezonePolicy' in plan.batch, false);
assert.equal('speakerMappings' in plan.batch, false);
assert.equal('reviewDecisionId' in plan.batch, false);

const repeated = [];
for await (const message of streamHistorySourceMessagesFromIntake({
    plan,
    manifest,
    records: asAsync(rows),
    importedAt: T0 + 99,
})) repeated.push(message);
assert.deepEqual(repeated.map(message => message.id), messages.map(message => message.id));
assert.deepEqual(repeated.map(message => message.sourceFingerprint), messages.map(message => message.sourceFingerprint));

const storageSource = readFileSync(
    new URL('../utils/historyImport/storage/indexedDbArchive.ts', import.meta.url),
    'utf8',
);
for (const required of [
    'AetherOS_HistoryArchive:v2:',
    'AetherOS_HistoryArchive_Control:v2',
    'HISTORY_ARCHIVE_MAX_CHUNK_RECORDS = 500',
    "durability: 'strict'",
    'retainedPreviousDatabaseIds',
    'activateImportedHistoryArchive',
]) {
    assert.ok(storageSource.includes(required), `formal archive storage must expose ${required}`);
}
for (const forbidden of [
    "open('AetherOS_Data'",
    'AetherOS_HistoryArchive:v1:',
    'localStorage',
    'sessionStorage',
    'fetch(',
]) {
    assert.equal(storageSource.includes(forbidden), false, `formal archive storage must avoid ${forbidden}`);
}

const commitSource = readFileSync(
    new URL('../components/history-import/HistoryArchiveCommit.tsx', import.meta.url),
    'utf8',
);
for (const required of ['activatePreparedHistoryArchiveCandidate', '导入本机', '不会上传']) {
    assert.ok(commitSource.includes(required), `history import commit UI must expose ${required}`);
}
for (const forbidden of ['recoverySecret', '下载加密救援文件', '选择刚下载的救援文件']) {
    assert.equal(commitSource.includes(forbidden), false, `history import commit UI must avoid ${forbidden}`);
}

for (const required of [
    'onWorkspaceSettled',
    'openChat: false',
    '这份文件已经导入过，没有重复写入',
]) {
    assert.ok(commitSource.includes(required), `settled intake UI must expose ${required}`);
}

const appSource = readFileSync(
    new URL('../apps/HistoryImportApp.tsx', import.meta.url),
    'utf8',
);
for (const required of [
    '同一段关系可以分多次追加',
    'onWorkspaceSettled={settleWorkspace}',
    'deleteHistoryIntakeWorkspace(workspaceId)',
]) {
    assert.ok(appSource.includes(required), `repeatable import entry must expose ${required}`);
}

await deleteHistoryIntakeWorkspaceDatabase();
const archiveFactory = new IDBFactory();
const makeWorkspace = async (input: {
    name: string;
    binding: ReturnType<typeof buildHistoryIdentityBindingDraft>;
    lines: string[];
    now: number;
}) => createHistoryIntakeWorkspaceFromSource({
    bindingDraft: input.binding,
    now: input.now,
    source: {
        name: input.name,
        mimeType: 'text/plain',
        bytes: new TextEncoder().encode(input.lines.join('\n')),
    },
});
const activateWorkspace = async (
    nextWorkspace: HistoryIntakeWorkspaceManifest,
    now: number,
) => {
    const candidate = await prepareHistoryArchiveCandidateFromWorkspace({
        manifest: nextWorkspace,
        now,
        factory: archiveFactory,
    });
    if (candidate.status !== 'candidate_ready') {
        throw new Error(`expected a new candidate for ${nextWorkspace.sourceFile.name}`);
    }
    await activatePreparedHistoryArchiveCandidate({
        candidate,
        activatedAt: now + 1,
        factory: archiveFactory,
    });
    return candidate;
};

const firstWorkspace = await makeWorkspace({
    name: 'same-relation-part-1.txt',
    binding: bindingDraft,
    lines: [
        'user:第一份从这里开始',
        'timestamp:2024-05-01 08:00:00',
        'assistant:我接住第一份',
        'timestamp:2024-05-01 08:01:00',
    ],
    now: T0 + 100,
});
await activateWorkspace(firstWorkspace, T0 + 101);

const secondWorkspace = await makeWorkspace({
    name: 'same-relation-part-2.txt',
    binding: bindingDraft,
    lines: [
        'user:这是同一段关系的第二份',
        'timestamp:2024-05-02 08:00:00',
        'assistant:原来的第一份也要留下',
        'timestamp:2024-05-02 08:01:00',
    ],
    now: T0 + 200,
});
await activateWorkspace(secondWorkspace, T0 + 201);

const otherBinding = buildHistoryIdentityBindingDraft({
    draftSeed: 'archive-other-scope',
    mask: { id: 'mask-other', label: '另一面具', progressBundleId: 'progress-other' },
    character: { id: 'char-other', label: '另一角色' },
});
const thirdWorkspace = await makeWorkspace({
    name: 'other-relation.txt',
    binding: otherBinding,
    lines: [
        'user:这是另一组面具和角色的记录',
        'timestamp:2024-05-03 08:00:00',
    ],
    now: T0 + 300,
});
await activateWorkspace(thirdWorkspace, T0 + 301);

const active = await getActiveHistoryArchive(archiveFactory);
assert.ok(active);
const activeDatabase = await openHistoryArchiveDatabase(active.activeDatabaseId, archiveFactory);
const activeSections = await readHistoryArchiveSections(activeDatabase);
activeDatabase.close();
assert.equal(activeSections[HISTORY_IMPORT_STORE_NAMES.batches].length, 3);
assert.equal(activeSections[HISTORY_IMPORT_STORE_NAMES.sourceMessages].length, 5);
const activeMessages = activeSections[HISTORY_IMPORT_STORE_NAMES.sourceMessages] as HistorySourceMessage[];
assert.deepEqual(
    new Set(activeMessages.map(message => message.scope.progressBundleId)),
    new Set(['progress-archive', 'progress-other']),
);
assert.equal(activeMessages.some(message => message.content.includes('第一份从这里开始')), true);
assert.equal(activeMessages.some(message => message.content.includes('同一段关系的第二份')), true);

const duplicate = await prepareHistoryArchiveCandidateFromWorkspace({
    manifest: firstWorkspace,
    now: T0 + 400,
    factory: archiveFactory,
});
assert.equal(duplicate.status, 'already_imported');
assert.equal(duplicate.sourceMessageCount, 2);
assert.equal((await getActiveHistoryArchive(archiveFactory))?.activeDatabaseId, active.activeDatabaseId);

await deleteHistoryIntakeWorkspaceDatabase();

console.log(`history archive intake OK: source=${rows.length} committed=${messages.length} repeatable=3 batches/2 scopes`);
