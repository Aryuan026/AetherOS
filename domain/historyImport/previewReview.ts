import type {
    HistoryImportPreview,
    HistoryPreviewAttachment,
    HistoryPreviewRow,
    HistoryPreviewRowStatus,
} from './preview';
import type {
    HistoryScope,
    HistorySourceLocator,
    HistorySourceMessageKind,
    HistorySourceMode,
    HistorySourceTime,
    HistorySpeakerMapping,
    HistorySpeakerRole,
} from './types';

export const HISTORY_PREVIEW_REVIEW_VERSION = 1 as const;

export type HistoryPreviewReviewResolution =
    | 'pending'
    | 'accepted'
    | 'edited'
    | 'excluded'
    | 'merged';

export type HistoryPreviewReviewDisposition = 'include' | 'exclude' | 'merge_into_previous';
export type HistoryPreviewReviewCoverage = 'complete_preview' | 'materialized_prefix';
export type HistoryPreviewTimezonePolicy = 'source' | 'user_selected' | 'unknown';

export interface HistoryPreviewRowReviewDraft {
    rowId: string;
    content: string;
    resolution: HistoryPreviewReviewResolution;
    speakerRole?: HistorySpeakerRole;
    speakerRoleConfirmedByUser: boolean;
    mergeIntoRowId?: string;
}

export interface HistoryPreviewReviewDraftInput {
    sourceMode: HistorySourceMode;
    timezonePolicy: HistoryPreviewTimezonePolicy;
    selectedTimezone?: string;
    /** @deprecated Kept only so existing serialized review drafts remain readable. */
    metadataConfirmedByUser: boolean;
    speakerMappings: HistorySpeakerMapping[];
    rows: HistoryPreviewRowReviewDraft[];
}

export interface HistoryPreviewReviewedRow {
    rowId: string;
    sourceOrder: number;
    sourceLocator: HistorySourceLocator;
    originalText: string;
    content: string;
    kind: HistorySourceMessageKind;
    sourceStatus: HistoryPreviewRowStatus;
    speakerLabel?: string;
    speakerRole: HistorySpeakerRole;
    speakerId?: string;
    speakerRoleConfirmedByUser: boolean;
    sourceTime: HistorySourceTime;
    attachment?: HistoryPreviewAttachment;
    disposition: HistoryPreviewReviewDisposition;
    resolution: Exclude<HistoryPreviewReviewResolution, 'pending'>;
    mergeIntoRowId?: string;
}

export interface HistoryPreviewReviewCounts {
    included: number;
    excluded: number;
    merged: number;
    edited: number;
}

export interface FrozenHistoryPreviewDecision {
    schemaVersion: typeof HISTORY_PREVIEW_REVIEW_VERSION;
    id: string;
    fingerprint: string;
    previewFingerprint: string;
    parserVersion: string;
    bindingDraftId: string;
    scope: HistoryScope;
    coverage: HistoryPreviewReviewCoverage;
    materializedRowCount: number;
    totalPreviewRowCount: number;
    sourceMode: HistorySourceMode;
    timezonePolicy: HistoryPreviewTimezonePolicy;
    selectedTimezone?: string;
    metadataConfirmedByUser: true;
    speakerMappings: HistorySpeakerMapping[];
    rows: HistoryPreviewReviewedRow[];
    counts: HistoryPreviewReviewCounts;
    frozen: true;
    persistence: 'memory_only';
    productionWriteAllowed: false;
}

export interface HistoryPreviewReviewAssessment {
    canFreeze: boolean;
    missingSpeakerMappings: string[];
    pendingRowIds: string[];
    missingRowRoleIds: string[];
    invalidRowIds: string[];
    timezoneValid: boolean;
}

const cloneSourceTime = (value: HistorySourceTime): HistorySourceTime => ({ ...value });

const cloneAttachment = (
    value?: HistoryPreviewAttachment,
): HistoryPreviewAttachment | undefined => value ? { ...value } : undefined;

const initialResolutionFor = (row: HistoryPreviewRow): HistoryPreviewReviewResolution => {
    if (row.status === 'duplicate' || row.status === 'skipped') return 'excluded';
    if (row.status === 'ready') return 'accepted';
    return 'pending';
};

export const createHistoryPreviewRowReviewDrafts = (
    preview: HistoryImportPreview,
): HistoryPreviewRowReviewDraft[] => preview.rows.map(row => ({
    rowId: row.id,
    content: row.content,
    resolution: initialResolutionFor(row),
    speakerRole: row.kind === 'system_note' ? 'system' : undefined,
    speakerRoleConfirmedByUser: false,
}));

const isValidTimezone = (value?: string): boolean => {
    const normalized = value?.trim() || '';
    if (!normalized || normalized.length > 80) return false;
    if (/^(?:UTC)?[+-](?:0\d|1[0-4]):[0-5]\d$/u.test(normalized)) return true;
    return /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/u.test(normalized);
};

const mappingTargetId = (
    role: HistorySpeakerRole,
    scope: HistoryScope,
): string | undefined => {
    if (role === 'user') return scope.personaMaskId;
    if (role === 'character') return scope.charId;
    return undefined;
};

const rowDisposition = (
    resolution: Exclude<HistoryPreviewReviewResolution, 'pending'>,
): HistoryPreviewReviewDisposition => {
    if (resolution === 'excluded') return 'exclude';
    if (resolution === 'merged') return 'merge_into_previous';
    return 'include';
};

const previousMergeTarget = (
    preview: HistoryImportPreview,
    row: HistoryPreviewRow,
): HistoryPreviewRow | undefined => {
    const index = preview.rows.findIndex(candidate => candidate.id === row.id);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (preview.rows[cursor].status !== 'skipped') return preview.rows[cursor];
    }
    return undefined;
};

export const assessHistoryPreviewReview = (
    preview: HistoryImportPreview,
    input: HistoryPreviewReviewDraftInput,
): HistoryPreviewReviewAssessment => {
    const candidateLabels = new Set(preview.speakerCandidates.map(candidate => candidate.label));
    const confirmedMappings = new Map(
        input.speakerMappings
            .filter(mapping => mapping.confirmedByUser && candidateLabels.has(mapping.sourceLabel))
            .map(mapping => [mapping.sourceLabel, mapping]),
    );
    const missingSpeakerMappings = preview.speakerCandidates
        .map(candidate => candidate.label)
        .filter(label => !confirmedMappings.has(label));
    const draftByRowId = new Map(input.rows.map(row => [row.rowId, row]));
    const previewRowIds = new Set(preview.rows.map(row => row.id));
    const pendingRowIds: string[] = [];
    const missingRowRoleIds: string[] = [];
    const invalidRowIds: string[] = [];

    if (draftByRowId.size !== preview.rows.length || input.rows.length !== preview.rows.length) {
        preview.rows.forEach(row => {
            if (!draftByRowId.has(row.id)) invalidRowIds.push(row.id);
        });
        input.rows.forEach(row => {
            if (!previewRowIds.has(row.rowId)) invalidRowIds.push(row.rowId);
        });
        if (draftByRowId.size !== input.rows.length) invalidRowIds.push('__duplicate_review_row__');
    }

    preview.rows.forEach(row => {
        const draft = draftByRowId.get(row.id);
        if (!draft) return;
        if (draft.resolution === 'pending') pendingRowIds.push(row.id);
        if (
            (draft.resolution === 'accepted' || draft.resolution === 'edited')
            && !row.speakerLabel
            && !draft.speakerRoleConfirmedByUser
        ) {
            missingRowRoleIds.push(row.id);
        }
        if (
            (draft.resolution === 'accepted' || draft.resolution === 'edited')
            && !draft.content.trim()
        ) {
            invalidRowIds.push(row.id);
        }
        if (draft.resolution === 'merged') {
            const target = previousMergeTarget(preview, row);
            const targetDraft = target ? draftByRowId.get(target.id) : undefined;
            if (
                !row.issues.includes('possible_continuation')
                || !target
                || draft.mergeIntoRowId !== target.id
                || !draft.content.trim()
                || targetDraft?.resolution === 'excluded'
            ) {
                invalidRowIds.push(row.id);
            }
        } else if (draft.mergeIntoRowId) {
            invalidRowIds.push(row.id);
        }
    });

    const timezoneValid = input.timezonePolicy !== 'user_selected'
        || isValidTimezone(input.selectedTimezone);

    return {
        canFreeze: (
            timezoneValid
            && missingSpeakerMappings.length === 0
            && pendingRowIds.length === 0
            && missingRowRoleIds.length === 0
            && invalidRowIds.length === 0
        ),
        missingSpeakerMappings,
        pendingRowIds,
        missingRowRoleIds,
        invalidRowIds: [...new Set(invalidRowIds)],
        timezoneValid,
    };
};

const cloneAndNormalizeMappings = (
    preview: HistoryImportPreview,
    input: HistoryPreviewReviewDraftInput,
): HistorySpeakerMapping[] => {
    const byLabel = new Map(input.speakerMappings.map(mapping => [mapping.sourceLabel, mapping]));
    return preview.speakerCandidates.map(candidate => {
        const mapping = byLabel.get(candidate.label)!;
        return {
            sourceLabel: candidate.label,
            role: mapping.role,
            targetId: mappingTargetId(mapping.role, preview.scope),
            confidence: 1,
            confirmedByUser: true,
        };
    });
};

const sha256Hex = async (value: string): Promise<string> => {
    if (!globalThis.crypto?.subtle) {
        throw new Error('当前环境缺少 Web Crypto，无法冻结审阅决定。');
    }
    const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const deepFreeze = <T>(value: T): T => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value as Record<string, unknown>).forEach(child => deepFreeze(child));
    return Object.freeze(value);
};

export const freezeHistoryPreviewDecision = async (
    preview: HistoryImportPreview,
    input: HistoryPreviewReviewDraftInput,
): Promise<FrozenHistoryPreviewDecision> => {
    if (preview.productionWriteAllowed !== false || preview.persistence !== 'memory_only') {
        throw new Error('只能冻结无生产写权限的页面预览。');
    }
    const assessment = assessHistoryPreviewReview(preview, input);
    if (!assessment.canFreeze) {
        throw new Error('审阅仍有未确认项，不能冻结这一版。');
    }

    const mappingByLabel = new Map(
        cloneAndNormalizeMappings(preview, input).map(mapping => [mapping.sourceLabel, mapping]),
    );
    const draftByRowId = new Map(input.rows.map(row => [row.rowId, row]));
    const rows: HistoryPreviewReviewedRow[] = preview.rows.map(sourceRow => {
        const draft = draftByRowId.get(sourceRow.id)!;
        const resolution = draft.resolution as Exclude<HistoryPreviewReviewResolution, 'pending'>;
        const mappedRole = sourceRow.speakerLabel
            ? mappingByLabel.get(sourceRow.speakerLabel)?.role
            : undefined;
        const speakerRole = draft.speakerRoleConfirmedByUser
            ? draft.speakerRole || 'unknown'
            : mappedRole || (sourceRow.kind === 'system_note' ? 'system' : 'unknown');
        return {
            rowId: sourceRow.id,
            sourceOrder: sourceRow.sourceOrder,
            sourceLocator: { ...sourceRow.sourceLocator },
            originalText: sourceRow.originalText,
            content: draft.content.trim(),
            kind: sourceRow.kind,
            sourceStatus: sourceRow.status,
            speakerLabel: sourceRow.speakerLabel,
            speakerRole,
            speakerId: mappingTargetId(speakerRole, preview.scope),
            speakerRoleConfirmedByUser: sourceRow.speakerLabel
                ? true
                : draft.speakerRoleConfirmedByUser,
            sourceTime: cloneSourceTime(sourceRow.sourceTime),
            attachment: cloneAttachment(sourceRow.attachment),
            disposition: rowDisposition(resolution),
            resolution,
            mergeIntoRowId: draft.mergeIntoRowId,
        };
    });
    const speakerMappings = [...mappingByLabel.values()];
    const counts: HistoryPreviewReviewCounts = {
        included: rows.filter(row => row.disposition === 'include').length,
        excluded: rows.filter(row => row.disposition === 'exclude').length,
        merged: rows.filter(row => row.disposition === 'merge_into_previous').length,
        edited: rows.filter(row => row.resolution === 'edited').length,
    };
    const normalizedTimezone = input.timezonePolicy === 'user_selected'
        ? input.selectedTimezone!.trim()
        : undefined;
    const canonical = {
        schemaVersion: HISTORY_PREVIEW_REVIEW_VERSION,
        previewFingerprint: preview.fingerprint,
        parserVersion: preview.parserVersion,
        bindingDraftId: preview.bindingDraftId,
        scope: preview.scope,
        coverage: preview.truncated ? 'materialized_prefix' : 'complete_preview',
        materializedRowCount: preview.materializedRowCount,
        totalPreviewRowCount: preview.totalPreviewRowCount,
        sourceMode: input.sourceMode,
        timezonePolicy: input.timezonePolicy,
        selectedTimezone: normalizedTimezone,
        metadataConfirmedByUser: true,
        speakerMappings,
        rows,
        counts,
        frozen: true,
        persistence: 'memory_only',
        productionWriteAllowed: false,
    } as const;
    const fingerprint = await sha256Hex(JSON.stringify(canonical));
    return deepFreeze({
        ...canonical,
        id: `history-preview-review-${fingerprint.slice(0, 20)}`,
        fingerprint,
    });
};
