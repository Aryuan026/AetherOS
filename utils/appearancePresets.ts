import { AppearancePreset, AvatarFramePreset, ChatLayoutPreset, ChatTheme, DesktopDecoration, OSTheme } from '../types';
import { sanitizeImportedLauncherLayout } from './launcherLayout';

export const APPEARANCE_PRESET_FILE_TYPE = 'aether_appearance_preset';
export const APPEARANCE_PRESET_FILE_VERSION = 1;

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const stringRecord = (value: unknown): Record<string, string> | undefined => {
    if (!isRecord(value)) return undefined;
    const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const enumValue = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => (
    typeof value === 'string' && allowed.includes(value as T) ? value as T : undefined
);

const sanitizeDecorations = (value: unknown): DesktopDecoration[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const decorations = value.flatMap(item => {
        if (!isRecord(item)) return [];
        const type = enumValue(item.type, ['image', 'preset'] as const);
        if (
            typeof item.id !== 'string'
            || !type
            || typeof item.content !== 'string'
            || !isFiniteNumber(item.x)
            || !isFiniteNumber(item.y)
            || !isFiniteNumber(item.scale)
            || !isFiniteNumber(item.rotation)
            || !isFiniteNumber(item.opacity)
            || !isFiniteNumber(item.zIndex)
        ) return [];
        return [{
            id: item.id,
            type,
            content: item.content,
            x: item.x,
            y: item.y,
            scale: item.scale,
            rotation: item.rotation,
            opacity: item.opacity,
            zIndex: item.zIndex,
            ...(typeof item.flip === 'boolean' ? { flip: item.flip } : {}),
        } satisfies DesktopDecoration];
    });
    return decorations.length > 0 ? decorations : undefined;
};

const sanitizeAvatarFramePresets = (value: unknown): AvatarFramePreset[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const presets = value.flatMap(item => {
        if (!isRecord(item) || !isRecord(item.calibration)) return [];
        const { calibration } = item;
        if (
            typeof item.id !== 'string'
            || typeof item.name !== 'string'
            || typeof item.src !== 'string'
            || !isFiniteNumber(calibration.avatarScale)
            || !isFiniteNumber(calibration.avatarX)
            || !isFiniteNumber(calibration.avatarY)
            || !isFiniteNumber(calibration.frameScale)
            || !isFiniteNumber(calibration.frameX)
            || !isFiniteNumber(calibration.frameY)
        ) return [];
        const ownerType = enumValue(item.ownerType, ['character', 'user'] as const);
        return [{
            id: item.id,
            name: item.name,
            src: item.src,
            calibration: {
                avatarScale: calibration.avatarScale,
                avatarX: calibration.avatarX,
                avatarY: calibration.avatarY,
                frameScale: calibration.frameScale,
                frameX: calibration.frameX,
                frameY: calibration.frameY,
            },
            ...(ownerType ? { ownerType } : {}),
            ...(typeof item.ownerId === 'string' ? { ownerId: item.ownerId } : {}),
            ...(typeof item.isBuiltIn === 'boolean' ? { isBuiltIn: item.isBuiltIn } : {}),
            ...(isFiniteNumber(item.createdAt) ? { createdAt: item.createdAt } : {}),
            ...(isFiniteNumber(item.updatedAt) ? { updatedAt: item.updatedAt } : {}),
        } satisfies AvatarFramePreset];
    });
    return presets.length > 0 ? presets : undefined;
};

const sanitizeChatThemes = (value: unknown): ChatTheme[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const themes = value.filter((item): item is ChatTheme => (
        isRecord(item)
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && (item.type === 'preset' || item.type === 'custom')
        && isRecord(item.user)
        && isRecord(item.ai)
    ));
    return themes.length > 0 ? themes.map(theme => ({ ...theme })) : undefined;
};

const sanitizeLegacyChatLayout = (value: unknown): ChatLayoutPreset | undefined => {
    if (!isRecord(value)) return undefined;
    if (typeof value.id !== 'string' || typeof value.name !== 'string' || !isFiniteNumber(value.createdAt)) return undefined;
    return {
        id: value.id,
        name: value.name,
        createdAt: value.createdAt,
        ...(typeof value.chatBg === 'string' ? { chatBg: value.chatBg } : {}),
        ...(isFiniteNumber(value.chatBgOpacity) ? { chatBgOpacity: value.chatBgOpacity } : {}),
        ...(enumValue(value.headerStyle, ['default', 'minimal', 'immersive'] as const) ? { headerStyle: value.headerStyle as ChatLayoutPreset['headerStyle'] } : {}),
        ...(enumValue(value.inputStyle, ['default', 'rounded', 'flat'] as const) ? { inputStyle: value.inputStyle as ChatLayoutPreset['inputStyle'] } : {}),
        ...(enumValue(value.avatarShape, ['circle', 'rounded', 'square'] as const) ? { avatarShape: value.avatarShape as ChatLayoutPreset['avatarShape'] } : {}),
        ...(enumValue(value.avatarSize, ['small', 'medium', 'large'] as const) ? { avatarSize: value.avatarSize as ChatLayoutPreset['avatarSize'] } : {}),
        ...(enumValue(value.messageLayout, ['default', 'compact', 'spacious'] as const) ? { messageLayout: value.messageLayout as ChatLayoutPreset['messageLayout'] } : {}),
        ...(enumValue(value.showTimestamp, ['always', 'hover', 'never'] as const) ? { showTimestamp: value.showTimestamp as ChatLayoutPreset['showTimestamp'] } : {}),
        ...(typeof value.bubbleThemeId === 'string' ? { bubbleThemeId: value.bubbleThemeId } : {}),
    };
};

const applyLegacyChatLayout = (theme: OSTheme, layout?: ChatLayoutPreset): OSTheme => {
    if (!layout) return theme;
    return {
        ...theme,
        chatBackgroundImage: theme.chatBackgroundImage ?? layout.chatBg,
        chatHeaderStyle: theme.chatHeaderStyle ?? (layout.headerStyle === 'immersive' ? 'minimal' : layout.headerStyle),
        chatInputStyle: theme.chatInputStyle ?? layout.inputStyle,
        chatAvatarShape: theme.chatAvatarShape ?? layout.avatarShape,
        chatAvatarSize: theme.chatAvatarSize ?? layout.avatarSize,
        chatMessageSpacing: theme.chatMessageSpacing ?? layout.messageLayout,
        chatShowTimestamp: theme.chatShowTimestamp ?? layout.showTimestamp,
        chatBubbleThemeId: theme.chatBubbleThemeId ?? layout.bubbleThemeId,
    };
};

export const sanitizeImportedAppearanceTheme = (value: unknown, legacyLayout?: ChatLayoutPreset): OSTheme => {
    if (!isRecord(value)) throw new Error('外观预设缺少 theme 字段');
    if (
        !isFiniteNumber(value.hue)
        || !isFiniteNumber(value.saturation)
        || !isFiniteNumber(value.lightness)
        || typeof value.wallpaper !== 'string'
        || typeof value.darkMode !== 'boolean'
    ) throw new Error('外观预设的基础主题字段不完整');

    const theme: OSTheme = {
        hue: value.hue,
        saturation: value.saturation,
        lightness: value.lightness,
        wallpaper: value.wallpaper,
        darkMode: value.darkMode,
    };

    const stringFields = [
        'contentColor',
        'launcherWidgetImage',
        'customFont',
        'chatBubbleThemeId',
        'chatBackgroundImage',
    ] as const satisfies readonly (keyof OSTheme)[];
    stringFields.forEach(key => {
        if (typeof value[key] === 'string') (theme as unknown as Record<string, unknown>)[key] = value[key];
    });

    const enumFields = {
        shellChromeMode: ['simulated_phone', 'software', 'virtual_city'],
        chatAvatarShape: ['circle', 'rounded', 'square'],
        chatAvatarSize: ['small', 'medium', 'large'],
        chatAvatarMode: ['grouped', 'every_message'],
        chatBubbleStyle: ['modern', 'flat', 'outline', 'shadow', 'wechat', 'ios', 'round', 'square', 'deep-space'],
        chatAppearancePreset: ['deep-space', 'minimal', 'wechat', 'custom'],
        chatMessageSpacing: ['compact', 'default', 'spacious'],
        chatShowTimestamp: ['always', 'hover', 'never'],
        chatHeaderStyle: ['default', 'minimal', 'wechat', 'pixel'],
        chatInputStyle: ['default', 'rounded', 'flat', 'wechat', 'ios', 'pixel'],
        chatChromeStyle: ['soft', 'flat', 'floating', 'pixel'],
        chatBackgroundStyle: ['plain', 'grid', 'paper', 'mesh'],
        chatHeaderAlign: ['left', 'center'],
        chatHeaderDensity: ['compact', 'default', 'airy'],
        chatStatusStyle: ['subtle', 'pill', 'dot'],
        chatSendButtonStyle: ['circle', 'pill', 'minimal'],
    } as const;
    Object.entries(enumFields).forEach(([key, allowed]) => {
        const sanitized = enumValue(value[key], allowed);
        if (sanitized) (theme as unknown as Record<string, unknown>)[key] = sanitized;
    });

    if (typeof value.hideStatusBar === 'boolean') theme.hideStatusBar = value.hideStatusBar;
    const launcherWidgets = stringRecord(value.launcherWidgets);
    if (launcherWidgets) theme.launcherWidgets = launcherWidgets;
    const decorations = sanitizeDecorations(value.desktopDecorations);
    if (decorations) theme.desktopDecorations = decorations;
    const avatarFramePresets = sanitizeAvatarFramePresets(value.avatarFramePresets);
    if (avatarFramePresets) theme.avatarFramePresets = avatarFramePresets;
    const launcherLayout = sanitizeImportedLauncherLayout(value.launcherLayout);
    if (launcherLayout) theme.launcherLayout = launcherLayout;

    return applyLegacyChatLayout(theme, legacyLayout);
};

export const serializeAppearancePreset = (preset: AppearancePreset): string => JSON.stringify({
    type: APPEARANCE_PRESET_FILE_TYPE,
    version: APPEARANCE_PRESET_FILE_VERSION,
    ...preset,
}, null, 2);

export const parseAppearancePreset = (
    text: string,
    options: { id: string; createdAt: number },
): AppearancePreset => {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error('外观预设 JSON 无法解析');
    }
    if (!isRecord(raw) || raw.type !== APPEARANCE_PRESET_FILE_TYPE) throw new Error('无效的外观预设文件');
    if (raw.version !== undefined && raw.version !== APPEARANCE_PRESET_FILE_VERSION) {
        throw new Error(`暂不支持外观预设版本 ${String(raw.version)}`);
    }

    const chatLayout = sanitizeLegacyChatLayout(raw.chatLayout);
    return {
        id: options.id,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '导入的预设',
        createdAt: options.createdAt,
        theme: sanitizeImportedAppearanceTheme(raw.theme, chatLayout),
        customIcons: stringRecord(raw.customIcons),
        chatThemes: sanitizeChatThemes(raw.chatThemes),
        chatLayout,
    };
};
