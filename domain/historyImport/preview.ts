import type {
    HistoryAttachmentKind,
    HistoryImportCounts,
    HistoryScope,
    HistorySourceFileDescriptor,
    HistorySourceFormat,
    HistorySourceLocator,
    HistorySourceMessageKind,
    HistorySourceTime,
} from './types';

export const HISTORY_IMPORT_PREVIEW_VERSION = 1 as const;
export const HISTORY_IMPORT_PARSER_VERSION = 'history-preview-v2';

export type HistoryPreviewEncoding =
    | 'utf-8'
    | 'utf-8-bom'
    | 'utf-16le'
    | 'utf-16be'
    | 'gb18030'
    | 'docx-xml';

export type HistoryPreviewRowStatus = 'ready' | 'uncertain' | 'duplicate' | 'skipped';

export type HistoryPreviewIssueCode =
    | 'empty_source_unit'
    | 'separator_only'
    | 'missing_speaker'
    | 'empty_content'
    | 'possible_continuation'
    | 'attachment_missing'
    | 'system_or_ooc_candidate'
    | 'exact_duplicate';

export interface HistoryPreviewAttachment {
    kind: HistoryAttachmentKind;
    sourceLabel: string;
    available: false;
}

export interface HistoryPreviewRow {
    schemaVersion: typeof HISTORY_IMPORT_PREVIEW_VERSION;
    id: string;
    scope: HistoryScope;
    sourceOrder: number;
    sourceLocator: HistorySourceLocator;
    originalText: string;
    content: string;
    kind: HistorySourceMessageKind;
    status: HistoryPreviewRowStatus;
    speakerLabel?: string;
    sourceTime: HistorySourceTime;
    attachment?: HistoryPreviewAttachment;
    issues: HistoryPreviewIssueCode[];
    duplicateOfRowId?: string;
    previousMeaningfulRowId?: string;
}

export interface HistoryPreviewSpeakerCandidate {
    label: string;
    occurrences: number;
    exampleRowIds: string[];
}

export interface HistoryImportPreview {
    schemaVersion: typeof HISTORY_IMPORT_PREVIEW_VERSION;
    parserVersion: typeof HISTORY_IMPORT_PARSER_VERSION;
    bindingDraftId: string;
    scope: HistoryScope;
    sourceFile: HistorySourceFileDescriptor;
    format: HistorySourceFormat;
    encoding: HistoryPreviewEncoding;
    fingerprint: string;
    counts: HistoryImportCounts;
    sourceUnitCount: number;
    totalPreviewRowCount: number;
    materializedRowCount: number;
    truncated: boolean;
    speakerCandidates: HistoryPreviewSpeakerCandidate[];
    rows: HistoryPreviewRow[];
    warnings: string[];
    rawRetained: false;
    persistence: 'memory_only';
    productionWriteAllowed: false;
}

export interface HistorySourceUnit {
    sourceOrder: number;
    locator: HistorySourceLocator;
    text: string;
}
