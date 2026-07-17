import {
    HISTORY_IMPORT_SCHEMA_VERSION,
} from './contract.ts';
import type {
    HistoryBackupDeliveryAttempt,
    HistoryBackupReceipt,
    HistoryRecoverySecretHandoffState,
} from './types.ts';
import type {
    HistoryTemporaryRestoreVerification,
} from './rescue.ts';

export interface CreateGeneratedHistoryBackupReceiptInput {
    id: string;
    archiveId: string;
    archiveVersion: number;
    manifestChecksum: string;
    recordCounts: Record<string, number>;
    createdAt: number;
}

const assertNonEmpty = (value: string, label: string): void => {
    if (!value.trim()) throw new Error(`${label} is required`);
};

const assertTimestamp = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative safe integer`);
    }
};

const assertTransitionTime = (receipt: HistoryBackupReceipt, now: number): void => {
    assertTimestamp(now, 'history backup receipt timestamp');
    if (now < receipt.updatedAt) throw new Error('history backup receipt timestamp must not move backwards');
};

const nextRevision = (
    receipt: HistoryBackupReceipt,
    now: number,
): Pick<HistoryBackupReceipt, 'revision' | 'updatedAt'> => ({
    revision: receipt.revision + 1,
    updatedAt: now,
});

const assertRecordCounts = (recordCounts: Record<string, number>): void => {
    Object.entries(recordCounts).forEach(([store, count]) => {
        assertNonEmpty(store, 'history backup record-count store');
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error(`history backup record count for ${store} is invalid`);
        }
    });
};

const recordCountsMatch = (
    left: Record<string, number>,
    right: Record<string, number>,
): boolean => {
    const canonical = (value: Record<string, number>) => Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};

export const createGeneratedHistoryBackupReceipt = (
    input: CreateGeneratedHistoryBackupReceiptInput,
): HistoryBackupReceipt => {
    assertNonEmpty(input.id, 'history backup receipt id');
    assertNonEmpty(input.archiveId, 'history backup archive id');
    assertNonEmpty(input.manifestChecksum, 'history backup manifest checksum');
    if (!Number.isSafeInteger(input.archiveVersion) || input.archiveVersion < 1) {
        throw new Error('history backup archive version must be a positive integer');
    }
    assertTimestamp(input.createdAt, 'history backup createdAt');
    assertRecordCounts(input.recordCounts);
    return {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: input.id,
        archiveId: input.archiveId,
        archiveVersion: input.archiveVersion,
        status: 'generated',
        destination: 'generated_memory',
        externalCopyConfirmed: false,
        encrypted: true,
        credentialPolicy: 'excluded_default',
        manifestChecksum: input.manifestChecksum,
        recordCounts: { ...input.recordCounts },
        recoverySecretHandoff: 'not_presented',
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        revision: 1,
    };
};

const assertDeliveryAttempt = (attempt: HistoryBackupDeliveryAttempt): void => {
    assertNonEmpty(attempt.id, 'history backup delivery attempt id');
    assertTimestamp(attempt.startedAt, 'history backup delivery startedAt');
    assertTimestamp(attempt.completedAt, 'history backup delivery completedAt');
    if (attempt.completedAt < attempt.startedAt) {
        throw new Error('history backup delivery cannot complete before it starts');
    }
    const expectedDestination = {
        browser_file_picker: 'user_file',
        browser_download: 'browser_download',
        native_share: 'native_share',
    } as const;
    if (attempt.destination !== expectedDestination[attempt.channel]) {
        throw new Error('history backup delivery channel and destination disagree');
    }
    if (attempt.channel !== 'native_share' && attempt.temporaryCacheCreated) {
        throw new Error('only native share may create a temporary Cache handoff');
    }
    if (attempt.temporaryCacheDeleted && !attempt.temporaryCacheCreated) {
        throw new Error('history backup delivery cannot delete a Cache file that was never created');
    }
    if (attempt.outcome === 'external_save_confirmed') {
        if (
            attempt.channel !== 'browser_file_picker'
            || attempt.evidence !== 'file_write_closed'
        ) {
            throw new Error('only a closed file-picker write can confirm external save automatically');
        }
    }
    if (attempt.outcome === 'confirmation_required' && !attempt.evidence) {
        throw new Error('confirmation-required delivery needs visible handoff evidence');
    }
    if (attempt.outcome === 'failed' && !attempt.errorCode) {
        throw new Error('failed history backup delivery needs an error code');
    }
};

export const applyHistoryBackupDeliveryAttempt = (
    receipt: HistoryBackupReceipt,
    attempt: HistoryBackupDeliveryAttempt,
): HistoryBackupReceipt => {
    assertDeliveryAttempt(attempt);
    assertTransitionTime(receipt, attempt.completedAt);
    if (receipt.status === 'restore_verified') {
        throw new Error('a restore-verified receipt cannot be replaced by a delivery attempt');
    }
    if (receipt.lastDeliveryAttempt?.id === attempt.id) {
        if (JSON.stringify(receipt.lastDeliveryAttempt) === JSON.stringify(attempt)) return receipt;
        throw new Error('history backup delivery attempt id conflict');
    }
    const confirmedByThisAttempt = attempt.outcome === 'external_save_confirmed';
    const externalCopyConfirmed = receipt.externalCopyConfirmed || confirmedByThisAttempt;
    const status = externalCopyConfirmed ? 'external_save_confirmed' : 'generated';
    const errorCode = attempt.outcome === 'failed' ? attempt.errorCode : undefined;
    return {
        ...receipt,
        status,
        destination: confirmedByThisAttempt ? attempt.destination : receipt.destination,
        externalCopyConfirmed,
        externalConfirmedAt: confirmedByThisAttempt
            ? attempt.completedAt
            : receipt.externalConfirmedAt,
        lastDeliveryAttempt: { ...attempt },
        errorCode,
        ...nextRevision(receipt, attempt.completedAt),
    };
};

export const confirmHistoryBackupExternalSave = (
    receipt: HistoryBackupReceipt,
    confirmedAt: number,
): HistoryBackupReceipt => {
    assertTransitionTime(receipt, confirmedAt);
    const attempt = receipt.lastDeliveryAttempt;
    if (!attempt || attempt.outcome !== 'confirmation_required') {
        throw new Error('history backup has no delivery awaiting user confirmation');
    }
    if (attempt.destination === 'temporary_cache' || attempt.destination === 'generated_memory') {
        throw new Error('origin-local handoff cannot become an external save');
    }
    return {
        ...receipt,
        status: 'external_save_confirmed',
        destination: attempt.destination,
        externalCopyConfirmed: true,
        externalConfirmedAt: confirmedAt,
        lastDeliveryAttempt: {
            ...attempt,
            outcome: 'external_save_confirmed',
            evidence: 'user_attested',
            completedAt: confirmedAt,
        },
        errorCode: undefined,
        ...nextRevision(receipt, confirmedAt),
    };
};

const SECRET_HANDOFF_ORDER: HistoryRecoverySecretHandoffState[] = [
    'not_presented',
    'presented_once',
    'copied_to_clipboard',
    'user_confirmed',
];

export const advanceHistoryRecoverySecretHandoff = (
    receipt: HistoryBackupReceipt,
    nextState: Exclude<HistoryRecoverySecretHandoffState, 'not_presented'>,
    now: number,
): HistoryBackupReceipt => {
    assertTransitionTime(receipt, now);
    const currentIndex = SECRET_HANDOFF_ORDER.indexOf(receipt.recoverySecretHandoff);
    const nextIndex = SECRET_HANDOFF_ORDER.indexOf(nextState);
    if (nextIndex === currentIndex) return receipt;
    if (nextIndex < currentIndex) throw new Error('history recovery-secret handoff cannot move backwards');
    const optionalClipboardSkip = (
        receipt.recoverySecretHandoff === 'presented_once'
        && nextState === 'user_confirmed'
    );
    if (nextIndex > currentIndex + 1 && !optionalClipboardSkip) {
        throw new Error('history recovery-secret handoff cannot skip visible confirmation steps');
    }
    return {
        ...receipt,
        recoverySecretHandoff: nextState,
        ...nextRevision(receipt, now),
    };
};

export const markHistoryBackupRestoreVerified = (
    receipt: HistoryBackupReceipt,
    verification: HistoryTemporaryRestoreVerification,
): HistoryBackupReceipt => {
    assertTransitionTime(receipt, verification.verifiedAt);
    if (!receipt.externalCopyConfirmed || receipt.status !== 'external_save_confirmed') {
        throw new Error('history backup restore verification requires a confirmed external copy');
    }
    if (receipt.recoverySecretHandoff !== 'user_confirmed') {
        throw new Error('history backup restore verification requires a user-held recovery secret');
    }
    if (
        verification.archiveId !== receipt.archiveId
        || verification.manifestChecksum !== receipt.manifestChecksum
    ) {
        throw new Error('history backup restore verification belongs to another archive');
    }
    if (
        verification.status !== 'temporary_restore_verified'
        || !verification.switchPreconditionsSatisfied
        || verification.liveDatabaseMutationAllowed
    ) {
        throw new Error('history backup restore verification is not safe to accept');
    }
    if (!recordCountsMatch(verification.recordCounts, receipt.recordCounts)) {
        throw new Error('history backup restore verification record counts do not match the receipt');
    }
    return {
        ...receipt,
        status: 'restore_verified',
        verifiedAt: verification.verifiedAt,
        errorCode: undefined,
        ...nextRevision(receipt, verification.verifiedAt),
    };
};
