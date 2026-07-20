import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import {
  activatePreparedHistoryArchiveCandidate,
  prepareHistoryArchiveCandidateFromWorkspace,
} from '../utils/historyImport/archive/importCandidate.ts';
import { pageActiveHistoryChatTimeline } from '../utils/historyImport/archive/chatTimeline.ts';
import { createHistoryIntakeWorkspaceFromSource } from '../utils/historyImport/storage/intakeWorkspace.ts';
import { getActiveHistoryArchive } from '../utils/historyImport/storage/indexedDbArchive.ts';
import {
  activatePreparedHistoryArchiveSystemRestore,
  buildHistoryArchiveSystemBackupFiles,
  prepareHistoryArchiveSystemRestore,
  verifyHistoryArchiveSystemBackupFiles,
} from '../utils/systemBackup/historyArchiveSnapshot.ts';

const sourceFactory = new IDBFactory();
const targetFactory = new IDBFactory();
const scope = {
  progressBundleId: 'golden-progress',
  personaMaskId: 'golden-mask',
  charId: 'golden-char',
};
const bindingDraft = buildHistoryIdentityBindingDraft({
  draftSeed: 'system-backup-fixture',
  mask: { id: scope.personaMaskId, label: '旅人', progressBundleId: scope.progressBundleId },
  character: { id: scope.charId, label: '星河' },
});
const workspace = await createHistoryIntakeWorkspaceFromSource({
  bindingDraft,
  now: Date.parse('2026-07-20T09:00:00+08:00'),
  source: {
    name: 'fictional-history.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode([
      'user:我们第一次在玻璃花房里听雨。',
      'timestamp:2024-05-01 08:00:00',
      'assistant:我把那天折成一枚纸星星收好了。',
      'timestamp:2024-05-01 08:01:00',
    ].join('\n')),
  },
});
const candidate = await prepareHistoryArchiveCandidateFromWorkspace({
  manifest: workspace,
  now: Date.parse('2026-07-20T09:01:00+08:00'),
  factory: sourceFactory,
});
assert.equal(candidate.status, 'candidate_ready');
if (candidate.status !== 'candidate_ready') throw new Error('fixture import candidate was not prepared');
await activatePreparedHistoryArchiveCandidate({
  candidate,
  activatedAt: Date.parse('2026-07-20T09:02:00+08:00'),
  factory: sourceFactory,
});

const backup = await buildHistoryArchiveSystemBackupFiles({
  generatedAt: Date.parse('2026-07-20T09:03:00+08:00'),
  sourceDeviceId: 'fictional-test-device',
  factory: sourceFactory,
});
assert.ok(backup, 'an active raw history archive must join whole-device backup');
assert.equal(backup!.manifest.format, 'aetheros-history-source-json-v1');
assert.ok(backup!.files.length > 0);
const verifiedPayload = await verifyHistoryArchiveSystemBackupFiles(backup!);
assert.equal(verifiedPayload.sections.history_source_messages.length, 2);

const corruptedFiles = backup!.files.map((file, index) => (
  index === 0 ? { ...file, json: `${file.json} ` } : file
));
await assert.rejects(
  () => verifyHistoryArchiveSystemBackupFiles({ manifest: backup!.manifest, files: corruptedFiles }),
  /字节数校验失败/,
);

const prepared = await prepareHistoryArchiveSystemRestore({
  manifest: backup!.manifest,
  files: backup!.files,
  factory: targetFactory,
});
assert.equal(await getActiveHistoryArchive(targetFactory), null, 'verification must not activate the target slot');
const activation = await activatePreparedHistoryArchiveSystemRestore({
  prepared,
  activatedAt: Date.parse('2026-07-20T09:04:00+08:00'),
  factory: targetFactory,
});
assert.equal(activation.activationKind, 'system_backup_restore');
assert.equal(activation.manifestChecksum, backup!.manifest.payloadManifestChecksum);
const restored = await pageActiveHistoryChatTimeline({ scope, limit: 20, factory: targetFactory });
assert.deepEqual(
  restored.items.map(message => message.content),
  ['我们第一次在玻璃花房里听雨。', '我把那天折成一枚纸星星收好了。'],
);

const osContextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
for (const required of [
  'buildHistoryArchiveSystemBackupFiles',
  'backupData.historyArchiveManifest = historyBackup.manifest',
  'prepareHistoryArchiveSystemRestore',
  'activatePreparedHistoryArchiveSystemRestore',
  'discardPreparedHistoryArchiveSystemRestore',
]) assert.ok(osContextSource.includes(required), `whole-device UI path is missing ${required}`);

console.log('history system backup OK: raw source chunks verify before an atomic active-slot switch');
