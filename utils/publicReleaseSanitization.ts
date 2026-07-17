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

const LEGACY_PRIVATE_ASSET_URLS = [
    'https://sharkpan.xyz/f/5n1gSj/bg.png',
    'https://sharkpan.xyz/f/gXayCw/XT.png',
    'https://sharkpan.xyz/f/2WzAFQ/CAFE.png',
    'https://sharkpan.xyz/f/pWg6HQ/night.png',
    'https://sharkpan.xyz/f/75wvuj/w.png',
    'https://sharkpan.xyz/f/MK77Ia/see.png',
    'https://sharkpan.xyz/f/3WwMHe/fight.png',
    'https://sharkpan.xyz/f/5nwxCj/an.png',
    'https://sharkpan.xyz/f/ylWpfN/sDN.png',
    'https://sharkpan.xyz/f/QdnaU6/sorry.png',
    'https://sharkpan.xyz/f/5nrJsj/wait.png',
] as const;

const legacyPrivateCharacterIdSet = new Set<string>(LEGACY_PRIVATE_CHARACTER_IDS);
const legacyPrivateEmojiCategoryIdSet = new Set<string>(LEGACY_PRIVATE_EMOJI_CATEGORY_IDS);
const legacyPrivateEmojiPackIdSet = new Set<string>(LEGACY_PRIVATE_EMOJI_PACK_IDS);
const legacyPrivateAssetUrlSet = new Set<string>(LEGACY_PRIVATE_ASSET_URLS);

export const isLegacyPrivateCharacterId = (id: string | null | undefined): boolean => (
    typeof id === 'string' && legacyPrivateCharacterIdSet.has(id)
);

export const isLegacyUpstreamAssetUrl = (value: string | null | undefined): boolean => (
    typeof value === 'string' && legacyPrivateAssetUrlSet.has(value.trim())
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
