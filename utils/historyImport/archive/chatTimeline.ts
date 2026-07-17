import type { Message } from '../../../types';
import { HISTORY_IMPORT_STORE_NAMES } from '../../../domain/historyImport/contract.ts';
import type {
    HistoryScope,
    HistorySourceMessage,
} from '../../../domain/historyImport/types';
import {
    getActiveHistoryArchive,
    openHistoryArchiveDatabase,
} from '../storage/indexedDbArchive.ts';

const CHAT_TIMELINE_INDEX = 'scope_imported_order';
const MAX_CHAT_TIMELINE_PAGE = 100;

type TimelineIndexKey = [string, string, number, number];

interface TimelineCursor {
    indexKey: TimelineIndexKey;
    primaryKey: string;
}

export interface ActiveHistoryChatTimelinePage {
    items: HistorySourceMessage[];
    nextCursor?: string;
    hasMore: boolean;
    total: number;
    archiveDatabaseId?: string;
}

const encodeCursor = (cursor: TimelineCursor): string => JSON.stringify(cursor);

const decodeCursor = (value?: string): TimelineCursor | undefined => {
    if (!value) return undefined;
    const parsed = JSON.parse(value) as Partial<TimelineCursor>;
    if (
        !Array.isArray(parsed.indexKey)
        || parsed.indexKey.length !== 4
        || typeof parsed.primaryKey !== 'string'
    ) {
        throw new Error('旧日记录分页位置已失效。');
    }
    return parsed as TimelineCursor;
};

const scopeRange = (scope: HistoryScope, upper?: TimelineIndexKey): IDBKeyRange => IDBKeyRange.bound(
    [scope.progressBundleId, scope.charId, 0, 0],
    upper || [scope.progressBundleId, scope.charId, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
);

const sameIndexKey = (left: IDBValidKey, right: TimelineIndexKey): boolean => (
    Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index])
);

export const pageActiveHistoryChatTimeline = async (input: {
    scope: HistoryScope;
    cursor?: string;
    limit?: number;
    factory?: IDBFactory;
}): Promise<ActiveHistoryChatTimelinePage> => {
    const limit = input.limit ?? 30;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CHAT_TIMELINE_PAGE) {
        throw new Error(`旧日记录每页只能读取 1-${MAX_CHAT_TIMELINE_PAGE} 条。`);
    }
    const active = await getActiveHistoryArchive(input.factory);
    if (!active) return { items: [], hasMore: false, total: 0 };

    const decodedCursor = decodeCursor(input.cursor);
    const database = await openHistoryArchiveDatabase(active.activeDatabaseId, input.factory);
    try {
        const total = await new Promise<number>((resolve, reject) => {
            const transaction = database.transaction(HISTORY_IMPORT_STORE_NAMES.sourceMessages, 'readonly');
            const index = transaction
                .objectStore(HISTORY_IMPORT_STORE_NAMES.sourceMessages)
                .index(CHAT_TIMELINE_INDEX);
            const request = index.count(scopeRange(input.scope));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('暂时无法统计旧日记录。'));
        });
        const observed = await new Promise<Array<{
            message: HistorySourceMessage;
            indexKey: TimelineIndexKey;
            primaryKey: string;
        }>>((resolve, reject) => {
            const transaction = database.transaction(HISTORY_IMPORT_STORE_NAMES.sourceMessages, 'readonly');
            const index = transaction
                .objectStore(HISTORY_IMPORT_STORE_NAMES.sourceMessages)
                .index(CHAT_TIMELINE_INDEX);
            const range = scopeRange(input.scope, decodedCursor?.indexKey);
            const items: Array<{
                message: HistorySourceMessage;
                indexKey: TimelineIndexKey;
                primaryKey: string;
            }> = [];
            const request = index.openCursor(range, 'prev');
            request.onerror = () => reject(request.error ?? new Error('暂时无法读取旧日记录。'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || items.length >= limit + 1) {
                    resolve(items);
                    return;
                }
                const primaryKey = String(cursor.primaryKey);
                if (
                    decodedCursor
                    && sameIndexKey(cursor.key, decodedCursor.indexKey)
                    && primaryKey >= decodedCursor.primaryKey
                ) {
                    cursor.continue();
                    return;
                }
                const message = cursor.value as HistorySourceMessage;
                if (
                    message.status === 'active'
                    && message.scope.progressBundleId === input.scope.progressBundleId
                    && message.scope.personaMaskId === input.scope.personaMaskId
                    && message.scope.charId === input.scope.charId
                ) {
                    items.push({
                        message,
                        indexKey: cursor.key as TimelineIndexKey,
                        primaryKey,
                    });
                }
                cursor.continue();
            };
        });
        const hasMore = observed.length > limit;
        const pageRecords = observed.slice(0, limit);
        const oldest = pageRecords[pageRecords.length - 1];
        return {
            items: pageRecords.map(item => item.message).reverse(),
            nextCursor: hasMore && oldest
                ? encodeCursor({ indexKey: oldest.indexKey, primaryKey: oldest.primaryKey })
                : undefined,
            hasMore,
            total,
            archiveDatabaseId: active.activeDatabaseId,
        };
    } finally {
        database.close();
    }
};

export const readActiveHistoryChatTail = async (input: {
    scope: HistoryScope;
    limit?: number;
    factory?: IDBFactory;
}): Promise<HistorySourceMessage[]> => (
    await pageActiveHistoryChatTimeline(input)
).items;

export const historySourceMessageTimestamp = (message: HistorySourceMessage): number => {
    if (Number.isFinite(message.sourceTime.epochMs)) return message.sourceTime.epochMs!;
    if (message.sourceTime.iso) {
        const parsed = Date.parse(message.sourceTime.iso);
        if (Number.isFinite(parsed)) return parsed;
    }
    const raw = message.sourceTime.originalText || '';
    const match = raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/u);
    if (match) {
        const parsed = Date.parse(`${match[1]}T${match[2]}`);
        if (Number.isFinite(parsed)) return parsed;
    }
    return message.importedAt + message.sourceOrder;
};

const historyContextMessageId = (id: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return -((hash >>> 0) % 2_000_000_000 + 1);
};

export const historySourceMessagesToContext = (
    messages: HistorySourceMessage[],
    charId: string,
): Message[] => messages.flatMap(message => {
    if (message.status !== 'active' || message.kind !== 'text') return [];
    if (message.speakerRole !== 'user' && message.speakerRole !== 'character') return [];
    return [{
        id: historyContextMessageId(message.id),
        charId,
        role: message.speakerRole === 'user' ? 'user' as const : 'assistant' as const,
        type: 'text' as const,
        content: message.content,
        timestamp: historySourceMessageTimestamp(message),
        metadata: {
            source: 'history_import_tail',
            historySourceMessageId: message.id,
            historyBatchId: message.batchId,
            readOnly: true,
        },
    }];
});
