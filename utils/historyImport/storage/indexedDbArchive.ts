import {
    commitHistoryJobChunk,
    completeHistoryJob,
    startHistoryJob,
} from '../../../domain/historyImport/jobState.ts';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../../../domain/historyImport/contract.ts';
import type {
    HistoryBackupReceipt,
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

export const HISTORY_ARCHIVE_DB_PREFIX = 'AetherOS_HistoryArchive:v1:' as const;
export const HISTORY_ARCHIVE_DB_VERSION = 2 as const;
export const HISTORY_ARCHIVE_MAX_CHUNK_RECORDS = 500 as const;
export const HISTORY_ARCHIVE_MAX_PAGE_RECORDS = 500 as const;
export const HISTORY_ARCHIVE_CONTROL_DB_NAME = 'AetherOS_HistoryArchive_Control';
export const HISTORY_ARCHIVE_CONTROL_DB_VERSION = 1 as const;
export const HISTORY_ARCHIVE_CONTROL_STORE = 'history_archive_control';
export const HISTORY_ARCHIVE_ACTIVE_RECORD_ID = 'active';

export interface HistoryArchiveIndexSpec {
    name: string;
    keyPath: string | string[];
    unique: boolean;
}

export interface HistoryArchiveStoreSpec {
    keyPath: 'id';
    indexes: readonly HistoryArchiveIndexSpec[];
}

const SCOPE_KEY_PATH = ['scope.progressBundleId', 'scope.charId'] as const;

export const HISTORY_ARCHIVE_SCHEMA: Record<HistoryRescueStoreName, HistoryArchiveStoreSpec> = {
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
            { name: 'scope_source_order', keyPath: [...SCOPE_KEY_PATH, 'sourceOrder'], unique: false },
            {
                name: 'scope_imported_order',
                keyPath: [...SCOPE_KEY_PATH, 'importedAt', 'sourceOrder'],
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

export interface HistoryArchivePage<T = unknown> {
    items: T[];
    nextCursor?: string;
    hasMore: boolean;
}

export interface HistoryArchiveActivationRecord {
    schemaVersion: 1;
    id: typeof HISTORY_ARCHIVE_ACTIVE_RECORD_ID;
    activeDatabaseId: string;
    retainedPreviousDatabaseIds: string[];
    sourceCandidateDatabaseId: string;
    archiveId: string;
    manifestChecksum: string;
    recordCounts: Record<HistoryRescueStoreName, number>;
    activationKind?: 'import_commit' | 'verified_restore';
    lastVerifiedBackupReceipt?: HistoryBackupReceipt;
    activatedAt: number;
    revision: number;
}

export interface HistoryArchiveChunkCommitResult {
    attempted: number;
    inserted: number;
    unchanged: number;
    checkpointHash: string;
    durableProcessedCount: number;
}

const assertArchiveDatabaseId = (databaseId: string): void => {
    if (!databaseId.startsWith(HISTORY_ARCHIVE_DB_PREFIX)) {
        throw new Error(`history archive database id must start with ${HISTORY_ARCHIVE_DB_PREFIX}`);
    }
    if (databaseId.length <= HISTORY_ARCHIVE_DB_PREFIX.length) {
        throw new Error('history archive database id needs a non-empty slot suffix');
    }
    if (databaseId === HISTORY_ARCHIVE_CONTROL_DB_NAME || databaseId === 'AetherOS_Data') {
        throw new Error('history archive slot must remain separate from control and legacy databases');
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

const abortAndSettle = async (
    transaction: IDBTransaction,
    settled: Promise<void>,
): Promise<void> => {
    try {
        transaction.abort();
    } catch {
        // Already committed or aborted.
    }
    try {
        await settled;
    } catch {
        // Preserve the caller's more specific validation error.
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

const sha256 = async (value: string): Promise<string> => {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this environment');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

export const createHistoryArchiveCandidateDatabaseId = (decisionFingerprint: string): string => {
    const normalized = decisionFingerprint.trim().toLowerCase();
    if (!/^[a-f0-9]{32,}$/u.test(normalized)) throw new Error('review decision fingerprint is invalid');
    return `${HISTORY_ARCHIVE_DB_PREFIX}candidate-${normalized.slice(0, 32)}`;
};

export const createHistoryArchiveRestoreDatabaseId = (archiveId: string): string => {
    const normalized = archiveId.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, '-').slice(0, 96);
    if (!normalized) throw new Error('history archive id is invalid');
    return `${HISTORY_ARCHIVE_DB_PREFIX}restore-${normalized}`;
};

export const calculateHistoryArchiveChunkCheckpointHash = async (
    messages: HistorySourceMessage[],
): Promise<string> => sha256(stableHistoryRescueJson(messages.map(message => ({
    id: message.id,
    batchId: message.batchId,
    sourceOrder: message.sourceOrder,
    sourceFingerprint: message.sourceFingerprint,
}))));

export const createHistoryArchiveCheckpoint = async (input: {
    messages: HistorySourceMessage[];
    fromProcessedCount: number;
}): Promise<HistoryJobChunkCheckpoint> => {
    if (input.messages.length < 1 || input.messages.length > HISTORY_ARCHIVE_MAX_CHUNK_RECORDS) {
        throw new Error(`history archive chunk must contain 1-${HISTORY_ARCHIVE_MAX_CHUNK_RECORDS} messages`);
    }
    const finalMessage = input.messages[input.messages.length - 1];
    const toProcessedCount = input.fromProcessedCount + input.messages.length;
    const checkpointHash = await calculateHistoryArchiveChunkCheckpointHash(input.messages);
    return {
        idempotencyKey: `history-archive:${input.fromProcessedCount}-${toProcessedCount}:${checkpointHash}`,
        fromProcessedCount: input.fromProcessedCount,
        toProcessedCount,
        lastSourceOrder: finalMessage.sourceOrder,
        lastSourceMessageId: finalMessage.id,
        checkpointHash,
    };
};

export const openHistoryArchiveDatabase = async (
    databaseId: string,
    factory?: IDBFactory,
): Promise<IDBDatabase> => {
    assertArchiveDatabaseId(databaseId);
    const request = getIndexedDbFactory(factory).open(databaseId, HISTORY_ARCHIVE_DB_VERSION);
    request.onupgradeneeded = () => {
        const database = request.result;
        HISTORY_RESCUE_STORE_ORDER.forEach(storeName => {
            const spec = HISTORY_ARCHIVE_SCHEMA[storeName];
            const store = database.objectStoreNames.contains(storeName)
                ? request.transaction!.objectStore(storeName)
                : database.createObjectStore(storeName, { keyPath: spec.keyPath });
            spec.indexes.forEach(index => {
                if (!store.indexNames.contains(index.name)) {
                    store.createIndex(index.name, index.keyPath, { unique: index.unique });
                }
            });
        });
    };
    const database = await openRequestAsPromise<IDBDatabase>(
        request,
        `opening ${databaseId} was blocked`,
    );
    database.onversionchange = () => database.close();
    const observedStores = Array.from(database.objectStoreNames).sort();
    const expectedStores = [...HISTORY_RESCUE_STORE_ORDER].sort();
    if (
        observedStores.length !== expectedStores.length
        || observedStores.some((store, index) => store !== expectedStores[index])
    ) {
        database.close();
        throw new Error('history archive database must contain exactly the declared eight stores');
    }
    return database;
};

export const deleteHistoryArchiveDatabase = async (
    databaseId: string,
    factory?: IDBFactory,
): Promise<void> => {
    assertArchiveDatabaseId(databaseId);
    const active = await getActiveHistoryArchive(factory);
    if (active?.activeDatabaseId === databaseId) {
        throw new Error('refusing to delete the active history archive database');
    }
    const request = getIndexedDbFactory(factory).deleteDatabase(databaseId);
    await openRequestAsPromise<undefined>(request, `deleting ${databaseId} was blocked`);
};

const openHistoryArchiveControlDatabase = async (factory?: IDBFactory): Promise<IDBDatabase> => {
    const request = getIndexedDbFactory(factory).open(
        HISTORY_ARCHIVE_CONTROL_DB_NAME,
        HISTORY_ARCHIVE_CONTROL_DB_VERSION,
    );
    request.onupgradeneeded = () => {
        request.result.createObjectStore(HISTORY_ARCHIVE_CONTROL_STORE, { keyPath: 'id' });
    };
    const database = await openRequestAsPromise<IDBDatabase>(
        request,
        'opening history archive control was blocked',
    );
    database.onversionchange = () => database.close();
    return database;
};

export const getActiveHistoryArchive = async (
    factory?: IDBFactory,
): Promise<HistoryArchiveActivationRecord | null> => {
    const database = await openHistoryArchiveControlDatabase(factory);
    try {
        const transaction = database.transaction(HISTORY_ARCHIVE_CONTROL_STORE, 'readonly');
        const value = await requestAsPromise(
            transaction.objectStore(HISTORY_ARCHIVE_CONTROL_STORE).get(HISTORY_ARCHIVE_ACTIVE_RECORD_ID),
        );
        return value === undefined ? null : value as HistoryArchiveActivationRecord;
    } finally {
        database.close();
    }
};

export const pageHistoryArchiveStore = async <T = unknown>(input: {
    database: IDBDatabase;
    store: HistoryRescueStoreName;
    cursor?: string;
    limit: number;
}): Promise<HistoryArchivePage<T>> => {
    assertArchiveDatabaseId(input.database.name);
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > HISTORY_ARCHIVE_MAX_PAGE_RECORDS) {
        throw new Error(`history archive page limit must be 1-${HISTORY_ARCHIVE_MAX_PAGE_RECORDS}`);
    }
    const transaction = input.database.transaction(input.store, 'readonly');
    const range = input.cursor === undefined ? undefined : IDBKeyRange.lowerBound(input.cursor, true);
    return new Promise((resolve, reject) => {
        const items: T[] = [];
        const request = transaction.objectStore(input.store).openCursor(range);
        request.onerror = () => reject(request.error ?? new Error('history archive cursor failed'));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ items, hasMore: false });
                return;
            }
            if (items.length === input.limit) {
                resolve({
                    items,
                    nextCursor: assertRecordId(items[items.length - 1], input.store),
                    hasMore: true,
                });
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
    const byId = new Map(observed.map(record => [assertRecordId(record, store), record]));
    const ordered: unknown[] = [];
    template.forEach(record => {
        const id = assertRecordId(record, store);
        const match = byId.get(id);
        if (match !== undefined) {
            ordered.push(match);
            byId.delete(id);
        }
    });
    ordered.push(...Array.from(byId.values()).sort((left, right) => (
        assertRecordId(left, store).localeCompare(assertRecordId(right, store))
    )));
    return ordered;
};

export const readHistoryArchiveSections = async (
    database: IDBDatabase,
    options?: {
        pageSize?: number;
        orderingTemplate?: HistoryRescueSanitizedSections;
    },
): Promise<HistoryRescueSanitizedSections> => {
    assertArchiveDatabaseId(database.name);
    const pageSize = options?.pageSize ?? HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit;
    const sections = Object.fromEntries(
        HISTORY_RESCUE_STORE_ORDER.map(store => [store, []]),
    ) as unknown as HistoryRescueSanitizedSections;
    for (const store of HISTORY_RESCUE_STORE_ORDER) {
        const records: unknown[] = [];
        let cursor: string | undefined;
        do {
            const page = await pageHistoryArchiveStore({ database, store, cursor, limit: pageSize });
            records.push(...page.items);
            cursor = page.hasMore ? page.nextCursor : undefined;
        } while (cursor !== undefined);
        sections[store] = orderObservedRecords(store, records, options?.orderingTemplate?.[store]);
    }
    return sections;
};

export const writeHistoryArchiveSections = async (input: {
    databaseId: string;
    sections: HistoryRescueSanitizedSections;
    factory?: IDBFactory;
    chunkSize?: number;
}): Promise<Record<HistoryRescueStoreName, number>> => {
    assertArchiveDatabaseId(input.databaseId);
    const chunkSize = input.chunkSize ?? HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit;
    if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > HISTORY_ARCHIVE_MAX_CHUNK_RECORDS) {
        throw new Error(`history archive restore chunk must be 1-${HISTORY_ARCHIVE_MAX_CHUNK_RECORDS}`);
    }
    const database = await openHistoryArchiveDatabase(input.databaseId, input.factory);
    const counts = Object.fromEntries(
        HISTORY_RESCUE_STORE_ORDER.map(store => [store, 0]),
    ) as Record<HistoryRescueStoreName, number>;
    try {
        for (const store of HISTORY_RESCUE_STORE_ORDER) {
            const records = input.sections[store];
            for (let offset = 0; offset < records.length; offset += chunkSize) {
                const chunk = records.slice(offset, offset + chunkSize);
                const transaction = database.transaction(store, 'readwrite', { durability: 'strict' });
                const settled = transactionAsPromise(transaction);
                try {
                    const target = transaction.objectStore(store);
                    for (const record of chunk) {
                        assertRecordId(record, store);
                        await requestAsPromise(target.add(record));
                        counts[store] += 1;
                    }
                    await settled;
                } catch (error) {
                    await abortAndSettle(transaction, settled);
                    throw error;
                }
            }
        }
        return counts;
    } finally {
        database.close();
    }
};

export const replaceHistoryArchiveDatabaseFromSections = async (input: {
    databaseId: string;
    sections: HistoryRescueSanitizedSections;
    factory?: IDBFactory;
}): Promise<Record<HistoryRescueStoreName, number>> => {
    await deleteHistoryArchiveDatabase(input.databaseId, input.factory);
    return writeHistoryArchiveSections(input);
};

export const getHistoryArchiveRecord = async <T = unknown>(input: {
    databaseId: string;
    store: HistoryRescueStoreName;
    id: string;
    factory?: IDBFactory;
}): Promise<T | null> => {
    const database = await openHistoryArchiveDatabase(input.databaseId, input.factory);
    try {
        const transaction = database.transaction(input.store, 'readonly');
        const value = await requestAsPromise(transaction.objectStore(input.store).get(input.id));
        return value === undefined ? null : value as T;
    } finally {
        database.close();
    }
};

export const initializeHistoryArchiveImport = async (input: {
    database: IDBDatabase;
    batch: HistoryImportBatch;
    job: HistoryJob;
    now: number;
}): Promise<{ batch: HistoryImportBatch; job: HistoryJob }> => {
    assertArchiveDatabaseId(input.database.name);
    if (input.job.batchId !== input.batch.id || input.batch.status !== 'ready') {
        throw new Error('history archive import requires a matching ready batch and job');
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
        if (existingBatch || existingJob) throw new Error('history archive import ids already exist');
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
        await abortAndSettle(transaction, settled);
        throw error;
    }
};

const assertChunkShape = (
    messages: HistorySourceMessage[],
    checkpoint: HistoryJobChunkCheckpoint,
): void => {
    if (messages.length < 1 || messages.length > HISTORY_ARCHIVE_MAX_CHUNK_RECORDS) {
        throw new Error(`history archive chunk must contain 1-${HISTORY_ARCHIVE_MAX_CHUNK_RECORDS} messages`);
    }
    if (checkpoint.toProcessedCount - checkpoint.fromProcessedCount !== messages.length) {
        throw new Error('history archive checkpoint range does not match chunk length');
    }
    const final = messages[messages.length - 1];
    if (checkpoint.lastSourceMessageId !== final.id || checkpoint.lastSourceOrder !== final.sourceOrder) {
        throw new Error('history archive checkpoint does not identify the final message');
    }
    if (messages.some(message => message.batchId !== messages[0].batchId)) {
        throw new Error('history archive chunk cannot mix batches');
    }
    for (let index = 1; index < messages.length; index += 1) {
        if (messages[index].sourceOrder <= messages[index - 1].sourceOrder) {
            throw new Error('history archive source order must be strictly increasing');
        }
    }
};

export const commitHistoryArchiveChunk = async (input: {
    database: IDBDatabase;
    batchId: string;
    jobId: string;
    messages: HistorySourceMessage[];
    checkpoint: HistoryJobChunkCheckpoint;
    now: number;
}): Promise<HistoryArchiveChunkCommitResult> => {
    assertArchiveDatabaseId(input.database.name);
    assertChunkShape(input.messages, input.checkpoint);
    if (input.messages[0].batchId !== input.batchId) throw new Error('history archive chunk batch mismatch');
    const transaction = input.database.transaction([
        HISTORY_IMPORT_STORE_NAMES.batches,
        HISTORY_IMPORT_STORE_NAMES.sourceMessages,
        HISTORY_IMPORT_STORE_NAMES.jobs,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const batches = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.batches);
        const messages = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.sourceMessages);
        const jobs = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.jobs);
        const [batchValue, jobValue] = await Promise.all([
            requestAsPromise(batches.get(input.batchId)),
            requestAsPromise(jobs.get(input.jobId)),
        ]);
        if (!batchValue || !jobValue) throw new Error('history archive batch or job is missing');
        const batch = batchValue as HistoryImportBatch;
        const job = jobValue as HistoryJob;
        if (batch.status !== 'importing' || job.batchId !== batch.id) {
            throw new Error('history archive batch/job state is invalid');
        }
        const nextJob = commitHistoryJobChunk(job, input.checkpoint, input.now);
        let inserted = 0;
        let unchanged = 0;
        for (const message of input.messages) {
            const existing = await requestAsPromise(messages.get(message.id));
            if (existing !== undefined) {
                if (stableHistoryRescueJson(existing) !== stableHistoryRescueJson(message)) {
                    throw new Error(`history archive stable-id conflict at ${message.id}`);
                }
                unchanged += 1;
                continue;
            }
            await requestAsPromise(messages.add(message));
            inserted += 1;
        }
        if (nextJob !== job) {
            const nextBatch: HistoryImportBatch = {
                ...batch,
                counts: { ...batch.counts, committed: nextJob.cursor.processedCount },
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
        await abortAndSettle(transaction, settled);
        throw error;
    }
};

export const completeHistoryArchiveImport = async (input: {
    database: IDBDatabase;
    batchId: string;
    jobId: string;
    now: number;
}): Promise<{ batch: HistoryImportBatch; job: HistoryJob }> => {
    assertArchiveDatabaseId(input.database.name);
    const transaction = input.database.transaction([
        HISTORY_IMPORT_STORE_NAMES.batches,
        HISTORY_IMPORT_STORE_NAMES.sourceMessages,
        HISTORY_IMPORT_STORE_NAMES.jobs,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const batches = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.batches);
        const messages = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.sourceMessages);
        const jobs = transaction.objectStore(HISTORY_IMPORT_STORE_NAMES.jobs);
        const [batchValue, jobValue, committedCount] = await Promise.all([
            requestAsPromise(batches.get(input.batchId)),
            requestAsPromise(jobs.get(input.jobId)),
            requestAsPromise(messages.index('batch_id').count(input.batchId)),
        ]);
        if (!batchValue || !jobValue) throw new Error('history archive batch or job is missing');
        const batch = batchValue as HistoryImportBatch;
        const job = jobValue as HistoryJob;
        if (
            batch.status !== 'importing'
            || committedCount !== job.cursor.totalCount
            || batch.counts.committed !== job.cursor.totalCount
            || job.cursor.processedCount !== job.cursor.totalCount
        ) {
            throw new Error('history archive cannot complete before rows and cursor agree');
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
        await abortAndSettle(transaction, settled);
        throw error;
    }
};

export const restoreAndVerifyHistoryArchiveDatabase = async (input: {
    plan: HistoryTemporaryRestorePlan;
    verifiedAt: number;
    factory?: IDBFactory;
}): Promise<HistoryTemporaryRestoreVerification> => {
    assertArchiveDatabaseId(input.plan.liveDatabaseId);
    assertArchiveDatabaseId(input.plan.temporaryDatabaseId);
    if (input.plan.liveDatabaseId === input.plan.temporaryDatabaseId) {
        throw new Error('history archive restore must use a distinct temporary slot');
    }
    if (input.plan.liveDatabaseMutationAllowed !== false) {
        throw new Error('history archive restore plan unexpectedly allows live mutation');
    }
    await replaceHistoryArchiveDatabaseFromSections({
        databaseId: input.plan.temporaryDatabaseId,
        sections: input.plan.sections,
        factory: input.factory,
    });
    const database = await openHistoryArchiveDatabase(input.plan.temporaryDatabaseId, input.factory);
    try {
        const observed = await readHistoryArchiveSections(database, {
            orderingTemplate: input.plan.sections,
        });
        return verifyHistoryTemporaryRestore(input.plan, observed, input.verifiedAt);
    } finally {
        database.close();
    }
};

const sameRecordCounts = (
    left: Record<string, number>,
    right: Record<HistoryRescueStoreName, number>,
): boolean => HISTORY_RESCUE_STORE_ORDER.every(store => left[store] === right[store]);

const verifyHistoryArchiveStoreCounts = async (input: {
    databaseId: string;
    expected: Record<HistoryRescueStoreName, number>;
    factory?: IDBFactory;
}): Promise<void> => {
    const database = await openHistoryArchiveDatabase(input.databaseId, input.factory);
    try {
        for (const store of HISTORY_RESCUE_STORE_ORDER) {
            const transaction = database.transaction(store, 'readonly');
            const count = await requestAsPromise(transaction.objectStore(store).count());
            if (count !== input.expected[store]) {
                throw new Error(`history archive count changed before activation at ${store}`);
            }
        }
    } finally {
        database.close();
    }
};

export const activateImportedHistoryArchive = async (input: {
    candidateDatabaseId: string;
    expectedActiveDatabaseId?: string;
    archiveId: string;
    manifestChecksum: string;
    recordCounts: Record<HistoryRescueStoreName, number>;
    activatedAt: number;
    factory?: IDBFactory;
}): Promise<HistoryArchiveActivationRecord> => {
    assertArchiveDatabaseId(input.candidateDatabaseId);
    if (!input.archiveId.trim() || !input.manifestChecksum.trim()) {
        throw new Error('history import activation requires stable archive identity');
    }
    await verifyHistoryArchiveStoreCounts({
        databaseId: input.candidateDatabaseId,
        expected: input.recordCounts,
        factory: input.factory,
    });

    const control = await openHistoryArchiveControlDatabase(input.factory);
    try {
        const transaction = control.transaction(HISTORY_ARCHIVE_CONTROL_STORE, 'readwrite', { durability: 'strict' });
        const settled = transactionAsPromise(transaction);
        const store = transaction.objectStore(HISTORY_ARCHIVE_CONTROL_STORE);
        try {
            const value = await requestAsPromise(store.get(HISTORY_ARCHIVE_ACTIVE_RECORD_ID));
            const current = value === undefined ? null : value as HistoryArchiveActivationRecord;
            if ((current?.activeDatabaseId || undefined) !== input.expectedActiveDatabaseId) {
                throw new Error('active history archive changed while the import was being prepared');
            }
            const retainedPreviousDatabaseIds = Array.from(new Set([
                ...(current ? [current.activeDatabaseId, ...current.retainedPreviousDatabaseIds] : []),
            ])).filter(databaseId => databaseId !== input.candidateDatabaseId);
            const next: HistoryArchiveActivationRecord = {
                schemaVersion: 1,
                id: HISTORY_ARCHIVE_ACTIVE_RECORD_ID,
                activeDatabaseId: input.candidateDatabaseId,
                retainedPreviousDatabaseIds,
                sourceCandidateDatabaseId: input.candidateDatabaseId,
                archiveId: input.archiveId,
                manifestChecksum: input.manifestChecksum,
                recordCounts: { ...input.recordCounts },
                activationKind: 'import_commit',
                activatedAt: input.activatedAt,
                revision: (current?.revision || 0) + 1,
            };
            await requestAsPromise(store.put(next));
            await settled;
            return next;
        } catch (error) {
            await abortAndSettle(transaction, settled);
            throw error;
        }
    } finally {
        control.close();
    }
};

export const activateVerifiedHistoryArchive = async (input: {
    verification: HistoryTemporaryRestoreVerification;
    receipt: HistoryBackupReceipt;
    sourceCandidateDatabaseId: string;
    expectedActiveDatabaseId?: string;
    activatedAt: number;
    factory?: IDBFactory;
}): Promise<HistoryArchiveActivationRecord> => {
    const { verification, receipt } = input;
    assertArchiveDatabaseId(input.sourceCandidateDatabaseId);
    assertArchiveDatabaseId(verification.temporaryDatabaseId);
    if (verification.liveDatabaseId !== input.sourceCandidateDatabaseId) {
        throw new Error('restore verification does not belong to this candidate slot');
    }
    if (
        verification.status !== 'temporary_restore_verified'
        || verification.switchPreconditionsSatisfied !== true
        || verification.liveDatabaseMutationAllowed !== false
    ) {
        throw new Error('temporary restore has not satisfied safe switch preconditions');
    }
    if (
        receipt.status !== 'restore_verified'
        || !receipt.externalCopyConfirmed
        || receipt.recoverySecretHandoff !== 'user_confirmed'
        || receipt.archiveId !== verification.archiveId
        || receipt.manifestChecksum !== verification.manifestChecksum
        || !sameRecordCounts(receipt.recordCounts, verification.recordCounts)
    ) {
        throw new Error('verified external rescue receipt does not match the restored archive');
    }

    await verifyHistoryArchiveStoreCounts({
        databaseId: verification.temporaryDatabaseId,
        expected: verification.recordCounts,
        factory: input.factory,
    });

    const control = await openHistoryArchiveControlDatabase(input.factory);
    try {
        const transaction = control.transaction(HISTORY_ARCHIVE_CONTROL_STORE, 'readwrite', { durability: 'strict' });
        const settled = transactionAsPromise(transaction);
        const store = transaction.objectStore(HISTORY_ARCHIVE_CONTROL_STORE);
        try {
            const value = await requestAsPromise(store.get(HISTORY_ARCHIVE_ACTIVE_RECORD_ID));
            const current = value === undefined ? null : value as HistoryArchiveActivationRecord;
            if ((current?.activeDatabaseId || undefined) !== input.expectedActiveDatabaseId) {
                throw new Error('active history archive changed while the rescue was being verified');
            }
            const retainedPreviousDatabaseIds = Array.from(new Set([
                ...(current ? [current.activeDatabaseId, ...current.retainedPreviousDatabaseIds] : []),
            ])).filter(databaseId => databaseId !== verification.temporaryDatabaseId);
            const next: HistoryArchiveActivationRecord = {
                schemaVersion: 1,
                id: HISTORY_ARCHIVE_ACTIVE_RECORD_ID,
                activeDatabaseId: verification.temporaryDatabaseId,
                retainedPreviousDatabaseIds,
                sourceCandidateDatabaseId: input.sourceCandidateDatabaseId,
                archiveId: verification.archiveId,
                manifestChecksum: verification.manifestChecksum,
                recordCounts: { ...verification.recordCounts },
                activationKind: 'verified_restore',
                lastVerifiedBackupReceipt: {
                    ...receipt,
                    recordCounts: { ...receipt.recordCounts },
                    lastDeliveryAttempt: receipt.lastDeliveryAttempt
                        ? { ...receipt.lastDeliveryAttempt }
                        : undefined,
                },
                activatedAt: input.activatedAt,
                revision: (current?.revision || 0) + 1,
            };
            await requestAsPromise(store.put(next));
            await settled;
            return next;
        } catch (error) {
            await abortAndSettle(transaction, settled);
            throw error;
        }
    } finally {
        control.close();
    }
};
