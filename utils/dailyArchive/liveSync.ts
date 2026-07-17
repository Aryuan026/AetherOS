import type { Message } from '../../types.ts';
import {
    dailyArchiveMessageFromLive,
    type DailyArchiveMessage,
} from '../../domain/dailyArchive/index.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import {
    isHistoricalContextMessage,
    relationshipScopeFromMessage,
} from '../messageContext.ts';
import { upsertDailyArchiveMessages } from './storage.ts';

export const dailyArchiveScopeForLiveMessage = (input: {
    message: Pick<Message, 'charId' | 'metadata'>;
}): HistoryScope | undefined => {
    return relationshipScopeFromMessage(input.message);
};

export const archiveLiveMessage = async (input: {
    message: Omit<Message, 'id'> & { id: number };
    status?: DailyArchiveMessage['status'];
    factory?: IDBFactory;
}): Promise<boolean> => {
    if (input.message.groupId || isHistoricalContextMessage(input.message)) return false;
    const scope = dailyArchiveScopeForLiveMessage({
        message: input.message,
    });
    if (!scope) return false;
    await upsertDailyArchiveMessages({
        messages: [dailyArchiveMessageFromLive({
            message: input.message,
            scope,
            status: input.status,
        })],
        factory: input.factory,
    });
    return true;
};
