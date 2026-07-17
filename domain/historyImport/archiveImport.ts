import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    HISTORY_RAW_SOURCE_DELIVERY_POLICY,
    createHistoryScopeKey,
    validateHistorySourceMessage,
} from './contract.ts';
import { createHistoryJob } from './jobState.ts';
import type {
    HistoryAttachmentPlaceholder,
    HistoryImportBatch,
    HistoryJob,
    HistorySourceFragment,
    HistorySourceMessage,
    HistorySourceMode,
    HistorySourceTime,
    HistorySpeakerMapping,
    HistorySpeakerRole,
} from './types.ts';
import type {
    FrozenHistoryReviewWorkspaceDecision,
    HistoryReviewWorkspaceManifest,
    HistoryReviewWorkspaceRowRecord,
} from './reviewWorkspace.ts';

export const HISTORY_ARCHIVE_IMPORT_PLAN_VERSION = 1 as const;
export const HISTORY_ARCHIVE_IMPORT_INPUT_VERSION = 'history-review-decision-v1';
export const HISTORY_ARCHIVE_IMPORT_OUTPUT_VERSION = 'history-sidecar-v1';

export interface HistoryArchiveImportPlan {
    schemaVersion: typeof HISTORY_ARCHIVE_IMPORT_PLAN_VERSION;
    id: string;
    workspaceId: string;
    decisionId: string;
    decisionFingerprint: string;
    batch: HistoryImportBatch;
    job: HistoryJob;
    expectedSourceMessageCount: number;
    createdAt: number;
}

interface PendingLogicalMessage {
    base: HistoryReviewWorkspaceRowRecord;
    contentParts: string[];
    fragments: HistorySourceFragment[];
    attachments: HistoryAttachmentPlaceholder[];
}

const getWebCrypto = (): Crypto => {
    if (!globalThis.crypto?.subtle) throw new Error('当前环境缺少 Web Crypto，无法生成正式档案指纹。');
    return globalThis.crypto;
};

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await getWebCrypto().subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const normalizeSpeakerMappings = (
    mappings: HistorySpeakerMapping[],
): HistorySpeakerMapping[] => mappings
    .map(mapping => ({ ...mapping }))
    .sort((left, right) => left.sourceLabel.localeCompare(right.sourceLabel, 'zh-CN'));

const continuityFor = (mode: HistorySourceMode): HistorySourceMessage['continuity'] => {
    if (mode === 'relationship_chat') return 'relationship';
    if (mode === 'roleplay') return 'branch';
    return 'scene_only';
};

const speakerFor = (input: {
    record: HistoryReviewWorkspaceRowRecord;
    mappingByLabel: Map<string, HistorySpeakerMapping>;
}): { role: HistorySpeakerRole; id?: string } => {
    if (input.record.review.speakerRoleConfirmedByUser) {
        const role = input.record.review.speakerRole || 'unknown';
        return {
            role,
            id: role === 'user'
                ? input.record.source.scope.personaMaskId
                : role === 'character' ? input.record.source.scope.charId : undefined,
        };
    }
    const mapping = input.record.source.speakerLabel
        ? input.mappingByLabel.get(input.record.source.speakerLabel)
        : undefined;
    if (mapping) return { role: mapping.role, id: mapping.targetId };
    if (input.record.source.kind === 'system_note') return { role: 'system' };
    return { role: 'unknown' };
};

const interpretedSourceTime = (
    value: HistorySourceTime,
    decision: FrozenHistoryReviewWorkspaceDecision,
): HistorySourceTime => {
    const next = { ...value };
    if (next.precision === 'exact' && next.epochMs === undefined && !next.iso && next.originalText) {
        const wallClock = next.originalText.trim().match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})$/u,
        );
        if (wallClock) {
            const [, year, month, day, hour, minute, seconds] = wallClock;
            next.iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${seconds}`;
        }
    }
    if (decision.timezonePolicy === 'user_selected' && decision.selectedTimezone) {
        next.timezone = decision.selectedTimezone;
    }
    if (decision.timezonePolicy === 'unknown') delete next.timezone;
    return next;
};

const fragmentFor = async (
    record: HistoryReviewWorkspaceRowRecord,
): Promise<HistorySourceFragment> => ({
    rowId: record.source.id,
    sourceOrder: record.source.sourceOrder,
    sourceLocator: { ...record.source.sourceLocator },
    originalTextHash: await sha256Hex(record.source.originalText),
});

const attachmentFor = (
    record: HistoryReviewWorkspaceRowRecord,
): HistoryAttachmentPlaceholder[] => record.source.attachment ? [{
    id: `history-attachment-${record.source.id}`,
    kind: record.source.attachment.kind,
    sourceLabel: record.source.attachment.sourceLabel,
    available: false,
}] : [];

export const buildHistoryArchiveImportPlan = async (input: {
    manifest: HistoryReviewWorkspaceManifest;
    now: number;
}): Promise<HistoryArchiveImportPlan> => {
    const { manifest, now } = input;
    const decision = manifest.decision;
    if (manifest.status !== 'review_complete' || !decision?.frozen) {
        throw new Error('只有已经完成全量校对的工作台才能准备正式档案。');
    }
    if (decision.productionWriteAllowed !== false) {
        throw new Error('校对决定不能自行授予正式档案写入权限。');
    }
    if (decision.counts.included < 1) {
        throw new Error('没有保留任何聊天记录，不能创建空的正式导入批次。');
    }
    const mappings = normalizeSpeakerMappings(decision.speakerMappings);
    const scopeKey = createHistoryScopeKey(decision.scope);
    const mappingFingerprint = await sha256Hex(JSON.stringify(mappings));
    const batchFingerprint = await sha256Hex(JSON.stringify({
        scopeKey,
        sourceFileSha256: manifest.sourceFile.sha256,
        mappingFingerprint,
    }));
    const batchId = `history-batch-${batchFingerprint.slice(0, 32)}`;
    const jobId = `history-job-import-${batchFingerprint.slice(0, 32)}`;
    const branchId = decision.sourceMode === 'roleplay'
        ? `history-branch-${batchFingerprint.slice(0, 24)}`
        : undefined;
    const batch: HistoryImportBatch = {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: batchId,
        scope: { ...decision.scope },
        sourceFile: { ...manifest.sourceFile },
        sourceMode: decision.sourceMode,
        branchId,
        timezonePolicy: decision.timezonePolicy,
        speakerMappings: mappings,
        counts: {
            parsed: manifest.counts.parsed,
            accepted: decision.counts.included,
            skipped: decision.counts.excluded + decision.counts.merged,
            uncertain: 0,
            duplicates: manifest.counts.duplicates,
            committed: 0,
        },
        status: 'ready',
        dedupeNamespace: `history-v1:${scopeKey}`,
        reviewDecisionId: decision.id,
        reviewDecisionFingerprint: decision.fingerprint,
        createdAt: now,
        updatedAt: now,
        revision: 1,
    };
    const job = createHistoryJob({
        id: jobId,
        kind: 'import',
        scope: decision.scope,
        batchId,
        totalCount: decision.counts.included,
        inputVersion: HISTORY_ARCHIVE_IMPORT_INPUT_VERSION,
        outputVersion: HISTORY_ARCHIVE_IMPORT_OUTPUT_VERSION,
    }, now);
    return {
        schemaVersion: HISTORY_ARCHIVE_IMPORT_PLAN_VERSION,
        id: `history-archive-plan-${decision.fingerprint.slice(0, 24)}`,
        workspaceId: manifest.id,
        decisionId: decision.id,
        decisionFingerprint: decision.fingerprint,
        batch,
        job,
        expectedSourceMessageCount: decision.counts.included,
        createdAt: now,
    };
};

const sourceMessageFromPending = async (input: {
    pending: PendingLogicalMessage;
    plan: HistoryArchiveImportPlan;
    decision: FrozenHistoryReviewWorkspaceDecision;
    mappingByLabel: Map<string, HistorySpeakerMapping>;
    importedAt: number;
}): Promise<HistorySourceMessage> => {
    const { pending, plan, decision, mappingByLabel, importedAt } = input;
    const speaker = speakerFor({ record: pending.base, mappingByLabel });
    const content = pending.contentParts.join('\n').trim();
    const sourceFingerprint = await sha256Hex(JSON.stringify({
        fragments: pending.fragments,
    }));
    const normalizedFingerprint = await sha256Hex(JSON.stringify({
        speakerRole: speaker.role,
        speakerId: speaker.id,
        speakerLabel: pending.base.source.speakerLabel,
        content,
        sourceTime: pending.base.source.sourceTime,
        attachments: pending.attachments,
        sourceMode: decision.sourceMode,
    }));
    const messageIdFingerprint = await sha256Hex(JSON.stringify({
        batchId: plan.batch.id,
        sourceOrder: pending.base.sourceOrder,
        sourceFingerprint,
    }));
    const message: HistorySourceMessage = {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: `history-source-${messageIdFingerprint.slice(0, 36)}`,
        batchId: plan.batch.id,
        scope: { ...plan.batch.scope },
        kind: pending.base.source.kind,
        speakerRole: speaker.role,
        speakerId: speaker.id,
        speakerLabel: pending.base.source.speakerLabel,
        content,
        attachments: pending.attachments.map(attachment => ({ ...attachment })),
        sourceOrder: pending.base.sourceOrder,
        sourceTime: interpretedSourceTime(pending.base.source.sourceTime, decision),
        importedAt,
        sourceLocator: { ...pending.base.source.sourceLocator },
        sourceFragments: pending.fragments.map(fragment => ({
            ...fragment,
            sourceLocator: { ...fragment.sourceLocator },
        })),
        sourceFingerprint,
        normalizedFingerprint,
        sourceMode: decision.sourceMode,
        continuity: continuityFor(decision.sourceMode),
        branchId: plan.batch.branchId,
        knowledge: 'unclassified',
        deliveryPolicy: {
            ...HISTORY_RAW_SOURCE_DELIVERY_POLICY,
            allowedSurfaces: [...HISTORY_RAW_SOURCE_DELIVERY_POLICY.allowedSurfaces],
        },
        status: 'active',
        createdAt: importedAt,
        updatedAt: importedAt,
        revision: 1,
    };
    const errors = validateHistorySourceMessage(message);
    if (errors.length > 0) throw new Error(`正式历史消息无效：${errors.join('; ')}`);
    return message;
};

export const streamHistorySourceMessagesFromReview = async function* (input: {
    plan: HistoryArchiveImportPlan;
    manifest: HistoryReviewWorkspaceManifest;
    records: AsyncIterable<HistoryReviewWorkspaceRowRecord>;
    importedAt: number;
}): AsyncGenerator<HistorySourceMessage> {
    const decision = input.manifest.decision;
    if (!decision || decision.id !== input.plan.decisionId) {
        throw new Error('正式档案计划与校对决定不一致。');
    }
    const mappingByLabel = new Map(decision.speakerMappings.map(mapping => [mapping.sourceLabel, mapping]));
    let pending: PendingLogicalMessage | undefined;
    let lastOrder = -1;
    let yielded = 0;
    for await (const record of input.records) {
        if (record.workspaceId !== input.manifest.id || record.sourceOrder <= lastOrder) {
            throw new Error('正式档案来源行不完整或顺序错误。');
        }
        lastOrder = record.sourceOrder;
        if (record.review.resolution === 'merged') {
            if (!pending || record.review.mergeIntoRowId !== pending.base.source.id) {
                throw new Error(`第 ${record.sourceOrder + 1} 条续行失去了有效合并目标。`);
            }
            pending.contentParts.push(record.review.content.trim());
            pending.fragments.push(await fragmentFor(record));
            pending.attachments.push(...attachmentFor(record));
            continue;
        }
        if (record.source.status !== 'skipped' && pending) {
            yield await sourceMessageFromPending({
                pending,
                plan: input.plan,
                decision,
                mappingByLabel,
                importedAt: input.importedAt,
            });
            yielded += 1;
            pending = undefined;
        }
        if (record.review.resolution === 'accepted' || record.review.resolution === 'edited') {
            pending = {
                base: record,
                contentParts: [record.review.content.trim()],
                fragments: [await fragmentFor(record)],
                attachments: attachmentFor(record),
            };
        }
    }
    if (pending) {
        yield await sourceMessageFromPending({
            pending,
            plan: input.plan,
            decision,
            mappingByLabel,
            importedAt: input.importedAt,
        });
        yielded += 1;
    }
    if (yielded !== input.plan.expectedSourceMessageCount) {
        throw new Error(`正式档案消息数不一致：期望 ${input.plan.expectedSourceMessageCount}，实际 ${yielded}。`);
    }
};
