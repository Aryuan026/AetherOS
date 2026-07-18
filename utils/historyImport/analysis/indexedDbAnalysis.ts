import { validateHistoryAnalysisSnapshot } from '../../../domain/historyImport/analysis/contract.ts';
import type { HistoryAnalysisSnapshot } from '../../../domain/historyImport/analysis/types.ts';
import type { HistoryScope } from '../../../domain/historyImport/types.ts';
import { validateHistoryScope } from '../../../domain/historyImport/contract.ts';

export const HISTORY_ANALYSIS_DB_NAME = 'AetherOS_HistoryAnalysis:v1' as const;
export const HISTORY_ANALYSIS_DB_VERSION = 1 as const;
export const HISTORY_ANALYSIS_SNAPSHOT_STORE = 'history_analysis_snapshots' as const;
export const HISTORY_ANALYSIS_SCOPE_STATUS_INDEX = 'scope_status_created' as const;

const getIndexedDbFactory = (factory?: IDBFactory): IDBFactory => {
    const resolved = factory ?? globalThis.indexedDB;
    if (!resolved) throw new Error('IndexedDB is unavailable in this environment');
    return resolved;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
});

const settleAbort = async (
    transaction: IDBTransaction,
    settled: Promise<void>,
): Promise<void> => {
    try {
        transaction.abort();
    } catch {
        // The transaction may already be settled.
    }
    try {
        await settled;
    } catch {
        // The caller receives the more specific contract/concurrency error.
    }
};

const activeScopeRange = (scope: HistoryScope): IDBKeyRange => IDBKeyRange.bound(
    [scope.progressBundleId, scope.personaMaskId, scope.charId, 'active', 0],
    [scope.progressBundleId, scope.personaMaskId, scope.charId, 'active', Number.MAX_SAFE_INTEGER],
);

const readActiveSnapshots = async (
    index: IDBIndex,
    scope: HistoryScope,
): Promise<HistoryAnalysisSnapshot[]> => new Promise((resolve, reject) => {
    const snapshots: HistoryAnalysisSnapshot[] = [];
    const request = index.openCursor(activeScopeRange(scope), 'prev');
    request.onerror = () => reject(request.error ?? new Error('history analysis cursor failed'));
    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || snapshots.length >= 2) {
            resolve(snapshots);
            return;
        }
        snapshots.push(cursor.value as HistoryAnalysisSnapshot);
        cursor.continue();
    };
});

export const openHistoryAnalysisDatabase = async (
    factory?: IDBFactory,
): Promise<IDBDatabase> => {
    const request = getIndexedDbFactory(factory).open(
        HISTORY_ANALYSIS_DB_NAME,
        HISTORY_ANALYSIS_DB_VERSION,
    );
    request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(HISTORY_ANALYSIS_SNAPSHOT_STORE, {
            keyPath: 'id',
        });
        store.createIndex(
            HISTORY_ANALYSIS_SCOPE_STATUS_INDEX,
            [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
                'status',
                'createdAt',
            ],
            { unique: false },
        );
        store.createIndex('request_id', 'requestId', { unique: true });
        store.createIndex('analysis_run_id', 'analysisRunId', { unique: true });
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('history analysis database open failed'));
        request.onblocked = () => reject(new Error('opening history analysis database was blocked'));
    });
    database.onversionchange = () => database.close();
    return database;
};

export const getActiveHistoryAnalysisSnapshot = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<HistoryAnalysisSnapshot | null> => {
    const scopeErrors = validateHistoryScope(input.scope);
    if (scopeErrors.length > 0) throw new Error(scopeErrors.join('; '));
    const database = await openHistoryAnalysisDatabase(input.factory);
    try {
        const transaction = database.transaction(HISTORY_ANALYSIS_SNAPSHOT_STORE, 'readonly');
        const snapshots = await readActiveSnapshots(
            transaction.objectStore(HISTORY_ANALYSIS_SNAPSHOT_STORE).index(HISTORY_ANALYSIS_SCOPE_STATUS_INDEX),
            input.scope,
        );
        if (snapshots.length > 1) throw new Error('history analysis scope has multiple active snapshots');
        const snapshot = snapshots[0];
        if (!snapshot) return null;
        const errors = validateHistoryAnalysisSnapshot(snapshot);
        if (errors.length > 0) throw new Error(`stored history analysis snapshot is invalid: ${errors.join('; ')}`);
        return snapshot;
    } finally {
        database.close();
    }
};

/**
 * Atomically supersede one relationship's prior interpretation and publish a
 * complete new snapshot. No partial memory/timebook/profile write is exposed.
 */
export const activateHistoryAnalysisSnapshot = async (input: {
    snapshot: HistoryAnalysisSnapshot;
    expectedActiveSnapshotId?: string;
    factory?: IDBFactory;
}): Promise<HistoryAnalysisSnapshot> => {
    const errors = validateHistoryAnalysisSnapshot(input.snapshot);
    if (errors.length > 0) throw new Error(`invalid history analysis snapshot: ${errors.join('; ')}`);
    if (input.snapshot.status !== 'active') throw new Error('only an active history analysis snapshot can be published');

    const database = await openHistoryAnalysisDatabase(input.factory);
    const transaction = database.transaction(HISTORY_ANALYSIS_SNAPSHOT_STORE, 'readwrite', {
        durability: 'strict',
    });
    const settled = transactionAsPromise(transaction);
    try {
        const store = transaction.objectStore(HISTORY_ANALYSIS_SNAPSHOT_STORE);
        const byId = await requestAsPromise(store.get(input.snapshot.id));
        if (byId !== undefined) {
            const existing = byId as HistoryAnalysisSnapshot;
            if (JSON.stringify(existing) !== JSON.stringify(input.snapshot)) {
                throw new Error(`history analysis snapshot id ${input.snapshot.id} already contains another revision`);
            }
            await settled;
            return existing;
        }

        const active = await readActiveSnapshots(
            store.index(HISTORY_ANALYSIS_SCOPE_STATUS_INDEX),
            input.snapshot.scope,
        );
        if (active.length > 1) throw new Error('history analysis scope has multiple active snapshots');
        const previous = active[0];
        if (previous && input.expectedActiveSnapshotId !== previous.id) {
            throw new Error('history analysis active snapshot changed before publication');
        }
        if (!previous && input.expectedActiveSnapshotId !== undefined) {
            throw new Error('history analysis expected snapshot is no longer active');
        }
        if (previous) {
            await requestAsPromise(store.put({
                ...previous,
                status: 'superseded',
                updatedAt: input.snapshot.updatedAt,
                revision: previous.revision + 1,
            } satisfies HistoryAnalysisSnapshot));
        }
        await requestAsPromise(store.add(input.snapshot));
        await settled;
        return input.snapshot;
    } catch (error) {
        await settleAbort(transaction, settled);
        throw error;
    } finally {
        database.close();
    }
};
