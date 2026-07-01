
import React, { useRef, useState } from 'react';
import Modal from '../os/Modal';
import { CharacterProfile, Message, EmojiCategory } from '../../types';

interface ChatModalsProps {
    modalType: string;
    setModalType: (v: any) => void;
    // Data Props
    transferAmt: string;
    setTransferAmt: (v: string) => void;
    emojiImportText: string;
    setEmojiImportText: (v: string) => void;
    settingsContextLimit: number;
    setSettingsContextLimit: (v: number) => void;
    settingsHideSysLogs: boolean;
    setSettingsHideSysLogs: (v: boolean) => void;
    preserveContext: boolean;
    setPreserveContext: (v: boolean) => void;
    editContent: string;
    setEditContent: (v: string) => void;
    
    // New Category Props
    newCategoryName: string;
    setNewCategoryName: (v: string) => void;
    onAddCategory: () => void;

    // Archive Props
    archivePrompts: {id: string, name: string, content: string}[];
    selectedPromptId: string;
    setSelectedPromptId: (id: string) => void;
    editingPrompt: {id: string, name: string, content: string} | null;
    setEditingPrompt: (p: any) => void;
    isSummarizing: boolean;

    // Selection Props
    selectedMessage: Message | null;
    selectedEmoji: {name: string, url: string, categoryId?: string, source?: string} | null;
    selectedCategory: EmojiCategory | null;
    activeCharacter: CharacterProfile;
    messages: Message[];
    allHistoryMessages?: Message[];

    // Handlers
    onTransfer: () => void;
    onImportEmoji: () => void;
    onSaveSettings: () => void;
    onBgUpload: (file: File) => void;
    onRemoveBg: () => void;
    onClearHistory: () => void;
    onArchive: () => void;
    onCreatePrompt: () => void;
    onEditPrompt: () => void;
    onSavePrompt: () => void;
    onDeletePrompt: (id: string) => void;
    onSetHistoryStart: (id: number | undefined) => void;
    onEnterSelectionMode: () => void;
    onReplyMessage: () => void;
    onEditMessageStart: () => void;
    onConfirmEditMessage: () => void;
    onDeleteMessage: () => void;
    onCopyMessage: () => void;
    onDeleteEmoji: () => void;
    onDeleteCategory: () => void;
    // Category Visibility
    allCharacters?: CharacterProfile[];
    onSaveCategoryVisibility?: (categoryId: string, allowedCharacterIds: string[] | undefined, visibilityMode?: EmojiCategory['visibilityMode']) => void;
    emojiCategories?: EmojiCategory[];
    onTogglePublicEmojiCategory?: (categoryId: string, enabled: boolean) => void;
    // Translation
    translationEnabled?: boolean;
    onToggleTranslation?: () => void;
    translateSourceLang?: string;
    translateTargetLang?: string;
    onSetTranslateSourceLang?: (lang: string) => void;
    onSetTranslateLang?: (lang: string) => void;
    // XHS toggle
    xhsEnabled?: boolean;
    onToggleXhs?: () => void;
    // Voice TTS
    chatVoiceEnabled?: boolean;
    onToggleChatVoice?: () => void;
    chatVoiceLang?: string;
    onSetChatVoiceLang?: (lang: string) => void;
    // Voice generation from long-press
    onGenerateVoice?: () => void;
    voiceAvailable?: boolean; // true if char has voiceProfile configured
}

const ChatModals: React.FC<ChatModalsProps> = ({
    modalType, setModalType,
    transferAmt, setTransferAmt,
    emojiImportText, setEmojiImportText,
    settingsContextLimit, setSettingsContextLimit,
    settingsHideSysLogs, setSettingsHideSysLogs,
    preserveContext, setPreserveContext,
    editContent, setEditContent,
    newCategoryName, setNewCategoryName, onAddCategory,
    archivePrompts, selectedPromptId, setSelectedPromptId,
    editingPrompt, setEditingPrompt, isSummarizing,
    selectedMessage, selectedEmoji, selectedCategory, activeCharacter, messages,
    allHistoryMessages = [],
    onTransfer, onImportEmoji, onSaveSettings,
    onBgUpload, onRemoveBg, onClearHistory,
    onArchive, onCreatePrompt, onEditPrompt, onSavePrompt, onDeletePrompt,
    onSetHistoryStart, onEnterSelectionMode, onReplyMessage, onEditMessageStart, onConfirmEditMessage, onDeleteMessage, onCopyMessage, onDeleteEmoji, onDeleteCategory,
    allCharacters = [], onSaveCategoryVisibility, emojiCategories = [], onTogglePublicEmojiCategory,
    translationEnabled, onToggleTranslation, translateSourceLang, translateTargetLang, onSetTranslateSourceLang, onSetTranslateLang,
    xhsEnabled, onToggleXhs,
    chatVoiceEnabled, onToggleChatVoice, chatVoiceLang, onSetChatVoiceLang,
    onGenerateVoice, voiceAvailable
}) => {
    const bgInputRef = useRef<HTMLInputElement>(null);
    const [visibilitySelection, setVisibilitySelection] = useState<Set<string>>(new Set());
    const [historyPage, setHistoryPage] = useState(0);
    const HISTORY_PAGE_SIZE = 50;
    const publicEmojiCategories = emojiCategories.filter(category => category.source === 'public');

    const openVisibilityModal = () => {
        if (selectedCategory) {
            setVisibilitySelection(new Set(selectedCategory.allowedCharacterIds || []));
            setModalType('category-visibility');
        }
    };

    const toggleVisibilityChar = (charId: string) => {
        setVisibilitySelection(prev => {
            const next = new Set(prev);
            if (next.has(charId)) next.delete(charId);
            else next.add(charId);
            return next;
        });
    };

    const handleSaveVisibility = () => {
        if (selectedCategory && onSaveCategoryVisibility) {
            const ids = Array.from(visibilitySelection);
            const keepAllowlist = selectedCategory.visibilityMode === 'allowlist';
            onSaveCategoryVisibility(
                selectedCategory.id,
                ids.length > 0 || keepAllowlist ? ids : undefined,
                keepAllowlist || ids.length > 0 ? 'allowlist' : 'all',
            );
        }
        setModalType('none');
    };

    return (
        <>
            <Modal 
                isOpen={modalType === 'transfer'} title="Credits 转账" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onTransfer} className="flex-1 py-3 bg-orange-500 text-white rounded-2xl">确认</button></>}
            ><input type="number" value={transferAmt} onChange={e => setTransferAmt(e.target.value)} className="w-full bg-slate-100 rounded-2xl px-5 py-4 text-lg font-bold" autoFocus /></Modal>

            {/* New Category Modal */}
            <Modal 
                isOpen={modalType === 'add-category'} title="新建表情分类" onClose={() => setModalType('none')}
                footer={<button onClick={onAddCategory} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">创建</button>}
            >
                <input 
                    value={newCategoryName} 
                    onChange={e => setNewCategoryName(e.target.value)} 
                    placeholder="输入分类名称..." 
                    className="w-full bg-slate-100 rounded-2xl px-5 py-4 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-700" 
                    autoFocus 
                />
            </Modal>

            <Modal 
                isOpen={modalType === 'emoji-import'} title="表情注入" onClose={() => setModalType('none')}
                footer={<button onClick={onImportEmoji} className="w-full py-4 bg-primary text-white font-bold rounded-2xl">添加至当前分类</button>}
            >
                <div className="space-y-3">
                    <p className="text-xs text-slate-400">表情将导入到你当前选中的分类。</p>
                    <textarea value={emojiImportText} onChange={e => setEmojiImportText(e.target.value)} placeholder="Name--URL (每行一个)" className="w-full h-40 bg-slate-100 rounded-2xl p-4 resize-none" />
                </div>
            </Modal>

            <Modal 
                isOpen={modalType === 'chat-settings'} title="聊天设置" onClose={() => setModalType('none')}
                footer={<button onClick={onSaveSettings} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存设置</button>}
            >
                <div className="space-y-6">
                     <div>
                         <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">聊天背景</label>
                         <div onClick={() => bgInputRef.current?.click()} className="h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-primary/50 overflow-hidden relative">
                             {activeCharacter.chatBackground ? <img src={activeCharacter.chatBackground} className="w-full h-full object-cover opacity-60" /> : <span className="text-xs text-slate-400">点击上传图片 (原画质)</span>}
                             {activeCharacter.chatBackground && <span className="absolute z-10 text-xs bg-white/80 px-2 py-1 rounded">更换</span>}
                         </div>
                         <input type="file" ref={bgInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && onBgUpload(e.target.files[0])} />
                         {activeCharacter.chatBackground && <button onClick={onRemoveBg} className="text-[10px] text-red-400 mt-1">移除背景</button>}
                     </div>
                     <div>
                         <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">上下文条数 ({settingsContextLimit})</label>
                         <input type="range" min="20" max="5000" step="10" value={settingsContextLimit} onChange={e => setSettingsContextLimit(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-primary" />
                         <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>20 (省流)</span><span>5000 (超长记忆)</span></div>
                     </div>

                     <div className="pt-2 border-t border-slate-100">
                         <div className="flex justify-between items-center cursor-pointer" onClick={() => setSettingsHideSysLogs(!settingsHideSysLogs)}>
                             <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">隐藏系统日志</label>
                             <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${settingsHideSysLogs ? 'bg-primary' : 'bg-slate-200'}`}>
                                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settingsHideSysLogs ? 'translate-x-4' : ''}`}></div>
                             </div>
                         </div>
                         <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                             开启后，将不再显示 Date/App 产生的上下文提示文本（转账、戳一戳、图片发送提示除外）。
                         </p>
                     </div>

                     {/* Translation Settings */}
                     <div className="pt-2 border-t border-slate-100">
                         <div className="flex justify-between items-center cursor-pointer" onClick={onToggleTranslation}>
                             <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">消息翻译</label>
                             <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${translationEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${translationEnabled ? 'translate-x-4' : ''}`}></div>
                             </div>
                         </div>
                         <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                             开启后，AI 消息自动翻译为「选」的语言显示，点「译」切换到目标语言。
                         </p>
                         {translationEnabled && (
                             <div className="mt-3 space-y-3">
                                 {/* Source Language (选) */}
                                 <div>
                                     <label className="text-[10px] font-bold text-slate-400 mb-1.5 block">选（气泡显示语言）</label>
                                     <div className="flex flex-wrap gap-1.5">
                                         {['中文', 'English', '日本語', '한국어', 'Français', 'Español'].map(lang => (
                                             <button
                                                 key={`src-${lang}`}
                                                 onClick={() => onSetTranslateSourceLang?.(lang)}
                                                 className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${translateSourceLang === lang ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}`}
                                             >
                                                 {lang}
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                                 {/* Target Language (译) */}
                                 <div>
                                     <label className="text-[10px] font-bold text-slate-400 mb-1.5 block">译（翻译目标语言）</label>
                                     <div className="flex flex-wrap gap-1.5">
                                         {['中文', 'English', '日本語', '한국어', 'Français', 'Español'].map(lang => (
                                             <button
                                                 key={`tgt-${lang}`}
                                                 onClick={() => onSetTranslateLang?.(lang)}
                                                 className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${translateTargetLang === lang ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
                                             >
                                                 {lang}
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                                 {/* Preview */}
                                 <div className="text-[11px] text-center text-slate-500 bg-slate-50 rounded-lg py-2">
                                     选<span className="font-bold text-slate-700">{translateSourceLang || '?'}</span> 译<span className="font-bold text-primary">{translateTargetLang || '?'}</span>
                                 </div>
                             </div>
                         )}
                     </div>

                     {/* XHS Toggle */}
                     <div className="pt-2 border-t border-slate-100">
                         <div className="flex justify-between items-center cursor-pointer" onClick={onToggleXhs}>
                             <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">小红书</label>
                             <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${xhsEnabled ? 'bg-red-400' : 'bg-slate-200'}`}>
                                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${xhsEnabled ? 'translate-x-4' : ''}`}></div>
                             </div>
                         </div>
                         <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                             开启后，角色在聊天中可以搜索、浏览、发帖、评论小红书。需要在全局设置中配置 MCP 或 Cookie。
                         </p>
                     </div>

                     {/* Voice TTS */}
                     <div className="pt-2 border-t border-slate-100">
                         <div className="flex justify-between items-center cursor-pointer" onClick={onToggleChatVoice}>
                             <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">语音消息</label>
                             <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${chatVoiceEnabled ? 'bg-emerald-400' : 'bg-slate-200'}`}>
                                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${chatVoiceEnabled ? 'translate-x-4' : ''}`}></div>
                             </div>
                         </div>
                         <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                             开启后，AI 回复自动生成语音条（需配置 MiniMax 和角色语音）。
                         </p>
                         {chatVoiceEnabled && (
                             <div className="mt-3">
                                 <label className="text-[10px] font-bold text-slate-400 mb-1.5 block">语音语种</label>
                                 <div className="flex flex-wrap gap-1.5">
                                     {[{v:'',l:'默认'},{v:'en',l:'English'},{v:'ja',l:'日本語'},{v:'ko',l:'한국어'},{v:'fr',l:'Français'},{v:'es',l:'Español'}].map(opt => (
                                         <button key={opt.v} onClick={() => onSetChatVoiceLang?.(opt.v)}
                                             className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${chatVoiceLang === opt.v ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                             {opt.l}
                                         </button>
                                     ))}
                                 </div>
                                 {chatVoiceLang && <p className="text-[10px] text-emerald-600/70 mt-1.5">选择非默认语种时，AI 台词会先翻译再生成语音。</p>}
                             </div>
                         )}
                     </div>

                     <div className="pt-2 border-t border-slate-100">
                         <button onClick={() => setModalType('history-manager')} className="w-full py-3 bg-slate-50 text-slate-600 font-bold rounded-2xl border border-slate-200 active:scale-95 transition-transform flex items-center justify-center gap-2">
                             管理上下文 / 隐藏历史
                         </button>
                         <p className="text-[10px] text-slate-400 mt-2 text-center">可选择从某条消息开始显示，隐藏之前的记录（不被 AI 读取）。</p>
                     </div>
                     
                     <div className="pt-2 border-t border-slate-100">
                         <label className="text-xs font-bold text-red-400 uppercase mb-3 block">危险区域 (Danger Zone)</label>
                         <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => setPreserveContext(!preserveContext)}>
                             <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${preserveContext ? 'bg-primary border-primary' : 'bg-slate-100 border-slate-300'}`}>
                                 {preserveContext && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                             </div>
                             <span className="text-sm text-slate-600">清空时保留最后10条记录 (维持语境)</span>
                         </div>
                         <button onClick={onClearHistory} className="w-full py-3 bg-red-50 text-red-500 font-bold rounded-2xl border border-red-100 active:scale-95 transition-transform flex items-center justify-center gap-2">
                             执行清空
                         </button>
                     </div>
                </div>
            </Modal>

            {/* Archive Settings Modal */}
            <Modal isOpen={modalType === 'archive-settings'} title="记忆归档设置" onClose={() => setModalType('none')} footer={<button onClick={onArchive} disabled={isSummarizing} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200">开始归档</button>}>
                <div className="space-y-4">
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <label className="text-[10px] font-bold text-indigo-400 uppercase mb-2 block">选择提示词模板</label>
                        <div className="flex flex-col gap-2">
                            {archivePrompts.map(p => (
                                <div key={p.id} onClick={() => setSelectedPromptId(p.id)} className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between ${selectedPromptId === p.id ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500' : 'bg-white/50 border-indigo-200 hover:bg-white'}`}>
                                    <span className={`text-xs font-bold ${selectedPromptId === p.id ? 'text-indigo-700' : 'text-slate-600'}`}>{p.name}</span>
                                    <div className="flex gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); setSelectedPromptId(p.id); onEditPrompt(); }} className="text-[10px] text-slate-400 hover:text-indigo-500 px-2 py-1 rounded bg-slate-100 hover:bg-indigo-50">编辑/查看</button>
                                        {!p.id.startsWith('preset_') && (
                                            <button onClick={(e) => { e.stopPropagation(); onDeletePrompt(p.id); }} className="text-[10px] text-red-300 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50">×</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={onCreatePrompt} className="mt-3 w-full py-2 text-xs font-bold text-indigo-500 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-100">+ 新建自定义提示词</button>
                    </div>
                    <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl leading-relaxed">
                        • <b>理性精炼</b>: 适合生成条理清晰的事件日志，便于 AI 长期记忆检索。<br/>
                        • <b>日记风格</b>: 适合生成第一人称的角色日记，更有代入感和情感色彩。<br/>
                        • 支持变量: <code>{'${dateStr}'}</code>, <code>{'${char.name}'}</code>, <code>{'${userProfile.name}'}</code>, <code>{'${rawLog}'}</code>
                    </div>
                </div>
            </Modal>

            {/* Prompt Editor Modal */}
            <Modal isOpen={modalType === 'prompt-editor'} title="编辑提示词" onClose={() => setModalType('archive-settings')} footer={<button onClick={onSavePrompt} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存预设</button>}>
                <div className="space-y-3">
                    <input 
                        value={editingPrompt?.name || ''} 
                        onChange={e => setEditingPrompt((prev: any) => prev ? {...prev, name: e.target.value} : null)}
                        placeholder="预设名称"
                        className="w-full px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <textarea 
                        value={editingPrompt?.content || ''} 
                        onChange={e => setEditingPrompt((prev: any) => prev ? {...prev, content: e.target.value} : null)}
                        className="w-full h-64 bg-slate-100 rounded-xl p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                        placeholder="输入提示词内容..."
                    />
                </div>
            </Modal>

            {/* History Manager Modal */}
            <Modal
                isOpen={modalType === 'history-manager'} title="历史记录断点" onClose={() => { setModalType('none'); setHistoryPage(0); }}
                footer={<><button onClick={() => onSetHistoryStart(undefined)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">恢复全部</button><button onClick={() => { setModalType('none'); setHistoryPage(0); }} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">完成</button></>}
            >
                <div className="space-y-2 max-h-[50vh] overflow-y-auto no-scrollbar p-1">
                    <p className="text-xs text-slate-400 text-center mb-2">点击某条消息，将其设为"新的起点"。此条之前的消息将被隐藏且不发送给 AI。</p>
                    {(() => {
                        const reversed = allHistoryMessages.slice().reverse();
                        const totalPages = Math.max(1, Math.ceil(reversed.length / HISTORY_PAGE_SIZE));
                        const pageMessages = reversed.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);
                        return (<>
                            {reversed.length > HISTORY_PAGE_SIZE && (
                                <div className="flex items-center justify-between px-1 py-1">
                                    <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0} className={`px-3 py-1 text-xs rounded-lg ${historyPage === 0 ? 'text-slate-300' : 'text-primary hover:bg-primary/10'}`}>上一页</button>
                                    <span className="text-xs text-slate-400">{historyPage + 1} / {totalPages}（共 {reversed.length} 条）</span>
                                    <button onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))} disabled={historyPage >= totalPages - 1} className={`px-3 py-1 text-xs rounded-lg ${historyPage >= totalPages - 1 ? 'text-slate-300' : 'text-primary hover:bg-primary/10'}`}>下一页</button>
                                </div>
                            )}
                            {pageMessages.map(m => (
                                <div key={m.id} onClick={() => onSetHistoryStart(m.id)} className={`p-3 rounded-xl border cursor-pointer text-xs flex gap-2 items-start ${activeCharacter.hideBeforeMessageId === m.id ? 'bg-primary/10 border-primary ring-1 ring-primary' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                                    <span className="text-slate-400 font-mono whitespace-nowrap pt-0.5">[{new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}]</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-600 mb-0.5">{m.role === 'user' ? '我' : activeCharacter.name}</div>
                                        <div className="text-slate-500 truncate">{m.content}</div>
                                    </div>
                                    {activeCharacter.hideBeforeMessageId === m.id && <span className="text-primary font-bold text-[10px] bg-white px-2 rounded-full border border-primary/20">起点</span>}
                                </div>
                            ))}
                            {reversed.length > HISTORY_PAGE_SIZE && (
                                <div className="flex items-center justify-center px-1 pt-2">
                                    <span className="text-xs text-slate-400">{historyPage + 1} / {totalPages}</span>
                                </div>
                            )}
                        </>);
                    })()}
                </div>
            </Modal>
            
            <Modal isOpen={modalType === 'message-options'} title="消息操作" onClose={() => setModalType('none')}>
                <div className="space-y-3">
                    <button onClick={onEnterSelectionMode} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        多选 / 批量删除
                    </button>
                    <button onClick={onReplyMessage} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        引用 / 回复
                    </button>
                    {selectedMessage?.type === 'text' && (
                        <button onClick={onEditMessageStart} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            编辑内容
                        </button>
                    )}
                    {selectedMessage?.type === 'text' && (
                        <button onClick={onCopyMessage} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            复制文字
                        </button>
                    )}
                    {voiceAvailable && selectedMessage?.role === 'assistant' && selectedMessage?.type === 'text' && onGenerateVoice && (
                        <button onClick={() => { onGenerateVoice(); setModalType('none'); }} className="w-full py-3 bg-emerald-50 text-emerald-600 font-medium rounded-2xl active:bg-emerald-100 transition-colors flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
                            转换语音
                        </button>
                    )}
                    <button onClick={onDeleteMessage} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors flex items-center justify-center gap-2">
                        删除消息
                    </button>
                </div>
            </Modal>
            
             <Modal
                isOpen={modalType === 'delete-emoji'} title="删除表情包" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onDeleteEmoji} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">删除</button></>}
            >
                <div className="flex flex-col items-center gap-4 py-2">
                    {selectedEmoji && <img src={selectedEmoji.url} className="w-24 h-24 object-contain rounded-xl border" />}
                    <p className="text-center text-sm text-slate-500">确定要删除这个表情包吗？</p>
                </div>
            </Modal>

            {/* Delete Category Modal */}
            <Modal
                isOpen={modalType === 'delete-category'} title="删除分类" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onDeleteCategory} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">删除</button></>}
            >
                <div className="py-4 text-center">
                    <p className="text-sm text-slate-600">确定要删除分类 <br/><span className="font-bold">"{selectedCategory?.name}"</span> 吗？</p>
                    <p className="text-[10px] text-red-400 mt-2">注意：分类下的所有表情也将被删除！</p>
                </div>
            </Modal>

            {/* Category Options Modal (shown on long-press) */}
            <Modal isOpen={modalType === 'category-options'} title="分类操作" onClose={() => setModalType('none')}>
                <div className="space-y-3">
                    <button onClick={openVisibilityModal} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        设置可见角色
                    </button>
                    {selectedCategory && !selectedCategory.isSystem && selectedCategory.id !== 'default' && (
                        <button onClick={() => setModalType('delete-category')} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                            删除分类
                        </button>
                    )}
                </div>
            </Modal>

            {/* Category Visibility Modal */}
            <Modal
                isOpen={modalType === 'category-visibility'} title={`"${selectedCategory?.name}" 可见角色`} onClose={() => setModalType('none')}
                footer={<button onClick={handleSaveVisibility} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存设置</button>}
            >
                <div className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                        {selectedCategory?.visibilityMode === 'allowlist'
                            ? '选择哪些角色可以使用此表情分组。不勾选任何角色表示暂时关闭此分组。'
                            : '选择哪些角色可以使用此表情分组。不勾选任何角色表示所有角色均可使用。'}
                    </p>
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto no-scrollbar">
                        {allCharacters.map(c => (
                            <div
                                key={c.id}
                                onClick={() => toggleVisibilityChar(c.id)}
                                className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${visibilitySelection.has(c.id) ? 'bg-primary/5 border-primary/30' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                            >
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${visibilitySelection.has(c.id) ? 'bg-primary border-primary' : 'bg-slate-100 border-slate-300'}`}>
                                    {visibilitySelection.has(c.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                </div>
                                <img src={c.avatar} className="w-9 h-9 rounded-xl object-cover" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-700">{c.name}</div>
                                    <div className="text-[10px] text-slate-400 truncate">{c.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {visibilitySelection.size > 0 && (
                        <div className="text-[11px] text-center text-slate-500 bg-slate-50 rounded-lg py-2">
                            已选 <span className="font-bold text-primary">{visibilitySelection.size}</span> 个角色可使用此分组
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'emoji-pack-manager'} title="公共表情包" onClose={() => setModalType('none')}
            >
                <div className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                        这里控制当前角色能不能读取和选择服务器内置表情包。关闭后，该角色的聊天提示词和表情面板都不会包含对应分组。
                    </p>
                    {publicEmojiCategories.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-400 bg-slate-50 rounded-2xl">
                            暂无公共表情包
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[42vh] overflow-y-auto no-scrollbar">
                            {publicEmojiCategories.map(category => {
                                const enabled = category.visibilityMode === 'all' || (category.allowedCharacterIds || []).includes(activeCharacter.id);
                                return (
                                    <button
                                        key={category.id}
                                        onClick={() => onTogglePublicEmojiCategory?.(category.id, !enabled)}
                                        className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center gap-3 ${enabled ? 'bg-primary/5 border-primary/30' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 ${enabled ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                                            {enabled ? '开' : '关'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm text-slate-700">{category.name}</div>
                                            <div className="text-[10px] text-slate-400 truncate">
                                                {enabled ? `${activeCharacter.name} 可使用` : `${activeCharacter.name} 暂不可使用`}
                                                {category.catalogVersion ? ` · ${category.catalogVersion}` : ''}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'edit-message'} title="编辑内容" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onConfirmEditMessage} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">保存</button></>}
            >
                <textarea 
                    value={editContent} 
                    onChange={e => setEditContent(e.target.value)} 
                    className="w-full h-32 bg-slate-100 rounded-2xl p-4 resize-none focus:ring-1 focus:ring-primary/20 transition-all text-sm leading-relaxed" 
                />
            </Modal>
        </>
    );
};

export default ChatModals;
