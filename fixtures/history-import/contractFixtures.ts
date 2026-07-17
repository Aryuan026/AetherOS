import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    HISTORY_RAW_SOURCE_DELIVERY_POLICY,
} from '../../domain/historyImport/contract.ts';
import type {
    HistoryBackupReceipt,
    HistoryPlotProjection,
    HistoryScope,
    HistorySourceMessage,
    HistorySourceSpan,
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

export const HISTORY_SOURCE_SPAN_FIXTURE: HistorySourceSpan = {
    sourceMessageId: 'hmsg-synthetic-0001',
    sourceLocator: {
        kind: 'line',
        start: 1,
        end: 1,
    },
    quoteHash: 'sha256:synthetic-blue-box-line',
    quotePreview: '把钥匙放进蓝色盒子里。',
};

export const HISTORY_SOURCE_MESSAGE_FIXTURE: HistorySourceMessage = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: HISTORY_SOURCE_SPAN_FIXTURE.sourceMessageId,
    batchId: 'hbatch-synthetic-alpha',
    scope: HISTORY_SCOPE_ALPHA,
    kind: 'text',
    speakerRole: 'user',
    speakerId: 'user-synthetic-alpha',
    speakerLabel: '我',
    content: '今天把钥匙放进蓝色盒子里。',
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
    normalizedFingerprint: 'sha256:synthetic-normalized-line-0001',
    sourceMode: 'relationship_chat',
    continuity: 'relationship',
    knowledge: 'shared',
    deliveryPolicy: {
        ...HISTORY_RAW_SOURCE_DELIVERY_POLICY,
        allowedSurfaces: [],
    },
    status: 'active',
    createdAt: 1_768_406_400_000,
    updatedAt: 1_768_406_400_000,
    revision: 1,
};

export const HISTORY_NO_PLOT_FIXTURE: HistoryPlotProjection = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'hplot-synthetic-no-plot',
    scope: HISTORY_SCOPE_ALPHA,
    disposition: 'no_plot',
    summary: '两个人分享了普通的晚安与日常关心，没有产生剧情状态变化。',
    deltas: [],
    sourceSpans: [HISTORY_SOURCE_SPAN_FIXTURE],
    reviewState: 'pending',
    status: 'draft',
    extractorVersion: 'fixture-contract-v1',
    createdAt: 1_768_406_400_000,
    updatedAt: 1_768_406_400_000,
    revision: 1,
};

export const HISTORY_PLOT_POSITIVE_FIXTURE: HistoryPlotProjection = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'hplot-synthetic-positive',
    eventId: 'hevent-synthetic-blue-box-promise',
    scope: HISTORY_SCOPE_ALPHA,
    disposition: 'plot_event',
    title: '共同保管钥匙的约定',
    summary: '双方从没有共同保管安排，变成明确约定由角色保管备用钥匙。',
    deltas: [
        {
            kind: 'relationship_state',
            beforeState: '双方没有共同保管物品的约定',
            afterState: '双方明确约定由角色保管备用钥匙',
            sourceSpans: [HISTORY_SOURCE_SPAN_FIXTURE],
        },
    ],
    sourceSpans: [HISTORY_SOURCE_SPAN_FIXTURE],
    reviewState: 'pending',
    status: 'draft',
    extractorVersion: 'fixture-contract-v1',
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
        history_events: 1,
    },
    recoverySecretHandoff: 'user_confirmed',
    createdAt: 1_768_406_400_000,
    updatedAt: 1_768_406_401_000,
    externalConfirmedAt: 1_768_406_400_500,
    verifiedAt: 1_768_406_401_000,
    revision: 3,
};
