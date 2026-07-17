import type { HistoryIdentityBindingDraft } from '../../../domain/historyImport/identityBinding';
import type { HistoryPreviewRowReviewDraft } from '../../../domain/historyImport/previewReview';
import {
    HISTORY_REVIEW_WORKSPACE_VERSION,
    assessHistoryReviewWorkspace,
    createHistoryReviewWorkspaceManifest,
    createHistoryReviewWorkspaceRow,
    freezeHistoryReviewWorkspaceDecision,
    patchHistoryReviewWorkspaceRowRecord,
    type FrozenHistoryReviewWorkspaceDecision,
    type HistoryReviewWorkspaceAssessment,
    type HistoryReviewWorkspaceFilter,
    type HistoryReviewWorkspaceManifest,
    type HistoryReviewWorkspaceRowRecord,
    type HistoryReviewWorkspaceSettings,
} from '../../../domain/historyImport/reviewWorkspace';
import type { HistoryPreviewSourceInput } from '../parsers/sourcePreview';
import { buildHistoryImportFullPreview } from '../parsers/sourcePreview';

export const HISTORY_REVIEW_WORKSPACE_DB_NAME = 'AetherOS_HistoryImport_Workspace';
export const HISTORY_REVIEW_WORKSPACE_DB_VERSION = 1;
export const HISTORY_REVIEW_WORKSPACE_WRITE_CHUNK = 500;
export const HISTORY_REVIEW_WORKSPACE_PAGE_LIMIT = 100;

export const HISTORY_REVIEW_WORKSPACE_STORES = {
    workspaces: 'review_workspaces',
    rows: 'review_workspace_rows',
} as const;

export interface HistoryReviewWorkspacePage {
    items: HistoryReviewWorkspaceRowRecord[];
    nextCursor?: number;
    hasMore: boolean;
}

export interface HistoryReviewWorkspaceCreateProgress {
    phase: 'parsing' | 'saving' | 'ready';
    processedRows: number;
    totalRows?: number;
}

type WorkspaceStoreName = typeof HISTORY_REVIEW_WORKSPACE_STORES[keyof typeof HISTORY_REVIEW_WORKSPACE_STORES];

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('历史导入工作台读取失败。'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('历史导入工作台事务失败。'));
    transaction.onabort = () => reject(transaction.error ?? new DOMException('事务已中止。', 'AbortError'));
});

const getIndexedDb = (): IDBFactory => {
    if (!globalThis.indexedDB) throw new Error('当前浏览器不支持本机导入工作台。');
    return globalThis.indexedDB;
};

export const openHistoryReviewWorkspaceDatabase = async (): Promise<IDBDatabase> => {
    const request = getIndexedDb().open(
        HISTORY_REVIEW_WORKSPACE_DB_NAME,
        HISTORY_REVIEW_WORKSPACE_DB_VERSION,
    );
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(HISTORY_REVIEW_WORKSPACE_STORES.workspaces)) {
            const workspaces = database.createObjectStore(
                HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
                { keyPath: 'id' },
            );
            workspaces.createIndex('updated_at', 'updatedAt', { unique: false });
            workspaces.createIndex('status', 'status', { unique: false });
        }
        if (!database.objectStoreNames.contains(HISTORY_REVIEW_WORKSPACE_STORES.rows)) {
            const rows = database.createObjectStore(
                HISTORY_REVIEW_WORKSPACE_STORES.rows,
                { keyPath: 'id' },
            );
            rows.createIndex('workspace_order', ['workspaceId', 'sourceOrder'], { unique: true });
            rows.createIndex('workspace_bucket_order', ['workspaceId', 'bucket', 'sourceOrder'], { unique: false });
            rows.createIndex('workspace_attention_order', ['workspaceId', 'attentionKey', 'sourceOrder'], { unique: false });
        }
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('无法打开本机导入工作台。'));
        request.onblocked = () => reject(new Error('本机导入工作台被另一个页面占用，请关闭旧页面后重试。'));
    });
    database.onversionchange = () => database.close();
    return database;
};

const workspaceOrderRange = (workspaceId: string, after?: number): IDBKeyRange => (
    IDBKeyRange.bound(
        [workspaceId, after === undefined ? 0 : after + 1],
        [workspaceId, Number.MAX_SAFE_INTEGER],
    )
);

const workspaceBucketRange = (
    workspaceId: string,
    bucket: 'included' | 'excluded',
    after?: number,
): IDBKeyRange => IDBKeyRange.bound(
    [workspaceId, bucket, after === undefined ? 0 : after + 1],
    [workspaceId, bucket, Number.MAX_SAFE_INTEGER],
);

const workspaceAttentionRange = (workspaceId: string, after?: number): IDBKeyRange => (
    IDBKeyRange.bound(
        [workspaceId, 1, after === undefined ? 0 : after + 1],
        [workspaceId, 1, Number.MAX_SAFE_INTEGER],
    )
);

const deleteRowsInsideTransaction = async (
    store: IDBObjectStore,
    workspaceId: string,
): Promise<void> => new Promise((resolve, reject) => {
    const request = store.index('workspace_order').openCursor(workspaceOrderRange(workspaceId));
    request.onerror = () => reject(request.error ?? new Error('无法清理旧校对草稿。'));
    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
            resolve();
            return;
        }
        cursor.delete();
        cursor.continue();
    };
});

const getManifestInsideTransaction = async (
    transaction: IDBTransaction,
    workspaceId: string,
): Promise<HistoryReviewWorkspaceManifest | null> => {
    const value = await requestAsPromise(
        transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).get(workspaceId),
    );
    return value === undefined ? null : value as HistoryReviewWorkspaceManifest;
};

const assertReviewing = (manifest: HistoryReviewWorkspaceManifest | null): HistoryReviewWorkspaceManifest => {
    if (!manifest) throw new Error('找不到这份本机校对草稿。');
    if (manifest.status !== 'reviewing') throw new Error('这份校对已经完成，如需修改请先返回校对。');
    return manifest;
};

export const createHistoryReviewWorkspaceFromSource = async (input: {
    source: Omit<HistoryPreviewSourceInput, 'bindingDraft'>;
    bindingDraft: HistoryIdentityBindingDraft;
    now?: number;
    onProgress?: (progress: HistoryReviewWorkspaceCreateProgress) => void;
}): Promise<HistoryReviewWorkspaceManifest> => {
    const now = input.now ?? Date.now();
    input.onProgress?.({ phase: 'parsing', processedRows: 0 });
    const preview = await buildHistoryImportFullPreview({
        ...input.source,
        bindingDraft: input.bindingDraft,
    });
    let manifest = createHistoryReviewWorkspaceManifest({
        preview,
        bindingDraft: input.bindingDraft,
        now,
    });
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const existingTransaction = database.transaction(
            HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
            'readonly',
        );
        const existing = await getManifestInsideTransaction(existingTransaction, manifest.id);
        if (
            existing
            && (existing.status === 'reviewing' || existing.status === 'review_complete')
            && existing.persistedRowCount === existing.totalRowCount
            && existing.previewFingerprint === manifest.previewFingerprint
        ) {
            input.onProgress?.({
                phase: 'ready',
                processedRows: existing.totalRowCount,
                totalRows: existing.totalRowCount,
            });
            return existing;
        }

        const reset = database.transaction([
            HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
            HISTORY_REVIEW_WORKSPACE_STORES.rows,
        ], 'readwrite', { durability: 'strict' });
        const resetDone = transactionAsPromise(reset);
        await deleteRowsInsideTransaction(
            reset.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.rows),
            manifest.id,
        );
        await requestAsPromise(
            reset.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(manifest),
        );
        await resetDone;

        input.onProgress?.({
            phase: 'saving',
            processedRows: 0,
            totalRows: preview.rows.length,
        });
        for (let offset = 0; offset < preview.rows.length; offset += HISTORY_REVIEW_WORKSPACE_WRITE_CHUNK) {
            const sourceChunk = preview.rows.slice(offset, offset + HISTORY_REVIEW_WORKSPACE_WRITE_CHUNK);
            const transaction = database.transaction([
                HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
                HISTORY_REVIEW_WORKSPACE_STORES.rows,
            ], 'readwrite', { durability: 'strict' });
            const done = transactionAsPromise(transaction);
            const rows = transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.rows);
            for (const source of sourceChunk) {
                await requestAsPromise(rows.put(createHistoryReviewWorkspaceRow({
                    workspaceId: manifest.id,
                    source,
                    now,
                })));
            }
            manifest = {
                ...manifest,
                persistedRowCount: offset + sourceChunk.length,
                updatedAt: now,
                revision: manifest.revision + 1,
            };
            await requestAsPromise(
                transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(manifest),
            );
            await done;
            input.onProgress?.({
                phase: 'saving',
                processedRows: manifest.persistedRowCount,
                totalRows: manifest.totalRowCount,
            });
        }

        const finish = database.transaction(
            HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
            'readwrite',
            { durability: 'strict' },
        );
        const finishDone = transactionAsPromise(finish);
        manifest = {
            ...manifest,
            status: 'reviewing',
            updatedAt: now,
            revision: manifest.revision + 1,
        };
        await requestAsPromise(
            finish.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(manifest),
        );
        await finishDone;
        input.onProgress?.({
            phase: 'ready',
            processedRows: manifest.totalRowCount,
            totalRows: manifest.totalRowCount,
        });
        return manifest;
    } finally {
        database.close();
    }
};

export const getHistoryReviewWorkspace = async (
    workspaceId: string,
): Promise<HistoryReviewWorkspaceManifest | null> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_REVIEW_WORKSPACE_STORES.workspaces, 'readonly');
        return getManifestInsideTransaction(transaction, workspaceId);
    } finally {
        database.close();
    }
};

export const getLatestHistoryReviewWorkspace = async (): Promise<HistoryReviewWorkspaceManifest | null> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_REVIEW_WORKSPACE_STORES.workspaces, 'readonly');
        const index = transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).index('updated_at');
        return await new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            request.onerror = () => reject(request.error ?? new Error('无法读取最近的校对草稿。'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(null);
                    return;
                }
                const manifest = cursor.value as HistoryReviewWorkspaceManifest;
                if (
                    (manifest.status === 'reviewing' || manifest.status === 'review_complete')
                    && manifest.persistedRowCount === manifest.totalRowCount
                ) {
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

export const pageHistoryReviewWorkspaceRows = async (input: {
    workspaceId: string;
    filter: HistoryReviewWorkspaceFilter;
    cursor?: number;
    limit: number;
}): Promise<HistoryReviewWorkspacePage> => {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > HISTORY_REVIEW_WORKSPACE_PAGE_LIMIT) {
        throw new Error(`校对分页必须在 1-${HISTORY_REVIEW_WORKSPACE_PAGE_LIMIT} 条之间。`);
    }
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_REVIEW_WORKSPACE_STORES.rows, 'readonly');
        const rows = transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.rows);
        const index = input.filter === 'all'
            ? rows.index('workspace_order')
            : input.filter === 'pending'
                ? rows.index('workspace_attention_order')
                : rows.index('workspace_bucket_order');
        const range = input.filter === 'all'
            ? workspaceOrderRange(input.workspaceId, input.cursor)
            : input.filter === 'pending'
                ? workspaceAttentionRange(input.workspaceId, input.cursor)
                : workspaceBucketRange(input.workspaceId, input.filter, input.cursor);
        const items = await new Promise<HistoryReviewWorkspaceRowRecord[]>((resolve, reject) => {
            const collected: HistoryReviewWorkspaceRowRecord[] = [];
            const request = index.openCursor(range, 'next');
            request.onerror = () => reject(request.error ?? new Error('校对分页读取失败。'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || collected.length >= input.limit + 1) {
                    resolve(collected);
                    return;
                }
                collected.push(cursor.value as HistoryReviewWorkspaceRowRecord);
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

export const getHistoryReviewWorkspaceAssessment = async (
    workspaceId: string,
): Promise<HistoryReviewWorkspaceAssessment> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
            HISTORY_REVIEW_WORKSPACE_STORES.rows,
        ], 'readonly');
        const manifest = await getManifestInsideTransaction(transaction, workspaceId);
        if (!manifest) throw new Error('找不到这份本机校对草稿。');
        const rows = transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.rows);
        const [attentionRows, includedRows, excludedRows] = await Promise.all([
            requestAsPromise(rows.index('workspace_attention_order').count(workspaceAttentionRange(workspaceId))),
            requestAsPromise(rows.index('workspace_bucket_order').count(workspaceBucketRange(workspaceId, 'included'))),
            requestAsPromise(rows.index('workspace_bucket_order').count(workspaceBucketRange(workspaceId, 'excluded'))),
        ]);
        return assessHistoryReviewWorkspace({ manifest, attentionRows, includedRows, excludedRows });
    } finally {
        database.close();
    }
};

export const updateHistoryReviewWorkspaceSettings = async (input: {
    workspaceId: string;
    patch: Partial<HistoryReviewWorkspaceSettings>;
    now?: number;
}): Promise<HistoryReviewWorkspaceManifest> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_REVIEW_WORKSPACE_STORES.workspaces, 'readwrite');
        const done = transactionAsPromise(transaction);
        const current = assertReviewing(await getManifestInsideTransaction(transaction, input.workspaceId));
        const now = input.now ?? Date.now();
        const next: HistoryReviewWorkspaceManifest = {
            ...current,
            settings: {
                ...current.settings,
                ...input.patch,
                speakerMappings: input.patch.speakerMappings
                    ? input.patch.speakerMappings.map(mapping => ({ ...mapping }))
                    : current.settings.speakerMappings.map(mapping => ({ ...mapping })),
            },
            decision: undefined,
            updatedAt: now,
            revision: current.revision + 1,
        };
        await requestAsPromise(
            transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(next),
        );
        await done;
        return next;
    } finally {
        database.close();
    }
};

export const patchHistoryReviewWorkspaceRow = async (input: {
    workspaceId: string;
    rowRecordId: string;
    patch: Partial<HistoryPreviewRowReviewDraft>;
    now?: number;
}): Promise<HistoryReviewWorkspaceRowRecord> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
            HISTORY_REVIEW_WORKSPACE_STORES.rows,
        ], 'readwrite', { durability: 'strict' });
        const done = transactionAsPromise(transaction);
        const currentManifest = assertReviewing(
            await getManifestInsideTransaction(transaction, input.workspaceId),
        );
        const rows = transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.rows);
        const value = await requestAsPromise(rows.get(input.rowRecordId));
        if (value === undefined) throw new Error('找不到这条待校对记录。');
        const current = value as HistoryReviewWorkspaceRowRecord;
        if (current.workspaceId !== input.workspaceId) throw new Error('校对记录属于另一个工作台。');
        const now = input.now ?? Date.now();
        const next = patchHistoryReviewWorkspaceRowRecord(current, input.patch, now);
        const nextManifest: HistoryReviewWorkspaceManifest = {
            ...currentManifest,
            updatedAt: now,
            revision: currentManifest.revision + 1,
        };
        await Promise.all([
            requestAsPromise(rows.put(next)),
            requestAsPromise(
                transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(nextManifest),
            ),
        ]);
        await done;
        return next;
    } finally {
        database.close();
    }
};

export const iterateHistoryReviewWorkspaceRows = async function* (
    workspaceId: string,
): AsyncGenerator<HistoryReviewWorkspaceRowRecord> {
    let cursor: number | undefined;
    do {
        const page = await pageHistoryReviewWorkspaceRows({
            workspaceId,
            filter: 'all',
            cursor,
            limit: HISTORY_REVIEW_WORKSPACE_PAGE_LIMIT,
        });
        for (const record of page.items) yield record;
        cursor = page.nextCursor;
        if (!page.hasMore) break;
    } while (cursor !== undefined);
};

export const completeHistoryReviewWorkspace = async (
    workspaceId: string,
): Promise<HistoryReviewWorkspaceManifest> => {
    const manifest = await getHistoryReviewWorkspace(workspaceId);
    if (!manifest) throw new Error('找不到这份本机校对草稿。');
    const assessment = await getHistoryReviewWorkspaceAssessment(workspaceId);
    if (!assessment.canComplete) throw new Error('还有未确认的说话人、内容或时间解释。');
    const expectedRevision = manifest.revision;
    const decision = await freezeHistoryReviewWorkspaceDecision({
        manifest,
        records: iterateHistoryReviewWorkspaceRows(workspaceId),
    });

    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_REVIEW_WORKSPACE_STORES.workspaces, 'readwrite');
        const done = transactionAsPromise(transaction);
        const current = assertReviewing(await getManifestInsideTransaction(transaction, workspaceId));
        if (current.revision !== expectedRevision) {
            throw new Error('校对内容刚刚发生了变化，请重新确认后再完成。');
        }
        const now = Date.now();
        const next: HistoryReviewWorkspaceManifest = {
            ...current,
            status: 'review_complete',
            decision,
            updatedAt: now,
            revision: current.revision + 1,
        };
        await requestAsPromise(
            transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(next),
        );
        await done;
        return next;
    } finally {
        database.close();
    }
};

export const reopenHistoryReviewWorkspace = async (
    workspaceId: string,
): Promise<HistoryReviewWorkspaceManifest> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction(HISTORY_REVIEW_WORKSPACE_STORES.workspaces, 'readwrite');
        const done = transactionAsPromise(transaction);
        const current = await getManifestInsideTransaction(transaction, workspaceId);
        if (!current) throw new Error('找不到这份本机校对草稿。');
        const now = Date.now();
        const next: HistoryReviewWorkspaceManifest = {
            ...current,
            status: 'reviewing',
            decision: undefined,
            updatedAt: now,
            revision: current.revision + 1,
        };
        await requestAsPromise(
            transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).put(next),
        );
        await done;
        return next;
    } finally {
        database.close();
    }
};

export const deleteHistoryReviewWorkspace = async (workspaceId: string): Promise<void> => {
    const database = await openHistoryReviewWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
            HISTORY_REVIEW_WORKSPACE_STORES.rows,
        ], 'readwrite', { durability: 'strict' });
        const done = transactionAsPromise(transaction);
        await deleteRowsInsideTransaction(
            transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.rows),
            workspaceId,
        );
        await requestAsPromise(
            transaction.objectStore(HISTORY_REVIEW_WORKSPACE_STORES.workspaces).delete(workspaceId),
        );
        await done;
    } finally {
        database.close();
    }
};

export const deleteHistoryReviewWorkspaceDatabase = async (): Promise<void> => {
    const request = getIndexedDb().deleteDatabase(HISTORY_REVIEW_WORKSPACE_DB_NAME);
    await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('无法删除本机导入工作台。'));
        request.onblocked = () => reject(new Error('本机导入工作台仍被页面占用。'));
    });
};

export const HISTORY_REVIEW_WORKSPACE_STORE_LIST: readonly WorkspaceStoreName[] = Object.freeze([
    HISTORY_REVIEW_WORKSPACE_STORES.workspaces,
    HISTORY_REVIEW_WORKSPACE_STORES.rows,
]);

export type { FrozenHistoryReviewWorkspaceDecision };
