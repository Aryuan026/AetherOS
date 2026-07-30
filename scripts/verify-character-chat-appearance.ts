import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { OSTheme } from '../types.ts';
import {
    resolveCharacterChatAppearancePresetId,
    resolveCharacterChatAppearanceTheme,
} from '../components/chat/ChatConstants.ts';

const globalTheme: OSTheme = {
    hue: 211,
    saturation: 100,
    lightness: 50,
    wallpaper: '',
    darkMode: false,
    chatAppearancePreset: 'minimal',
};

assert.equal(resolveCharacterChatAppearancePresetId({ isBuiltIn: true }), 'deep-space');
assert.equal(resolveCharacterChatAppearancePresetId({ isBuiltIn: false }), 'minimal');
assert.equal(resolveCharacterChatAppearancePresetId({ isBuiltIn: true, chatAppearancePreset: 'wechat' }), 'wechat');
assert.equal(resolveCharacterChatAppearancePresetId({ isBuiltIn: false, bubbleStyle: 'my-card-theme' }), 'custom');

assert.equal(
    resolveCharacterChatAppearanceTheme(globalTheme, { isBuiltIn: true }).chatBubbleStyle,
    'deep-space',
);
assert.equal(
    resolveCharacterChatAppearanceTheme(globalTheme, { isBuiltIn: false }).chatBubbleStyle,
    'round',
);
assert.equal(
    resolveCharacterChatAppearanceTheme(globalTheme, {
        isBuiltIn: true,
        chatAppearancePreset: 'wechat',
    }).chatBubbleStyle,
    'wechat',
);

const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const callSource = readFileSync(new URL('../apps/CallApp.tsx', import.meta.url), 'utf8');
const themeMakerSource = readFileSync(new URL('../apps/ThemeMaker.tsx', import.meta.url), 'utf8');
assert.match(chatSource, /resolveCharacterChatAppearanceTheme\(rawOsTheme, char\)/u);
assert.match(callSource, /resolveCharacterChatAppearanceTheme\(rawOsTheme, selectedChar\)/u);
assert.match(themeMakerSource, /chatAppearancePreset: normalizeChatAppearancePresetId/u);
assert.doesNotMatch(callSource, /selectedChar\?\.bubbleStyle \|\| 'default'/u);

console.log('per-character Chat + Call appearance defaults: OK');
