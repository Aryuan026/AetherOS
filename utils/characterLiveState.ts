import type {
    CharacterBuff,
    CharacterLivePresence,
    CharacterProfile,
    Message,
} from '../types.ts';
import { isHistoricalContextMessage } from './messageContext.ts';

export const CHAT_MOOD_MAX_GRAPHEMES = 8;
export const CHAT_PRESENCE_MAX_GRAPHEMES = 14;
export const DEFAULT_MOOD_TTL_MINUTES = 360;
export const DEFAULT_PRESENCE_TTL_MINUTES = 120;
export const DEFAULT_MOOD_TURNS = 4;
export const DEFAULT_PRESENCE_TURNS = 3;

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
};

export const countVisibleGraphemes = (value: string): number => {
    const text = value.trim();
    if (!text) return 0;
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const Segmenter = (Intl as unknown as {
            Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => {
                segment(value: string): Iterable<unknown>;
            };
        }).Segmenter;
        const segmenter = new Segmenter('zh-CN', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text)).length;
    }
    return Array.from(text).length;
};

export const normalizeShortLiveText = (
    value: unknown,
    maxGraphemes: number,
): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const text = value.replace(/\s+/gu, ' ').trim();
    if (!text || countVisibleGraphemes(text) > maxGraphemes) return undefined;
    return text;
};

const hasValidLifetime = (
    state: Pick<CharacterBuff, 'expiresAt' | 'remainingTurns'>,
    now: number,
): boolean => (
    typeof state.expiresAt === 'number'
    && Number.isFinite(state.expiresAt)
    && state.expiresAt > now
    && typeof state.remainingTurns === 'number'
    && Number.isFinite(state.remainingTurns)
    && state.remainingTurns > 0
);

export const isActiveCharacterBuff = (
    buff: CharacterBuff,
    now = Date.now(),
): boolean => (
    Boolean(normalizeShortLiveText(buff.label, CHAT_MOOD_MAX_GRAPHEMES))
    && hasValidLifetime(buff, now)
);

export const isActiveCharacterPresence = (
    presence: CharacterLivePresence | undefined,
    now = Date.now(),
): presence is CharacterLivePresence => (
    Boolean(
        presence
        && normalizeShortLiveText(presence.text, CHAT_PRESENCE_MAX_GRAPHEMES)
        && presence.stateKey?.trim()
        && hasValidLifetime(presence, now),
    )
);

export const activeCharacterBuffs = (
    buffs: CharacterBuff[] | undefined,
    now = Date.now(),
): CharacterBuff[] => (buffs || []).filter(buff => isActiveCharacterBuff(buff, now));

export interface LiveStateCandidate {
    text?: string;
    stateKey?: string;
    ttlMinutes?: number;
    remainingTurns?: number;
}

export const createCharacterLivePresence = (
    candidate: LiveStateCandidate,
    options: {
        now?: number;
        source: CharacterLivePresence['source'];
        previous?: CharacterLivePresence;
    },
): CharacterLivePresence | undefined => {
    const now = options.now ?? Date.now();
    const text = normalizeShortLiveText(candidate.text, CHAT_PRESENCE_MAX_GRAPHEMES);
    if (!text) return undefined;
    const stateKey = candidate.stateKey?.trim() || text;
    const sameState = options.previous?.stateKey === stateKey || options.previous?.text === text;
    const ttlMinutes = clamp(candidate.ttlMinutes, 15, 720, DEFAULT_PRESENCE_TTL_MINUTES);
    const remainingTurns = clamp(candidate.remainingTurns, 1, 6, DEFAULT_PRESENCE_TURNS);
    return {
        text,
        stateKey,
        updatedAt: now,
        expiresAt: now + ttlMinutes * 60_000,
        remainingTurns: sameState
            ? Math.max(options.previous?.remainingTurns || 0, remainingTurns)
            : remainingTurns,
        source: options.source,
    };
};

export const createCharacterMoodBuff = (
    candidate: Partial<CharacterBuff> & LiveStateCandidate,
    options: {
        now?: number;
        source: NonNullable<CharacterBuff['source']>;
        previous?: CharacterBuff;
        index?: number;
    },
): CharacterBuff | undefined => {
    const now = options.now ?? Date.now();
    const label = normalizeShortLiveText(candidate.label || candidate.text, CHAT_MOOD_MAX_GRAPHEMES);
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!label || !name) return undefined;
    const stateKey = candidate.stateKey?.trim() || name;
    const sameState = options.previous?.stateKey === stateKey || options.previous?.name === name;
    const ttlMinutes = clamp(candidate.ttlMinutes, 15, 720, DEFAULT_MOOD_TTL_MINUTES);
    const remainingTurns = clamp(candidate.remainingTurns, 1, 6, DEFAULT_MOOD_TURNS);
    const intensity = clamp(candidate.intensity, 1, 3, 2) as 1 | 2 | 3;
    return {
        id: options.previous?.id || (
            typeof candidate.id === 'string' && candidate.id.trim()
                ? candidate.id.trim()
                : `buff_${now}_${options.index || 0}`
        ),
        name,
        label,
        intensity,
        emoji: typeof candidate.emoji === 'string' ? candidate.emoji.trim() || undefined : undefined,
        color: typeof candidate.color === 'string' ? candidate.color.trim() || undefined : undefined,
        description: typeof candidate.description === 'string' ? candidate.description.trim() || undefined : undefined,
        updatedAt: now,
        expiresAt: now + ttlMinutes * 60_000,
        remainingTurns: sameState
            ? Math.max(options.previous?.remainingTurns || 0, remainingTurns)
            : remainingTurns,
        stateKey,
        source: options.source,
    };
};

export const advanceCharacterLiveState = (
    character: CharacterProfile,
    now = Date.now(),
): Pick<CharacterProfile, 'activeBuffs' | 'chatPresenceStatus' | 'buffInjection'> => {
    const activeBuffs = activeCharacterBuffs(character.activeBuffs, now)
        .map(buff => ({ ...buff, remainingTurns: (buff.remainingTurns || 0) - 1 }))
        .filter(buff => isActiveCharacterBuff(buff, now));
    const currentPresence = isActiveCharacterPresence(character.chatPresenceStatus, now)
        ? {
            ...character.chatPresenceStatus,
            remainingTurns: character.chatPresenceStatus.remainingTurns - 1,
        }
        : undefined;
    const chatPresenceStatus = isActiveCharacterPresence(currentPresence, now)
        ? currentPresence
        : undefined;
    return {
        activeBuffs,
        chatPresenceStatus,
        buffInjection: activeBuffs.length > 0 ? character.buffInjection || '' : '',
    };
};

const liveDialogueMessages = (messages: Message[]): Message[] => messages.filter(message => (
    !isHistoricalContextMessage(message)
    && message.metadata?.temporalClass !== 'historical'
    && message.metadata?.source !== 'starter'
    && (message.role === 'user' || message.role === 'assistant')
));

const significantStatePattern = /(?:受伤|生病|不舒服|发烧|疼|手术|失眠|崩溃|吵架|生气|难过|哭|约定|明天|见面|出发|回家|到家|加班|下班|刚结束)/u;

export const shouldEvaluateCharacterLiveState = (
    character: CharacterProfile,
    messages: Message[],
    now = Date.now(),
): boolean => {
    const live = liveDialogueMessages(messages);
    if (live.length < 4) return false;
    const last = live[live.length - 1];
    const cursor = character.chatLiveStateEvaluation;
    if (!cursor) return true;
    if (
        cursor.lastEvaluatedMessageId === last.id
        || (
            cursor.lastEvaluatedMessageTimestamp
            && cursor.lastEvaluatedMessageTimestamp >= last.timestamp
        )
    ) return false;

    const unseen = live.filter(message => (
        message.timestamp > (cursor.lastEvaluatedMessageTimestamp || 0)
    ));
    if (unseen.length >= 6) return true;
    if (unseen.length >= 2 && now - cursor.lastEvaluatedAt >= 6 * 60 * 60_000) return true;
    return unseen.length >= 2 && unseen.some(message => (
        message.role === 'user' && significantStatePattern.test(message.content)
    ));
};

export const createInitialCharacterPresence = (
    text: string,
    source: CharacterLivePresence['source'],
    now = Date.now(),
): CharacterLivePresence | undefined => createCharacterLivePresence(
    {
        text,
        stateKey: `initial:${text}`,
        ttlMinutes: 180,
        remainingTurns: 3,
    },
    { now, source },
);
