import type { Anniversary, CharacterProfile, Message, UserProfile } from '../../types';
import { DB } from '../db';

export const AUTO_MEMORY_UPDATED_EVENT = 'worldline-auto-memory-updated';

const SETTINGS_STORAGE_KEY = 'aetheros_auto_memory_settings_v1';
const CURSOR_STORAGE_KEY = 'aetheros_auto_memory_cursor_v1';
const LEDGER_STORAGE_KEY = 'aetheros_auto_memory_ledger_v1';
const MAX_LEDGER_ROWS = 80;
const DEFAULT_MIN_MESSAGES = 3;
const DEFAULT_QUIET_MINUTES = 90;

export type AutoMemoryDailyMode = 'off' | 'auto' | 'manual';
export type AutoTimebookCandidateMode = 'silent' | 'off';
export type AutoMemoryTrigger = 'auto' | 'manual';

export interface AutoMemorySettings {
  dailyChatMode: AutoMemoryDailyMode;
  timebookCandidateMode: AutoTimebookCandidateMode;
  keepTrivialMoments: boolean;
  minMessagesPerDailyMemory: number;
  quietMinutesBeforeTodayArchive: number;
}

export interface AutoMemoryLedgerEntry {
  id: string;
  at: number;
  charId: string;
  charName: string;
  kind: 'daily_chat' | 'timebook_candidate';
  status: 'saved' | 'skipped' | 'failed';
  title: string;
  summary?: string;
  sourceDate?: string;
  messageCount?: number;
  targetId?: string;
  reason?: string;
  trigger: AutoMemoryTrigger;
}

interface AutoMemoryCursor {
  daily: Record<string, { at: number; messageCount: number; lastMessageId?: number }>;
  timebook: Record<string, { at: number; messageId?: number }>;
  lastAutoRunAt?: number;
}

export interface AutoMemoryPassResult {
  appendedMemoryCount: number;
  savedTimebookCount: number;
  skippedCount: number;
  failedCount: number;
  ledgerEntries: AutoMemoryLedgerEntry[];
}

export interface RunAutoMemoryPassInput {
  characters: CharacterProfile[];
  userProfile: UserProfile;
  trigger: AutoMemoryTrigger;
  includeToday?: boolean;
  settings?: AutoMemorySettings;
}

const defaultSettings: AutoMemorySettings = {
  dailyChatMode: 'off',
  timebookCandidateMode: 'silent',
  keepTrivialMoments: false,
  minMessagesPerDailyMemory: DEFAULT_MIN_MESSAGES,
  quietMinutesBeforeTodayArchive: DEFAULT_QUIET_MINUTES,
};

const defaultCursor: AutoMemoryCursor = {
  daily: {},
  timebook: {},
};

const canUseLocalStorage = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

const emitAutoMemoryUpdate = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTO_MEMORY_UPDATED_EVENT));
};

const readJson = <T>(key: string, fallback: T): T => {
  if (!canUseLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Auto-memory bookkeeping is local trust UI; it should never block chat.
  }
};

const hashText = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

const clip = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const toLocalDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isToday = (date: string): boolean => date === toLocalDate(Date.now());

const isMeaningfulMessage = (message: Message): boolean => (
  message.role !== 'system'
  && message.metadata?.hidden !== true
  && message.metadata?.proactiveHint !== true
  && !!String(message.content || '').trim()
  && !/^\[连接中断[:：]/.test(String(message.content || '').trim())
);

const messageText = (message: Message): string => {
  if (message.type === 'image') return '[图片]';
  if (message.type === 'emoji') return '[表情]';
  if ((message.type as string) === 'score_card') return '[共同完成了一张结算卡]';
  return String(message.content || '').replace(/\s+/g, ' ').trim();
};

const groupMessagesByDate = (messages: Message[]): Record<string, Message[]> => {
  const groups: Record<string, Message[]> = {};
  messages.filter(isMeaningfulMessage).forEach(message => {
    const date = toLocalDate(message.timestamp);
    groups[date] = [...(groups[date] || []), message];
  });
  return groups;
};

const timebookSignalPattern = /第一次|初次|纪念|生日|约定|说好|一起|想见|见面|礼物|照片|蛋糕|旅行|回家|睡觉|吃饭|午饭|晚饭|生病|考试|面试|难过|开心|害怕|喜欢|讨厌|想你|记得|别忘/i;

const selectTimebookMessage = (
  messages: Message[],
  keepTrivialMoments: boolean,
): Message | null => {
  const meaningful = messages.filter(isMeaningfulMessage);
  const signaled = [...meaningful].reverse().find(message => timebookSignalPattern.test(messageText(message)));
  if (signaled) return signaled;
  if (!keepTrivialMoments || meaningful.length < 5) return null;
  return [...meaningful].reverse().find(message => message.role === 'user') || meaningful[meaningful.length - 1] || null;
};

const buildTimebookCandidate = (
  char: CharacterProfile,
  date: string,
  messages: Message[],
  keepTrivialMoments: boolean,
): Anniversary | null => {
  const picked = selectTimebookMessage(messages, keepTrivialMoments);
  if (!picked) return null;
  const raw = messageText(picked).replace(/[“”"']/g, '').trim();
  const titleCore = clip(raw, 18);
  const title = titleCore ? `「${titleCore}」` : `${date.slice(5).replace('-', '月')}日的片刻`;
  const id = `auto-timebook-${char.id}-${date}-${hashText(`${picked.id || ''}:${raw}`)}`;

  return {
    id,
    title,
    date,
    charId: char.id,
  };
};

const loadCursor = (): AutoMemoryCursor => ({
  ...defaultCursor,
  ...readJson<Partial<AutoMemoryCursor>>(CURSOR_STORAGE_KEY, {}),
  daily: {
    ...defaultCursor.daily,
    ...(readJson<Partial<AutoMemoryCursor>>(CURSOR_STORAGE_KEY, {}).daily || {}),
  },
  timebook: {
    ...defaultCursor.timebook,
    ...(readJson<Partial<AutoMemoryCursor>>(CURSOR_STORAGE_KEY, {}).timebook || {}),
  },
});

const saveCursor = (cursor: AutoMemoryCursor): void => {
  writeJson(CURSOR_STORAGE_KEY, cursor);
};

const pushLedger = (entries: AutoMemoryLedgerEntry[]): void => {
  if (entries.length === 0) return;
  const next = [...entries, ...loadAutoMemoryLedger()].slice(0, MAX_LEDGER_ROWS);
  writeJson(LEDGER_STORAGE_KEY, next);
  emitAutoMemoryUpdate();
};

export const loadAutoMemorySettings = (): AutoMemorySettings => {
  const stored = readJson<Partial<AutoMemorySettings>>(SETTINGS_STORAGE_KEY, {});
  return {
    ...defaultSettings,
    ...stored,
    dailyChatMode: 'off',
    keepTrivialMoments: false,
  };
};

export const saveAutoMemorySettings = (
  updates: Partial<AutoMemorySettings>,
): AutoMemorySettings => {
  const next = {
    ...loadAutoMemorySettings(),
    ...updates,
  };
  writeJson(SETTINGS_STORAGE_KEY, next);
  emitAutoMemoryUpdate();
  return next;
};

export const loadAutoMemoryLedger = (): AutoMemoryLedgerEntry[] => (
  readJson<AutoMemoryLedgerEntry[]>(LEDGER_STORAGE_KEY, [])
);

export const clearAutoMemoryLedger = (): void => {
  writeJson(LEDGER_STORAGE_KEY, []);
  emitAutoMemoryUpdate();
};

export const runAutoMemoryPass = async ({
  characters,
  userProfile,
  trigger,
  includeToday = false,
  settings = loadAutoMemorySettings(),
}: RunAutoMemoryPassInput): Promise<AutoMemoryPassResult> => {
  const cursor = loadCursor();
  const ledgerEntries: AutoMemoryLedgerEntry[] = [];
  const existingAnniversaries = await DB.getAllAnniversaries();
  let appendedMemoryCount = 0;
  let savedTimebookCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const char of characters) {
    try {
      const allMessages = await DB.getMessagesByCharId(char.id);
      const groups = groupMessagesByDate(allMessages);
      const dates = Object.keys(groups).sort();

      for (const date of dates) {
        const dayMessages = groups[date];
        const latestMessage = dayMessages[dayMessages.length - 1];
        const latestMessageAgeMinutes = latestMessage
          ? (Date.now() - latestMessage.timestamp) / 60000
          : Number.POSITIVE_INFINITY;
        const isCurrentDay = isToday(date);
        const canArchiveToday = includeToday || latestMessageAgeMinutes >= settings.quietMinutesBeforeTodayArchive;

        if (settings.timebookCandidateMode === 'silent') {
          const candidate = buildTimebookCandidate(char, date, dayMessages, settings.keepTrivialMoments);
          const timebookKey = candidate ? candidate.id : `${char.id}:${date}:none`;
          const hasSameDateMemory = existingAnniversaries.some(item => item.charId === char.id && item.date === date);
          if (candidate && !cursor.timebook[timebookKey] && !hasSameDateMemory && (!isCurrentDay || canArchiveToday)) {
            await DB.saveAnniversary(candidate);
            cursor.timebook[timebookKey] = {
              at: Date.now(),
              messageId: selectTimebookMessage(dayMessages, settings.keepTrivialMoments)?.id,
            };
            existingAnniversaries.push(candidate);
            savedTimebookCount += 1;
            ledgerEntries.push({
              id: `ledger-${candidate.id}`,
              at: Date.now(),
              charId: char.id,
              charName: char.name,
              kind: 'timebook_candidate',
              status: 'saved',
              title: candidate.title,
              sourceDate: date,
              messageCount: dayMessages.length,
              targetId: candidate.id,
              trigger,
            });
          }
        }
      }
    } catch (error) {
      failedCount += 1;
      ledgerEntries.push({
        id: `ledger-auto-failed-${char.id}-${Date.now()}`,
        at: Date.now(),
        charId: char.id,
        charName: char.name,
        kind: 'timebook_candidate',
        status: 'failed',
        title: '沉淀失败',
        reason: error instanceof Error ? error.message : 'unknown',
        trigger,
      });
    }
  }

  if (trigger === 'auto') {
    cursor.lastAutoRunAt = Date.now();
  }
  saveCursor(cursor);
  pushLedger(ledgerEntries);

  return {
    appendedMemoryCount,
    savedTimebookCount,
    skippedCount,
    failedCount,
    ledgerEntries,
  };
};
