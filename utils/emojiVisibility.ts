import { Emoji, EmojiCategory } from '../types';

const getAllowedIds = (category: EmojiCategory): string[] => (
    Array.isArray(category.allowedCharacterIds) ? category.allowedCharacterIds : []
);

export const isCategoryVisibleForCharacter = (category: EmojiCategory, characterId: string): boolean => {
    const allowedIds = getAllowedIds(category);

    if (category.visibilityMode === 'allowlist') {
        return allowedIds.includes(characterId);
    }

    if (category.visibilityMode === 'all') {
        return true;
    }

    // Legacy SullyOS behavior: non-empty allowedCharacterIds means restricted,
    // missing/empty means visible to everyone.
    if (allowedIds.length > 0) {
        return allowedIds.includes(characterId);
    }

    return true;
};

export const isCategoryVisibleForAnyCharacter = (category: EmojiCategory, characterIds: string[]): boolean => {
    if (category.visibilityMode === 'all') return true;

    const allowedIds = getAllowedIds(category);
    if (category.visibilityMode === 'allowlist') {
        return characterIds.some(id => allowedIds.includes(id));
    }

    if (allowedIds.length > 0) {
        return characterIds.some(id => allowedIds.includes(id));
    }

    return true;
};

export const getVisibleEmojiCategoriesForCharacter = (
    categories: EmojiCategory[],
    characterId: string,
): EmojiCategory[] => categories.filter(category => isCategoryVisibleForCharacter(category, characterId));

export const getVisibleEmojiCategoriesForGroup = (
    categories: EmojiCategory[],
    characterIds: string[],
): EmojiCategory[] => categories.filter(category => isCategoryVisibleForAnyCharacter(category, characterIds));

export const getHiddenCategoryIds = (
    categories: EmojiCategory[],
    visibleCategories: EmojiCategory[],
): Set<string> => {
    const visibleIds = new Set(visibleCategories.map(category => category.id));
    return new Set(categories.filter(category => !visibleIds.has(category.id)).map(category => category.id));
};

export const getVisibleEmojiScopeForCharacter = (
    emojis: Emoji[],
    categories: EmojiCategory[],
    characterId: string,
): { emojis: Emoji[]; categories: EmojiCategory[]; hiddenCategoryIds: Set<string> } => {
    const visibleCategories = getVisibleEmojiCategoriesForCharacter(categories, characterId);
    const hiddenCategoryIds = getHiddenCategoryIds(categories, visibleCategories);
    const visibleEmojis = hiddenCategoryIds.size === 0
        ? emojis
        : emojis.filter(emoji => !emoji.categoryId || !hiddenCategoryIds.has(emoji.categoryId));

    return { emojis: visibleEmojis, categories: visibleCategories, hiddenCategoryIds };
};

export const getVisibleEmojiScopeForGroup = (
    emojis: Emoji[],
    categories: EmojiCategory[],
    characterIds: string[],
): { emojis: Emoji[]; categories: EmojiCategory[]; hiddenCategoryIds: Set<string> } => {
    const visibleCategories = getVisibleEmojiCategoriesForGroup(categories, characterIds);
    const hiddenCategoryIds = getHiddenCategoryIds(categories, visibleCategories);
    const visibleEmojis = hiddenCategoryIds.size === 0
        ? emojis
        : emojis.filter(emoji => !emoji.categoryId || !hiddenCategoryIds.has(emoji.categoryId));

    return { emojis: visibleEmojis, categories: visibleCategories, hiddenCategoryIds };
};

export const categoryHasRestrictedVisibility = (category: EmojiCategory): boolean => (
    category.visibilityMode === 'allowlist' || getAllowedIds(category).length > 0
);

