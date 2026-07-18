import type { ChatReplyMode, Message, MessageRelationshipScope } from '../types';

export const LEGACY_ASSISTANT_SPLIT_GAP_MS = 8_000;

const scopesMatch = (
    left: MessageRelationshipScope | null | undefined,
    right: MessageRelationshipScope | null | undefined,
): boolean => {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.progressBundleId === right.progressBundleId
        && left.personaMaskId === right.personaMaskId
        && left.charId === right.charId;
};

const canMergeAssistantText = (message: Message): boolean => (
    message.role === 'assistant'
    && message.type === 'text'
    && message.metadata?.temporalClass !== 'historical'
    && !message.metadata?.source
    && !message.metadata?.proactiveHint
);

const belongsToSameResponse = (previous: Message, current: Message): boolean => {
    if (!canMergeAssistantText(previous) || !canMergeAssistantText(current)) return false;
    if (previous.charId !== current.charId) return false;
    if (!scopesMatch(previous.metadata?.relationshipScope, current.metadata?.relationshipScope)) return false;

    const previousResponseId = previous.metadata?.assistantResponseId;
    const currentResponseId = current.metadata?.assistantResponseId;
    if (previousResponseId || currentResponseId) {
        return Boolean(previousResponseId && previousResponseId === currentResponseId);
    }

    const gap = current.timestamp - previous.timestamp;
    return gap >= 0 && gap <= LEGACY_ASSISTANT_SPLIT_GAP_MS;
};

export const getPresentationSourceMessageIds = (message: Message): number[] => {
    const sourceIds = message.metadata?.presentationSourceMessageIds;
    return Array.isArray(sourceIds) && sourceIds.length > 0 ? sourceIds : [message.id];
};

export const mergeAssistantRepliesForPresentation = (
    messages: Message[],
    replyMode: ChatReplyMode,
): Message[] => {
    if (replyMode !== 'preserve') return messages;

    const result: Message[] = [];
    let index = 0;
    while (index < messages.length) {
        const first = messages[index];
        const responseMessages = [first];
        let cursor = index + 1;
        while (
            cursor < messages.length
            && belongsToSameResponse(responseMessages[responseMessages.length - 1], messages[cursor])
        ) {
            responseMessages.push(messages[cursor]);
            cursor += 1;
        }

        if (responseMessages.length === 1) {
            result.push(first);
        } else {
            const last = responseMessages[responseMessages.length - 1];
            const firstReply = responseMessages.find(message => message.replyTo)?.replyTo;
            result.push({
                ...first,
                content: responseMessages.map(message => message.content).join('\n'),
                timestamp: last.timestamp,
                replyTo: firstReply,
                metadata: {
                    ...(first.metadata || {}),
                    presentationSourceMessageIds: responseMessages.map(message => message.id),
                },
            });
        }
        index = cursor;
    }
    return result;
};
