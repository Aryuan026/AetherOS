import type { CharacterProfile } from '../types.ts';

export type ChatHeaderStatusKind = 'mood' | 'signature' | 'online';

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
 * Current emotion wins while it exists; the durable profile signature is the
 * quiet fallback, and online is only a presentation fallback.
 */
export const resolveChatHeaderStatus = (
    character: Pick<CharacterProfile, 'activeBuffs' | 'chatSignature'>,
): ChatHeaderStatusProjection => {
    const strongestMood = (character.activeBuffs || [])
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

    const signature = character.chatSignature?.trim();
    if (signature) return { kind: 'signature', text: signature };
    return { kind: 'online', text: '在线' };
};
