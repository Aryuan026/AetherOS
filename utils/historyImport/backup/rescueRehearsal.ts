import {
    advanceHistoryRecoverySecretHandoff,
    applyHistoryBackupDeliveryAttempt,
    createGeneratedHistoryBackupReceipt,
    markHistoryBackupRestoreVerified,
} from '../../../domain/historyImport/backupReceipt.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
} from '../../../domain/historyImport/rescue.ts';
import type {
    HistoryRescueArchiveEnvelope,
    HistoryRescueSections,
    HistoryRescueStoreName,
    HistoryTemporaryRestoreVerification,
} from '../../../domain/historyImport/rescue.ts';
import type {
    HistoryBackupReceipt,
} from '../../../domain/historyImport/types.ts';
import {
    createHistoryRescueArchive,
    createHistoryTemporaryRestorePlan,
    generateHistoryRecoverySecret,
    parseHistoryRescueArchive,
    serializeHistoryRescueArchive,
} from './rescueArchive.ts';
import {
    requestHistoryRescueBrowserDownload,
} from './rescueDelivery.ts';
import type {
    HistoryRescueBrowserDownloadEnvironment,
} from './rescueDelivery.ts';
import {
    deleteHistoryIndexedDbLab,
    HISTORY_INDEXEDDB_LAB_PREFIX,
    restoreAndVerifyHistoryTemporaryIndexedDbLab,
} from '../storage/indexedDbLab.ts';

export const HISTORY_RESCUE_REHEARSAL_KIND = 'empty_synthetic_rehearsal' as const;

export interface HistoryRescueRehearsalArtifact {
    kind: typeof HISTORY_RESCUE_REHEARSAL_KIND;
    nonce: string;
    envelope: HistoryRescueArchiveEnvelope;
    serializedArchive: string;
    fileName: string;
    liveDatabaseId: string;
    temporaryDatabaseId: string;
    recordCounts: Record<HistoryRescueStoreName, 0>;
}

export interface CreatedHistoryRescueRehearsal {
    artifact: HistoryRescueRehearsalArtifact;
    receipt: HistoryBackupReceipt;
    recoverySecret: string;
}

export interface VerifiedHistoryRescueRehearsal {
    receipt: HistoryBackupReceipt;
    verification: HistoryTemporaryRestoreVerification;
    temporaryDatabaseCleanup: 'completed' | 'failed';
}

const createNonce = (): string => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const normalizeNonce = (value: string): string => {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!normalized) throw new Error('history rescue rehearsal nonce is required');
    return normalized;
};

const createEmptySections = (): HistoryRescueSections => Object.fromEntries(
    HISTORY_RESCUE_STORE_ORDER.map(store => [store, []]),
) as unknown as HistoryRescueSections;

const createEmptyRecordCounts = (): Record<HistoryRescueStoreName, 0> => Object.fromEntries(
    HISTORY_RESCUE_STORE_ORDER.map(store => [store, 0]),
) as Record<HistoryRescueStoreName, 0>;

const createRehearsalFileName = (now: number): string => {
    const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    return `aetheros-history-empty-rehearsal-${timestamp}`;
};

export const createHistoryRescueRehearsal = async (input?: {
    now?: number;
    nonce?: string;
}): Promise<CreatedHistoryRescueRehearsal> => {
    const now = input?.now ?? Date.now();
    const nonce = normalizeNonce(input?.nonce ?? createNonce());
    const archiveId = `hrescue-empty-rehearsal-${nonce}`;
    const recoverySecret = generateHistoryRecoverySecret();
    const envelope = await createHistoryRescueArchive({
        archiveId,
        sourceDeviceId: `synthetic-ui-rehearsal-${nonce}`,
        createdAt: now,
        recoverySecret,
        sections: createEmptySections(),
    });
    const recordCounts = createEmptyRecordCounts();
    const generatedReceipt = createGeneratedHistoryBackupReceipt({
        id: `hbackup-empty-rehearsal-${nonce}`,
        archiveId,
        archiveVersion: envelope.archiveVersion,
        manifestChecksum: envelope.manifestChecksum,
        recordCounts,
        createdAt: now,
    });
    const receipt = advanceHistoryRecoverySecretHandoff(
        generatedReceipt,
        'presented_once',
        now,
    );
    return {
        artifact: {
            kind: HISTORY_RESCUE_REHEARSAL_KIND,
            nonce,
            envelope,
            serializedArchive: serializeHistoryRescueArchive(envelope),
            fileName: createRehearsalFileName(now),
            liveDatabaseId: `${HISTORY_INDEXEDDB_LAB_PREFIX}rescue-rehearsal-live-${nonce}`,
            temporaryDatabaseId: `${HISTORY_INDEXEDDB_LAB_PREFIX}rescue-rehearsal-temp-${nonce}`,
            recordCounts,
        },
        receipt,
        recoverySecret,
    };
};

export const requestHistoryRescueRehearsalDownload = (input: {
    artifact: HistoryRescueRehearsalArtifact;
    receipt: HistoryBackupReceipt;
    now?: number;
    environment?: HistoryRescueBrowserDownloadEnvironment;
}): HistoryBackupReceipt => {
    const now = input.now ?? Date.now();
    const attempt = requestHistoryRescueBrowserDownload({
        attemptId: `hattempt-empty-rehearsal-${input.artifact.nonce}-${input.receipt.revision}`,
        serializedArchive: input.artifact.serializedArchive,
        fileName: input.artifact.fileName,
        userGestureConfirmed: true,
        startedAt: now,
        completedAt: now,
        environment: input.environment,
    });
    return applyHistoryBackupDeliveryAttempt(input.receipt, attempt);
};

export const validateHistoryRescueRehearsalExternalArchive = (input: {
    artifact: HistoryRescueRehearsalArtifact;
    serializedArchive: string;
}): HistoryRescueArchiveEnvelope => {
    const envelope = parseHistoryRescueArchive(input.serializedArchive);
    if (
        envelope.archiveId !== input.artifact.envelope.archiveId
        || envelope.manifestChecksum !== input.artifact.envelope.manifestChecksum
        || envelope.archiveVersion !== input.artifact.envelope.archiveVersion
    ) {
        throw new Error('selected rescue file does not belong to this rehearsal');
    }
    if (envelope.encryptedChunkCount !== 0 || envelope.encryptedChunks.length !== 0) {
        throw new Error('the empty rehearsal refuses an archive containing history records');
    }
    return envelope;
};

export const verifyHistoryRescueRehearsal = async (input: {
    artifact: HistoryRescueRehearsalArtifact;
    receipt: HistoryBackupReceipt;
    recoverySecret: string;
    serializedExternalArchive: string;
    verifiedAt?: number;
    factory?: IDBFactory;
}): Promise<VerifiedHistoryRescueRehearsal> => {
    const verifiedAt = input.verifiedAt ?? Date.now();
    const externalEnvelope = validateHistoryRescueRehearsalExternalArchive({
        artifact: input.artifact,
        serializedArchive: input.serializedExternalArchive,
    });
    const plan = await createHistoryTemporaryRestorePlan({
        envelope: externalEnvelope,
        recoverySecret: input.recoverySecret,
        liveDatabaseId: input.artifact.liveDatabaseId,
        temporaryDatabaseId: input.artifact.temporaryDatabaseId,
    });

    await deleteHistoryIndexedDbLab(input.artifact.temporaryDatabaseId, input.factory);
    let verification: HistoryTemporaryRestoreVerification;
    let temporaryDatabaseCleanup: VerifiedHistoryRescueRehearsal['temporaryDatabaseCleanup'] = 'completed';
    try {
        verification = await restoreAndVerifyHistoryTemporaryIndexedDbLab({
            plan,
            verifiedAt,
            factory: input.factory,
        });
    } finally {
        try {
            await deleteHistoryIndexedDbLab(input.artifact.temporaryDatabaseId, input.factory);
        } catch {
            temporaryDatabaseCleanup = 'failed';
        }
    }

    return {
        receipt: markHistoryBackupRestoreVerified(input.receipt, verification),
        verification,
        temporaryDatabaseCleanup,
    };
};
