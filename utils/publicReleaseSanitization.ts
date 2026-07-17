export const LEGACY_PRIVATE_CHARACTER_IDS = [
    'preset-sully-v2',
    'builtin-card-tester',
] as const;

export const LEGACY_PRIVATE_EMOJI_CATEGORY_IDS = [
    'cat_sully_exclusive',
] as const;

export const LEGACY_PRIVATE_EMOJI_PACK_IDS = [
    'sully',
] as const;

const legacyPrivateCharacterIdSet = new Set<string>(LEGACY_PRIVATE_CHARACTER_IDS);
const legacyPrivateEmojiCategoryIdSet = new Set<string>(LEGACY_PRIVATE_EMOJI_CATEGORY_IDS);
const legacyPrivateEmojiPackIdSet = new Set<string>(LEGACY_PRIVATE_EMOJI_PACK_IDS);
// Keep only one-way fingerprints in the public runtime. This lets old browser
// data be recognized and removed without shipping the retired source URLs.
const legacyPrivateAssetUrlHashSet = new Set<number>([
    3270017412,
    484479212,
    3451460093,
    1753122768,
    470992314,
    2710152634,
    2525373074,
    2435822681,
    2366744216,
    4061143003,
    2084623554,
]);

const stableStringHash = (value: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export const isLegacyPrivateCharacterId = (id: string | null | undefined): boolean => (
    typeof id === 'string' && legacyPrivateCharacterIdSet.has(id)
);

export const isLegacyUpstreamAssetUrl = (value: string | null | undefined): boolean => (
    typeof value === 'string' && legacyPrivateAssetUrlHashSet.has(stableStringHash(value.trim()))
);

export const isLegacyPrivateEmojiCategoryId = (id: string | null | undefined): boolean => (
    typeof id === 'string' && legacyPrivateEmojiCategoryIdSet.has(id)
);

export const isLegacyPrivateEmojiRecord = (emoji: {
    categoryId?: string;
    packId?: string;
    url?: string;
}): boolean => (
    isLegacyPrivateEmojiCategoryId(emoji.categoryId)
    || (typeof emoji.packId === 'string' && legacyPrivateEmojiPackIdSet.has(emoji.packId))
    || isLegacyUpstreamAssetUrl(emoji.url)
);
