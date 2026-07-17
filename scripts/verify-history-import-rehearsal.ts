import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    advanceHistoryRecoverySecretHandoff,
    confirmHistoryBackupExternalSave,
    markHistoryBackupRestoreVerified,
} from '../domain/historyImport/backupReceipt.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
    HistoryRescueError,
} from '../domain/historyImport/rescue.ts';
import {
    createHistoryTemporaryRestorePlan,
    verifyHistoryTemporaryRestore,
} from '../utils/historyImport/backup/rescueArchive.ts';
import {
    createHistoryRescueRehearsal,
    requestHistoryRescueRehearsalDownload,
    validateHistoryRescueRehearsalExternalArchive,
} from '../utils/historyImport/backup/rescueRehearsal.ts';
import {
    HISTORY_INDEXEDDB_LAB_PREFIX,
} from '../utils/historyImport/storage/indexedDbLab.ts';

const T0 = 1_768_407_200_000;
const NONCE = 'stage-0-8-contract';

const created = await createHistoryRescueRehearsal({ now: T0, nonce: NONCE });
assert.equal(created.artifact.kind, 'empty_synthetic_rehearsal');
assert.equal(created.artifact.envelope.encryptedChunkCount, 0);
assert.equal(created.artifact.envelope.encryptedChunks.length, 0);
assert.equal(created.artifact.fileName, 'aetheros-history-empty-rehearsal-2026-01-14T16-13-20-000Z');
assert.equal(created.artifact.liveDatabaseId.startsWith(HISTORY_INDEXEDDB_LAB_PREFIX), true);
assert.equal(created.artifact.temporaryDatabaseId.startsWith(HISTORY_INDEXEDDB_LAB_PREFIX), true);
assert.notEqual(created.artifact.liveDatabaseId, created.artifact.temporaryDatabaseId);
assert.equal(Object.keys(created.artifact.recordCounts).length, HISTORY_RESCUE_STORE_ORDER.length);
assert.equal(Object.values(created.artifact.recordCounts).every(count => count === 0), true);
assert.equal(created.receipt.status, 'generated');
assert.equal(created.receipt.externalCopyConfirmed, false);
assert.equal(created.receipt.recoverySecretHandoff, 'presented_once');
assert.equal(created.artifact.serializedArchive.includes(created.recoverySecret), false);
assert.equal(JSON.stringify(created.receipt).includes(created.recoverySecret), false);
assert.equal(created.artifact.serializedArchive.includes(`synthetic-ui-rehearsal-${NONCE}`), false);
assert.equal(
    validateHistoryRescueRehearsalExternalArchive({
        artifact: created.artifact,
        serializedArchive: created.artifact.serializedArchive,
    }).archiveId,
    created.artifact.envelope.archiveId,
);

const otherRehearsal = await createHistoryRescueRehearsal({
    now: T0,
    nonce: `${NONCE}-other`,
});
assert.throws(
    () => validateHistoryRescueRehearsalExternalArchive({
        artifact: created.artifact,
        serializedArchive: otherRehearsal.artifact.serializedArchive,
    }),
    /does not belong to this rehearsal/,
);

await assert.rejects(
    () => createHistoryTemporaryRestorePlan({
        envelope: created.artifact.envelope,
        recoverySecret: 'wrong-rehearsal-secret-0000000000',
        liveDatabaseId: created.artifact.liveDatabaseId,
        temporaryDatabaseId: created.artifact.temporaryDatabaseId,
    }),
    (error: unknown) => error instanceof HistoryRescueError && error.code === 'decryption_failed',
);

let downloadCount = 0;
let downloadedName = '';
let downloadedSize = 0;
const downloadRequested = requestHistoryRescueRehearsalDownload({
    artifact: created.artifact,
    receipt: created.receipt,
    now: T0 + 1,
    environment: {
        triggerDownload: (blob, fileName) => {
            downloadCount += 1;
            downloadedName = fileName;
            downloadedSize = blob.size;
        },
    },
});
assert.equal(downloadCount, 1);
assert.equal(downloadedName.endsWith('.aetherrescue'), true);
assert.equal(downloadedSize > 0, true);
assert.equal(downloadRequested.status, 'generated');
assert.equal(downloadRequested.externalCopyConfirmed, false);
assert.equal(downloadRequested.lastDeliveryAttempt?.outcome, 'confirmation_required');

const externallySaved = confirmHistoryBackupExternalSave(downloadRequested, T0 + 2);
const secretHeld = advanceHistoryRecoverySecretHandoff(
    externallySaved,
    'user_confirmed',
    T0 + 3,
);
const plan = await createHistoryTemporaryRestorePlan({
    envelope: created.artifact.envelope,
    recoverySecret: created.recoverySecret,
    liveDatabaseId: created.artifact.liveDatabaseId,
    temporaryDatabaseId: created.artifact.temporaryDatabaseId,
});
assert.equal(plan.liveDatabaseMutationAllowed, false);
assert.equal(Object.values(plan.sections).every(records => records.length === 0), true);
const verification = await verifyHistoryTemporaryRestore(plan, plan.sections, T0 + 4);
const restored = markHistoryBackupRestoreVerified(secretHeld, verification);
assert.equal(restored.status, 'restore_verified');
assert.equal(restored.externalCopyConfirmed, true);
assert.equal(restored.recoverySecretHandoff, 'user_confirmed');
assert.equal(JSON.stringify(restored).includes(created.recoverySecret), false);

const rehearsalSource = await readFile(
    new URL('../utils/historyImport/backup/rescueRehearsal.ts', import.meta.url),
    'utf8',
);
assert.equal(rehearsalSource.includes('AetherOS_Data'), false);
assert.equal(rehearsalSource.includes('utils/db'), false);
assert.match(rehearsalSource, /HISTORY_INDEXEDDB_LAB_PREFIX/);

console.log(
    `history rescue rehearsal OK: stores=${HISTORY_RESCUE_STORE_ORDER.length} records=0 download=confirmation_required restore=${restored.status}`,
);
