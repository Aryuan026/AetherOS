import type { Message } from '../../types.ts';
import {
    dailyArchiveMessageFromLive,
    type DailyArchiveMessage,
} from '../../domain/dailyArchive/index.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import {
    isHistoricalContextMessage,
    relationshipScopeFromMessage,
    relationshipScopesFromMessage,
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
    if (isHistoricalContextMessage(input.message)) return false;
    const scopes = input.message.groupId
        ? relationshipScopesFromMessage(input.message)
        : [dailyArchiveScopeForLiveMessage({ message: input.message })].filter(
            (scope): scope is HistoryScope => Boolean(scope),
        );
    if (scopes.length === 0) return false;
    const speaker = typeof input.message.metadata?.groupSpeakerName === 'string'
        ? input.message.metadata.groupSpeakerName.trim()
        : '';
    const groupContent = input.message.groupId && speaker
        ? input.message.type === 'text'
            ? `[群聊发言人：${speaker}]\n${input.message.content}`
            : `[群聊发言人：${speaker}]\n[${input.message.type === 'image' ? '图片' : input.message.type === 'emoji' ? '表情' : '互动'}保存在原群聊记录中]`
        : input.message.content;
    await upsertDailyArchiveMessages({
        messages: scopes.map(scope => dailyArchiveMessageFromLive({
            message: {
                ...input.message,
                charId: scope.charId,
                content: groupContent,
                metadata: {
                    ...(input.message.metadata || {}),
                    relationshipScope: scope,
                },
            },
            scope,
            status: input.status,
        })),
        factory: input.factory,
    });
    return true;
};
