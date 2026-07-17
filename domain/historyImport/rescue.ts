import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    HISTORY_IMPORT_STORE_NAMES,
} from './contract.ts';
import type {
    HistoryBackupReceipt,
    HistoryImportBatch,
    HistoryJob,
    HistorySourceMessage,
} from './types.ts';

export const HISTORY_RESCUE_FORMAT = 'aetheros-history-rescue' as const;
export const HISTORY_RESCUE_ARCHIVE_VERSION = 1 as const;

export const HISTORY_RESCUE_STORE_ORDER = [
    HISTORY_IMPORT_STORE_NAMES.batches,
    HISTORY_IMPORT_STORE_NAMES.sourceMessages,
    HISTORY_IMPORT_STORE_NAMES.jobs,
    HISTORY_IMPORT_STORE_NAMES.backupReceipts,
] as const;

export type HistoryRescueStoreName = typeof HISTORY_RESCUE_STORE_ORDER[number];

export interface HistoryRescueSections {
    history_import_batches: HistoryImportBatch[];
    history_source_messages: HistorySourceMessage[];
    history_jobs: HistoryJob[];
    history_backup_receipts: HistoryBackupReceipt[];
}

export type HistoryRescueSanitizedSections = {
    [Store in HistoryRescueStoreName]: unknown[];
};

export interface HistoryRescueChunkManifest {
    chunkId: string;
    store: HistoryRescueStoreName;
    chunkIndex: number;
    recordStart: number;
    recordCount: number;
    plaintextBytes: number;
    sha256: string;
    stableIdCount: number;
    stableIdChecksum: string;
}

export interface HistoryRescueSectionManifest {
    store: HistoryRescueStoreName;
    recordCount: number;
    plaintextBytes: number;
    sha256: string;
    stableIdCount: number;
    stableIdChecksum: string;
    chunkCount: number;
    chunks: HistoryRescueChunkManifest[];
}

export interface HistoryRescueManifest {
    archiveVersion: typeof HISTORY_RESCUE_ARCHIVE_VERSION;
    historySchemaVersion: typeof HISTORY_IMPORT_SCHEMA_VERSION;
    archiveId: string;
    sourceDeviceId: string;
    createdAt: number;
    credentialPolicy: 'excluded_default';
    removedCredentialFieldCount: number;
    removedRebuildableFieldCount: number;
    sections: HistoryRescueSectionManifest[];
}

export interface HistoryRescuePayload {
    manifest: HistoryRescueManifest;
    sections: HistoryRescueSanitizedSections;
}

export interface HistoryRescueEncryptionHeader {
    algorithm: 'AES-GCM';
    keyLength: 256;
    tagLength: 128;
    keyDerivation: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    chunkRecordLimit: number;
    saltBase64: string;
}

export interface HistoryRescueEncryptedPart {
    partId: string;
    ivBase64: string;
    ciphertextBase64: string;
}

export interface HistoryRescueArchiveEnvelope {
    format: typeof HISTORY_RESCUE_FORMAT;
    archiveVersion: typeof HISTORY_RESCUE_ARCHIVE_VERSION;
    historySchemaVersion: typeof HISTORY_IMPORT_SCHEMA_VERSION;
    archiveId: string;
    createdAt: number;
    manifestChecksum: string;
    encryption: HistoryRescueEncryptionHeader;
    encryptedChunkCount: number;
    encryptedManifest: HistoryRescueEncryptedPart;
    encryptedChunks: HistoryRescueEncryptedPart[];
}

export interface CreateHistoryRescueArchiveInput {
    archiveId: string;
    sourceDeviceId: string;
    createdAt: number;
    recoverySecret: string;
    sections: HistoryRescueSections;
}

export interface HistoryRescueSanitizationResult {
    sections: HistoryRescueSanitizedSections;
    removedCredentialFieldCount: number;
    removedRebuildableFieldCount: number;
}

export interface HistoryTemporaryRestorePlan {
    archiveId: string;
    manifestChecksum: string;
    liveDatabaseId: string;
    temporaryDatabaseId: string;
    manifest: HistoryRescueManifest;
    sections: HistoryRescueSanitizedSections;
    status: 'archive_validated_for_temporary_restore';
    switchPreconditionsSatisfied: false;
    liveDatabaseMutationAllowed: false;
}

export interface HistoryTemporaryRestoreVerification {
    archiveId: string;
    manifestChecksum: string;
    liveDatabaseId: string;
    temporaryDatabaseId: string;
    verifiedAt: number;
    status: 'temporary_restore_verified';
    switchPreconditionsSatisfied: true;
    liveDatabaseMutationAllowed: false;
    recordCounts: Record<HistoryRescueStoreName, number>;
}

export type HistoryRescueErrorCode =
    | 'invalid_input'
    | 'invalid_archive'
    | 'unsupported_archive'
    | 'recovery_secret_too_short'
    | 'crypto_unavailable'
    | 'decryption_failed'
    | 'integrity_failed'
    | 'credential_exclusion_failed'
    | 'temporary_restore_target_invalid'
    | 'temporary_restore_mismatch';

export class HistoryRescueError extends Error {
    readonly code: HistoryRescueErrorCode;

    constructor(code: HistoryRescueErrorCode, message: string) {
        super(message);
        this.name = 'HistoryRescueError';
        this.code = code;
    }
}

export const HISTORY_RESCUE_CRYPTO_PROFILE = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    tagLength: 128,
    keyDerivation: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    minimumAcceptedIterations: 600_000,
    maximumAcceptedIterations: 2_000_000,
    saltBytes: 16,
    ivBytes: 12,
    minimumRecoverySecretBytes: 16,
    generatedRecoverySecretBytes: 32,
    chunkRecordLimit: 500,
} as const;
