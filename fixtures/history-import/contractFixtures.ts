import { HISTORY_IMPORT_SCHEMA_VERSION } from '../../domain/historyImport/contract.ts';
import type {
    HistoryBackupReceipt,
    HistoryScope,
    HistorySourceMessage,
} from '../../domain/historyImport/types.ts';

export const HISTORY_SCOPE_ALPHA: HistoryScope = {
    progressBundleId: 'progress-synthetic-alpha',
    personaMaskId: 'mask-synthetic-alpha',
    charId: 'char-synthetic-shared',
};

export const HISTORY_SCOPE_BETA: HistoryScope = {
    progressBundleId: 'progress-synthetic-beta',
    personaMaskId: 'mask-synthetic-beta',
    charId: 'char-synthetic-shared',
};

export const HISTORY_SOURCE_MESSAGE_FIXTURE: HistorySourceMessage = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'hmsg-synthetic-0001',
    batchId: 'hbatch-synthetic-alpha',
    scope: HISTORY_SCOPE_ALPHA,
    kind: 'text',
    authorChannel: 'user',
    content: '今天把钥匙放进蓝色盒子里。',
    rawText: 'user:今天把钥匙放进蓝色盒子里。\ntimestamp:2024-01-02 08:30',
    attachments: [],
    sourceOrder: 0,
    sourceTime: {
        originalText: '2024-01-02 08:30',
        iso: '2024-01-02T08:30:00+08:00',
        epochMs: 1_704_155_400_000,
        timezone: 'Asia/Shanghai',
        precision: 'exact',
        confidence: 1,
    },
    importedAt: 1_768_406_400_000,
    sourceLocator: {
        kind: 'line',
        start: 1,
        end: 1,
    },
    sourceFingerprint: 'sha256:synthetic-source-line-0001',
    status: 'active',
    createdAt: 1_768_406_400_000,
    updatedAt: 1_768_406_400_000,
    revision: 1,
};

export const HISTORY_BACKUP_RECEIPT_FIXTURE: HistoryBackupReceipt = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'hbackup-synthetic-verified',
    archiveId: 'hrescue-synthetic-verified',
    archiveVersion: 1,
    status: 'restore_verified',
    destination: 'user_file',
    externalCopyConfirmed: true,
    encrypted: true,
    credentialPolicy: 'excluded_default',
    manifestChecksum: 'sha256:synthetic-rescue-manifest',
    recordCounts: {
        history_import_batches: 1,
        history_source_messages: 1,
        history_jobs: 1,
        history_backup_receipts: 1,
    },
    recoverySecretHandoff: 'user_confirmed',
    createdAt: 1_768_406_400_000,
    updatedAt: 1_768_406_401_000,
    externalConfirmedAt: 1_768_406_400_500,
    verifiedAt: 1_768_406_401_000,
    revision: 3,
};
