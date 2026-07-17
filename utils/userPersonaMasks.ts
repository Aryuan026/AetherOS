import type {
    UserPersonaMask,
    UserProfile,
    UserProgressBundle,
    UserProgressSurface,
    UserProgressSurfacePolicy,
} from '../types';
import { DEFAULT_DEEPSPACE_USER_IDENTITY_MODE, resolveDeepSpaceIdentityMode } from './deepspaceIdentity.ts';

export const DEFAULT_USER_PERSONA_MASK_ID = 'mask-primary';
export const DEFAULT_USER_PROGRESS_BUNDLE_ID = 'progress-primary';

const MASK_BOUND_FIELDS = [
    'name',
    'avatar',
    'avatarFramePresetId',
    'callPortrait',
    'bio',
    'deepspaceIdentityMode',
    'deepspaceIdentityNote',
] as const;

type MaskBoundField = typeof MASK_BOUND_FIELDS[number];

const DEFAULT_SURFACE_POLICY: Partial<Record<UserProgressSurface, UserProgressSurfacePolicy>> = {
    chat: 'mask_scoped',
    group_chat: 'mask_scoped',
    call: 'mask_scoped',
    date: 'mask_scoped',
    social: 'mask_scoped',
    novel: 'mask_scoped',
    guidebook: 'mask_scoped',
    special_moments: 'mask_scoped',
    timebook: 'mask_scoped',
    game: 'hold',
    lifesim: 'hold',
    worldbook: 'shared',
    study: 'shared',
    settings: 'shared',
};

const hasOwn = (source: object, key: string): boolean => (
    Object.prototype.hasOwnProperty.call(source, key)
);

const sanitizeId = (value: string): string => (
    value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
);

const generateFallbackAvatar = (seed: string): string => {
    const name = seed.trim() || 'User';
    const colors = ['FF9AA2', 'FFB7B2', 'FFDAC1', 'E2F0CB', 'B5EAD7', 'C7CEEA', 'e2e8f0', 'fcd34d', 'fca5a5'];
    const color = colors[(name.charCodeAt(0) || 0) % colors.length];
    const letter = encodeURIComponent(name.charAt(0).toUpperCase() || 'U');
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23${color}"/><text x="50" y="55" font-family="sans-serif" font-weight="bold" font-size="50" text-anchor="middle" dy=".3em" fill="white" opacity="0.9">${letter}</text></svg>`;
};

const normalizeMask = (
    raw: Partial<UserPersonaMask> | null | undefined,
    fallback: UserProfile,
    index: number,
): UserPersonaMask => {
    const now = Date.now();
    const name = String(raw?.name || fallback.name || 'User');
    const id = raw?.id || (index === 0 ? DEFAULT_USER_PERSONA_MASK_ID : `mask-${now}-${index}`);
    const progressBundleId = raw?.progressBundleId || (
        index === 0 ? DEFAULT_USER_PROGRESS_BUNDLE_ID : `progress-${sanitizeId(id) || now}`
    );

    return {
        id,
        label: String(raw?.label || (index === 0 ? '默认面具' : `面具 ${index + 1}`)),
        name,
        avatar: raw?.avatar || fallback.avatar || generateFallbackAvatar(name),
        avatarFramePresetId: raw?.avatarFramePresetId ?? fallback.avatarFramePresetId,
        callPortrait: raw?.callPortrait ?? fallback.callPortrait,
        bio: String(raw?.bio ?? fallback.bio ?? ''),
        deepspaceIdentityMode: raw?.deepspaceIdentityMode || fallback.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE,
        deepspaceIdentityNote: String(raw?.deepspaceIdentityNote ?? fallback.deepspaceIdentityNote ?? ''),
        linkedCharacterIds: Array.isArray(raw?.linkedCharacterIds)
            ? [...new Set(raw.linkedCharacterIds.filter(Boolean))]
            : [],
        progressBundleId,
        createdAt: raw?.createdAt || now,
        updatedAt: raw?.updatedAt || now,
        lastUsedAt: raw?.lastUsedAt || (index === 0 ? now : undefined),
    };
};

export const createProgressBundleForMask = (
    mask: UserPersonaMask,
    label?: string,
): UserProgressBundle => {
    const now = Date.now();
    return {
        id: mask.progressBundleId,
        maskId: mask.id,
        label: label || `${mask.label}进度套组`,
        description: '随用户面具切换的剧情、约会、社交和回忆进度分组。当前是外层框架，具体表面会分批接入。',
        surfacePolicy: { ...DEFAULT_SURFACE_POLICY },
        createdAt: now,
        updatedAt: now,
    };
};

const normalizeBundle = (
    raw: Partial<UserProgressBundle> | null | undefined,
    mask: UserPersonaMask,
): UserProgressBundle => ({
    ...createProgressBundleForMask(mask),
    ...(raw || {}),
    id: raw?.id || mask.progressBundleId,
    maskId: raw?.maskId || mask.id,
    label: raw?.label || `${mask.label}进度套组`,
    surfacePolicy: {
        ...DEFAULT_SURFACE_POLICY,
        ...(raw?.surfacePolicy || {}),
    },
    createdAt: raw?.createdAt || mask.createdAt,
    updatedAt: raw?.updatedAt || mask.updatedAt,
});

export const createUserPersonaMaskFromProfile = (
    profile: UserProfile,
    options: { label?: string; copyCurrent?: boolean } = {},
): UserPersonaMask => {
    const normalized = normalizeUserPersonaProfile(profile);
    const active = getActivePersonaMask(normalized);
    const now = Date.now();
    const baseLabel = options.label || `面具 ${(normalized.personaMasks?.length || 0) + 1}`;
    const source = options.copyCurrent && active ? active : normalized;
    const id = `mask-${now}-${Math.random().toString(36).slice(2, 7)}`;

    return normalizeMask({
        ...source,
        id,
        label: baseLabel,
        progressBundleId: `progress-${sanitizeId(id)}`,
        linkedCharacterIds: [],
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
    }, normalized, normalized.personaMasks?.length || 0);
};

export const getActivePersonaMask = (profile: UserProfile): UserPersonaMask | null => {
    const masks = profile.personaMasks || [];
    if (masks.length === 0) return null;
    return masks.find(mask => mask.id === profile.activePersonaMaskId) || masks[0];
};

export const normalizeUserPersonaProfile = (profile: UserProfile): UserProfile => {
    const now = Date.now();
    const fallback: UserProfile = {
        ...profile,
        name: profile.name || 'User',
        avatar: profile.avatar || generateFallbackAvatar(profile.name || 'User'),
        bio: profile.bio ?? '',
        deepspaceIdentityMode: profile.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE,
        deepspaceIdentityNote: profile.deepspaceIdentityNote || '',
    };

    const sourceMasks = profile.personaMasks && profile.personaMasks.length > 0
        ? profile.personaMasks
        : [{
            id: DEFAULT_USER_PERSONA_MASK_ID,
            label: '默认面具',
            name: fallback.name,
            avatar: fallback.avatar,
            avatarFramePresetId: fallback.avatarFramePresetId,
            callPortrait: fallback.callPortrait,
            bio: fallback.bio,
            deepspaceIdentityMode: resolveDeepSpaceIdentityMode(fallback),
            deepspaceIdentityNote: fallback.deepspaceIdentityNote || '',
            linkedCharacterIds: [],
            progressBundleId: DEFAULT_USER_PROGRESS_BUNDLE_ID,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
        }];

    const masks = sourceMasks.map((mask, index) => normalizeMask(mask, fallback, index));
    const activeMask = masks.find(mask => mask.id === profile.activePersonaMaskId) || masks[0];

    const rawBundles = profile.progressBundles || [];
    const bundlesById = new Map(rawBundles.map(bundle => [bundle.id, bundle]));
    const bundles = masks.map(mask => normalizeBundle(bundlesById.get(mask.progressBundleId), mask));
    const activeBundle = bundles.find(bundle => bundle.id === activeMask.progressBundleId) || bundles[0];

    return {
        ...fallback,
        name: activeMask.name,
        avatar: activeMask.avatar,
        avatarFramePresetId: activeMask.avatarFramePresetId,
        callPortrait: activeMask.callPortrait,
        bio: activeMask.bio,
        deepspaceIdentityMode: activeMask.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE,
        deepspaceIdentityNote: activeMask.deepspaceIdentityNote || '',
        activePersonaMaskId: activeMask.id,
        activeProgressBundleId: activeBundle.id,
        personaMasks: masks,
        progressBundles: bundles,
    };
};

export const switchUserPersonaMask = (
    profile: UserProfile,
    maskId: string,
): UserProfile => {
    const normalized = normalizeUserPersonaProfile(profile);
    const target = normalized.personaMasks?.find(mask => mask.id === maskId);
    if (!target) return normalized;
    const now = Date.now();
    return normalizeUserPersonaProfile({
        ...normalized,
        personaMasks: (normalized.personaMasks || []).map(mask => (
            mask.id === target.id ? { ...mask, lastUsedAt: now, updatedAt: now } : mask
        )),
        activePersonaMaskId: target.id,
        activeProgressBundleId: target.progressBundleId,
    });
};

export const mergeUserProfileWithMaskUpdate = (
    previous: UserProfile,
    updates: Partial<UserProfile>,
): UserProfile => {
    const normalized = normalizeUserPersonaProfile(previous);
    const maskFieldUpdates: Partial<UserPersonaMask> = {};
    let hasMaskBoundUpdate = false;

    MASK_BOUND_FIELDS.forEach(field => {
        if (hasOwn(updates, field)) {
            (maskFieldUpdates as any)[field] = (updates as any)[field];
            hasMaskBoundUpdate = true;
        }
    });

    let next: UserProfile = {
        ...normalized,
        ...updates,
    };

    if (hasMaskBoundUpdate) {
        const activeId = normalized.activePersonaMaskId;
        const now = Date.now();
        next.personaMasks = (updates.personaMasks || normalized.personaMasks || []).map(mask => (
            mask.id === activeId
                ? {
                    ...mask,
                    ...maskFieldUpdates,
                    deepspaceIdentityMode: maskFieldUpdates.deepspaceIdentityMode || mask.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE,
                    deepspaceIdentityNote: maskFieldUpdates.deepspaceIdentityNote ?? mask.deepspaceIdentityNote ?? '',
                    updatedAt: now,
                }
                : mask
        ));
    }

    return normalizeUserPersonaProfile(next);
};

export const updatePersonaMaskLabel = (
    profile: UserProfile,
    maskId: string,
    label: string,
): UserProfile => {
    const normalized = normalizeUserPersonaProfile(profile);
    const now = Date.now();
    return normalizeUserPersonaProfile({
        ...normalized,
        personaMasks: (normalized.personaMasks || []).map(mask => (
            mask.id === maskId ? { ...mask, label: label.trim() || mask.label, updatedAt: now } : mask
        )),
        progressBundles: (normalized.progressBundles || []).map(bundle => (
            bundle.maskId === maskId ? { ...bundle, label: `${label.trim() || '面具'}进度套组`, updatedAt: now } : bundle
        )),
    });
};
