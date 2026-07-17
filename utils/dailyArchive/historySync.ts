import {
    createDailyArchiveScopeKey,
    dailyArchiveMessageFromHistory,
} from '../../domain/dailyArchive/index.ts';
import { HISTORY_IMPORT_STORE_NAMES } from '../../domain/historyImport/contract.ts';
import type { HistoryScope, HistorySourceMessage } from '../../domain/historyImport/types.ts';
import {
    getActiveHistoryArchive,
    openHistoryArchiveDatabase,
    pageHistoryArchiveStore,
} from '../historyImport/storage/indexedDbArchive.ts';
import {
    hasDailyArchiveSyncReceipt,
    saveDailyArchiveSyncReceipt,
    upsertDailyArchiveMessages,
} from './storage.ts';

const PAGE_SIZE = 500;

export interface DailyArchiveHistorySyncResult {
    status: 'no_archive' | 'already_synced' | 'synced';
    archiveDatabaseId?: string;
    scannedCount: number;
    matchedCount: number;
}

const receiptIdFor = (archiveDatabaseId: string, scope: HistoryScope): string => (
    `history-sync:${archiveDatabaseId}:${createDailyArchiveScopeKey(scope)}`
);

export const syncActiveHistoryToDailyArchive = async (input: {
    scope: HistoryScope;
    force?: boolean;
    factory?: IDBFactory;
    onProgress?: (progress: { scanned: number; matched: number }) => void;
}): Promise<DailyArchiveHistorySyncResult> => {
    const active = await getActiveHistoryArchive(input.factory);
    if (!active) return { status: 'no_archive', scannedCount: 0, matchedCount: 0 };
    const receiptId = receiptIdFor(active.activeDatabaseId, input.scope);
    if (!input.force && await hasDailyArchiveSyncReceipt({ id: receiptId, factory: input.factory })) {
        return {
            status: 'already_synced',
            archiveDatabaseId: active.activeDatabaseId,
            scannedCount: 0,
            matchedCount: 0,
        };
    }

    const database = await openHistoryArchiveDatabase(active.activeDatabaseId, input.factory);
    let cursor: string | undefined;
    let scannedCount = 0;
    let matchedCount = 0;
    try {
        do {
            const page = await pageHistoryArchiveStore<HistorySourceMessage>({
                database,
                store: HISTORY_IMPORT_STORE_NAMES.sourceMessages,
                cursor,
                limit: PAGE_SIZE,
            });
            scannedCount += page.items.length;
            const matching = page.items.filter(message => (
                message.status === 'active'
                && message.scope.progressBundleId === input.scope.progressBundleId
                && message.scope.personaMaskId === input.scope.personaMaskId
                && message.scope.charId === input.scope.charId
            ));
            if (matching.length > 0) {
                await upsertDailyArchiveMessages({
                    messages: matching.map(dailyArchiveMessageFromHistory),
                    factory: input.factory,
                });
                matchedCount += matching.length;
            }
            input.onProgress?.({ scanned: scannedCount, matched: matchedCount });
            cursor = page.nextCursor;
        } while (cursor);
    } finally {
        database.close();
    }
    await saveDailyArchiveSyncReceipt({
        id: receiptId,
        archiveDatabaseId: active.activeDatabaseId,
        scope: input.scope,
        messageCount: matchedCount,
        factory: input.factory,
    });
    return {
        status: 'synced',
        archiveDatabaseId: active.activeDatabaseId,
        scannedCount,
        matchedCount,
    };
};
