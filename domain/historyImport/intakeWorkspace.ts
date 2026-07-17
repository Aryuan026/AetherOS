import type { HistoryIdentityBindingDraft } from './identityBinding';
import type {
    HistoryImportPreview,
    HistoryPreviewEncoding,
    HistoryPreviewRow,
} from './preview';
import type {
    HistoryImportCounts,
    HistoryScope,
    HistorySourceFileDescriptor,
    HistorySourceFormat,
} from './types';

export const HISTORY_INTAKE_WORKSPACE_VERSION = 2 as const;

export type HistoryIntakeWorkspaceStatus = 'preparing' | 'ready';

export interface HistoryIntakeIdentity {
    maskLabel: string;
    characterLabel: string;
}

/**
 * A resumable local transport workspace. It has no review settings, speaker
 * corrections, content classifications, timezone choices, or model output.
 */
export interface HistoryIntakeWorkspaceManifest {
    schemaVersion: typeof HISTORY_INTAKE_WORKSPACE_VERSION;
    id: string;
    status: HistoryIntakeWorkspaceStatus;
    bindingDraftId: string;
    scope: HistoryScope;
    identity: HistoryIntakeIdentity;
    parserVersion: string;
    intakeFingerprint: string;
    sourceFile: HistorySourceFileDescriptor;
    format: HistorySourceFormat;
    encoding: HistoryPreviewEncoding;
    counts: HistoryImportCounts;
    sourceUnitCount: number;
    totalRowCount: number;
    recordableRowCount: number;
    persistedRowCount: number;
    warnings: string[];
    rawFileRetained: false;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export interface HistoryIntakeWorkspaceRowRecord {
    schemaVersion: typeof HISTORY_INTAKE_WORKSPACE_VERSION;
    id: string;
    workspaceId: string;
    sourceOrder: number;
    source: HistoryPreviewRow;
    recordable: boolean;
    createdAt: number;
}

export const isHistoryIntakeRowRecordable = (row: HistoryPreviewRow): boolean => (
    row.status !== 'skipped'
    && Boolean(row.content.trim() || row.attachment)
);

export const createHistoryIntakeWorkspaceManifest = (input: {
    preview: HistoryImportPreview;
    bindingDraft: HistoryIdentityBindingDraft;
    now: number;
}): HistoryIntakeWorkspaceManifest => {
    if (input.preview.truncated || input.preview.rows.length !== input.preview.totalPreviewRowCount) {
        throw new Error('导入工作区必须接收覆盖整个文件的解析结果。');
    }
    const recordableRowCount = input.preview.rows.filter(isHistoryIntakeRowRecordable).length;
    if (recordableRowCount < 1) throw new Error('文件里没有可以保存的聊天原文。');
    return {
        schemaVersion: HISTORY_INTAKE_WORKSPACE_VERSION,
        id: `history-intake-${input.preview.fingerprint.slice(0, 24)}`,
        status: 'preparing',
        bindingDraftId: input.preview.bindingDraftId,
        scope: { ...input.preview.scope },
        identity: {
            maskLabel: input.bindingDraft.mask.label,
            characterLabel: input.bindingDraft.character.label,
        },
        parserVersion: input.preview.parserVersion,
        intakeFingerprint: input.preview.fingerprint,
        sourceFile: { ...input.preview.sourceFile },
        format: input.preview.format,
        encoding: input.preview.encoding,
        counts: {
            ...input.preview.counts,
            accepted: recordableRowCount,
            uncertain: 0,
            duplicates: 0,
        },
        sourceUnitCount: input.preview.sourceUnitCount,
        totalRowCount: input.preview.totalPreviewRowCount,
        recordableRowCount,
        persistedRowCount: 0,
        warnings: [...input.preview.warnings],
        rawFileRetained: false,
        createdAt: input.now,
        updatedAt: input.now,
        revision: 1,
    };
};

export const createHistoryIntakeWorkspaceRow = (input: {
    workspaceId: string;
    source: HistoryPreviewRow;
    now: number;
}): HistoryIntakeWorkspaceRowRecord => ({
    schemaVersion: HISTORY_INTAKE_WORKSPACE_VERSION,
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
    recordable: isHistoryIntakeRowRecordable(input.source),
    createdAt: input.now,
});
