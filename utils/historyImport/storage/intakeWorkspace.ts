import type { HistoryIdentityBindingDraft } from '../../../domain/historyImport/identityBinding';
import {
    createHistoryIntakeWorkspaceManifest,
    createHistoryIntakeWorkspaceRow,
    type HistoryIntakeWorkspaceManifest,
    type HistoryIntakeWorkspaceRowRecord,
} from '../../../domain/historyImport/intakeWorkspace';
import { buildHistoryImportFullPreview } from '../parsers/sourcePreview';
import type { HistoryPreviewSourceInput } from '../parsers/sourcePreview';

export const HISTORY_INTAKE_WORKSPACE_DB_NAME = 'AetherOS_HistoryIntake:v2';
export const HISTORY_INTAKE_WORKSPACE_DB_VERSION = 1;
export const HISTORY_INTAKE_WORKSPACE_WRITE_CHUNK = 500;
export const HISTORY_INTAKE_WORKSPACE_PAGE_LIMIT = 500;

export const HISTORY_INTAKE_WORKSPACE_STORES = {
    manifests: 'history_intake_manifests',
    rows: 'history_intake_rows',
} as const;

export interface HistoryIntakeWorkspaceCreateProgress {
    phase: 'parsing' | 'saving' | 'ready';
    processedRows: number;
    totalRows?: number;
}

export interface HistoryIntakeWorkspacePage {
    items: HistoryIntakeWorkspaceRowRecord[];
    nextCursor?: number;
    hasMore: boolean;
}

const getIndexedDb = (): IDBFactory => {
    if (!globalThis.indexedDB) throw new Error('当前环境不支持 IndexedDB，无法保存导入进度。');
    return globalThis.indexedDB;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机导入数据库操作失败。'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('本机导入事务失败。'));
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
});

export const openHistoryIntakeWorkspaceDatabase = async (): Promise<IDBDatabase> => {
    const request = getIndexedDb().open(
        HISTORY_INTAKE_WORKSPACE_DB_NAME,
        HISTORY_INTAKE_WORKSPACE_DB_VERSION,
    );
    request.onupgradeneeded = () => {
        const database = request.result;
        const manifests = database.createObjectStore(
            HISTORY_INTAKE_WORKSPACE_STORES.manifests,
            { keyPath: 'id' },
        );
        manifests.createIndex('updated_at', 'updatedAt', { unique: false });
        const rows = database.createObjectStore(
            HISTORY_INTAKE_WORKSPACE_STORES.rows,
            { keyPath: 'id' },
        );
        rows.createIndex('workspace_order', ['workspaceId', 'sourceOrder'], { unique: true });
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('无法打开本机导入工作区。'));
        request.onblocked = () => reject(new Error('本机导入工作区正被另一个页面占用。'));
    });
    database.onversionchange = () => database.close();
    return database;
};

const workspaceRange = (workspaceId: string, cursor?: number): IDBKeyRange => (
    IDBKeyRange.bound(
        [workspaceId, cursor === undefined ? 0 : cursor + 1],
        [workspaceId, Number.MAX_SAFE_INTEGER],
    )
);

const getManifest = async (
    transaction: IDBTransaction,
    workspaceId: string,
): Promise<HistoryIntakeWorkspaceManifest | null> => {
    const value = await requestAsPromise(
        transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.manifests).get(workspaceId),
    );
    return value === undefined ? null : value as HistoryIntakeWorkspaceManifest;
};

const deleteWorkspaceRows = async (
    store: IDBObjectStore,
    workspaceId: string,
): Promise<void> => {
    const index = store.index('workspace_order');
    await new Promise<void>((resolve, reject) => {
        const request = index.openKeyCursor(workspaceRange(workspaceId));
        request.onerror = () => reject(request.error ?? new Error('无法清理旧的导入行。'));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve();
                return;
            }
            store.delete(cursor.primaryKey);
            cursor.continue();
        };
    });
};

export const createHistoryIntakeWorkspaceFromSource = async (input: {
    source: Omit<HistoryPreviewSourceInput, 'bindingDraft'>;
    bindingDraft: HistoryIdentityBindingDraft;
    now?: number;
    onProgress?: (progress: HistoryIntakeWorkspaceCreateProgress) => void;
}): Promise<HistoryIntakeWorkspaceManifest> => {
    const now = input.now ?? Date.now();
    input.onProgress?.({ phase: 'parsing', processedRows: 0 });
    const preview = await buildHistoryImportFullPreview({
        ...input.source,
        bindingDraft: input.bindingDraft,
    });
    let manifest = createHistoryIntakeWorkspaceManifest({ preview, bindingDraft: input.bindingDraft, now });
    const database = await openHistoryIntakeWorkspaceDatabase();
    try {
        const existingTransaction = database.transaction(
            HISTORY_INTAKE_WORKSPACE_STORES.manifests,
            'readonly',
        );
        const existing = await getManifest(existingTransaction, manifest.id);
        if (
            existing?.status === 'ready'
            && existing.persistedRowCount === existing.totalRowCount
            && existing.intakeFingerprint === manifest.intakeFingerprint
        ) {
            input.onProgress?.({ phase: 'ready', processedRows: existing.totalRowCount, totalRows: existing.totalRowCount });
            return existing;
        }

        const reset = database.transaction([
            HISTORY_INTAKE_WORKSPACE_STORES.manifests,
            HISTORY_INTAKE_WORKSPACE_STORES.rows,
        ], 'readwrite', { durability: 'strict' });
        const resetDone = transactionAsPromise(reset);
        await deleteWorkspaceRows(reset.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.rows), manifest.id);
        await requestAsPromise(reset.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.manifests).put(manifest));
        await resetDone;

        input.onProgress?.({ phase: 'saving', processedRows: 0, totalRows: preview.rows.length });
        for (let offset = 0; offset < preview.rows.length; offset += HISTORY_INTAKE_WORKSPACE_WRITE_CHUNK) {
            const chunk = preview.rows.slice(offset, offset + HISTORY_INTAKE_WORKSPACE_WRITE_CHUNK);
            const transaction = database.transaction([
                HISTORY_INTAKE_WORKSPACE_STORES.manifests,
                HISTORY_INTAKE_WORKSPACE_STORES.rows,
            ], 'readwrite', { durability: 'strict' });
            const done = transactionAsPromise(transaction);
            const rows = transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.rows);
            for (const source of chunk) {
                await requestAsPromise(rows.put(createHistoryIntakeWorkspaceRow({
                    workspaceId: manifest.id,
                    source,
                    now,
                })));
            }
            manifest = {
                ...manifest,
                persistedRowCount: offset + chunk.length,
                updatedAt: now,
                revision: manifest.revision + 1,
            };
            await requestAsPromise(
                transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.manifests).put(manifest),
            );
            await done;
            input.onProgress?.({ phase: 'saving', processedRows: manifest.persistedRowCount, totalRows: manifest.totalRowCount });
        }

        const finish = database.transaction(HISTORY_INTAKE_WORKSPACE_STORES.manifests, 'readwrite', { durability: 'strict' });
        const finishDone = transactionAsPromise(finish);
        manifest = {
            ...manifest,
            status: 'ready',
            updatedAt: now,
            revision: manifest.revision + 1,
        };
        await requestAsPromise(finish.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.manifests).put(manifest));
        await finishDone;
        input.onProgress?.({ phase: 'ready', processedRows: manifest.totalRowCount, totalRows: manifest.totalRowCount });
        return manifest;
    } finally {
        database.close();
    }
};

export const getLatestHistoryIntakeWorkspace = async (): Promise<HistoryIntakeWorkspaceManifest | null> => {
    const database = await openHistoryIntakeWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_INTAKE_WORKSPACE_STORES.manifests, 'readonly');
        const index = transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.manifests).index('updated_at');
        return await new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            request.onerror = () => reject(request.error ?? new Error('无法读取最近的导入进度。'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(null);
                    return;
                }
                const manifest = cursor.value as HistoryIntakeWorkspaceManifest;
                if (manifest.status === 'ready' && manifest.persistedRowCount === manifest.totalRowCount) {
                    resolve(manifest);
                    return;
                }
                cursor.continue();
            };
        });
    } finally {
        database.close();
    }
};

export const pageHistoryIntakeWorkspaceRows = async (input: {
    workspaceId: string;
    cursor?: number;
    limit: number;
}): Promise<HistoryIntakeWorkspacePage> => {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > HISTORY_INTAKE_WORKSPACE_PAGE_LIMIT) {
        throw new Error(`导入分页必须在 1-${HISTORY_INTAKE_WORKSPACE_PAGE_LIMIT} 条之间。`);
    }
    const database = await openHistoryIntakeWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_INTAKE_WORKSPACE_STORES.rows, 'readonly');
        const index = transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.rows).index('workspace_order');
        const items = await new Promise<HistoryIntakeWorkspaceRowRecord[]>((resolve, reject) => {
            const collected: HistoryIntakeWorkspaceRowRecord[] = [];
            const request = index.openCursor(workspaceRange(input.workspaceId, input.cursor), 'next');
            request.onerror = () => reject(request.error ?? new Error('导入分页读取失败。'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || collected.length >= input.limit + 1) {
                    resolve(collected);
                    return;
                }
                collected.push(cursor.value as HistoryIntakeWorkspaceRowRecord);
                cursor.continue();
            };
        });
        const hasMore = items.length > input.limit;
        const visible = hasMore ? items.slice(0, input.limit) : items;
        return {
            items: visible,
            hasMore,
            nextCursor: hasMore ? visible[visible.length - 1]?.sourceOrder : undefined,
        };
    } finally {
        database.close();
    }
};

export const iterateHistoryIntakeWorkspaceRows = async function* (
    workspaceId: string,
): AsyncGenerator<HistoryIntakeWorkspaceRowRecord> {
    let cursor: number | undefined;
    do {
        const page = await pageHistoryIntakeWorkspaceRows({
            workspaceId,
            cursor,
            limit: HISTORY_INTAKE_WORKSPACE_PAGE_LIMIT,
        });
        for (const row of page.items) yield row;
        cursor = page.nextCursor;
        if (!page.hasMore) break;
    } while (cursor !== undefined);
};

export const deleteHistoryIntakeWorkspace = async (workspaceId: string): Promise<void> => {
    const database = await openHistoryIntakeWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            HISTORY_INTAKE_WORKSPACE_STORES.manifests,
            HISTORY_INTAKE_WORKSPACE_STORES.rows,
        ], 'readwrite', { durability: 'strict' });
        const done = transactionAsPromise(transaction);
        await deleteWorkspaceRows(transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.rows), workspaceId);
        await requestAsPromise(transaction.objectStore(HISTORY_INTAKE_WORKSPACE_STORES.manifests).delete(workspaceId));
        await done;
    } finally {
        database.close();
    }
};

export const deleteHistoryIntakeWorkspaceDatabase = async (): Promise<void> => {
    const request = getIndexedDb().deleteDatabase(HISTORY_INTAKE_WORKSPACE_DB_NAME);
    await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('无法删除本机导入工作区。'));
        request.onblocked = () => reject(new Error('本机导入工作区仍被页面占用。'));
    });
};
