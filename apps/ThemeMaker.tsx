


import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { ChatTheme, BubbleStyle, OSTheme } from '../types';
import { processImage } from '../utils/file';
import { ChatAppearanceEditor } from '../components/appearance/ChatAppearanceEditor';
import AvatarFrameCalibrator from '../components/avatar-frame/AvatarFrameCalibrator';
import {
    CHAT_APPEARANCE_PRESETS,
    CUSTOM_APPEARANCE_PRESET_ID,
    normalizeChatAppearancePresetId,
} from '../components/chat/ChatConstants';
import AppHeader from '../components/shell/AppHeader';

const cloneTheme = (theme: ChatTheme): ChatTheme => {
    if (typeof structuredClone === 'function') {
        return structuredClone(theme);
    }
    return JSON.parse(JSON.stringify(theme));
};

const DEFAULT_STYLE: BubbleStyle = {
    textColor: '#334155',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    opacity: 1,
    backgroundImageOpacity: 0.5,
    decorationX: 90,
    decorationY: -10,
    decorationScale: 1,
    decorationRotate: 0,
    avatarDecorationX: 50,
    avatarDecorationY: 50,
    avatarDecorationScale: 1,
    avatarDecorationRotate: 0
};

const DEFAULT_THEME: ChatTheme = {
    id: '',
    name: 'New Theme',
    type: 'custom',
    user: { ...DEFAULT_STYLE, textColor: '#ffffff', backgroundColor: '#6366f1' },
    ai: { ...DEFAULT_STYLE },
    customCss: ''
};

type CustomPanel = 'bubble' | 'layout' | 'advanced';

const customPanelTabs: Array<{ id: CustomPanel; label: string }> = [
    { id: 'bubble', label: '气泡样式' },
    { id: 'layout', label: '排版与头像' },
    { id: 'advanced', label: '高级 CSS' },
];

const optionButtonClass = (active: boolean) =>
    `rounded-2xl border px-3 py-2 text-left text-xs font-bold transition-all active:scale-[0.98] ${
        active
            ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
            : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white'
    }`;

const fieldCardClass = 'rounded-2xl border border-slate-100 bg-white p-3 shadow-sm';

// --- CSS Examples ---
const CSS_EXAMPLES = [
    {
        name: '毛玻璃 (Glass)',
        code: `/* Glassmorphism for bubbles */
.aether-bubble-user, .aether-bubble-ai {
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.4);
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}
.aether-bubble-user { background: rgba(99, 102, 241, 0.7) !important; }
.aether-bubble-ai { background: rgba(255, 255, 255, 0.7) !important; }`
    },
    {
        name: '霓虹 (Neon)',
        code: `/* Glowing Neon Borders */
.aether-bubble-user {
  border: 2px solid #a855f7;
  box-shadow: 0 0 10px #a855f7;
  background: #2e1065 !important;
  color: #fff !important;
}
.aether-bubble-ai {
  border: 2px solid #3b82f6;
  box-shadow: 0 0 10px #3b82f6;
  background: #172554 !important;
  color: #fff !important;
}`
    },
    {
        name: '像素 (Pixel)',
        code: `/* Pixel Art Style — Refined */
.aether-bubble-user, .aether-bubble-ai {
  border-radius: 0px !important;
  border: 3px solid #2d2d2d;
  box-shadow: 4px 4px 0px #2d2d2d, inset -2px -2px 0px rgba(0,0,0,0.12), inset 2px 2px 0px rgba(255,255,255,0.25);
  font-family: 'Courier New', monospace;
  image-rendering: pixelated;
  letter-spacing: 0.02em;
}
.aether-bubble-user {
  background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%) !important;
  border-color: #4338ca;
  box-shadow: 4px 4px 0px #4338ca, inset -2px -2px 0px rgba(0,0,0,0.15), inset 2px 2px 0px rgba(255,255,255,0.2);
}
.aether-bubble-ai {
  background: linear-gradient(135deg, #f8f8f8 0%, #e8e8e8 100%) !important;
  border-color: #bbb;
  box-shadow: 4px 4px 0px #bbb, inset -2px -2px 0px rgba(0,0,0,0.06), inset 2px 2px 0px rgba(255,255,255,0.8);
}`
    }
];

// --- Helpers for Color & CSS ---

// Parse Hex/RGBA to { hex: "#RRGGBB", alpha: 0-1 }
const parseColorValue = (color: string) => {
    // Default
    let hex = '#ffffff';
    let alpha = 1;

    if (!color) return { hex, alpha };

    if (color.startsWith('#')) {
        hex = color.substring(0, 7);
        // Handle #RRGGBBAA? Assuming standard 6 char for now or simple
        return { hex, alpha: 1 };
    }

    if (color.startsWith('rgba')) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const a = match[4] ? parseFloat(match[4]) : 1;
            const toHex = (n: number) => n.toString(16).padStart(2, '0');
            hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            alpha = a;
        }
    }
    return { hex, alpha };
};

const toRgbaString = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type RGB = { r: number; g: number; b: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): RGB => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
});

const mixColors = (fg: RGB, bg: RGB, alpha: number): RGB => {
    const a = clamp(alpha, 0, 1);
    return {
        r: Math.round(fg.r * a + bg.r * (1 - a)),
        g: Math.round(fg.g * a + bg.g * (1 - a)),
        b: Math.round(fg.b * a + bg.b * (1 - a))
    };
};

const relativeLuminance = ({ r, g, b }: RGB) => {
    const toLinear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const getContrastRatio = (textHex: string, backgroundColor: string, previewBgHex: string) => {
    const parsedBg = parseColorValue(backgroundColor);
    const text = hexToRgb(parseColorValue(textHex).hex);
    const bubbleBg = hexToRgb(parsedBg.hex);
    const previewBg = hexToRgb(previewBgHex);
    const effectiveBg = mixColors(bubbleBg, previewBg, parsedBg.alpha);
    const l1 = relativeLuminance(text);
    const l2 = relativeLuminance(effectiveBg);
    const bright = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (bright + 0.05) / (dark + 0.05);
};

const getContrastGrade = (ratio: number) => {
    if (ratio >= 7) return 'A';
    if (ratio >= 4.5) return 'B';
    return 'C';
};

const getReadableTextColor = (backgroundColor: string, previewBgHex: string) => {
    const whiteContrast = getContrastRatio('#ffffff', backgroundColor, previewBgHex);
    const blackContrast = getContrastRatio('#000000', backgroundColor, previewBgHex);
    return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
};

// Padding CSS Injection Helper
const PADDING_MARKER_START = '/* PADDING_AUTO_START */';
const PADDING_MARKER_END = '/* PADDING_AUTO_END */';

const injectPaddingCss = (css: string, verticalPadding: number) => {
    const horizontalPadding = Math.round(verticalPadding * 1.6); // Aspect ratio for bubble
    const rule = `
${PADDING_MARKER_START}
.aether-bubble-user, .aether-bubble-ai {
  padding: ${verticalPadding}px ${horizontalPadding}px !important;
}
${PADDING_MARKER_END}`;

    const regex = new RegExp(`${PADDING_MARKER_START.replace(/\*/g, '\\*')}[\\s\\S]*?${PADDING_MARKER_END.replace(/\*/g, '\\*')}`);
    
    if (css && css.match(regex)) {
        return css.replace(regex, rule);
    }
    return (css || '') + rule;
};

const extractPaddingFromCss = (css: string) => {
    const match = css?.match(/padding:\s*(\d+)px/);
    return match ? parseInt(match[1]) : 12; // Default 12px (py-3)
};

const SHADOW_MARKER_START = '/* SHADOW_AUTO_START */';
const SHADOW_MARKER_END = '/* SHADOW_AUTO_END */';

const injectShadowCss = (css: string, userShadow: string, aiShadow: string) => {
    const rule = `
${SHADOW_MARKER_START}
.aether-bubble-user { box-shadow: ${userShadow} !important; }
.aether-bubble-ai { box-shadow: ${aiShadow} !important; }
${SHADOW_MARKER_END}`;

    const regex = new RegExp(`${SHADOW_MARKER_START.replace(/\*/g, '\\*')}[\\s\\S]*?${SHADOW_MARKER_END.replace(/\*/g, '\\*')}`);
    if (css && css.match(regex)) {
        return css.replace(regex, rule);
    }
    return (css || '') + rule;
};

const hslToHex = (h: number, s: number, l: number) => {
    const sat = s / 100;
    const light = l / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = light - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

type StyleTemplate = {
    id: string;
    name: string;
    description: string;
    user: Partial<BubbleStyle>;
    ai: Partial<BubbleStyle>;
    userShadow: string;
    aiShadow: string;
};

type CssSnippet = {
    id: string;
    name: string;
    description: string;
    code: string;
};

type CssValidationResult = {
    isValid: boolean;
    errors: string[];
    errorLines: number[];
    importantCount: number;
};

const TARGET_SELECTOR_REGEX = /^\.aether-bubble-(user|ai)\b/;

const findLineNumberByIndex = (input: string, index: number) => input.slice(0, index).split('\n').length;

const extractLineFromErrorMessage = (message: string) => {
    const lineMatch = message.match(/line\s*(\d+)/i);
    return lineMatch ? parseInt(lineMatch[1], 10) : null;
};

const validateCustomCss = (css: string): CssValidationResult => {
    const source = css || '';
    const errors: string[] = [];
    const errorLines: number[] = [];
    const pushError = (message: string, line?: number | null) => {
        errors.push(message);
        if (line && !Number.isNaN(line)) {
            errorLines.push(line);
        }
    };

    const importantCount = (source.match(/!important/g) || []).length;
    if (!source.trim()) {
        return { isValid: true, errors: [], errorLines: [], importantCount };
    }

    // Minimal syntax check 1: browser parser
    try {
        if (typeof CSSStyleSheet !== 'undefined') {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(source);
        }
    } catch (error: any) {
        pushError(`CSS 语法错误：${error?.message || '请检查语法。'}`, extractLineFromErrorMessage(error?.message || ''));
    }

    // Minimal syntax check 2: brace balance
    const braceStack: number[] = [];
    [...source].forEach((char, index) => {
        if (char === '{') braceStack.push(index);
        if (char === '}') {
            if (braceStack.length === 0) {
                pushError('发现多余的 `}`，请检查大括号闭合。', findLineNumberByIndex(source, index));
            } else {
                braceStack.pop();
            }
        }
    });
    braceStack.forEach(index => pushError('存在未闭合的 `{`，请补全规则块。', findLineNumberByIndex(source, index)));

    // Scope check: only allow .aether-bubble-user / .aether-bubble-ai
    // Ignore comments first to avoid false positives like:
    // /* comment */ .aether-bubble-user { ... }
    const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectorRegex = /([^{}]+)\{/g;
    let selectorMatch = selectorRegex.exec(sourceWithoutComments);
    while (selectorMatch) {
        const selectorGroup = selectorMatch[1].trim();
        const selectorIndex = selectorMatch.index;
        if (!selectorGroup.startsWith('@')) {
            const selectorList = selectorGroup.split(',').map(item => item.trim()).filter(Boolean);
            selectorList.forEach(selector => {
                if (!TARGET_SELECTOR_REGEX.test(selector)) {
                    pushError(
                        `选择器 \`${selector}\` 超出限定范围，仅允许以 .aether-bubble-user / .aether-bubble-ai 开头。`,
                        findLineNumberByIndex(sourceWithoutComments, selectorIndex)
                    );
                }
            });
        }
        selectorMatch = selectorRegex.exec(sourceWithoutComments);
    }

    return {
        isValid: errors.length === 0,
        errors,
        errorLines,
        importantCount
    };
};

const runCssRenderabilityCheck = (css: string, validation: CssValidationResult) => {
    if (!validation.isValid) {
        return {
            ok: false,
            message: `CSS 不可渲染：第 ${validation.errorLines[0] || '?'} 行附近存在错误，请先修复。`
        };
    }

    if (!css.trim()) {
        return { ok: true, message: '' };
    }

    try {
        const styleEl = document.createElement('style');
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
        const ruleCount = styleEl.sheet?.cssRules?.length ?? 0;
        styleEl.remove();
        if (ruleCount === 0) {
            return { ok: false, message: 'CSS 未生成有效规则，请确认语法和选择器。' };
        }
    } catch (error: any) {
        return { ok: false, message: `CSS 渲染检查失败：${error?.message || '未知错误。'}` };
    }

    return { ok: true, message: '' };
};

const CSS_SCOPE_SNIPPETS: CssSnippet[] = [
    {
        id: 'scope-shadow',
        name: '阴影',
        description: '给两侧气泡添加柔和投影',
        code: `.aether-bubble-user, .aether-bubble-ai {\n  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);\n}`
    },
    {
        id: 'scope-stroke',
        name: '描边',
        description: '统一边框轮廓',
        code: `.aether-bubble-user, .aether-bubble-ai {\n  border: 1px solid rgba(148, 163, 184, 0.45);\n}`
    },
    {
        id: 'scope-gradient',
        name: '渐变',
        description: '区分用户与角色气泡层次',
        code: `.aether-bubble-user {\n  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;\n}\n.aether-bubble-ai {\n  background: linear-gradient(135deg, #ffffff, #e2e8f0) !important;\n}`
    },
    {
        id: 'scope-glass',
        name: '玻璃',
        description: '毛玻璃 + 高光边框',
        code: `.aether-bubble-user, .aether-bubble-ai {\n  backdrop-filter: blur(10px);\n  border: 1px solid rgba(255, 255, 255, 0.45);\n}\n.aether-bubble-user {\n  background: rgba(99, 102, 241, 0.62) !important;\n}\n.aether-bubble-ai {\n  background: rgba(255, 255, 255, 0.62) !important;\n}`
    }
];

const STYLE_TEMPLATES: StyleTemplate[] = [
    {
        id: 'cream',
        name: '奶油',
        description: '温暖低饱和，柔和阴影',
        user: { textColor: '#7c2d12', backgroundColor: 'rgba(254, 243, 199, 0.92)', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.45, decorationX: 88, decorationY: -12, avatarDecorationX: 52, avatarDecorationY: 50 },
        ai: { textColor: '#78350f', backgroundColor: 'rgba(255, 251, 235, 0.9)', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.4, decorationX: 12, decorationY: -10, avatarDecorationX: 48, avatarDecorationY: 50 },
        userShadow: '0 8px 24px rgba(217, 119, 6, 0.18)',
        aiShadow: '0 6px 20px rgba(180, 83, 9, 0.14)'
    },
    {
        id: 'glass',
        name: '玻璃',
        description: '半透明磨砂，轻薄边缘',
        user: { textColor: '#0f172a', backgroundColor: 'rgba(191, 219, 254, 0.78)', borderRadius: 18, opacity: 0.98, backgroundImageOpacity: 0.6, decorationX: 90, decorationY: -14, avatarDecorationX: 50, avatarDecorationY: 48 },
        ai: { textColor: '#0f172a', backgroundColor: 'rgba(255, 255, 255, 0.72)', borderRadius: 18, opacity: 0.98, backgroundImageOpacity: 0.55, decorationX: 10, decorationY: -14, avatarDecorationX: 50, avatarDecorationY: 48 },
        userShadow: '0 10px 28px rgba(30, 41, 59, 0.16)',
        aiShadow: '0 8px 22px rgba(30, 41, 59, 0.13)'
    },
    {
        id: 'neon',
        name: '霓虹',
        description: '高对比荧光，发光轮廓',
        user: { textColor: '#faf5ff', backgroundColor: 'rgba(88, 28, 135, 0.9)', borderRadius: 16, opacity: 1, backgroundImageOpacity: 0.32, decorationX: 94, decorationY: -8, avatarDecorationX: 50, avatarDecorationY: 46 },
        ai: { textColor: '#e0f2fe', backgroundColor: 'rgba(12, 74, 110, 0.9)', borderRadius: 16, opacity: 1, backgroundImageOpacity: 0.32, decorationX: 8, decorationY: -8, avatarDecorationX: 50, avatarDecorationY: 46 },
        userShadow: '0 0 18px rgba(217, 70, 239, 0.55)',
        aiShadow: '0 0 18px rgba(14, 165, 233, 0.55)'
    },
    {
        id: 'paper',
        name: '纸感',
        description: '微黄纸张，细节颗粒感',
        user: { textColor: '#3f3f46', backgroundColor: 'rgba(254, 249, 195, 0.93)', borderRadius: 14, opacity: 1, backgroundImageOpacity: 0.7, decorationX: 90, decorationY: -6, avatarDecorationX: 54, avatarDecorationY: 52 },
        ai: { textColor: '#44403c', backgroundColor: 'rgba(254, 252, 232, 0.93)', borderRadius: 14, opacity: 1, backgroundImageOpacity: 0.68, decorationX: 10, decorationY: -6, avatarDecorationX: 46, avatarDecorationY: 52 },
        userShadow: '2px 2px 0 rgba(120, 113, 108, 0.32)',
        aiShadow: '2px 2px 0 rgba(113, 113, 122, 0.26)'
    },
    {
        id: 'minimal',
        name: '极简',
        description: '低阴影，清爽留白',
        user: { textColor: '#0f172a', backgroundColor: 'rgba(226, 232, 240, 0.86)', borderRadius: 20, opacity: 0.97, backgroundImageOpacity: 0.25, decorationX: 92, decorationY: -10, avatarDecorationX: 50, avatarDecorationY: 50 },
        ai: { textColor: '#1e293b', backgroundColor: 'rgba(248, 250, 252, 0.85)', borderRadius: 20, opacity: 0.97, backgroundImageOpacity: 0.22, decorationX: 8, decorationY: -10, avatarDecorationX: 50, avatarDecorationY: 50 },
        userShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
        aiShadow: '0 2px 8px rgba(15, 23, 42, 0.06)'
    }
];

type PreviewMockMessage = {
    id: string;
    role: 'user' | 'ai';
    kind: 'text' | 'image' | 'emoji';
    content: string;
    replyTo?: {
        name: string;
        content: string;
    };
};

type PreviewScene = {
    id: string;
    name: string;
    wallpaper?: string;
    darkMode?: boolean;
    messages: PreviewMockMessage[];
};

const PREVIEW_SCENES: PreviewScene[] = [
    {
        id: 'daily',
        name: '日常聊天',
        messages: [
            { id: 'd1', role: 'ai', kind: 'text', content: '今天状态怎么样？要不要一起复盘一下计划。' },
            { id: 'd2', role: 'user', kind: 'text', content: '挺好！晚点一起把任务过一遍吧。' }
        ]
    },
    {
        id: 'long',
        name: '长文',
        messages: [
            {
                id: 'l1',
                role: 'ai',
                kind: 'text',
                content: '这是一个长文本示例，用于观察在大段内容、自动换行和段落阅读中的可读性表现。\n\n第二段会保持留白，你可以重点观察行距、背景图叠加透明度与文本对比是否舒适。'
            },
            {
                id: 'l2',
                role: 'user',
                kind: 'text',
                content: '收到，我会重点看边角、段落间距、亮暗背景下的可读性。'
            }
        ]
    },
    {
        id: 'reply',
        name: '回复链',
        messages: [
            { id: 'r1', role: 'ai', kind: 'text', content: '我把重点标出来了，看看这个版本。' },
            {
                id: 'r2',
                role: 'user',
                kind: 'text',
                content: '这里我想再调一下边框高亮效果。',
                replyTo: { name: 'AI', content: '我把重点标出来了，看看这个版本。' }
            }
        ]
    },
    {
        id: 'mix',
        name: '图片混排',
        messages: [
            { id: 'm1', role: 'ai', kind: 'image', content: '预览图' },
            { id: 'm2', role: 'user', kind: 'emoji', content: '😆' },
            { id: 'm3', role: 'ai', kind: 'text', content: '图片和文字、表情混排时也要保持层级清晰。' }
        ]
    },
    {
        id: 'dark-wallpaper',
        name: '深色壁纸',
        darkMode: true,
        wallpaper: 'linear-gradient(135deg,#020617 0%,#1e293b 35%,#0f172a 100%)',
        messages: [
            { id: 'dw1', role: 'ai', kind: 'text', content: '深色壁纸下建议确认浅色文字的对比度。' },
            { id: 'dw2', role: 'user', kind: 'text', content: 'OK，我再检查透明背景图和阴影是否干净。' }
        ]
    }
];

const ThemeMaker: React.FC = () => {
    const {
        closeApp,
        addCustomTheme,
        addToast,
        theme: osTheme,
        updateTheme: updateOSTheme,
        characters,
        userProfile,
        updateUserProfile,
        updateCharacter,
    } = useOS();
    const [initialThemeId] = useState(() => `theme-${Date.now()}`);
    const [editingTheme, setEditingTheme] = useState<ChatTheme>({ ...DEFAULT_THEME, id: initialThemeId });
    const [workspace, setWorkspace] = useState<'chat' | 'custom' | 'avatar'>('chat');
    const [customPanel, setCustomPanel] = useState<CustomPanel>('bubble');
    const [activeTab, setActiveTab] = useState<'user' | 'ai' | 'css'>('user');
    const [previewSceneId, setPreviewSceneId] = useState(PREVIEW_SCENES[0].id);
    const [showPreviewBgImage, setShowPreviewBgImage] = useState(true);
    const [isPreviewDark, setIsPreviewDark] = useState(false);
    const [userFollowAi, setUserFollowAi] = useState(false);
    const [lastSavedTheme, setLastSavedTheme] = useState<ChatTheme>(() => cloneTheme({ ...DEFAULT_THEME, id: initialThemeId }));
    const [isDirty, setIsDirty] = useState(false);
    const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);
    const [showLowContrastConfirm, setShowLowContrastConfirm] = useState(false);
    const [pendingSaveExit, setPendingSaveExit] = useState(false);
    const [isAppliedToPreview, setIsAppliedToPreview] = useState(false);
    const [undoStack, setUndoStack] = useState<ChatTheme[]>([]);
    const [redoStack, setRedoStack] = useState<ChatTheme[]>([]);
    const [previewCompareMode, setPreviewCompareMode] = useState<'single' | 'split' | 'toggle'>('single');
    const [previewToggleTarget, setPreviewToggleTarget] = useState<'A' | 'B'>('A');
    const [lastUsableCss, setLastUsableCss] = useState('');
    const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
    
    // Local state for sliders
    const [paddingVal, setPaddingVal] = useState(12);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cssTextareaRef = useRef<HTMLTextAreaElement>(null);

    const activeStyle = editingTheme[activeTab === 'css' ? 'user' : activeTab];
    const activeAppearancePresetId = normalizeChatAppearancePresetId(osTheme.chatAppearancePreset);
    const isCustomAppearance = activeAppearancePresetId === CUSTOM_APPEARANCE_PRESET_ID;
    const CONTRAST_LOW_THRESHOLD = 4.5;
    const CONTRAST_CRITICAL_THRESHOLD = 3;
    const HIGH_BG_IMAGE_OPACITY = 0.75;
    const cssValidation = useMemo(() => validateCustomCss(editingTheme.customCss || ''), [editingTheme.customCss]);

    useEffect(() => {
        if (cssValidation.isValid) {
            setLastUsableCss(editingTheme.customCss || '');
        }
    }, [cssValidation.isValid, editingTheme.customCss]);

    useEffect(() => {
        if (workspace === 'custom' && !isCustomAppearance) {
            setWorkspace('chat');
        }
    }, [isCustomAppearance, workspace]);

    const updateTheme = (
        updater: (prev: ChatTheme) => ChatTheme,
        options?: { trackHistory?: boolean; markDirty?: boolean }
    ) => {
        const trackHistory = options?.trackHistory ?? true;
        const markDirty = options?.markDirty ?? true;
        setEditingTheme(prev => {
            const next = updater(prev);
            if (next === prev) return prev;
            if (trackHistory) {
                setUndoStack(history => [...history, cloneTheme(prev)]);
                setRedoStack([]);
            }
            if (markDirty) {
                setIsDirty(true);
                setIsAppliedToPreview(false);
            }
            return next;
        });
    };

    const withDiscardGuard = (action: () => void) => {
        if (!isDirty) { action(); return; }
        setPendingDiscardAction(() => action);
    };

    const requestTabSwitch = (target: 'user' | 'ai' | 'css') => {
        setCustomPanel(target === 'css' ? 'advanced' : 'bubble');
        if (target === activeTab) return;
        setActiveTab(target);
    };

    const requestCustomPanelSwitch = (target: CustomPanel) => {
        setCustomPanel(target);
        if (target === 'advanced') {
            setActiveTab('css');
            return;
        }
        if (activeTab === 'css') {
            setActiveTab('user');
        }
    };

    const requestClose = () => withDiscardGuard(() => closeApp());
    const requestBack = () => {
        if (workspace === 'chat') {
            requestClose();
            return;
        }
        withDiscardGuard(() => setWorkspace('chat'));
    };

    const openAvatarFrameManager = () => withDiscardGuard(() => setWorkspace('avatar'));

    const activateCustomAppearance = () => {
        const customPreset = CHAT_APPEARANCE_PRESETS.find(preset => preset.id === CUSTOM_APPEARANCE_PRESET_ID);
        updateOSTheme({
            ...customPreset?.config,
            chatAppearancePreset: CUSTOM_APPEARANCE_PRESET_ID,
            chatBubbleThemeId: CUSTOM_APPEARANCE_PRESET_ID,
        });
        setCustomPanel('bubble');
        setActiveTab('user');
        setWorkspace('custom');
    };

    const updateChatLayout = (updates: Partial<OSTheme>) => {
        updateOSTheme({
            chatAppearancePreset: CUSTOM_APPEARANCE_PRESET_ID,
            ...updates,
        });
    };

    // Initialize padding state from CSS on load
    useEffect(() => {
        if (editingTheme.customCss) {
            setPaddingVal(extractPaddingFromCss(editingTheme.customCss));
        }
    }, []);

    const updateStyle = (key: keyof BubbleStyle, value: any) => {
        if (activeTab === 'css') return;
        updateTheme(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab as 'user' | 'ai'],
                [key]: value
            },
            ...(userFollowAi && activeTab === 'ai'
                ? {
                    user: {
                        ...prev.user,
                        [key]: value
                    }
                }
                : {})
        }));
    };

    const updateColorWithAlpha = (newHex: string, newAlpha: number) => {
        const val = newAlpha === 1 ? newHex : toRgbaString(newHex, newAlpha);
        updateStyle('backgroundColor', val);
    };

    const updatePadding = (val: number) => {
        setPaddingVal(val);
        const newCss = injectPaddingCss(editingTheme.customCss || '', val);
        updateTheme(prev => ({ ...prev, customCss: newCss }));
    };

    const handleImageUpload = async (file: File, type: 'bg' | 'avatarDeco') => {
        try {
            const result = await processImage(file);
            if (type === 'bg') updateStyle('backgroundImage', result);
            else if (type === 'avatarDeco') updateStyle('avatarDecoration', result);
            addToast('图片上传成功', 'success');
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const doSaveTheme = (exitAfterSave: boolean) => {
        addCustomTheme(editingTheme);
        updateOSTheme({
            chatAppearancePreset: CUSTOM_APPEARANCE_PRESET_ID,
            chatBubbleThemeId: editingTheme.id,
        });
        setLastSavedTheme(cloneTheme(editingTheme));
        setIsDirty(false);
        setIsAppliedToPreview(true);
        addToast('已保存并应用到聊天气泡', 'success');
        if (exitAfterSave) closeApp();
    };

    const saveTheme = ({ exitAfterSave }: { exitAfterSave: boolean }) => {
        if (!editingTheme.name.trim()) return;
        const renderability = runCssRenderabilityCheck(editingTheme.customCss || '', cssValidation);
        if (!renderability.ok) {
            addToast(renderability.message, 'error');
            return;
        }
        if (overallContrastScore.ratio < CONTRAST_CRITICAL_THRESHOLD) {
            setPendingSaveExit(exitAfterSave);
            setShowLowContrastConfirm(true);
            return;
        }
        doSaveTheme(exitAfterSave);
    };

    const insertCssSnippet = (snippet: CssSnippet) => {
        const textarea = cssTextareaRef.current;
        const currentCss = editingTheme.customCss || '';
        if (!textarea) {
            updateTheme(prev => ({ ...prev, customCss: `${currentCss}${currentCss.endsWith('\n') || !currentCss ? '' : '\n'}${snippet.code}\n` }));
            return;
        }

        const start = textarea.selectionStart ?? currentCss.length;
        const end = textarea.selectionEnd ?? currentCss.length;
        const insertContent = `${start === 0 ? '' : '\n'}${snippet.code}\n`;
        const nextCss = `${currentCss.slice(0, start)}${insertContent}${currentCss.slice(end)}`;
        updateTheme(prev => ({ ...prev, customCss: nextCss }));
        requestAnimationFrame(() => {
            const cursor = start + insertContent.length;
            textarea.focus();
            textarea.setSelectionRange(cursor, cursor);
        });
    };

    const restoreLastUsableCss = () => {
        if ((editingTheme.customCss || '') === lastUsableCss) {
            addToast('当前已是上次可用 CSS', 'success');
            return;
        }
        updateTheme(prev => ({ ...prev, customCss: lastUsableCss }));
        addToast('已恢复到上次可用 CSS', 'success');
    };

    const applyTemplate = (template: StyleTemplate) => {
        updateTheme(prev => ({
            ...prev,
            user: { ...prev.user, ...template.user },
            ai: { ...prev.ai, ...template.ai },
            customCss: injectShadowCss(prev.customCss || '', template.userShadow, template.aiShadow)
        }));
        addToast(`已应用 ${template.name} 模板`, 'success');
    };

    const randomizeMonochrome = () => {
        const baseHue = Math.floor(Math.random() * 360);
        const hueShift = Math.floor(Math.random() * 18) - 9;
        const aiHue = (baseHue + hueShift + 360) % 360;
        const userBg = hslToHex(baseHue, 68, 48);
        const aiBg = hslToHex(aiHue, 54, 84);
        const userAlpha = 0.88;
        const aiAlpha = 0.85;
        const userText = '#f8fafc';
        const aiText = '#0f172a';
        updateTheme(prev => ({
            ...prev,
            user: {
                ...prev.user,
                backgroundColor: toRgbaString(userBg, userAlpha),
                textColor: userText,
                borderRadius: 20,
                backgroundImageOpacity: 0.4
            },
            ai: {
                ...prev.ai,
                backgroundColor: toRgbaString(aiBg, aiAlpha),
                textColor: aiText,
                borderRadius: 16,
                backgroundImageOpacity: 0.35
            }
        }));
        addToast('已生成同色系配色', 'success');
    };

    const mirrorToOtherBubble = () => {
        if (activeTab === 'css') return;
        const sourceKey = activeTab;
        const targetKey = activeTab === 'user' ? 'ai' : 'user';
        updateTheme(prev => ({
            ...prev,
            [targetKey]: {
                ...prev[targetKey],
                ...prev[sourceKey]
            }
        }));
        addToast('已镜像当前气泡参数', 'success');
    };

    const currentScene = useMemo(
        () => PREVIEW_SCENES.find(scene => scene.id === previewSceneId) || PREVIEW_SCENES[0],
        [previewSceneId]
    );

    const previewBgHex = useMemo(() => {
        if (currentScene.darkMode || isPreviewDark) return '#0f172a';
        return '#f1f5f9';
    }, [currentScene.darkMode, isPreviewDark]);

    const contrastScores = useMemo(() => {
        const userRatio = getContrastRatio(editingTheme.user.textColor, editingTheme.user.backgroundColor, previewBgHex);
        const aiRatio = getContrastRatio(editingTheme.ai.textColor, editingTheme.ai.backgroundColor, previewBgHex);
        return {
            user: { ratio: userRatio, grade: getContrastGrade(userRatio) },
            ai: { ratio: aiRatio, grade: getContrastGrade(aiRatio) }
        };
    }, [editingTheme.user.textColor, editingTheme.user.backgroundColor, editingTheme.ai.textColor, editingTheme.ai.backgroundColor, previewBgHex]);

    const overallContrastScore = useMemo(() => {
        return contrastScores.user.ratio <= contrastScores.ai.ratio
            ? { ...contrastScores.user, role: 'user' as const }
            : { ...contrastScores.ai, role: 'ai' as const };
    }, [contrastScores]);

    const activeContrastScore = activeTab === 'ai' ? contrastScores.ai : contrastScores.user;
    const showLowContrastWarning = activeTab !== 'css' && activeContrastScore.ratio < CONTRAST_LOW_THRESHOLD;
    const showCombinedRisk = activeTab !== 'css'
        && (activeStyle.backgroundImageOpacity ?? 0) >= HIGH_BG_IMAGE_OPACITY
        && activeContrastScore.ratio < CONTRAST_LOW_THRESHOLD;

    const oneClickFixContrast = () => {
        if (activeTab === 'css') return;
        const betterTextColor = getReadableTextColor(activeStyle.backgroundColor, previewBgHex);
        updateTheme(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                textColor: betterTextColor,
                backgroundImageOpacity: Math.min(prev[activeTab].backgroundImageOpacity ?? 0.5, 0.55)
            }
        }));
        addToast('已自动优化文字对比度', 'success');
    };

    useEffect(() => {
        setIsPreviewDark(!!currentScene.darkMode);
    }, [currentScene.id]);

    const handleUndo = () => {
        if (undoStack.length === 0) return;
        const previous = undoStack[undoStack.length - 1];
        const nextUndo = undoStack.slice(0, -1);
        setUndoStack(nextUndo);
        setRedoStack(stack => [...stack, cloneTheme(editingTheme)]);
        setEditingTheme(cloneTheme(previous));
        setIsDirty(true);
        setIsAppliedToPreview(false);
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        const nextRedo = redoStack.slice(0, -1);
        setRedoStack(nextRedo);
        setUndoStack(stack => [...stack, cloneTheme(editingTheme)]);
        setEditingTheme(cloneTheme(next));
        setIsDirty(true);
        setIsAppliedToPreview(false);
    };

    const renderPreviewBubble = (mock: PreviewMockMessage, theme: ChatTheme, panel: 'A' | 'B') => {
        const role = mock.role;
        const style = role === 'user' ? theme.user : theme.ai;
        const isUser = role === 'user';
        const isActive = panel === 'A' && (activeTab === role || activeTab === 'css');
        const previewAvatarSize = osTheme.chatAvatarSize || 'medium';
        const previewAvatarShape = osTheme.chatAvatarShape || 'circle';
        const previewAvatarSizeClass = previewAvatarSize === 'small' ? 'w-7 h-7' : previewAvatarSize === 'large' ? 'w-12 h-12' : 'w-9 h-9';
        const previewAvatarSizePx = previewAvatarSize === 'small' ? 28 : previewAvatarSize === 'large' ? 48 : 36;
        const previewAvatarRadiusClass = previewAvatarShape === 'square' ? 'rounded-sm' : previewAvatarShape === 'rounded' ? 'rounded-xl' : 'rounded-full';
        const previewBubbleOffsetClass = previewAvatarSize === 'small'
            ? (isUser ? 'mr-10' : 'ml-10')
            : previewAvatarSize === 'large'
                ? (isUser ? 'mr-14' : 'ml-14')
                : (isUser ? 'mr-12' : 'ml-12');
        
        // Match core bubble corner strategy in MessageItem.tsx
        const containerStyle = {
            backgroundColor: style.backgroundColor,
            borderRadius: `${style.borderRadius}px`,
            opacity: style.opacity,
            borderBottomLeftRadius: isUser ? `${style.borderRadius}px` : '4px',
            borderBottomRightRadius: isUser ? '4px' : `${style.borderRadius}px`,
            borderTopLeftRadius: `${style.borderRadius}px`,
            borderTopRightRadius: `${style.borderRadius}px`,
        };

        return (
            <div 
                className={`relative w-full flex items-end transition-all duration-300 cursor-pointer opacity-100 scale-100 ${isUser ? 'justify-end' : 'justify-start'}`}
                onClick={() => panel === 'A' && requestTabSwitch(role)}
                title={panel === 'A' ? `点击编辑${isUser ? '用户' : '角色'}气泡` : '上次保存版本'}
            >
                {/* Avatar + decoration: align with MessageItem layering */}
                <div className={`absolute bottom-0 ${isUser ? 'right-0' : 'left-0'} ${previewAvatarSizeClass} z-10`}>
                    <div className={`w-full h-full ${previewAvatarRadiusClass} bg-slate-300 overflow-hidden relative z-0 shadow-sm ring-1 ring-black/5`}>
                         <div className="absolute inset-0 flex items-center justify-center text-white/50 font-bold text-[10px]">{isUser ? 'ME' : 'AI'}</div>
                    </div>
                    {style.avatarDecoration && (
                        <img 
                            src={style.avatarDecoration}
                            className="absolute pointer-events-none z-10 max-w-none"
                            style={{
                                left: `${style.avatarDecorationX ?? 50}%`,
                                top: `${style.avatarDecorationY ?? 50}%`,
                                width: `${previewAvatarSizePx * (style.avatarDecorationScale ?? 1)}px`,
                                height: 'auto',
                                transform: `translate(-50%, -50%) rotate(${style.avatarDecorationRotate ?? 0}deg)`,
                            }}
                        />
                    )}
                </div>

                <div className={`relative group max-w-[78%] ${previewBubbleOffsetClass}`}>
                    {style.decoration && (
                        <img 
                            src={style.decoration} 
                            className="absolute z-10 w-8 h-8 object-contain drop-shadow-sm pointer-events-none"
                            style={{
                                left: `${style.decorationX ?? (isUser ? 90 : 10)}%`,
                                top: `${style.decorationY ?? -10}%`,
                                transform: `translate(-50%, -50%) scale(${style.decorationScale ?? 1}) rotate(${style.decorationRotate ?? 0}deg)`
                            }}
                        />
                    )}

                    <div
                        className={`relative px-5 py-3 shadow-sm border border-black/5 text-sm overflow-visible ${isUser ? 'aether-bubble-user' : 'aether-bubble-ai'} ${isActive ? 'ring-2 ring-primary/70' : ''}`}
                        style={containerStyle}
                    >
                        {showPreviewBgImage && style.backgroundImage && (
                            <div 
                                className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
                                style={{ 
                                    backgroundImage: `url(${style.backgroundImage})`,
                                    opacity: style.backgroundImageOpacity ?? 0.5,
                                    borderRadius: 'inherit'
                                }}
                            ></div>
                        )}
                        {mock.replyTo && (
                            <div className="relative z-10 mb-1 text-[10px] bg-black/5 p-1.5 rounded-md border-l-2 border-current opacity-60 flex flex-col gap-0.5 max-w-full overflow-hidden">
                                <span className="font-bold opacity-90 truncate">{mock.replyTo.name}</span>
                                <span className="truncate italic">"{mock.replyTo.content}"</span>
                            </div>
                        )}

                        {mock.kind === 'image' ? (
                            <div className="relative z-10 w-40 h-28 rounded-xl bg-black/10 border border-black/10 flex items-center justify-center text-xs" style={{ color: style.textColor }}>
                                🖼️ 图片占位
                            </div>
                        ) : mock.kind === 'emoji' ? (
                            <div className="relative z-10 text-3xl leading-none">{mock.content}</div>
                        ) : (
                            <div className="relative z-10 text-[15px] leading-relaxed whitespace-pre-wrap break-all" style={{ color: style.textColor }}>
                                {mock.content}
                            </div>
                        )}

                        {isActive && (
                            <div className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold tracking-wider z-20">
                                正在编辑{isUser ? '用户' : '角色'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const parsedBgColor = parseColorValue(activeStyle.backgroundColor);

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col font-light relative">
            <AppHeader
                title="聊天装扮"
                subtitle={
                    <span className="flex items-center gap-1.5">
                        <span className={`inline-flex w-2 h-2 rounded-full ${isAppliedToPreview && !isDirty ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        {workspace === 'chat'
                            ? '聊天主题'
                            : workspace === 'avatar'
                                ? '头像框校准'
                                : (isAppliedToPreview && !isDirty ? '已应用到真实聊天气泡' : '自定义气泡')}
                    </span>
                }
                onBack={requestBack}
                right={workspace === 'custom' ? (
                    <button onClick={() => saveTheme({ exitAfterSave: false })} className="px-4 py-1.5 bg-primary text-white rounded-full text-xs font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all">
                        保存并应用
                    </button>
                ) : null}
            />

            {workspace === 'chat' ? (
                <div className="flex-1 overflow-y-auto p-5 no-scrollbar space-y-4">
                    <ChatAppearanceEditor theme={osTheme} updateTheme={updateOSTheme} onCustomPresetSelect={activateCustomAppearance} />
                    <section className="rounded-3xl border border-white/70 bg-white/72 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-slate-800">头像框校准</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                    给每个头像框保存独立对齐参数，可分别应用到角色或用户头像。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={openAvatarFrameManager}
                                className="shrink-0 rounded-full bg-slate-900 px-3 py-2 text-[11px] font-bold text-white shadow-sm active:scale-95"
                            >
                                管理头像框
                            </button>
                        </div>
                    </section>
                </div>
            ) : workspace === 'avatar' ? (
                <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
                    <AvatarFrameCalibrator
                        theme={osTheme}
                        updateTheme={updateOSTheme}
                        characters={characters}
                        userProfile={userProfile}
                        updateUserProfile={updateUserProfile}
                        updateCharacter={updateCharacter}
                        addToast={addToast}
                    />
                </div>
            ) : (
            <>
            {/* Preview Area (Realistic Chat Row) */}
            <div className={`${isPreviewFullscreen ? 'fixed inset-0 z-[120]' : 'shrink-0 min-h-[220px]'} relative overflow-hidden flex flex-col p-4 justify-center items-center gap-3 ${isPreviewDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                {currentScene.wallpaper && (
                    <div className="absolute inset-0" style={{ background: currentScene.wallpaper, opacity: isPreviewDark ? 0.9 : 0.45 }} />
                )}
                
                {/* Live CSS Injection for Preview */}
                {editingTheme.customCss && <style>{editingTheme.customCss}</style>}

                <div className={`w-full max-w-sm relative z-10 rounded-2xl px-3 py-2 text-[11px] font-bold shadow-sm ${overallContrastScore.grade === 'A' ? 'bg-emerald-100 text-emerald-700' : overallContrastScore.grade === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                    可读性 {overallContrastScore.grade}
                </div>

                {/* Simulated Chat Conversation */}
                {previewCompareMode === 'split' ? (
                    <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-3 relative z-10">
                        {[{ label: 'A 当前编辑', theme: editingTheme, panel: 'A' as const }, { label: 'B 上次保存', theme: lastSavedTheme, panel: 'B' as const }].map(item => (
                            <div key={item.label} className={`space-y-4 p-4 rounded-2xl ${isPreviewDark ? 'bg-slate-950/60 border border-white/10' : 'bg-white/70 border border-white/60'}`}>
                                <div className="text-[10px] text-slate-500">{item.label}</div>
                                {currentScene.messages.map(msg => (
                                    <div key={`${item.panel}-${msg.id}`}>{renderPreviewBubble(msg, item.theme, item.panel)}</div>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={`w-full max-w-sm space-y-4 p-4 rounded-2xl relative z-10 ${isPreviewDark ? 'bg-slate-950/60 border border-white/10' : 'bg-white/70 border border-white/60'}`}>
                        {currentScene.messages.map(msg => (
                            <div key={msg.id}>{renderPreviewBubble(msg, previewCompareMode === 'toggle' && previewToggleTarget === 'B' ? lastSavedTheme : editingTheme, previewCompareMode === 'toggle' && previewToggleTarget === 'B' ? 'B' : 'A')}</div>
                        ))}
                    </div>
                )}
                
            </div>

            {/* Editor Controls */}
            {!isPreviewFullscreen && (
            <div className="bg-white border-t border-slate-100 z-30 flex flex-col flex-1 min-h-0">
                <div className="flex px-5 pt-4 pb-2 gap-2 overflow-x-auto no-scrollbar">
                    {customPanelTabs.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => requestCustomPanelSwitch(tab.id)}
                            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-[0.98] ${
                                customPanel === tab.id
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {customPanel === 'bubble' && (
                    <div className="flex px-6 pt-2 pb-2 gap-3 overflow-x-auto no-scrollbar">
                        <button onClick={() => requestTabSwitch('user')} className={`text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'user' ? 'text-slate-800' : 'text-slate-300'}`}>用户气泡</button>
                        <button onClick={() => requestTabSwitch('ai')} className={`text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'text-slate-800' : 'text-slate-300'}`}>角色气泡</button>
                    </div>
                )}

                {customPanel !== 'layout' && (
                <div className="px-6 pb-2 flex items-center gap-2">
                    <button onClick={handleUndo} disabled={undoStack.length === 0} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 disabled:opacity-40">撤销</button>
                    <button onClick={handleRedo} disabled={redoStack.length === 0} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 disabled:opacity-40">重做</button>
                </div>
                )}

                <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar pb-20">
                    
                    {/* --- CSS EDITOR --- */}
                    {customPanel === 'advanced' && (
                        <div className="space-y-6 animate-fade-in h-full flex flex-col">
                            <div className="text-[10px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed space-y-2">
                                <span className="font-bold block mb-1 text-slate-500">CSS 增强模式</span>
                                可使用CSS类名 <code className="bg-slate-200 px-1 rounded">.aether-bubble-user</code> 和 <code className="bg-slate-200 px-1 rounded">.aether-bubble-ai</code> 来统一定制气泡样式。
                                <br/>支持使用 <code className="text-red-400">!important</code> 覆盖可视化编辑器的设置。
                                <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-[10px] text-indigo-700">
                                    <div className="font-semibold">优先级说明：可视化参数 vs CSS 覆盖</div>
                                    <div>1) 可视化滑杆/颜色面板先生成基础样式；2) 自定义 CSS 后应用；3) <code>!important</code> 仅对命中的属性强制生效，会压过同属性的可视化参数。</div>
                                </div>
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                    <div>
                                        <div className={`text-[10px] font-semibold ${cssValidation.isValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {cssValidation.isValid ? '语法检查通过' : '语法检查未通过'}
                                        </div>
                                        <div className="text-[10px] text-slate-500">检测到 <code className="text-red-500">!important</code> {cssValidation.importantCount} 处</div>
                                    </div>
                                    <button
                                        onClick={restoreLastUsableCss}
                                        disabled={(editingTheme.customCss || '') === lastUsableCss}
                                        className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-50"
                                    >
                                        重置为上次可用 CSS
                                    </button>
                                </div>
                            </div>

                            <textarea 
                                ref={cssTextareaRef}
                                value={editingTheme.customCss || ''} 
                                onChange={(e) => updateTheme(prev => ({ ...prev, customCss: e.target.value }))}
                                placeholder="/* 在这里输入 CSS 代码 */"
                                className="flex-1 w-full bg-slate-800 text-slate-300 font-mono text-xs p-4 rounded-xl resize-none shadow-inner focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                spellCheck={false}
                            />

                            {!cssValidation.isValid && (
                                <div className="text-[11px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                                    <div className="font-semibold mb-1">CSS 错误提示（实时）</div>
                                    <ul className="space-y-1 list-disc pl-4">
                                        {cssValidation.errors.map((error, idx) => (
                                            <li key={`${error}-${idx}`}>
                                                {cssValidation.errorLines[idx] ? `第 ${cssValidation.errorLines[idx]} 行：` : ''}{error}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">限定作用域插入器（仅 .aether-bubble-user/.aether-bubble-ai）</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CSS_SCOPE_SNIPPETS.map(snippet => (
                                        <button
                                            key={snippet.id}
                                            onClick={() => insertCssSnippet(snippet)}
                                            className="text-left p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                                        >
                                            <div className="text-xs font-semibold text-slate-700">{snippet.name}</div>
                                            <div className="text-[10px] text-slate-500 mt-1">{snippet.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">快速模板 (Templates)</label>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                    {CSS_EXAMPLES.map((ex, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => updateTheme(prev => ({ ...prev, customCss: ex.code }))}
                                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-mono text-slate-600 border border-slate-200 whitespace-nowrap transition-colors"
                                        >
                                            {ex.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {customPanel === 'layout' && (
                        <div className="space-y-5 animate-fade-in">
                            <div className={fieldCardClass}>
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">头像</div>
                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">尺寸</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'small', label: '小' },
                                                { value: 'medium', label: '标准' },
                                                { value: 'large', label: '大' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatAvatarSize: option.value as OSTheme['chatAvatarSize'] })}
                                                    className={optionButtonClass((osTheme.chatAvatarSize || 'medium') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">形状</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'circle', label: '圆形' },
                                                { value: 'rounded', label: '圆角' },
                                                { value: 'square', label: '方形' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatAvatarShape: option.value as OSTheme['chatAvatarShape'] })}
                                                    className={optionButtonClass((osTheme.chatAvatarShape || 'circle') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">显示</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { value: 'grouped', label: '连续合并' },
                                                { value: 'every_message', label: '每条显示' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatAvatarMode: option.value as OSTheme['chatAvatarMode'] })}
                                                    className={optionButtonClass((osTheme.chatAvatarMode || 'grouped') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={fieldCardClass}>
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">消息</div>
                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">间距</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'compact', label: '紧凑' },
                                                { value: 'default', label: '标准' },
                                                { value: 'spacious', label: '宽松' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatMessageSpacing: option.value as OSTheme['chatMessageSpacing'] })}
                                                    className={optionButtonClass((osTheme.chatMessageSpacing || 'default') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">时间</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'hover', label: '轻显示' },
                                                { value: 'always', label: '常显示' },
                                                { value: 'never', label: '隐藏' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatShowTimestamp: option.value as OSTheme['chatShowTimestamp'] })}
                                                    className={optionButtonClass((osTheme.chatShowTimestamp || 'hover') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={fieldCardClass}>
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">输入栏</div>
                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">输入框</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'rounded', label: '圆润' },
                                                { value: 'wechat', label: '微信' },
                                                { value: 'ios', label: 'iOS' },
                                                { value: 'default', label: '默认' },
                                                { value: 'flat', label: '横线' },
                                                { value: 'pixel', label: '像素' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatInputStyle: option.value as OSTheme['chatInputStyle'] })}
                                                    className={optionButtonClass((osTheme.chatInputStyle || 'default') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">发送按钮</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'circle', label: '圆键' },
                                                { value: 'pill', label: '文字键' },
                                                { value: 'minimal', label: '极简' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatSendButtonStyle: option.value as OSTheme['chatSendButtonStyle'] })}
                                                    className={optionButtonClass((osTheme.chatSendButtonStyle || 'circle') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={fieldCardClass}>
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">页面</div>
                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">顶部位置</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { value: 'left', label: '靠左' },
                                                { value: 'center', label: '居中' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatHeaderAlign: option.value as OSTheme['chatHeaderAlign'] })}
                                                    className={optionButtonClass((osTheme.chatHeaderAlign || 'left') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">顶部高度</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'compact', label: '紧凑' },
                                                { value: 'default', label: '标准' },
                                                { value: 'airy', label: '舒展' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatHeaderDensity: option.value as OSTheme['chatHeaderDensity'] })}
                                                    className={optionButtonClass((osTheme.chatHeaderDensity || 'default') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[11px] font-bold text-slate-500">外壳</div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { value: 'soft', label: '柔和' },
                                                { value: 'flat', label: '平面' },
                                                { value: 'floating', label: '悬浮' },
                                                { value: 'pixel', label: '像素' },
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateChatLayout({ chatChromeStyle: option.value as OSTheme['chatChromeStyle'] })}
                                                    className={optionButtonClass((osTheme.chatChromeStyle || 'soft') === option.value)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- BASE STYLE TOOLS --- */}
                    {customPanel === 'bubble' && activeTab !== 'css' && (
                        <div className="space-y-6 animate-fade-in"> 
                            {/* Name Input (Only on Base) */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">主题名称 (Theme Name)</label>
                                <input value={editingTheme.name} onChange={(e) => updateTheme(prev => ({ ...prev, name: e.target.value }), { trackHistory: false })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-primary/50 transition-all outline-none" placeholder="我的个性主题" />
                            </div>

                            <div className={fieldCardClass}>
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">气泡形态</div>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: 'modern', label: '现代' },
                                        { value: 'round', label: '圆润' },
                                        { value: 'square', label: '直角' },
                                        { value: 'wechat', label: '微信' },
                                        { value: 'ios', label: 'iOS' },
                                        { value: 'deep-space', label: '深空' },
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => updateChatLayout({ chatBubbleStyle: option.value as OSTheme['chatBubbleStyle'] })}
                                            className={optionButtonClass((osTheme.chatBubbleStyle || 'modern') === option.value)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={fieldCardClass}>
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">快速风格</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {STYLE_TEMPLATES.map(template => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => applyTemplate(template)}
                                            className={optionButtonClass(false)}
                                        >
                                            {template.name}
                                        </button>
                                    ))}
                                    <button type="button" onClick={randomizeMonochrome} className={optionButtonClass(false)}>
                                        同色生成
                                    </button>
                                    <button type="button" onClick={mirrorToOtherBubble} className={optionButtonClass(false)}>
                                        镜像到另一侧
                                    </button>
                                </div>
                            </div>

                            <div className={`rounded-xl border p-3 ${showLowContrastWarning ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/70'}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="text-[11px] font-semibold text-slate-700">实时可读性评分：{activeContrastScore.grade}（{activeContrastScore.ratio.toFixed(2)}:1）</div>
                                            <div className={`text-[10px] mt-1 ${showLowContrastWarning ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                {showLowContrastWarning ? '文字可读性偏低，建议提升文字与背景对比。' : '当前文字与背景对比良好。'}
                                            </div>
                                        </div>
                                        {showLowContrastWarning && (
                                            <button onClick={oneClickFixContrast} className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors">
                                                一键修复
                                            </button>
                                        )}
                                    </div>
                                    {showCombinedRisk && (
                                        <div className="mt-2 text-[10px] text-rose-600 font-medium">
                                            组合风险：背景图透明层较强 + 对比度不足，可能在复杂壁纸上难以阅读。
                                        </div>
                                    )}
                            </div>

                            {/* Colors & Opacity */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">文字颜色</label><span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">推荐：自动对比</span></div>
                                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100"><input type="color" value={activeStyle.textColor} onChange={(e) => updateStyle('textColor', e.target.value)} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" /></div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">气泡颜色 (Base)</label><span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">推荐：同色系</span></div>
                                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        <input 
                                            type="color" 
                                            value={parsedBgColor.hex} 
                                            onChange={(e) => updateColorWithAlpha(e.target.value, parsedBgColor.alpha)} 
                                            className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Background Alpha (Transparency) */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">背景透明度 (Background Alpha)</label>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">推荐：85%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05" 
                                    value={parsedBgColor.alpha} 
                                    onChange={(e) => updateColorWithAlpha(parsedBgColor.hex, parseFloat(e.target.value))} 
                                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" 
                                />
                            </div>

                            {/* Padding (Compactness) */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">气泡大小/紧凑度 (Size/Padding)</label>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">推荐：12</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400">紧凑</span>
                                    <input 
                                        type="range" min="4" max="24" step="1" 
                                        value={paddingVal} 
                                        onChange={(e) => updatePadding(parseInt(e.target.value))} 
                                        className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" 
                                    />
                                    <span className="text-[10px] text-slate-400">宽敞</span>
                                </div>
                            </div>

                            {/* Border Radius */}
                            <div>
                                <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">圆角大小</label><span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">推荐：16 / 20</span></div>
                                <input type="range" min="0" max="30" value={activeStyle.borderRadius} onChange={(e) => updateStyle('borderRadius', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                            </div>

                            {/* Background Image Logic */}
                            <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer group relative h-24 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 overflow-hidden hover:border-primary/50 hover:text-primary transition-all">
                                {activeStyle.backgroundImage ? (
                                    <>
                                        <img src={activeStyle.backgroundImage} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                                        <span className="relative z-10 text-[10px] bg-white/80 px-2 py-1 rounded shadow-sm font-bold">更换底纹</span>
                                    </>
                                ) : <span className="text-xs font-bold">+ 上传底纹图片 (Texture)</span>}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'bg')} />
                                {activeStyle.backgroundImage && <button onClick={(e) => { e.stopPropagation(); updateStyle('backgroundImage', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full z-20">移除</button>}
                            </div>
                            {/* Background Image Opacity */}
                            {activeStyle.backgroundImage && (
                                <div>
                                    <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">底纹透明度</label><span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">推荐：35%~55%</span></div>
                                    <input type="range" min="0" max="1" step="0.05" value={activeStyle.backgroundImageOpacity ?? 0.5} onChange={(e) => updateStyle('backgroundImageOpacity', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
            )}
            </>
            )}

            {/* Discard unsaved changes confirm */}
            {pendingDiscardAction && (
                <div className="absolute inset-0 z-[999] bg-black/40 backdrop-blur-sm flex items-center justify-center px-6">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl">
                        <div className="text-base font-bold text-slate-700">有未保存的改动</div>
                        <p className="mt-2 text-sm text-slate-500">继续操作将丢失当前未保存的改动。</p>
                        <div className="mt-5 flex gap-3">
                            <button onClick={() => setPendingDiscardAction(null)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 text-slate-600 font-bold">取消</button>
                            <button onClick={() => { const action = pendingDiscardAction; setPendingDiscardAction(null); action(); }} className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white font-bold">放弃改动</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Low contrast confirm */}
            {showLowContrastConfirm && (
                <div className="absolute inset-0 z-[999] bg-black/40 backdrop-blur-sm flex items-center justify-center px-6">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl">
                        <div className="text-base font-bold text-slate-700">可读性评分极低</div>
                        <p className="mt-2 text-sm text-slate-500">当前文字与背景的对比度过低，可能导致聊天内容难以辨认。仍要保存此样式吗？</p>
                        <div className="mt-5 flex gap-3">
                            <button onClick={() => setShowLowContrastConfirm(false)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 text-slate-600 font-bold">再调整一下</button>
                            <button onClick={() => { setShowLowContrastConfirm(false); doSaveTheme(pendingSaveExit); }} className="flex-1 py-2.5 rounded-2xl bg-amber-500 text-white font-bold">仍然保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThemeMaker;
