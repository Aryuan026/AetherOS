import type { ChatReplyMode, MessageRelationshipScope } from '../types';
import { DB } from './db';
import {
    DEFAULT_CHAT_REPLY_MODE,
    normalizeChatReplyMode,
} from './chatReplyMode';

export const CHAT_RELATIONSHIP_SETTINGS_VERSION = 1 as const;
export const CHAT_RELATIONSHIP_SETTINGS_PREFIX = 'aetheros_chat_relationship_settings_v1';

export interface ChatRelationshipSettingsV1 {
    version: typeof CHAT_RELATIONSHIP_SETTINGS_VERSION;
    scope: MessageRelationshipScope;
    replyMode: ChatReplyMode;
    updatedAt: number;
}

const encodeScopePart = (value: string): string => encodeURIComponent(value.trim());

export const getChatRelationshipSettingsAssetId = (
    scope: MessageRelationshipScope,
): string => [
    CHAT_RELATIONSHIP_SETTINGS_PREFIX,
    encodeScopePart(scope.progressBundleId),
    encodeScopePart(scope.personaMaskId),
    encodeScopePart(scope.charId),
].join(':');

export const createDefaultChatRelationshipSettings = (
    scope: MessageRelationshipScope,
    now = Date.now(),
): ChatRelationshipSettingsV1 => ({
    version: CHAT_RELATIONSHIP_SETTINGS_VERSION,
    scope: { ...scope },
    replyMode: DEFAULT_CHAT_REPLY_MODE,
    updatedAt: now,
});

const normalizeStoredSettings = (
    scope: MessageRelationshipScope,
    value: unknown,
): ChatRelationshipSettingsV1 => {
    const fallback = createDefaultChatRelationshipSettings(scope);
    if (!value || typeof value !== 'object') return fallback;
    const candidate = value as Partial<ChatRelationshipSettingsV1>;
    const storedScope = candidate.scope;
    if (
        !storedScope
        || storedScope.progressBundleId !== scope.progressBundleId
        || storedScope.personaMaskId !== scope.personaMaskId
        || storedScope.charId !== scope.charId
    ) return fallback;
    return {
        ...fallback,
        replyMode: normalizeChatReplyMode(candidate.replyMode),
        updatedAt: Number(candidate.updatedAt) || fallback.updatedAt,
    };
};

export const loadChatRelationshipSettings = async (
    scope: MessageRelationshipScope,
): Promise<ChatRelationshipSettingsV1> => {
    const raw = await DB.getAssetRaw(getChatRelationshipSettingsAssetId(scope));
    return normalizeStoredSettings(scope, raw);
};

export const saveChatRelationshipSettings = async (
    scope: MessageRelationshipScope,
    updates: Pick<ChatRelationshipSettingsV1, 'replyMode'>,
): Promise<ChatRelationshipSettingsV1> => {
    const next: ChatRelationshipSettingsV1 = {
        version: CHAT_RELATIONSHIP_SETTINGS_VERSION,
        scope: { ...scope },
        replyMode: normalizeChatReplyMode(updates.replyMode),
        updatedAt: Date.now(),
    };
    await DB.saveAssetRaw(getChatRelationshipSettingsAssetId(scope), next);
    return next;
};
