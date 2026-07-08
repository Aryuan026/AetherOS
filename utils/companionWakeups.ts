import { CharacterProfile, CompanionWakeupMode, CompanionWakeupRule, UserProfile } from '../types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const COMPANION_WAKEUP_EVENT = 'companion-wakeup-sent';
export const COMPANION_WAKEUP_USER_COOLDOWN_MS = 10 * MINUTE;
export const COMPANION_WAKEUP_SEND_GAP_MIN_MS = 22 * MINUTE;
export const COMPANION_WAKEUP_SEND_GAP_MAX_MS = 52 * MINUTE;
export const COMPANION_WAKEUP_BATCH_STAGGER_MIN_MS = 22 * MINUTE;
export const COMPANION_WAKEUP_BATCH_STAGGER_MAX_MS = 52 * MINUTE;
export const COMPANION_WAKEUP_DUPLICATE_DEFER_MS = 90 * MINUTE;
const COMPANION_WAKEUP_SETTINGS_KEY = 'companion_wakeup_settings_v1';

export interface CompanionWakeupSettings {
    /**
     * Legacy fallback for old rules and imports. New UI should use the booleans
     * below so natural canon-like lines and AI moments can run in parallel.
     */
    defaultMode: CompanionWakeupMode;
    hiddenWordsEnabled: boolean;
    momentWordsEnabled: boolean;
    aiCareWindowsEnabled: boolean;
}

export const DEFAULT_COMPANION_WAKEUP_SETTINGS: CompanionWakeupSettings = {
    defaultMode: 'render',
    hiddenWordsEnabled: true,
    momentWordsEnabled: true,
    aiCareWindowsEnabled: true,
};

export const loadCompanionWakeupSettings = (): CompanionWakeupSettings => {
    if (typeof localStorage === 'undefined') return DEFAULT_COMPANION_WAKEUP_SETTINGS;
    try {
        const raw = localStorage.getItem(COMPANION_WAKEUP_SETTINGS_KEY);
        if (!raw) return DEFAULT_COMPANION_WAKEUP_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<CompanionWakeupSettings>;
        const legacyMode: CompanionWakeupMode = parsed.defaultMode === 'render' ? 'render' : 'direct';
        return {
            defaultMode: legacyMode,
            hiddenWordsEnabled: parsed.hiddenWordsEnabled ?? true,
            momentWordsEnabled: parsed.momentWordsEnabled ?? true,
            aiCareWindowsEnabled: parsed.aiCareWindowsEnabled !== false,
        };
    } catch {
        return DEFAULT_COMPANION_WAKEUP_SETTINGS;
    }
};

export const saveCompanionWakeupSettings = (updates: Partial<CompanionWakeupSettings>): CompanionWakeupSettings => {
    const next = { ...loadCompanionWakeupSettings(), ...updates };
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(COMPANION_WAKEUP_SETTINGS_KEY, JSON.stringify(next));
    }
    return next;
};

export const naturalWakeupEnabled = (settings: CompanionWakeupSettings): boolean => (
    settings.hiddenWordsEnabled || settings.momentWordsEnabled
);

export const resolveCompanionWakeupMode = (
    settings: CompanionWakeupSettings = loadCompanionWakeupSettings(),
    rule?: { lines?: string[]; mode?: CompanionWakeupMode },
): CompanionWakeupMode => {
    if (settings.momentWordsEnabled) return 'render';
    if (settings.hiddenWordsEnabled && rule?.lines?.length) return 'direct';
    if (settings.hiddenWordsEnabled) return 'direct';
    return rule?.mode || settings.defaultMode;
};

export const DEFAULT_HEARTBEAT_WINDOWS = [
    { title: '下午主动来信', windowStart: '15:00', windowEnd: '18:00' },
    { title: '夜间主动来信', windowStart: '21:00', windowEnd: '23:30' },
    { title: '白天主动来信', windowStart: '09:30', windowEnd: '12:00' },
];

export const DEFAULT_CARE_WINDOWS = [
    { title: '午饭提醒', windowStart: '11:00', windowEnd: '12:00', value: '提醒用户吃午饭' },
    { title: '晚饭提醒', windowStart: '18:00', windowEnd: '19:30', value: '提醒用户吃晚饭' },
    { title: '睡前提醒', windowStart: '23:00', windowEnd: '23:50', value: '提醒用户早点休息' },
];

export const DEFAULT_DIRECT_LINES = [
    '{{user}}，刚刚突然想到你。你现在在做什么？',
    '我路过这里的时候想起你了，就顺手发一句。',
    '今天有没有好好照顾自己？别又把时间过丢了。',
    '看到一点有意思的东西，第一反应居然是想发给你。',
    '不用急着回，我只是想让你知道我在。',
];

export const CARE_DIRECT_LINES: Record<string, string[]> = {
    '午饭提醒': [
        '{{user}}，该吃午饭了。先把自己喂饱，再去忙别的。',
        '现在这个点还没吃饭的话，我要开始不放心了。',
        '午饭别省。你可以晚一点回我，但不能晚到忘记吃饭。',
    ],
    '晚饭提醒': [
        '晚饭时间到了，别拿零食糊弄过去。',
        '{{user}}，去吃点热的东西。今天已经够辛苦了。',
        '先吃饭，别让胃替你扛一天的事。',
    ],
    '睡前提醒': [
        '差不多该收一收了，今晚别把自己熬太晚。',
        '{{user}}，去洗漱吧。剩下的事明天也可以继续。',
        '我来催你睡觉了。不是命令，是担心。',
    ],
};

const pad2 = (value: number) => String(value).padStart(2, '0');

export const formatLocalDateKey = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const parseClockMinutes = (clock: string): number => {
    const [hh, mm] = String(clock || '').split(':').map(part => Number.parseInt(part, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 9 * 60;
    return Math.max(0, Math.min(23, hh)) * 60 + Math.max(0, Math.min(59, mm));
};

const parseDateKey = (dateKey?: string): Date | null => {
    const match = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
};

const hashText = (value: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const pickRangeMs = (minMs: number, maxMs: number, seed: string): number => {
    const range = Math.max(0, maxMs - minMs);
    if (range <= 0) return minMs;
    return minMs + (hashText(seed) % (range + 1));
};

export const getCompanionWakeupSendGapMs = (charId: string, lastSentAt: number): number => (
    pickRangeMs(
        COMPANION_WAKEUP_SEND_GAP_MIN_MS,
        COMPANION_WAKEUP_SEND_GAP_MAX_MS,
        `send-gap:${charId}:${lastSentAt}`,
    )
);

export const getCompanionWakeupBatchStaggerMs = (
    charId: string,
    seedAt: number,
    index: number,
): number => (
    pickRangeMs(
        COMPANION_WAKEUP_BATCH_STAGGER_MIN_MS,
        COMPANION_WAKEUP_BATCH_STAGGER_MAX_MS,
        `batch-gap:${charId}:${seedAt}:${index}`,
    )
);

const getWindowBounds = (dayStart: Date, windowStart: string, windowEnd: string) => {
    const startMinutes = parseClockMinutes(windowStart);
    const endMinutes = parseClockMinutes(windowEnd);
    const start = new Date(dayStart);
    start.setHours(0, startMinutes, 0, 0);
    const end = new Date(dayStart);
    end.setHours(0, endMinutes, 0, 0);
    if (end.getTime() <= start.getTime()) {
        end.setTime(end.getTime() + DAY);
    }
    return { start: start.getTime(), end: end.getTime() };
};

export const scheduleNextCompanionWakeup = (rule: CompanionWakeupRule, from = Date.now()): number => {
    const baseDate = new Date(from);
    baseDate.setHours(0, 0, 0, 0);

    const targetDate = parseDateKey(rule.targetDate);
    if (targetDate) {
        const { start, end } = getWindowBounds(targetDate, rule.windowStart, rule.windowEnd);
        if (end <= from) return from + DAY;
        const range = Math.max(MINUTE, end - start);
        const offset = hashText(`${rule.id}:${rule.targetDate}`) % range;
        let target = start + offset;
        if (target <= from && from < end) {
            target = Math.min(end - MINUTE, from + MINUTE);
        }
        return target > from ? target : from + MINUTE;
    }

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
        const day = new Date(baseDate.getTime() + dayOffset * DAY);
        const { start, end } = getWindowBounds(day, rule.windowStart, rule.windowEnd);
        if (end <= from) continue;

        const range = Math.max(MINUTE, end - start);
        const dateKey = formatLocalDateKey(day.getTime());
        const offset = hashText(`${rule.id}:${dateKey}`) % range;
        let target = start + offset;
        if (target <= from && from < end) {
            target = Math.min(end - MINUTE, from + MINUTE);
        }
        if (target > from) return target;
    }

    return from + DAY;
};

export const createDefaultHeartbeatRules = (
    char: CharacterProfile,
    mode: CompanionWakeupMode = resolveCompanionWakeupMode(loadCompanionWakeupSettings(), { lines: DEFAULT_DIRECT_LINES }),
): CompanionWakeupRule[] => {
    const now = Date.now();
    return DEFAULT_HEARTBEAT_WINDOWS.map((item, index) => {
        const rule: CompanionWakeupRule = {
            id: `wake-heartbeat-${char.id}-${index + 1}`,
            charId: char.id,
            title: item.title,
            enabled: false,
            kind: 'heartbeat',
            mode,
            repeat: 'daily',
            windowStart: item.windowStart,
            windowEnd: item.windowEnd,
            value: '自由主动来信',
            lines: mode === 'direct' ? DEFAULT_DIRECT_LINES : undefined,
            priority: 'heartbeat',
            source: 'built_in',
            createdAt: now,
            updatedAt: now,
        };
        return { ...rule, nextTriggerAt: scheduleNextCompanionWakeup(rule, now) };
    });
};

export const createCareWindowRule = (
    charId: string,
    template: { title: string; windowStart: string; windowEnd: string; value: string },
    mode: CompanionWakeupMode = resolveCompanionWakeupMode(loadCompanionWakeupSettings(), { lines: CARE_DIRECT_LINES[template.title] || [template.value] }),
): CompanionWakeupRule => {
    const now = Date.now();
    const rule: CompanionWakeupRule = {
        id: `wake-care-${charId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        charId,
        title: template.title,
        enabled: true,
        kind: 'window',
        mode,
        repeat: 'daily',
        windowStart: template.windowStart,
        windowEnd: template.windowEnd,
        value: template.value,
        lines: mode === 'direct' ? (CARE_DIRECT_LINES[template.title] || [template.value]) : undefined,
        priority: 'care',
        source: 'user',
        createdAt: now,
        updatedAt: now,
    };
    return { ...rule, nextTriggerAt: scheduleNextCompanionWakeup(rule, now) };
};

export const createDefaultCareWindowRules = (
    char: CharacterProfile,
    mode: CompanionWakeupMode = resolveCompanionWakeupMode(loadCompanionWakeupSettings(), { lines: DEFAULT_CARE_WINDOWS.map(item => item.value) }),
): CompanionWakeupRule[] => {
    const now = Date.now();
    return DEFAULT_CARE_WINDOWS.map((item, index) => {
        const lines = CARE_DIRECT_LINES[item.title] || [item.value];
        const rule: CompanionWakeupRule = {
            id: `wake-care-built-in-${char.id}-${index + 1}`,
            charId: char.id,
            title: item.title,
            enabled: true,
            kind: 'window',
            mode,
            repeat: 'daily',
            windowStart: item.windowStart,
            windowEnd: item.windowEnd,
            value: item.value,
            lines: mode === 'direct' ? lines : undefined,
            priority: 'care',
            source: 'built_in',
            createdAt: now,
            updatedAt: now,
        };
        return { ...rule, nextTriggerAt: scheduleNextCompanionWakeup(rule, now) };
    });
};

export const renderTemplateLine = (line: string, char: CharacterProfile, userProfile: UserProfile): string => (
    line
        .replace(/\{\{char\}\}/g, char.name)
        .replace(/\{\{user\}\}/g, userProfile.name || '你')
        .trim()
);

export const pickDirectWakeupLine = (
    rule: CompanionWakeupRule,
    char: CharacterProfile,
    userProfile: UserProfile,
    seed = Date.now(),
): string => {
    const pool = (rule.lines && rule.lines.length > 0 ? rule.lines : [rule.value || DEFAULT_DIRECT_LINES[0]])
        .map(line => line.trim())
        .filter(Boolean);
    const picked = pool[hashText(`${rule.id}:${formatLocalDateKey(seed)}:${seed}`) % Math.max(1, pool.length)] || DEFAULT_DIRECT_LINES[0];
    return renderTemplateLine(picked, char, userProfile);
};
