
import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { Message, GroupProfile, CharacterProfile, MessageType, ChatTheme, MemoryFragment, Emoji, EmojiCategory } from '../types';
import { safeResponseJson } from '../utils/safeApi';
import Modal from '../components/os/Modal';
import { ContextBuilder } from '../utils/context';
import { processImage } from '../utils/file';
import { DEFAULT_ARCHIVE_PROMPTS } from '../components/chat/ChatConstants';
import { UsersThree } from '@phosphor-icons/react';
import { getVisibleEmojiScopeForCharacter, getVisibleEmojiScopeForGroup } from '../utils/emojiVisibility';
import AppHeader, { AppHeaderAddButton } from '../components/shell/AppHeader';
import { SHELL_APP_HEADER_CONTENT_TOP, SHELL_APP_HEADER_HEIGHT } from '../components/shell/shellLayout';
import { selectWorldlineMemoryContext } from '../utils/memoryCore';
import { DIALOG_VISUAL_RULES } from '../components/chat/dialogVisualRules';
import { filterCharactersForPersonaSurface, resolvePersonaRouteScope } from '../utils/personaRouteScope';
import { relationshipScopeForProfile } from '../utils/messageContext';

const TWEMOJI_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72';
const twemojiUrl = (codepoint: string) => `${TWEMOJI_BASE}/${codepoint}.png`;

// 复用 Chat.tsx 的高颜值样式逻辑，但针对群聊微调
const PRESET_THEME_GROUP: ChatTheme = {
    id: 'group_default', name: 'Group', type: 'preset',
    user: { textColor: '#ffffff', backgroundColor: '#8b5cf6', borderRadius: 18, opacity: 1 }, // Violet for User
    ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 18, opacity: 1 }  // White for Others
};

// --- Sub-Component: Group Message Bubble ---
const GroupMessageItem = React.memo(({ 
    msg, 
    isUser, 
    char, 
    userAvatar, 
    onImageClick, 
    selectionMode, 
    isSelected, 
    onToggleSelect,
    onLongPress 
}: { 
    msg: Message, 
    isUser: boolean, 
    char?: CharacterProfile, 
    userAvatar: string, 
    onImageClick: (url: string) => void,
    selectionMode: boolean,
    isSelected: boolean,
    onToggleSelect: (id: number) => void,
    onLongPress: (id: number) => void
}) => {
    const avatar = isUser ? userAvatar : char?.avatar;
    const name = isUser ? '我' : char?.name || '未知成员';
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 });
    
    // Time formatting
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            if (!selectionMode) onLongPress(msg.id);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
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

        if (diffX > 10 || diffY > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (selectionMode) {
            e.stopPropagation();
            onToggleSelect(msg.id);
        }
    };

    // Special Content Renderers
    const renderContent = () => {
        switch (msg.type) {
            case 'image':
                return (
                    <div className="relative group cursor-pointer" onClick={(e) => {
                        if (selectionMode) handleClick(e);
                        else onImageClick(msg.content);
                    }}>
                        <img src={msg.content} className="max-w-[200px] max-h-[200px] rounded-xl shadow-sm border border-black/5" loading="lazy" />
                    </div>
                );
            case 'emoji':
                return <img src={msg.content} className="w-24 h-24 object-contain drop-shadow-sm hover:scale-110 transition-transform" />;
            case 'transfer':
                return (
                    <div className="w-60 bg-[#fb923c] text-white p-3 rounded-xl flex items-center gap-3 shadow-md relative overflow-hidden active:scale-95 transition-transform">
                        <div className="absolute -right-2 -top-2 text-white/20"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16"><path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.324.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" /><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z" clipRule="evenodd" /><path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" /></svg></div>
                        <div className="bg-white/20 p-2 rounded-full shrink-0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" /><path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75-.75H5.25a.75.75 0 0 1-.75-.75V9.75Z" clipRule="evenodd" /><path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" /></svg></div>
                        <div className="z-10">
                            <div className="font-bold text-sm tracking-wide">红包 / 转账</div>
                            <div className="text-[10px] opacity-90">Aether Pay</div>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className={`${DIALOG_VISUAL_RULES.bubblePaddingClass} ${DIALOG_VISUAL_RULES.bubbleMinHeightClass} rounded-[18px] ${DIALOG_VISUAL_RULES.bubbleTextClass} shadow-sm whitespace-pre-wrap break-all ${isUser ? 'bg-violet-500 text-white rounded-tr-sm' : 'bg-white text-slate-700 rounded-tl-sm border border-slate-100'}`}>
                        {msg.content}
                    </div>
                );
        }
    };

    return (
        <div 
            className={`flex ${DIALOG_VISUAL_RULES.avatarBubbleGapClass} mb-3.5 w-full animate-fade-in relative ${isUser ? 'justify-end' : 'justify-start'} ${selectionMode ? 'pl-8' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleMove}
            onMouseDown={handleTouchStart}
            onMouseUp={handleTouchEnd}
            onMouseMove={handleMove}
            onClick={handleClick}
        >
            {selectionMode && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 cursor-pointer z-10">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-violet-500 border-violet-500' : 'border-slate-300 bg-white'}`}>
                        {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                    </div>
                </div>
            )}

            {!isUser && (
                <div className="flex flex-col items-center gap-1 shrink-0">
                    <img src={avatar} className={`${DIALOG_VISUAL_RULES.avatarSizeClass} rounded-full object-cover shadow-sm border border-white`} loading="lazy" />
                </div>
            )}
            
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} ${DIALOG_VISUAL_RULES.bubbleMaxWidthClass} ${selectionMode ? 'pointer-events-none' : ''}`}>
                {!isUser && <span className={`${DIALOG_VISUAL_RULES.nameTextClass} text-slate-400 ml-1 mb-1`}>{name}</span>}
                {renderContent()}
                <span className={`${DIALOG_VISUAL_RULES.timestampTextClass} text-slate-300 mt-1 px-1`}>{timeStr}</span>
            </div>

            {isUser && (
                <div className="flex flex-col items-center gap-1 shrink-0">
                    <img src={avatar} className={`${DIALOG_VISUAL_RULES.avatarSizeClass} rounded-full object-cover shadow-sm border border-white`} loading="lazy" />
                </div>
            )}
        </div>
    );
});

// --- Main Component ---

const GroupChat: React.FC = () => {
    const { closeApp, groups, createGroup, updateGroup, deleteGroup, characters, updateCharacter, apiConfig, addToast, userProfile, virtualTime } = useOS();
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [activeGroup, setActiveGroup] = useState<GroupProfile | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [totalMsgCount, setTotalMsgCount] = useState(0);
    const [visibleCount, setVisibleCount] = useState(30);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    
    // UI State
    const [showActions, setShowActions] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [modalType, setModalType] = useState<'none' | 'create' | 'settings' | 'transfer' | 'member_select' | 'message-options'>('none');
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [preserveContext, setPreserveContext] = useState(true);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summaryProgress, setSummaryProgress] = useState('');

    // Archive prompt selection (shared with Chat app)
    const [archivePrompts, setArchivePrompts] = useState<{id: string, name: string, content: string}[]>(DEFAULT_ARCHIVE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');

    // Context limit (like Chat app's settingsContextLimit)
    const [contextLimit, setContextLimit] = useState<number>(() => {
        try { return parseInt(localStorage.getItem('groupchat_context_limit') || '30'); } catch { return 30; }
    });
    
    // Selection Mode
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());

    // Data State
    const [emojis, setEmojis] = useState<Emoji[]>([]);
    const [categories, setCategories] = useState<EmojiCategory[]>([]); // New
    
    // Create/Edit Group State
    const [tempGroupName, setTempGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [transferAmount, setTransferAmount] = useState('');
    
    // Refs
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const groupAvatarInputRef = useRef<HTMLInputElement>(null);
    const personaScope = useMemo(() => (
        resolvePersonaRouteScope(userProfile, characters)
    ), [userProfile, characters]);
    const groupScopedCharacters = useMemo(() => (
        filterCharactersForPersonaSurface(characters, personaScope, { surface: 'group_chat' })
    ), [characters, personaScope]);
    const groupCandidateCharacters = groupScopedCharacters;
    const activeGroupMembers = useMemo(() => {
        if (!activeGroup) return [];
        const memberIds = new Set(activeGroup.members);
        return groupScopedCharacters.filter(char => memberIds.has(char.id));
    }, [activeGroup, groupScopedCharacters]);

    // Load shared archive prompts from localStorage (same key as Chat app)
    useEffect(() => {
        const savedPrompts = localStorage.getItem('chat_archive_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
                setArchivePrompts(merged);
            } catch(e) {}
        }
    }, []);

    // Initial Load
    useEffect(() => {
        if (activeGroup) {
            setVisibleCount(30);
            DB.getRecentGroupMessagesWithCount(activeGroup.id, 30).then(({ messages: msgs, totalCount }) => {
                setMessages(msgs);
                setTotalMsgCount(totalCount);
            });
            // Fetch emojis AND categories
            DB.initializeEmojiData().then(() => Promise.all([DB.getEmojis(), DB.getEmojiCategories()])).then(([es, cats]) => {
                setEmojis(es);
                setCategories(cats);
            });
        }
    }, [activeGroup]);

    useEffect(() => {
        if (!activeGroup) return;
        const latestGroup = groups.find(group => group.id === activeGroup.id);
        if (latestGroup && latestGroup !== activeGroup) {
            setActiveGroup(latestGroup);
        }
    }, [groups, activeGroup?.id]);

    // Auto Scroll
    useLayoutEffect(() => {
        if (scrollRef.current && !selectionMode) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length, activeGroup, showActions, showEmojiPicker, isTyping, selectionMode]);

    const displayMessages = useMemo(() => messages.slice(-visibleCount), [messages, visibleCount]);

    const canReroll = useMemo(() => {
        if (isTyping || messages.length === 0) return false;
        const lastMsg = messages[messages.length - 1];
        return lastMsg.role === 'assistant';
    }, [isTyping, messages]);

    // --- Helpers ---

    const getTimeGapHint = (lastMsgTimestamp: number): string => {
        const now = Date.now();
        const diffHours = Math.floor((now - lastMsgTimestamp) / (1000 * 60 * 60));
        const diffMins = Math.floor((now - lastMsgTimestamp) / (1000 * 60));
        
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 23 || currentHour <= 6;

        if (diffMins < 10) return '聊天正在火热进行中，大家都很活跃。';
        if (diffMins < 60) return `距离上次发言过了 ${diffMins} 分钟，话题可能有点冷场。`;
        if (diffHours < 12) return `距离上次发言过了 ${diffHours} 小时。${isNight ? '现在是深夜。' : ''}`;
        return `大家已经 ${diffHours} 小时没说话了，群里很安静。`;
    };

    // New: Calculate private chat gap
    const getPrivateTimeGap = async (charId: string): Promise<string> => {
        const msgs = await DB.getMessagesByCharId(charId);
        // DB.getMessagesByCharId already filters out group messages in its definition? 
        // Let's ensure we look at messages WITHOUT groupId
        const privateMsgs = msgs.filter(m => !m.groupId);
        if (privateMsgs.length === 0) return '从未私聊过';
        
        const lastMsg = privateMsgs[privateMsgs.length - 1];
        const now = Date.now();
        const diffMins = Math.floor((now - lastMsg.timestamp) / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return '刚刚才私聊过';
        if (diffHours < 24) return `${diffHours}小时前私聊过`;
        return `${diffDays}天前私聊过`;
    };

    // --- Logic: Selection & Deletion ---

    const handleMessageLongPress = (id: number) => {
        const msg = messages.find(m => m.id === id);
        if (msg) {
            setSelectedMessage(msg);
            setModalType('message-options');
        }
        setShowActions(false);
        setShowEmojiPicker(false);
    };

    const handleCopyMessage = () => {
        if (!selectedMessage) return;
        navigator.clipboard.writeText(selectedMessage.content);
        setModalType('none');
        setSelectedMessage(null);
        addToast('已复制到剪贴板', 'success');
    };

    const handleEnterSelectionMode = () => {
        if (selectedMessage) {
            setSelectedMsgIds(new Set([selectedMessage.id]));
            setSelectionMode(true);
            setModalType('none');
            setSelectedMessage(null);
        }
    };

    const handleDeleteSingleMessage = async () => {
        if (!selectedMessage) return;
        await DB.deleteMessage(selectedMessage.id);
        setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已删除', 'success');
    };

    const toggleMessageSelection = (id: number) => {
        const next = new Set(selectedMsgIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedMsgIds(next);
    };

    const deleteSelectedMessages = async () => {
        if (selectedMsgIds.size === 0) return;
        await DB.deleteMessages(Array.from(selectedMsgIds));
        setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
        addToast(`已删除 ${selectedMsgIds.size} 条消息`, 'success');
    };

    const handleReroll = async () => {
        if (!canReroll) return;
        
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant') return;

        // Find all contiguous assistant messages at the end
        const toDeleteIds: number[] = [];
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role === 'assistant') {
            toDeleteIds.push(messages[index].id);
            index--;
        }

        if (toDeleteIds.length === 0) return;

        await DB.deleteMessages(toDeleteIds);
        const newHistory = messages.slice(0, index + 1);
        setMessages(newHistory);
        addToast('回溯对话中...', 'info');

        triggerDirector(newHistory);
    };

    // --- Logic: Group Management ---

    const handleCreateGroup = () => {
        if (!tempGroupName.trim() || selectedMembers.size < 2) {
            addToast('请输入群名并至少选择2名成员', 'error');
            return;
        }
        createGroup(tempGroupName, Array.from(selectedMembers));
        setModalType('none');
        setTempGroupName('');
        setSelectedMembers(new Set());
        addToast('群聊已创建', 'success');
    };

    const handleUpdateGroupInfo = async () => {
        if (!activeGroup) return;
        const name = tempGroupName.trim() || activeGroup.name;
        const updatedGroup = await updateGroup(activeGroup.id, { name });
        if (updatedGroup) setActiveGroup(updatedGroup);
        setModalType('none');
        addToast('群信息已更新', 'success');
    };

    const handleGroupAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeGroup) return;
        try {
            const base64 = await processImage(file);
            const updatedGroup = await updateGroup(activeGroup.id, { avatar: base64 });
            if (updatedGroup) setActiveGroup(updatedGroup);
            addToast('群头像已修改', 'success');
        } catch (err: any) {
            addToast('图片处理失败', 'error');
        }
    };

    const toggleMemberSelection = (id: string) => {
        const next = new Set(selectedMembers);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedMembers(next);
    };

    const handleDeleteGroup = async (id: string) => {
        await deleteGroup(id);
        if (activeGroup?.id === id) setView('list');
        addToast('群聊已解散', 'success');
    };

    const handleClearHistory = async () => {
        if (!activeGroup) return;

        // Fetch ALL messages from DB, not just the loaded subset
        const allGroupMsgs = await DB.getGroupMessages(activeGroup.id);

        let msgsToDelete = allGroupMsgs;
        let keepCount = 0;

        if (preserveContext) {
            msgsToDelete = allGroupMsgs.slice(0, -10);
            keepCount = Math.min(allGroupMsgs.length, 10);
        }

        if (msgsToDelete.length === 0) {
            addToast('消息太少，无需清理', 'info');
            return;
        }

        await DB.deleteMessages(msgsToDelete.map(m => m.id));

        // Refresh local state
        const remaining = preserveContext ? allGroupMsgs.slice(-10) : [];
        setMessages(remaining);
        setTotalMsgCount(remaining.length);

        addToast(`已清理 ${msgsToDelete.length} 条记录${preserveContext ? ' (保留最近10条)' : ''}`, 'success');
        setModalType('none');
    };

    // --- Logic: Group Summary & Distribution ---

    const handleGroupSummary = async () => {
        if (!activeGroup || !apiConfig.apiKey) {
            addToast('请检查配置', 'error');
            return;
        }

        setIsSummarizing(true);
        setSummaryProgress('正在读取完整群聊记录...');

        try {
            const allGroupMessages = await DB.getGroupMessages(activeGroup.id);
            const archiveMessages = [...allGroupMessages].sort((a, b) => (
                a.timestamp - b.timestamp || a.id - b.id
            ));

            if (archiveMessages.length === 0) {
                addToast('暂无聊天记录', 'info');
                return;
            }

            // Group messages by Date (YYYY-MM-DD)
            const msgsByDate: Record<string, Message[]> = {};
            archiveMessages.forEach(m => {
                const dateStr = new Date(m.timestamp).toLocaleDateString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit'}).replace(/\//g, '-');
                if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
                msgsByDate[dateStr].push(m);
            });

            const dates = Object.keys(msgsByDate).sort();
            
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                setSummaryProgress(`正在归档 ${date} (${i+1}/${dates.length})`);
                
                const dayMsgs = msgsByDate[date];
                const logText = dayMsgs.map(m => {
                    const sender = m.role === 'user'
                        ? userProfile.name
                        : (characters.find(c => c.id === m.charId)?.name || '未知成员');
                    return `${sender}: ${m.content}`;
                }).join('\n');

                // Use selected prompt template or fall back to default group summary
                const templateObj = archivePrompts.find(p => p.id === selectedPromptId);
                let prompt: string;

                if (templateObj) {
                    // Adapt the chat prompt for group context - replace per-character variables
                    const memberNames = activeGroup.members.map(id => characters.find(c => c.id === id)?.name || '未知').join('、');
                    prompt = templateObj.content
                        .replace(/\$\{dateStr\}/g, date)
                        .replace(/\$\{char\.name\}/g, `群成员(${memberNames})`)
                        .replace(/\$\{userProfile\.name\}/g, userProfile.name)
                        .replace(/\$\{rawLog.*?\}/g, logText.substring(0, 10000));
                    prompt = `[群聊: ${activeGroup.name}]\n${prompt}`;
                } else {
                    prompt = `
### Task: Group Chat Summary
Group: "${activeGroup.name}"
Date: ${date}

### Instructions
Summarize the following chat log into a **concise, 3rd-person, YAML format**.
- Focus on interactions, conflicts, and key topics.
- Be objective (like a narrator).
- **Strictly output valid YAML only.**

### Example Output
summary: "In [Group Name], [Char A] shared a photo of a cat. [Char B] made a joke about it, which caused a brief playful argument about pets."

### Logs
${logText.substring(0, 10000)}
`;
                }

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.3
                    })
                });

                if (response.ok) {
                    const data = await safeResponseJson(response);
                    let content = data.choices[0].message.content.trim();
                    // Basic YAML extraction
                    const yamlMatch = content.match(/summary:\s*["']?([\s\S]*?)["']?$/);
                    let summaryText = yamlMatch ? yamlMatch[1] : content.replace(/^summary:\s*/i, '');
                    
                    // Cleanup quotes if matched broadly
                    summaryText = summaryText.replace(/^["']|["']$/g, '').trim();

                    if (summaryText) {
                        // Distribute to Members
                        const newMem: MemoryFragment = {
                            id: `mem-${Date.now()}-${Math.random()}`,
                            date: date,
                            summary: `[群聊归档: ${activeGroup.name}] ${summaryText}`,
                            mood: 'group'
                        };

                        for (const memberId of activeGroup.members) {
                            const member = characters.find(c => c.id === memberId);
                            if (member) {
                                const updatedMems = [...(member.memories || []), newMem];
                                updateCharacter(member.id, { memories: updatedMems });
                            }
                        }
                    }
                }
                
                await new Promise(r => setTimeout(r, 500)); // Rate limit buffer
            }

            addToast('群聊记忆已同步至所有成员', 'success');
            setModalType('none');

        } catch (e: any) {
            console.error(e);
            addToast(`归档失败: ${e.message}`, 'error');
        } finally {
            setIsSummarizing(false);
            setSummaryProgress('');
        }
    };

    // --- Logic: Messaging ---

    const handleSendMessage = async (content: string, type: MessageType = 'text', metadata?: any) => {
        if (!activeGroup) return;
        
        const newMessage = {
            charId: 'user',
            groupId: activeGroup.id,
            role: 'user' as const,
            type,
            content,
            metadata
        };

        await DB.saveMessage(newMessage);
        
        // Optimistic update
        const updatedMsgs = await DB.getGroupMessages(activeGroup.id);
        setMessages(updatedMsgs);
        
        // Close panels
        if (type !== 'text') {
            setShowActions(false);
            setShowEmojiPicker(false);
        }
        setInput('');

        // NOTE: No auto-trigger. User must click lightning button.
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const base64 = await processImage(file, { maxWidth: 600, quality: 0.7, forceJpeg: true });
            handleSendMessage(base64, 'image');
        } catch (err) {
            addToast('图片发送失败', 'error');
        }
    };

    // --- Logic: AI Director (The Core Logic) ---

    const triggerDirector = async (currentMsgs: Message[]) => {
        if (!activeGroup || !apiConfig.apiKey) return;
        setIsTyping(true);

        try {
            const { messages: directorMsgs } = await DB.getRecentGroupMessagesWithCount(
                activeGroup.id,
                Math.max(contextLimit, currentMsgs.length, 30)
            ).catch(() => ({ messages: currentMsgs, totalCount: currentMsgs.length }));

            // 1. Prepare Group Context
            const groupMembers = groupScopedCharacters.filter(c => activeGroup.members.includes(c.id));
            
            // Calculate Time Context
            const lastMsg = directorMsgs[directorMsgs.length - 1];
            const timeGapInfo = lastMsg ? getTimeGapHint(lastMsg.timestamp) : "这是群聊的第一条消息。";
            const currentTimeStr = `${virtualTime.hours.toString().padStart(2, '0')}:${virtualTime.minutes.toString().padStart(2, '0')}`;

            let context = `【系统：群聊模拟器配置】
当前群名: "${activeGroup.name}"
当前系统时间: ${currentTimeStr}
时间流逝感知: ${timeGapInfo}
用户 (User): ${userProfile.name} (你服务的对象)
`;

            const buildMessageLine = (m: Message) => {
                let name = userProfile.name;
                if (m.role === 'assistant') {
                    name = characters.find(c => c.id === m.charId)?.name || '未知成员';
                }
                const content = m.type === 'image'
                    ? '[图片]'
                    : m.type === 'emoji'
                        ? '[表情包]'
                        : m.type === 'transfer'
                            ? `[红包/转账: ${m.metadata?.amount || ''}]`
                            : String(m.content || '');
                return `${name}: ${content}`;
            };

            const groupMemoryQuery = directorMsgs
                .slice(-12)
                .map(buildMessageLine)
                .join('\n')
                .slice(-1600);

            // 2. Inject Member Context (Strict Isolation via ContextBuilder)
            for (const member of groupMembers) {
                // Fetch Private Logs
                const privateMsgs = await DB.getMessagesByCharId(member.id);
                const recentPrivateMsgs = privateMsgs.slice(-80);
                const worldlineMemory = await selectWorldlineMemoryContext({
                    char: member,
                    user: userProfile,
                    mode: 'remote_chat',
                    surface: 'group_chat',
                    relationshipScope: relationshipScopeForProfile(member.id, userProfile)!,
                    currentMessages: recentPrivateMsgs,
                    query: groupMemoryQuery,
                    budgetChars: 1000,
                });

                // Use ContextBuilder for the heavy lifting of profile, impression, and archived memories
                const coreContext = ContextBuilder.buildCoreContext(member, userProfile, true);
                // Get private gap string
                const privateGapInfo = await getPrivateTimeGap(member.id);
                
                const recentPrivate = privateMsgs.slice(-12).map(m => `[${m.role === 'user' ? '用户' : '我'}]: ${String(m.content || '').substring(0, 120)}`).join('\n');
                
                // Construct Detailed Profile Wrapper
                // CRITICAL FIX: Emphasize Private Context logic
                context += `
<<< 角色档案 START: ${member.name} (ID: ${member.id}) >>>
${coreContext}
${worldlineMemory.markdown ? `
[世界线交汇记忆 / 最新状态补充]
${worldlineMemory.markdown}
（只在自然相关时吸收成反应，不要逐条复述。）
` : ''}

[重点：私聊状态 (Private Context)]: 
- **私聊空窗期**: ${privateGapInfo}
- **重要指令**: 如果 [私聊空窗期] 显示 "刚刚" 或 "几小时前"，请【忽略】群聊的时间流逝感知。哪怕群里很久没说话，只要你和用户私底下刚聊过，就【严禁】说 "好久不见" 或表现出疏离感。
- 最近私聊内容摘要，请以此作为你在群里状态的依据，如果私聊在吵架，群聊不会给别人好脸色，或者故意忽视或者试探用户，如果正在甜蜜，群聊中会有点支支吾吾之类的，根据你的性格进行发挥:
${recentPrivate || '(暂无私聊)'}
<<< 角色档案 END >>>
`;
            }

            // 3. Group History (uses configurable context limit)
            const recentGroupMsgs = directorMsgs.slice(-contextLimit).map(buildMessageLine).join('\n');

            // NEW: Build Categorized Emoji Context (filtered by group member visibility)
            const emojiContextStr = (() => {
                if (emojis.length === 0) return '无';

                const memberIds = activeGroup?.members || [];
                const { emojis: visibleEmojis, categories: visibleCats } = getVisibleEmojiScopeForGroup(emojis, categories, memberIds);

                const grouped: Record<string, string[]> = {};
                const catMap: Record<string, string> = { 'default': '通用' };
                visibleCats.forEach(c => catMap[c.id] = c.name);

                visibleEmojis.forEach(e => {
                    const cid = e.categoryId || 'default';
                    if (!grouped[cid]) grouped[cid] = [];
                    grouped[cid].push(e.name);
                });

                return Object.entries(grouped).map(([cid, names]) => {
                    const cName = catMap[cid] || '其他';
                    return `${cName}: [${names.join(', ')}]`;
                }).join('; ');
            })();

            const prompt = `${context}

### 【AI 导演任务指令 (Director Mode)】
当前场景：大家正在群里聊天。
最近聊天记录：
${recentGroupMsgs}

### 任务：生成一段精彩的群聊互动 (Conversation Flow)
请作为导演，接管所有角色，让群聊**自然地流动起来**。

### 核心规则 (Strict Rules)
1. **去中心化**: 角色之间要有互动，不要每个人都只对着用户说话。并且，必须A说了,B说，然后A会回应B，总之，角色之间应该互相回应，而不是发言完就不发言了。
2. **多轮对话**: 请一次性生成 **1 到 6 条** 消息。
3. **表情包支持**:
   - 角色可以发送表情包。
   - 必须使用格式: \`[[SEND_EMOJI: 表情名称]]\`
   - **可用表情 (按分类)**: ${emojiContextStr}
4. **气泡分段 (Bubble Splitting)**:
   - 就像真人聊天一样，如果一个角色要说长话，或者有停顿，请把内容分成多条消息。
   - 在一条内容中，使用换行符分隔不同的气泡，每一行会变成一个独立气泡。
5. **私聊感知 (优先级最高)**:
   - 请务必检查每个角色的 [私聊空窗期]。
   - 如果某个角色刚刚才私聊过用户，哪怕群里很冷清，TA也应该表现得很熟络，不能说 "好久不见"。
6. **主动私聊 (Private Messaging)**:
   - 角色可以主动向用户发起私聊（例如吐槽群友、邀请约会、或者单纯想避开其他人说话）。
   - 使用格式: \`[[PRIVATE: 私聊内容]]\`。
   - 这条消息将直接发送到私聊频道，**不会**在群里显示。
   - 允许同时在群里说话并发送私聊（分为两个动作或合并）。

### 输出格式 (JSON Array)
[
  {
    "charId": "角色的ID",
    "content": "发言内容... (可以是文本、[[SEND_EMOJI: name]] 或 [[PRIVATE: content]])"
  },
  ...
]
`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.9, // High creativity for banter
                    max_tokens: 8000
                })
            });

            if (!response.ok) throw new Error('Director Failed');

            const data = await safeResponseJson(response);
            let jsonStr = data.choices[0].message.content;
            
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBracket = jsonStr.indexOf('[');
            const lastBracket = jsonStr.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
            }

            let actions = [];
            try {
                actions = JSON.parse(jsonStr);
                if (!Array.isArray(actions)) actions = [];
            } catch (e) {
                console.error("Director Parse Error", jsonStr);
            }

            // Execute Actions with Splitting Logic
            for (const action of actions) {
                const targetId = activeGroup.members.find(id => id === action.charId);
                if (!targetId) continue;
                const charName = characters.find(c => c.id === targetId)?.name || '成员';

                // 0. Check for Private Message Command (Regex updated for robustness)
                const privateMatches = [];
                // Handle multiple private messages in one block or mixed content
                const privateRegex = /\[\[PRIVATE\s*[:：]\s*([\s\S]*?)\]\]/g;
                let match;
                while ((match = privateRegex.exec(action.content)) !== null) {
                    privateMatches.push(match);
                }

                if (privateMatches.length > 0) {
                    for (const m of privateMatches) {
                        const privateContent = m[1].trim();
                        if (privateContent) {
                            // Save to private chat (no groupId)
                            await DB.saveMessage({
                                charId: targetId,
                                role: 'assistant',
                                type: 'text',
                                content: privateContent
                            });
                            addToast(`${charName} 悄悄对你说: ${privateContent.substring(0, 15)}...`, 'info');
                        }
                        // Strip the private command from the public content
                        action.content = action.content.replace(m[0], '');
                    }
                    action.content = action.content.trim();
                    
                    // If content is empty after stripping (pure private message), skip public rendering
                    if (!action.content) continue;
                }

                // 1. Check for Emoji Commands (handle multiple emojis)
                // Filter emojis by character visibility to prevent using hidden emoji packs
                const charVisibleEmojis = getVisibleEmojiScopeForCharacter(emojis, categories, targetId).emojis;
                const emojiRegex = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
                let emojiMatch;
                while ((emojiMatch = emojiRegex.exec(action.content)) !== null) {
                    const emojiName = emojiMatch[1].trim();
                    const foundEmoji = charVisibleEmojis.find(e => e.name === emojiName);
                    if (foundEmoji) {
                        await DB.saveMessage({
                            charId: targetId,
                            groupId: activeGroup.id,
                            role: 'assistant',
                            type: 'emoji',
                            content: foundEmoji.url
                        });
                        setMessages(await DB.getGroupMessages(activeGroup.id));
                        await new Promise(r => setTimeout(r, 800)); // Delay after emoji
                    }
                }

                // 2. Text Splitting (Standard Chat Logic)
                // Remove the emoji tag if it was processed, or just clean up
                let textContent = action.content.replace(/\[\[SEND_EMOJI:.*?\]\]/g, '').trim();
                
                if (textContent) {
                    // Primary: split on line breaks
                    let chunks = textContent.split(/(?:\r\n|\r|\n|\u2028|\u2029)+/)
                        .map((c: string) => c.trim())
                        .filter((c: string) => c.length > 0);

                    // Fallback: split on spaces between CJK characters (中文里空格=AI想换行)
                    if (chunks.length <= 1 && textContent.trim().length > 50) {
                        chunks = textContent.split(/(?<=[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2000-\u206f\u2e80-\u2eff\u3001-\u3003\u2018-\u201f\u300a-\u300f\uff01-\uff0f\uff1a-\uff20])\s+(?=[\u4e00-\u9fff\u3400-\u4dbf])/)
                            .map((c: string) => c.trim())
                            .filter((c: string) => c.length > 0);
                    }

                    if (chunks.length === 0) chunks.push(textContent); // Fallback

                    for (const chunk of chunks) {
                        // Typing delay
                        const delay = Math.max(500, chunk.length * 50 + Math.random() * 200);
                        await new Promise(r => setTimeout(r, delay));

                        await DB.saveMessage({
                            charId: targetId,
                            groupId: activeGroup.id,
                            role: 'assistant',
                            type: 'text',
                            content: chunk
                        });
                        setMessages(await DB.getGroupMessages(activeGroup.id));
                    }
                }
            }

        } catch (e: any) {
            console.error(e);
        } finally {
            setIsTyping(false);
        }
    };

    // --- Renderers ---

    if (view === 'list') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <AppHeader
                    title="群聊列表"
                    onBack={closeApp}
                    titleClassName="truncate text-lg font-semibold tracking-wide text-slate-700"
                    right={(
                    <AppHeaderAddButton
                        onClick={() => { setModalType('create'); setSelectedMembers(new Set()); setTempGroupName(''); }}
                        className="text-violet-500 bg-violet-50 hover:bg-violet-100"
                        title="创建群聊"
                    />
                    )}
                />
                
                <div className="p-4 space-y-3 overflow-y-auto">
                    {groups.map(g => (
                        <div key={g.id} onClick={() => { setActiveGroup(g); setView('chat'); }} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 active:scale-[0.98] transition-all cursor-pointer group hover:bg-violet-50/30">
                            {/* Group Avatar Logic */}
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 relative shadow-sm">
                                {g.avatar ? (
                                    <img src={g.avatar} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="grid grid-cols-2 gap-0.5 p-0.5 w-full h-full bg-slate-200">
                                        {g.members.slice(0, 4).map(mid => {
                                            const c = characters.find(char => char.id === mid);
                                            return <img key={mid} src={c?.avatar} className="w-full h-full object-cover rounded-sm bg-white" />;
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-700 truncate text-base">{g.name}</div>
                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" /></svg>
                                    {g.members.length} 成员
                                </div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </div>
                    ))}
                    {groups.length === 0 && (
                        <div className="text-center text-slate-400 text-xs py-10 flex flex-col items-center gap-2">
                            <UsersThree size={36} className="opacity-50" />
                            暂无群聊，点击右上角创建
                        </div>
                    )}
                </div>

                <Modal isOpen={modalType === 'create'} title="创建群聊" onClose={() => setModalType('none')} footer={<button onClick={handleCreateGroup} className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl shadow-lg shadow-violet-200">创建</button>}>
                    <div className="space-y-4">
                        <input value={tempGroupName} onChange={e => setTempGroupName(e.target.value)} placeholder="群聊名称" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/20 transition-all" />
                        {personaScope.hasLinkedFocus ? (
                            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] leading-relaxed text-violet-500">
                                群聊属于面具「{personaScope.activeMaskLabel || '未命名面具'}」的生活圈，只能邀请已经链接的角色。
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] leading-relaxed text-violet-500">
                                当前面具还没有链接角色。先在通讯录里建立关系，再创建群聊。
                            </div>
                        )}
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">选择成员</label>
                            </div>
                            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                                {groupCandidateCharacters.map(c => (
                                    <div key={c.id} onClick={() => toggleMemberSelection(c.id)} className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all cursor-pointer ${selectedMembers.has(c.id) ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-slate-100 bg-white hover:border-slate-300'}`}>
                                        <img src={c.avatar} className="w-10 h-10 rounded-full object-cover" />
                                        <span className="text-[9px] text-slate-600 truncate w-full text-center font-medium">{c.name}</span>
                                    </div>
                                ))}
                                {groupCandidateCharacters.length === 0 && (
                                    <div className="col-span-4 py-6 text-center text-xs text-slate-400">暂无可邀请的生活圈角色</div>
                                )}
                            </div>
                        </div>
                    </div>
                </Modal>
            </div>
        );
    }

    // CHAT VIEW
    return (
        <div className="h-full w-full bg-[#f0f4f8] flex flex-col font-sans relative">
            {/* Header */}
            <div
                data-shell-app-header
                className="bg-white/80 backdrop-blur-xl px-4 pb-2 border-b border-slate-200/60 shrink-0 z-30 sticky top-0 shadow-sm transition-all"
                style={{ height: SHELL_APP_HEADER_HEIGHT, paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}
            >
                {selectionMode ? (
                    <div className="flex items-center justify-between w-full h-full">
                        <button onClick={() => { setSelectionMode(false); setSelectedMsgIds(new Set()); }} className="text-xs font-bold text-slate-500 px-2 py-1">取消</button>
                        <span className="text-sm font-bold text-slate-800">已选 {selectedMsgIds.size} 项</span>
                        <div className="w-10"></div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5 w-full h-full">
                        <button onClick={() => setView('list')} className="w-8 h-8 -ml-2 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="flex-1 min-w-0" onClick={() => { setTempGroupName(activeGroup?.name || ''); setModalType('settings'); }}>
                            <h1 className="text-[14px] font-bold text-slate-800 truncate flex items-center gap-1 leading-tight">
                                {activeGroup?.name}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-400"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                            </h1>
                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                                <div className="flex -space-x-1">
                                    {activeGroupMembers.slice(0, 4).map(member => (
                                        <img
                                            key={member.id}
                                            src={member.avatar}
                                            className="w-4 h-4 rounded-full object-cover border border-white shadow-[0_1px_2px_rgba(15,23,42,0.10)]"
                                            alt={member.name}
                                        />
                                    ))}
                                </div>
                                <span className="truncate">
                                    {activeGroupMembers.length} 成员{activeGroupMembers.length > 0 ? ` · ${activeGroupMembers.slice(0, 3).map(member => member.name).join('、')}` : ''}
                                </span>
                            </div>
                        </div>
                        
                        {/* Reroll Button (Context Aware) */}
                        {canReroll && !isTyping && (
                            <button 
                                onClick={handleReroll} 
                                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-violet-600 transition-colors flex items-center justify-center"
                                title="重新生成回复"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[17px] h-[17px]"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                            </button>
                        )}

                        {/* Manual Trigger Button (Only trigger, not send) */}
                        <button 
                            onClick={() => triggerDirector(messages)} 
                            disabled={isTyping} 
                            className={`w-8 h-8 rounded-full transition-all active:scale-90 flex items-center justify-center ${isTyping ? 'bg-slate-100 text-slate-300' : 'bg-violet-100 text-violet-600 shadow-sm'}`}
                            title="触发 AI 导演"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[17px] h-[17px]"><path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .914-.143Z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar space-y-2 bg-[#f0f4f8]" ref={scrollRef}>
                {totalMsgCount > messages.length && activeGroup && (
                    <div className="flex justify-center mb-4">
                        <button onClick={async () => {
                            const { messages: moreMsgs, totalCount } = await DB.getRecentGroupMessagesWithCount(activeGroup.id, messages.length + 30);
                            setMessages(moreMsgs);
                            setTotalMsgCount(totalCount);
                            setVisibleCount(moreMsgs.length);
                        }} className="px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full text-xs text-slate-500 shadow-sm border border-white hover:bg-white transition-colors">
                            加载历史消息 ({totalMsgCount - messages.length})
                        </button>
                    </div>
                )}
                {displayMessages.map((m, i) => {
                    const isUser = m.role === 'user';
                    const char = characters.find(c => c.id === m.charId);

                    return (
                        <GroupMessageItem
                            key={m.id || i}
                            msg={m}
                            isUser={isUser}
                            char={char}
                            userAvatar={userProfile.avatar}
                            onImageClick={(url) => window.open(url, '_blank')}
                            selectionMode={selectionMode}
                            isSelected={selectedMsgIds.has(m.id)}
                            onToggleSelect={toggleMessageSelection}
                            onLongPress={handleMessageLongPress}
                        />
                    );
                })}
                {isTyping && (
                    <div className="flex items-center gap-2 pl-4 py-2 animate-pulse opacity-70">
                        <div className="flex -space-x-1">
                            <div className="w-6 h-6 rounded-full bg-slate-300 border-2 border-white"></div>
                            <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white"></div>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">成员正在输入...</span>
                    </div>
                )}
            </div>

            {/* Redesigned Input Area (WeChat/iOS Style) */}
            <div className="bg-[#f0f2f5] border-t border-slate-200 pb-safe shrink-0 z-40 relative">
                {selectionMode ? (
                    <div className="p-3 flex justify-center bg-white">
                        <button 
                            onClick={deleteSelectedMessages} 
                            className="w-full py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                            删除 ({selectedMsgIds.size})
                        </button>
                    </div>
                ) : (
                    <div className="p-2 flex items-center gap-2">
                        {/* Plus / Actions Button */}
                        <button 
                            onClick={() => { setShowActions(!showActions); setShowEmojiPicker(false); }}
                            aria-label="展开更多功能"
                            className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 self-center transition-all active:scale-95 ${showActions ? 'bg-slate-200 border-slate-400 rotate-45 text-slate-700' : 'bg-transparent border-slate-500/80 text-slate-600 hover:bg-slate-200'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[18px] h-[18px]">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                            </svg>
                        </button>

                        {/* Input Field Container */}
                        <div className="flex-1 min-h-[44px] bg-white rounded-xl flex items-center px-3 py-2 border border-slate-200 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
                            <textarea 
                                rows={1} 
                                value={input} 
                                onChange={e => setInput(e.target.value)} 
                                onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(input); }}} 
                                className="flex-1 bg-transparent text-[15px] outline-none resize-none max-h-28 text-slate-800 placeholder:text-slate-400 py-1"
                                placeholder="Message..." 
                                style={{ height: 'auto', minHeight: '24px' }} 
                            />
                            {/* Emoji Toggle inside input */}
                            <button 
                                onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowActions(false); }}
                                className="p-1 -mr-1 ml-1 text-slate-400 hover:text-yellow-500 transition-colors shrink-0"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /></svg>
                            </button>
                        </div>

                        {/* Send Button */}
                        {input.trim() ? (
                            <button 
                                onClick={() => handleSendMessage(input)} 
                                className="h-9 px-4 bg-violet-500 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all self-center"
                            >
                                发送
                            </button>
                        ) : (
                            <div className="w-2"></div>
                        )}
                    </div>
                )}

                {/* --- Action Drawer --- */}
                {showActions && (
                    <div className="h-64 bg-[#f0f2f5] border-t border-slate-200 p-6 animate-slide-up">
                        <div className="grid grid-cols-4 gap-6">
                            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 group">
                                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-200 group-active:scale-95 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                                </div>
                                <span className="text-xs text-slate-500">相册</span>
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

                            <button onClick={() => setModalType('transfer')} className="flex flex-col items-center gap-2 group">
                                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-200 group-active:scale-95 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-orange-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                                </div>
                                <span className="text-xs text-slate-500">红包</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* --- Emoji Drawer --- */}
                {showEmojiPicker && (
                    <div className="h-64 bg-[#f0f2f5] border-t border-slate-200 p-4 animate-slide-up overflow-y-auto no-scrollbar">
                        <div className="grid grid-cols-5 gap-3">
                            {emojis.map((e, i) => (
                                <button key={i} onClick={() => handleSendMessage(e.url, 'emoji')} className="aspect-square bg-white rounded-xl p-2 border border-slate-200 shadow-sm active:scale-95 flex items-center justify-center">
                                    <img src={e.url} className="w-full h-full object-contain pointer-events-none" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* --- Modals --- */}

            {/* Group Settings Modal */}
            <Modal isOpen={modalType === 'settings'} title="群组设置" onClose={() => setModalType('none')} footer={<button onClick={handleUpdateGroupInfo} className="w-full py-3 bg-violet-500 text-white text-sm font-bold rounded-2xl shadow-lg shadow-violet-200">保存修改</button>}>
                <div className="space-y-5">
                    {/* Header Info */}
                    <div className="flex justify-center">
                        <div onClick={() => groupAvatarInputRef.current?.click()} className="w-24 h-24 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer overflow-hidden relative group hover:border-violet-400">
                            {activeGroup?.avatar ? <img src={activeGroup.avatar} className="w-full h-full object-cover opacity-90 group-hover:opacity-100" /> : <span className="text-xs text-slate-400 font-bold">更换头像</span>}
                            <div className="absolute inset-0 bg-black/20 hidden group-hover:flex items-center justify-center text-white"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg></div>
                        </div>
                        <input type="file" ref={groupAvatarInputRef} className="hidden" accept="image/*" onChange={handleGroupAvatarUpload} />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">群名称</label>
                        <input value={tempGroupName} onChange={e => setTempGroupName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-violet-300 transition-all" />
                    </div>

                    {/* Context Limit */}
                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">AI 上下文条数 ({contextLimit})</label>
                        <input type="range" min="20" max="5000" step="10" value={contextLimit} onChange={e => { const v = parseInt(e.target.value); setContextLimit(v); localStorage.setItem('groupchat_context_limit', String(v)); }} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-violet-500" />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>20 (省流)</span><span>5000 (超长记忆)</span></div>
                        <p className="text-[9px] text-slate-400 mt-1 leading-tight">控制每次触发 AI 导演时读取的群聊历史条数；后台会按这个数量从本地历史拉取，不依赖当前屏幕加载了多少条。</p>
                    </div>

                    {/* Memory & Context Management */}
                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">群聊记忆 (Neural Link)</label>

                        {/* Prompt Selection */}
                        <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 mb-3">
                            <label className="text-[9px] font-bold text-indigo-400 uppercase mb-2 block">选择总结提示词</label>
                            <div className="flex flex-col gap-1.5">
                                {archivePrompts.map(p => (
                                    <div key={p.id} onClick={() => setSelectedPromptId(p.id)} className={`px-3 py-2 rounded-lg border cursor-pointer text-xs font-bold transition-all ${selectedPromptId === p.id ? 'bg-white border-indigo-400 text-indigo-700 shadow-sm' : 'bg-white/50 border-indigo-100 text-slate-500 hover:bg-white'}`}>
                                        {p.name}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[8px] text-indigo-300 mt-2 leading-tight">提示词与聊天-归档共享，可在聊天设置中自定义。</p>
                        </div>

                        <button onClick={handleGroupSummary} disabled={isSummarizing} className="w-full py-3 bg-indigo-50 text-indigo-600 text-sm font-bold rounded-2xl border border-indigo-100 active:scale-95 transition-transform flex items-center justify-center gap-2 mb-2">
                            {isSummarizing ? (
                                <><div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div><span className="text-xs">{summaryProgress || '处理中...'}</span></>
                            ) : (
                                <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg> 生成总结并同步到全员记忆</>
                            )}
                        </button>
                        <p className="text-[9px] text-slate-400 leading-tight px-1">读取该群完整本地历史，使用选中的提示词风格生成群聊总结，并写入所有群成员的角色记忆。</p>
                    </div>

                    {/* Danger Zone */}
                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-3 block">危险区域</label>
                        
                        <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => setPreserveContext(!preserveContext)}>
                             <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${preserveContext ? 'bg-violet-500 border-violet-500' : 'bg-slate-100 border-slate-300'}`}>
                                 {preserveContext && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                             </div>
                             <span className="text-xs text-slate-600">清空时保留最后10条记录 (维持语境)</span>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={handleClearHistory} className="flex-1 py-3 bg-red-50 text-red-500 font-bold rounded-2xl border border-red-100 active:scale-95 transition-transform flex items-center justify-center gap-2 text-xs">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                清空聊天
                            </button>
                            <button onClick={() => { if(activeGroup) handleDeleteGroup(activeGroup.id); }} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-2xl text-xs font-bold transition-colors shadow-lg shadow-red-200">解散群聊</button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Message Options Modal */}
            <Modal isOpen={modalType === 'message-options'} title="消息操作" onClose={() => { setModalType('none'); setSelectedMessage(null); }}>
                <div className="space-y-3">
                    <button onClick={handleEnterSelectionMode} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        多选 / 批量删除
                    </button>
                    {selectedMessage?.type === 'text' && (
                        <button onClick={handleCopyMessage} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            复制文字
                        </button>
                    )}
                    <button onClick={handleDeleteSingleMessage} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors flex items-center justify-center gap-2">
                        删除消息
                    </button>
                </div>
            </Modal>

            {/* Transfer Modal */}
            <Modal isOpen={modalType === 'transfer'} title="发送红包" onClose={() => setModalType('none')} footer={<button onClick={() => { handleSendMessage(`[红包] ${transferAmount} Credits`, 'transfer', { amount: transferAmount }); setModalType('none'); }} className="w-full py-3 bg-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-200">塞进红包</button>}>
                <div className="space-y-4">
                    <div className="text-center py-4 animate-bounce"><img src={twemojiUrl('1f9e7')} alt="red envelope" className="w-12 h-12 mx-auto" /></div>
                    <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="金额" className="w-full px-4 py-4 bg-slate-100 rounded-2xl text-center text-2xl font-bold outline-none text-slate-800 placeholder:text-slate-300" autoFocus />
                </div>
            </Modal>

        </div>
    );
};

export default GroupChat;
