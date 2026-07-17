import type { HistoryIdentityBindingDraft } from './identityBinding';
import type {
    HistoryImportPreview,
    HistoryPreviewEncoding,
    HistoryPreviewRow,
    HistoryPreviewSpeakerCandidate,
} from './preview';
import type {
    HistoryPreviewReviewCounts,
    HistoryPreviewReviewResolution,
    HistoryPreviewRowReviewDraft,
    HistoryPreviewTimezonePolicy,
    HistoryPreviewReviewedRow,
} from './previewReview';
import type {
    HistoryImportCounts,
    HistoryScope,
    HistorySourceFileDescriptor,
    HistorySourceFormat,
    HistorySourceMode,
    HistorySpeakerMapping,
    HistorySpeakerRole,
} from './types';

export const HISTORY_REVIEW_WORKSPACE_VERSION = 1 as const;
export const HISTORY_REVIEW_DECISION_VERSION = 1 as const;
export const HISTORY_REVIEW_DECISION_CHUNK_ROWS = 500;

export type HistoryReviewWorkspaceStatus = 'preparing' | 'reviewing' | 'review_complete';
export type HistoryReviewWorkspaceFilter = 'all' | 'pending' | 'included' | 'excluded';
export type HistoryReviewWorkspaceBucket = 'pending' | 'included' | 'excluded';

export interface HistoryReviewWorkspaceSettings {
    sourceMode: HistorySourceMode;
    timezonePolicy: HistoryPreviewTimezonePolicy;
    selectedTimezone?: string;
    /** @deprecated Kept only so existing IndexedDB workspaces remain readable. */
    metadataConfirmedByUser: boolean;
    speakerMappings: HistorySpeakerMapping[];
}

export interface HistoryReviewWorkspaceIdentity {
    maskLabel: string;
    characterLabel: string;
}

export interface HistoryReviewWorkspaceManifest {
    schemaVersion: typeof HISTORY_REVIEW_WORKSPACE_VERSION;
    id: string;
    status: HistoryReviewWorkspaceStatus;
    bindingDraftId: string;
    scope: HistoryScope;
    identity: HistoryReviewWorkspaceIdentity;
    parserVersion: string;
    previewFingerprint: string;
    sourceFile: HistorySourceFileDescriptor;
    format: HistorySourceFormat;
    encoding: HistoryPreviewEncoding;
    counts: HistoryImportCounts;
    sourceUnitCount: number;
    totalRowCount: number;
    persistedRowCount: number;
    speakerCandidates: HistoryPreviewSpeakerCandidate[];
    warnings: string[];
    settings: HistoryReviewWorkspaceSettings;
    decision?: FrozenHistoryReviewWorkspaceDecision;
    rawRetained: false;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export interface HistoryReviewWorkspaceRowRecord {
    schemaVersion: typeof HISTORY_REVIEW_WORKSPACE_VERSION;
    id: string;
    workspaceId: string;
    sourceOrder: number;
    source: HistoryPreviewRow;
    review: HistoryPreviewRowReviewDraft;
    bucket: HistoryReviewWorkspaceBucket;
    attentionKey: 0 | 1;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export interface HistoryReviewWorkspaceAssessment {
    canComplete: boolean;
    totalRows: number;
    attentionRows: number;
    includedRows: number;
    excludedRows: number;
    missingSpeakerMappings: string[];
    timezoneValid: boolean;
}

export interface FrozenHistoryReviewWorkspaceDecision {
    schemaVersion: typeof HISTORY_REVIEW_DECISION_VERSION;
    id: string;
    fingerprint: string;
    workspaceId: string;
    previewFingerprint: string;
    parserVersion: string;
    bindingDraftId: string;
    scope: HistoryScope;
    totalRowCount: number;
    sourceMode: HistorySourceMode;
    timezonePolicy: HistoryPreviewTimezonePolicy;
    selectedTimezone?: string;
    metadataConfirmedByUser: true;
    speakerMappings: HistorySpeakerMapping[];
    counts: HistoryPreviewReviewCounts;
    chunkRowLimit: typeof HISTORY_REVIEW_DECISION_CHUNK_ROWS;
    chunkDigests: string[];
    frozen: true;
    persistence: 'indexeddb_workspace';
    productionWriteAllowed: false;
}

const cloneSpeakerMappings = (mappings: HistorySpeakerMapping[]): HistorySpeakerMapping[] => (
    mappings.map(mapping => ({ ...mapping }))
);

const normalizeMappings = (
    manifest: HistoryReviewWorkspaceManifest,
): HistorySpeakerMapping[] => {
    const byLabel = new Map(manifest.settings.speakerMappings.map(mapping => [mapping.sourceLabel, mapping]));
    return manifest.speakerCandidates.map(candidate => {
        const mapping = byLabel.get(candidate.label);
        if (!mapping?.confirmedByUser) {
            throw new Error(`说话人“${candidate.label}”还没有确认归属。`);
        }
        const targetId = mapping.role === 'user'
            ? manifest.scope.personaMaskId
            : mapping.role === 'character' ? manifest.scope.charId : undefined;
        return {
            sourceLabel: candidate.label,
            role: mapping.role,
            targetId,
            confidence: 1,
            confirmedByUser: true,
        };
    });
};

export const isValidHistoryReviewTimezone = (value?: string): boolean => {
    const normalized = value?.trim() || '';
    if (!normalized || normalized.length > 80) return false;
    if (/^(?:UTC)?[+-](?:0\d|1[0-4]):[0-5]\d$/u.test(normalized)) return true;
    return /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/u.test(normalized);
};

const initialResolutionFor = (row: HistoryPreviewRow): HistoryPreviewReviewResolution => {
    if (row.status === 'duplicate' || row.status === 'skipped') return 'excluded';
    if (row.status === 'ready') return 'accepted';
    return 'pending';
};

const bucketFor = (resolution: HistoryPreviewReviewResolution): HistoryReviewWorkspaceBucket => {
    if (resolution === 'accepted' || resolution === 'edited') return 'included';
    if (resolution === 'excluded' || resolution === 'merged') return 'excluded';
    return 'pending';
};

const needsAttention = (
    source: HistoryPreviewRow,
    review: HistoryPreviewRowReviewDraft,
): boolean => {
    if (review.resolution === 'pending') return true;
    if (review.resolution === 'accepted' || review.resolution === 'edited') {
        if (!review.content.trim()) return true;
        if (!source.speakerLabel && !review.speakerRoleConfirmedByUser) return true;
    }
    if (review.resolution === 'merged') {
        return (
            !source.issues.includes('possible_continuation')
            || !source.previousMeaningfulRowId
            || review.mergeIntoRowId !== source.previousMeaningfulRowId
            || !review.content.trim()
        );
    }
    return Boolean(review.mergeIntoRowId);
};

export const createHistoryReviewWorkspaceManifest = (input: {
    preview: HistoryImportPreview;
    bindingDraft: HistoryIdentityBindingDraft;
    now: number;
}): HistoryReviewWorkspaceManifest => {
    if (input.preview.truncated || input.preview.rows.length !== input.preview.totalPreviewRowCount) {
        throw new Error('导入工作台必须接收覆盖整个文件的规范化结果。');
    }
    const id = `history-review-workspace-${input.preview.fingerprint.slice(0, 24)}`;
    return {
        schemaVersion: HISTORY_REVIEW_WORKSPACE_VERSION,
        id,
        status: 'preparing',
        bindingDraftId: input.preview.bindingDraftId,
        scope: { ...input.preview.scope },
        identity: {
            maskLabel: input.bindingDraft.mask.label,
            characterLabel: input.bindingDraft.character.label,
        },
        parserVersion: input.preview.parserVersion,
        previewFingerprint: input.preview.fingerprint,
        sourceFile: { ...input.preview.sourceFile },
        format: input.preview.format,
        encoding: input.preview.encoding,
        counts: { ...input.preview.counts },
        sourceUnitCount: input.preview.sourceUnitCount,
        totalRowCount: input.preview.totalPreviewRowCount,
        persistedRowCount: 0,
        speakerCandidates: input.preview.speakerCandidates.map(candidate => ({
            ...candidate,
            exampleRowIds: [...candidate.exampleRowIds],
        })),
        warnings: [...input.preview.warnings],
        settings: {
            sourceMode: 'unknown',
            timezonePolicy: 'unknown',
            metadataConfirmedByUser: false,
            speakerMappings: [],
        },
        rawRetained: false,
        createdAt: input.now,
        updatedAt: input.now,
        revision: 1,
    };
};

export const createHistoryReviewWorkspaceRow = (input: {
    workspaceId: string;
    source: HistoryPreviewRow;
    now: number;
}): HistoryReviewWorkspaceRowRecord => {
    const review: HistoryPreviewRowReviewDraft = {
        rowId: input.source.id,
        content: input.source.content,
        resolution: initialResolutionFor(input.source),
        speakerRole: input.source.kind === 'system_note' ? 'system' : undefined,
        speakerRoleConfirmedByUser: false,
    };
    return {
        schemaVersion: HISTORY_REVIEW_WORKSPACE_VERSION,
        id: `${input.workspaceId}:${input.source.sourceOrder.toString().padStart(8, '0')}`,
        workspaceId: input.workspaceId,
        sourceOrder: input.source.sourceOrder,
        source: {
            ...input.source,
            scope: { ...input.source.scope },
            sourceLocator: { ...input.source.sourceLocator },
            sourceTime: { ...input.source.sourceTime },
            attachment: input.source.attachment ? { ...input.source.attachment } : undefined,
            issues: [...input.source.issues],
        },
        review,
        bucket: bucketFor(review.resolution),
        attentionKey: needsAttention(input.source, review) ? 1 : 0,
        createdAt: input.now,
        updatedAt: input.now,
        revision: 1,
    };
};

export const patchHistoryReviewWorkspaceRowRecord = (
    record: HistoryReviewWorkspaceRowRecord,
    patch: Partial<HistoryPreviewRowReviewDraft>,
    now: number,
): HistoryReviewWorkspaceRowRecord => {
    const review: HistoryPreviewRowReviewDraft = {
        ...record.review,
        ...patch,
        rowId: record.review.rowId,
    };
    if (review.resolution !== 'merged') review.mergeIntoRowId = undefined;
    return {
        ...record,
        review,
        bucket: bucketFor(review.resolution),
        attentionKey: needsAttention(record.source, review) ? 1 : 0,
        updatedAt: now,
        revision: record.revision + 1,
    };
};

export const assessHistoryReviewWorkspace = (input: {
    manifest: HistoryReviewWorkspaceManifest;
    attentionRows: number;
    includedRows: number;
    excludedRows: number;
}): HistoryReviewWorkspaceAssessment => {
    const mapped = new Set(
        input.manifest.settings.speakerMappings
            .filter(mapping => mapping.confirmedByUser)
            .map(mapping => mapping.sourceLabel),
    );
    const missingSpeakerMappings = input.manifest.speakerCandidates
        .map(candidate => candidate.label)
        .filter(label => !mapped.has(label));
    const timezoneValid = input.manifest.settings.timezonePolicy !== 'user_selected'
        || isValidHistoryReviewTimezone(input.manifest.settings.selectedTimezone);
    return {
        canComplete: (
            input.manifest.status === 'reviewing'
            && input.manifest.persistedRowCount === input.manifest.totalRowCount
            && input.attentionRows === 0
            && missingSpeakerMappings.length === 0
            && timezoneValid
        ),
        totalRows: input.manifest.totalRowCount,
        attentionRows: input.attentionRows,
        includedRows: input.includedRows,
        excludedRows: input.excludedRows,
        missingSpeakerMappings,
        timezoneValid,
    };
};

const roleTargetId = (
    role: HistorySpeakerRole,
    scope: HistoryScope,
): string | undefined => {
    if (role === 'user') return scope.personaMaskId;
    if (role === 'character') return scope.charId;
    return undefined;
};

const dispositionFor = (
    resolution: Exclude<HistoryPreviewReviewResolution, 'pending'>,
): HistoryPreviewReviewedRow['disposition'] => {
    if (resolution === 'excluded') return 'exclude';
    if (resolution === 'merged') return 'merge_into_previous';
    return 'include';
};

const sha256Hex = async (value: string): Promise<string> => {
    if (!globalThis.crypto?.subtle) throw new Error('当前环境缺少 Web Crypto，无法完成全量校对。');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const reviewedRowFromRecord = (
    record: HistoryReviewWorkspaceRowRecord,
    mappingByLabel: Map<string, HistorySpeakerMapping>,
    scope: HistoryScope,
): HistoryPreviewReviewedRow => {
    const resolution = record.review.resolution;
    if (resolution === 'pending' || record.attentionKey === 1) {
        throw new Error(`第 ${record.sourceOrder + 1} 条记录仍未确认。`);
    }
    const mappedRole = record.source.speakerLabel
        ? mappingByLabel.get(record.source.speakerLabel)?.role
        : undefined;
    const speakerRole = record.review.speakerRoleConfirmedByUser
        ? record.review.speakerRole || 'unknown'
        : mappedRole || (record.source.kind === 'system_note' ? 'system' : 'unknown');
    return {
        rowId: record.source.id,
        sourceOrder: record.source.sourceOrder,
        sourceLocator: { ...record.source.sourceLocator },
        originalText: record.source.originalText,
        content: record.review.content.trim(),
        kind: record.source.kind,
        sourceStatus: record.source.status,
        speakerLabel: record.source.speakerLabel,
        speakerRole,
        speakerId: roleTargetId(speakerRole, scope),
        speakerRoleConfirmedByUser: record.source.speakerLabel
            ? true
            : record.review.speakerRoleConfirmedByUser,
        sourceTime: { ...record.source.sourceTime },
        attachment: record.source.attachment ? { ...record.source.attachment } : undefined,
        disposition: dispositionFor(resolution),
        resolution,
        mergeIntoRowId: record.review.mergeIntoRowId,
    };
};

export const freezeHistoryReviewWorkspaceDecision = async (input: {
    manifest: HistoryReviewWorkspaceManifest;
    records: AsyncIterable<HistoryReviewWorkspaceRowRecord>;
}): Promise<FrozenHistoryReviewWorkspaceDecision> => {
    if (input.manifest.status !== 'reviewing') {
        throw new Error('只有正在校对的工作台可以完成全量决定。');
    }
    if (
        input.manifest.settings.timezonePolicy === 'user_selected'
        && !isValidHistoryReviewTimezone(input.manifest.settings.selectedTimezone)
    ) {
        throw new Error('指定时区格式无效。');
    }
    const speakerMappings = normalizeMappings(input.manifest);
    const mappingByLabel = new Map(speakerMappings.map(mapping => [mapping.sourceLabel, mapping]));
    const chunkDigests: string[] = [];
    let chunk: HistoryPreviewReviewedRow[] = [];
    let seen = 0;
    let lastSourceOrder = -1;
    let previousMeaningful: HistoryReviewWorkspaceRowRecord | undefined;
    const counts: HistoryPreviewReviewCounts = { included: 0, excluded: 0, merged: 0, edited: 0 };

    const flushChunk = async () => {
        if (chunk.length === 0) return;
        chunkDigests.push(await sha256Hex(JSON.stringify(chunk)));
        chunk = [];
    };

    for await (const record of input.records) {
        if (record.workspaceId !== input.manifest.id) throw new Error('校对行属于另一个工作台。');
        if (record.sourceOrder <= lastSourceOrder) throw new Error('校对行顺序必须严格递增。');
        if (record.review.resolution === 'merged') {
            if (
                !previousMeaningful
                || record.source.previousMeaningfulRowId !== previousMeaningful.source.id
                || record.review.mergeIntoRowId !== previousMeaningful.source.id
                || previousMeaningful.review.resolution === 'excluded'
            ) {
                throw new Error(`第 ${record.sourceOrder + 1} 条记录的合并目标无效。`);
            }
        }
        const reviewed = reviewedRowFromRecord(record, mappingByLabel, input.manifest.scope);
        if (reviewed.disposition === 'include') counts.included += 1;
        if (reviewed.disposition === 'exclude') counts.excluded += 1;
        if (reviewed.disposition === 'merge_into_previous') counts.merged += 1;
        if (reviewed.resolution === 'edited') counts.edited += 1;
        chunk.push(reviewed);
        if (chunk.length === HISTORY_REVIEW_DECISION_CHUNK_ROWS) await flushChunk();
        seen += 1;
        lastSourceOrder = record.sourceOrder;
        if (record.source.status !== 'skipped') previousMeaningful = record;
    }
    await flushChunk();
    if (seen !== input.manifest.totalRowCount || seen !== input.manifest.persistedRowCount) {
        throw new Error('校对工作台行数与清单不一致，不能完成。');
    }

    const selectedTimezone = input.manifest.settings.timezonePolicy === 'user_selected'
        ? input.manifest.settings.selectedTimezone!.trim()
        : undefined;
    const canonical = {
        schemaVersion: HISTORY_REVIEW_DECISION_VERSION,
        workspaceId: input.manifest.id,
        previewFingerprint: input.manifest.previewFingerprint,
        parserVersion: input.manifest.parserVersion,
        bindingDraftId: input.manifest.bindingDraftId,
        scope: input.manifest.scope,
        totalRowCount: input.manifest.totalRowCount,
        sourceMode: input.manifest.settings.sourceMode,
        timezonePolicy: input.manifest.settings.timezonePolicy,
        selectedTimezone,
        metadataConfirmedByUser: true,
        speakerMappings: cloneSpeakerMappings(speakerMappings),
        counts,
        chunkRowLimit: HISTORY_REVIEW_DECISION_CHUNK_ROWS,
        chunkDigests,
        frozen: true,
        persistence: 'indexeddb_workspace',
        productionWriteAllowed: false,
    } as const;
    const fingerprint = await sha256Hex(JSON.stringify(canonical));
    return Object.freeze({
        ...canonical,
        id: `history-review-decision-${fingerprint.slice(0, 24)}`,
        fingerprint,
    });
};
