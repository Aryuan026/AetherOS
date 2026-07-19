import type {
    Message,
    MessageMetadata,
    MessageRelationshipScope,
    UserProfile,
} from '../types.ts';

const nonEmptyString = (value: unknown): value is string => (
    typeof value === 'string' && value.trim().length > 0
);

export const normalizeMessageRelationshipScope = (
    value: unknown,
): MessageRelationshipScope | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<MessageRelationshipScope>;
    if (
        !nonEmptyString(candidate.progressBundleId)
        || !nonEmptyString(candidate.personaMaskId)
        || !nonEmptyString(candidate.charId)
    ) return undefined;
    return {
        progressBundleId: candidate.progressBundleId,
        personaMaskId: candidate.personaMaskId,
        charId: candidate.charId,
    };
};

export const relationshipScopeForProfile = (
    charId: string,
    userProfile: UserProfile | null | undefined,
): MessageRelationshipScope | undefined => {
    if (
        !nonEmptyString(charId)
        || !nonEmptyString(userProfile?.activeProgressBundleId)
        || !nonEmptyString(userProfile?.activePersonaMaskId)
    ) return undefined;
    return {
        progressBundleId: userProfile.activeProgressBundleId,
        personaMaskId: userProfile.activePersonaMaskId,
        charId,
    };
};

/**
 * Historical memory is stricter than legacy live-message storage. It only
 * opens when the active mask and progress bundle point to each other exactly;
 * no fallback mask or current-character guess is allowed.
 */
export const strictRelationshipScopeForProfile = (
    charId: string,
    userProfile: UserProfile | null | undefined,
): MessageRelationshipScope | undefined => {
    if (!userProfile || !nonEmptyString(charId)) return undefined;
    const personaMaskId = userProfile.activePersonaMaskId;
    const progressBundleId = userProfile.activeProgressBundleId;
    if (!nonEmptyString(personaMaskId) || !nonEmptyString(progressBundleId)) return undefined;
    const mask = userProfile.personaMasks?.find(item => item.id === personaMaskId);
    const bundle = userProfile.progressBundles?.find(item => item.id === progressBundleId);
    if (!mask || !bundle) return undefined;
    if (mask.progressBundleId !== progressBundleId || bundle.maskId !== personaMaskId) return undefined;
    return { progressBundleId, personaMaskId, charId };
};

export const relationshipScopeFromMessage = (
    message: Pick<Message, 'charId' | 'metadata'>,
): MessageRelationshipScope | undefined => {
    const scope = normalizeMessageRelationshipScope(message.metadata?.relationshipScope);
    if (!scope || scope.charId !== message.charId) return undefined;
    return scope;
};

export const messageMatchesRelationshipScope = (
    message: Pick<Message, 'charId' | 'metadata'>,
    scope: MessageRelationshipScope,
): boolean => {
    const messageScope = relationshipScopeFromMessage(message);
    return Boolean(
        messageScope
        && messageScope.progressBundleId === scope.progressBundleId
        && messageScope.personaMaskId === scope.personaMaskId
        && messageScope.charId === scope.charId
    );
};

export const hasSuccessfulHistoryTailContinuation = (
    messages: Array<Pick<Message, 'charId' | 'role' | 'metadata'>>,
    scope: MessageRelationshipScope,
): boolean => messages.some(message => (
    message.role === 'assistant'
    && message.metadata?.historyTailContinuation === true
    && messageMatchesRelationshipScope(message, scope)
));

export const isHistoricalContextMessage = (
    message: Pick<Message, 'metadata'>,
): boolean => (
    message.metadata?.temporalClass === 'historical'
    || message.metadata?.source === 'history_import_tail'
);

export const sameMessageRelationshipScope = (
    left: MessageRelationshipScope,
    right: MessageRelationshipScope,
): boolean => (
    left.progressBundleId === right.progressBundleId
    && left.personaMaskId === right.personaMaskId
    && left.charId === right.charId
);

export const filterCurrentStateMessages = <T extends Pick<Message, 'metadata'>>(
    messages: T[],
): T[] => messages.filter(message => !isHistoricalContextMessage(message));

export const selectEmotionEvaluationMessages = <T extends Pick<Message, 'metadata'>>(
    messages: T[],
    limit = 100,
): T[] => filterCurrentStateMessages(messages).slice(-Math.max(0, limit));

export const withRelationshipScope = <T extends { metadata?: MessageMetadata }>(
    message: T,
    relationshipScope: MessageRelationshipScope | null,
    metadataPatch: MessageMetadata = {},
): T => ({
    ...message,
    metadata: {
        ...(message.metadata || {}),
        ...metadataPatch,
        relationshipScope,
    },
});
