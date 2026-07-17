import type { HistoryBackupReceipt } from './types.ts';

export type HistoryStoragePersistenceState =
    | 'unsupported'
    | 'unknown'
    | 'best_effort'
    | 'persistent';

export type HistoryStorageEstimateState =
    | 'unsupported'
    | 'unavailable'
    | 'available'
    | 'error';

export type HistoryStorageHealthIssueCode =
    | 'storage_api_unavailable'
    | 'persistence_query_failed'
    | 'estimate_api_unavailable'
    | 'estimate_query_failed'
    | 'estimate_incomplete';

export interface HistoryStorageHealthSnapshot {
    measuredAt: number;
    persistenceState: HistoryStoragePersistenceState;
    estimateState: HistoryStorageEstimateState;
    usageBytes?: number;
    quotaBytes?: number;
    issueCodes: HistoryStorageHealthIssueCode[];
}

export interface HistoryStorageSizingPolicy {
    version: string;
    normalizedWriteAmplification: number;
    perRecordOverheadBytes: number;
    fixedImportOverheadBytes: number;
    reserveQuotaRatio: number;
    minimumReserveBytes: number;
}

export const HISTORY_STORAGE_SIZING_POLICY_V1: HistoryStorageSizingPolicy = {
    version: 'history-storage-stage-0.3-provisional-v1',
    normalizedWriteAmplification: 1.5,
    perRecordOverheadBytes: 256,
    fixedImportOverheadBytes: 2 * 1024 * 1024,
    reserveQuotaRatio: 0.2,
    minimumReserveBytes: 64 * 1024 * 1024,
};

export interface HistoryImportSizeInput {
    sourceBytes: number;
    normalizedBytes: number;
    recordCount: number;
}

export interface HistoryImportSizeProjection extends HistoryImportSizeInput {
    estimatedStorageBytes: number;
    policyVersion: string;
}

export type HistoryStoragePreflightStatus =
    | 'ready'
    | 'warning'
    | 'blocked'
    | 'unknown';

export type HistoryStoragePreflightReason =
    | 'storage_estimate_unavailable'
    | 'storage_estimate_failed'
    | 'storage_estimate_incomplete'
    | 'storage_estimate_inconsistent'
    | 'insufficient_headroom'
    | 'persistence_unsupported'
    | 'persistence_unknown'
    | 'persistence_not_granted';

export interface HistoryStoragePreflightReport {
    status: HistoryStoragePreflightStatus;
    canStartImport: boolean;
    requiresUserAcknowledgement: boolean;
    persistenceState: HistoryStoragePersistenceState;
    estimateState: HistoryStorageEstimateState;
    sourceBytes: number;
    normalizedBytes: number;
    estimatedStorageBytes: number;
    usageBytes?: number;
    quotaBytes?: number;
    freeBytesBeforeImport?: number;
    reservedHeadroomBytes?: number;
    safeWriteBudgetBytes?: number;
    projectedUsageBytes?: number;
    projectedFreeBytes?: number;
    reasonCodes: HistoryStoragePreflightReason[];
    policyVersion: string;
}

export type HistoryDurabilityLevel =
    | 'only_local'
    | 'persistent_local'
    | 'external_rescue_verified';

export interface HistoryDurabilityState {
    level: HistoryDurabilityLevel;
    persistenceState: HistoryStoragePersistenceState;
    externalCopyPresent: boolean;
    restoreVerified: boolean;
}

export type HistoryStorageRecoveryAction = 'retry' | 'export_rescue' | 'cancel';
export type HistoryStorageWriteFailureKind = 'quota_exceeded' | 'write_failed';

export interface HistoryStorageWriteFailure {
    kind: HistoryStorageWriteFailureKind;
    errorName: string;
    batchMayBeMarkedComplete: false;
    preserveDurableCursor: true;
    nextActions: HistoryStorageRecoveryAction[];
}

const assertByteCount = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative safe integer`);
    }
};

const assertTimestamp = (value: number): void => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('storage health measuredAt must be a non-negative safe integer');
    }
};

const assertSizingPolicy = (policy: HistoryStorageSizingPolicy): void => {
    if (!policy.version.trim()) throw new Error('storage sizing policy version is required');
    if (!Number.isFinite(policy.normalizedWriteAmplification) || policy.normalizedWriteAmplification < 1) {
        throw new Error('normalizedWriteAmplification must be at least 1');
    }
    assertByteCount(policy.perRecordOverheadBytes, 'perRecordOverheadBytes');
    assertByteCount(policy.fixedImportOverheadBytes, 'fixedImportOverheadBytes');
    if (
        !Number.isFinite(policy.reserveQuotaRatio)
        || policy.reserveQuotaRatio < 0
        || policy.reserveQuotaRatio > 1
    ) {
        throw new Error('reserveQuotaRatio must be between 0 and 1');
    }
    assertByteCount(policy.minimumReserveBytes, 'minimumReserveBytes');
};

export const validateHistoryStorageHealthSnapshot = (
    snapshot: HistoryStorageHealthSnapshot,
): string[] => {
    const errors: string[] = [];
    try {
        assertTimestamp(snapshot.measuredAt);
    } catch (error) {
        errors.push(error instanceof Error ? error.message : 'invalid measuredAt');
    }
    if (snapshot.estimateState === 'available') {
        if (snapshot.usageBytes === undefined || snapshot.quotaBytes === undefined) {
            errors.push('available storage estimate requires usageBytes and quotaBytes');
        } else {
            try {
                assertByteCount(snapshot.usageBytes, 'usageBytes');
                assertByteCount(snapshot.quotaBytes, 'quotaBytes');
            } catch (error) {
                errors.push(error instanceof Error ? error.message : 'invalid storage estimate');
            }
        }
    }
    if (
        snapshot.estimateState !== 'available'
        && (snapshot.usageBytes !== undefined || snapshot.quotaBytes !== undefined)
    ) {
        errors.push('non-available storage estimate must not claim usage or quota bytes');
    }
    return errors;
};

export const createHistoryImportSizeProjection = (
    input: HistoryImportSizeInput,
    policy: HistoryStorageSizingPolicy = HISTORY_STORAGE_SIZING_POLICY_V1,
): HistoryImportSizeProjection => {
    assertSizingPolicy(policy);
    assertByteCount(input.sourceBytes, 'history import sourceBytes');
    assertByteCount(input.normalizedBytes, 'history import normalizedBytes');
    assertByteCount(input.recordCount, 'history import recordCount');

    const estimatedStorageBytes = Math.ceil(
        input.normalizedBytes * policy.normalizedWriteAmplification
        + input.recordCount * policy.perRecordOverheadBytes
        + policy.fixedImportOverheadBytes,
    );
    assertByteCount(estimatedStorageBytes, 'history import estimatedStorageBytes');
    return {
        ...input,
        estimatedStorageBytes,
        policyVersion: policy.version,
    };
};

const unknownPreflight = (
    snapshot: HistoryStorageHealthSnapshot,
    projection: HistoryImportSizeProjection,
    reason: HistoryStoragePreflightReason,
): HistoryStoragePreflightReport => ({
    status: 'unknown',
    canStartImport: false,
    requiresUserAcknowledgement: false,
    persistenceState: snapshot.persistenceState,
    estimateState: snapshot.estimateState,
    sourceBytes: projection.sourceBytes,
    normalizedBytes: projection.normalizedBytes,
    estimatedStorageBytes: projection.estimatedStorageBytes,
    reasonCodes: [reason],
    policyVersion: projection.policyVersion,
});

export const evaluateHistoryStoragePreflight = (
    snapshot: HistoryStorageHealthSnapshot,
    projection: HistoryImportSizeProjection,
    policy: HistoryStorageSizingPolicy = HISTORY_STORAGE_SIZING_POLICY_V1,
): HistoryStoragePreflightReport => {
    assertSizingPolicy(policy);
    const snapshotErrors = validateHistoryStorageHealthSnapshot(snapshot);
    if (snapshotErrors.length > 0) throw new Error(snapshotErrors.join('; '));
    if (projection.policyVersion !== policy.version) {
        throw new Error('history import projection policyVersion does not match preflight policy');
    }
    if (snapshot.estimateState === 'unsupported' || snapshot.estimateState === 'unavailable') {
        return unknownPreflight(snapshot, projection, 'storage_estimate_unavailable');
    }
    if (snapshot.estimateState === 'error') {
        return unknownPreflight(snapshot, projection, 'storage_estimate_failed');
    }
    if (snapshot.usageBytes === undefined || snapshot.quotaBytes === undefined) {
        return unknownPreflight(snapshot, projection, 'storage_estimate_incomplete');
    }

    const usageBytes = snapshot.usageBytes;
    const quotaBytes = snapshot.quotaBytes;
    const freeBytesBeforeImport = Math.max(0, quotaBytes - usageBytes);
    const reservedHeadroomBytes = Math.min(
        quotaBytes,
        Math.max(policy.minimumReserveBytes, Math.ceil(quotaBytes * policy.reserveQuotaRatio)),
    );
    const safeWriteBudgetBytes = Math.max(0, freeBytesBeforeImport - reservedHeadroomBytes);
    const projectedUsageBytes = usageBytes + projection.estimatedStorageBytes;
    const projectedFreeBytes = Math.max(0, quotaBytes - projectedUsageBytes);

    const common = {
        persistenceState: snapshot.persistenceState,
        estimateState: snapshot.estimateState,
        sourceBytes: projection.sourceBytes,
        normalizedBytes: projection.normalizedBytes,
        estimatedStorageBytes: projection.estimatedStorageBytes,
        usageBytes,
        quotaBytes,
        freeBytesBeforeImport,
        reservedHeadroomBytes,
        safeWriteBudgetBytes,
        projectedUsageBytes,
        projectedFreeBytes,
        policyVersion: policy.version,
    };

    if (usageBytes > quotaBytes) {
        return {
            ...common,
            status: 'blocked',
            canStartImport: false,
            requiresUserAcknowledgement: false,
            reasonCodes: ['storage_estimate_inconsistent'],
        };
    }
    if (projection.estimatedStorageBytes > safeWriteBudgetBytes) {
        return {
            ...common,
            status: 'blocked',
            canStartImport: false,
            requiresUserAcknowledgement: false,
            reasonCodes: ['insufficient_headroom'],
        };
    }

    const persistenceWarnings: HistoryStoragePreflightReason[] = [];
    if (snapshot.persistenceState === 'unsupported') {
        persistenceWarnings.push('persistence_unsupported');
    } else if (snapshot.persistenceState === 'unknown') {
        persistenceWarnings.push('persistence_unknown');
    } else if (snapshot.persistenceState === 'best_effort') {
        persistenceWarnings.push('persistence_not_granted');
    }
    return {
        ...common,
        status: persistenceWarnings.length > 0 ? 'warning' : 'ready',
        canStartImport: true,
        requiresUserAcknowledgement: persistenceWarnings.length > 0,
        reasonCodes: persistenceWarnings,
    };
};

const isExternalDestination = (receipt: HistoryBackupReceipt): boolean => (
    receipt.destination !== 'temporary_cache'
    && receipt.destination !== 'generated_memory'
);

export const resolveHistoryDurabilityState = (
    snapshot: HistoryStorageHealthSnapshot,
    receipt?: HistoryBackupReceipt,
): HistoryDurabilityState => {
    const snapshotErrors = validateHistoryStorageHealthSnapshot(snapshot);
    if (snapshotErrors.length > 0) throw new Error(snapshotErrors.join('; '));
    const externalCopyPresent = Boolean(
        receipt
        && receipt.externalCopyConfirmed
        && isExternalDestination(receipt),
    );
    const restoreVerified = Boolean(
        externalCopyPresent
        && receipt?.status === 'restore_verified'
        && receipt.encrypted
        && receipt.recoverySecretHandoff === 'user_confirmed',
    );
    if (restoreVerified) {
        return {
            level: 'external_rescue_verified',
            persistenceState: snapshot.persistenceState,
            externalCopyPresent,
            restoreVerified,
        };
    }
    return {
        level: snapshot.persistenceState === 'persistent' ? 'persistent_local' : 'only_local',
        persistenceState: snapshot.persistenceState,
        externalCopyPresent,
        restoreVerified,
    };
};

const getErrorName = (error: unknown): string => {
    if (error && typeof error === 'object' && 'name' in error) {
        const name = (error as { name?: unknown }).name;
        if (typeof name === 'string' && name.trim()) return name;
    }
    return 'UnknownError';
};

const getErrorCode = (error: unknown): number | undefined => {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'number') return code;
    }
    return undefined;
};

export const classifyHistoryStorageWriteFailure = (
    error: unknown,
): HistoryStorageWriteFailure => {
    const errorName = getErrorName(error);
    const errorCode = getErrorCode(error);
    const quotaExceeded = (
        errorName === 'QuotaExceededError'
        || errorName === 'NS_ERROR_DOM_QUOTA_REACHED'
        || errorCode === 22
        || errorCode === 1014
    );
    return {
        kind: quotaExceeded ? 'quota_exceeded' : 'write_failed',
        errorName,
        batchMayBeMarkedComplete: false,
        preserveDurableCursor: true,
        nextActions: quotaExceeded
            ? ['retry', 'export_rescue', 'cancel']
            : ['retry', 'cancel'],
    };
};
