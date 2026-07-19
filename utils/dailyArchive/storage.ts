import {
    DAILY_ARCHIVE_SCHEMA_VERSION,
    buildDailyArchiveDocument,
    buildDailyArchiveChunk,
    buildDailyArchiveManifest,
    buildDailyArchiveManifestFromDescriptors,
    chunkDailyArchiveDocument,
    createDailyArchiveDocumentId,
    DAILY_ARCHIVE_KEYWORD_RESULT_LIMIT,
    DAILY_ARCHIVE_PAGE_MESSAGE_LIMIT,
    dailyArchiveDescriptorForChunk,
    hydrateDailyArchiveDocument,
    isDailyArchiveDateKey,
    normalizeDailyArchiveKeyword,
    readDailyArchivePageFromChunks,
    searchDailyArchiveChunk,
    selectDailyArchiveChunksForPage,
    sortDailyArchiveMessages,
    validateConversationClipping,
    type ConversationClipping,
    type DailyArchiveBackupManifest,
    type DailyArchiveChunk,
    type DailyArchiveCoverage,
    type DailyArchiveDocument,
    type DailyArchiveDocumentSummary,
    type DailyArchiveManifest,
    type DailyArchiveMessage,
    type DailyArchiveMessagePage,
    type DailyArchiveMonthSummary,
    type DailyArchiveSearchHit,
    type DailyArchiveSearchResponse,
} from '../../domain/dailyArchive/index.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';

export const DAILY_ARCHIVE_DB_NAME = 'AetherOS_DailyArchive:v2';
export const DAILY_ARCHIVE_DB_VERSION = 1;
export const DAILY_ARCHIVE_SUMMARY_STORE = 'daily_archive_summaries';
export const DAILY_ARCHIVE_META_STORE = 'daily_archive_meta';
export const CONVERSATION_CLIPPING_STORE = 'conversation_clippings';
export const DAILY_ARCHIVE_MANIFEST_STORE = 'daily_archive_manifests';
export const DAILY_ARCHIVE_CHUNK_STORE = 'daily_archive_chunks';
export const DAILY_ARCHIVE_MESSAGE_INDEX_STORE = 'daily_archive_message_index';

export type DailyArchiveCurationOperation =
    | { kind: 'edit_content'; content: string }
    | { kind: 'set_role'; role: 'user' | 'character' | 'unknown' }
    | { kind: 'set_date'; dateKey: string }
    | { kind: 'merge' }
    | { kind: 'delete' }
    | { kind: 'set_confirmation'; confirmed: boolean };

export interface DailyArchiveCurationResult {
    affectedDocumentIds: string[];
    activeMessageIds: string[];
}

interface DailyArchiveMessageIndexEntry {
    id: string;
    messageId: string;
    documentId: string;
    chunkId: string;
    revision: number;
}

const dailyArchiveMessageIndexId = (documentId: string, messageId: string): string => (
    `${documentId}:message:${messageId}`
);

const getFactory = (factory?: IDBFactory): IDBFactory => {
    const resolved = factory ?? globalThis.indexedDB;
    if (!resolved) throw new Error('当前环境无法打开本地日档库。');
    return resolved;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地日档读写失败。'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('本地日档事务失败。'));
    transaction.onabort = () => reject(transaction.error ?? new DOMException('日档事务已中止', 'AbortError'));
});

export const openDailyArchiveDatabase = async (factory?: IDBFactory): Promise<IDBDatabase> => {
    const request = getFactory(factory).open(DAILY_ARCHIVE_DB_NAME, DAILY_ARCHIVE_DB_VERSION);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DAILY_ARCHIVE_META_STORE)) {
            database.createObjectStore(DAILY_ARCHIVE_META_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(DAILY_ARCHIVE_SUMMARY_STORE)) {
            const summaryStore = database.createObjectStore(DAILY_ARCHIVE_SUMMARY_STORE, { keyPath: 'id' });
            summaryStore.createIndex('scope', [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
            ], { unique: false });
            summaryStore.createIndex('scope_month', [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
                'monthKey',
            ], { unique: false });
        }
        if (!database.objectStoreNames.contains(CONVERSATION_CLIPPING_STORE)) {
            const clippingStore = database.createObjectStore(CONVERSATION_CLIPPING_STORE, { keyPath: 'id' });
            clippingStore.createIndex('scope', [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
            ], { unique: false });
            clippingStore.createIndex('scope_updated', [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
                'updatedAt',
            ], { unique: false });
        }
        if (!database.objectStoreNames.contains(DAILY_ARCHIVE_MANIFEST_STORE)) {
            const manifestStore = database.createObjectStore(DAILY_ARCHIVE_MANIFEST_STORE, { keyPath: 'id' });
            manifestStore.createIndex('scope', [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
            ], { unique: false });
            manifestStore.createIndex('scope_month', [
                'scope.progressBundleId',
                'scope.personaMaskId',
                'scope.charId',
                'monthKey',
            ], { unique: false });
        }
        if (!database.objectStoreNames.contains(DAILY_ARCHIVE_CHUNK_STORE)) {
            const chunkStore = database.createObjectStore(DAILY_ARCHIVE_CHUNK_STORE, { keyPath: 'id' });
            chunkStore.createIndex('document_id', 'documentId', { unique: false });
        }
        if (!database.objectStoreNames.contains(DAILY_ARCHIVE_MESSAGE_INDEX_STORE)) {
            const messageIndexStore = database.createObjectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE, { keyPath: 'id' });
            messageIndexStore.createIndex('document_id', 'documentId', { unique: false });
        }
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('无法打开本地日档库。'));
        request.onblocked = () => reject(new Error('本地日档库正在被另一个页面占用，请关闭其他页面后重试。'));
    });
    database.onversionchange = () => database.close();
    return database;
};

export const deleteDailyArchiveDatabase = async (factory?: IDBFactory): Promise<void> => {
    const request = getFactory(factory).deleteDatabase(DAILY_ARCHIVE_DB_NAME);
    await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('无法清除本地日档库。'));
        request.onblocked = () => reject(new Error('本地日档库正在被另一个页面占用。'));
    });
};

const summaryForManifest = (manifest: DailyArchiveManifest): DailyArchiveDocumentSummary => ({
    id: manifest.id,
    scope: { ...manifest.scope },
    dateKey: manifest.dateKey,
    monthKey: manifest.monthKey,
    undatedKey: manifest.undatedKey,
    messageCount: manifest.messageCount,
    sourceKinds: [...manifest.sourceKinds],
    firstTimestamp: manifest.firstTimestamp,
    lastTimestamp: manifest.lastTimestamp,
    updatedAt: manifest.updatedAt,
});

export const hasDailyArchiveSyncReceipt = async (input: {
    id: string;
    factory?: IDBFactory;
}): Promise<boolean> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(DAILY_ARCHIVE_META_STORE, 'readonly');
        const value = await requestAsPromise(
            transaction.objectStore(DAILY_ARCHIVE_META_STORE).get(input.id),
        );
        return value !== undefined;
    } finally {
        database.close();
    }
};

export const saveDailyArchiveSyncReceipt = async (input: {
    id: string;
    archiveDatabaseId: string;
    scope: HistoryScope;
    messageCount: number;
    completedAt?: number;
    factory?: IDBFactory;
}): Promise<void> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(DAILY_ARCHIVE_META_STORE, 'readwrite');
        const settled = transactionAsPromise(transaction);
        transaction.objectStore(DAILY_ARCHIVE_META_STORE).put({
            id: input.id,
            kind: 'history_archive_sync',
            archiveDatabaseId: input.archiveDatabaseId,
            scope: input.scope,
            messageCount: input.messageCount,
            completedAt: input.completedAt ?? Date.now(),
        });
        await settled;
    } finally {
        database.close();
    }
};

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
    left.progressBundleId === right.progressBundleId
    && left.personaMaskId === right.personaMaskId
    && left.charId === right.charId
);

const scopeKey = (scope: HistoryScope): [string, string, string] => [
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
];

const groupMessages = (messages: DailyArchiveMessage[]): Array<{
    id: string;
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
    messages: DailyArchiveMessage[];
}> => {
    const groups = new Map<string, {
        id: string;
        scope: HistoryScope;
        dateKey?: string;
        undatedKey?: string;
        messages: DailyArchiveMessage[];
    }>();
    messages.forEach(message => {
        const dateKey = message.time.dateKey;
        const undatedKey = dateKey ? undefined : message.sourceBatchId || message.source;
        const id = createDailyArchiveDocumentId({ scope: message.scope, dateKey, undatedKey });
        const current = groups.get(id);
        if (current) {
            current.messages.push(message);
        } else {
            groups.set(id, {
                id,
                scope: { ...message.scope },
                dateKey,
                undatedKey,
                messages: [message],
            });
        }
    });
    return Array.from(groups.values());
};

const readStoredManifest = async (
    database: IDBDatabase,
    documentId: string,
): Promise<DailyArchiveManifest | undefined> => {
    const transaction = database.transaction(DAILY_ARCHIVE_MANIFEST_STORE, 'readonly');
    return await requestAsPromise(
        transaction.objectStore(DAILY_ARCHIVE_MANIFEST_STORE).get(documentId),
    ) as DailyArchiveManifest | undefined;
};

const loadManifestChunks = async (
    database: IDBDatabase,
    manifest: DailyArchiveManifest,
): Promise<DailyArchiveChunk[]> => {
    if (manifest.chunks.length === 0) return [];
    const transaction = database.transaction(DAILY_ARCHIVE_CHUNK_STORE, 'readonly');
    const store = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const chunks = await Promise.all(manifest.chunks.map(descriptor => (
        requestAsPromise(store.get(descriptor.id)) as Promise<DailyArchiveChunk | undefined>
    )));
    if (chunks.some(chunk => !chunk)) throw new Error('日档正文分块不完整，请从备份恢复或重新建立日档。');
    return chunks as DailyArchiveChunk[];
};

const persistChunkedDocument = async (input: {
    database: IDBDatabase;
    document: DailyArchiveDocument;
}): Promise<DailyArchiveManifest> => {
    const { manifest, chunks } = chunkDailyArchiveDocument(input.document);
    const lookupTransaction = input.database.transaction([
        DAILY_ARCHIVE_CHUNK_STORE,
        DAILY_ARCHIVE_MESSAGE_INDEX_STORE,
    ], 'readonly');
    const [oldChunkKeys, oldMessageKeys] = await Promise.all([
        requestAsPromise(
            lookupTransaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE)
                .index('document_id').getAllKeys(IDBKeyRange.only(input.document.id)),
        ),
        requestAsPromise(
            lookupTransaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE)
                .index('document_id').getAllKeys(IDBKeyRange.only(input.document.id)),
        ),
    ]);
    const transaction = input.database.transaction([
        DAILY_ARCHIVE_MANIFEST_STORE,
        DAILY_ARCHIVE_CHUNK_STORE,
        DAILY_ARCHIVE_MESSAGE_INDEX_STORE,
        DAILY_ARCHIVE_SUMMARY_STORE,
    ], 'readwrite');
    const settled = transactionAsPromise(transaction);
    const manifestStore = transaction.objectStore(DAILY_ARCHIVE_MANIFEST_STORE);
    const chunkStore = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const messageIndexStore = transaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE);
    const summaryStore = transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE);
    oldChunkKeys.forEach(key => chunkStore.delete(key));
    oldMessageKeys.forEach(key => messageIndexStore.delete(key));
    chunks.forEach(chunk => {
        chunkStore.put(chunk);
        chunk.messages.forEach(message => messageIndexStore.put({
            id: dailyArchiveMessageIndexId(input.document.id, message.id),
            messageId: message.id,
            documentId: input.document.id,
            chunkId: chunk.id,
            revision: message.revision,
        } satisfies DailyArchiveMessageIndexEntry));
    });
    manifestStore.put(manifest);
    summaryStore.put(summaryForManifest(manifest));
    await settled;
    return manifest;
};

const persistChunkedDocuments = async (input: {
    database: IDBDatabase;
    documents: DailyArchiveDocument[];
}): Promise<void> => {
    const chunked = input.documents.map(document => ({
        document,
        ...chunkDailyArchiveDocument(document),
    }));
    const staleKeys = await Promise.all(chunked.map(async ({ document }) => {
        const transaction = input.database.transaction([
            DAILY_ARCHIVE_CHUNK_STORE,
            DAILY_ARCHIVE_MESSAGE_INDEX_STORE,
        ], 'readonly');
        const [chunkKeys, messageKeys] = await Promise.all([
            requestAsPromise(
                transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE)
                    .index('document_id').getAllKeys(IDBKeyRange.only(document.id)),
            ),
            requestAsPromise(
                transaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE)
                    .index('document_id').getAllKeys(IDBKeyRange.only(document.id)),
            ),
        ]);
        return { chunkKeys, messageKeys };
    }));
    const transaction = input.database.transaction([
        DAILY_ARCHIVE_MANIFEST_STORE,
        DAILY_ARCHIVE_CHUNK_STORE,
        DAILY_ARCHIVE_MESSAGE_INDEX_STORE,
        DAILY_ARCHIVE_SUMMARY_STORE,
    ], 'readwrite');
    const settled = transactionAsPromise(transaction);
    const manifestStore = transaction.objectStore(DAILY_ARCHIVE_MANIFEST_STORE);
    const chunkStore = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const messageIndexStore = transaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE);
    const summaryStore = transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE);
    staleKeys.forEach(({ chunkKeys, messageKeys }) => {
        chunkKeys.forEach(key => chunkStore.delete(key));
        messageKeys.forEach(key => messageIndexStore.delete(key));
    });
    chunked.forEach(({ manifest, chunks }) => {
        manifestStore.put(manifest);
        summaryStore.put(summaryForManifest(manifest));
        chunks.forEach(chunk => {
            chunkStore.put(chunk);
            chunk.messages.forEach(message => messageIndexStore.put({
                id: dailyArchiveMessageIndexId(manifest.id, message.id),
                messageId: message.id,
                documentId: manifest.id,
                chunkId: chunk.id,
                revision: message.revision,
            } satisfies DailyArchiveMessageIndexEntry));
        });
    });
    await settled;
};

const ensureChunkedManifest = async (
    database: IDBDatabase,
    documentId: string,
): Promise<DailyArchiveManifest | null> => {
    return (await readStoredManifest(database, documentId)) || null;
};

const hydrateStoredManifest = async (
    database: IDBDatabase,
    manifest: DailyArchiveManifest,
): Promise<DailyArchiveDocument> => hydrateDailyArchiveDocument({
    manifest,
    chunks: await loadManifestChunks(database, manifest),
});

const messageOrderFingerprint = (message: DailyArchiveMessage): string => JSON.stringify([
    message.time.epochMs ?? null,
    message.time.iso ?? null,
    message.sourceOrder ?? null,
    message.id,
]);

const compareDailyArchiveMessage = (
    left: DailyArchiveMessage,
    right: DailyArchiveMessage,
): number => {
    if (left.id === right.id) return 0;
    return sortDailyArchiveMessages([left, right])[0]?.id === left.id ? -1 : 1;
};

const dedupeIncomingMessages = (messages: DailyArchiveMessage[]): DailyArchiveMessage[] => {
    const byId = new Map<string, DailyArchiveMessage>();
    messages.forEach(message => {
        const current = byId.get(message.id);
        if (!current || message.revision >= current.revision) byId.set(message.id, message);
    });
    return sortDailyArchiveMessages(Array.from(byId.values()));
};

const persistIncrementalChunks = async (input: {
    database: IDBDatabase;
    manifest: DailyArchiveManifest;
    chunks: DailyArchiveChunk[];
}): Promise<void> => {
    const transaction = input.database.transaction([
        DAILY_ARCHIVE_MANIFEST_STORE,
        DAILY_ARCHIVE_CHUNK_STORE,
        DAILY_ARCHIVE_MESSAGE_INDEX_STORE,
        DAILY_ARCHIVE_SUMMARY_STORE,
    ], 'readwrite');
    const settled = transactionAsPromise(transaction);
    const chunkStore = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const messageIndexStore = transaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE);
    input.chunks.forEach(chunk => {
        chunkStore.put(chunk);
        chunk.messages.forEach(message => messageIndexStore.put({
            id: dailyArchiveMessageIndexId(input.manifest.id, message.id),
            messageId: message.id,
            documentId: input.manifest.id,
            chunkId: chunk.id,
            revision: message.revision,
        } satisfies DailyArchiveMessageIndexEntry));
    });
    transaction.objectStore(DAILY_ARCHIVE_MANIFEST_STORE).put(input.manifest);
    transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE).put(summaryForManifest(input.manifest));
    await settled;
};

const upsertMessageGroup = async (input: {
    database: IDBDatabase;
    group: ReturnType<typeof groupMessages>[number];
    now: number;
}): Promise<void> => {
    const messages = dedupeIncomingMessages(input.group.messages);
    let manifest = await ensureChunkedManifest(input.database, input.group.id);
    if (!manifest) {
        const document = buildDailyArchiveDocument({
            scope: input.group.scope,
            dateKey: input.group.dateKey,
            undatedKey: input.group.undatedKey,
            messages,
            now: input.now,
        });
        await persistChunkedDocument({ database: input.database, document });
        return;
    }
    if (!sameScope(manifest.scope, input.group.scope)) throw new Error('日档稳定编号发生范围冲突。');

    const indexTransaction = input.database.transaction(DAILY_ARCHIVE_MESSAGE_INDEX_STORE, 'readonly');
    const indexStore = indexTransaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE);
    const entries = await Promise.all(messages.map(message => (
        requestAsPromise(indexStore.get(
            dailyArchiveMessageIndexId(manifest!.id, message.id),
        )) as Promise<DailyArchiveMessageIndexEntry | undefined>
    )));
    const chunkIds = new Set(entries.flatMap(entry => entry ? [entry.chunkId] : []));
    const tailDescriptor = manifest.chunks[manifest.chunks.length - 1];
    if (tailDescriptor) chunkIds.add(tailDescriptor.id);
    const chunkTransaction = input.database.transaction(DAILY_ARCHIVE_CHUNK_STORE, 'readonly');
    const chunkStore = chunkTransaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const loadedChunks = await Promise.all(Array.from(chunkIds, id => (
        requestAsPromise(chunkStore.get(id)) as Promise<DailyArchiveChunk | undefined>
    )));
    if (loadedChunks.some(chunk => !chunk)) throw new Error('日档增量写入时缺少正文分块。');
    const chunkById = new Map((loadedChunks as DailyArchiveChunk[]).map(chunk => [chunk.id, chunk]));
    const newMessages: DailyArchiveMessage[] = [];
    let requiresRebuild = false;

    messages.forEach((message, index) => {
        const entry = entries[index];
        if (!entry) {
            newMessages.push(message);
            return;
        }
        if (entry.documentId !== manifest!.id) throw new Error('日档消息编号落入了其他关系范围。');
        const chunk = chunkById.get(entry.chunkId);
        const previous = chunk?.messages.find(item => item.id === message.id);
        if (!chunk || !previous) {
            requiresRebuild = true;
            return;
        }
        if (message.revision < previous.revision) return;
        if (messageOrderFingerprint(message) !== messageOrderFingerprint(previous)) {
            requiresRebuild = true;
            return;
        }
        const nextMessages = chunk.messages.map(item => item.id === message.id ? message : item);
        chunkById.set(chunk.id, buildDailyArchiveChunk({
            documentId: manifest!.id,
            chunkIndex: chunk.chunkIndex,
            messages: nextMessages,
        }));
    });

    const sortedNewMessages = sortDailyArchiveMessages(newMessages);
    const tailChunk = tailDescriptor ? chunkById.get(tailDescriptor.id) : undefined;
    const lastStoredMessage = tailChunk?.messages[tailChunk.messages.length - 1];
    if (
        !requiresRebuild
        && lastStoredMessage
        && sortedNewMessages[0]
        && compareDailyArchiveMessage(sortedNewMessages[0], lastStoredMessage) < 0
    ) requiresRebuild = true;

    if (requiresRebuild) {
        const previous = await hydrateStoredManifest(input.database, manifest);
        const document = buildDailyArchiveDocument({
            scope: input.group.scope,
            dateKey: input.group.dateKey,
            undatedKey: input.group.undatedKey,
            messages,
            previous,
            now: input.now,
        });
        await persistChunkedDocument({ database: input.database, document });
        return;
    }

    let appendCursor = 0;
    let workingTail = tailChunk;
    if (workingTail && sortedNewMessages.length > 0) {
        const capacity = Math.max(0, manifest.chunkSize - workingTail.messages.length);
        const additions = sortedNewMessages.slice(0, capacity);
        appendCursor += additions.length;
        if (additions.length > 0) {
            workingTail = buildDailyArchiveChunk({
                documentId: manifest.id,
                chunkIndex: workingTail.chunkIndex,
                messages: [...workingTail.messages, ...additions],
            });
            chunkById.set(workingTail.id, workingTail);
        }
    }
    let nextChunkIndex = manifest.chunkCount;
    while (appendCursor < sortedNewMessages.length) {
        const chunk = buildDailyArchiveChunk({
            documentId: manifest.id,
            chunkIndex: nextChunkIndex,
            messages: sortedNewMessages.slice(appendCursor, appendCursor + manifest.chunkSize),
        });
        chunkById.set(chunk.id, chunk);
        appendCursor += chunk.messages.length;
        nextChunkIndex += 1;
    }

    const descriptorById = new Map(manifest.chunks.map(descriptor => [descriptor.id, descriptor]));
    chunkById.forEach(chunk => descriptorById.set(chunk.id, dailyArchiveDescriptorForChunk(chunk)));
    const descriptors = Array.from(descriptorById.values()).sort((left, right) => left.chunkIndex - right.chunkIndex);
    manifest = buildDailyArchiveManifestFromDescriptors({
        document: {
            schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
            id: manifest.id,
            scope: manifest.scope,
            dateKey: manifest.dateKey,
            monthKey: manifest.monthKey,
            undatedKey: manifest.undatedKey,
            messageCount: manifest.messageCount,
            sourceKinds: manifest.sourceKinds,
            firstTimestamp: manifest.firstTimestamp,
            lastTimestamp: manifest.lastTimestamp,
            createdAt: manifest.createdAt,
            updatedAt: input.now,
            revision: manifest.revision + 1,
        },
        descriptors,
        chunkSize: manifest.chunkSize,
    });
    await persistIncrementalChunks({
        database: input.database,
        manifest,
        chunks: Array.from(chunkById.values()),
    });
};

export const upsertDailyArchiveMessages = async (input: {
    messages: DailyArchiveMessage[];
    now?: number;
    factory?: IDBFactory;
}): Promise<{ documentCount: number; messageCount: number }> => {
    if (input.messages.length === 0) return { documentCount: 0, messageCount: 0 };
    const groups = groupMessages(input.messages);
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        for (const group of groups) {
            await upsertMessageGroup({
                database,
                group,
                now: input.now ?? Date.now(),
            });
        }
        return { documentCount: groups.length, messageCount: input.messages.length };
    } finally {
        database.close();
    }
};

const archiveBucketForMessage = (message: DailyArchiveMessage): {
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
} => ({
    scope: message.scope,
    dateKey: message.time.dateKey,
    undatedKey: message.time.dateKey ? undefined : message.sourceBatchId || message.source,
});

const curatedSourceIds = (message: DailyArchiveMessage): string[] => (
    message.curation?.sourceMessageIds?.length
        ? [...message.curation.sourceMessageIds]
        : [message.id]
);

const correctedCuration = (
    message: DailyArchiveMessage,
    now: number,
    confirmed?: boolean,
) => ({
    sourceMessageIds: curatedSourceIds(message),
    correctedAt: now,
    confirmedAt: confirmed ? now : undefined,
    authority: confirmed ? 'human_confirmed' as const : 'human_corrected' as const,
});

const isConfirmedArchiveMessage = (message: DailyArchiveMessage): boolean => (
    message.curation?.authority === 'human_confirmed'
);

const timeMovedToDate = (
    message: DailyArchiveMessage,
    dateKey: string,
): DailyArchiveMessage['time'] => {
    const clock = message.time.originalText?.match(/(\d{1,2}:\d{2}(?::\d{2})?)/u)?.[1];
    const sourceDate = Number.isFinite(message.time.epochMs)
        ? new Date(message.time.epochMs!)
        : undefined;
    const [year, month, day] = dateKey.split('-').map(Number);
    const hour = sourceDate?.getHours() ?? 12;
    const minute = sourceDate?.getMinutes() ?? 0;
    const second = sourceDate?.getSeconds() ?? 0;
    const moved = new Date(year, month - 1, day, hour, minute, second);
    return {
        ...message.time,
        dateKey,
        originalText: clock ? `${dateKey} ${clock}` : dateKey,
        iso: Number.isNaN(moved.getTime()) ? undefined : moved.toISOString(),
        epochMs: Number.isNaN(moved.getTime()) ? undefined : moved.getTime(),
        precision: clock ? message.time.precision : 'day',
    };
};

/**
 * Applies post-import human corrections to the durable daily archive.
 * Source rows stay recoverable through sourceRecordId/sourceMessageIds; moved
 * rows leave a higher-revision tombstone in their old date bucket so a later
 * raw-history sync cannot silently revive the old projection.
 */
export const curateDailyArchiveMessages = async (input: {
    scope: HistoryScope;
    messages: DailyArchiveMessage[];
    operation: DailyArchiveCurationOperation;
    now?: number;
    factory?: IDBFactory;
}): Promise<DailyArchiveCurationResult> => {
    if (input.messages.length === 0) throw new Error('先选中要整理的记录。');
    if (input.messages.length > DAILY_ARCHIVE_PAGE_MESSAGE_LIMIT) {
        throw new Error(`一次最多整理 ${DAILY_ARCHIVE_PAGE_MESSAGE_LIMIT} 条记录。`);
    }
    if (input.operation.kind === 'edit_content' && input.messages.length !== 1) {
        throw new Error('一次只能修改一条原文。');
    }
    if (input.operation.kind === 'edit_content' && !input.operation.content.trim()) {
        throw new Error('原文内容不能为空。');
    }
    if (input.operation.kind === 'set_date' && !isDailyArchiveDateKey(input.operation.dateKey)) {
        throw new Error('请选择一个有效日期。');
    }
    if (input.messages.some(message => !sameScope(message.scope, input.scope))) {
        throw new Error('一次整理不能跨越不同面具或角色。');
    }

    const now = input.now ?? Date.now();
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const documentById = new Map<string, DailyArchiveDocument>();
        const bucketById = new Map<string, ReturnType<typeof archiveBucketForMessage>>();
        const loadBucket = async (bucket: ReturnType<typeof archiveBucketForMessage>): Promise<DailyArchiveDocument | undefined> => {
            const id = createDailyArchiveDocumentId(bucket);
            bucketById.set(id, bucket);
            if (documentById.has(id)) return documentById.get(id);
            const manifest = await ensureChunkedManifest(database, id);
            const document = manifest ? await hydrateStoredManifest(database, manifest) : undefined;
            if (document) documentById.set(id, document);
            return document;
        };

        const currentMessages: DailyArchiveMessage[] = [];
        for (const snapshot of input.messages) {
            const bucket = archiveBucketForMessage(snapshot);
            const document = await loadBucket(bucket);
            const current = document?.messages.find(message => message.id === snapshot.id);
            if (!current || current.status !== 'active' || current.revision !== snapshot.revision) {
                throw new Error('这段日档刚刚发生了变化，请重新打开后再整理。');
            }
            currentMessages.push(current);
        }

        if (
            input.operation.kind !== 'set_confirmation'
            && currentMessages.some(isConfirmedArchiveMessage)
        ) {
            throw new Error('已确认的记录需要先取消确认，才能继续修改。');
        }

        const patches = new Map<string, DailyArchiveMessage[]>();
        const addPatch = (bucket: ReturnType<typeof archiveBucketForMessage>, message: DailyArchiveMessage) => {
            const id = createDailyArchiveDocumentId(bucket);
            bucketById.set(id, bucket);
            patches.set(id, [...(patches.get(id) || []), message]);
        };
        const reviseInPlace = (message: DailyArchiveMessage, patch: Partial<DailyArchiveMessage>) => {
            addPatch(archiveBucketForMessage(message), {
                ...message,
                ...patch,
                revision: message.revision + 1,
            });
        };

        if (input.operation.kind === 'merge') {
            const ordered = sortDailyArchiveMessages(currentMessages);
            const primary = ordered[0];
            const sourceMessageIds = Array.from(new Set(ordered.flatMap(curatedSourceIds)));
            const commonRole = ordered.every(message => message.role === primary.role) ? primary.role : 'unknown';
            reviseInPlace(primary, {
                role: commonRole,
                content: ordered.map(message => message.content.trim()).filter(Boolean).join('\n\n'),
                curation: {
                    sourceMessageIds,
                    correctedAt: now,
                    authority: 'human_corrected',
                },
            });
            ordered.slice(1).forEach(message => reviseInPlace(message, {
                status: 'tombstoned',
                curation: {
                    sourceMessageIds,
                    correctedAt: now,
                    authority: 'human_corrected',
                },
            }));
        } else {
            for (const message of currentMessages) {
                if (input.operation.kind === 'edit_content') {
                    reviseInPlace(message, {
                        content: input.operation.content.trim(),
                        curation: correctedCuration(message, now),
                    });
                } else if (input.operation.kind === 'set_role') {
                    reviseInPlace(message, {
                        role: input.operation.role,
                        curation: correctedCuration(message, now),
                    });
                } else if (input.operation.kind === 'delete') {
                    reviseInPlace(message, {
                        status: 'tombstoned',
                        curation: correctedCuration(message, now),
                    });
                } else if (input.operation.kind === 'set_confirmation') {
                    reviseInPlace(message, {
                        curation: correctedCuration(message, now, input.operation.confirmed),
                    });
                } else if (input.operation.kind === 'set_date') {
                    const sourceBucket = archiveBucketForMessage(message);
                    const targetTime = timeMovedToDate(message, input.operation.dateKey);
                    const targetBucket = { scope: message.scope, dateKey: input.operation.dateKey };
                    const targetDocument = await loadBucket(targetBucket);
                    const targetPrevious = targetDocument?.messages.find(item => item.id === message.id);
                    const nextRevision = Math.max(message.revision, targetPrevious?.revision ?? 0) + 1;
                    addPatch(sourceBucket, {
                        ...message,
                        status: 'tombstoned',
                        revision: nextRevision,
                        curation: correctedCuration(message, now),
                    });
                    addPatch(targetBucket, {
                        ...message,
                        time: targetTime,
                        status: 'active',
                        revision: nextRevision,
                        curation: correctedCuration(message, now),
                    });
                }
            }
        }

        const documents: DailyArchiveDocument[] = [];
        for (const [documentId, messages] of patches) {
            const bucket = bucketById.get(documentId)!;
            const previous = documentById.get(documentId) ?? await loadBucket(bucket);
            documents.push(buildDailyArchiveDocument({
                ...bucket,
                messages,
                previous,
                now,
            }));
        }
        await persistChunkedDocuments({ database, documents });
        return {
            affectedDocumentIds: documents.map(document => document.id),
            activeMessageIds: documents.flatMap(document => document.messages)
                .filter(message => message.status === 'active')
                .map(message => message.id),
        };
    } finally {
        database.close();
    }
};

export const getDailyArchiveDocument = async (input: {
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
    factory?: IDBFactory;
}): Promise<DailyArchiveDocument | null> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const manifest = await ensureChunkedManifest(database, createDailyArchiveDocumentId(input));
        return manifest ? hydrateStoredManifest(database, manifest) : null;
    } finally {
        database.close();
    }
};

export const getDailyArchiveManifest = async (input: {
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
    factory?: IDBFactory;
}): Promise<DailyArchiveManifest | null> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        return await ensureChunkedManifest(database, createDailyArchiveDocumentId(input));
    } finally {
        database.close();
    }
};

const readManifestMessagePage = async (input: {
    database: IDBDatabase;
    manifest: DailyArchiveManifest;
    offset: number;
    limit: number;
}): Promise<DailyArchiveMessagePage> => {
    const selections = selectDailyArchiveChunksForPage({
        manifest: input.manifest,
        offset: input.offset,
        limit: input.limit,
    });
    const transaction = input.database.transaction(DAILY_ARCHIVE_CHUNK_STORE, 'readonly');
    const store = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const chunks = await Promise.all(selections.map(selection => (
        requestAsPromise(store.get(selection.descriptor.id)) as Promise<DailyArchiveChunk | undefined>
    )));
    if (chunks.some(chunk => !chunk)) throw new Error('日档分页缺少正文分块。');
    return readDailyArchivePageFromChunks({
        manifest: input.manifest,
        chunks: chunks as DailyArchiveChunk[],
        offset: input.offset,
        limit: input.limit,
    });
};

export const readDailyArchiveMessagePage = async (input: {
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
    offset: number;
    limit: number;
    factory?: IDBFactory;
}): Promise<DailyArchiveMessagePage | null> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const manifest = await ensureChunkedManifest(database, createDailyArchiveDocumentId(input));
        if (!manifest) return null;
        return readManifestMessagePage({
            database,
            manifest,
            offset: input.offset,
            limit: input.limit,
        });
    } finally {
        database.close();
    }
};

export const listDailyArchiveMonth = async (input: {
    scope: HistoryScope;
    monthKey: string;
    factory?: IDBFactory;
}): Promise<DailyArchiveMonthSummary> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(DAILY_ARCHIVE_SUMMARY_STORE, 'readonly');
        const index = transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE).index('scope_month');
        const documents = await requestAsPromise(index.getAll(IDBKeyRange.only([
            ...scopeKey(input.scope),
            input.monthKey,
        ]))) as DailyArchiveDocumentSummary[];
        const days = documents
            .filter(document => Boolean(document.dateKey) && document.messageCount > 0)
            .map(document => ({
                dateKey: document.dateKey!,
                messageCount: document.messageCount,
                sourceKinds: [...document.sourceKinds],
            }))
            .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
        return {
            scope: { ...input.scope },
            monthKey: input.monthKey,
            days,
            messageCount: days.reduce((total, day) => total + day.messageCount, 0),
        };
    } finally {
        database.close();
    }
};

export const readDailyArchiveCoverage = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<DailyArchiveCoverage> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(DAILY_ARCHIVE_SUMMARY_STORE, 'readonly');
        const index = transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE).index('scope');
        const documents = await requestAsPromise(index.getAll(IDBKeyRange.only(scopeKey(input.scope)))) as DailyArchiveDocumentSummary[];
        const visible = documents.filter(document => document.messageCount > 0);
        const dated = visible.filter(document => Boolean(document.dateKey));
        const undated = visible.filter(document => !document.dateKey);
        const dateKeys = dated.map(document => document.dateKey!).sort();
        return {
            scope: { ...input.scope },
            documentCount: visible.length,
            datedDocumentCount: dated.length,
            undatedDocumentCount: undated.length,
            messageCount: visible.reduce((total, document) => total + document.messageCount, 0),
            datedMessageCount: dated.reduce((total, document) => total + document.messageCount, 0),
            undatedMessageCount: undated.reduce((total, document) => total + document.messageCount, 0),
            earliestDateKey: dateKeys[0],
            latestDateKey: dateKeys[dateKeys.length - 1],
        };
    } finally {
        database.close();
    }
};

const listScopeDailyArchiveManifests = async (input: {
    database: IDBDatabase;
    scope: HistoryScope;
}): Promise<DailyArchiveManifest[]> => {
    const transaction = input.database.transaction(DAILY_ARCHIVE_SUMMARY_STORE, 'readonly');
    const summaryIndex = transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE).index('scope');
    const summaries = await requestAsPromise(
        summaryIndex.getAll(IDBKeyRange.only(scopeKey(input.scope))),
    ) as DailyArchiveDocumentSummary[];
    const manifests: DailyArchiveManifest[] = [];
    for (const summary of summaries.sort((left, right) => left.id.localeCompare(right.id))) {
        const manifest = await ensureChunkedManifest(input.database, summary.id);
        if (!manifest) throw new Error('日档索引与正文清单不一致。');
        manifests.push(manifest);
    }
    return manifests;
};

const loadDailyArchiveChunkBatch = async (input: {
    database: IDBDatabase;
    descriptors: DailyArchiveManifest['chunks'];
}): Promise<DailyArchiveChunk[]> => {
    if (input.descriptors.length === 0) return [];
    const transaction = input.database.transaction(DAILY_ARCHIVE_CHUNK_STORE, 'readonly');
    const store = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
    const chunks = await Promise.all(input.descriptors.map(descriptor => (
        requestAsPromise(store.get(descriptor.id)) as Promise<DailyArchiveChunk | undefined>
    )));
    if (chunks.some(chunk => !chunk)) throw new Error('搜索时发现日档正文分块不完整。');
    return chunks as DailyArchiveChunk[];
};

export const searchDailyArchiveMessages = async (input: {
    scope: HistoryScope;
    query: string;
    limit?: number;
    signal?: AbortSignal;
    factory?: IDBFactory;
}): Promise<DailyArchiveSearchResponse> => {
    const query = normalizeDailyArchiveKeyword(input.query);
    if (!query) throw new Error('先写下想找的词。');
    const limit = Math.min(
        DAILY_ARCHIVE_KEYWORD_RESULT_LIMIT,
        Math.max(1, Math.floor(input.limit ?? DAILY_ARCHIVE_KEYWORD_RESULT_LIMIT)),
    );
    const checkAborted = () => {
        if (input.signal?.aborted) throw new DOMException('搜索已停止。', 'AbortError');
    };
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        checkAborted();
        const manifests = (await listScopeDailyArchiveManifests({
            database,
            scope: input.scope,
        })).sort((left, right) => (
            (right.lastTimestamp ?? right.updatedAt) - (left.lastTimestamp ?? left.updatedAt)
            || right.id.localeCompare(left.id)
        ));
        const hits: DailyArchiveSearchHit[] = [];
        let totalMatchCount = 0;
        let scannedMessageCount = 0;
        for (const manifest of manifests) {
            checkAborted();
            const activeOffsets = new Map<string, number>();
            let activeBefore = 0;
            manifest.chunks.forEach(descriptor => {
                activeOffsets.set(descriptor.id, activeBefore);
                activeBefore += descriptor.messageCount;
            });
            const descriptors = manifest.chunks.slice().reverse();
            for (let cursor = 0; cursor < descriptors.length; cursor += 6) {
                checkAborted();
                const descriptorBatch = descriptors.slice(cursor, cursor + 6);
                const chunks = await loadDailyArchiveChunkBatch({ database, descriptors: descriptorBatch });
                chunks.forEach(chunk => {
                    const result = searchDailyArchiveChunk({
                        chunk,
                        query,
                        activeOffset: activeOffsets.get(chunk.id) ?? 0,
                    });
                    scannedMessageCount += result.scannedMessageCount;
                    totalMatchCount += result.matches.length;
                    result.matches.slice().reverse().forEach(match => {
                        if (hits.length >= limit) return;
                        hits.push({
                            retrievalKind: 'keyword',
                            score: 1,
                            matchCount: match.matchCount,
                            documentId: manifest.id,
                            documentMessageCount: manifest.messageCount,
                            scope: { ...manifest.scope },
                            dateKey: manifest.dateKey,
                            undatedKey: manifest.undatedKey,
                            messageId: match.message.id,
                            messageOffset: match.messageOffset,
                            role: match.message.role,
                            content: match.message.content,
                            time: { ...match.message.time },
                            source: match.message.source,
                            sourceRecordId: match.message.sourceRecordId,
                        });
                    });
                });
                await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
            }
        }
        return {
            query,
            retrievalKind: 'keyword',
            hits,
            totalMatchCount,
            scannedMessageCount,
            truncated: totalMatchCount > hits.length,
        };
    } finally {
        database.close();
    }
};

export const listUndatedDailyArchiveManifests = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<DailyArchiveManifest[]> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        return (await listScopeDailyArchiveManifests({ database, scope: input.scope }))
            .filter(manifest => !manifest.dateKey && manifest.messageCount > 0)
            .sort((left, right) => left.id.localeCompare(right.id));
    } finally {
        database.close();
    }
};

export const readUndatedDailyArchiveMessagePage = async (input: {
    scope: HistoryScope;
    offset: number;
    limit: number;
    factory?: IDBFactory;
}): Promise<DailyArchiveMessagePage> => {
    const manifests = await listUndatedDailyArchiveManifests({ scope: input.scope, factory: input.factory });
    const totalMessageCount = manifests.reduce((total, manifest) => total + manifest.messageCount, 0);
    let activeBefore = 0;
    let remaining = input.limit;
    const messages: DailyArchiveMessage[] = [];
    let loadedChunkCount = 0;
    for (const manifest of manifests) {
        const activeAfter = activeBefore + manifest.messageCount;
        if (input.offset < activeAfter && remaining > 0) {
            const localOffset = Math.max(0, input.offset - activeBefore);
            const take = Math.min(remaining, manifest.messageCount - localOffset);
            const page = await readDailyArchiveMessagePage({
                scope: manifest.scope,
                undatedKey: manifest.undatedKey,
                offset: localOffset,
                limit: take,
                factory: input.factory,
            });
            if (!page) throw new Error('未标日期日档分页暂时不可用。');
            messages.push(...page.messages);
            loadedChunkCount += page.loadedChunkCount;
            remaining -= page.messages.length;
        }
        activeBefore = activeAfter;
        if (remaining === 0) break;
    }
    return {
        documentId: `undated-view:${input.scope.progressBundleId}:${input.scope.personaMaskId}:${input.scope.charId}`,
        offset: input.offset,
        limit: input.limit,
        totalMessageCount,
        messages,
        loadedChunkCount,
        hasBefore: input.offset > 0,
        hasAfter: input.offset + messages.length < totalMessageCount,
    };
};

export const listUndatedDailyArchiveDocuments = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<DailyArchiveDocument[]> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const manifests = await listUndatedDailyArchiveManifests(input);
        return await Promise.all(manifests.map(manifest => hydrateStoredManifest(database, manifest)));
    } finally {
        database.close();
    }
};

export const listAllDailyArchiveDocuments = async (factory?: IDBFactory): Promise<DailyArchiveDocument[]> => {
    const database = await openDailyArchiveDatabase(factory);
    try {
        const transaction = database.transaction(DAILY_ARCHIVE_MANIFEST_STORE, 'readonly');
        const manifests = await requestAsPromise(
            transaction.objectStore(DAILY_ARCHIVE_MANIFEST_STORE).getAll(),
        ) as DailyArchiveManifest[];
        const documents = await Promise.all(manifests.map(manifest => hydrateStoredManifest(database, manifest)));
        return documents.sort((left, right) => left.id.localeCompare(right.id));
    } finally {
        database.close();
    }
};

export const saveConversationClipping = async (input: {
    clipping: ConversationClipping;
    factory?: IDBFactory;
}): Promise<void> => {
    validateConversationClipping(input.clipping);
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(CONVERSATION_CLIPPING_STORE, 'readwrite');
        const settled = transactionAsPromise(transaction);
        transaction.objectStore(CONVERSATION_CLIPPING_STORE).put(input.clipping);
        await settled;
    } finally {
        database.close();
    }
};

export const listConversationClippings = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<ConversationClipping[]> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(CONVERSATION_CLIPPING_STORE, 'readonly');
        const index = transaction.objectStore(CONVERSATION_CLIPPING_STORE).index('scope');
        const clippings = await requestAsPromise(
            index.getAll(IDBKeyRange.only(scopeKey(input.scope))),
        ) as ConversationClipping[];
        return clippings.sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
    } finally {
        database.close();
    }
};

export const listAllConversationClippings = async (factory?: IDBFactory): Promise<ConversationClipping[]> => {
    const database = await openDailyArchiveDatabase(factory);
    try {
        const transaction = database.transaction(CONVERSATION_CLIPPING_STORE, 'readonly');
        return await requestAsPromise(
            transaction.objectStore(CONVERSATION_CLIPPING_STORE).getAll(),
        ) as ConversationClipping[];
    } finally {
        database.close();
    }
};

export const deleteConversationClipping = async (input: {
    id: string;
    factory?: IDBFactory;
}): Promise<void> => {
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(CONVERSATION_CLIPPING_STORE, 'readwrite');
        const settled = transactionAsPromise(transaction);
        transaction.objectStore(CONVERSATION_CLIPPING_STORE).delete(input.id);
        await settled;
    } finally {
        database.close();
    }
};

export const replaceConversationClippings = async (input: {
    clippings: ConversationClipping[];
    factory?: IDBFactory;
}): Promise<void> => {
    input.clippings.forEach(validateConversationClipping);
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction(CONVERSATION_CLIPPING_STORE, 'readwrite');
        const settled = transactionAsPromise(transaction);
        const store = transaction.objectStore(CONVERSATION_CLIPPING_STORE);
        store.clear();
        input.clippings.forEach(clipping => store.put(clipping));
        await settled;
    } finally {
        database.close();
    }
};

const validateDocument = (document: DailyArchiveDocument): void => {
    if (document.schemaVersion !== DAILY_ARCHIVE_SCHEMA_VERSION) throw new Error('日档版本不受支持。');
    if (document.id !== createDailyArchiveDocumentId(document)) throw new Error('日档稳定编号与范围不一致。');
    if (document.messageCount !== document.messages.filter(message => message.status === 'active').length) {
        throw new Error('日档消息计数与正文不一致。');
    }
};

export const replaceDailyArchiveDocuments = async (input: {
    documents: DailyArchiveDocument[];
    factory?: IDBFactory;
}): Promise<void> => {
    input.documents.forEach(validateDocument);
    const chunked = input.documents.map(chunkDailyArchiveDocument);
    const database = await openDailyArchiveDatabase(input.factory);
    try {
        const transaction = database.transaction([
            DAILY_ARCHIVE_MANIFEST_STORE,
            DAILY_ARCHIVE_CHUNK_STORE,
            DAILY_ARCHIVE_MESSAGE_INDEX_STORE,
            DAILY_ARCHIVE_SUMMARY_STORE,
        ], 'readwrite');
        const settled = transactionAsPromise(transaction);
        const manifestStore = transaction.objectStore(DAILY_ARCHIVE_MANIFEST_STORE);
        const chunkStore = transaction.objectStore(DAILY_ARCHIVE_CHUNK_STORE);
        const messageIndexStore = transaction.objectStore(DAILY_ARCHIVE_MESSAGE_INDEX_STORE);
        const summaryStore = transaction.objectStore(DAILY_ARCHIVE_SUMMARY_STORE);
        manifestStore.clear();
        chunkStore.clear();
        messageIndexStore.clear();
        summaryStore.clear();
        chunked.forEach(({ manifest, chunks }) => {
            manifestStore.put(manifest);
            summaryStore.put(summaryForManifest(manifest));
            chunks.forEach(chunk => {
                chunkStore.put(chunk);
                chunk.messages.forEach(message => messageIndexStore.put({
                    id: dailyArchiveMessageIndexId(manifest.id, message.id),
                    messageId: message.id,
                    documentId: manifest.id,
                    chunkId: chunk.id,
                    revision: message.revision,
                } satisfies DailyArchiveMessageIndexEntry));
            });
        });
        await settled;
    } finally {
        database.close();
    }
};

const sha256 = async (text: string): Promise<string> => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const safePathPart = (value: string): string => encodeURIComponent(value).replace(/%/gu, '_');

export const dailyArchiveDocumentPath = (document: DailyArchiveDocument): string => {
    const root = [
        'daily-archive',
        safePathPart(document.scope.progressBundleId),
        safePathPart(document.scope.personaMaskId),
        safePathPart(document.scope.charId),
    ];
    if (document.dateKey) {
        const [year, month] = document.dateKey.split('-');
        return [...root, year, month, `${document.dateKey}.json`].join('/');
    }
    return [...root, 'undated', `${safePathPart(document.undatedKey || document.id)}.json`].join('/');
};

export const buildDailyArchiveBackupFiles = async (input: {
    documents: DailyArchiveDocument[];
    generatedAt?: number;
}): Promise<{
    manifest: DailyArchiveBackupManifest;
    files: Array<{ path: string; json: string }>;
}> => {
    const sortedDocuments = input.documents
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id));
    const files = sortedDocuments
        .map(document => ({ path: dailyArchiveDocumentPath(document), json: JSON.stringify(document) }));
    const manifestFiles = await Promise.all(files.map(async (file, index) => ({
        path: file.path,
        documentId: sortedDocuments[index].id,
        byteLength: new TextEncoder().encode(file.json).byteLength,
        sha256: await sha256(file.json),
    })));
    return {
        manifest: {
            schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
            format: 'aetheros-daily-json-v1',
            documentCount: input.documents.length,
            messageCount: input.documents.reduce((total, document) => total + document.messageCount, 0),
            files: manifestFiles,
            generatedAt: input.generatedAt ?? Date.now(),
        },
        files,
    };
};

export const verifyDailyArchiveBackupFiles = async (input: {
    manifest: DailyArchiveBackupManifest;
    files: Array<{ path: string; json: string }>;
}): Promise<DailyArchiveDocument[]> => {
    if (
        input.manifest.schemaVersion !== DAILY_ARCHIVE_SCHEMA_VERSION
        || input.manifest.format !== 'aetheros-daily-json-v1'
    ) throw new Error('每日档案备份版本不受支持。');
    if (input.manifest.documentCount !== input.manifest.files.length) throw new Error('每日档案清单数量不一致。');
    const fileByPath = new Map(input.files.map(file => [file.path, file.json]));
    const documents: DailyArchiveDocument[] = [];
    for (const expected of input.manifest.files) {
        const json = fileByPath.get(expected.path);
        if (json === undefined) throw new Error(`每日档案备份缺少 ${expected.path}`);
        if (new TextEncoder().encode(json).byteLength !== expected.byteLength) throw new Error('每日档案字节数校验失败。');
        if (await sha256(json) !== expected.sha256) throw new Error('每日档案内容校验失败。');
        const document = JSON.parse(json) as DailyArchiveDocument;
        validateDocument(document);
        if (document.id !== expected.documentId) throw new Error('每日档案清单编号不一致。');
        documents.push(document);
    }
    const messageCount = documents.reduce((total, document) => total + document.messageCount, 0);
    if (messageCount !== input.manifest.messageCount) throw new Error('每日档案消息总数校验失败。');
    return documents;
};
