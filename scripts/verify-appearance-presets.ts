import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AppearancePreset, OSTheme } from '../types';
import {
    APPEARANCE_PRESET_FILE_TYPE,
    parseAppearancePreset,
    serializeAppearancePreset,
} from '../utils/appearancePresets';
import { migrateStoredShellChromeTheme } from '../utils/shellChrome';

const modernTheme: OSTheme = {
    hue: 212,
    saturation: 48,
    lightness: 62,
    wallpaper: 'linear-gradient(120deg, #dbeafe, #ede9fe)',
    darkMode: false,
    contentColor: '#334155',
    shellChromeMode: 'virtual_city',
    launcherWidgetImage: 'data:image/png;base64,wide',
    launcherWidgets: { tl: 'data:image/png;base64,left', wide: 'data:image/png;base64,wide' },
    desktopDecorations: [{
        id: 'deco-1',
        type: 'preset',
        content: 'data:image/svg+xml,preset',
        x: 42,
        y: 37,
        scale: 1.2,
        rotation: 8,
        opacity: 0.85,
        zIndex: 2,
        flip: true,
    }],
    avatarFramePresets: [{
        id: 'shared-frame',
        name: 'Shared Frame',
        src: 'data:image/png;base64,frame',
        calibration: {
            avatarScale: 1.1,
            avatarX: 1,
            avatarY: -2,
            frameScale: 0.95,
            frameX: 0,
            frameY: 3,
        },
        ownerType: 'user',
        ownerId: 'shared-owner',
        isBuiltIn: false,
        createdAt: 8,
        updatedAt: 9,
    }],
    customFont: 'https://example.test/font.woff2',
    chatAvatarShape: 'rounded',
    chatAvatarSize: 'large',
    chatAvatarMode: 'every_message',
    chatBubbleStyle: 'outline',
    chatAppearancePreset: 'custom',
    chatBubbleThemeId: 'shared-custom-theme',
    chatMessageSpacing: 'spacious',
    chatShowTimestamp: 'always',
    chatHeaderStyle: 'minimal',
    chatInputStyle: 'rounded',
    chatChromeStyle: 'floating',
    chatBackgroundStyle: 'mesh',
    chatBackgroundImage: 'data:image/png;base64,chat-bg',
    chatHeaderAlign: 'center',
    chatHeaderDensity: 'airy',
    chatStatusStyle: 'pill',
    chatSendButtonStyle: 'minimal',
};

const modernPreset: AppearancePreset = {
    id: 'source-id',
    name: 'Shared Modern Appearance',
    createdAt: 10,
    theme: modernTheme,
    customIcons: { chat: 'data:image/png;base64,icon' },
    chatThemes: [{
        id: 'shared-custom-theme',
        name: 'Shared Bubble',
        type: 'custom',
        user: { textColor: '#fff', backgroundColor: '#6366f1', borderRadius: 20, opacity: 1 },
        ai: { textColor: '#111827', backgroundColor: '#fff', borderRadius: 18, opacity: 0.96 },
        customCss: '.aether-bubble-user { letter-spacing: .02em; }',
    }],
};

const parsedModern = parseAppearancePreset(serializeAppearancePreset(modernPreset), {
    id: 'local-id',
    createdAt: 20,
});
assert.equal(parsedModern.id, 'local-id');
assert.equal(parsedModern.createdAt, 20);
assert.equal(parsedModern.name, modernPreset.name);
assert.deepEqual(parsedModern.theme, modernTheme);
assert.deepEqual(parsedModern.customIcons, modernPreset.customIcons);
assert.deepEqual(parsedModern.chatThemes, modernPreset.chatThemes);

const legacyPayload = JSON.stringify({
    type: APPEARANCE_PRESET_FILE_TYPE,
    version: 1,
    name: 'Legacy Layout',
    theme: {
        hue: 20,
        saturation: 60,
        lightness: 70,
        wallpaper: '#fff7ed',
        darkMode: false,
        hideStatusBar: false,
        injectedField: 'must-not-enter-theme',
    },
    chatLayout: {
        id: 'legacy-chat-layout',
        name: 'Old Shared Layout',
        createdAt: 3,
        chatBg: 'data:image/png;base64,legacy-bg',
        headerStyle: 'immersive',
        inputStyle: 'flat',
        avatarShape: 'square',
        avatarSize: 'small',
        messageLayout: 'compact',
        showTimestamp: 'never',
        bubbleThemeId: 'legacy-bubble',
    },
});
const parsedLegacy = parseAppearancePreset(legacyPayload, { id: 'legacy-local', createdAt: 30 });
assert.equal(parsedLegacy.theme.chatBackgroundImage, 'data:image/png;base64,legacy-bg');
assert.equal(parsedLegacy.theme.chatHeaderStyle, 'minimal');
assert.equal(parsedLegacy.theme.chatInputStyle, 'flat');
assert.equal(parsedLegacy.theme.chatAvatarShape, 'square');
assert.equal(parsedLegacy.theme.chatAvatarSize, 'small');
assert.equal(parsedLegacy.theme.chatMessageSpacing, 'compact');
assert.equal(parsedLegacy.theme.chatShowTimestamp, 'never');
assert.equal(parsedLegacy.theme.chatBubbleThemeId, 'legacy-bubble');
assert.equal((parsedLegacy.theme as unknown as Record<string, unknown>).injectedField, undefined);
assert.equal(migrateStoredShellChromeTheme(parsedLegacy.theme).shellChromeMode, 'simulated_phone');
const chatConstantsSource = readFileSync(new URL('../components/chat/ChatConstants.ts', import.meta.url), 'utf8');
const osContextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
assert.match(chatConstantsSource, /MINIMAL_CHAT_APPEARANCE/);
assert.match(chatConstantsSource, /id:\s*'minimal',[\s\S]*?name:\s*'简约'/);
assert.match(chatConstantsSource, /return presetId \|\| 'minimal'/);
assert.match(osContextSource, /\.\.\.MINIMAL_CHAT_APPEARANCE/);

assert.throws(
    () => parseAppearancePreset('{broken', { id: 'x', createdAt: 1 }),
    /JSON 无法解析/,
);
assert.throws(
    () => parseAppearancePreset(JSON.stringify({ type: APPEARANCE_PRESET_FILE_TYPE, version: 2, theme: modernTheme }), { id: 'x', createdAt: 1 }),
    /暂不支持外观预设版本 2/,
);
assert.throws(
    () => parseAppearancePreset(JSON.stringify({ type: APPEARANCE_PRESET_FILE_TYPE, version: 1, theme: {} }), { id: 'x', createdAt: 1 }),
    /基础主题字段不完整/,
);

console.log('appearance preset contract: OK — v1/current fields round-trip, legacy chatLayout maps, unknown fields stay out');
