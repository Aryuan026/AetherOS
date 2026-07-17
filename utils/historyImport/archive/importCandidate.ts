import {
    buildHistoryArchiveImportPlan,
    streamHistorySourceMessagesFromReview,
} from '../../../domain/historyImport/archiveImport.ts';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../../../domain/historyImport/contract.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
} from '../../../domain/historyImport/rescue.ts';
import type {
    HistoryRescueSanitizedSections,
    HistoryRescueStoreName,
} from '../../../domain/historyImport/rescue.ts';
import type {
    HistoryImportBatch,
} from '../../../domain/historyImport/types.ts';
import type {
    HistoryReviewWorkspaceManifest,
} from '../../../domain/historyImport/reviewWorkspace.ts';
import {
    commitHistoryArchiveChunk,
    completeHistoryArchiveImport,
    createHistoryArchiveCandidateDatabaseId,
    createHistoryArchiveCheckpoint,
    activateImportedHistoryArchive,
    getActiveHistoryArchive,
    getHistoryArchiveRecord,
    HISTORY_ARCHIVE_MAX_CHUNK_RECORDS,
    initializeHistoryArchiveImport,
    openHistoryArchiveDatabase,
    readHistoryArchiveSections,
    replaceHistoryArchiveDatabaseFromSections,
} from '../storage/indexedDbArchive.ts';
import type {
    HistoryArchiveActivationRecord,
} from '../storage/indexedDbArchive.ts';
import {
    iterateHistoryReviewWorkspaceRows,
} from '../storage/reviewWorkspace.ts';

export type HistoryArchiveCandidateProgressPhase =
    | 'reading_current_archive'
    | 'preparing_candidate'
    | 'writing_messages'
    | 'verifying_candidate'
    | 'candidate_ready';

export interface HistoryArchiveCandidateProgress {
    phase: HistoryArchiveCandidateProgressPhase;
    processed: number;
    total: number;
}

export interface HistoryArchiveCandidateReady {
    status: 'candidate_ready';
    candidateDatabaseId: string;
    expectedActiveDatabaseId?: string;
    batch: HistoryImportBatch;
    sourceMessageCount: number;
    recordCounts: Record<HistoryRescueStoreName, number>;
}

export interface HistoryArchiveAlreadyImported {
    status: 'already_imported';
    activeDatabaseId: string;
    batch: HistoryImportBatch;
    sourceMessageCount: number;
}

export type PrepareHistoryArchiveCandidateResult =
    | HistoryArchiveCandidateReady
    | HistoryArchiveAlreadyImported;

export const activatePreparedHistoryArchiveCandidate = async (input: {
    candidate: HistoryArchiveCandidateReady;
    activatedAt?: number;
    factory?: IDBFactory;
}): Promise<HistoryArchiveActivationRecord> => activateImportedHistoryArchive({
    candidateDatabaseId: input.candidate.candidateDatabaseId,
    expectedActiveDatabaseId: input.candidate.expectedActiveDatabaseId,
    archiveId: `history-import-${input.candidate.batch.id}`,
    manifestChecksum: input.candidate.batch.reviewDecisionFingerprint
        || input.candidate.batch.sourceFile.sha256,
    recordCounts: input.candidate.recordCounts,
    activatedAt: input.activatedAt ?? Date.now(),
    factory: input.factory,
});

const emptyHistoryArchiveSections = (): HistoryRescueSanitizedSections => Object.fromEntries(
    HISTORY_RESCUE_STORE_ORDER.map(store => [store, []]),
) as unknown as HistoryRescueSanitizedSections;

const reportProgress = async (
    callback: ((progress: HistoryArchiveCandidateProgress) => void | Promise<void>) | undefined,
    progress: HistoryArchiveCandidateProgress,
): Promise<void> => {
    await callback?.(progress);
};

const countHistoryArchiveStores = async (
    database: IDBDatabase,
): Promise<Record<HistoryRescueStoreName, number>> => {
    const counts = Object.fromEntries(
        HISTORY_RESCUE_STORE_ORDER.map(store => [store, 0]),
    ) as Record<HistoryRescueStoreName, number>;
    for (const store of HISTORY_RESCUE_STORE_ORDER) {
        const transaction = database.transaction(store, 'readonly');
        counts[store] = await new Promise<number>((resolve, reject) => {
            const request = transaction.objectStore(store).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error(`无法核对 ${store} 的记录数。`));
        });
    }
    return counts;
};

const inspectExistingBatch = async (input: {
    activeDatabaseId: string;
    batchId: string;
    decisionFingerprint: string;
    factory?: IDBFactory;
}): Promise<HistoryArchiveAlreadyImported | null> => {
    const existing = await getHistoryArchiveRecord<HistoryImportBatch>({
        databaseId: input.activeDatabaseId,
        store: HISTORY_IMPORT_STORE_NAMES.batches,
        id: input.batchId,
        factory: input.factory,
    });
    if (!existing) return null;
    if (
        existing.status === 'imported'
        && existing.reviewDecisionFingerprint === input.decisionFingerprint
    ) {
        return {
            status: 'already_imported',
            activeDatabaseId: input.activeDatabaseId,
            batch: existing,
            sourceMessageCount: existing.counts.committed,
        };
    }
    throw new Error(
        '这份源文件已经用另一套校对决定导入过。为防止悄悄改写旧记录，请先走“重建此批次”的显式流程。',
    );
};

export const readHistoryArchiveWorkspaceImportStatus = async (input: {
    manifest: HistoryReviewWorkspaceManifest;
    factory?: IDBFactory;
}): Promise<HistoryArchiveAlreadyImported | null> => {
    const plan = await buildHistoryArchiveImportPlan({
        manifest: input.manifest,
        now: Date.now(),
    });
    const active = await getActiveHistoryArchive(input.factory);
    if (!active) return null;
    return inspectExistingBatch({
        activeDatabaseId: active.activeDatabaseId,
        batchId: plan.batch.id,
        decisionFingerprint: plan.decisionFingerprint,
        factory: input.factory,
    });
};

export const prepareHistoryArchiveCandidateFromWorkspace = async (input: {
    manifest: HistoryReviewWorkspaceManifest;
    now?: number;
    factory?: IDBFactory;
    onProgress?: (progress: HistoryArchiveCandidateProgress) => void | Promise<void>;
}): Promise<PrepareHistoryArchiveCandidateResult> => {
    const now = input.now ?? Date.now();
    const plan = await buildHistoryArchiveImportPlan({ manifest: input.manifest, now });
    const active = await getActiveHistoryArchive(input.factory);
    if (active) {
        const existing = await inspectExistingBatch({
            activeDatabaseId: active.activeDatabaseId,
            batchId: plan.batch.id,
            decisionFingerprint: plan.decisionFingerprint,
            factory: input.factory,
        });
        if (existing) return existing;
    }

    await reportProgress(input.onProgress, {
        phase: 'reading_current_archive',
        processed: 0,
        total: plan.expectedSourceMessageCount,
    });
    let baseSections = emptyHistoryArchiveSections();
    if (active) {
        const current = await openHistoryArchiveDatabase(active.activeDatabaseId, input.factory);
        try {
            baseSections = await readHistoryArchiveSections(current);
        } finally {
            current.close();
        }
    }

    const candidateDatabaseId = createHistoryArchiveCandidateDatabaseId(plan.decisionFingerprint);
    await reportProgress(input.onProgress, {
        phase: 'preparing_candidate',
        processed: 0,
        total: plan.expectedSourceMessageCount,
    });
    await replaceHistoryArchiveDatabaseFromSections({
        databaseId: candidateDatabaseId,
        sections: baseSections,
        factory: input.factory,
    });

    const candidate = await openHistoryArchiveDatabase(candidateDatabaseId, input.factory);
    try {
        await initializeHistoryArchiveImport({
            database: candidate,
            batch: plan.batch,
            job: plan.job,
            now,
        });
        let processed = 0;
        let chunk = [] as Awaited<ReturnType<
            typeof streamHistorySourceMessagesFromReview
        >> extends AsyncGenerator<infer Message> ? Message[] : never;
        const flush = async (): Promise<void> => {
            if (chunk.length === 0) return;
            const checkpoint = await createHistoryArchiveCheckpoint({
                messages: chunk,
                fromProcessedCount: processed,
            });
            const result = await commitHistoryArchiveChunk({
                database: candidate,
                batchId: plan.batch.id,
                jobId: plan.job.id,
                messages: chunk,
                checkpoint,
                now,
            });
            processed = result.durableProcessedCount;
            chunk = [] as typeof chunk;
            await reportProgress(input.onProgress, {
                phase: 'writing_messages',
                processed,
                total: plan.expectedSourceMessageCount,
            });
        };
        for await (const message of streamHistorySourceMessagesFromReview({
            plan,
            manifest: input.manifest,
            records: iterateHistoryReviewWorkspaceRows(input.manifest.id),
            importedAt: now,
        })) {
            chunk.push(message);
            if (chunk.length === HISTORY_ARCHIVE_MAX_CHUNK_RECORDS) await flush();
        }
        await flush();
        if (processed !== plan.expectedSourceMessageCount) {
            throw new Error('候选档案写入数量与全量校对决定不一致。');
        }
        const completed = await completeHistoryArchiveImport({
            database: candidate,
            batchId: plan.batch.id,
            jobId: plan.job.id,
            now,
        });
        await reportProgress(input.onProgress, {
            phase: 'verifying_candidate',
            processed,
            total: plan.expectedSourceMessageCount,
        });
        const recordCounts = await countHistoryArchiveStores(candidate);
        if (recordCounts[HISTORY_IMPORT_STORE_NAMES.sourceMessages] < processed) {
            throw new Error('候选档案中的原始消息数少于本次已提交数量。');
        }
        await reportProgress(input.onProgress, {
            phase: 'candidate_ready',
            processed,
            total: plan.expectedSourceMessageCount,
        });
        return {
            status: 'candidate_ready',
            candidateDatabaseId,
            expectedActiveDatabaseId: active?.activeDatabaseId,
            batch: completed.batch,
            sourceMessageCount: processed,
            recordCounts,
        };
    } finally {
        candidate.close();
    }
};
