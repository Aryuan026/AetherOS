import type {
    HistoryBackupDeliveryAttempt,
    HistoryBackupDeliveryChannel,
    HistoryBackupDeliveryEvidence,
    HistoryBackupDeliveryOutcomeStatus,
    HistoryBackupDestination,
} from '../../../domain/historyImport/types.ts';

export const HISTORY_RESCUE_FILE_EXTENSION = '.aetherrescue' as const;
export const HISTORY_RESCUE_MIME_TYPE = 'application/vnd.aetheros.history-rescue+json' as const;

export interface HistoryRescueWritableFileStream {
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort?(reason?: unknown): Promise<void>;
}

export interface HistoryRescueFileHandle {
    createWritable(): Promise<HistoryRescueWritableFileStream>;
}

export interface HistoryRescueSavePickerOptions {
    suggestedName: string;
    types: Array<{
        description: string;
        accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption: boolean;
}

export type HistoryRescueShowSaveFilePicker = (
    options: HistoryRescueSavePickerOptions,
) => Promise<HistoryRescueFileHandle>;

export interface HistoryRescueNativeShareAdapter {
    writeTemporaryCacheFile(input: {
        path: string;
        serializedArchive: string;
        mimeType: string;
    }): Promise<{ uri: string }>;
    shareTemporaryFile(input: {
        title: string;
        uri: string;
    }): Promise<{ activityType?: string }>;
    deleteTemporaryCacheFile(path: string): Promise<void>;
}

export interface HistoryRecoverySecretClipboardResult {
    status: 'copied_to_clipboard' | 'failed';
    errorCode?: string;
}

const assertTimestamp = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative safe integer`);
    }
};

const assertDeliveryTimes = (startedAt: number, completedAt: number): void => {
    assertTimestamp(startedAt, 'history rescue delivery startedAt');
    assertTimestamp(completedAt, 'history rescue delivery completedAt');
    if (completedAt < startedAt) throw new Error('history rescue delivery completedAt is before startedAt');
};

const normalizeFileName = (fileName: string): string => {
    const trimmed = fileName.trim();
    if (!trimmed) throw new Error('history rescue filename is required');
    const safe = trimmed.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    return safe.endsWith(HISTORY_RESCUE_FILE_EXTENSION)
        ? safe
        : `${safe}${HISTORY_RESCUE_FILE_EXTENSION}`;
};

const getErrorName = (error: unknown): string => {
    if (error && typeof error === 'object' && 'name' in error) {
        const name = (error as { name?: unknown }).name;
        if (typeof name === 'string' && name.trim()) return name;
    }
    return 'Error';
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error ?? '');
};

const isCancellation = (error: unknown): boolean => (
    getErrorName(error) === 'AbortError'
    || /\b(cancel|cancelled|canceled)\b/i.test(getErrorMessage(error))
);

const createAttempt = (input: {
    id: string;
    channel: HistoryBackupDeliveryChannel;
    destination: HistoryBackupDestination;
    outcome: HistoryBackupDeliveryOutcomeStatus;
    evidence?: HistoryBackupDeliveryEvidence;
    startedAt: number;
    completedAt: number;
    activityType?: string;
    temporaryCacheCreated?: boolean;
    temporaryCacheDeleted?: boolean;
    errorCode?: string;
    cleanupErrorCode?: string;
}): HistoryBackupDeliveryAttempt => {
    assertDeliveryTimes(input.startedAt, input.completedAt);
    if (!input.id.trim()) throw new Error('history rescue delivery attempt id is required');
    return {
        id: input.id,
        channel: input.channel,
        destination: input.destination,
        outcome: input.outcome,
        evidence: input.evidence,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        activityType: input.activityType,
        temporaryCacheCreated: input.temporaryCacheCreated ?? false,
        temporaryCacheDeleted: input.temporaryCacheDeleted ?? false,
        errorCode: input.errorCode,
        cleanupErrorCode: input.cleanupErrorCode,
    };
};

export const saveHistoryRescueWithBrowserFilePicker = async (input: {
    attemptId: string;
    serializedArchive: string;
    fileName: string;
    userGestureConfirmed: boolean;
    startedAt: number;
    completedAt: number;
    showSaveFilePicker?: HistoryRescueShowSaveFilePicker;
}): Promise<HistoryBackupDeliveryAttempt> => {
    const common = {
        id: input.attemptId,
        channel: 'browser_file_picker' as const,
        destination: 'user_file' as const,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
    };
    if (!input.userGestureConfirmed) {
        return createAttempt({
            ...common,
            outcome: 'failed',
            errorCode: 'user_gesture_required',
        });
    }
    if (!input.showSaveFilePicker) {
        return createAttempt({
            ...common,
            outcome: 'failed',
            errorCode: 'file_picker_unsupported',
        });
    }

    let writable: HistoryRescueWritableFileStream | undefined;
    try {
        const handle = await input.showSaveFilePicker({
            suggestedName: normalizeFileName(input.fileName),
            types: [{
                description: 'AetherOS encrypted history rescue',
                accept: {
                    [HISTORY_RESCUE_MIME_TYPE]: [HISTORY_RESCUE_FILE_EXTENSION],
                },
            }],
            excludeAcceptAllOption: false,
        });
        writable = await handle.createWritable();
        await writable.write(new Blob([input.serializedArchive], { type: HISTORY_RESCUE_MIME_TYPE }));
        await writable.close();
        return createAttempt({
            ...common,
            outcome: 'external_save_confirmed',
            evidence: 'file_write_closed',
        });
    } catch (error) {
        if (writable?.abort) {
            try {
                await writable.abort(error);
            } catch {
                // The original delivery error remains the user-facing cause.
            }
        }
        return createAttempt({
            ...common,
            outcome: isCancellation(error) ? 'cancelled' : 'failed',
            errorCode: isCancellation(error) ? undefined : getErrorName(error),
        });
    }
};

export interface HistoryRescueBrowserDownloadEnvironment {
    triggerDownload(blob: Blob, fileName: string): void;
}

const createDefaultBrowserDownloadEnvironment = (): HistoryRescueBrowserDownloadEnvironment | undefined => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return undefined;
    return {
        triggerDownload: (blob, fileName) => {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            try {
                anchor.click();
            } finally {
                document.body.removeChild(anchor);
                URL.revokeObjectURL(url);
            }
        },
    };
};

export const requestHistoryRescueBrowserDownload = (input: {
    attemptId: string;
    serializedArchive: string;
    fileName: string;
    userGestureConfirmed: boolean;
    startedAt: number;
    completedAt: number;
    environment?: HistoryRescueBrowserDownloadEnvironment;
}): HistoryBackupDeliveryAttempt => {
    const common = {
        id: input.attemptId,
        channel: 'browser_download' as const,
        destination: 'browser_download' as const,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
    };
    if (!input.userGestureConfirmed) {
        return createAttempt({
            ...common,
            outcome: 'failed',
            errorCode: 'user_gesture_required',
        });
    }
    const environment = input.environment ?? createDefaultBrowserDownloadEnvironment();
    if (!environment) {
        return createAttempt({
            ...common,
            outcome: 'failed',
            errorCode: 'browser_download_unsupported',
        });
    }
    try {
        environment.triggerDownload(
            new Blob([input.serializedArchive], { type: HISTORY_RESCUE_MIME_TYPE }),
            normalizeFileName(input.fileName),
        );
        return createAttempt({
            ...common,
            outcome: 'confirmation_required',
            evidence: 'download_requested',
        });
    } catch (error) {
        return createAttempt({
            ...common,
            outcome: isCancellation(error) ? 'cancelled' : 'failed',
            errorCode: isCancellation(error) ? undefined : getErrorName(error),
        });
    }
};

export const shareHistoryRescueThroughNativeCache = async (input: {
    attemptId: string;
    serializedArchive: string;
    fileName: string;
    title: string;
    userGestureConfirmed: boolean;
    startedAt: number;
    completedAt: number;
    adapter: HistoryRescueNativeShareAdapter;
}): Promise<HistoryBackupDeliveryAttempt> => {
    const common = {
        id: input.attemptId,
        channel: 'native_share' as const,
        destination: 'native_share' as const,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
    };
    if (!input.userGestureConfirmed) {
        return createAttempt({
            ...common,
            outcome: 'failed',
            errorCode: 'user_gesture_required',
        });
    }

    const cachePath = normalizeFileName(input.fileName);
    let temporaryCacheCreated = false;
    let temporaryCacheDeleted = false;
    let cleanupErrorCode: string | undefined;
    let outcome: HistoryBackupDeliveryOutcomeStatus = 'failed';
    let evidence: HistoryBackupDeliveryEvidence | undefined;
    let errorCode: string | undefined;
    let activityType: string | undefined;
    try {
        const cached = await input.adapter.writeTemporaryCacheFile({
            path: cachePath,
            serializedArchive: input.serializedArchive,
            mimeType: HISTORY_RESCUE_MIME_TYPE,
        });
        temporaryCacheCreated = true;
        const result = await input.adapter.shareTemporaryFile({
            title: input.title,
            uri: cached.uri,
        });
        outcome = 'confirmation_required';
        evidence = 'share_target_handoff';
        activityType = result.activityType;
    } catch (error) {
        if (isCancellation(error)) {
            outcome = 'cancelled';
        } else {
            outcome = 'failed';
            errorCode = getErrorName(error);
        }
    } finally {
        if (temporaryCacheCreated) {
            try {
                await input.adapter.deleteTemporaryCacheFile(cachePath);
                temporaryCacheDeleted = true;
            } catch (error) {
                cleanupErrorCode = getErrorName(error);
            }
        }
    }
    return createAttempt({
        ...common,
        outcome,
        evidence,
        activityType,
        temporaryCacheCreated,
        temporaryCacheDeleted,
        errorCode,
        cleanupErrorCode,
    });
};

export const copyHistoryRecoverySecretToClipboard = async (input: {
    recoverySecret: string;
    userGestureConfirmed: boolean;
    writeText?: (text: string) => Promise<void>;
}): Promise<HistoryRecoverySecretClipboardResult> => {
    if (!input.userGestureConfirmed) {
        return { status: 'failed', errorCode: 'user_gesture_required' };
    }
    const writeText = input.writeText ?? globalThis.navigator?.clipboard?.writeText?.bind(
        globalThis.navigator.clipboard,
    );
    if (!writeText) return { status: 'failed', errorCode: 'clipboard_unsupported' };
    try {
        await writeText(input.recoverySecret);
        return { status: 'copied_to_clipboard' };
    } catch (error) {
        return { status: 'failed', errorCode: getErrorName(error) };
    }
};
