import type { Message } from '../../types.ts';
import type { HistoryScope, HistorySourceMessage } from '../historyImport/types.ts';
import {
    DAILY_ARCHIVE_SCHEMA_VERSION,
    type DailyArchiveDocument,
    type DailyArchiveMessage,
} from './types.ts';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

const localDateKey = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const isDailyArchiveDateKey = (value?: string): value is string => {
    if (!value || !DATE_KEY_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && localDateKey(parsed.getTime()) === value;
};

export const createDailyArchiveScopeKey = (scope: HistoryScope): string => [
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
].map(value => encodeURIComponent(value)).join('::');

export const createDailyArchiveDocumentId = (input: {
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
}): string => {
    const bucket = input.dateKey
        ? `day:${input.dateKey}`
        : `undated:${encodeURIComponent(input.undatedKey || 'general')}`;
    return `daily-archive:${createDailyArchiveScopeKey(input.scope)}:${bucket}`;
};

export const dateKeyForHistoryMessage = (message: HistorySourceMessage): string | undefined => {
    const isoDate = message.sourceTime.iso?.slice(0, 10);
    if (isDailyArchiveDateKey(isoDate)) return isoDate;
    const sourceDate = message.sourceTime.originalText?.match(/(\d{4}-\d{1,2}-\d{1,2})/u)?.[1];
    if (sourceDate) {
        const [year, month, day] = sourceDate.split('-');
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        if (isDailyArchiveDateKey(normalized)) return normalized;
    }
    if (Number.isFinite(message.sourceTime.epochMs)) {
        return localDateKey(message.sourceTime.epochMs!);
    }
    return undefined;
};

const historyKind = (message: HistorySourceMessage): DailyArchiveMessage['kind'] => {
    if (message.kind === 'attachment_placeholder') return 'attachment';
    if (message.kind === 'source_fragment') return 'other';
    return 'text';
};

export const dailyArchiveMessageFromHistory = (
    message: HistorySourceMessage,
): DailyArchiveMessage => {
    const dateKey = dateKeyForHistoryMessage(message);
    return {
        schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
        id: `history:${message.id}`,
        scope: { ...message.scope },
        source: 'history_import',
        sourceRecordId: message.id,
        sourceBatchId: message.batchId,
        sourceOrder: message.sourceOrder,
        role: message.authorChannel === 'user'
            ? 'user'
            : message.authorChannel === 'char' ? 'character' : 'unknown',
        kind: historyKind(message),
        content: message.content,
        time: {
            dateKey,
            originalText: message.sourceTime.originalText,
            iso: message.sourceTime.iso,
            epochMs: message.sourceTime.epochMs,
            timezone: message.sourceTime.timezone,
            precision: message.sourceTime.precision,
        },
        status: message.status === 'active' ? 'active' : 'tombstoned',
        recordedAt: message.importedAt,
        revision: message.revision,
    };
};

const liveKind = (message: Omit<Message, 'id'> & { id: number }): DailyArchiveMessage['kind'] => {
    if (message.role === 'system' || message.type === 'system') return 'system_note';
    if (message.type === 'image') return 'image';
    if (message.type === 'emoji') return 'emoji';
    if (message.type === 'text') return 'text';
    return 'other';
};

const portableLiveContent = (message: Omit<Message, 'id'> & { id: number }): string => {
    if ((message.type === 'image' || message.type === 'emoji') && /^data:/iu.test(message.content)) {
        return message.type === 'image' ? '[图片保存在整机媒体备份中]' : '[表情保存在整机媒体备份中]';
    }
    return message.content;
};

export const dailyArchiveMessageFromLive = (input: {
    message: Omit<Message, 'id'> & { id: number };
    scope: HistoryScope;
    status?: DailyArchiveMessage['status'];
}): DailyArchiveMessage => {
    const dateKey = localDateKey(input.message.timestamp);
    const metadataRevision = Number(input.message.metadata?.dailyArchiveRevision);
    return {
        schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
        id: `live:${input.message.charId}:${input.message.id}`,
        scope: { ...input.scope },
        source: 'live_chat',
        sourceRecordId: String(input.message.id),
        role: input.message.role === 'assistant' ? 'character' : input.message.role,
        kind: liveKind(input.message),
        content: portableLiveContent(input.message),
        time: {
            dateKey,
            epochMs: input.message.timestamp,
            iso: new Date(input.message.timestamp).toISOString(),
            precision: 'exact',
        },
        status: input.status ?? 'active',
        recordedAt: Date.now(),
        revision: Number.isSafeInteger(metadataRevision) && metadataRevision > 0
            ? metadataRevision
            : 1,
    };
};

const messageSortValue = (message: DailyArchiveMessage): number => (
    message.time.epochMs
    ?? (message.time.iso ? Date.parse(message.time.iso) : Number.NaN)
    ?? Number.NaN
);

export const sortDailyArchiveMessages = (
    messages: DailyArchiveMessage[],
): DailyArchiveMessage[] => [...messages].sort((left, right) => {
    const leftTime = messageSortValue(left);
    const rightTime = messageSortValue(right);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    if (left.sourceOrder !== undefined && right.sourceOrder !== undefined && left.sourceOrder !== right.sourceOrder) {
        return left.sourceOrder - right.sourceOrder;
    }
    return left.id.localeCompare(right.id);
});

export const buildDailyArchiveDocument = (input: {
    scope: HistoryScope;
    dateKey?: string;
    undatedKey?: string;
    messages: DailyArchiveMessage[];
    now: number;
    previous?: DailyArchiveDocument;
}): DailyArchiveDocument => {
    if (!input.dateKey && !input.undatedKey) throw new Error('日档必须属于一个日期或未标日期分组。');
    if (input.dateKey && !isDailyArchiveDateKey(input.dateKey)) throw new Error('日档日期格式无效。');
    const merged = new Map<string, DailyArchiveMessage>();
    input.previous?.messages.forEach(message => merged.set(message.id, message));
    input.messages.forEach(message => {
        const current = merged.get(message.id);
        if (!current || message.revision >= current.revision) merged.set(message.id, message);
    });
    const messages = sortDailyArchiveMessages(Array.from(merged.values()));
    const activeMessages = messages.filter(message => message.status === 'active');
    const timestamps = activeMessages
        .map(messageSortValue)
        .filter(Number.isFinite) as number[];
    const sourceKinds = Array.from(new Set(activeMessages.map(message => message.source))).sort();
    const previousDayConfirmation = input.dateKey ? input.previous?.dayConfirmation : undefined;
    const previousActiveFingerprint = input.previous?.messages
        .filter(message => message.status === 'active')
        .map(message => `${message.id}:${message.revision}`)
        .sort()
        .join('|');
    const nextActiveFingerprint = activeMessages
        .map(message => `${message.id}:${message.revision}`)
        .sort()
        .join('|');
    const confirmedDayChanged = previousDayConfirmation?.status === 'confirmed'
        && previousActiveFingerprint !== nextActiveFingerprint;
    const dayConfirmation = input.dateKey ? {
        status: confirmedDayChanged ? 'open' as const : (previousDayConfirmation?.status ?? 'open' as const),
        revision: previousDayConfirmation
            ? previousDayConfirmation.revision + (confirmedDayChanged ? 1 : 0)
            : 1,
        updatedAt: confirmedDayChanged ? input.now : (previousDayConfirmation?.updatedAt ?? input.now),
        confirmedAt: confirmedDayChanged ? undefined : previousDayConfirmation?.confirmedAt,
        activeMessageCount: activeMessages.length,
        manualEntryCount: activeMessages.filter(message => message.source === 'manual_entry').length,
    } : undefined;
    return {
        schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
        id: createDailyArchiveDocumentId(input),
        scope: { ...input.scope },
        dateKey: input.dateKey,
        monthKey: input.dateKey?.slice(0, 7),
        undatedKey: input.dateKey ? undefined : input.undatedKey,
        messages,
        messageCount: activeMessages.length,
        sourceKinds,
        firstTimestamp: timestamps.length ? Math.min(...timestamps) : undefined,
        lastTimestamp: timestamps.length ? Math.max(...timestamps) : undefined,
        createdAt: input.previous?.createdAt ?? input.now,
        updatedAt: input.now,
        revision: (input.previous?.revision ?? 0) + 1,
        dayConfirmation,
    };
};
