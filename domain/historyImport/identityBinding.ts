import type { HistoryScope } from './types';

export const HISTORY_IDENTITY_BINDING_VERSION = 1 as const;
export const HISTORY_IDENTITY_PLACEHOLDER_CHOICE = '__history_identity_placeholder__';

export type HistoryIdentityBindingKind = 'existing' | 'placeholder';

export interface HistoryMaskBindingCandidate {
    id: string;
    label: string;
    progressBundleId: string;
}

export interface HistoryCharacterBindingCandidate {
    id: string;
    label: string;
}

export interface HistoryMaskBindingTarget extends HistoryMaskBindingCandidate {
    kind: HistoryIdentityBindingKind;
}

export interface HistoryCharacterBindingTarget extends HistoryCharacterBindingCandidate {
    kind: HistoryIdentityBindingKind;
}

export interface HistoryIdentityBindingDraft {
    schemaVersion: typeof HISTORY_IDENTITY_BINDING_VERSION;
    id: string;
    draftSeed: string;
    mask: HistoryMaskBindingTarget;
    character: HistoryCharacterBindingTarget;
    scope: HistoryScope;
    previewReady: true;
    persistence: 'memory_only';
    productionWriteAllowed: false;
}

export interface BuildHistoryIdentityBindingDraftInput {
    draftSeed: string;
    mask?: HistoryMaskBindingCandidate | null;
    character?: HistoryCharacterBindingCandidate | null;
    placeholderMaskLabel?: string;
    placeholderCharacterLabel?: string;
}

const requireId = (value: string, field: string): string => {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`${field} requires a stable id`);
    }
    return normalized;
};

export const normalizeHistoryIdentityDraftSeed = (value: string): string => {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

    if (!normalized) {
        throw new Error('history identity draft requires a stable seed');
    }
    return normalized;
};

const placeholderIdsFor = (seed: string) => ({
    maskId: `history-placeholder-mask-${seed}`,
    progressBundleId: `history-placeholder-progress-${seed}`,
    charId: `history-placeholder-char-${seed}`,
});

export const buildHistoryIdentityBindingDraft = (
    input: BuildHistoryIdentityBindingDraftInput,
): HistoryIdentityBindingDraft => {
    const draftSeed = normalizeHistoryIdentityDraftSeed(input.draftSeed);
    const placeholderIds = placeholderIdsFor(draftSeed);

    const mask: HistoryMaskBindingTarget = input.mask
        ? {
            kind: 'existing',
            id: requireId(input.mask.id, 'mask'),
            label: input.mask.label.trim() || '未命名面具',
            progressBundleId: requireId(input.mask.progressBundleId, 'progress bundle'),
        }
        : {
            kind: 'placeholder',
            id: placeholderIds.maskId,
            label: input.placeholderMaskLabel?.trim() || '旧日面具',
            progressBundleId: placeholderIds.progressBundleId,
        };

    const character: HistoryCharacterBindingTarget = input.character
        ? {
            kind: 'existing',
            id: requireId(input.character.id, 'character'),
            label: input.character.label.trim() || '未命名角色',
        }
        : {
            kind: 'placeholder',
            id: placeholderIds.charId,
            label: input.placeholderCharacterLabel?.trim() || '旧日角色',
        };

    return {
        schemaVersion: HISTORY_IDENTITY_BINDING_VERSION,
        id: `history-identity-draft-${draftSeed}`,
        draftSeed,
        mask,
        character,
        scope: {
            progressBundleId: mask.progressBundleId,
            personaMaskId: mask.id,
            charId: character.id,
        },
        previewReady: true,
        persistence: 'memory_only',
        productionWriteAllowed: false,
    };
};
