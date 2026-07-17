import type {
    ContinuityScope,
    KnowledgeScope,
    MemoryStatus,
    WorldlinePromptMode,
} from '../../utils/memoryCore/types';

export type HistoryContractVersion = 1;
export type HistoryBatchId = string;
export type HistorySourceMessageId = string;
export type HistoryEventId = string;
export type HistoryProjectionId = string;
export type HistoryJobId = string;

export interface HistoryScope {
    progressBundleId: string;
    personaMaskId: string;
    charId: string;
}

export type HistorySourceFormat = 'txt' | 'docx';
export type HistorySourceMode =
    | 'relationship_chat'
    | 'roleplay'
    | 'ooc'
    | 'mixed'
    | 'unknown';

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

export type HistorySpeakerRole = 'user' | 'character' | 'system' | 'unknown';

export interface HistorySpeakerMapping {
    sourceLabel: string;
    role: HistorySpeakerRole;
    targetId?: string;
    confidence: number;
    confirmedByUser: boolean;
}

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

export type HistorySensitivity = 'normal' | 'private' | 'highly_sensitive';
export type HistoryRecallPolicy = 'never' | 'explicit_only' | 'situational' | 'resident';
export type HistoryInitiativePolicy = 'never' | 'user_prompted' | 'allowed';
export type HistoryDeliverySurface =
    | WorldlinePromptMode
    | 'group_chat'
    | 'social_feed';

export interface HistoryDeliveryPolicy {
    sensitivity: HistorySensitivity;
    allowedSurfaces: HistoryDeliverySurface[];
    recallPolicy: HistoryRecallPolicy;
    initiativePolicy: HistoryInitiativePolicy;
    archiveSearchable: boolean;
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
    sourceMode: HistorySourceMode;
    branchId?: string;
    timezonePolicy: 'source' | 'user_selected' | 'unknown';
    speakerMappings: HistorySpeakerMapping[];
    counts: HistoryImportCounts;
    status: HistoryImportBatchStatus;
    dedupeNamespace: string;
    reviewDecisionId?: string;
    reviewDecisionFingerprint?: string;
    cursor?: HistoryJobCursor;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    revision: number;
}

export interface HistorySourceFragment {
    rowId: string;
    sourceOrder: number;
    sourceLocator: HistorySourceLocator;
    originalTextHash: string;
}

export type HistorySourceMessageKind =
    | 'text'
    | 'attachment_placeholder'
    | 'system_note';

export type HistorySourceMessageStatus = 'active' | 'excluded' | 'tombstoned';

export interface HistorySourceMessage {
    schemaVersion: HistoryContractVersion;
    id: HistorySourceMessageId;
    batchId: HistoryBatchId;
    scope: HistoryScope;
    kind: HistorySourceMessageKind;
    speakerRole: HistorySpeakerRole;
    speakerId?: string;
    speakerLabel?: string;
    content: string;
    attachments: HistoryAttachmentPlaceholder[];
    sourceOrder: number;
    sourceTime: HistorySourceTime;
    importedAt: number;
    sourceLocator: HistorySourceLocator;
    sourceFragments?: HistorySourceFragment[];
    sourceFingerprint: string;
    normalizedFingerprint: string;
    sourceMode: HistorySourceMode;
    continuity: ContinuityScope;
    branchId?: string;
    knowledge: KnowledgeScope | 'unclassified';
    deliveryPolicy: HistoryDeliveryPolicy;
    status: HistorySourceMessageStatus;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export interface HistorySourceSpan {
    sourceMessageId: HistorySourceMessageId;
    sourceLocator?: HistorySourceLocator;
    quoteHash: string;
    quotePreview?: string;
}

export interface HistoryEntity {
    id?: string;
    type: 'person' | 'place' | 'object' | 'organization' | 'topic' | 'other';
    label: string;
    aliases: string[];
}

export type HistoryReviewState = 'pending' | 'accepted' | 'edited' | 'rejected';
export type HistoryDerivedStatus = MemoryStatus | 'stale';

export type HistoryEmbeddingStatus = 'pending' | 'ready' | 'stale' | 'failed';

export interface HistoryEmbeddingSlot {
    model: string;
    dimension: number;
    checksum: string;
    generatedAt?: number;
    status: HistoryEmbeddingStatus;
    values?: number[];
    errorCode?: string;
}

export interface HistoryEvent {
    schemaVersion: HistoryContractVersion;
    id: HistoryEventId;
    evidenceFamilyId: string;
    scope: HistoryScope;
    sourceBatchIds: HistoryBatchId[];
    sourceSpans: HistorySourceSpan[];
    origin: 'system_import';
    continuity: ContinuityScope;
    branchId?: string;
    knowledge: KnowledgeScope;
    status: HistoryDerivedStatus;
    title: string;
    factualSummary: string;
    happenedAt: HistorySourceTime;
    validFrom?: HistorySourceTime;
    validTo?: HistorySourceTime;
    entities: HistoryEntity[];
    tagIds: string[];
    keywords: string[];
    aliases: string[];
    importance: number;
    deliveryPolicy: HistoryDeliveryPolicy;
    reviewState: HistoryReviewState;
    conflictsWithEventIds: HistoryEventId[];
    supersedesEventIds: HistoryEventId[];
    factualEmbedding?: HistoryEmbeddingSlot;
    extractorVersion: string;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export type HistoryProjectionAuthority =
    | 'source_explicit'
    | 'source_inferred'
    | 'model_reconstructed';

export interface HistoryCompanionProjection {
    schemaVersion: HistoryContractVersion;
    id: HistoryProjectionId;
    eventId: HistoryEventId;
    scope: HistoryScope;
    sourceSpans: HistorySourceSpan[];
    innerView: string;
    relationshipDelta?: string;
    behavioralResidue?: string;
    personaPatternProposal?: string;
    authority: HistoryProjectionAuthority;
    confidence: number;
    reviewState: HistoryReviewState;
    status: HistoryDerivedStatus;
    innerViewEmbedding?: HistoryEmbeddingSlot;
    extractorVersion: string;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export type HistoryPlotDisposition =
    | 'no_plot'
    | 'atmosphere_only'
    | 'relationship_maintenance'
    | 'milestone_candidate'
    | 'plot_event'
    | 'open_thread';

export type HistoryPlotDeltaKind =
    | 'goal'
    | 'obstacle'
    | 'choice'
    | 'consequence'
    | 'open_thread'
    | 'world_state'
    | 'relationship_state';

export interface HistoryPlotDelta {
    kind: HistoryPlotDeltaKind;
    beforeState: string;
    afterState: string;
    sourceSpans: HistorySourceSpan[];
}

export interface HistoryPlotProjection {
    schemaVersion: HistoryContractVersion;
    id: HistoryProjectionId;
    eventId?: HistoryEventId;
    scope: HistoryScope;
    disposition: HistoryPlotDisposition;
    title?: string;
    summary?: string;
    deltas: HistoryPlotDelta[];
    sourceSpans: HistorySourceSpan[];
    reviewState: HistoryReviewState;
    status: HistoryDerivedStatus;
    extractorVersion: string;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export type HistoryJobKind =
    | 'import'
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

export type HistoryTagStatus = 'active' | 'deprecated' | 'merged';

export interface HistoryTagDefinition {
    schemaVersion: HistoryContractVersion;
    id: string;
    namespace: string;
    label: string;
    aliases: string[];
    status: HistoryTagStatus;
    mergedIntoTagId?: string;
    createdAt: number;
    updatedAt: number;
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

export interface HistoryEventSearchQuery extends HistoryScopedQuery, HistoryPageRequest {
    query: string;
    tagIds?: string[];
    entityLabels?: string[];
    includeRejected?: boolean;
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
    searchEvents(query: HistoryEventSearchQuery): Promise<HistoryPage<HistoryEvent>>;
    getCompanionProjection(scope: HistoryScope, eventId: HistoryEventId): Promise<HistoryCompanionProjection | null>;
    getPlotProjection(scope: HistoryScope, eventId: HistoryEventId): Promise<HistoryPlotProjection | null>;
    getJob(scope: HistoryScope, id: HistoryJobId): Promise<HistoryJob | null>;
}

export interface HistoryImportWriteRepository {
    createBatch(batch: HistoryImportBatch): Promise<void>;
    updateBatch(batch: HistoryImportBatch, expectedRevision: number): Promise<void>;
    putSourceMessageChunk(messages: HistorySourceMessage[]): Promise<HistoryWriteChunkResult>;
    putEvent(event: HistoryEvent, expectedRevision?: number): Promise<void>;
    putCompanionProjection(projection: HistoryCompanionProjection, expectedRevision?: number): Promise<void>;
    putPlotProjection(projection: HistoryPlotProjection, expectedRevision?: number): Promise<void>;
    putJob(job: HistoryJob, expectedRevision?: number): Promise<void>;
    putTagDefinition(tag: HistoryTagDefinition, expectedRevision?: number): Promise<void>;
    putBackupReceipt(receipt: HistoryBackupReceipt): Promise<void>;
    markBatchDerivedStateStale(
        scope: HistoryScope,
        batchId: HistoryBatchId,
        reason: string,
    ): Promise<Record<string, number>>;
    deleteBatchCascade(scope: HistoryScope, batchId: HistoryBatchId): Promise<HistoryCascadeResult>;
}

export interface HistoryImportRepository
    extends HistoryImportReadRepository, HistoryImportWriteRepository {}
