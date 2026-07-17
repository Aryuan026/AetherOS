import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    createHistoryScopeKey,
    validateHistorySourceMessage,
} from './contract.ts';
import type {
    HistoryIntakeWorkspaceManifest,
    HistoryIntakeWorkspaceRowRecord,
} from './intakeWorkspace.ts';
import { createHistoryJob } from './jobState.ts';
import type {
    HistoryAttachmentPlaceholder,
    HistoryImportBatch,
    HistoryJob,
    HistorySourceMessage,
} from './types.ts';

export const HISTORY_ARCHIVE_IMPORT_PLAN_VERSION = 2 as const;
export const HISTORY_ARCHIVE_IMPORT_INPUT_VERSION = 'history-intake-v2';
export const HISTORY_ARCHIVE_IMPORT_OUTPUT_VERSION = 'history-raw-archive-v2';

export interface HistoryArchiveImportPlan {
    schemaVersion: typeof HISTORY_ARCHIVE_IMPORT_PLAN_VERSION;
    id: string;
    workspaceId: string;
    intakeFingerprint: string;
    batch: HistoryImportBatch;
    job: HistoryJob;
    expectedSourceMessageCount: number;
    createdAt: number;
}

const getWebCrypto = (): Crypto => {
    if (!globalThis.crypto?.subtle) throw new Error('当前环境缺少 Web Crypto，无法生成历史档案指纹。');
    return globalThis.crypto;
};

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await getWebCrypto().subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const attachmentFor = (
    record: HistoryIntakeWorkspaceRowRecord,
): HistoryAttachmentPlaceholder[] => record.source.attachment ? [{
    id: `history-attachment-${record.source.id}`,
    kind: record.source.attachment.kind,
    sourceLabel: record.source.attachment.sourceLabel,
    available: false,
}] : [];

export const buildHistoryArchiveImportPlan = async (input: {
    manifest: HistoryIntakeWorkspaceManifest;
    now: number;
}): Promise<HistoryArchiveImportPlan> => {
    const { manifest, now } = input;
    if (manifest.status !== 'ready' || manifest.persistedRowCount !== manifest.totalRowCount) {
        throw new Error('只有完整保存的导入工作区才能写入历史档案。');
    }
    if (manifest.recordableRowCount < 1) {
        throw new Error('文件里没有可以保存的聊天原文。');
    }
    const scopeKey = createHistoryScopeKey(manifest.scope);
    const batchFingerprint = await sha256Hex(JSON.stringify({
        scopeKey,
        sourceFileSha256: manifest.sourceFile.sha256,
        parserVersion: manifest.parserVersion,
    }));
    const batchId = `history-batch-${batchFingerprint.slice(0, 32)}`;
    const jobId = `history-job-import-${batchFingerprint.slice(0, 32)}`;
    const batch: HistoryImportBatch = {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: batchId,
        scope: { ...manifest.scope },
        sourceFile: { ...manifest.sourceFile },
        counts: {
            parsed: manifest.counts.parsed,
            accepted: manifest.recordableRowCount,
            skipped: manifest.totalRowCount - manifest.recordableRowCount,
            uncertain: 0,
            duplicates: 0,
            committed: 0,
        },
        status: 'ready',
        dedupeNamespace: `history-v2:${scopeKey}`,
        intakeFingerprint: manifest.intakeFingerprint,
        createdAt: now,
        updatedAt: now,
        revision: 1,
    };
    const job = createHistoryJob({
        id: jobId,
        kind: 'import',
        scope: manifest.scope,
        batchId,
        totalCount: manifest.recordableRowCount,
        inputVersion: HISTORY_ARCHIVE_IMPORT_INPUT_VERSION,
        outputVersion: HISTORY_ARCHIVE_IMPORT_OUTPUT_VERSION,
    }, now);
    return {
        schemaVersion: HISTORY_ARCHIVE_IMPORT_PLAN_VERSION,
        id: `history-archive-plan-${batchFingerprint.slice(0, 24)}`,
        workspaceId: manifest.id,
        intakeFingerprint: manifest.intakeFingerprint,
        batch,
        job,
        expectedSourceMessageCount: manifest.recordableRowCount,
        createdAt: now,
    };
};

const sourceMessageFromRecord = async (input: {
    record: HistoryIntakeWorkspaceRowRecord;
    plan: HistoryArchiveImportPlan;
    importedAt: number;
}): Promise<HistorySourceMessage> => {
    const { record, plan, importedAt } = input;
    const attachments = attachmentFor(record);
    const sourceFingerprint = await sha256Hex(JSON.stringify({
        sourceOrder: record.sourceOrder,
        sourceLocator: record.source.sourceLocator,
        rawText: record.source.originalText,
    }));
    const idFingerprint = await sha256Hex(JSON.stringify({
        batchId: plan.batch.id,
        sourceOrder: record.sourceOrder,
        sourceFingerprint,
    }));
    const message: HistorySourceMessage = {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: `history-source-${idFingerprint.slice(0, 36)}`,
        batchId: plan.batch.id,
        scope: { ...plan.batch.scope },
        kind: record.source.kind,
        authorChannel: record.source.authorChannel,
        content: record.source.content,
        rawText: record.source.originalText,
        attachments,
        sourceOrder: record.sourceOrder,
        sourceTime: { ...record.source.sourceTime },
        importedAt,
        sourceLocator: { ...record.source.sourceLocator },
        sourceFingerprint,
        status: 'active',
        createdAt: importedAt,
        updatedAt: importedAt,
        revision: 1,
    };
    const errors = validateHistorySourceMessage(message);
    if (errors.length > 0) throw new Error(`历史原文记录无效：${errors.join('; ')}`);
    return message;
};

export const streamHistorySourceMessagesFromIntake = async function* (input: {
    plan: HistoryArchiveImportPlan;
    manifest: HistoryIntakeWorkspaceManifest;
    records: AsyncIterable<HistoryIntakeWorkspaceRowRecord>;
    importedAt: number;
}): AsyncGenerator<HistorySourceMessage> {
    if (
        input.manifest.id !== input.plan.workspaceId
        || input.manifest.intakeFingerprint !== input.plan.intakeFingerprint
    ) {
        throw new Error('历史档案计划与导入来源不一致。');
    }
    let lastOrder = -1;
    let seen = 0;
    let yielded = 0;
    for await (const record of input.records) {
        if (record.workspaceId !== input.manifest.id || record.sourceOrder <= lastOrder) {
            throw new Error('历史档案来源行不完整或顺序错误。');
        }
        lastOrder = record.sourceOrder;
        seen += 1;
        if (!record.recordable) continue;
        yield await sourceMessageFromRecord({
            record,
            plan: input.plan,
            importedAt: input.importedAt,
        });
        yielded += 1;
    }
    if (seen !== input.manifest.totalRowCount || yielded !== input.plan.expectedSourceMessageCount) {
        throw new Error(`历史档案数量不一致：来源 ${seen}，可保存 ${yielded}。`);
    }
};
