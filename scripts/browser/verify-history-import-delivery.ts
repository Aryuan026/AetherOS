import {
    copyHistoryRecoverySecretToClipboard,
    requestHistoryRescueBrowserDownload,
    saveHistoryRescueWithBrowserFilePicker,
} from '../../utils/historyImport/backup/rescueDelivery.ts';

const T0 = 1_768_406_900_000;
const SYNTHETIC_ARCHIVE = '{"format":"aetheros-history-rescue","browserFixture":true}';
const SYNTHETIC_SECRET = 'synthetic-browser-secret-not-returned';

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`history rescue delivery browser verification failed: ${message}`);
};

export interface HistoryRescueDeliveryBrowserVerificationResult {
    pickerWriteClosed: boolean;
    pickerCancelRejectedAsSave: boolean;
    pickerFailureRejectedAsSave: boolean;
    noGestureBlocked: boolean;
    clipboardCopiedWithoutReceiptLeak: boolean;
}

export const runHistoryRescueDeliveryBrowserVerification = async (): Promise<
    HistoryRescueDeliveryBrowserVerificationResult
> => {
    let written = '';
    let closed = false;
    const pickerConfirmed = await saveHistoryRescueWithBrowserFilePicker({
        attemptId: 'hattempt-browser-picker-confirmed',
        serializedArchive: SYNTHETIC_ARCHIVE,
        fileName: 'browser-picker-synthetic',
        userGestureConfirmed: true,
        startedAt: T0,
        completedAt: T0 + 1,
        showSaveFilePicker: async () => ({
            createWritable: async () => ({
                write: async blob => { written = await blob.text(); },
                close: async () => { closed = true; },
            }),
        }),
    });
    assert(pickerConfirmed.outcome === 'external_save_confirmed', 'closed picker write must confirm');
    assert(pickerConfirmed.evidence === 'file_write_closed', 'picker evidence must be write-close');
    assert(written === SYNTHETIC_ARCHIVE && closed, 'picker must write exact bytes and close');

    const pickerCancelled = await saveHistoryRescueWithBrowserFilePicker({
        attemptId: 'hattempt-browser-picker-cancelled',
        serializedArchive: SYNTHETIC_ARCHIVE,
        fileName: 'browser-picker-synthetic',
        userGestureConfirmed: true,
        startedAt: T0 + 2,
        completedAt: T0 + 3,
        showSaveFilePicker: async () => { throw new DOMException('dismissed', 'AbortError'); },
    });
    assert(pickerCancelled.outcome === 'cancelled', 'AbortError must remain cancelled');

    const pickerFailed = await saveHistoryRescueWithBrowserFilePicker({
        attemptId: 'hattempt-browser-picker-failed',
        serializedArchive: SYNTHETIC_ARCHIVE,
        fileName: 'browser-picker-synthetic',
        userGestureConfirmed: true,
        startedAt: T0 + 4,
        completedAt: T0 + 5,
        showSaveFilePicker: async () => { throw new DOMException('blocked', 'NotAllowedError'); },
    });
    assert(pickerFailed.outcome === 'failed', 'non-cancel picker error must fail');
    assert(pickerFailed.errorCode === 'NotAllowedError', 'picker failure must retain error name');

    let noGestureCalls = 0;
    const noGesture = await saveHistoryRescueWithBrowserFilePicker({
        attemptId: 'hattempt-browser-picker-no-gesture',
        serializedArchive: SYNTHETIC_ARCHIVE,
        fileName: 'browser-picker-synthetic',
        userGestureConfirmed: false,
        startedAt: T0 + 6,
        completedAt: T0 + 7,
        showSaveFilePicker: async () => {
            noGestureCalls += 1;
            throw new Error('must not open');
        },
    });
    assert(noGesture.outcome === 'failed', 'missing user gesture must fail');
    assert(noGesture.errorCode === 'user_gesture_required', 'missing gesture needs explicit code');
    assert(noGestureCalls === 0, 'picker must not open without a confirmed gesture');

    let clipboardValue = '';
    const clipboard = await copyHistoryRecoverySecretToClipboard({
        recoverySecret: SYNTHETIC_SECRET,
        userGestureConfirmed: true,
        writeText: async value => { clipboardValue = value; },
    });
    assert(clipboard.status === 'copied_to_clipboard', 'clipboard adapter must report copy');
    assert(clipboardValue === SYNTHETIC_SECRET, 'clipboard receives the exact synthetic secret');
    assert(!JSON.stringify(clipboard).includes(SYNTHETIC_SECRET), 'clipboard receipt must not echo secret');

    return {
        pickerWriteClosed: true,
        pickerCancelRejectedAsSave: pickerCancelled.outcome === 'cancelled',
        pickerFailureRejectedAsSave: pickerFailed.outcome === 'failed',
        noGestureBlocked: noGestureCalls === 0,
        clipboardCopiedWithoutReceiptLeak: !JSON.stringify(clipboard).includes(SYNTHETIC_SECRET),
    };
};

export const triggerSyntheticHistoryRescueBrowserDownload = () => (
    requestHistoryRescueBrowserDownload({
        attemptId: 'hattempt-browser-download-real',
        serializedArchive: SYNTHETIC_ARCHIVE,
        fileName: 'aetheros-history-rescue-synthetic',
        userGestureConfirmed: true,
        startedAt: T0 + 8,
        completedAt: T0 + 9,
    })
);

declare global {
    interface Window {
        runHistoryRescueDeliveryBrowserVerification?: typeof runHistoryRescueDeliveryBrowserVerification;
        triggerSyntheticHistoryRescueBrowserDownload?: typeof triggerSyntheticHistoryRescueBrowserDownload;
        __historyRescueDownloadEvidence?: unknown;
    }
}

if (typeof window !== 'undefined') {
    window.runHistoryRescueDeliveryBrowserVerification = runHistoryRescueDeliveryBrowserVerification;
    window.triggerSyntheticHistoryRescueBrowserDownload = triggerSyntheticHistoryRescueBrowserDownload;
}
