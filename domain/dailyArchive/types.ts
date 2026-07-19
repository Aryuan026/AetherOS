import type { HistoryScope, HistoryTimePrecision } from '../historyImport/types.ts';
import type {
    InteractionMedium,
    InteractionProducer,
    InteractionSurface,
} from '../interactionEvidence/types.ts';

export const DAILY_ARCHIVE_SCHEMA_VERSION = 2 as const;
export const DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION = 1 as const;
export const CONVERSATION_CLIPPING_SCHEMA_VERSION = 1 as const;
export const DAILY_ARCHIVE_MESSAGE_REVISION_SCHEMA_VERSION = 1 as const;

export type DailyArchiveSource = 'history_import' | 'live_chat' | 'manual_entry';
export type DailyArchiveMessageStatus = 'active' | 'tombstoned';

export interface DailyArchiveHumanCuration {
    /** Every original archive message represented by this visible record. */
    sourceMessageIds: string[];
    correctedAt: number;
    authority: 'human_corrected';
}

export interface DailyArchiveManualEntry {
    status: 'draft' | 'confirmed';
    createdAt: number;
    updatedAt: number;
    confirmedAt?: number;
}

export interface DailyArchiveDayConfirmation {
    status: 'open' | 'confirmed';
    revision: number;
    updatedAt: number;
    confirmedAt?: number;
    activeMessageCount: number;
    manualEntryCount: number;
}

export interface DailyArchiveMessageTime {
    dateKey?: string;
    originalText?: string;
    iso?: string;
    epochMs?: number;
    timezone?: string;
    precision: HistoryTimePrecision;
}

/** Source-level transport facts only; interpretation must not be stored here. */
export interface DailyArchiveMessageOrigin {
    surface: InteractionSurface;
    medium: InteractionMedium;
    producer: InteractionProducer;
    interactionId: string;
    turnId?: string;
    responseId?: string;
    parentRecordIds?: string[];
    sequence?: number;
}

export interface DailyArchiveMessage {
    schemaVersion: typeof DAILY_ARCHIVE_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    source: DailyArchiveSource;
    sourceRecordId: string;
    sourceBatchId?: string;
    sourceOrder?: number;
    origin?: DailyArchiveMessageOrigin;
    role: 'user' | 'character' | 'system' | 'unknown';
    kind: 'text' | 'image' | 'emoji' | 'attachment' | 'system_note' | 'other';
    content: string;
    time: DailyArchiveMessageTime;
    status: DailyArchiveMessageStatus;
    recordedAt: number;
    revision: number;
    /** Optional post-import correction. It never changes temporalClass or current state. */
    curation?: DailyArchiveHumanCuration;
    /** Human-authored supplement. It becomes confirmed historical evidence only with a day lock. */
    manualEntry?: DailyArchiveManualEntry;
}

/** Superseded source snapshot retained for provenance and stale-result checks. */
export interface DailyArchiveMessageRevision {
    schemaVersion: typeof DAILY_ARCHIVE_MESSAGE_REVISION_SCHEMA_VERSION;
    id: string;
    messageId: string;
    documentId: string;
    scope: HistoryScope;
    revision: number;
    message: DailyArchiveMessage;
    archivedAt: number;
    replacedByRevision: number;
}

export interface DailyArchiveDocument {
    schemaVersion: typeof DAILY_ARCHIVE_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    dateKey?: string;
    monthKey?: string;
    undatedKey?: string;
    messages: DailyArchiveMessage[];
    messageCount: number;
    sourceKinds: DailyArchiveSource[];
    firstTimestamp?: number;
    lastTimestamp?: number;
    createdAt: number;
    updatedAt: number;
    revision: number;
    /** Dated documents can be reviewed and locked as one human-visible unit. */
    dayConfirmation?: DailyArchiveDayConfirmation;
}

export interface DailyArchiveMonthDay {
    dateKey: string;
    messageCount: number;
    sourceKinds: DailyArchiveSource[];
}

export interface DailyArchiveDocumentSummary {
    id: string;
    scope: HistoryScope;
    dateKey?: string;
    monthKey?: string;
    undatedKey?: string;
    messageCount: number;
    sourceKinds: DailyArchiveSource[];
    firstTimestamp?: number;
    lastTimestamp?: number;
    updatedAt: number;
    dayConfirmation?: DailyArchiveDayConfirmation;
}

export interface DailyArchiveChunkDescriptor {
    id: string;
    chunkIndex: number;
    entryCount: number;
    messageCount: number;
    sourceKinds: DailyArchiveSource[];
    firstTimestamp?: number;
    lastTimestamp?: number;
}

/** Lightweight day header. Message bodies live in bounded chunk records. */
export interface DailyArchiveManifest extends DailyArchiveDocumentSummary {
    schemaVersion: typeof DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION;
    chunkSize: number;
    chunkCount: number;
    entryCount: number;
    chunks: DailyArchiveChunkDescriptor[];
    createdAt: number;
    revision: number;
}

export interface DailyArchiveChunk {
    schemaVersion: typeof DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION;
    id: string;
    documentId: string;
    scope: HistoryScope;
    chunkIndex: number;
    messages: DailyArchiveMessage[];
    entryCount: number;
    messageCount: number;
    sourceKinds: DailyArchiveSource[];
    firstTimestamp?: number;
    lastTimestamp?: number;
}

export interface DailyArchiveMessagePage {
    documentId: string;
    offset: number;
    limit: number;
    totalMessageCount: number;
    messages: DailyArchiveMessage[];
    loadedChunkCount: number;
    hasBefore: boolean;
    hasAfter: boolean;
}

export type DailyArchiveRetrievalKind = 'keyword';

/** One source-linked hit shared by visible keyword search and later recall adapters. */
export interface DailyArchiveSearchHit {
    retrievalKind: DailyArchiveRetrievalKind;
    score: number;
    matchCount: number;
    documentId: string;
    documentMessageCount: number;
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
    messageId: string;
    messageOffset: number;
    role: DailyArchiveMessage['role'];
    content: string;
    time: DailyArchiveMessageTime;
    source: DailyArchiveSource;
    sourceRecordId: string;
}

export interface DailyArchiveSearchResponse {
    query: string;
    retrievalKind: DailyArchiveRetrievalKind;
    hits: DailyArchiveSearchHit[];
    totalMatchCount: number;
    scannedMessageCount: number;
    truncated: boolean;
}

export interface DailyArchiveMonthSummary {
    scope: HistoryScope;
    monthKey: string;
    days: DailyArchiveMonthDay[];
    messageCount: number;
}

export interface DailyArchiveCoverage {
    scope: HistoryScope;
    documentCount: number;
    datedDocumentCount: number;
    undatedDocumentCount: number;
    messageCount: number;
    datedMessageCount: number;
    undatedMessageCount: number;
    earliestDateKey?: string;
    latestDateKey?: string;
}

export interface DailyArchiveBackupManifest {
    schemaVersion: typeof DAILY_ARCHIVE_SCHEMA_VERSION;
    format: 'aetheros-daily-json-v2';
    documentCount: number;
    messageCount: number;
    files: Array<{
        path: string;
        documentId: string;
        byteLength: number;
        sha256: string;
    }>;
    generatedAt: number;
}

export type ConversationClippingStatus = 'source_only';

export interface ConversationClippingMessage {
    messageId: string;
    source: DailyArchiveSource;
    sourceRecordId: string;
    sourceBatchId?: string;
    sourceOrder?: number;
    role: 'user' | 'character';
    kind: DailyArchiveMessage['kind'];
    content: string;
    time: DailyArchiveMessageTime;
    revision: number;
}

/**
 * A human-selected, source-preserving excerpt for later voice analysis.
 * It is intentionally not a memory card, persona conclusion, or active prompt.
 */
export interface ConversationClipping {
    schemaVersion: typeof CONVERSATION_CLIPPING_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    title: string;
    purpose: 'voice_reference';
    status: ConversationClippingStatus;
    sourceDocumentId: string;
    sourceDateKey?: string;
    messages: ConversationClippingMessage[];
    messageCount: number;
    characterMessageCount: number;
    createdAt: number;
    updatedAt: number;
}
