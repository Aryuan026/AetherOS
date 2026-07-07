import { CharacterProfile } from '../types';
import { DB } from './db';
import { processImage } from './file';
import { publicAsset } from './publicAssets';

export type CharacterWidgetImage = {
    id: string;
    src: string;
    backgroundSrc?: string;
    fillLeftSrc?: string;
    fillRightSrc?: string;
    fit?: 'height' | 'contain';
    source: 'builtin' | 'user';
};

export type CustomCharacterWidgetStore = Record<string, CharacterWidgetImage[]>;

export type CharacterWidgetConfig = {
    characters: Record<string, {
        enabled?: boolean;
        disabledImageIds?: string[];
        updatedAt?: number;
    }>;
};

export const EMPTY_WIDGET_IMAGES: CharacterWidgetImage[] = [];
export const CUSTOM_CHARACTER_WIDGETS_ASSET_ID = 'aetheros_custom_character_widgets_v1';
export const CHARACTER_WIDGET_CONFIG_ASSET_ID = 'aetheros_character_widget_config_v1';
export const MAX_CUSTOM_WIDGET_IMAGES_PER_CHARACTER = 24;

const XAVIER_WIDGET_EXTENSION = {
    backgroundSrc: publicAsset('assets/aetheros/widgets/xavier/xavier-widget-001-strip.jpg'),
    fillLeftSrc: publicAsset('assets/aetheros/widgets/xavier/xavier-widget-001-fill-left.jpg'),
    fillRightSrc: publicAsset('assets/aetheros/widgets/xavier/xavier-widget-001-fill-right.jpg'),
};

const xavierWidget = (index: number): CharacterWidgetImage => ({
    id: `builtin-xavier-widget-${String(index).padStart(3, '0')}`,
    src: publicAsset(`assets/aetheros/widgets/xavier/xavier-widget-${String(index).padStart(3, '0')}.jpg`),
    ...XAVIER_WIDGET_EXTENSION,
    fit: 'height',
    source: 'builtin',
});

export const BUILT_IN_CHARACTER_WIDGET_IMAGES: Record<string, CharacterWidgetImage[]> = {
    'builtin-xavier': Array.from({ length: 9 }, (_, index) => xavierWidget(index + 1)),
};

export const normalizeCustomWidgetStore = (value: any): CustomCharacterWidgetStore => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce<CustomCharacterWidgetStore>((acc, [charId, list]) => {
        if (!Array.isArray(list)) return acc;
        const images = list
            .filter((item: any) => item && typeof item.src === 'string')
            .map((item: any, index): CharacterWidgetImage => ({
                id: typeof item.id === 'string' ? item.id : `user-widget-${charId}-${index}`,
                src: item.src,
                backgroundSrc: typeof item.backgroundSrc === 'string' ? item.backgroundSrc : undefined,
                fillLeftSrc: typeof item.fillLeftSrc === 'string' ? item.fillLeftSrc : undefined,
                fillRightSrc: typeof item.fillRightSrc === 'string' ? item.fillRightSrc : undefined,
                fit: item.fit === 'height' ? 'height' : 'contain',
                source: 'user' as const,
            }));
        if (images.length > 0) acc[charId] = images;
        return acc;
    }, {});
};

export const normalizeWidgetConfig = (value: any): CharacterWidgetConfig => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { characters: {} };
    const rawCharacters = value.characters && typeof value.characters === 'object' && !Array.isArray(value.characters)
        ? value.characters
        : {};

    return {
        characters: Object.entries(rawCharacters).reduce<CharacterWidgetConfig['characters']>((acc, [charId, raw]) => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return acc;
            const item = raw as any;
            const disabledImageIds = Array.isArray(item.disabledImageIds)
                ? item.disabledImageIds.filter((id: any) => typeof id === 'string')
                : [];
            acc[charId] = {
                enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined,
                disabledImageIds,
                updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
            };
            return acc;
        }, {}),
    };
};

export const loadCustomWidgetStore = async (): Promise<CustomCharacterWidgetStore> => {
    try {
        return normalizeCustomWidgetStore(await DB.getAssetRaw(CUSTOM_CHARACTER_WIDGETS_ASSET_ID));
    } catch (e) {
        console.warn('Failed to load custom character widgets', e);
        return {};
    }
};

export const saveCustomWidgetImages = async (charId: string, images: CharacterWidgetImage[]): Promise<CustomCharacterWidgetStore> => {
    const store = await loadCustomWidgetStore();
    const nextImages = images.filter(image => image.source === 'user').slice(-MAX_CUSTOM_WIDGET_IMAGES_PER_CHARACTER);
    if (nextImages.length > 0) store[charId] = nextImages;
    else delete store[charId];
    await DB.saveAssetRaw(CUSTOM_CHARACTER_WIDGETS_ASSET_ID, store);
    return store;
};

export const loadCharacterWidgetConfig = async (): Promise<CharacterWidgetConfig> => {
    try {
        return normalizeWidgetConfig(await DB.getAssetRaw(CHARACTER_WIDGET_CONFIG_ASSET_ID));
    } catch (e) {
        console.warn('Failed to load character widget config', e);
        return { characters: {} };
    }
};

export const saveCharacterWidgetConfig = async (config: CharacterWidgetConfig): Promise<void> => {
    await DB.saveAssetRaw(CHARACTER_WIDGET_CONFIG_ASSET_ID, normalizeWidgetConfig(config));
};

export const getBuiltInWidgetImages = (char: CharacterProfile | null | undefined): CharacterWidgetImage[] => (
    char?.isBuiltIn ? (BUILT_IN_CHARACTER_WIDGET_IMAGES[char.id] || EMPTY_WIDGET_IMAGES) : EMPTY_WIDGET_IMAGES
);

export const getAllWidgetImagesForCharacter = (
    char: CharacterProfile | null | undefined,
    customStore: CustomCharacterWidgetStore,
): CharacterWidgetImage[] => {
    if (!char?.id) return EMPTY_WIDGET_IMAGES;
    return [...getBuiltInWidgetImages(char), ...(customStore[char.id] || EMPTY_WIDGET_IMAGES)];
};

export const isCharacterWidgetEnabled = (
    char: CharacterProfile | null | undefined,
    config: CharacterWidgetConfig,
): boolean => {
    if (!char?.id) return false;
    const stored = config.characters[char.id]?.enabled;
    if (typeof stored === 'boolean') return stored;
    return getBuiltInWidgetImages(char).length > 0;
};

export const getEnabledWidgetImagesForCharacter = (
    char: CharacterProfile | null | undefined,
    customStore: CustomCharacterWidgetStore,
    config: CharacterWidgetConfig,
): CharacterWidgetImage[] => {
    if (!char?.id || !isCharacterWidgetEnabled(char, config)) return EMPTY_WIDGET_IMAGES;
    const disabled = new Set(config.characters[char.id]?.disabledImageIds || []);
    return getAllWidgetImagesForCharacter(char, customStore).filter(image => !disabled.has(image.id));
};

const loadImageElement = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
});

const createWidgetEdgeFill = (img: HTMLImageElement, side: 'left' | 'right'): string => {
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    const sliceWidth = Math.max(2, Math.round(naturalWidth * 0.035));
    const sourceX = side === 'left' ? 0 : Math.max(0, naturalWidth - sliceWidth);
    const scale = Math.min(1, 360 / Math.max(1, naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(72, Math.round(naturalWidth * 0.16 * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sourceX, 0, sliceWidth, naturalHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
};

export const buildCustomWidgetImage = async (file: File): Promise<CharacterWidgetImage> => {
    const src = await processImage(file, {
        maxWidth: 1100,
        quality: 0.9,
        forceJpeg: file.type !== 'image/gif',
    });
    const img = await loadImageElement(src);

    return {
        id: `user-widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        src,
        fillLeftSrc: createWidgetEdgeFill(img, 'left'),
        fillRightSrc: createWidgetEdgeFill(img, 'right'),
        fit: 'contain',
        source: 'user',
    };
};
