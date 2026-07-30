
import React, { useLayoutEffect, useRef, useState } from 'react';
import { ShareNetwork, Trash, Plus, Smiley, PaperPlaneTilt, Money, BookOpenText, GearSix, Image, Lock, ArrowsClockwise, ArrowsOutSimple, ChatCircleDots, SmileyWink } from '@phosphor-icons/react';
import { CharacterProfile, EmojiCategory, Emoji, OSTheme } from '../../types';
import { isIOSStandaloneWebApp } from '../../utils/iosStandalone';
import { categoryHasRestrictedVisibility } from '../../utils/emojiVisibility';

interface ChatInputAreaProps {
    input: string;
    setInput: (v: string) => void;
    isTyping: boolean;
    selectionMode: boolean;
    showPanel: 'none' | 'actions' | 'emojis' | 'chars';
    setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
    onSend: () => void;
    onDeleteSelected: () => void;
    onForwardSelected?: () => void;
    selectedCount: number;
    emojis: Emoji[];
    characters: CharacterProfile[];
    activeCharacterId: string;
    onCharSelect: (id: string) => void;
    onPanelAction: (type: string, payload?: any) => void;
    onImageSelect: (file: File) => void;
    isSummarizing: boolean;
    // Categories Support
    categories?: EmojiCategory[];
    activeCategory?: string;
    // Reroll Support
    onReroll: () => void;
    canReroll: boolean;
    // Proactive messaging
    isProactiveActive?: boolean;
    // Emotion
    isEmotionEnabled?: boolean;
    // Input style
    inputStyle?: 'default' | 'rounded' | 'flat' | 'wechat' | 'ios' | 'pixel';
    sendButtonStyle?: 'circle' | 'pill' | 'minimal';
    chromeStyle?: 'soft' | 'flat' | 'floating' | 'pixel';
    appearancePreset?: OSTheme['chatAppearancePreset'];
    onExpandInput: () => void;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
    input, setInput, isTyping, selectionMode,
    showPanel, setShowPanel, onSend, onDeleteSelected, onForwardSelected, selectedCount,
    emojis, characters, activeCharacterId, onCharSelect,
    onPanelAction, onImageSelect, isSummarizing,
    categories = [], activeCategory = 'default',
    onReroll, canReroll,
    isProactiveActive,
    isEmotionEnabled,
    inputStyle = 'default',
    sendButtonStyle = 'circle',
    chromeStyle = 'soft',
    appearancePreset = 'custom',
    onExpandInput,
}) => {
    const chatImageInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 }); 
    const isLongPressTriggered = useRef(false); // Track if long press action fired
    const useIOSStandaloneInputFix = isIOSStandaloneWebApp();
    const [canExpandInput, setCanExpandInput] = useState(false);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const collapsedMaxHeight = 72;
        textarea.style.height = '0px';
        const measuredHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.min(measuredHeight, collapsedMaxHeight)}px`;
        textarea.style.overflowY = measuredHeight > collapsedMaxHeight ? 'auto' : 'hidden';
        setCanExpandInput(input.includes('\n') || measuredHeight > collapsedMaxHeight);
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'chat' | 'bg') => {
        const file = e.target.files?.[0];
        if (file) {
            onImageSelect(file);
        }
        if (e.target) e.target.value = ''; // Reset
    };

    // --- Unified Touch/Long-Press Logic ---
    
    const clearTimer = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTouchStart = (item: any, type: 'emoji' | 'category', e: React.TouchEvent | React.MouseEvent) => {
        // 1. Always reset state first to ensure clean slate for any interaction
        // This fixes the bug where deleting a category leaves the flag true, blocking clicks on system categories
        clearTimer(); 
        isLongPressTriggered.current = false;

        // 2. Skip long-press for the default category (no options needed)
        if (type === 'category' && item.id === 'default') return;
        
        // 3. Store coordinates and start timer for valid long-press candidates
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            isLongPressTriggered.current = true;
            // Trigger action
            if (type === 'emoji') {
                onPanelAction('delete-emoji-req', item);
            } else {
                onPanelAction('category-options', item);
            }
        }, 500); // 500ms threshold
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const diffX = Math.abs(clientX - startPos.current.x);
        const diffY = Math.abs(clientY - startPos.current.y);

        // Cancel long press if moved more than 10px (scrolling)
        if (diffX > 10 || diffY > 10) {
            clearTimer();
        }
    };

    const handleTouchEnd = () => {
        clearTimer();
    };

    // Wrapper for Click to prevent conflicts
    const handleItemClick = (e: React.MouseEvent, item: any, type: 'emoji' | 'category') => {
        // If long press action triggered, block the click event (do not send)
        if (isLongPressTriggered.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // If click happens, ensure timer is cleared (prevents "Send then Pop up" ghost issue)
        clearTimer();

        if (type === 'emoji') {
            onPanelAction('send-emoji', item);
        } else {
            onPanelAction('select-category', item.id);
        }
    };

    const handleInputFocus = () => {
        if (!useIOSStandaloneInputFix) return;
        setShowPanel('none');
        const textarea = textareaRef.current;
        if (!textarea) return;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (document.activeElement !== textarea) return;
                try {
                    textarea.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } catch {
                    // Older iOS builds can throw on unsupported scroll options.
                }
            });
        });
    };

    const isPixelStyle = inputStyle === 'pixel' || chromeStyle === 'pixel';
    const compactControlHeightClass = 'h-[46px]';
    const compactSquareControlClass = `${compactControlHeightClass} w-[46px]`;
    const compactInputMinHeightClass = 'min-h-[46px]';
    const shellClass = chromeStyle === 'pixel'
        ? 'bg-[#eadfce] border-t-[3px] border-[#8f674a] shadow-[0_-4px_0_rgba(123,90,64,0.15)]'
        : chromeStyle === 'flat'
          ? 'bg-white/30 backdrop-blur-xl border-t border-white/50 shadow-none'
          : chromeStyle === 'floating'
            ? 'bg-white/25 backdrop-blur-2xl border-t border-white/45 shadow-[0_-10px_24px_rgba(148,163,184,0.10)]'
            : 'bg-white/28 backdrop-blur-2xl border-t border-white/45 shadow-[0_-8px_22px_rgba(148,163,184,0.08)]';
    const actionButtonClass = isPixelStyle
        ? `${compactSquareControlClass} shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#f8f0e0] flex items-center justify-center text-[#8f674a] hover:bg-[#fff7ed] transition-colors`
        : `${compactSquareControlClass} shrink-0 rounded-full bg-white/35 backdrop-blur-md border border-white/45 flex items-center justify-center text-slate-500 hover:bg-white/55 transition-colors`;
    const inputWrapClass =
        inputStyle === 'rounded'
            ? 'bg-white/38 border border-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] rounded-full'
            : inputStyle === 'flat'
              ? 'bg-white/15 border-b border-white/55 rounded-none'
              : inputStyle === 'wechat'
                ? 'bg-white/45 border border-white/55 rounded-full'
                : inputStyle === 'ios'
                  ? 'bg-white/42 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] rounded-[26px]'
                  : inputStyle === 'pixel'
                    ? 'bg-[#f8f0e0] border-2 border-[#8f674a] rounded-[4px]'
                    : 'bg-white/38 border border-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] rounded-[24px]';
    const sendButtonTone =
        appearancePreset === 'deep-space'
            ? {
                circle: 'bg-[#a89ef2] text-white shadow-lg shadow-[#a89ef2]/24',
                minimal: 'bg-transparent text-[#8b7cf6]',
                pill: 'bg-[#a89ef2] text-white shadow-lg shadow-[#a89ef2]/24',
              }
            : appearancePreset === 'minimal'
              ? {
                circle: 'bg-[#0a84ff] text-white shadow-lg shadow-blue-200',
                minimal: 'bg-transparent text-[#0a84ff]',
                pill: 'bg-[#0a84ff] text-white shadow-lg shadow-blue-200',
              }
              : appearancePreset === 'wechat'
                ? {
                  circle: 'bg-transparent text-slate-500 border border-slate-200 shadow-none',
                  minimal: 'bg-transparent text-slate-500',
                  pill: 'bg-slate-200 text-slate-600 shadow-none',
                }
                : {
                  circle: 'bg-primary text-white shadow-lg',
                  minimal: 'bg-transparent text-primary',
                  pill: 'bg-primary text-white shadow-lg',
                };
    const sendButtonClass =
        sendButtonStyle === 'pill'
            ? isPixelStyle
                ? `${compactControlHeightClass} min-w-[72px] shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#c99872] px-4 text-[11px] font-bold text-[#fff7ed]`
                : `${compactControlHeightClass} min-w-[72px] shrink-0 rounded-full px-4 text-[11px] font-bold ${sendButtonTone.pill}`
            : sendButtonStyle === 'minimal'
              ? isPixelStyle
                ? `${compactSquareControlClass} shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#c99872] text-[#fff7ed] flex items-center justify-center`
                : `${compactSquareControlClass} shrink-0 rounded-full flex items-center justify-center ${sendButtonTone.minimal}`
              : isPixelStyle
                ? `${compactSquareControlClass} shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#c99872] text-[#fff7ed] flex items-center justify-center`
                : `${compactSquareControlClass} shrink-0 rounded-full flex items-center justify-center transition-all ${sendButtonTone.circle}`;
    const panelClass = isPixelStyle
        ? 'bg-[#f8f0e0] border-t-2 border-[#8f674a]'
        : 'bg-slate-50 border-t border-slate-200/60';
    const panelTopBarClass = isPixelStyle
        ? 'h-10 bg-[#eadfce] border-b-2 border-[#8f674a] flex items-center px-2 gap-2 overflow-x-auto no-scrollbar shrink-0'
        : 'h-10 bg-white border-b border-slate-100 flex items-center px-2 gap-2 overflow-x-auto no-scrollbar shrink-0';
    const inactiveCategoryClass = isPixelStyle
        ? 'bg-[#f3e7d6] text-[#8f674a] border border-[#8f674a]/30'
        : 'bg-slate-100 text-slate-500 border border-transparent';
    const activeCategoryClass = isPixelStyle
        ? 'bg-[#c99872] text-[#fff7ed] font-bold border border-[#8f674a]'
        : 'bg-primary text-white font-bold shadow-sm border border-transparent';
    const categoryAddButtonClass = isPixelStyle
        ? 'w-6 h-6 rounded-full border border-[#8f674a] bg-[#f8f0e0] text-[#8f674a] flex items-center justify-center shrink-0 hover:bg-[#fff7ed]'
        : 'w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 hover:bg-slate-200';
    const emojiImportTileClass = isPixelStyle
        ? 'aspect-square bg-[#fff7ed] rounded-2xl border-2 border-dashed border-[#8f674a]/40 flex items-center justify-center text-2xl text-[#8f674a]'
        : 'aspect-square bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-2xl text-slate-400';
    const emojiTileClass = isPixelStyle
        ? 'bg-[#fff7ed] rounded-2xl p-2 border-2 border-[#8f674a]/20 shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center'
        : 'bg-white rounded-2xl p-2 shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center';
    const emojiLabelClass = isPixelStyle
        ? 'text-[#8f674a]'
        : 'text-slate-400';

    return (
        <div className={`${shellClass} pb-safe shrink-0 z-40 relative`}>
            
            {selectionMode ? (
                <div className={`p-3 flex gap-2 ${isPixelStyle ? 'bg-[#f3e7d6]' : 'bg-white/50 backdrop-blur-md'}`}>
                    {onForwardSelected && (
                        <button
                            onClick={onForwardSelected}
                            disabled={selectedCount === 0}
                            className={`flex-1 py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${selectedCount === 0 ? 'bg-slate-200 text-slate-400 shadow-none' : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-200'}`}
                        >
                            <ShareNetwork className="w-5 h-5" weight="bold" />
                            转发 ({selectedCount})
                        </button>
                    )}
                    <button
                        onClick={onDeleteSelected}
                        className={`${onForwardSelected ? 'flex-1' : 'w-full'} py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2`}
                    >
                        <Trash className="w-5 h-5" weight="bold" />
                        删除 ({selectedCount})
                    </button>
                </div>
            ) : (
                <div className="p-3 px-4 flex gap-3 items-end">
                    <button
                        onClick={() => setShowPanel(showPanel === 'actions' ? 'none' : 'actions')}
                        aria-label="打开聊天操作"
                        data-chat-composer-control="actions"
                        className={actionButtonClass}
                    >
                        <Plus className="h-[22px] w-[22px]" weight="bold" />
                    </button>
                    <div
                        data-chat-composer-control="input"
                        className={`flex-1 min-w-0 ${compactInputMinHeightClass} flex items-center px-1 transition-all ${useIOSStandaloneInputFix ? 'overflow-visible' : 'overflow-hidden'} ${inputWrapClass} ${isPixelStyle ? 'focus-within:bg-[#fff7ed]' : 'focus-within:bg-white/55 focus-within:border-white/80 focus-within:shadow-[0_8px_22px_rgba(148,163,184,0.14),inset_0_1px_0_rgba(255,255,255,0.75)]'}`}
                    >
                        <textarea 
                            ref={textareaRef}
                            rows={1} 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            onFocus={handleInputFocus}
                            inputMode="text"
                            enterKeyHint="send"
                            autoCorrect="on"
                            autoCapitalize="sentences"
                            className={`flex-1 min-w-0 bg-transparent px-4 py-[10px] leading-5 ${useIOSStandaloneInputFix ? 'text-[16px]' : 'text-[15px]'} resize-none no-scrollbar ${isPixelStyle ? 'text-[#6a4c35] placeholder:text-[#9b8677]' : ''}`}
                            placeholder="Message..." 
                            style={{ maxHeight: 72 }}
                        />
                        {canExpandInput && (
                            <button
                                type="button"
                                onClick={onExpandInput}
                                aria-label="展开长消息编辑"
                                title="展开长消息"
                                className={`shrink-0 rounded-full p-2 transition-colors ${isPixelStyle ? 'text-[#8f674a] hover:bg-[#eadfce]' : 'text-slate-400 hover:bg-white/60 hover:text-slate-600'}`}
                            >
                                <ArrowsOutSimple className="h-5 w-5" weight="bold" />
                            </button>
                        )}
                        <button onClick={() => setShowPanel(showPanel === 'emojis' ? 'none' : 'emojis')} className={`p-2 shrink-0 ${isPixelStyle ? 'text-[#8f674a] hover:text-[#a16207]' : 'text-slate-400 hover:text-primary'}`}>
                            <Smiley className="h-[22px] w-[22px]" weight="regular" />
                        </button>
                    </div>
                    <button 
                        onClick={onSend} 
                        disabled={!input.trim()} 
                        aria-label="发送消息"
                        data-chat-composer-control="send"
                        className={`${sendButtonClass} ${input.trim() ? '' : 'opacity-45 shadow-none'}`}
                    >
                        {sendButtonStyle === 'pill' ? <span>发送</span> : <PaperPlaneTilt className="h-[19px] w-[19px]" weight="fill" />}
                    </button>
                </div>
            )}

            {/* Panels */}
            {showPanel !== 'none' && !selectionMode && (
                <div className={`${panelClass} h-72 overflow-hidden relative z-0 flex flex-col`}>
                    
                    {/* Emojis Panel with Categories */}
                    {showPanel === 'emojis' && (
                        <>
                            {/* Categories Bar */}
                            <div className={panelTopBarClass}>
                                {categories.map(cat => (
                                    <button 
                                        key={cat.id} 
                                        onClick={(e) => handleItemClick(e, cat, 'category')}
                                        // Long press handlers for Categories
                                        onTouchStart={(e) => handleTouchStart(cat, 'category', e)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onMouseDown={(e) => handleTouchStart(cat, 'category', e)}
                                        onMouseMove={handleTouchMove}
                                        onMouseUp={handleTouchEnd}
                                        onMouseLeave={handleTouchEnd}
                                        onContextMenu={(e) => e.preventDefault()}
                                        className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all select-none flex items-center gap-1 ${activeCategory === cat.id ? activeCategoryClass : inactiveCategoryClass}`}
                                    >
                                        {cat.name}
                                        {categoryHasRestrictedVisibility(cat) && (
                                            <Lock className="w-3 h-3 opacity-60" weight="bold" />
                                        )}
                                    </button>
                                ))}
                                <button onClick={() => onPanelAction('add-category')} className={categoryAddButtonClass}>+</button>
                                <button onClick={() => onPanelAction('emoji-pack-manager')} className={categoryAddButtonClass} title="内置表情包">
                                    <GearSix className="w-3.5 h-3.5" weight="bold" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                                <div className="grid grid-cols-4 gap-3">
                                    <button onClick={() => onPanelAction('emoji-import')} className={emojiImportTileClass}>+</button>
                                    {emojis.map((e, i) => (
                                        <button 
                                            key={i} 
                                            onClick={(ev) => handleItemClick(ev, e, 'emoji')}
                                            // Long press handlers for Emojis
                                            onTouchStart={(ev) => handleTouchStart(e, 'emoji', ev)}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={handleTouchEnd}
                                            onMouseDown={(ev) => handleTouchStart(e, 'emoji', ev)}
                                            onMouseMove={handleTouchMove}
                                            onMouseUp={handleTouchEnd}
                                            onMouseLeave={handleTouchEnd}
                                            onContextMenu={(ev) => ev.preventDefault()}
                                            className={emojiTileClass}
                                        >
                                            <div className="aspect-square w-full">
                                                <img src={e.url} className="w-full h-full object-contain pointer-events-none" />
                                            </div>
                                            <span className={`text-[9px] truncate w-full text-center mt-0.5 leading-tight pointer-events-none ${emojiLabelClass}`}>{e.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Actions Panel */}
                    {showPanel === 'actions' && (
                        <div className="p-6 grid grid-cols-4 gap-8 overflow-y-auto">
                            <button onClick={() => onPanelAction('transfer')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform text-slate-600">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border bg-orange-50 text-orange-400 border-orange-100">
                                    <Money className="w-6 h-6" weight="bold" />
                                </div>
                                <span className="text-xs font-bold">转账</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('poke')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform text-slate-600">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border bg-sky-50 border-sky-100"><img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f449.png" alt="poke" className="w-6 h-6" /></div>
                                <span className="text-xs font-bold">戳一戳</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('archive')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform text-slate-600">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border bg-indigo-50 text-indigo-400 border-indigo-100">
                                    <BookOpenText className="w-6 h-6" weight="bold" />
                                </div>
                                <span className="text-xs font-bold">{isSummarizing ? '归档中...' : '记忆归档'}</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('settings')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform text-slate-600">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border bg-slate-50 text-slate-500 border-slate-100">
                                    <GearSix className="w-6 h-6" weight="bold" /></div>
                                <span className="text-xs font-bold">设置</span>
                            </button>
                            
                            <button onClick={() => chatImageInputRef.current?.click()} className="flex flex-col items-center gap-2 active:scale-95 transition-transform text-slate-600">
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border bg-pink-50 text-pink-400 border-pink-100">
                                    <Image className="w-6 h-6" weight="bold" />
                                </div>
                                <span className="text-xs font-bold">相册</span>
                            </button>
                            <input type="file" ref={chatImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'chat')} />

                            {/* Regenerate Button */}
                            <button onClick={onReroll} disabled={!canReroll} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${canReroll ? 'text-slate-600' : 'text-slate-300 opacity-50'}`}>
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${canReroll ? 'bg-emerald-50 text-emerald-400 border-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                    <ArrowsClockwise className="w-6 h-6" weight="bold" />
                                </div>
                                <span className="text-xs font-bold">重新生成</span>
                            </button>

                            {/* Proactive Message Button */}
                            <button onClick={() => onPanelAction('proactive')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform relative text-slate-600">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${isProactiveActive ? 'bg-violet-50 text-violet-500 border-violet-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                    <ChatCircleDots className="w-6 h-6" weight="bold" />
                                </div>
                                <span className="text-xs font-bold">主动来信</span>
                                {isProactiveActive && <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full border-2 bg-violet-500 border-white" />}
                            </button>

                            {/* Emotion Button */}
                            <button onClick={() => onPanelAction('emotion')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform relative text-slate-600">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${isEmotionEnabled ? 'bg-pink-50 text-pink-500 border-pink-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                    <SmileyWink className="w-6 h-6" weight="bold" />
                                </div>
                                <span className="text-xs font-bold">情绪</span>
                                {isEmotionEnabled && <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full border-2 bg-pink-500 border-white" />}
                            </button>

                         </div>
                     )}
                     {showPanel === 'chars' && (
                        <div className="p-5 space-y-6 overflow-y-auto no-scrollbar">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 px-1 tracking-wider uppercase mb-3">切换会话</h3>
                                <div className="space-y-3">
                                    {characters.map(c => (
                                        <div key={c.id} onClick={() => onCharSelect(c.id)} className={`flex items-center gap-4 p-3 rounded-[20px] border cursor-pointer ${c.id === activeCharacterId ? 'bg-white border-primary/30 shadow-md' : 'bg-white/50 border-transparent'}`}>
                                            <img src={c.avatar} className="w-12 h-12 rounded-2xl object-cover" />
                                            <div className="flex-1"><div className="font-bold text-sm text-slate-700">{c.name}</div><div className="text-xs text-slate-400 truncate">{c.description}</div></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(ChatInputArea);
