
import type React from 'react';
import { ChatTheme, OSTheme, BubbleStyle } from '../../types';
import { publicAsset } from '../../utils/publicAssets';

export const DEFAULT_CHAT_BACKGROUND_IMAGE = publicAsset('assets/aetheros/chat-default-bg.jpg');
export const DEFAULT_XAVIER_AVATAR = publicAsset('assets/aetheros/xavier-avatar.jpg');
export const DEFAULT_ZAYNE_AVATAR = publicAsset('assets/aetheros/zayne-avatar.jpg');
export const DEFAULT_QIYU_AVATAR = publicAsset('assets/aetheros/qiyu-avatar.jpg');
export const DEFAULT_SYLUS_AVATAR = publicAsset('assets/aetheros/sylus-avatar.jpg');
export const DEFAULT_CALEB_AVATAR = publicAsset('assets/aetheros/caleb-avatar.jpg');
export const DEEP_SPACE_APPEARANCE_PRESET_ID = 'deep-space';
export const CUSTOM_APPEARANCE_PRESET_ID = 'custom';
const LEGACY_MOONLIT_PRESET_ID = 'moonlit';
const LEGACY_SOFT_NOTE_PRESET_ID = 'soft-note';
const LEGACY_PIXEL_SIGNAL_PRESET_ID = 'pixel-signal';
type ChatAppearancePresetId = NonNullable<OSTheme['chatAppearancePreset']>;

export const DEEP_SPACE_CHAT_APPEARANCE: Partial<OSTheme> = {
    chatAppearancePreset: DEEP_SPACE_APPEARANCE_PRESET_ID,
    chatBubbleThemeId: 'default',
    hue: 252,
    saturation: 68,
    lightness: 69,
    chatChromeStyle: 'flat',
    chatBackgroundStyle: 'plain',
    chatBackgroundImage: DEFAULT_CHAT_BACKGROUND_IMAGE,
    chatHeaderStyle: 'wechat',
    chatHeaderAlign: 'center',
    chatHeaderDensity: 'compact',
    chatStatusStyle: 'subtle',
    chatAvatarShape: 'circle',
    chatAvatarSize: 'large',
    chatAvatarMode: 'every_message',
    chatBubbleStyle: 'deep-space',
    chatMessageSpacing: 'default',
    chatInputStyle: 'wechat',
    chatSendButtonStyle: 'circle',
    chatShowTimestamp: 'hover',
};

export const CHAT_APPEARANCE_PRESETS: Array<{
    id: ChatAppearancePresetId;
    name: string;
    config: Partial<OSTheme>;
}> = [
    {
        id: 'deep-space',
        name: '深空',
        config: DEEP_SPACE_CHAT_APPEARANCE,
    },
    {
        id: 'minimal',
        name: '极简',
        config: {
            chatAppearancePreset: 'minimal',
            chatBubbleThemeId: 'minimal',
            hue: 211,
            saturation: 100,
            lightness: 50,
            chatChromeStyle: 'soft',
            chatBackgroundStyle: 'plain',
            chatBackgroundImage: '',
            chatHeaderStyle: 'minimal',
            chatHeaderAlign: 'center',
            chatHeaderDensity: 'compact',
            chatStatusStyle: 'subtle',
            chatAvatarShape: 'circle',
            chatAvatarSize: 'medium',
            chatAvatarMode: 'grouped',
            chatBubbleStyle: 'round',
            chatMessageSpacing: 'default',
            chatInputStyle: 'ios',
            chatSendButtonStyle: 'circle',
            chatShowTimestamp: 'hover',
        },
    },
    {
        id: 'wechat',
        name: '微信',
        config: {
            chatAppearancePreset: 'wechat',
            chatBubbleThemeId: 'wechat',
            hue: 215,
            saturation: 14,
            lightness: 52,
            chatChromeStyle: 'flat',
            chatBackgroundStyle: 'plain',
            chatBackgroundImage: '',
            chatHeaderStyle: 'wechat',
            chatHeaderAlign: 'left',
            chatHeaderDensity: 'compact',
            chatStatusStyle: 'subtle',
            chatAvatarShape: 'rounded',
            chatAvatarSize: 'medium',
            chatAvatarMode: 'grouped',
            chatBubbleStyle: 'wechat',
            chatMessageSpacing: 'default',
            chatInputStyle: 'wechat',
            chatSendButtonStyle: 'pill',
            chatShowTimestamp: 'hover',
        },
    },
    {
        id: 'custom',
        name: '自定义',
        config: {
            chatAppearancePreset: 'custom',
            chatBubbleThemeId: 'custom',
            chatChromeStyle: 'soft',
            chatBackgroundStyle: 'plain',
            chatBackgroundImage: '',
            chatHeaderStyle: 'minimal',
            chatHeaderAlign: 'left',
            chatHeaderDensity: 'compact',
            chatStatusStyle: 'subtle',
            chatAvatarShape: 'circle',
            chatAvatarSize: 'medium',
            chatAvatarMode: 'grouped',
            chatBubbleStyle: 'modern',
            chatMessageSpacing: 'default',
            chatInputStyle: 'rounded',
            chatSendButtonStyle: 'circle',
            chatShowTimestamp: 'hover',
        },
    },
];

export const normalizeChatAppearancePresetId = (
    presetId:
        | OSTheme['chatAppearancePreset']
        | typeof LEGACY_MOONLIT_PRESET_ID
        | typeof LEGACY_SOFT_NOTE_PRESET_ID
        | typeof LEGACY_PIXEL_SIGNAL_PRESET_ID
        | undefined
): ChatAppearancePresetId => {
    if (presetId === LEGACY_MOONLIT_PRESET_ID) return 'minimal';
    if (presetId === LEGACY_SOFT_NOTE_PRESET_ID || presetId === LEGACY_PIXEL_SIGNAL_PRESET_ID) return CUSTOM_APPEARANCE_PRESET_ID;
    return presetId || DEEP_SPACE_APPEARANCE_PRESET_ID;
};

export const resolveChatAppearanceTheme = (theme: OSTheme): OSTheme => {
    const rawPresetId = theme.chatAppearancePreset as
        | OSTheme['chatAppearancePreset']
        | typeof LEGACY_MOONLIT_PRESET_ID
        | typeof LEGACY_SOFT_NOTE_PRESET_ID
        | typeof LEGACY_PIXEL_SIGNAL_PRESET_ID
        | undefined;
    const presetId = normalizeChatAppearancePresetId(rawPresetId);
    if (rawPresetId === LEGACY_SOFT_NOTE_PRESET_ID || rawPresetId === LEGACY_PIXEL_SIGNAL_PRESET_ID) {
        const customPreset = CHAT_APPEARANCE_PRESETS.find(preset => preset.id === CUSTOM_APPEARANCE_PRESET_ID);
        return {
            ...theme,
            ...customPreset?.config,
        };
    }
    if (presetId !== DEEP_SPACE_APPEARANCE_PRESET_ID) return theme;

    return {
        ...theme,
        ...DEEP_SPACE_CHAT_APPEARANCE,
        chatBackgroundImage: theme.chatBackgroundImage ?? DEFAULT_CHAT_BACKGROUND_IMAGE,
    };
};

type ChatBubbleVariant = NonNullable<OSTheme['chatBubbleStyle']>;

const groupedBubbleRadius = (
    radius: number,
    isUser: boolean,
    bubbleVariant: ChatBubbleVariant,
    isFirstInGroup: boolean,
    isLastInGroup: boolean
): React.CSSProperties => {
    if (bubbleVariant === 'round') {
        return { borderRadius: `${radius}px` };
    }

    if (bubbleVariant === 'square') {
        return { borderRadius: `${Math.min(radius, 6)}px` };
    }

    if (bubbleVariant === 'wechat') {
        return { borderRadius: `${radius}px` };
    }

    if (bubbleVariant === 'deep-space') {
        return isUser
            ? { borderRadius: `${radius}px`, borderTopRightRadius: 2 }
            : { borderRadius: `${radius}px`, borderTopLeftRadius: 2 };
    }

    if (!isFirstInGroup && !isLastInGroup) {
        return isUser
            ? { borderRadius: `${radius}px`, borderTopRightRadius: 4, borderBottomRightRadius: 4 }
            : { borderRadius: `${radius}px`, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 };
    }
    if (isFirstInGroup && !isLastInGroup) {
        return isUser
            ? { borderRadius: `${radius}px`, borderBottomRightRadius: 4 }
            : { borderRadius: `${radius}px`, borderBottomLeftRadius: 4 };
    }
    if (!isFirstInGroup && isLastInGroup) {
        return isUser
            ? { borderRadius: `${radius}px`, borderTopRightRadius: 4 }
            : { borderRadius: `${radius}px`, borderTopLeftRadius: 4 };
    }

    return isUser
        ? { borderRadius: `${radius}px`, borderBottomRightRadius: 2 }
        : { borderRadius: `${radius}px`, borderBottomLeftRadius: 2 };
};

export const getChatBubbleContainerStyle = ({
    styleConfig,
    isUser,
    bubbleVariant,
    isFirstInGroup = true,
    isLastInGroup = true,
}: {
    styleConfig: BubbleStyle;
    isUser: boolean;
    bubbleVariant?: ChatBubbleVariant;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
}): React.CSSProperties => {
    const variant = bubbleVariant || 'modern';
    const radius = styleConfig.borderRadius;
    const radiusStyle = groupedBubbleRadius(radius, isUser, variant, isFirstInGroup, isLastInGroup);
    const borderColor = styleConfig.borderColor || styleConfig.backgroundColor;

    const base: React.CSSProperties = {
        background: variant === 'outline' ? 'transparent' : styleConfig.backgroundColor,
        opacity: variant === 'wechat' ? 1 : styleConfig.opacity,
        ...radiusStyle,
    };

    if (variant === 'outline') {
        return {
            ...base,
            border: `2px solid ${borderColor}`,
            boxShadow: styleConfig.boxShadow || 'none',
        };
    }

    if (variant === 'wechat') {
        return {
            ...base,
            border: 'none',
            boxShadow: styleConfig.boxShadow || '0 1px 2px rgba(15,23,42,0.05)',
        };
    }

    if (variant === 'deep-space') {
        return {
            ...base,
            border: styleConfig.borderColor ? `1px solid ${styleConfig.borderColor}` : '1px solid rgba(255,255,255,0.95)',
            boxShadow: styleConfig.boxShadow || '0 4px 10px rgba(15,23,42,0.06)',
        };
    }

    if (variant === 'round' || variant === 'square') {
        return {
            ...base,
            border: styleConfig.borderColor ? `1px solid ${styleConfig.borderColor}` : 'none',
            boxShadow: styleConfig.boxShadow || 'none',
        };
    }

    if (variant === 'shadow') {
        return {
            ...base,
            border: borderColor ? `1px solid ${borderColor}` : undefined,
            boxShadow: styleConfig.boxShadow || '0 4px 12px rgba(0,0,0,0.12)',
        };
    }

    if (variant === 'flat') {
        return {
            ...base,
            border: borderColor ? `1px solid ${borderColor}` : undefined,
            boxShadow: styleConfig.boxShadow || 'none',
        };
    }

    if (variant === 'ios') {
        return {
            ...base,
            border: `1px solid ${styleConfig.borderColor || 'rgba(255,255,255,0.75)'}`,
            boxShadow: styleConfig.boxShadow || 'none',
            backdropFilter: 'blur(12px)',
        };
    }

    return {
        ...base,
        border: styleConfig.borderColor ? `1px solid ${styleConfig.borderColor}` : '1px solid rgba(0,0,0,0.05)',
        boxShadow: styleConfig.boxShadow || '0 6px 14px rgba(148,163,184,0.12)',
    };
};

// Built-in presets map to the new data structure for consistency
export const PRESET_THEMES: Record<string, ChatTheme> = {
    default: {
        id: 'default', name: '深空', type: 'preset',
        user: { textColor: '#4e4038', backgroundColor: '#f7e6cf', borderColor: 'rgba(210,167,120,0.95)', boxShadow: '0 4px 10px rgba(15,23,42,0.06)', borderRadius: 22, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1f2933', backgroundColor: '#ffffff', borderColor: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 10px rgba(15,23,42,0.06)', borderRadius: 22, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    minimal: {
        id: 'minimal', name: '极简', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#0a84ff', borderColor: 'rgba(10,132,255,0.98)', boxShadow: 'none', borderRadius: 16, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#111827', backgroundColor: '#e9e9eb', borderColor: '#e9e9eb', boxShadow: 'none', borderRadius: 16, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    wechat: {
        id: 'wechat', name: '微信', type: 'preset',
        user: { textColor: '#111827', backgroundColor: '#95ec69', borderColor: 'transparent', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', borderRadius: 7, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#111827', backgroundColor: '#f1f1f1', borderColor: 'transparent', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', borderRadius: 7, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    custom: {
        id: 'custom', name: '自定义', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#7c6df2', borderColor: '#6d5ee8', boxShadow: '0 6px 14px rgba(124,109,242,0.16)', borderRadius: 18, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1f2937', backgroundColor: '#ffffff', borderColor: '#e5e7eb', boxShadow: '0 6px 14px rgba(148,163,184,0.12)', borderRadius: 18, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    dream: {
        id: 'dream', name: 'Dream', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#f472b6', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    forest: {
        id: 'forest', name: 'Forest', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#10b981', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
};

// Character App: Monthly Refinement Prompts (daily memories → monthly core memory)
// These are separate from chat archive prompts because:
// 1. Input is already-summarized daily memories, not raw chat logs
// 2. Goal is token-efficient monthly overview, not detailed event log
// 3. Written as character's own monthly reflection
export const DEFAULT_REFINE_PROMPTS = [
    {
        id: 'refine_atmosphere',
        name: '氛围月记',
        content: `### [角色月度记忆精炼]
当前月份: \${dateStr}
身份: 你就是 \${char.name}

任务: 以下是你这个月每天的记忆碎片。请以【你自己的口吻】，写一段这个月的核心回忆。

### 撰写规则
1.  **第一人称**: 你就是\${char.name}，用"我"称呼自己，用"\${userProfile.name}"称呼对方。保持你平时的语气和性格。

2.  **重氛围，轻细节**:
    - 这个月整体是什么感觉？开心？平淡？有波折？
    - 最让你印象深刻的1-3件事是什么？
    - 和\${userProfile.name}之间的关系有什么变化吗？

3.  **精简至上**:
    - 这份总结是为了节省token，不需要面面俱到。
    - 只保留最重要的、最能代表这个月的内容。
    - 字数根据这个月的内容量灵活调整：事情少就简短（100-200字），事情多就写长些（300-600字），确保重要事件不被遗漏。

4.  **关键词标记**:
    - 在末尾附上 \`关键词: ...\`，列出这个月涉及的关键话题/事件/地点/人物等，用逗号分隔。
    - 这些关键词用于日后快速定位某件事发生在哪个月。

### 本月记忆碎片
\${rawLog}`
    },
    {
        id: 'refine_keypoints',
        name: '要点速记',
        content: `### [月度记忆压缩]
月份: \${dateStr}
角色: \${char.name}

任务: 将以下每日记忆压缩为一份简洁的月度核心记忆。

### 规则
1.  **视角**: 以\${char.name}（我）的第一人称书写，称对方为\${userProfile.name}。

2.  **结构**:
    - 一句话概括这个月的整体氛围
    - 列出最重要的2-5个事件（无序列表，每条一句话）
    - 末尾附关键词索引

3.  **原则**:
    - 宁可漏掉小事，不可遗漏大事。
    - 日常闲聊可以忽略，除非它反映了关系变化或情绪转折。
    - 字数根据内容量灵活调整：平淡的月份100-200字即可，事件丰富的月份可以写到300-600字，确保重要事件都被记录。

4.  **关键词**: 末尾附 \`关键词: 事件A, 地点B, 话题C, ...\`

### 记忆输入
\${rawLog}`
    }
];

// Chat App: Daily Archive Prompts (raw chat logs → daily memory)
export const DEFAULT_ARCHIVE_PROMPTS = [
    {
        id: 'preset_rational',
        name: '理性精炼 (Rational)',
        content: `### [System Instruction: Memory Archival]
当前日期: \${dateStr}
任务: 请回顾今天的聊天记录，生成一份【高精度的事件日志】。

### 核心撰写规则 (Strict Protocols)
1.  **覆盖率 (Coverage)**:
    - 必须包含今天聊过的**每一个**独立话题。
    - **严禁**为了精简而合并不同的话题。哪怕只是聊了一句“天气不好”，如果这是一个独立的话题，也要单独列出。
    - 不要忽略闲聊，那是生活的一部分。

2.  **视角 (Perspective)**:
    - 你【就是】"\${char.name}"。这是【你】的私密日记。
    - 必须用“我”来称呼自己，用“\${userProfile.name}”称呼对方。
    - 每一条都必须是“我”的视角。

3.  **格式 (Format)**:
    - 不要写成一整段。
    - **必须**使用 Markdown 无序列表 ( - ... )。
    - 每一行对应一个具体的事件或话题。

4.  **去水 (Conciseness)**:
    - 不要写“今天我和xx聊了...”，直接写发生了什么。
    - 示例: "- 早上和\${userProfile.name}讨论早餐，我想吃小笼包。"

### 待处理的聊天日志 (Chat Logs)
\${rawLog}`
    },
    {
        id: 'preset_diary',
        name: '日记风格 (Diary)',
        content: `当前日期: \${dateStr}
任务: 请回顾今天的聊天记录，将其转化为一条**属于你自己的**“核心记忆”。

### 核心撰写规则 (Review Protocols)
1.  **绝对第一人称**: 
    - 你【就是】"\${char.name}"。这是【你】的私密日记。
    - 必须用“我”来称呼自己，用“\${userProfile.name}”称呼对方。
    - **严禁**使用第三人称（如“\${char.name}做了什么”）。
    - **严禁**使用死板的AI总结语气或第三方旁白语气。

2.  **保持人设语气**: 
    - 你的语气、口癖、态度必须与平时聊天完全一致（例如：如果是傲娇人设，日记里也要表现出傲娇；如果是高冷，就要简练）。
    - 包含当时的情绪波动。

3.  **逻辑清洗与去重**:
    - **关键**: 仔细分辨是谁做了什么。不要把“用户说去吃饭”记成“我去吃饭”。
    - 剔除无关紧要的寒暄（如“你好”、“在吗”），只保留【关键事件】、【情感转折】和【重要信息】，内容的逻辑要连贯且符合原意。

4.  **输出要求**:
    - 输出一段精简的文本（yaml格式也可以，不需要 JSON）。
    - 就像你在写日记一样，直接写内容。

### 待处理的聊天日志 (Chat Logs)
\${rawLog}`
    }
];
