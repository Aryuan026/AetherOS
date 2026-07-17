import type { HistoryScope, HistoryTimePrecision } from '../historyImport/types.ts';

export const DAILY_ARCHIVE_SCHEMA_VERSION = 1 as const;
export const DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION = 1 as const;
export const CONVERSATION_CLIPPING_SCHEMA_VERSION = 1 as const;

export type DailyArchiveSource = 'history_import' | 'live_chat';
export type DailyArchiveMessageStatus = 'active' | 'tombstoned';

export interface DailyArchiveMessageTime {
    dateKey?: string;
    originalText?: string;
    iso?: string;
    epochMs?: number;
    timezone?: string;
    precision: HistoryTimePrecision;
}

export interface DailyArchiveMessage {
    schemaVersion: typeof DAILY_ARCHIVE_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    source: DailyArchiveSource;
    sourceRecordId: string;
    sourceBatchId?: string;
    sourceOrder?: number;
    role: 'user' | 'character' | 'system' | 'unknown';
    kind: 'text' | 'image' | 'emoji' | 'attachment' | 'system_note' | 'other';
    content: string;
    time: DailyArchiveMessageTime;
    status: DailyArchiveMessageStatus;
    recordedAt: number;
    revision: number;
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
    format: 'aetheros-daily-json-v1';
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
