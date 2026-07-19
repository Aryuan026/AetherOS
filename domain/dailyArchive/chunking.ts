import {
    DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION,
    type DailyArchiveChunk,
    type DailyArchiveChunkDescriptor,
    type DailyArchiveDocument,
    type DailyArchiveManifest,
    type DailyArchiveMessage,
    type DailyArchiveMessagePage,
} from './types.ts';
import { createDailyArchiveDocumentId, sortDailyArchiveMessages } from './contract.ts';

export const DAILY_ARCHIVE_CHUNK_MESSAGE_LIMIT = 200;
export const DAILY_ARCHIVE_PAGE_MESSAGE_LIMIT = 200;

const messageTimestamp = (message: DailyArchiveMessage): number | undefined => {
    if (Number.isFinite(message.time.epochMs)) return message.time.epochMs;
    if (message.time.iso) {
        const parsed = Date.parse(message.time.iso);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

export const createDailyArchiveChunkId = (documentId: string, chunkIndex: number): string => (
    `${documentId}:chunk:${String(chunkIndex).padStart(6, '0')}`
);

const metadataForMessages = (messages: DailyArchiveMessage[]) => {
    const active = messages.filter(message => message.status === 'active');
    const timestamps = active
        .map(messageTimestamp)
        .filter((timestamp): timestamp is number => timestamp !== undefined);
    return {
        entryCount: messages.length,
        messageCount: active.length,
        sourceKinds: Array.from(new Set(active.map(message => message.source))).sort(),
        firstTimestamp: timestamps.length ? Math.min(...timestamps) : undefined,
        lastTimestamp: timestamps.length ? Math.max(...timestamps) : undefined,
    };
};

export const buildDailyArchiveChunk = (input: {
    documentId: string;
    chunkIndex: number;
    messages: DailyArchiveMessage[];
}): DailyArchiveChunk => {
    const messages = sortDailyArchiveMessages(input.messages);
    const metadata = metadataForMessages(messages);
    const scope = messages[0]?.scope;
    if (!scope) throw new Error('日档分块不能是空的。');
    if (messages.length > DAILY_ARCHIVE_CHUNK_MESSAGE_LIMIT) throw new Error('日档分块超过本机安全上限。');
    if (messages.some(message => (
        message.scope.progressBundleId !== scope.progressBundleId
        || message.scope.personaMaskId !== scope.personaMaskId
        || message.scope.charId !== scope.charId
    ))) throw new Error('同一日档分块里混入了其他关系。');
    return {
        schemaVersion: DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION,
        id: createDailyArchiveChunkId(input.documentId, input.chunkIndex),
        documentId: input.documentId,
        scope: { ...scope },
        chunkIndex: input.chunkIndex,
        messages,
        ...metadata,
    };
};

export const dailyArchiveDescriptorForChunk = (
    chunk: DailyArchiveChunk,
): DailyArchiveChunkDescriptor => ({
    id: chunk.id,
    chunkIndex: chunk.chunkIndex,
    entryCount: chunk.entryCount,
    messageCount: chunk.messageCount,
    sourceKinds: [...chunk.sourceKinds],
    firstTimestamp: chunk.firstTimestamp,
    lastTimestamp: chunk.lastTimestamp,
});

export const buildDailyArchiveManifestFromDescriptors = (input: {
    document: Omit<DailyArchiveDocument, 'messages'>;
    descriptors: DailyArchiveChunkDescriptor[];
    chunkSize?: number;
}): DailyArchiveManifest => {
    const descriptors = input.descriptors
        .slice()
        .sort((left, right) => left.chunkIndex - right.chunkIndex);
    const activeTimestamps = descriptors.flatMap(descriptor => (
        [descriptor.firstTimestamp, descriptor.lastTimestamp]
            .filter((timestamp): timestamp is number => timestamp !== undefined)
    ));
    return {
        schemaVersion: DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION,
        id: input.document.id,
        scope: { ...input.document.scope },
        dateKey: input.document.dateKey,
        monthKey: input.document.monthKey,
        undatedKey: input.document.undatedKey,
        messageCount: descriptors.reduce((total, descriptor) => total + descriptor.messageCount, 0),
        entryCount: descriptors.reduce((total, descriptor) => total + descriptor.entryCount, 0),
        sourceKinds: Array.from(new Set(descriptors.flatMap(descriptor => descriptor.sourceKinds))).sort(),
        firstTimestamp: activeTimestamps.length ? Math.min(...activeTimestamps) : undefined,
        lastTimestamp: activeTimestamps.length ? Math.max(...activeTimestamps) : undefined,
        chunkSize: input.chunkSize ?? DAILY_ARCHIVE_CHUNK_MESSAGE_LIMIT,
        chunkCount: descriptors.length,
        chunks: descriptors,
        createdAt: input.document.createdAt,
        updatedAt: input.document.updatedAt,
        revision: input.document.revision,
        dayConfirmation: input.document.dayConfirmation ? { ...input.document.dayConfirmation } : undefined,
    };
};

export const buildDailyArchiveManifest = (input: {
    document: Omit<DailyArchiveDocument, 'messages'>;
    chunks: DailyArchiveChunk[];
    chunkSize?: number;
}): DailyArchiveManifest => buildDailyArchiveManifestFromDescriptors({
    document: input.document,
    descriptors: input.chunks.map(dailyArchiveDescriptorForChunk),
    chunkSize: input.chunkSize,
});

export const chunkDailyArchiveDocument = (document: DailyArchiveDocument): {
    manifest: DailyArchiveManifest;
    chunks: DailyArchiveChunk[];
} => {
    const messages = sortDailyArchiveMessages(document.messages);
    const chunks: DailyArchiveChunk[] = [];
    for (let offset = 0; offset < messages.length; offset += DAILY_ARCHIVE_CHUNK_MESSAGE_LIMIT) {
        chunks.push(buildDailyArchiveChunk({
            documentId: document.id,
            chunkIndex: chunks.length,
            messages: messages.slice(offset, offset + DAILY_ARCHIVE_CHUNK_MESSAGE_LIMIT),
        }));
    }
    return {
        manifest: buildDailyArchiveManifest({ document, chunks }),
        chunks,
    };
};

export const validateDailyArchiveChunkSet = (input: {
    manifest: DailyArchiveManifest;
    chunks: DailyArchiveChunk[];
}): void => {
    const expectedId = createDailyArchiveDocumentId(input.manifest);
    if (input.manifest.schemaVersion !== DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION) throw new Error('日档清单版本不受支持。');
    if (input.manifest.id !== expectedId) throw new Error('日档清单编号与关系范围不一致。');
    if (input.manifest.chunkCount !== input.manifest.chunks.length) throw new Error('日档清单分块数量不一致。');
    const chunks = input.chunks.slice().sort((left, right) => left.chunkIndex - right.chunkIndex);
    if (chunks.length !== input.manifest.chunkCount) throw new Error('日档正文分块不完整。');
    chunks.forEach((chunk, index) => {
        const descriptor = input.manifest.chunks[index];
        if (
            chunk.schemaVersion !== DAILY_ARCHIVE_CHUNK_SCHEMA_VERSION
            || chunk.documentId !== input.manifest.id
            || chunk.id !== createDailyArchiveChunkId(input.manifest.id, index)
            || chunk.chunkIndex !== index
            || descriptor?.id !== chunk.id
            || descriptor.entryCount !== chunk.messages.length
            || descriptor.entryCount !== chunk.entryCount
            || descriptor.messageCount !== chunk.messages.filter(message => message.status === 'active').length
        ) throw new Error('日档分块与清单不一致。');
    });
    if (input.manifest.entryCount !== chunks.reduce((total, chunk) => total + chunk.entryCount, 0)) {
        throw new Error('日档清单原始条目数不一致。');
    }
    if (input.manifest.messageCount !== chunks.reduce((total, chunk) => total + chunk.messageCount, 0)) {
        throw new Error('日档清单可见消息数不一致。');
    }
};

export const hydrateDailyArchiveDocument = (input: {
    manifest: DailyArchiveManifest;
    chunks: DailyArchiveChunk[];
}): DailyArchiveDocument => {
    validateDailyArchiveChunkSet(input);
    return {
        schemaVersion: 2,
        id: input.manifest.id,
        scope: { ...input.manifest.scope },
        dateKey: input.manifest.dateKey,
        monthKey: input.manifest.monthKey,
        undatedKey: input.manifest.undatedKey,
        messages: input.chunks
            .slice()
            .sort((left, right) => left.chunkIndex - right.chunkIndex)
            .flatMap(chunk => chunk.messages),
        messageCount: input.manifest.messageCount,
        sourceKinds: [...input.manifest.sourceKinds],
        firstTimestamp: input.manifest.firstTimestamp,
        lastTimestamp: input.manifest.lastTimestamp,
        createdAt: input.manifest.createdAt,
        updatedAt: input.manifest.updatedAt,
        revision: input.manifest.revision,
        dayConfirmation: input.manifest.dayConfirmation ? { ...input.manifest.dayConfirmation } : undefined,
    };
};

export interface DailyArchivePageChunkSelection {
    descriptor: DailyArchiveChunkDescriptor;
    activeOffset: number;
    take: number;
}

export const selectDailyArchiveChunksForPage = (input: {
    manifest: DailyArchiveManifest;
    offset: number;
    limit: number;
}): DailyArchivePageChunkSelection[] => {
    if (!Number.isInteger(input.offset) || input.offset < 0) throw new Error('日档分页起点无效。');
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > DAILY_ARCHIVE_PAGE_MESSAGE_LIMIT) {
        throw new Error(`日档单页必须是 1-${DAILY_ARCHIVE_PAGE_MESSAGE_LIMIT} 条。`);
    }
    const end = Math.min(input.manifest.messageCount, input.offset + input.limit);
    if (input.offset >= end) return [];
    const selections: DailyArchivePageChunkSelection[] = [];
    let activeBefore = 0;
    for (const descriptor of input.manifest.chunks) {
        const activeAfter = activeBefore + descriptor.messageCount;
        const intersectionStart = Math.max(input.offset, activeBefore);
        const intersectionEnd = Math.min(end, activeAfter);
        if (intersectionStart < intersectionEnd) {
            selections.push({
                descriptor,
                activeOffset: intersectionStart - activeBefore,
                take: intersectionEnd - intersectionStart,
            });
        }
        activeBefore = activeAfter;
        if (activeBefore >= end) break;
    }
    return selections;
};

export const readDailyArchivePageFromChunks = (input: {
    manifest: DailyArchiveManifest;
    chunks: DailyArchiveChunk[];
    offset: number;
    limit: number;
}): DailyArchiveMessagePage => {
    const selections = selectDailyArchiveChunksForPage(input);
    const chunkById = new Map(input.chunks.map(chunk => [chunk.id, chunk]));
    const messages = selections.flatMap(selection => {
        const chunk = chunkById.get(selection.descriptor.id);
        if (!chunk) throw new Error('日档分页缺少正文分块。');
        return chunk.messages
            .filter(message => message.status === 'active')
            .slice(selection.activeOffset, selection.activeOffset + selection.take);
    });
    const expectedCount = Math.min(input.limit, Math.max(0, input.manifest.messageCount - input.offset));
    if (messages.length !== expectedCount) throw new Error('日档分页正文数量与清单不一致。');
    return {
        documentId: input.manifest.id,
        offset: input.offset,
        limit: input.limit,
        totalMessageCount: input.manifest.messageCount,
        messages,
        loadedChunkCount: selections.length,
        hasBefore: input.offset > 0,
        hasAfter: input.offset + messages.length < input.manifest.messageCount,
    };
};
