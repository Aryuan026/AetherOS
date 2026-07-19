import React, { useEffect, useRef } from 'react';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import AppHeader from '../shell/AppHeader';

interface ExpandedChatComposerProps {
    input: string;
    setInput: (value: string) => void;
    onClose: () => void;
    onSend: () => void;
    replyPreview?: string;
}

const ExpandedChatComposer: React.FC<ExpandedChatComposerProps> = ({
    input,
    setInput,
    onClose,
    onSend,
    replyPreview,
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && input.trim()) {
                event.preventDefault();
                onSend();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [input, onClose, onSend]);

    return (
        <div
            data-chat-expanded-composer
            className="absolute inset-0 z-[90] flex h-full w-full flex-col overflow-hidden bg-[#f7f8fb]"
        >
            <AppHeader
                onBack={onClose}
                center
                title="写长消息"
                subtitle="关闭后草稿仍会保留"
                className="border-b border-white/70 bg-white/88 backdrop-blur-2xl"
                right={(
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={!input.trim()}
                        aria-label="发送长消息"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a84ff] text-white shadow-sm transition-transform active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        <PaperPlaneTilt size={17} weight="fill" />
                    </button>
                )}
            />

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
                {replyPreview && (
                    <div className="mb-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-xs text-slate-500 shadow-sm">
                        <span className="mr-2 font-bold text-slate-700">正在回复</span>
                        <span className="line-clamp-2">{replyPreview}</span>
                    </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-white bg-white/92 p-5 shadow-[0_18px_50px_rgba(148,163,184,0.16)]">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={event => setInput(event.target.value)}
                        inputMode="text"
                        enterKeyHint="enter"
                        autoCorrect="on"
                        autoCapitalize="sentences"
                        placeholder="慢慢写，换行和段落都会完整保留……"
                        className="min-h-0 flex-1 resize-none bg-transparent text-[16px] leading-7 text-slate-800 outline-none placeholder:text-slate-300"
                    />
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                        <span>回到聊天页后仍是同一份草稿</span>
                        <span>{input.length} 字</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpandedChatComposer;
