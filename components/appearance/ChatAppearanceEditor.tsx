import React, { useRef } from 'react';
import { OSTheme } from '../../types';
import { processImage } from '../../utils/file';
import {
    CHAT_APPEARANCE_PRESETS,
    CUSTOM_APPEARANCE_PRESET_ID,
    DEFAULT_CHAT_BACKGROUND_IMAGE,
    DEFAULT_QIYU_AVATAR,
    DEEP_SPACE_APPEARANCE_PRESET_ID,
    PRESET_THEMES,
    getChatBubbleContainerStyle,
    normalizeChatAppearancePresetId,
    resolveChatAppearanceTheme,
} from '../chat/ChatConstants';

type Props = {
    theme: OSTheme;
    updateTheme: (updates: Partial<OSTheme>) => void;
    onCustomPresetSelect?: () => void;
};

const defaults = {
    chatAvatarShape: 'circle',
    chatAvatarSize: 'medium',
    chatAvatarMode: 'grouped',
    chatBubbleStyle: 'modern',
    chatMessageSpacing: 'default',
    chatShowTimestamp: 'hover',
    chatHeaderStyle: 'default',
    chatInputStyle: 'default',
    chatChromeStyle: 'soft',
    chatBackgroundStyle: 'plain',
    chatHeaderAlign: 'left',
    chatHeaderDensity: 'default',
    chatStatusStyle: 'subtle',
    chatSendButtonStyle: 'circle',
} as const;

const groupClass = 'rounded-3xl border border-slate-100 bg-white p-5 shadow-sm';

const cardButton = (active: boolean) =>
    `rounded-2xl border px-3 py-2 text-left transition-all active:scale-[0.98] ${
        active ? 'border-primary/40 bg-primary/10 text-primary shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
    }`;

const avatarClass = (shape: string, size: string) => {
    const sizeClass = size === 'small' ? 'h-7 w-7' : size === 'large' ? 'h-12 w-12' : 'h-9 w-9';
    const radiusClass = shape === 'square' ? 'rounded-sm' : shape === 'rounded' ? 'rounded-xl' : 'rounded-full';
    return `${sizeClass} ${radiusClass}`;
};

const shellClass = (style: string) => {
    if (style === 'flat') return 'border border-slate-200 shadow-none';
    if (style === 'floating') return 'border border-white/70 shadow-[0_22px_60px_rgba(148,163,184,0.28)]';
    if (style === 'pixel') return 'border-[3px] border-[#7b5a40] shadow-[6px_6px_0_rgba(123,90,64,0.24)]';
    return 'border border-white/70 shadow-[0_15px_40px_rgba(148,163,184,0.18)]';
};

const backgroundStyleForPreview = (style: string, chrome: string, image?: string): React.CSSProperties => {
    if (image) {
        return {
            backgroundColor: image === DEFAULT_CHAT_BACKGROUND_IMAGE ? '#e7e5e4' : '#eef0f3',
            backgroundImage: `linear-gradient(rgba(245,245,245,0.10), rgba(245,245,245,0.10)), url(${image})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
        };
    }

    const base = chrome === 'pixel' ? '#efe1cf' : '#f8fafc';
    if (style === 'grid') {
        return {
            backgroundColor: base,
            backgroundImage:
                'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
        };
    }
    if (style === 'paper') {
        return {
            backgroundColor: chrome === 'pixel' ? '#f4e8d9' : '#f9f7f2',
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)',
            backgroundSize: '16px 16px',
        };
    }
    if (style === 'mesh') {
        return {
            backgroundColor: '#f8fafc',
            backgroundImage:
                'radial-gradient(circle at 15% 20%, rgba(59,130,246,0.18), transparent 28%), radial-gradient(circle at 85% 15%, rgba(244,114,182,0.18), transparent 24%), radial-gradient(circle at 60% 75%, rgba(45,212,191,0.18), transparent 26%)',
        };
    }
    return { backgroundColor: base };
};

const previewBubbleConfig = (bubble: string, isUser: boolean, theme: OSTheme) => {
    const presetId = normalizeChatAppearancePresetId(theme.chatAppearancePreset);
    const fallbackThemeId = presetId === DEEP_SPACE_APPEARANCE_PRESET_ID ? 'default' : presetId;
    const themeId = theme.chatBubbleThemeId && PRESET_THEMES[theme.chatBubbleThemeId] ? theme.chatBubbleThemeId : fallbackThemeId;
    const activeTheme = PRESET_THEMES[themeId] || PRESET_THEMES.default;
    const styleConfig = isUser ? activeTheme.user : activeTheme.ai;
    const visualBubble = presetId === DEEP_SPACE_APPEARANCE_PRESET_ID ? 'deep-space' : activeTheme.id === 'wechat' && bubble === 'square' ? 'wechat' : bubble;
    const isCompactBubble = visualBubble === 'wechat' || visualBubble === 'deep-space';
    return {
        isWechatBubble: visualBubble === 'wechat',
        styleConfig,
        style: {
            ...getChatBubbleContainerStyle({
                styleConfig,
                isUser,
                bubbleVariant: visualBubble as OSTheme['chatBubbleStyle'],
            }),
            color: styleConfig.textColor,
            minHeight: isCompactBubble ? 32 : undefined,
            padding: isCompactBubble ? '7px 12px' : '10px 14px',
            maxWidth: visualBubble === 'wechat' ? '78%' : '72%',
            fontSize: 10,
            lineHeight: isCompactBubble ? 1.32 : 1.4,
        },
    };
};

const previewSendButtonClass = (presetId: OSTheme['chatAppearancePreset'], sendButtonStyle: string) => {
    if (presetId === 'wechat') {
        return sendButtonStyle === 'pill'
            ? 'bg-slate-200 text-[9px] text-slate-600 shadow-none'
            : 'bg-transparent text-[10px] text-slate-500 border border-slate-200';
    }
    if (presetId === 'minimal') return 'bg-[#0a84ff] text-[10px] text-white shadow-sm';
    if (presetId === 'deep-space') return 'bg-[#a89ef2] text-[10px] text-white shadow-sm';
    return 'bg-primary text-[10px] text-white shadow-sm';
};

export const ChatAppearanceEditor: React.FC<Props> = ({ theme, updateTheme, onCustomPresetSelect }) => {
    const bgInputRef = useRef<HTMLInputElement>(null);
    const effectiveTheme = resolveChatAppearanceTheme(theme);
    const activePresetId = normalizeChatAppearancePresetId(theme.chatAppearancePreset);
    const avatarShape = effectiveTheme.chatAvatarShape || defaults.chatAvatarShape;
    const avatarSize = effectiveTheme.chatAvatarSize || defaults.chatAvatarSize;
    const avatarMode = effectiveTheme.chatAvatarMode || defaults.chatAvatarMode;
    const bubbleStyle = effectiveTheme.chatBubbleStyle || defaults.chatBubbleStyle;
    const messageSpacing = effectiveTheme.chatMessageSpacing || defaults.chatMessageSpacing;
    const showTimestamp = effectiveTheme.chatShowTimestamp || defaults.chatShowTimestamp;
    const inputStyle = effectiveTheme.chatInputStyle || defaults.chatInputStyle;
    const sendButtonStyle = effectiveTheme.chatSendButtonStyle || defaults.chatSendButtonStyle;
    const chromeStyle = effectiveTheme.chatChromeStyle || defaults.chatChromeStyle;
    const backgroundStyle = effectiveTheme.chatBackgroundStyle || defaults.chatBackgroundStyle;
    const chatBackgroundImage = effectiveTheme.chatBackgroundImage ?? DEFAULT_CHAT_BACKGROUND_IMAGE;
    const headerStyle = effectiveTheme.chatHeaderStyle || defaults.chatHeaderStyle;
    const headerAlign = effectiveTheme.chatHeaderAlign || defaults.chatHeaderAlign;

    const handleBackgroundUpload = async (file: File) => {
        try {
            const dataUrl = await processImage(file, { skipCompression: true });
            updateTheme({ chatBackgroundImage: dataUrl, chatBackgroundStyle: 'plain' });
        } catch (error) {
            console.error('Failed to update chat background', error);
        }
    };

    const previewGap = messageSpacing === 'compact' ? 'gap-1.5' : messageSpacing === 'spacious' ? 'gap-4' : 'gap-2.5';
    const previewMessages = [
        { id: 'ai-1', role: 'assistant', text: '除了打流浪体，你们深空猎人还有哪些业务？' },
        { id: 'user-1', role: 'user', text: '我们不受理其他的个人业务。' },
        { id: 'ai-2', role: 'assistant', text: '那就好，这样你就有空完成我给你的任务了。' },
    ] as const;
    const previewAvatarClass = bubbleStyle === 'wechat' || bubbleStyle === 'deep-space' ? 'h-8 w-8 rounded-full' : avatarClass(avatarShape, avatarSize);
    const previewShellStyle = backgroundStyleForPreview(backgroundStyle, chromeStyle, chatBackgroundImage);
    const isWechatPreset = activePresetId === 'wechat';
    const isDeepSpacePreset = activePresetId === DEEP_SPACE_APPEARANCE_PRESET_ID;
    const isCenteredHeader = headerAlign === 'center' || headerStyle === 'minimal';
    const previewHeaderClass = isWechatPreset
          ? 'border-b border-black/10 bg-[#ededed] px-3 pt-4 pb-2'
          : 'border-b border-black/5 bg-[#f7f7f7]/95 px-3 pt-5 pb-1';
    const previewHeaderStyle: React.CSSProperties | undefined =
        isDeepSpacePreset
            ? {
                backgroundColor: 'rgba(247,247,247,0.76)',
                backgroundImage: 'none',
                backdropFilter: 'blur(4px)',
                borderBottomColor: 'transparent',
                boxShadow: 'none',
              }
            : undefined;
    const previewTitleClass = 'text-slate-800';
    const previewSubtitleClass = 'text-[#8fa0b4]';
    const previewHeaderAvatarClass = `${avatarClass(avatarShape, avatarSize)} shrink-0 object-cover`;
    const handlePresetClick = (preset: (typeof CHAT_APPEARANCE_PRESETS)[number]) => {
        if (preset.id === CUSTOM_APPEARANCE_PRESET_ID && onCustomPresetSelect) {
            onCustomPresetSelect();
            return;
        }
        updateTheme(preset.config);
    };

    return (
        <div className="space-y-5">
            <section className={groupClass}>
                <div className="mb-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">聊天主题</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CHAT_APPEARANCE_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => handlePresetClick(preset)}
                            className={`cursor-pointer rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                                activePresetId === preset.id
                                    ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/30 hover:bg-white'
                            }`}
                        >
                            <div className="text-xs font-bold">{preset.name}</div>
                        </button>
                    ))}
                </div>
            </section>

            <section className={groupClass}>
                <div className="mb-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">实时预览</h2>
                </div>
                <div className={`mx-auto w-full max-w-[300px] overflow-hidden rounded-[22px] ${shellClass(chromeStyle)}`} style={previewShellStyle}>
                    <div className={previewHeaderClass} style={previewHeaderStyle}>
                        <div className="relative min-h-[44px]">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-bold leading-none text-slate-400">‹</div>
                            <div className={`mx-8 flex min-w-0 ${isCenteredHeader ? 'flex-col items-center justify-center text-center' : 'items-center justify-start gap-2.5 text-left'}`}>
                                {!isCenteredHeader && (
                                    <img
                                        src={DEFAULT_QIYU_AVATAR}
                                        className={previewHeaderAvatarClass}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                    />
                                )}
                                <div className="min-w-0">
                                    <div className={`text-[13px] font-bold leading-none ${previewTitleClass}`}>祁煜</div>
                                    <div className={`mt-1 max-w-full truncate text-[8px] font-semibold leading-[1.2] ${previewSubtitleClass}`}>
                                        乱是智慧的象征，没有哪个天才的桌面是整洁的。
                                    </div>
                                </div>
                            </div>
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-base font-bold leading-none text-indigo-500">ϟ</div>
                        </div>
                    </div>
                    <div className={`flex min-h-[136px] flex-col p-3 ${previewGap}`}>
                        {previewMessages.map((message, index) => {
                            const isUser = message.role === 'user';
                            const nextRole = index < previewMessages.length - 1 ? previewMessages[index + 1].role : null;
                            const shouldShowAvatar = avatarMode === 'every_message' || nextRole !== message.role;
                            const bubbleConfig = previewBubbleConfig(bubbleStyle, isUser, effectiveTheme);
                            return (
                                <div key={message.id} className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : ''}`}>
                                    {!isUser && (
                                        <img
                                            src={DEFAULT_QIYU_AVATAR}
                                            className={`${previewAvatarClass} shrink-0 object-cover ring-1 ring-black/5 ${shouldShowAvatar ? '' : 'opacity-0'}`}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    )}
                                    <div className={`relative ${bubbleConfig.isWechatBubble ? 'overflow-visible' : ''}`} style={bubbleConfig.style}>
                                        {bubbleConfig.isWechatBubble && (
                                            <span
                                                aria-hidden="true"
                                                className={`absolute top-[9px] h-[10px] w-[7px] ${isUser ? '-right-[5px]' : '-left-[5px]'}`}
                                                style={{
                                                    backgroundColor: bubbleConfig.styleConfig.backgroundColor,
                                                    clipPath: isUser
                                                        ? 'polygon(0 0, 100% 50%, 0 100%)'
                                                        : 'polygon(100% 0, 0 50%, 100% 100%)',
                                                }}
                                            />
                                        )}
                                        {message.text}
                                        {showTimestamp === 'always' && nextRole !== message.role && (
                                            <div className={`mt-1 text-right text-[8px] ${isUser ? 'opacity-70' : 'opacity-55'}`}>{isUser ? '14:33' : '14:32'}</div>
                                        )}
                                    </div>
                                    {isUser && (
                                        <div className={`${previewAvatarClass} flex shrink-0 items-center justify-center bg-[#a8ead7] text-[14px] font-bold text-white ring-1 ring-black/5 ${shouldShowAvatar ? '' : 'opacity-0'}`}>
                                            U
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="border-t border-slate-100 bg-white/80 px-2.5 py-2">
                        <div className="flex items-end gap-1.5">
                            <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500">+</button>
                            <div className={`flex min-h-7 flex-1 items-center px-3 text-[9px] text-slate-400 ${inputStyle === 'wechat' ? 'rounded-full border border-slate-200 bg-white' : 'rounded-full bg-slate-100'}`}>
                                输入消息...
                            </div>
                            <button className={`flex shrink-0 items-center justify-center rounded-full ${sendButtonStyle === 'pill' ? 'h-7 min-w-10 px-2' : 'h-7 w-7'} ${previewSendButtonClass(activePresetId, sendButtonStyle)}`}>
                                <span className={sendButtonStyle === 'pill' ? 'px-2 text-[8px] font-bold' : ''}>
                                    {sendButtonStyle === 'pill' ? '发送' : '➤'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section className={groupClass}>
                <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">默认背景图</div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => bgInputRef.current?.click()}
                        className="h-24 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm active:scale-[0.98]"
                        style={{
                            backgroundImage: chatBackgroundImage ? `url(${chatBackgroundImage})` : 'none',
                            backgroundSize: '100% 100%',
                            backgroundPosition: 'center center',
                            backgroundRepeat: 'no-repeat',
                        }}
                        aria-label="上传默认聊天背景"
                    />
                    <div className="flex flex-1 flex-wrap gap-2">
                        <button type="button" onClick={() => bgInputRef.current?.click()} className={cardButton(false)}>
                            <div className="text-[11px] font-bold">上传</div>
                        </button>
                        <button type="button" onClick={() => updateTheme({ chatBackgroundImage: DEFAULT_CHAT_BACKGROUND_IMAGE, chatBackgroundStyle: 'plain' })} className={cardButton(chatBackgroundImage === DEFAULT_CHAT_BACKGROUND_IMAGE)}>
                            <div className="text-[11px] font-bold">恢复默认</div>
                        </button>
                        <button type="button" onClick={() => updateTheme({ chatBackgroundImage: '', chatBackgroundStyle: 'plain' })} className={cardButton(chatBackgroundImage === '')}>
                            <div className="text-[11px] font-bold">纯色</div>
                        </button>
                    </div>
                </div>
                <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleBackgroundUpload(file);
                        event.target.value = '';
                    }}
                />
            </section>
        </div>
    );
};
