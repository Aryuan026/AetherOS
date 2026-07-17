import {
    createHistoryJob,
} from '../../domain/historyImport/jobState.ts';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../../domain/historyImport/contract.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
    HistoryRescueError,
} from '../../domain/historyImport/rescue.ts';
import type {
    HistoryRescueSections,
} from '../../domain/historyImport/rescue.ts';
import type {
    HistoryImportBatch,
    HistoryJob,
    HistoryJobChunkCheckpoint,
} from '../../domain/historyImport/types.ts';
import {
    createHistoryRescueArchive,
    createHistoryTemporaryRestorePlan,
    verifyHistoryTemporaryRestore,
} from '../../utils/historyImport/backup/rescueArchive.ts';
import {
    HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS,
    HISTORY_INDEXEDDB_LAB_PREFIX,
    calculateHistoryIndexedDbChunkCheckpointHash,
    captureHistoryIndexedDbLabLogicalSnapshot,
    commitHistoryIndexedDbLabChunk,
    completeHistoryIndexedDbLabImport,
    countHistoryIndexedDbLabRecords,
    deleteHistoryIndexedDbLab,
    getHistoryIndexedDbLabRecord,
    initializeHistoryIndexedDbLabImport,
    openHistoryIndexedDbLab,
    pageHistoryIndexedDbLabStore,
    readHistoryIndexedDbLabSections,
    restoreAndVerifyHistoryTemporaryIndexedDbLab,
    writeHistoryTemporaryRestorePlanToIndexedDbLab,
} from '../../utils/historyImport/storage/indexedDbLab.ts';
import {
    createSyntheticImportBatch,
    generateSyntheticHistoryMessages,
} from '../../fixtures/history-import/generators.ts';
import {
    HISTORY_SCOPE_ALPHA,
} from '../../fixtures/history-import/contractFixtures.ts';
import {
    HISTORY_RESCUE_FIXTURE_SECRET,
} from '../../fixtures/history-import/rescueFixtures.ts';

const TOTAL_MESSAGES = 1_201;
const PAGE_SIZE = 137;
const T0 = 1_768_406_700_000;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`IndexedDB browser verification failed: ${message}`);
};

const assertRejects = async (
    action: () => Promise<unknown>,
    predicate: (error: unknown) => boolean,
    message: string,
): Promise<unknown> => {
    try {
        await action();
    } catch (error) {
        assert(predicate(error), `${message}; unexpected error: ${String(error)}`);
        return error;
    }
    throw new Error(`IndexedDB browser verification failed: ${message}; action resolved`);
};

const createCheckpoint = async (
    messages: ReturnType<typeof generateSyntheticHistoryMessages>,
    fromProcessedCount: number,
): Promise<HistoryJobChunkCheckpoint> => {
    const finalMessage = messages[messages.length - 1];
    return {
        idempotencyKey: `browser:${fromProcessedCount}-${fromProcessedCount + messages.length}`,
        fromProcessedCount,
        toProcessedCount: fromProcessedCount + messages.length,
        lastSourceOrder: finalMessage.sourceOrder,
        lastSourceMessageId: finalMessage.id,
        checkpointHash: await calculateHistoryIndexedDbChunkCheckpointHash(messages),
    };
};

const sameSnapshot = (
    left: Awaited<ReturnType<typeof captureHistoryIndexedDbLabLogicalSnapshot>>,
    right: Awaited<ReturnType<typeof captureHistoryIndexedDbLabLogicalSnapshot>>,
): boolean => (
    left.sha256 === right.sha256
    && JSON.stringify(left.recordCounts) === JSON.stringify(right.recordCounts)
    && JSON.stringify(left.stableIds) === JSON.stringify(right.stableIds)
);

export interface HistoryIndexedDbBrowserVerificationResult {
    schemaStores: number;
    importedMessages: number;
    chunkBoundary: string;
    paging: { pageSize: number; pages: number; largestPage: number };
    quotaRollback: boolean;
    abortRollback: boolean;
    conflictRollback: boolean;
    reloadCursor: number;
    prematureCompletionRejected: boolean;
    incompleteTemporaryRestoreRejected: boolean;
    wrongSecretRejected: boolean;
    liveDigestStableAcrossRejectedRestore: boolean;
    verifiedRestoreRecords: number;
    liveMutationAllowed: false;
}

export const runHistoryIndexedDbBrowserVerification = async (): Promise<
    HistoryIndexedDbBrowserVerificationResult
> => {
    const suffix = `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
    const liveDatabaseId = `${HISTORY_INDEXEDDB_LAB_PREFIX}live-${suffix}`;
    const incompleteTempDatabaseId = `${HISTORY_INDEXEDDB_LAB_PREFIX}temp-incomplete-${suffix}`;
    const verifiedTempDatabaseId = `${HISTORY_INDEXEDDB_LAB_PREFIX}temp-verified-${suffix}`;
    const cleanupIds = [liveDatabaseId, incompleteTempDatabaseId, verifiedTempDatabaseId];

    let liveDatabase: IDBDatabase | undefined;
    try {
        for (const databaseId of cleanupIds) await deleteHistoryIndexedDbLab(databaseId);
        liveDatabase = await openHistoryIndexedDbLab(liveDatabaseId);
        assert(
            HISTORY_RESCUE_STORE_ORDER.every(store => liveDatabase!.objectStoreNames.contains(store)),
            'the isolated lab must create every explicit history store',
        );
        assert(liveDatabase.objectStoreNames.length === 4, 'the lab must not hide an extra metadata store');

        const generatorConfig = {
            seed: 2026071605,
            count: TOTAL_MESSAGES,
            scope: HISTORY_SCOPE_ALPHA,
            batchId: 'hbatch-browser-stage-0-5',
            baseSourceEpochMs: 1_704_153_600_000,
            importedAt: T0,
            intervalMs: 1_000,
        };
        const messages = generateSyntheticHistoryMessages(generatorConfig);
        const batch = createSyntheticImportBatch(generatorConfig);
        const job = createHistoryJob({
            id: 'hjob-browser-stage-0-5',
            kind: 'import',
            scope: HISTORY_SCOPE_ALPHA,
            batchId: batch.id,
            totalCount: messages.length,
            inputVersion: 'normalized-source-v1',
            outputVersion: 'history-sidecar-v1',
        }, T0);
        await initializeHistoryIndexedDbLabImport({
            database: liveDatabase,
            batch,
            job,
            now: T0 + 1,
        });

        const firstMessages = messages.slice(0, HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS);
        const secondMessages = messages.slice(
            HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS,
            HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS * 2,
        );
        const finalMessages = messages.slice(HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS * 2);
        const [firstCheckpoint, secondCheckpoint, finalCheckpoint] = await Promise.all([
            createCheckpoint(firstMessages, 0),
            createCheckpoint(secondMessages, firstMessages.length),
            createCheckpoint(finalMessages, firstMessages.length + secondMessages.length),
        ]);

        const firstCommit = await commitHistoryIndexedDbLabChunk({
            database: liveDatabase,
            batchId: batch.id,
            jobId: job.id,
            messages: firstMessages,
            checkpoint: firstCheckpoint,
            now: T0 + 2,
        });
        assert(firstCommit.inserted === 500, 'the first bounded chunk must insert 500 rows');
        assert(firstCommit.durableProcessedCount === 500, 'the cursor must commit with the first chunk');

        const replay = await commitHistoryIndexedDbLabChunk({
            database: liveDatabase,
            batchId: batch.id,
            jobId: job.id,
            messages: firstMessages,
            checkpoint: firstCheckpoint,
            now: T0 + 3,
        });
        assert(replay.inserted === 0 && replay.unchanged === 500, 'exact chunk replay must be idempotent');

        await assertRejects(
            () => completeHistoryIndexedDbLabImport({
                database: liveDatabase!,
                batchId: batch.id,
                jobId: job.id,
                now: T0 + 4,
            }),
            error => error instanceof Error && /cannot complete/.test(error.message),
            'a partial batch must not become imported',
        );
        const beforeInjectedFailures = await captureHistoryIndexedDbLabLogicalSnapshot(liveDatabase, PAGE_SIZE);

        const quotaError = await assertRejects(
            () => commitHistoryIndexedDbLabChunk({
                database: liveDatabase!,
                batchId: batch.id,
                jobId: job.id,
                messages: secondMessages,
                checkpoint: secondCheckpoint,
                now: T0 + 5,
                failureInjection: { kind: 'quota', afterRecordWrites: 17 },
            }),
            error => error instanceof Error && error.name === 'QuotaExceededError',
            'the injected quota failure must surface as QuotaExceededError',
        );
        assert(quotaError instanceof Error && quotaError.name === 'QuotaExceededError', 'quota error name');
        const afterQuotaFailure = await captureHistoryIndexedDbLabLogicalSnapshot(liveDatabase, PAGE_SIZE);
        assert(sameSnapshot(beforeInjectedFailures, afterQuotaFailure), 'quota abort must roll back rows and cursor');

        await assertRejects(
            () => commitHistoryIndexedDbLabChunk({
                database: liveDatabase!,
                batchId: batch.id,
                jobId: job.id,
                messages: secondMessages,
                checkpoint: secondCheckpoint,
                now: T0 + 6,
                failureInjection: { kind: 'abort', afterRecordWrites: 9 },
            }),
            error => error instanceof Error && error.name === 'AbortError',
            'the injected abort must surface as AbortError',
        );
        const afterAbortFailure = await captureHistoryIndexedDbLabLogicalSnapshot(liveDatabase, PAGE_SIZE);
        assert(sameSnapshot(beforeInjectedFailures, afterAbortFailure), 'explicit abort must roll back rows and cursor');

        const conflictingFirstMessages = firstMessages.map((message, index) => (
            index === 0 ? { ...message, content: `${message.content} [conflict]` } : message
        ));
        await assertRejects(
            () => commitHistoryIndexedDbLabChunk({
                database: liveDatabase!,
                batchId: batch.id,
                jobId: job.id,
                messages: conflictingFirstMessages,
                checkpoint: firstCheckpoint,
                now: T0 + 7,
            }),
            error => error instanceof Error && /stable-id conflict/.test(error.message),
            'a stable id with different content must reject the transaction',
        );
        const afterConflict = await captureHistoryIndexedDbLabLogicalSnapshot(liveDatabase, PAGE_SIZE);
        assert(sameSnapshot(beforeInjectedFailures, afterConflict), 'stable-id conflict must not mutate the lab');

        liveDatabase.close();
        liveDatabase = await openHistoryIndexedDbLab(liveDatabaseId);
        const durableJob = await getHistoryIndexedDbLabRecord<HistoryJob>(
            liveDatabase,
            HISTORY_IMPORT_STORE_NAMES.jobs,
            job.id,
        );
        assert(durableJob?.cursor.processedCount === 500, 'reload must reopen at the durable cursor');
        const durableBatch = await getHistoryIndexedDbLabRecord<HistoryImportBatch>(
            liveDatabase,
            HISTORY_IMPORT_STORE_NAMES.batches,
            batch.id,
        );
        assert(durableBatch?.status === 'importing', 'reload must not promote a partial batch');
        assert(durableBatch.counts.committed === 500, 'batch count must agree with the reopened cursor');

        await commitHistoryIndexedDbLabChunk({
            database: liveDatabase,
            batchId: batch.id,
            jobId: job.id,
            messages: secondMessages,
            checkpoint: secondCheckpoint,
            now: T0 + 8,
        });
        await commitHistoryIndexedDbLabChunk({
            database: liveDatabase,
            batchId: batch.id,
            jobId: job.id,
            messages: finalMessages,
            checkpoint: finalCheckpoint,
            now: T0 + 9,
        });
        const completed = await completeHistoryIndexedDbLabImport({
            database: liveDatabase,
            batchId: batch.id,
            jobId: job.id,
            now: T0 + 10,
        });
        assert(completed.batch.status === 'imported', 'only a validated full import may become imported');
        assert(completed.job.status === 'completed', 'the matching job must complete atomically');
        assert(
            await countHistoryIndexedDbLabRecords(liveDatabase, HISTORY_IMPORT_STORE_NAMES.sourceMessages)
                === TOTAL_MESSAGES,
            'the completed lab must contain the exact accepted message count',
        );

        let pageCursor: string | undefined;
        let pagedCount = 0;
        let pageCount = 0;
        let largestPage = 0;
        do {
            const page = await pageHistoryIndexedDbLabStore({
                database: liveDatabase,
                store: HISTORY_IMPORT_STORE_NAMES.sourceMessages,
                cursor: pageCursor,
                limit: PAGE_SIZE,
            });
            pageCount += 1;
            pagedCount += page.items.length;
            largestPage = Math.max(largestPage, page.items.length);
            pageCursor = page.hasMore ? page.nextCursor : undefined;
        } while (pageCursor !== undefined);
        assert(pagedCount === TOTAL_MESSAGES, 'paged cursor reads must cover every message exactly once');
        assert(largestPage <= PAGE_SIZE, 'paged reads must never exceed the declared window');

        const liveSections = await readHistoryIndexedDbLabSections(liveDatabase, { pageSize: PAGE_SIZE });
        const liveBeforeRestore = await captureHistoryIndexedDbLabLogicalSnapshot(liveDatabase, PAGE_SIZE);
        const envelope = await createHistoryRescueArchive({
            archiveId: `hrescue-browser-stage-0-5-${suffix}`,
            sourceDeviceId: 'synthetic-browser-stage-0-5',
            createdAt: T0 + 11,
            recoverySecret: HISTORY_RESCUE_FIXTURE_SECRET,
            sections: liveSections as unknown as HistoryRescueSections,
        });

        await assertRejects(
            () => createHistoryTemporaryRestorePlan({
                envelope,
                recoverySecret: 'synthetic-wrong-recovery-secret',
                liveDatabaseId,
                temporaryDatabaseId: incompleteTempDatabaseId,
            }),
            error => error instanceof HistoryRescueError && error.code === 'decryption_failed',
            'a wrong recovery secret must reject before opening a temporary database',
        );

        const incompletePlan = await createHistoryTemporaryRestorePlan({
            envelope,
            recoverySecret: HISTORY_RESCUE_FIXTURE_SECRET,
            liveDatabaseId,
            temporaryDatabaseId: incompleteTempDatabaseId,
        });
        await assertRejects(
            () => writeHistoryTemporaryRestorePlanToIndexedDbLab({
                plan: incompletePlan,
                failureInjection: { kind: 'abort', afterRecordWrites: 11 },
            }),
            error => error instanceof Error && error.name === 'AbortError',
            'an interrupted temporary restore must remain incomplete',
        );
        const incompleteDatabase = await openHistoryIndexedDbLab(incompleteTempDatabaseId);
        try {
            const incompleteSections = await readHistoryIndexedDbLabSections(incompleteDatabase, {
                pageSize: PAGE_SIZE,
                orderingTemplate: incompletePlan.sections,
            });
            await assertRejects(
                () => verifyHistoryTemporaryRestore(incompletePlan, incompleteSections, T0 + 12),
                error => error instanceof HistoryRescueError && error.code === 'temporary_restore_mismatch',
                'the Stage 0.4 verifier must reject an incomplete real temporary DB',
            );
        } finally {
            incompleteDatabase.close();
        }
        const liveAfterRejectedRestore = await captureHistoryIndexedDbLabLogicalSnapshot(
            liveDatabase,
            PAGE_SIZE,
        );
        assert(
            sameSnapshot(liveBeforeRestore, liveAfterRejectedRestore),
            'rejected temporary restore must leave the synthetic live image byte-logically unchanged',
        );

        const verifiedPlan = await createHistoryTemporaryRestorePlan({
            envelope,
            recoverySecret: HISTORY_RESCUE_FIXTURE_SECRET,
            liveDatabaseId,
            temporaryDatabaseId: verifiedTempDatabaseId,
        });
        const verified = await restoreAndVerifyHistoryTemporaryIndexedDbLab({
            plan: verifiedPlan,
            verifiedAt: T0 + 13,
            chunkSize: HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS,
            pageSize: PAGE_SIZE,
        });
        assert(verified.status === 'temporary_restore_verified', 'the separate temp DB must verify');
        assert(verified.liveDatabaseMutationAllowed === false, 'verification must not grant live mutation authority');
        assert(
            verified.recordCounts[HISTORY_IMPORT_STORE_NAMES.sourceMessages] === TOTAL_MESSAGES,
            'verified temp DB must preserve every source message',
        );

        return {
            schemaStores: liveDatabase.objectStoreNames.length,
            importedMessages: TOTAL_MESSAGES,
            chunkBoundary: '500+500+201',
            paging: { pageSize: PAGE_SIZE, pages: pageCount, largestPage },
            quotaRollback: sameSnapshot(beforeInjectedFailures, afterQuotaFailure),
            abortRollback: sameSnapshot(beforeInjectedFailures, afterAbortFailure),
            conflictRollback: sameSnapshot(beforeInjectedFailures, afterConflict),
            reloadCursor: durableJob.cursor.processedCount,
            prematureCompletionRejected: true,
            incompleteTemporaryRestoreRejected: true,
            wrongSecretRejected: true,
            liveDigestStableAcrossRejectedRestore: sameSnapshot(
                liveBeforeRestore,
                liveAfterRejectedRestore,
            ),
            verifiedRestoreRecords: verified.recordCounts[HISTORY_IMPORT_STORE_NAMES.sourceMessages],
            liveMutationAllowed: false,
        };
    } finally {
        liveDatabase?.close();
        for (const databaseId of cleanupIds) {
            try {
                await deleteHistoryIndexedDbLab(databaseId);
            } catch (error) {
                console.warn(`history IndexedDB lab cleanup failed for ${databaseId}`, error);
            }
        }
    }
};

declare global {
    interface Window {
        runHistoryIndexedDbBrowserVerification?: typeof runHistoryIndexedDbBrowserVerification;
    }
}

if (typeof window !== 'undefined') {
    window.runHistoryIndexedDbBrowserVerification = runHistoryIndexedDbBrowserVerification;
}
