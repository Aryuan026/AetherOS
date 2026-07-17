import {
    advanceHistoryRecoverySecretHandoff,
    applyHistoryBackupDeliveryAttempt,
    confirmHistoryBackupExternalSave,
    createGeneratedHistoryBackupReceipt,
    markHistoryBackupRestoreVerified,
} from '../../domain/historyImport/backupReceipt.ts';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../../domain/historyImport/contract.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
} from '../../domain/historyImport/rescue.ts';
import type {
    HistoryRescueArchiveEnvelope,
    HistoryRescueSections,
    HistoryRescueStoreName,
    HistoryTemporaryRestoreVerification,
} from '../../domain/historyImport/rescue.ts';
import type {
    HistoryBackupReceipt,
    HistoryImportBatch,
    HistoryJob,
} from '../../domain/historyImport/types.ts';
import type {
    HistoryArchiveCandidateReady,
} from '../historyImport/archive/importCandidate.ts';
import {
    activateVerifiedHistoryArchive,
    createHistoryArchiveRestoreDatabaseId,
    openHistoryArchiveDatabase,
    readHistoryArchiveSections,
    restoreAndVerifyHistoryArchiveDatabase,
} from '../historyImport/storage/indexedDbArchive.ts';
import type {
    HistoryArchiveActivationRecord,
} from '../historyImport/storage/indexedDbArchive.ts';
import {
    createHistoryRescueArchive,
    createHistoryTemporaryRestorePlan,
    generateHistoryRecoverySecret,
    parseHistoryRescueArchive,
    serializeHistoryRescueArchive,
} from '../historyImport/backup/rescueArchive.ts';
import {
    requestHistoryRescueBrowserDownload,
} from '../historyImport/backup/rescueDelivery.ts';
import type {
    HistoryRescueBrowserDownloadEnvironment,
} from '../historyImport/backup/rescueDelivery.ts';

/**
 * Optional encrypted backup seam for the system backup/export area.
 * Historical conversation import must not call this module or require a rescue
 * file before committing records. The current user-held secret contract stays
 * here until whole-device backup and cloud transport are designed together.
 */

export const HISTORY_ARCHIVE_RESCUE_KIND = 'history_archive_activation' as const;

export interface HistoryArchiveRescueArtifact {
    kind: typeof HISTORY_ARCHIVE_RESCUE_KIND;
    nonce: string;
    envelope: HistoryRescueArchiveEnvelope;
    serializedArchive: string;
    fileName: string;
    candidateDatabaseId: string;
    restoreDatabaseId: string;
    expectedActiveDatabaseId?: string;
    batchId: string;
    sourceMessageCount: number;
    recordCounts: Record<HistoryRescueStoreName, number>;
}

export interface CreatedHistoryArchiveRescue {
    artifact: HistoryArchiveRescueArtifact;
    receipt: HistoryBackupReceipt;
    recoverySecret: string;
}

export interface ActivatedHistoryArchiveRescue {
    activation: HistoryArchiveActivationRecord;
    receipt: HistoryBackupReceipt;
    verification: HistoryTemporaryRestoreVerification;
}

const createNonce = (): string => Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(12)),
    byte => byte.toString(16).padStart(2, '0'),
).join('');

const normalizeNonce = (value: string): string => {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/gu, '-');
    if (!normalized) throw new Error('历史救援包需要有效的唯一编号。');
    return normalized;
};

const fileNameFor = (now: number): string => {
    const timestamp = new Date(now).toISOString().replace(/[:.]/gu, '-');
    return `aetheros-history-${timestamp}`;
};

const recordCountsFor = (
    sections: HistoryRescueSections,
): Record<HistoryRescueStoreName, number> => Object.fromEntries(
    HISTORY_RESCUE_STORE_ORDER.map(store => [store, sections[store].length]),
) as Record<HistoryRescueStoreName, number>;

const sameRecordCounts = (
    left: Record<HistoryRescueStoreName, number>,
    right: Record<HistoryRescueStoreName, number>,
): boolean => HISTORY_RESCUE_STORE_ORDER.every(store => left[store] === right[store]);

const assertCandidateReady = (input: {
    candidate: HistoryArchiveCandidateReady;
    sections: HistoryRescueSections;
}): void => {
    const batches = input.sections[HISTORY_IMPORT_STORE_NAMES.batches] as HistoryImportBatch[];
    const jobs = input.sections[HISTORY_IMPORT_STORE_NAMES.jobs] as HistoryJob[];
    const batch = batches.find(record => record.id === input.candidate.batch.id);
    const job = jobs.find(record => record.batchId === input.candidate.batch.id && record.kind === 'import');
    if (
        !batch
        || batch.status !== 'imported'
        || batch.counts.committed !== input.candidate.sourceMessageCount
        || !job
        || job.status !== 'completed'
        || job.cursor.processedCount !== input.candidate.sourceMessageCount
    ) {
        throw new Error('候选档案尚未完整提交，不能生成正式救援包。');
    }
    const observedCounts = recordCountsFor(input.sections);
    if (!sameRecordCounts(observedCounts, input.candidate.recordCounts)) {
        throw new Error('候选档案在生成救援包前发生了变化，请重新准备。');
    }
};

export const createHistoryArchiveRescue = async (input: {
    candidate: HistoryArchiveCandidateReady;
    now?: number;
    nonce?: string;
    factory?: IDBFactory;
}): Promise<CreatedHistoryArchiveRescue> => {
    const now = input.now ?? Date.now();
    const nonce = normalizeNonce(input.nonce ?? createNonce());
    const database = await openHistoryArchiveDatabase(input.candidate.candidateDatabaseId, input.factory);
    let sections: HistoryRescueSections;
    try {
        sections = await readHistoryArchiveSections(database) as unknown as HistoryRescueSections;
    } finally {
        database.close();
    }
    assertCandidateReady({ candidate: input.candidate, sections });
    const archiveId = `hrescue-history-${nonce}`;
    const recoverySecret = generateHistoryRecoverySecret();
    const envelope = await createHistoryRescueArchive({
        archiveId,
        sourceDeviceId: `aetheros-local-history-${nonce}`,
        createdAt: now,
        recoverySecret,
        sections,
    });
    const recordCounts = recordCountsFor(sections);
    const generatedReceipt = createGeneratedHistoryBackupReceipt({
        id: `hbackup-history-${nonce}`,
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
            kind: HISTORY_ARCHIVE_RESCUE_KIND,
            nonce,
            envelope,
            serializedArchive: serializeHistoryRescueArchive(envelope),
            fileName: fileNameFor(now),
            candidateDatabaseId: input.candidate.candidateDatabaseId,
            restoreDatabaseId: createHistoryArchiveRestoreDatabaseId(archiveId),
            expectedActiveDatabaseId: input.candidate.expectedActiveDatabaseId,
            batchId: input.candidate.batch.id,
            sourceMessageCount: input.candidate.sourceMessageCount,
            recordCounts,
        },
        receipt,
        recoverySecret,
    };
};

export const confirmHistoryArchiveRecoverySecretSaved = (input: {
    receipt: HistoryBackupReceipt;
    now?: number;
}): HistoryBackupReceipt => advanceHistoryRecoverySecretHandoff(
    input.receipt,
    'user_confirmed',
    input.now ?? Date.now(),
);

export const requestHistoryArchiveRescueDownload = (input: {
    artifact: HistoryArchiveRescueArtifact;
    receipt: HistoryBackupReceipt;
    now?: number;
    environment?: HistoryRescueBrowserDownloadEnvironment;
}): HistoryBackupReceipt => {
    const now = input.now ?? Date.now();
    const attempt = requestHistoryRescueBrowserDownload({
        attemptId: `hattempt-history-${input.artifact.nonce}-${input.receipt.revision}`,
        serializedArchive: input.artifact.serializedArchive,
        fileName: input.artifact.fileName,
        userGestureConfirmed: true,
        startedAt: now,
        completedAt: now,
        environment: input.environment,
    });
    return applyHistoryBackupDeliveryAttempt(input.receipt, attempt);
};

export const validateHistoryArchiveExternalRescue = (input: {
    artifact: HistoryArchiveRescueArtifact;
    serializedArchive: string;
}): HistoryRescueArchiveEnvelope => {
    const envelope = parseHistoryRescueArchive(input.serializedArchive);
    if (
        envelope.archiveId !== input.artifact.envelope.archiveId
        || envelope.manifestChecksum !== input.artifact.envelope.manifestChecksum
        || envelope.archiveVersion !== input.artifact.envelope.archiveVersion
        || envelope.encryptedChunkCount !== input.artifact.envelope.encryptedChunkCount
    ) {
        throw new Error('重新选择的文件不是刚才为这批历史生成的救援包。');
    }
    return envelope;
};

export const verifyAndActivateHistoryArchiveRescue = async (input: {
    artifact: HistoryArchiveRescueArtifact;
    receipt: HistoryBackupReceipt;
    recoverySecret: string;
    serializedExternalArchive: string;
    verifiedAt?: number;
    factory?: IDBFactory;
}): Promise<ActivatedHistoryArchiveRescue> => {
    const verifiedAt = input.verifiedAt ?? Date.now();
    const externalEnvelope = validateHistoryArchiveExternalRescue({
        artifact: input.artifact,
        serializedArchive: input.serializedExternalArchive,
    });
    const externallyConfirmedReceipt = input.receipt.externalCopyConfirmed
        ? input.receipt
        : confirmHistoryBackupExternalSave(input.receipt, verifiedAt);
    const plan = await createHistoryTemporaryRestorePlan({
        envelope: externalEnvelope,
        recoverySecret: input.recoverySecret,
        liveDatabaseId: input.artifact.candidateDatabaseId,
        temporaryDatabaseId: input.artifact.restoreDatabaseId,
    });
    const verification = await restoreAndVerifyHistoryArchiveDatabase({
        plan,
        verifiedAt,
        factory: input.factory,
    });
    const receipt = markHistoryBackupRestoreVerified(externallyConfirmedReceipt, verification);
    const activation = await activateVerifiedHistoryArchive({
        verification,
        receipt,
        sourceCandidateDatabaseId: input.artifact.candidateDatabaseId,
        expectedActiveDatabaseId: input.artifact.expectedActiveDatabaseId,
        activatedAt: verifiedAt,
        factory: input.factory,
    });
    return { activation, receipt, verification };
};
