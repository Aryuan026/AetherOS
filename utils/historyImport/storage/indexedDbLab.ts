import {
    commitHistoryJobChunk,
    completeHistoryJob,
    startHistoryJob,
} from '../../../domain/historyImport/jobState.ts';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../../../domain/historyImport/contract.ts';
import type {
    HistoryImportBatch,
    HistoryJob,
    HistoryJobChunkCheckpoint,
    HistorySourceMessage,
} from '../../../domain/historyImport/types.ts';
import {
    HISTORY_RESCUE_CRYPTO_PROFILE,
    HISTORY_RESCUE_STORE_ORDER,
} from '../../../domain/historyImport/rescue.ts';
import type {
    HistoryRescueSanitizedSections,
    HistoryRescueStoreName,
    HistoryTemporaryRestorePlan,
    HistoryTemporaryRestoreVerification,
} from '../../../domain/historyImport/rescue.ts';
import {
    stableHistoryRescueJson,
    verifyHistoryTemporaryRestore,
} from '../backup/rescueArchive.ts';

/**
 * Stage 0.5 is deliberately isolated from the production `AetherOS_Data` DB.
 * Every database opened by this module must carry this prefix, including the
 * synthetic "live" image and every temporary restore image.
 */
export const HISTORY_INDEXEDDB_LAB_PREFIX = 'AetherOS_HistoryImport_Lab:' as const;
export const HISTORY_INDEXEDDB_LAB_SCHEMA_VERSION = 1 as const;
export const HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS = 500 as const;
export const HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS = 500 as const;

export interface HistoryIndexedDbLabIndexSpec {
    name: string;
    keyPath: string | string[];
    unique: boolean;
}

export interface HistoryIndexedDbLabStoreSpec {
    keyPath: 'id';
    indexes: readonly HistoryIndexedDbLabIndexSpec[];
}

const SCOPE_KEY_PATH = ['scope.progressBundleId', 'scope.charId'] as const;

export const HISTORY_INDEXEDDB_LAB_SCHEMA: Record<
    HistoryRescueStoreName,
    HistoryIndexedDbLabStoreSpec
> = {
    [HISTORY_IMPORT_STORE_NAMES.batches]: {
        keyPath: 'id',
        indexes: [
            { name: 'scope', keyPath: [...SCOPE_KEY_PATH], unique: false },
            { name: 'status', keyPath: 'status', unique: false },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.sourceMessages]: {
        keyPath: 'id',
        indexes: [
            { name: 'batch_id', keyPath: 'batchId', unique: false },
            { name: 'batch_source_order', keyPath: ['batchId', 'sourceOrder'], unique: true },
            {
                name: 'scope_source_order',
                keyPath: [...SCOPE_KEY_PATH, 'sourceOrder'],
                unique: false,
            },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.events]: {
        keyPath: 'id',
        indexes: [
            { name: 'scope', keyPath: [...SCOPE_KEY_PATH], unique: false },
            { name: 'evidence_family', keyPath: 'evidenceFamilyId', unique: false },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.companionProjections]: {
        keyPath: 'id',
        indexes: [
            { name: 'scope', keyPath: [...SCOPE_KEY_PATH], unique: false },
            { name: 'event_id', keyPath: 'eventId', unique: true },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.plotProjections]: {
        keyPath: 'id',
        indexes: [
            { name: 'scope', keyPath: [...SCOPE_KEY_PATH], unique: false },
            { name: 'event_id', keyPath: 'eventId', unique: false },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.jobs]: {
        keyPath: 'id',
        indexes: [
            { name: 'batch_id', keyPath: 'batchId', unique: false },
            { name: 'status', keyPath: 'status', unique: false },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.tagRegistry]: {
        keyPath: 'id',
        indexes: [
            { name: 'namespace', keyPath: 'namespace', unique: false },
            { name: 'status', keyPath: 'status', unique: false },
        ],
    },
    [HISTORY_IMPORT_STORE_NAMES.backupReceipts]: {
        keyPath: 'id',
        indexes: [
            { name: 'status', keyPath: 'status', unique: false },
            { name: 'created_at', keyPath: 'createdAt', unique: false },
        ],
    },
};

export type HistoryIndexedDbLabFailureKind = 'quota' | 'abort';

export interface HistoryIndexedDbLabFailureInjection {
    kind: HistoryIndexedDbLabFailureKind;
    afterRecordWrites: number;
}

export interface HistoryIndexedDbRestoreFailureInjection
    extends HistoryIndexedDbLabFailureInjection {
    store?: HistoryRescueStoreName;
}

export interface HistoryIndexedDbLabPage<T = unknown> {
    items: T[];
    nextCursor?: string;
    hasMore: boolean;
}

export interface HistoryIndexedDbLabLogicalSnapshot {
    databaseId: string;
    sha256: string;
    recordCounts: Record<HistoryRescueStoreName, number>;
    stableIds: Record<HistoryRescueStoreName, string[]>;
}

export interface HistoryIndexedDbChunkCommitResult {
    attempted: number;
    inserted: number;
    unchanged: number;
    checkpointHash: string;
    durableProcessedCount: number;
}

const assertLabDatabaseId = (databaseId: string): void => {
    if (!databaseId.startsWith(HISTORY_INDEXEDDB_LAB_PREFIX)) {
        throw new Error(`history IndexedDB lab id must start with ${HISTORY_INDEXEDDB_LAB_PREFIX}`);
    }
    if (databaseId.length <= HISTORY_INDEXEDDB_LAB_PREFIX.length) {
        throw new Error('history IndexedDB lab id needs a non-empty suffix');
    }
};

const getIndexedDbFactory = (factory?: IDBFactory): IDBFactory => {
    const resolved = factory ?? globalThis.indexedDB;
    if (!resolved) throw new Error('IndexedDB is unavailable in this environment');
    return resolved;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
});

const openRequestAsPromise = <T extends IDBDatabase | undefined>(
    request: IDBOpenDBRequest,
    blockedMessage: string,
): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open request failed'));
    request.onblocked = () => reject(new Error(blockedMessage));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
});

const abortTransaction = (transaction: IDBTransaction): void => {
    try {
        transaction.abort();
    } catch {
        // It may already be committed or aborted. The transaction promise is
        // still consumed by the caller before the original error is rethrown.
    }
};

const settleAbortedTransaction = async (
    transaction: IDBTransaction,
    settled: Promise<void>,
): Promise<void> => {
    abortTransaction(transaction);
    try {
        await settled;
    } catch {
        // Expected: callers receive the more specific validation/injection error.
    }
};

const createInjectedFailure = (kind: HistoryIndexedDbLabFailureKind): Error => {
    const name = kind === 'quota' ? 'QuotaExceededError' : 'AbortError';
    const message = kind === 'quota'
        ? 'Synthetic quota interruption inside an isolated history transaction.'
        : 'Synthetic abort inside an isolated history transaction.';
    if (typeof DOMException !== 'undefined') return new DOMException(message, name);
    const error = new Error(message);
    error.name = name;
    return error;
};

const assertFailureInjection = (
    injection: HistoryIndexedDbLabFailureInjection | undefined,
): void => {
    if (!injection) return;
    if (!Number.isInteger(injection.afterRecordWrites) || injection.afterRecordWrites < 1) {
        throw new Error('history lab failure injection must occur after at least one record write');
    }
};

const assertRecordId = (record: unknown, store: HistoryRescueStoreName): string => {
    if (
        typeof record !== 'object'
        || record === null
        || !('id' in record)
        || typeof record.id !== 'string'
        || !record.id.trim()
    ) {
        throw new Error(`${store} record requires a stable string id`);
    }
    return record.id;
};

const getWebCrypto = (): Crypto => {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this environment');
    return globalThis.crypto;
};

const sha256 = async (value: string): Promise<string> => {
    const bytes = new TextEncoder().encode(value);
    const digest = await getWebCrypto().subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    return `sha256:${hex}`;
};

export const calculateHistoryIndexedDbChunkCheckpointHash = async (
    messages: HistorySourceMessage[],
): Promise<string> => sha256(stableHistoryRescueJson(messages.map(message => ({
    id: message.id,
    batchId: message.batchId,
    sourceOrder: message.sourceOrder,
    sourceFingerprint: message.sourceFingerprint,
}))));

export const openHistoryIndexedDbLab = async (
    databaseId: string,
    factory?: IDBFactory,
): Promise<IDBDatabase> => {
    assertLabDatabaseId(databaseId);
    const request = getIndexedDbFactory(factory).open(
        databaseId,
        HISTORY_INDEXEDDB_LAB_SCHEMA_VERSION,
    );
    request.onupgradeneeded = () => {
        const database = request.result;
        HISTORY_RESCUE_STORE_ORDER.forEach(storeName => {
            const spec = HISTORY_INDEXEDDB_LAB_SCHEMA[storeName];
            const store = database.createObjectStore(storeName, { keyPath: spec.keyPath });
            spec.indexes.forEach(index => {
                store.createIndex(index.name, index.keyPath, { unique: index.unique });
            });
        });
    };
    const database = await openRequestAsPromise<IDBDatabase>(
        request,
        `opening ${databaseId} was blocked`,
    );
    database.onversionchange = () => database.close();
    return database;
};

export const deleteHistoryIndexedDbLab = async (
    databaseId: string,
    factory?: IDBFactory,
): Promise<void> => {
    assertLabDatabaseId(databaseId);
    const request = getIndexedDbFactory(factory).deleteDatabase(databaseId);
    await openRequestAsPromise<undefined>(request, `deleting ${databaseId} was blocked`);
};

export const initializeHistoryIndexedDbLabImport = async (input: {
    database: IDBDatabase;
    batch: HistoryImportBatch;
    job: HistoryJob;
    now: number;
}): Promise<{ batch: HistoryImportBatch; job: HistoryJob }> => {
    assertLabDatabaseId(input.database.name);
    if (input.job.batchId !== input.batch.id) {
        throw new Error('history lab job and batch ids must match');
    }
    if (input.batch.status !== 'ready') {
        throw new Error('history lab import must initialize from a ready batch');
    }
    const transaction = input.database.transaction([
        HISTORY_IMPORT_STORE_NAMES.batches,
        HISTORY_IMPORT_STORE_NAMES.jobs,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const batches = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.batches);
        const jobs = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.jobs);
        const [existingBatch, existingJob] = await Promise.all([
            requestAsPromise(batches.get(input.batch.id)),
            requestAsPromise(jobs.get(input.job.id)),
        ]);
        if (existingBatch || existingJob) throw new Error('history lab import ids already exist');

        const runningJob = startHistoryJob(input.job, input.now);
        const importingBatch: HistoryImportBatch = {
            ...input.batch,
            status: 'importing',
            counts: { ...input.batch.counts, committed: 0 },
            cursor: { ...runningJob.cursor },
            updatedAt: input.now,
            revision: input.batch.revision + 1,
        };
        await Promise.all([
            requestAsPromise(batches.add(importingBatch)),
            requestAsPromise(jobs.add(runningJob)),
        ]);
        await settled;
        return { batch: importingBatch, job: runningJob };
    } catch (error) {
        await settleAbortedTransaction(transaction, settled);
        throw error;
    }
};

const assertChunkShape = (
    messages: HistorySourceMessage[],
    checkpoint: HistoryJobChunkCheckpoint,
): void => {
    if (messages.length < 1 || messages.length > HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS) {
        throw new Error(`history lab chunk must contain 1-${HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS} messages`);
    }
    if (checkpoint.toProcessedCount - checkpoint.fromProcessedCount !== messages.length) {
        throw new Error('history lab chunk length must match its checkpoint range');
    }
    const lastMessage = messages[messages.length - 1];
    if (
        checkpoint.lastSourceMessageId !== lastMessage.id
        || checkpoint.lastSourceOrder !== lastMessage.sourceOrder
    ) {
        throw new Error('history lab checkpoint must identify the final message in its chunk');
    }
    const batchId = messages[0].batchId;
    if (messages.some(message => message.batchId !== batchId)) {
        throw new Error('history lab chunk cannot mix import batches');
    }
    for (let index = 1; index < messages.length; index += 1) {
        if (messages[index].sourceOrder <= messages[index - 1].sourceOrder) {
            throw new Error('history lab chunk source order must be strictly increasing');
        }
    }
};

export const commitHistoryIndexedDbLabChunk = async (input: {
    database: IDBDatabase;
    batchId: string;
    jobId: string;
    messages: HistorySourceMessage[];
    checkpoint: HistoryJobChunkCheckpoint;
    now: number;
    failureInjection?: HistoryIndexedDbLabFailureInjection;
}): Promise<HistoryIndexedDbChunkCommitResult> => {
    assertLabDatabaseId(input.database.name);
    assertChunkShape(input.messages, input.checkpoint);
    assertFailureInjection(input.failureInjection);
    if (input.messages[0].batchId !== input.batchId) {
        throw new Error('history lab chunk does not belong to the requested batch');
    }

    const transaction = input.database.transaction([
        HISTORY_IMPORT_STORE_NAMES.batches,
        HISTORY_IMPORT_STORE_NAMES.sourceMessages,
        HISTORY_IMPORT_STORE_NAMES.jobs,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const batches = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.batches);
        const sourceMessages = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.sourceMessages);
        const jobs = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.jobs);
        const [batchValue, jobValue] = await Promise.all([
            requestAsPromise(batches.get(input.batchId)),
            requestAsPromise(jobs.get(input.jobId)),
        ]);
        if (!batchValue || !jobValue) throw new Error('history lab batch or job is missing');
        const batch = batchValue as HistoryImportBatch;
        const job = jobValue as HistoryJob;
        if (batch.status !== 'importing') {
            throw new Error(`history lab cannot commit to a ${batch.status} batch`);
        }
        if (job.batchId !== batch.id) throw new Error('history lab durable job points to another batch');

        const nextJob = commitHistoryJobChunk(job, input.checkpoint, input.now);
        let inserted = 0;
        let unchanged = 0;
        let writes = 0;
        for (const message of input.messages) {
            const existing = await requestAsPromise(sourceMessages.get(message.id));
            if (existing !== undefined) {
                if (stableHistoryRescueJson(existing) !== stableHistoryRescueJson(message)) {
                    throw new Error(`history lab stable-id conflict at ${message.id}`);
                }
                unchanged += 1;
                continue;
            }
            await requestAsPromise(sourceMessages.add(message));
            inserted += 1;
            writes += 1;
            if (input.failureInjection?.afterRecordWrites === writes) {
                const injected = createInjectedFailure(input.failureInjection.kind);
                await settleAbortedTransaction(transaction, settled);
                throw injected;
            }
        }

        if (nextJob !== job) {
            const nextBatch: HistoryImportBatch = {
                ...batch,
                counts: {
                    ...batch.counts,
                    committed: nextJob.cursor.processedCount,
                },
                cursor: { ...nextJob.cursor },
                updatedAt: input.now,
                revision: batch.revision + 1,
            };
            await Promise.all([
                requestAsPromise(jobs.put(nextJob)),
                requestAsPromise(batches.put(nextBatch)),
            ]);
        }
        await settled;
        return {
            attempted: input.messages.length,
            inserted,
            unchanged,
            checkpointHash: input.checkpoint.checkpointHash,
            durableProcessedCount: nextJob.cursor.processedCount,
        };
    } catch (error) {
        await settleAbortedTransaction(transaction, settled);
        throw error;
    }
};

export const completeHistoryIndexedDbLabImport = async (input: {
    database: IDBDatabase;
    batchId: string;
    jobId: string;
    now: number;
}): Promise<{ batch: HistoryImportBatch; job: HistoryJob }> => {
    assertLabDatabaseId(input.database.name);
    const transaction = input.database.transaction([
        HISTORY_IMPORT_STORE_NAMES.batches,
        HISTORY_IMPORT_STORE_NAMES.sourceMessages,
        HISTORY_IMPORT_STORE_NAMES.jobs,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const batches = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.batches);
        const sourceMessages = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.sourceMessages);
        const jobs = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.jobs);
        const [batchValue, jobValue, committedCount] = await Promise.all([
            requestAsPromise(batches.get(input.batchId)),
            requestAsPromise(jobs.get(input.jobId)),
            requestAsPromise(sourceMessages.index('batch_id').count(input.batchId)),
        ]);
        if (!batchValue || !jobValue) throw new Error('history lab batch or job is missing');
        const batch = batchValue as HistoryImportBatch;
        const job = jobValue as HistoryJob;
        if (batch.status !== 'importing') {
            throw new Error(`history lab cannot complete a ${batch.status} batch`);
        }
        if (
            committedCount !== job.cursor.totalCount
            || batch.counts.committed !== job.cursor.totalCount
            || job.cursor.processedCount !== job.cursor.totalCount
        ) {
            throw new Error('history lab import cannot complete before durable rows and cursor agree');
        }
        const completedJob = completeHistoryJob(job, input.now);
        const completedBatch: HistoryImportBatch = {
            ...batch,
            status: 'imported',
            completedAt: input.now,
            cursor: { ...completedJob.cursor },
            updatedAt: input.now,
            revision: batch.revision + 1,
        };
        await Promise.all([
            requestAsPromise(jobs.put(completedJob)),
            requestAsPromise(batches.put(completedBatch)),
        ]);
        await settled;
        return { batch: completedBatch, job: completedJob };
    } catch (error) {
        await settleAbortedTransaction(transaction, settled);
        throw error;
    }
};

export const getHistoryIndexedDbLabRecord = async <T = unknown>(
    database: IDBDatabase,
    store: HistoryRescueStoreName,
    id: string,
): Promise<T | null> => {
    assertLabDatabaseId(database.name);
    const transaction = database.transaction(store, 'readonly');
    const value = await requestAsPromise(transaction.objectStore(store).get(id));
    return value === undefined ? null : value as T;
};

export const countHistoryIndexedDbLabRecords = async (
    database: IDBDatabase,
    store: HistoryRescueStoreName,
): Promise<number> => {
    assertLabDatabaseId(database.name);
    const transaction = database.transaction(store, 'readonly');
    return requestAsPromise(transaction.objectStore(store).count());
};

export const pageHistoryIndexedDbLabStore = async <T = unknown>(input: {
    database: IDBDatabase;
    store: HistoryRescueStoreName;
    cursor?: string;
    limit: number;
}): Promise<HistoryIndexedDbLabPage<T>> => {
    assertLabDatabaseId(input.database.name);
    if (
        !Number.isInteger(input.limit)
        || input.limit < 1
        || input.limit > HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS
    ) {
        throw new Error(`history lab page limit must be 1-${HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS}`);
    }
    const transaction = input.database.transaction(input.store, 'readonly');
    const objectStore = transaction.objectStore(input.store);
    const range = input.cursor === undefined
        ? undefined
        : IDBKeyRange.lowerBound(input.cursor, true);
    return new Promise((resolve, reject) => {
        const items: T[] = [];
        const request = objectStore.openCursor(range);
        request.onerror = () => reject(request.error ?? new Error('history lab cursor failed'));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ items, hasMore: false });
                return;
            }
            if (items.length === input.limit) {
                const finalId = assertRecordId(items[items.length - 1], input.store);
                resolve({ items, nextCursor: finalId, hasMore: true });
                return;
            }
            items.push(cursor.value as T);
            cursor.continue();
        };
    });
};

const orderObservedRecords = (
    store: HistoryRescueStoreName,
    observed: unknown[],
    template?: unknown[],
): unknown[] => {
    if (!template) return observed;
    const observedById = new Map(observed.map(record => [assertRecordId(record, store), record]));
    const ordered: unknown[] = [];
    template.forEach(record => {
        const id = assertRecordId(record, store);
        const match = observedById.get(id);
        if (match !== undefined) {
            ordered.push(match);
            observedById.delete(id);
        }
    });
    ordered.push(...Array.from(observedById.values()).sort((left, right) => (
        assertRecordId(left, store).localeCompare(assertRecordId(right, store))
    )));
    return ordered;
};

export const readHistoryIndexedDbLabSections = async (
    database: IDBDatabase,
    options?: {
        pageSize?: number;
        orderingTemplate?: HistoryRescueSanitizedSections;
    },
): Promise<HistoryRescueSanitizedSections> => {
    assertLabDatabaseId(database.name);
    const pageSize = options?.pageSize ?? HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit;
    const sections = Object.fromEntries(
        HISTORY_RESCUE_STORE_ORDER.map(store => [store, []]),
    ) as unknown as HistoryRescueSanitizedSections;
    for (const store of HISTORY_RESCUE_STORE_ORDER) {
        const observed: unknown[] = [];
        let cursor: string | undefined;
        do {
            const page = await pageHistoryIndexedDbLabStore({
                database,
                store,
                cursor,
                limit: pageSize,
            });
            observed.push(...page.items);
            cursor = page.hasMore ? page.nextCursor : undefined;
        } while (cursor !== undefined);
        sections[store] = orderObservedRecords(
            store,
            observed,
            options?.orderingTemplate?.[store],
        );
    }
    return sections;
};

export const captureHistoryIndexedDbLabLogicalSnapshot = async (
    database: IDBDatabase,
    pageSize: number = HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS,
): Promise<HistoryIndexedDbLabLogicalSnapshot> => {
    const sections = await readHistoryIndexedDbLabSections(database, { pageSize });
    const recordCounts = Object.fromEntries(HISTORY_RESCUE_STORE_ORDER.map(store => (
        [store, sections[store].length]
    ))) as Record<HistoryRescueStoreName, number>;
    const stableIds = Object.fromEntries(HISTORY_RESCUE_STORE_ORDER.map(store => (
        [store, sections[store].map(record => assertRecordId(record, store)).sort()]
    ))) as Record<HistoryRescueStoreName, string[]>;
    return {
        databaseId: database.name,
        sha256: await sha256(stableHistoryRescueJson(sections)),
        recordCounts,
        stableIds,
    };
};

export const writeHistoryTemporaryRestorePlanToIndexedDbLab = async (input: {
    plan: HistoryTemporaryRestorePlan;
    factory?: IDBFactory;
    chunkSize?: number;
    failureInjection?: HistoryIndexedDbRestoreFailureInjection;
}): Promise<Record<HistoryRescueStoreName, number>> => {
    assertLabDatabaseId(input.plan.liveDatabaseId);
    assertLabDatabaseId(input.plan.temporaryDatabaseId);
    if (input.plan.liveDatabaseId === input.plan.temporaryDatabaseId) {
        throw new Error('history lab temporary restore must not target the live lab database');
    }
    if (input.plan.liveDatabaseMutationAllowed !== false) {
        throw new Error('history lab restore plan unexpectedly allows live mutation');
    }
    assertFailureInjection(input.failureInjection);
    const chunkSize = input.chunkSize ?? HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit;
    if (
        !Number.isInteger(chunkSize)
        || chunkSize < 1
        || chunkSize > HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS
    ) {
        throw new Error(`history lab restore chunk size must be 1-${HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS}`);
    }

    const database = await openHistoryIndexedDbLab(input.plan.temporaryDatabaseId, input.factory);
    const counts = Object.fromEntries(
        HISTORY_RESCUE_STORE_ORDER.map(store => [store, 0]),
    ) as Record<HistoryRescueStoreName, number>;
    let globalWrites = 0;
    try {
        for (const store of HISTORY_RESCUE_STORE_ORDER) {
            const records = input.plan.sections[store];
            for (let start = 0; start < records.length; start += chunkSize) {
                const chunk = records.slice(start, start + chunkSize);
                const transaction = database.transaction(store, 'readwrite', { durability: 'strict' });
                const settled = transactionAsPromise(transaction);
                try {
                    const objectStore = transaction.objectStore(store);
                    for (const record of chunk) {
                        assertRecordId(record, store);
                        await requestAsPromise(objectStore.add(record));
                        counts[store] += 1;
                        globalWrites += 1;
                        const appliesToStore = !input.failureInjection?.store
                            || input.failureInjection.store === store;
                        if (
                            appliesToStore
                            && input.failureInjection?.afterRecordWrites === globalWrites
                        ) {
                            const injected = createInjectedFailure(input.failureInjection.kind);
                            await settleAbortedTransaction(transaction, settled);
                            throw injected;
                        }
                    }
                    await settled;
                } catch (error) {
                    await settleAbortedTransaction(transaction, settled);
                    throw error;
                }
            }
        }
        return counts;
    } finally {
        database.close();
    }
};

export const restoreAndVerifyHistoryTemporaryIndexedDbLab = async (input: {
    plan: HistoryTemporaryRestorePlan;
    verifiedAt: number;
    factory?: IDBFactory;
    chunkSize?: number;
    pageSize?: number;
}): Promise<HistoryTemporaryRestoreVerification> => {
    await writeHistoryTemporaryRestorePlanToIndexedDbLab({
        plan: input.plan,
        factory: input.factory,
        chunkSize: input.chunkSize,
    });
    const database = await openHistoryIndexedDbLab(input.plan.temporaryDatabaseId, input.factory);
    try {
        const observed = await readHistoryIndexedDbLabSections(database, {
            pageSize: input.pageSize,
            orderingTemplate: input.plan.sections,
        });
        return verifyHistoryTemporaryRestore(input.plan, observed, input.verifiedAt);
    } finally {
        database.close();
    }
};
