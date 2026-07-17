import type {
    DailyArchiveChunk,
    DailyArchiveMessage,
} from './types.ts';

export const DAILY_ARCHIVE_KEYWORD_QUERY_LIMIT = 80;
export const DAILY_ARCHIVE_KEYWORD_RESULT_LIMIT = 100;

export const normalizeDailyArchiveKeyword = (value: string): string => (
    value
        .normalize('NFKC')
        .toLocaleLowerCase('zh-CN')
        .replace(/\s+/gu, ' ')
        .trim()
);

const countOccurrences = (content: string, query: string): number => {
    let count = 0;
    let cursor = 0;
    while (cursor <= content.length - query.length) {
        const index = content.indexOf(query, cursor);
        if (index < 0) break;
        count += 1;
        cursor = index + Math.max(1, query.length);
    }
    return count;
};

export interface DailyArchiveChunkKeywordMatch {
    message: DailyArchiveMessage;
    messageOffset: number;
    matchCount: number;
}

export const searchDailyArchiveChunk = (input: {
    chunk: DailyArchiveChunk;
    query: string;
    activeOffset: number;
}): {
    matches: DailyArchiveChunkKeywordMatch[];
    scannedMessageCount: number;
} => {
    const query = normalizeDailyArchiveKeyword(input.query);
    if (!query) return { matches: [], scannedMessageCount: 0 };
    if (query.length > DAILY_ARCHIVE_KEYWORD_QUERY_LIMIT) {
        throw new Error(`搜索词最多 ${DAILY_ARCHIVE_KEYWORD_QUERY_LIMIT} 个字。`);
    }

    let activeIndex = input.activeOffset;
    let scannedMessageCount = 0;
    const matches: DailyArchiveChunkKeywordMatch[] = [];
    input.chunk.messages.forEach(message => {
        if (message.status !== 'active') return;
        const messageOffset = activeIndex;
        activeIndex += 1;
        scannedMessageCount += 1;
        const normalizedContent = normalizeDailyArchiveKeyword(message.content);
        const matchCount = countOccurrences(normalizedContent, query);
        if (matchCount > 0) {
            matches.push({
                message,
                messageOffset,
                matchCount,
            });
        }
    });
    return { matches, scannedMessageCount };
};
