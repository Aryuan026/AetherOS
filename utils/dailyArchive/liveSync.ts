import type { Message, UserProfile } from '../../types.ts';
import {
    dailyArchiveMessageFromLive,
    type DailyArchiveMessage,
} from '../../domain/dailyArchive/index.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { upsertDailyArchiveMessages } from './storage.ts';

export const dailyArchiveScopeForLiveMessage = (input: {
    charId: string;
    userProfile: UserProfile | null;
}): HistoryScope | undefined => {
    const profile = input.userProfile;
    if (!profile?.activeProgressBundleId || !profile.activePersonaMaskId || !input.charId) return undefined;
    return {
        progressBundleId: profile.activeProgressBundleId,
        personaMaskId: profile.activePersonaMaskId,
        charId: input.charId,
    };
};

export const archiveLiveMessage = async (input: {
    message: Omit<Message, 'id'> & { id: number };
    userProfile: UserProfile | null;
    status?: DailyArchiveMessage['status'];
    factory?: IDBFactory;
}): Promise<boolean> => {
    if (input.message.groupId) return false;
    const scope = dailyArchiveScopeForLiveMessage({
        charId: input.message.charId,
        userProfile: input.userProfile,
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
