export type HistoryContractVersion = 2;
export type HistoryBatchId = string;
export type HistorySourceMessageId = string;
export type HistoryJobId = string;

export interface HistoryScope {
    progressBundleId: string;
    personaMaskId: string;
    charId: string;
}

export type HistorySourceFormat = 'txt' | 'docx';
export type HistoryTimePrecision =
    | 'exact'
    | 'minute'
    | 'day'
    | 'month'
    | 'year'
    | 'relative'
    | 'unknown';

export interface HistorySourceTime {
    originalText?: string;
    iso?: string;
    epochMs?: number;
    timezone?: string;
    precision: HistoryTimePrecision;
    confidence: number;
}

export type HistorySourceLocatorKind =
    | 'line'
    | 'paragraph'
    | 'table_cell'
    | 'document_range';

export interface HistorySourceLocator {
    kind: HistorySourceLocatorKind;
    start: number;
    end?: number;
    label?: string;
}

/**
 * The two transport channels exposed by common chat exports.
 * They describe who authored the exported turn, not which in-world actor spoke.
 */
export type HistoryAuthorChannel = 'user' | 'char';

export type HistoryAttachmentKind =
    | 'image'
    | 'audio'
    | 'video'
    | 'file'
    | 'sticker'
    | 'unknown';

export interface HistoryAttachmentPlaceholder {
    id: string;
    kind: HistoryAttachmentKind;
    sourceLabel?: string;
    available: false;
}

export interface HistorySourceFileDescriptor {
    name: string;
    format: HistorySourceFormat;
    sizeBytes: number;
    sha256: string;
    lastModifiedAt?: number;
    rawRetained: false;
}

export interface HistoryImportCounts {
    parsed: number;
    accepted: number;
    skipped: number;
    uncertain: number;
    duplicates: number;
    committed: number;
}

export type HistoryImportBatchStatus =
    | 'preview'
    | 'ready'
    | 'importing'
    | 'paused'
    | 'imported'
    | 'failed'
    | 'cancelled'
    | 'deleted';

export interface HistoryImportBatch {
    schemaVersion: HistoryContractVersion;
    id: HistoryBatchId;
    scope: HistoryScope;
    sourceFile: HistorySourceFileDescriptor;
    counts: HistoryImportCounts;
    status: HistoryImportBatchStatus;
    dedupeNamespace: string;
    intakeFingerprint: string;
    cursor?: HistoryJobCursor;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    revision: number;
}

export type HistorySourceMessageKind =
    | 'text'
    | 'attachment_placeholder'
    | 'source_fragment';

export type HistorySourceMessageStatus = 'active' | 'excluded' | 'tombstoned';

export interface HistorySourceMessage {
    schemaVersion: HistoryContractVersion;
    id: HistorySourceMessageId;
    batchId: HistoryBatchId;
    scope: HistoryScope;
    kind: HistorySourceMessageKind;
    authorChannel?: HistoryAuthorChannel;
    content: string;
    rawText: string;
    attachments: HistoryAttachmentPlaceholder[];
    sourceOrder: number;
    sourceTime: HistorySourceTime;
    importedAt: number;
    sourceLocator: HistorySourceLocator;
    sourceFingerprint: string;
    status: HistorySourceMessageStatus;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export type HistoryJobKind =
    | 'import'
    | 'relationship_analysis'
    | 'digest'
    | 'rebuild'
    | 'embedding_backfill'
    | 'delete_batch'
    | 'restore_verify';

export type HistoryJobStatus =
    | 'queued'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface HistoryJobCursor {
    processedCount: number;
    totalCount: number;
    lastSourceOrder?: number;
    lastSourceMessageId?: HistorySourceMessageId;
    lastChunkIdempotencyKey?: string;
    lastChunkFromProcessedCount?: number;
    checkpointHash?: string;
}

export interface HistoryJobChunkCheckpoint {
    idempotencyKey: string;
    fromProcessedCount: number;
    toProcessedCount: number;
    lastSourceOrder?: number;
    lastSourceMessageId?: HistorySourceMessageId;
    checkpointHash: string;
}

export interface HistoryJob {
    schemaVersion: HistoryContractVersion;
    id: HistoryJobId;
    kind: HistoryJobKind;
    scope: HistoryScope;
    batchId?: HistoryBatchId;
    status: HistoryJobStatus;
    cursor: HistoryJobCursor;
    inputVersion: string;
    outputVersion: string;
    attempts: number;
    errorCode?: string;
    errorMessage?: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    revision: number;
}

export type HistoryBackupReceiptStatus =
    | 'generated'
    | 'external_save_confirmed'
    | 'restore_verified'
    | 'failed';

export type HistoryBackupDestination =
    | 'generated_memory'
    | 'browser_download'
    | 'user_file'
    | 'native_share'
    | 'user_cloud'
    | 'temporary_cache';

export type HistoryBackupDeliveryChannel =
    | 'browser_file_picker'
    | 'browser_download'
    | 'native_share';

export type HistoryBackupDeliveryOutcomeStatus =
    | 'external_save_confirmed'
    | 'confirmation_required'
    | 'cancelled'
    | 'failed';

export type HistoryBackupDeliveryEvidence =
    | 'file_write_closed'
    | 'download_requested'
    | 'share_target_handoff'
    | 'user_attested';

export type HistoryRecoverySecretHandoffState =
    | 'not_presented'
    | 'presented_once'
    | 'copied_to_clipboard'
    | 'user_confirmed';

export interface HistoryBackupDeliveryAttempt {
    id: string;
    channel: HistoryBackupDeliveryChannel;
    destination: HistoryBackupDestination;
    outcome: HistoryBackupDeliveryOutcomeStatus;
    evidence?: HistoryBackupDeliveryEvidence;
    startedAt: number;
    completedAt: number;
    activityType?: string;
    temporaryCacheCreated: boolean;
    temporaryCacheDeleted: boolean;
    errorCode?: string;
    cleanupErrorCode?: string;
}

export interface HistoryBackupReceipt {
    schemaVersion: HistoryContractVersion;
    id: string;
    archiveId: string;
    archiveVersion: number;
    status: HistoryBackupReceiptStatus;
    destination: HistoryBackupDestination;
    externalCopyConfirmed: boolean;
    encrypted: boolean;
    credentialPolicy: 'excluded_default' | 'encrypted_complete_archive';
    manifestChecksum: string;
    recordCounts: Record<string, number>;
    recoverySecretHandoff: HistoryRecoverySecretHandoffState;
    lastDeliveryAttempt?: HistoryBackupDeliveryAttempt;
    createdAt: number;
    updatedAt: number;
    externalConfirmedAt?: number;
    verifiedAt?: number;
    errorCode?: string;
    revision: number;
}

export interface HistoryPageRequest {
    cursor?: string;
    limit: number;
    direction: 'older' | 'newer';
}

export interface HistoryPage<T> {
    items: T[];
    nextCursor?: string;
    hasMore: boolean;
}

export interface HistoryScopedQuery {
    scope: HistoryScope;
    batchId?: HistoryBatchId;
}

export interface HistorySourceMessagePageQuery extends HistoryScopedQuery, HistoryPageRequest {
    includeExcluded?: boolean;
}

export interface HistoryWriteChunkResult {
    attempted: number;
    inserted: number;
    unchanged: number;
    conflicts: number;
    checkpointHash: string;
}

export interface HistoryCascadeResult {
    batchId: HistoryBatchId;
    scope: HistoryScope;
    tombstoneId: string;
    affectedCounts: Record<string, number>;
}

export interface HistoryImportReadRepository {
    getBatch(scope: HistoryScope, id: HistoryBatchId): Promise<HistoryImportBatch | null>;
    listBatches(scope: HistoryScope): Promise<HistoryImportBatch[]>;
    pageSourceMessages(query: HistorySourceMessagePageQuery): Promise<HistoryPage<HistorySourceMessage>>;
    getSourceMessagesByIds(scope: HistoryScope, ids: HistorySourceMessageId[]): Promise<HistorySourceMessage[]>;
    getJob(scope: HistoryScope, id: HistoryJobId): Promise<HistoryJob | null>;
}

export interface HistoryImportWriteRepository {
    createBatch(batch: HistoryImportBatch): Promise<void>;
    updateBatch(batch: HistoryImportBatch, expectedRevision: number): Promise<void>;
    putSourceMessageChunk(messages: HistorySourceMessage[]): Promise<HistoryWriteChunkResult>;
    putJob(job: HistoryJob, expectedRevision?: number): Promise<void>;
    putBackupReceipt(receipt: HistoryBackupReceipt): Promise<void>;
    deleteBatchCascade(scope: HistoryScope, batchId: HistoryBatchId): Promise<HistoryCascadeResult>;
}

export interface HistoryImportRepository
    extends HistoryImportReadRepository, HistoryImportWriteRepository {}
