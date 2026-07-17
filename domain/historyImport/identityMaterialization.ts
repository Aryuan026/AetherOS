import type {
    CharacterProfile,
    UserPersonaMask,
    UserProfile,
    UserProgressBundle,
} from '../../types';
import type { HistoryReviewWorkspaceIdentity } from './reviewWorkspace';
import type { HistoryScope } from './types';
import {
    createProgressBundleForMask,
    normalizeUserPersonaProfile,
} from '../../utils/userPersonaMasks.ts';

const LEGACY_PLACEHOLDER_LABELS = new Set([
    '暂不绑定面具',
    '暂不绑定角色',
]);

const usableLabel = (value: string, fallback: string): string => {
    const normalized = value.trim();
    return !normalized || LEGACY_PLACEHOLDER_LABELS.has(normalized) ? fallback : normalized;
};

const generateHistoryAvatar = (seed: string): string => {
    const label = seed.trim() || '角';
    const colors = ['8b5cf6', 'ec4899', '6366f1', '0ea5e9', '14b8a6', 'f59e0b'];
    const color = colors[(label.codePointAt(0) || 0) % colors.length];
    const letter = encodeURIComponent(label.slice(0, 1));
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="30" fill="%23${color}"/><text x="50" y="54" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="48" font-weight="700" fill="white">${letter}</text></svg>`;
};

export interface HistoryIdentityMaterializationSource {
    scope: HistoryScope;
    identity: HistoryReviewWorkspaceIdentity;
}

export interface HistoryIdentityMaterializationPlan {
    character: CharacterProfile;
    createCharacter: boolean;
    createMask: boolean;
    profilePatch: Pick<UserProfile, 'personaMasks' | 'progressBundles'>;
    activationPatch: Pick<UserProfile, 'activePersonaMaskId' | 'activeProgressBundleId'>;
}

export const buildHistoryIdentityMaterializationPlan = (input: {
    source: HistoryIdentityMaterializationSource;
    userProfile: UserProfile;
    characters: CharacterProfile[];
    now?: number;
}): HistoryIdentityMaterializationPlan => {
    const now = input.now ?? Date.now();
    const profile = normalizeUserPersonaProfile(input.userProfile);
    const masks = profile.personaMasks || [];
    const bundles = profile.progressBundles || [];
    const existingMask = masks.find(mask => mask.id === input.source.scope.personaMaskId);
    const existingCharacter = input.characters.find(character => (
        character.id === input.source.scope.charId
    ));
    const maskLabel = usableLabel(input.source.identity.maskLabel, '旧日面具');
    const characterName = usableLabel(input.source.identity.characterLabel, '旧日角色');

    const targetMask: UserPersonaMask = existingMask
        ? {
            ...existingMask,
            linkedCharacterIds: [...new Set([
                ...(existingMask.linkedCharacterIds || []),
                input.source.scope.charId,
            ])],
            lastUsedAt: now,
            updatedAt: now,
        }
        : {
            id: input.source.scope.personaMaskId,
            label: maskLabel,
            name: profile.name || '我',
            avatar: profile.avatar,
            avatarFramePresetId: profile.avatarFramePresetId,
            callPortrait: profile.callPortrait,
            bio: profile.bio || '',
            deepspaceIdentityMode: profile.deepspaceIdentityMode,
            deepspaceIdentityNote: profile.deepspaceIdentityNote || '',
            linkedCharacterIds: [input.source.scope.charId],
            progressBundleId: input.source.scope.progressBundleId,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
        };

    const existingBundle = bundles.find(bundle => bundle.id === input.source.scope.progressBundleId);
    const targetBundle: UserProgressBundle = existingBundle
        ? {
            ...existingBundle,
            maskId: targetMask.id,
            updatedAt: now,
        }
        : createProgressBundleForMask(targetMask, `${maskLabel}进度套组`);

    const nextMasks = existingMask
        ? masks.map(mask => mask.id === targetMask.id ? targetMask : mask)
        : [...masks, targetMask];
    const nextBundles = existingBundle
        ? bundles.map(bundle => bundle.id === targetBundle.id ? targetBundle : bundle)
        : [...bundles, targetBundle];

    const character: CharacterProfile = existingCharacter || {
        id: input.source.scope.charId,
        name: characterName,
        avatar: generateHistoryAvatar(characterName),
        description: '从旧日聊天记录建立，可以在角色设置里继续完善。',
        systemPrompt: '',
        chatSignature: '旧日记录已接回。',
        chatSignatureAiEditable: true,
        memories: [],
        refinedMemories: {},
        activeMemoryMonths: [],
        contextLimit: 500,
    };

    return {
        character,
        createCharacter: !existingCharacter,
        createMask: !existingMask,
        profilePatch: {
            personaMasks: nextMasks,
            progressBundles: nextBundles,
        },
        activationPatch: {
            activePersonaMaskId: targetMask.id,
            activeProgressBundleId: targetMask.progressBundleId,
        },
    };
};
