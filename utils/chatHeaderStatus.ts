import type { CharacterProfile } from '../types.ts';
import {
    activeCharacterBuffs,
    isActiveCharacterPresence,
} from './characterLiveState.ts';

export type ChatHeaderStatusKind = 'mood' | 'presence' | 'none';

export interface ChatHeaderStatusProjection {
    kind: ChatHeaderStatusKind;
    text: string;
}

const normalizeIntensity = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The Chat header is a projection, not another character-state writer.
 * Current emotion wins while it exists, followed by a short-lived presence.
 * Durable signatures and fake online labels are intentionally not projected:
 * an expired transient state collapses the header back to the character name.
 */
export const resolveChatHeaderStatus = (
    character: Pick<CharacterProfile, 'activeBuffs' | 'chatPresenceStatus'>,
    now = Date.now(),
): ChatHeaderStatusProjection => {
    const strongestMood = activeCharacterBuffs(character.activeBuffs, now)
        .map((buff, index) => ({
            buff,
            index,
            label: typeof buff?.label === 'string' ? buff.label.trim() : '',
        }))
        .filter(item => item.label)
        .sort((left, right) => (
            normalizeIntensity(right.buff.intensity) - normalizeIntensity(left.buff.intensity)
            || left.index - right.index
        ))[0];

    if (strongestMood) {
        const emoji = typeof strongestMood.buff.emoji === 'string'
            ? strongestMood.buff.emoji.trim()
            : '';
        return {
            kind: 'mood',
            text: `心情 · ${emoji ? `${emoji} ` : ''}${strongestMood.label}`,
        };
    }

    if (isActiveCharacterPresence(character.chatPresenceStatus, now)) {
        return {
            kind: 'presence',
            text: `近况 · ${character.chatPresenceStatus.text}`,
        };
    }
    return { kind: 'none', text: '' };
};
