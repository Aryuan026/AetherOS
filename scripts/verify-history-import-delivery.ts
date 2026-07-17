import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    advanceHistoryRecoverySecretHandoff,
    applyHistoryBackupDeliveryAttempt,
    confirmHistoryBackupExternalSave,
    createGeneratedHistoryBackupReceipt,
    markHistoryBackupRestoreVerified,
} from '../domain/historyImport/backupReceipt.ts';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../domain/historyImport/contract.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
} from '../domain/historyImport/rescue.ts';
import type {
    HistoryRescueStoreName,
    HistoryTemporaryRestoreVerification,
} from '../domain/historyImport/rescue.ts';
import {
    resolveHistoryDurabilityState,
} from '../domain/historyImport/storageHealth.ts';
import {
    copyHistoryRecoverySecretToClipboard,
    requestHistoryRescueBrowserDownload,
    saveHistoryRescueWithBrowserFilePicker,
    shareHistoryRescueThroughNativeCache,
} from '../utils/historyImport/backup/rescueDelivery.ts';
import {
    HISTORY_IMPORT_FIXTURE_MANIFEST,
} from '../fixtures/history-import/manifest.ts';

const T0 = 1_768_406_800_000;
const RECOVERY_SECRET = 'synthetic-delivery-secret-must-not-enter-receipt';
const SERIALIZED_ARCHIVE = '{"format":"aetheros-history-rescue","synthetic":true}';
const recordCounts = Object.fromEntries(HISTORY_RESCUE_STORE_ORDER.map(store => [
    store,
    store === HISTORY_IMPORT_STORE_NAMES.sourceMessages ? 3 : 0,
])) as Record<HistoryRescueStoreName, number>;

const createReceipt = () => createGeneratedHistoryBackupReceipt({
    id: 'hbackup-delivery-stage-0-6',
    archiveId: 'hrescue-delivery-stage-0-6',
    archiveVersion: 1,
    manifestChecksum: `sha256:${'6'.repeat(64)}`,
    recordCounts,
    createdAt: T0,
});

const generated = createReceipt();
assert.equal(generated.status, 'generated');
assert.equal(generated.destination, 'generated_memory');
assert.equal(generated.externalCopyConfirmed, false);
assert.equal(generated.recoverySecretHandoff, 'not_presented');
assert.equal(JSON.stringify(generated).includes(RECOVERY_SECRET), false);

await assert.rejects(
    async () => advanceHistoryRecoverySecretHandoff(generated, 'user_confirmed', T0 + 1),
    /cannot skip/,
);
const presented = advanceHistoryRecoverySecretHandoff(generated, 'presented_once', T0 + 1);
const directlyConfirmedSecret = advanceHistoryRecoverySecretHandoff(
    presented,
    'user_confirmed',
    T0 + 2,
);
assert.equal(directlyConfirmedSecret.recoverySecretHandoff, 'user_confirmed');
assert.throws(
    () => advanceHistoryRecoverySecretHandoff(directlyConfirmedSecret, 'copied_to_clipboard', T0 + 3),
    /cannot move backwards/,
);

let pickerWrite = '';
let pickerClosed = false;
let pickerAborted = false;
const pickerAttempt = await saveHistoryRescueWithBrowserFilePicker({
    attemptId: 'hattempt-picker-confirmed',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 3,
    completedAt: T0 + 4,
    showSaveFilePicker: async options => {
        assert.equal(options.suggestedName, 'synthetic-rescue.aetherrescue');
        return {
            createWritable: async () => ({
                write: async blob => { pickerWrite = await blob.text(); },
                close: async () => { pickerClosed = true; },
                abort: async () => { pickerAborted = true; },
            }),
        };
    },
});
assert.equal(pickerAttempt.outcome, 'external_save_confirmed');
assert.equal(pickerAttempt.evidence, 'file_write_closed');
assert.equal(pickerWrite, SERIALIZED_ARCHIVE);
assert.equal(pickerClosed, true);
assert.equal(pickerAborted, false);
const pickerSaved = applyHistoryBackupDeliveryAttempt(generated, pickerAttempt);
assert.equal(pickerSaved.status, 'external_save_confirmed');
assert.equal(pickerSaved.destination, 'user_file');
assert.equal(pickerSaved.externalCopyConfirmed, true);

const pickerCancelled = await saveHistoryRescueWithBrowserFilePicker({
    attemptId: 'hattempt-picker-cancelled',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 3,
    completedAt: T0 + 4,
    showSaveFilePicker: async () => { throw new DOMException('dismissed', 'AbortError'); },
});
assert.equal(pickerCancelled.outcome, 'cancelled');
const afterPickerCancel = applyHistoryBackupDeliveryAttempt(generated, pickerCancelled);
assert.equal(afterPickerCancel.status, 'generated');
assert.equal(afterPickerCancel.externalCopyConfirmed, false);

let failedPickerAborted = false;
const pickerFailed = await saveHistoryRescueWithBrowserFilePicker({
    attemptId: 'hattempt-picker-failed',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 3,
    completedAt: T0 + 4,
    showSaveFilePicker: async () => ({
        createWritable: async () => ({
            write: async () => { throw new DOMException('disk denied', 'NotAllowedError'); },
            close: async () => { throw new Error('close must not run'); },
            abort: async () => { failedPickerAborted = true; },
        }),
    }),
});
assert.equal(pickerFailed.outcome, 'failed');
assert.equal(pickerFailed.errorCode, 'NotAllowedError');
assert.equal(failedPickerAborted, true);

let downloadsTriggered = 0;
let downloadedName = '';
const downloadAttempt = requestHistoryRescueBrowserDownload({
    attemptId: 'hattempt-browser-download',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 5,
    completedAt: T0 + 6,
    environment: {
        triggerDownload: (_blob, fileName) => {
            downloadsTriggered += 1;
            downloadedName = fileName;
        },
    },
});
assert.equal(downloadsTriggered, 1);
assert.equal(downloadedName, 'synthetic-rescue.aetherrescue');
assert.equal(downloadAttempt.outcome, 'confirmation_required');
assert.equal(downloadAttempt.evidence, 'download_requested');
const downloadRequested = applyHistoryBackupDeliveryAttempt(generated, downloadAttempt);
assert.equal(downloadRequested.status, 'generated');
assert.equal(downloadRequested.externalCopyConfirmed, false);
const downloadAttested = confirmHistoryBackupExternalSave(downloadRequested, T0 + 7);
assert.equal(downloadAttested.status, 'external_save_confirmed');
assert.equal(downloadAttested.externalCopyConfirmed, true);
assert.equal(downloadAttested.lastDeliveryAttempt?.evidence, 'user_attested');

const noGestureDownload = requestHistoryRescueBrowserDownload({
    attemptId: 'hattempt-browser-no-gesture',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    userGestureConfirmed: false,
    startedAt: T0 + 5,
    completedAt: T0 + 6,
    environment: { triggerDownload: () => { throw new Error('must not trigger'); } },
});
assert.equal(noGestureDownload.outcome, 'failed');
assert.equal(noGestureDownload.errorCode, 'user_gesture_required');

const createNativeAdapter = (share: () => Promise<{ activityType?: string }>) => {
    const calls = { writes: 0, shares: 0, deletes: 0 };
    return {
        calls,
        adapter: {
            writeTemporaryCacheFile: async () => {
                calls.writes += 1;
                return { uri: 'file:///synthetic/cache/rescue.aetherrescue' };
            },
            shareTemporaryFile: async () => {
                calls.shares += 1;
                return share();
            },
            deleteTemporaryCacheFile: async () => { calls.deletes += 1; },
        },
    };
};

const nativeSuccessAdapter = createNativeAdapter(async () => ({ activityType: 'synthetic.files' }));
const nativeSuccess = await shareHistoryRescueThroughNativeCache({
    attemptId: 'hattempt-native-handoff',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    title: 'Synthetic rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 8,
    completedAt: T0 + 9,
    adapter: nativeSuccessAdapter.adapter,
});
assert.equal(nativeSuccess.outcome, 'confirmation_required');
assert.equal(nativeSuccess.evidence, 'share_target_handoff');
assert.equal(nativeSuccess.temporaryCacheCreated, true);
assert.equal(nativeSuccess.temporaryCacheDeleted, true);
assert.deepEqual(nativeSuccessAdapter.calls, { writes: 1, shares: 1, deletes: 1 });
const nativeHandedOff = applyHistoryBackupDeliveryAttempt(generated, nativeSuccess);
assert.equal(nativeHandedOff.externalCopyConfirmed, false, 'share target handoff is fire-and-forget');
const nativeAttested = confirmHistoryBackupExternalSave(nativeHandedOff, T0 + 10);
assert.equal(nativeAttested.externalCopyConfirmed, true);

const nativeCancelAdapter = createNativeAdapter(async () => { throw new Error('Share canceled'); });
const nativeCancelled = await shareHistoryRescueThroughNativeCache({
    attemptId: 'hattempt-native-cancelled',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    title: 'Synthetic rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 8,
    completedAt: T0 + 9,
    adapter: nativeCancelAdapter.adapter,
});
assert.equal(nativeCancelled.outcome, 'cancelled');
assert.equal(nativeCancelled.temporaryCacheCreated, true);
assert.equal(nativeCancelled.temporaryCacheDeleted, true);
assert.equal(applyHistoryBackupDeliveryAttempt(generated, nativeCancelled).externalCopyConfirmed, false);

const cleanupFailureAdapter = createNativeAdapter(async () => ({ activityType: '' }));
cleanupFailureAdapter.adapter.deleteTemporaryCacheFile = async () => {
    cleanupFailureAdapter.calls.deletes += 1;
    throw new DOMException('cache locked', 'InvalidStateError');
};
const cleanupFailed = await shareHistoryRescueThroughNativeCache({
    attemptId: 'hattempt-native-cleanup-failed',
    serializedArchive: SERIALIZED_ARCHIVE,
    fileName: 'synthetic-rescue',
    title: 'Synthetic rescue',
    userGestureConfirmed: true,
    startedAt: T0 + 8,
    completedAt: T0 + 9,
    adapter: cleanupFailureAdapter.adapter,
});
assert.equal(cleanupFailed.outcome, 'confirmation_required');
assert.equal(cleanupFailed.temporaryCacheDeleted, false);
assert.equal(cleanupFailed.cleanupErrorCode, 'InvalidStateError');
assert.equal(applyHistoryBackupDeliveryAttempt(generated, cleanupFailed).externalCopyConfirmed, false);

let copiedSecret = '';
const clipboardCopied = await copyHistoryRecoverySecretToClipboard({
    recoverySecret: RECOVERY_SECRET,
    userGestureConfirmed: true,
    writeText: async value => { copiedSecret = value; },
});
assert.equal(clipboardCopied.status, 'copied_to_clipboard');
assert.equal(copiedSecret, RECOVERY_SECRET);
assert.equal(JSON.stringify(clipboardCopied).includes(RECOVERY_SECRET), false);
const presentedForClipboard = advanceHistoryRecoverySecretHandoff(generated, 'presented_once', T0 + 11);
const clipboardRecorded = advanceHistoryRecoverySecretHandoff(
    presentedForClipboard,
    clipboardCopied.status,
    T0 + 12,
);
assert.equal(clipboardRecorded.recoverySecretHandoff, 'copied_to_clipboard');
const secretHeld = advanceHistoryRecoverySecretHandoff(
    clipboardRecorded,
    'user_confirmed',
    T0 + 13,
);
assert.equal(secretHeld.recoverySecretHandoff, 'user_confirmed');
assert.equal(JSON.stringify(secretHeld).includes(RECOVERY_SECRET), false);

const verification: HistoryTemporaryRestoreVerification = {
    archiveId: generated.archiveId,
    manifestChecksum: generated.manifestChecksum,
    liveDatabaseId: 'synthetic-live',
    temporaryDatabaseId: 'synthetic-temp',
    verifiedAt: T0 + 20,
    status: 'temporary_restore_verified',
    switchPreconditionsSatisfied: true,
    liveDatabaseMutationAllowed: false,
    recordCounts,
};
await assert.rejects(
    async () => markHistoryBackupRestoreVerified(downloadAttested, verification),
    /user-held recovery secret/,
);
const savedAndSecretHeld = advanceHistoryRecoverySecretHandoff(
    advanceHistoryRecoverySecretHandoff(downloadAttested, 'presented_once', T0 + 14),
    'user_confirmed',
    T0 + 15,
);
const restored = markHistoryBackupRestoreVerified(savedAndSecretHeld, verification);
assert.equal(restored.status, 'restore_verified');
assert.equal(restored.verifiedAt, verification.verifiedAt);

const persistentSnapshot = {
    measuredAt: T0,
    persistenceState: 'persistent' as const,
    estimateState: 'available' as const,
    usageBytes: 1,
    quotaBytes: 10,
    issueCodes: [],
};
assert.equal(resolveHistoryDurabilityState(persistentSnapshot, downloadAttested).level, 'persistent_local');
assert.equal(resolveHistoryDurabilityState(persistentSnapshot, restored).level, 'external_rescue_verified');
assert.equal(
    resolveHistoryDurabilityState(persistentSnapshot, {
        ...restored,
        recoverySecretHandoff: 'copied_to_clipboard',
    }).level,
    'persistent_local',
    'clipboard success alone must not claim a user-held recovery secret',
);
assert.equal(JSON.stringify(restored).includes(RECOVERY_SECRET), false);

const laterCancelledAttempt = {
    ...nativeCancelled,
    id: 'hattempt-later-cancelled',
    startedAt: T0 + 21,
    completedAt: T0 + 22,
};
const savedAfterLaterCancel = applyHistoryBackupDeliveryAttempt(downloadAttested, laterCancelledAttempt);
assert.equal(savedAfterLaterCancel.externalCopyConfirmed, true);
assert.equal(savedAfterLaterCancel.status, 'external_save_confirmed');
assert.equal(savedAfterLaterCancel.lastDeliveryAttempt?.outcome, 'cancelled');

const capacitorAdapterSource = await readFile(
    new URL('../utils/historyImport/backup/capacitorRescueShare.ts', import.meta.url),
    'utf8',
);
assert.match(capacitorAdapterSource, /directory: Directory\.Cache/);
assert.match(capacitorAdapterSource, /Filesystem\.deleteFile/);
assert.equal(
    capacitorAdapterSource.includes('Directory.Documents'),
    false,
    'native share uses Cache only as a deletable handoff, never as confirmed durable storage',
);
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'rescue_delivery_cancel')?.availability,
    'generator_ready',
);

console.log(
    'history rescue delivery OK: picker=confirmed/cancelled/failed download=attested native=handoff/cancelled/cache-cleanup secret=presented/copied/confirmed restore=verified',
);
