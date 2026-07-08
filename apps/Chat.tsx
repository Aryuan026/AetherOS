import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { CompanionWakeupRule, Message, MessageType, MemoryFragment, Emoji, EmojiCategory } from '../types';
import { processImage } from '../utils/file';
import { safeResponseJson } from '../utils/safeApi';
import { formatLifeSimResetCardForContext } from '../utils/lifeSimChatCard';
import MessageItem from '../components/chat/MessageItem';
import { DEFAULT_CHAT_BACKGROUND_IMAGE, PRESET_THEMES, DEFAULT_ARCHIVE_PROMPTS, DEEP_SPACE_APPEARANCE_PRESET_ID, normalizeChatAppearancePresetId, resolveChatAppearanceTheme } from '../components/chat/ChatConstants';
import ChatHeader from '../components/chat/ChatHeaderShell';
import ChatInputArea from '../components/chat/ChatInputArea';
import ChatModals from '../components/chat/ChatModals';
import Modal from '../components/os/Modal';
import EmotionSettingsModal from '../components/chat/EmotionSettingsModal';
import { useChatAI } from '../hooks/useChatAI';
import { synthesizeSpeech, cleanTextForTts } from '../utils/minimaxTts';
import { getVisibleEmojiScopeForCharacter } from '../utils/emojiVisibility';
import {
    DEFAULT_DIRECT_LINES,
    loadCompanionWakeupSettings,
    pickDirectWakeupLine,
    resolveCompanionWakeupMode,
    scheduleNextCompanionWakeup,
} from '../utils/companionWakeups';
import { mergeDefaultHeartbeatRules, syncBuiltInCareWakeupRules } from '../utils/companionWakeupRules';

const VOICE_LANG_LABELS: Record<string, string> = { en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', es: 'Español' };

type CompanionWakeupStatus = {
    active: boolean;
    enabledCount: number;
    nextTriggerAt?: number;
    nextTitle?: string;
};

const emptyCompanionWakeupStatus: CompanionWakeupStatus = {
    active: false,
    enabledCount: 0,
};

const buildCompanionWakeupStatus = (
    rules: CompanionWakeupRule[],
    now = Date.now(),
): CompanionWakeupStatus => {
    const enabledHeartbeat = rules.filter(rule => rule.kind === 'heartbeat' && rule.enabled);
    const enabledWakeups = rules.filter(rule => rule.enabled && (rule.kind === 'heartbeat' || rule.kind === 'window'));
    const upcoming = enabledWakeups
        .map(rule => ({
            rule,
            nextTriggerAt: rule.nextTriggerAt && rule.nextTriggerAt > now
                ? rule.nextTriggerAt
                : scheduleNextCompanionWakeup(rule, now),
        }))
        .sort((a, b) => a.nextTriggerAt - b.nextTriggerAt);

    return {
        active: enabledHeartbeat.length > 0,
        enabledCount: enabledWakeups.length,
        nextTriggerAt: upcoming[0]?.nextTriggerAt,
        nextTitle: upcoming[0]?.rule.title,
    };
};

const formatCompanionWakeupTime = (timestamp?: number): string => {
    if (!timestamp) return '尚未排程';
    const date = new Date(timestamp);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayOffset = Math.round((targetDayStart - dayStart) / 86400000);
    const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (dayOffset === 0) return `今天 ${time}`;
    if (dayOffset === 1) return `明天 ${time}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
};

const isStarterSeedMessage = (message: Message) => (
    message.metadata?.source === 'starter' || typeof message.metadata?.seedId === 'string'
);

const dedupeStarterMessages = (messages: Message[]) => {
    const seen = new Set<string>();
    return messages.filter((message) => {
        if (!isStarterSeedMessage(message)) return true;
        const seedKey = [
            message.charId,
            message.metadata?.seedId || 'starter',
            message.role,
            message.type,
            message.content.trim(),
        ].join('::');
        if (seen.has(seedKey)) return false;
        seen.add(seedKey);
        return true;
    });
};

const Chat: React.FC = () => {
    const { characters, activeCharacterId, setActiveCharacterId, updateCharacter, apiConfig, apiPresets, addApiPreset, closeApp, customThemes, addToast, userProfile, lastMsgTimestamp, groups, clearUnread, realtimeConfig, theme: rawOsTheme } = useOS();
    const [messages, setMessages] = useState<Message[]>([]);
    const [totalMsgCount, setTotalMsgCount] = useState(0);
    const [visibleCount, setVisibleCount] = useState(30);
    const [input, setInput] = useState('');
    const [showPanel, setShowPanel] = useState<'none' | 'actions' | 'emojis' | 'chars'>('none');
    
    // Emoji State
    const [emojis, setEmojis] = useState<Emoji[]>([]);
    const [categories, setCategories] = useState<EmojiCategory[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('default');
    const [newCategoryName, setNewCategoryName] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);
    const lastMsgIdRef = useRef<number | null>(null);
    const scrollThrottleRef = useRef(0);
    const visibleCountRef = useRef(30);
    const activeCharIdRef = useRef(activeCharacterId);
    const charRef = useRef<typeof char>(null as any);

    // Reply Logic
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);

    const [modalType, setModalType] = useState<'none' | 'transfer' | 'emoji-import' | 'chat-settings' | 'message-options' | 'edit-message' | 'delete-emoji' | 'delete-category' | 'add-category' | 'history-manager' | 'archive-settings' | 'prompt-editor' | 'category-options' | 'category-visibility' | 'emoji-pack-manager'>('none');
    const [allHistoryMessages, setAllHistoryMessages] = useState<Message[]>([]);
    const [transferAmt, setTransferAmt] = useState('');
    const [emojiImportText, setEmojiImportText] = useState('');
    const [settingsContextLimit, setSettingsContextLimit] = useState(500);
    const [settingsHideSysLogs, setSettingsHideSysLogs] = useState(false);
    const [preserveContext, setPreserveContext] = useState(true); 
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [selectedEmoji, setSelectedEmoji] = useState<Emoji | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<EmojiCategory | null>(null); // For deletion modal
    const [editContent, setEditContent] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [showReplyModeModal, setShowReplyModeModal] = useState(false);
    const [showEmotionModal, setShowEmotionModal] = useState(false);

    // Archive Prompts State
    const [archivePrompts, setArchivePrompts] = useState<{id: string, name: string, content: string}[]>(DEFAULT_ARCHIVE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');
    const [editingPrompt, setEditingPrompt] = useState<{id: string, name: string, content: string} | null>(null);

    // --- Multi-Select State ---
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
    const osTheme = useMemo(() => resolveChatAppearanceTheme(rawOsTheme), [rawOsTheme]);

    // --- Translation State (per-character toggle, global language settings) ---
    const [translationEnabled, setTranslationEnabled] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`chat_translate_enabled_${activeCharacterId}`) || 'false'); } catch { return false; }
    });
    const [translateSourceLang, setTranslateSourceLang] = useState(() => {
        return localStorage.getItem('chat_translate_source_lang') || '日本語';
    });
    const [translateTargetLang, setTranslateTargetLang] = useState(() => {
        return localStorage.getItem('chat_translate_lang') || '中文';
    });
    // Which messages are currently showing "译" version (toggle state only, no API calls)
    const [showingTargetIds, setShowingTargetIds] = useState<Set<number>>(new Set());

    const char = characters.find(c => c.id === activeCharacterId) || characters[0];
    charRef.current = char; // Keep ref in sync for async callbacks
    const appearancePresetId = normalizeChatAppearancePresetId(osTheme.chatAppearancePreset);
    const presetThemeId = appearancePresetId === DEEP_SPACE_APPEARANCE_PRESET_ID
        ? 'default'
        : appearancePresetId;
    const currentThemeId = osTheme.chatBubbleThemeId || presetThemeId;
    const activeTheme = useMemo(() => customThemes.find(t => t.id === currentThemeId) || PRESET_THEMES[currentThemeId] || PRESET_THEMES.default, [currentThemeId, customThemes]);
    const draftKey = `chat_draft_${activeCharacterId}`;
    const autoReplyEnabled = char?.autoReplyEnabled !== false;
    const [companionWakeupActive, setCompanionWakeupActive] = useState(false);
    const [companionWakeupStatus, setCompanionWakeupStatus] = useState<CompanionWakeupStatus>(emptyCompanionWakeupStatus);

    // Filter categories and emojis by active character's visibility (used for both AI prompt and UI)
    const emojiScope = useMemo(
        () => getVisibleEmojiScopeForCharacter(emojis, categories, activeCharacterId),
        [emojis, categories, activeCharacterId],
    );
    const visibleCategories = emojiScope.categories;
    const aiVisibleEmojis = emojiScope.emojis;
    const hiddenCategoryIds = emojiScope.hiddenCategoryIds;




    // --- Initialize Hook ---
    const { isTyping, recallStatus, emotionStatus, lastTokenUsage, tokenBreakdown, setLastTokenUsage, triggerAI } = useChatAI({
        char,
        userProfile,
        apiConfig,
        groups,
        emojis: aiVisibleEmojis,
        categories: visibleCategories,
        addToast,
        setMessages,
        realtimeConfig,
        translationConfig: translationEnabled
            ? { enabled: true, sourceLang: translateSourceLang, targetLang: translateTargetLang }
            : undefined,
        updateCharacter,
    });
    const replySignalActive = companionWakeupActive;

    const refreshCompanionWakeupActive = useCallback(async () => {
        if (!char?.id) {
            setCompanionWakeupActive(false);
            setCompanionWakeupStatus(emptyCompanionWakeupStatus);
            return;
        }
        let rules = await DB.getCompanionWakeupRulesByCharId(char.id);
        if (rules.some(rule => rule.kind === 'heartbeat' && rule.enabled)) {
            const settings = loadCompanionWakeupSettings();
            const now = Date.now();
            const heartbeats = mergeDefaultHeartbeatRules(char, rules.filter(rule => rule.kind === 'heartbeat'), settings, now);
            for (const rule of heartbeats) {
                await DB.saveCompanionWakeupRule(rule);
            }
            const careRules = await syncBuiltInCareWakeupRules(char, settings.aiCareWindowsEnabled, settings, rules);
            rules = [
                ...rules.filter(rule => (
                    rule.kind !== 'heartbeat'
                    && !rule.id.startsWith(`wake-care-built-in-${char.id}-`)
                )),
                ...heartbeats,
                ...careRules,
            ];
            if (char.autoReplyEnabled === false) {
                updateCharacter(char.id, { autoReplyEnabled: true });
            }
        }
        const status = buildCompanionWakeupStatus(rules);
        setCompanionWakeupActive(status.active);
        setCompanionWakeupStatus(status);
    }, [char, updateCharacter]);

    useEffect(() => {
        void refreshCompanionWakeupActive();
    }, [refreshCompanionWakeupActive, lastMsgTimestamp]);

    useEffect(() => {
        if (!char?.id || !companionWakeupActive || char.autoReplyEnabled !== false) return;
        updateCharacter(char.id, { autoReplyEnabled: true });
    }, [char?.id, char?.autoReplyEnabled, companionWakeupActive, updateCharacter]);

    const enableCompanionWakeup = useCallback(async () => {
        if (!char?.id) return;
        const settings = loadCompanionWakeupSettings();
        const now = Date.now();
        const existing = await DB.getCompanionWakeupRulesByCharId(char.id);
        const heartbeatRules = existing.filter(rule => rule.kind === 'heartbeat');
        const rulesToSave: CompanionWakeupRule[] = mergeDefaultHeartbeatRules(char, heartbeatRules, settings, now);

        for (const rule of rulesToSave) {
            await DB.saveCompanionWakeupRule(rule);
        }
        const careRules = settings.aiCareWindowsEnabled
            ? await syncBuiltInCareWakeupRules(char, true, settings, existing)
            : [];
        if (char.autoReplyEnabled === false) {
            updateCharacter(char.id, { autoReplyEnabled: true });
        }
        const status = buildCompanionWakeupStatus([...existing, ...rulesToSave, ...careRules]);
        setCompanionWakeupActive(status.active);
        setCompanionWakeupStatus(status);
        addToast(`${char.name} 偶尔会自然来信`, 'success');
    }, [addToast, char, updateCharacter]);

    const disableCompanionWakeup = useCallback(async () => {
        if (!char?.id) return;
        const now = Date.now();
        const rules = await DB.getCompanionWakeupRulesByCharId(char.id);
        for (const rule of rules.filter(item => item.kind === 'heartbeat' || item.kind === 'window')) {
            await DB.saveCompanionWakeupRule({ ...rule, enabled: false, updatedAt: now });
        }
        setCompanionWakeupActive(false);
        setCompanionWakeupStatus(emptyCompanionWakeupStatus);
        addToast(`${char.name} 暂时不会主动打扰`, 'info');
    }, [addToast, char]);

    const handleToggleCompanionWakeup = useCallback(async () => {
        if (companionWakeupActive) {
            await disableCompanionWakeup();
        } else {
            await enableCompanionWakeup();
        }
    }, [companionWakeupActive, disableCompanionWakeup, enableCompanionWakeup]);

    const handleCompanionWakeupProbe = useCallback(async (event?: React.SyntheticEvent) => {
        event?.stopPropagation();
        if (!char?.id) return;

        const now = Date.now();
        const settings = loadCompanionWakeupSettings();
        let rules = await DB.getCompanionWakeupRulesByCharId(char.id);
        let heartbeatRules = rules.filter(rule => rule.kind === 'heartbeat');

        if (heartbeatRules.length === 0) {
            heartbeatRules = mergeDefaultHeartbeatRules(char, [], settings, now);
            for (const rule of heartbeatRules) {
                await DB.saveCompanionWakeupRule(rule);
            }
            rules = [...rules, ...heartbeatRules];
        }

        const enabledRule = heartbeatRules.find(rule => rule.enabled) || heartbeatRules[0];
        if (!enabledRule) return;
        const mode = resolveCompanionWakeupMode(settings, enabledRule);
        const effectiveRule: CompanionWakeupRule = {
            ...enabledRule,
            enabled: true,
            mode,
            lines: mode === 'direct' ? (enabledRule.lines?.length ? enabledRule.lines : DEFAULT_DIRECT_LINES) : enabledRule.lines,
            updatedAt: now,
        };
        await DB.saveCompanionWakeupRule(effectiveRule);
        if (char.autoReplyEnabled === false) {
            updateCharacter(char.id, { autoReplyEnabled: true });
        }

        const content = pickDirectWakeupLine(effectiveRule, char, userProfile, now);
        const messagePayload: Omit<Message, 'id'> = {
            charId: char.id,
            role: 'assistant',
            type: 'text',
            content,
            timestamp: now,
            metadata: {
                source: 'companion_wakeup',
                wakeupRuleId: effectiveRule.id,
                wakeupKind: effectiveRule.kind,
                wakeupMode: 'probe',
                wakeupProbe: true,
            },
        };
        const messageId = await DB.saveMessage(messagePayload);
        await DB.saveCompanionWakeupLog({
            id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ruleId: effectiveRule.id,
            charId: char.id,
            triggeredAt: now,
            status: 'sent',
            mode: effectiveRule.mode,
            kind: effectiveRule.kind,
            message: content.slice(0, 120),
        });

        setCompanionWakeupActive(true);
        setCompanionWakeupStatus(buildCompanionWakeupStatus(rules.map(rule => rule.id === effectiveRule.id ? effectiveRule : rule), now));
        setMessages(prev => [...prev, { ...messagePayload, id: messageId }].slice(-visibleCountRef.current));
        setTotalMsgCount(prev => prev + 1);
        window.dispatchEvent(new CustomEvent('proactive-message-sent', {
            detail: { charId: char.id, charName: char.name, body: content.slice(0, 120), ruleId: effectiveRule.id },
        }));
        addToast('已试亮一封主动来信', 'success');
    }, [addToast, char, userProfile]);

    // --- Voice TTS for chat messages ---
    interface VoiceData { url: string; originalText: string; spokenText?: string; lang?: string; }
    const [voiceDataMap, setVoiceDataMap] = useState<Record<number, VoiceData>>({});
    const [voiceLoading, setVoiceLoading] = useState<Set<number>>(new Set());
    const [playingMsgId, setPlayingMsgId] = useState<number | null>(null);
    const chatAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevIsTypingRef = useRef(false);

    const handlePlayVoice = (msgId: number) => {
        const data = voiceDataMap[msgId];
        if (!data) {
            // No voice data yet — trigger TTS generation (e.g. placeholder voice bar clicked)
            const msg = messages.find(m => m.id === msgId);
            if (msg) handleManualTts(msg, false);
            return;
        }
        if (!chatAudioRef.current) chatAudioRef.current = new Audio();
        const audio = chatAudioRef.current;
        if (playingMsgId === msgId) {
            audio.pause();
            setPlayingMsgId(null);
            return;
        }
        audio.src = data.url;
        audio.onended = () => setPlayingMsgId(null);
        audio.play().catch(() => {});
        setPlayingMsgId(msgId);
    };

    /** Extract <语音>...</语音> tag content from a message, if present */
    const extractVoiceTag = (content: string): string | null => {
        const match = content.match(/<[语語]音>([\s\S]*?)<\/[语語]音>/);
        return match ? match[1].trim() : null;
    };

    const handleManualTts = async (msg: Message, autoTriggered = false) => {
        if (voiceDataMap[msg.id] || voiceLoading.has(msg.id)) return;

        // Check if message contains a <语音> tag (AI chose to send voice)
        const voiceTagContent = extractVoiceTag(msg.content);

        // Auto-TTS: only generate voice when AI explicitly used <语音> tag
        if (autoTriggered && !voiceTagContent) return;

        setVoiceLoading(prev => new Set(prev).add(msg.id));
        try {
            let spokenText: string;
            let originalText: string;
            const voiceLang = char.chatVoiceLang || '';

            if (voiceTagContent) {
                // AI already provided the spoken text (possibly translated) in <语音> tag
                spokenText = cleanTextForTts(`<语音>${voiceTagContent}</语音>`);
                // originalText = text OUTSIDE the voice tag (the display/Chinese text)
                const textOutsideTag = msg.content.replace(/<[语語]音>[\s\S]*?<\/[语語]音>/g, '').trim();
                originalText = textOutsideTag ? cleanTextForTts(textOutsideTag) : '';
                // If voice lang is set and no Chinese text outside the tag, translate spoken text back to Chinese
                if (voiceLang && !originalText && spokenText) {
                    try {
                        const transRes = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
                            body: JSON.stringify({
                                model: apiConfig.model,
                                messages: [{ role: 'system', content: '把以下内容翻译成中文。只输出翻译结果，不要任何解释。' }, { role: 'user', content: spokenText }],
                                temperature: 0.3,
                            }),
                        });
                        const transData = await transRes.json();
                        const chineseText = transData?.choices?.[0]?.message?.content?.trim();
                        if (chineseText) originalText = chineseText;
                    } catch { /* keep originalText empty */ }
                }
            } else {
                // Manual TTS (long-press): no <语音> tag, use old behavior with translation
                originalText = cleanTextForTts(msg.content);
                if (!originalText || originalText.length < 2) return;
                spokenText = originalText;
                if (voiceLang) {
                    const langLabel = VOICE_LANG_LABELS[voiceLang] || voiceLang;
                    try {
                        const transRes = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
                            body: JSON.stringify({
                                model: apiConfig.model,
                                messages: [{ role: 'system', content: `Translate the following text to ${langLabel}. Output ONLY the translation, nothing else.` }, { role: 'user', content: originalText }],
                                temperature: 0.3,
                            }),
                        });
                        const transData = await transRes.json();
                        const translated = transData?.choices?.[0]?.message?.content?.trim();
                        if (translated) spokenText = translated;
                    } catch { /* use original */ }
                }
            }

            if (!spokenText || spokenText.length < 2) return;

            const blobUrl = await synthesizeSpeech(spokenText, char, apiConfig, {
                languageBoost: voiceLang || undefined,
                groupId: apiConfig.minimaxGroupId || undefined,
            });
            setVoiceDataMap(prev => ({ ...prev, [msg.id]: { url: blobUrl, originalText, spokenText: voiceTagContent ? spokenText : (voiceLang ? spokenText : undefined), lang: voiceLang || undefined } }));
            // Auto-play
            if (!chatAudioRef.current) chatAudioRef.current = new Audio();
            chatAudioRef.current.src = blobUrl;
            chatAudioRef.current.onended = () => setPlayingMsgId(null);
            chatAudioRef.current.play().catch(() => {});
            setPlayingMsgId(msg.id);
        } catch (err: any) {
            addToast(`语音生成失败: ${err?.message || '未知错误'}`, 'error');
        } finally {
            setVoiceLoading(prev => { const next = new Set(prev); next.delete(msg.id); return next; });
        }
    };

    // --- Auto-TTS: when chatVoiceEnabled, auto-generate voice when AI uses <语音> tag ---
    // Scans ALL recent assistant messages (not just the last one) because chunkText
    // may split a single AI response into multiple messages, and the <语音> tag could
    // end up in any chunk — not necessarily the final one.
    useEffect(() => {
        const wasTyping = prevIsTypingRef.current;
        prevIsTypingRef.current = isTyping;
        // Only trigger when AI just finished typing (wasTyping → !isTyping)
        if (!wasTyping || isTyping) return;
        if (!char.chatVoiceEnabled) return;
        const voiceProfile = char.voiceProfile;
        if (!voiceProfile?.voiceId && (!voiceProfile?.timberWeights || voiceProfile.timberWeights.length === 0)) return;
        // Scan recent assistant messages for unprocessed <语音> tags
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            // Stop scanning once we hit a non-assistant message (end of current AI response batch)
            if (msg.role !== 'assistant') break;
            if (msg.type !== 'text') continue;
            if (voiceDataMap[msg.id] || voiceLoading.has(msg.id)) continue;
            handleManualTts(msg, true);
        }
    }, [isTyping]); // eslint-disable-line react-hooks/exhaustive-deps

    const canReroll = !isTyping && messages.length > 0 && messages[messages.length - 1].role === 'assistant';

    // --- Translation: pure frontend toggle (no API calls, bilingual data is already in message content) ---
    const handleTranslateToggle = useCallback((msgId: number) => {
        setShowingTargetIds(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
        });
    }, []);

    const loadEmojiData = async () => {
        await DB.initializeEmojiData();
        const [es, cats] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
        setEmojis(es);
        setCategories(cats);
        if (activeCategory !== 'default' && !cats.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    };

    // How many messages to load per batch (initial load + each "load more" click)
    const LOAD_BATCH_SIZE = 30;

    const reloadMessages = useCallback(async (requestedVisibleCount: number) => {
        if (!activeCharacterId) return;

        const charIdAtStart = activeCharacterId;
        try {
            const allMsgs = await DB.getMessagesByCharId(activeCharacterId);

            // Guard against stale async results: if the user switched characters
            // while the DB query was in flight, discard this result.
            if (activeCharIdRef.current !== charIdAtStart) return;

            // Use ref to always get the CURRENT char (avoids stale closure)
            const currentChar = charRef.current;
            const chatScopeMsgs = dedupeStarterMessages(allMsgs
                .filter(m => m.metadata?.source !== 'date' && m.metadata?.source !== 'call')
                .filter(m => !currentChar?.hideBeforeMessageId || m.id >= currentChar.hideBeforeMessageId)
                .filter(m => !(currentChar?.hideSystemLogs && m.role === 'system' && m.type !== 'score_card')));

            setTotalMsgCount(chatScopeMsgs.length);
            setMessages(chatScopeMsgs.slice(-requestedVisibleCount));
        } catch (e) {
            // DB read failed — retry once after a short delay
            if (activeCharIdRef.current !== charIdAtStart) return;
            await new Promise(r => setTimeout(r, 200));
            if (activeCharIdRef.current !== charIdAtStart) return;
            try {
                const retryMsgs = await DB.getMessagesByCharId(activeCharacterId);
                if (activeCharIdRef.current !== charIdAtStart) return;
                const currentChar = charRef.current;
                const chatScopeMsgs = dedupeStarterMessages(retryMsgs
                    .filter(m => m.metadata?.source !== 'date' && m.metadata?.source !== 'call')
                    .filter(m => !currentChar?.hideBeforeMessageId || m.id >= currentChar.hideBeforeMessageId)
                    .filter(m => !(currentChar?.hideSystemLogs && m.role === 'system' && m.type !== 'score_card')));
                setTotalMsgCount(chatScopeMsgs.length);
                setMessages(chatScopeMsgs.slice(-requestedVisibleCount));
            } catch { /* give up silently */ }
        }
    }, [activeCharacterId]);

    useEffect(() => {
        if (activeCharacterId) {
            // Update ref BEFORE any async work so stale reloadMessages calls
            // from a previous character can detect the switch and bail out.
            activeCharIdRef.current = activeCharacterId;

            // Clear messages immediately to prevent showing stale chat from previous character
            setMessages([]);
            setTotalMsgCount(0);

            reloadMessages(LOAD_BATCH_SIZE);
            loadEmojiData();
            const savedDraft = localStorage.getItem(draftKey);
            setInput(savedDraft || '');
            if (char) {
                setSettingsContextLimit(char.contextLimit || 500);
                setSettingsHideSysLogs(char.hideSystemLogs || false);
                clearUnread(char.id);
            }
            // Per-character translation toggle
            try {
                setTranslationEnabled(JSON.parse(localStorage.getItem(`chat_translate_enabled_${activeCharacterId}`) || 'false'));
            } catch { setTranslationEnabled(false); }
            setVisibleCount(30);
            visibleCountRef.current = 30;
            lastMsgIdRef.current = null;
            scrollThrottleRef.current = 0;
            setLastTokenUsage(null);
            setReplyTarget(null);
            setSelectionMode(false);
            setSelectedMsgIds(new Set());
            setShowingTargetIds(new Set());
        }
    }, [activeCharacterId, reloadMessages]);

    // Load all messages when history-manager modal opens
    useEffect(() => {
        if (modalType === 'history-manager' && activeCharacterId) {
            DB.getMessagesByCharId(activeCharacterId).then(allMsgs => {
                const filtered = allMsgs
                    .filter(m => m.metadata?.source !== 'date' && m.metadata?.source !== 'call')
                    .filter(m => !(char?.hideSystemLogs && m.role === 'system' && m.type !== 'score_card'));
                setAllHistoryMessages(filtered);
            });
        }
    }, [modalType, activeCharacterId, char?.hideSystemLogs]);

    useEffect(() => {
        const savedPrompts = localStorage.getItem('chat_archive_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
                setArchivePrompts(merged);
            } catch(e) {}
        }
        const savedId = localStorage.getItem('chat_active_archive_prompt_id');
        if (savedId && archivePrompts.some(p => p.id === savedId)) setSelectedPromptId(savedId);
    }, []);

    useEffect(() => {
        if (activeCharacterId && lastMsgTimestamp > 0) {
            reloadMessages(visibleCountRef.current);
            clearUnread(activeCharacterId);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearUnread is stable (useCallback with []), omit to prevent stale-dep lint noise
    }, [lastMsgTimestamp, activeCharacterId, reloadMessages, clearUnread]);

    useEffect(() => {
        visibleCountRef.current = visibleCount;
    }, [visibleCount]);

    // Reload char data when background emotion evaluation updates buffs
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.charId === activeCharacterId) {
                // Reload all characters to pick up updated activeBuffs / buffInjection
                DB.getAllCharacters().then(all => {
                    const updated = all.find(c => c.id === activeCharacterId);
                    if (updated) updateCharacter(updated.id, {
                        activeBuffs: updated.activeBuffs,
                        buffInjection: updated.buffInjection
                    });
                }).catch(() => {});
            }
        };
        window.addEventListener('emotion-updated', handler);
        return () => window.removeEventListener('emotion-updated', handler);
    }, [activeCharacterId, updateCharacter]);

    const handleInputChange = (val: string) => {
        setInput(val);
        if (val.trim()) localStorage.setItem(draftKey, val);
        else localStorage.removeItem(draftKey);
    };

    useLayoutEffect(() => {
        if (!scrollRef.current || selectionMode) return;
        const currentLastId = messages.length > 0 ? messages[messages.length - 1].id : null;
        // Only auto-scroll when a new message is appended (ID changes),
        // not when loading older history or updating existing messages in-place
        if (currentLastId !== lastMsgIdRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            lastMsgIdRef.current = currentLastId;
        }
    }, [messages, activeCharacterId, selectionMode]);

    useEffect(() => {
        if (isTyping && scrollRef.current && !selectionMode) {
            const now = Date.now();
            if (now - scrollThrottleRef.current > 150) {
                scrollThrottleRef.current = now;
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [messages, isTyping, recallStatus, selectionMode]);

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    // --- Actions ---

    const handleSendText = async (customContent?: string, customType?: MessageType, metadata?: any) => {
        if (!char || (!input.trim() && !customContent)) return;
        const text = customContent || input.trim();
        const type = customType || 'text';

        if (!customContent) { setInput(''); localStorage.removeItem(draftKey); }
        
        if (type === 'image') {
            const recentChat = messages.slice(-10).map(m => {
                const sender = m.role === 'user' ? userProfile.name : char.name;
                return `${sender}: ${m.content.substring(0, 100)}`;
            });
            await DB.saveGalleryImage({
                id: `img-${Date.now()}-${Math.random()}`,
                charId: char.id,
                url: text,
                timestamp: Date.now(),
                source: 'chat',
                savedDate: new Date().toISOString().split('T')[0],
                chatContext: recentChat
            });
            addToast('图片已保存至相册', 'info');
        }

        const msgPayload: any = { charId: char.id, role: 'user', type, content: text, metadata };
        
        if (replyTarget) {
            msgPayload.replyTo = {
                id: replyTarget.id,
                content: replyTarget.content,
                name: replyTarget.role === 'user' ? '我' : char.name
            };
            setReplyTarget(null);
        }

        await DB.saveMessage(msgPayload);

        await reloadMessages(visibleCountRef.current);
        setShowPanel('none');

        if (apiConfig.baseUrl && !isTyping && (autoReplyEnabled || companionWakeupActive)) {
            const updatedMessages = await DB.getRecentMessagesByCharId(char.id, visibleCountRef.current);
            void triggerAI(updatedMessages);
        }
    };

    const handleReroll = async () => {
        if (isTyping || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant') return;

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

        triggerAI(newHistory);
    };

    const handleImageSelect = async (file: File) => {
        try {
            const base64 = await processImage(file, { maxWidth: 600, quality: 0.6, forceJpeg: true });
            setShowPanel('none');
            await handleSendText(base64, 'image');
        } catch (err: any) {
            addToast(err.message || '图片处理失败', 'error');
        }
    };

    const handlePanelAction = (type: string, payload?: any) => {
        switch (type) {
            case 'transfer': setModalType('transfer'); break;
            case 'poke': handleSendText('[戳一戳]', 'interaction'); break;
            case 'archive': setModalType('archive-settings'); break;
            case 'settings': setModalType('chat-settings'); break;
            case 'emoji-import': setModalType('emoji-import'); break;
            case 'send-emoji': if (payload) handleSendText(payload.url, 'emoji'); break;
            case 'delete-emoji-req': {
                const category = categories.find(c => c.id === payload?.categoryId);
                if (payload?.source === 'public' || category?.source === 'public') {
                    addToast('内置表情包由服务器清单维护，不能在本地单独删除', 'info');
                    break;
                }
                setSelectedEmoji(payload);
                setModalType('delete-emoji');
                break;
            }
            case 'add-category': setModalType('add-category'); break;
            case 'select-category': setActiveCategory(payload); break;
            case 'category-options': setSelectedCategory(payload); setModalType('category-options'); break;
            case 'delete-category-req': setSelectedCategory(payload); setModalType('delete-category'); break;
            case 'emoji-pack-manager': setModalType('emoji-pack-manager'); break;
            case 'proactive':
                void handleToggleCompanionWakeup();
                break;
            case 'emotion': setShowEmotionModal(true); break;
        }
    };

    // --- Modal Handlers ---

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
             addToast('请输入分类名称', 'error');
             return;
        }
        const newCat = { id: `cat-${Date.now()}`, name: newCategoryName.trim() };
        await DB.saveEmojiCategory(newCat);
        await loadEmojiData();
        setActiveCategory(newCat.id);
        setModalType('none');
        setNewCategoryName('');
        addToast('分类创建成功', 'success');
    };

    const handleImportEmoji = async () => {
        if (!emojiImportText.trim()) return;
        const lines = emojiImportText.split('\n');
        const targetCatId = activeCategory === 'default' ? undefined : activeCategory;
        const targetCategory = categories.find(c => c.id === targetCatId);

        if (targetCategory?.source === 'public') {
            addToast('内置表情包请通过服务器 catalog 更新；本地导入可以先新建普通分类', 'error');
            return;
        }

        for (const line of lines) {
            const parts = line.split('--');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const url = parts.slice(1).join('--').trim();
                if (name && url) {
                    await DB.saveEmoji(name, url, targetCatId);
                }
            }
        }
        await loadEmojiData();
        setModalType('none');
        setEmojiImportText('');
        addToast('表情包导入成功', 'success');
    };

    const handleDeleteCategory = async () => {
        if (!selectedCategory) return;
        await DB.deleteEmojiCategory(selectedCategory.id);
        await loadEmojiData();
        setActiveCategory('default');
        setModalType('none');
        setSelectedCategory(null);
        addToast('分类及包含表情已删除', 'success');
    };

    const handleSaveCategoryVisibility = async (categoryId: string, allowedCharacterIds: string[] | undefined, visibilityMode?: EmojiCategory['visibilityMode']) => {
        const cat = categories.find(c => c.id === categoryId);
        if (!cat) return;
        const nextCategory: EmojiCategory = {
            ...cat,
            visibilityMode: visibilityMode || (allowedCharacterIds && allowedCharacterIds.length > 0 ? 'allowlist' : 'all'),
        };
        if (nextCategory.visibilityMode === 'allowlist') {
            nextCategory.allowedCharacterIds = allowedCharacterIds || [];
        } else {
            delete nextCategory.allowedCharacterIds;
        }
        await DB.saveEmojiCategory(nextCategory);
        await loadEmojiData();
        setSelectedCategory(null);
        addToast(nextCategory.visibilityMode === 'allowlist' ? `已设置 ${nextCategory.allowedCharacterIds?.length || 0} 个角色可见` : '已设为所有角色可见', 'success');
    };

    const handleTogglePublicEmojiCategory = async (categoryId: string, enabled: boolean) => {
        const cat = categories.find(c => c.id === categoryId);
        if (!cat || !activeCharacterId) return;

        const allowedIds = new Set(cat.visibilityMode === 'all' ? characters.map(c => c.id) : (cat.allowedCharacterIds || []));
        if (enabled) allowedIds.add(activeCharacterId);
        else allowedIds.delete(activeCharacterId);

        await DB.saveEmojiCategory({
            ...cat,
            visibilityMode: 'allowlist',
            allowedCharacterIds: Array.from(allowedIds),
        });
        await loadEmojiData();
        addToast(enabled ? `已为 ${char?.name || '当前角色'} 启用 ${cat.name}` : `已为 ${char?.name || '当前角色'} 关闭 ${cat.name}`, 'success');
    };

    const handleSavePrompt = () => {
        if (!editingPrompt || !editingPrompt.name.trim() || !editingPrompt.content.trim()) {
            addToast('请填写完整', 'error');
            return;
        }
        setArchivePrompts(prev => {
            let next;
            if (prev.some(p => p.id === editingPrompt.id)) {
                next = prev.map(p => p.id === editingPrompt.id ? editingPrompt : p);
            } else {
                next = [...prev, editingPrompt];
            }
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        setSelectedPromptId(editingPrompt.id);
        setModalType('archive-settings');
        setEditingPrompt(null);
    };

    const handleDeletePrompt = (id: string) => {
        if (id.startsWith('preset_')) {
            addToast('默认预设不可删除', 'error');
            return;
        }
        setArchivePrompts(prev => {
            const next = prev.filter(p => p.id !== id);
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        if (selectedPromptId === id) setSelectedPromptId('preset_rational');
        addToast('预设已删除', 'success');
    };

    const createNewPrompt = () => {
        setEditingPrompt({ id: `custom_${Date.now()}`, name: '新预设', content: DEFAULT_ARCHIVE_PROMPTS[0].content });
        setModalType('prompt-editor');
    };

    const editSelectedPrompt = () => {
        const p = archivePrompts.find(a => a.id === selectedPromptId);
        if (!p) return;
        if (p.id.startsWith('preset_')) {
            setEditingPrompt({ id: `custom_${Date.now()}`, name: `${p.name} (Copy)`, content: p.content });
        } else {
            setEditingPrompt({ ...p });
        }
        setModalType('prompt-editor');
    };

    const handleBgUpload = async (file: File) => {
        try {
            const dataUrl = await processImage(file, { skipCompression: true });
            updateCharacter(char.id, { chatBackground: dataUrl });
            addToast('聊天背景已更新', 'success');
        } catch(err: any) {
            addToast(err.message, 'error');
        }
    };

    const saveSettings = () => {
        updateCharacter(char.id, { 
            contextLimit: settingsContextLimit,
            hideSystemLogs: settingsHideSysLogs
        });
        setModalType('none');
        addToast('设置已保存', 'success');
    };

    const handleClearHistory = async () => {
        if (!char) return;
        if (preserveContext) {
            const allMessages = await DB.getMessagesByCharId(char.id);
            const toKeep = allMessages.slice(-10);
            const toKeepIds = new Set(toKeep.map(m => m.id));
            const toDelete = allMessages.filter(m => !toKeepIds.has(m.id));
            if (toDelete.length === 0) {
                addToast('消息太少，无需清理', 'info');
                return;
            }
            await DB.deleteMessages(toDelete.map(m => m.id));
            setMessages(toKeep);
            setTotalMsgCount(toKeep.length);
            setVisibleCount(LOAD_BATCH_SIZE);
            visibleCountRef.current = LOAD_BATCH_SIZE;
            addToast(`已清理 ${toDelete.length} 条历史，保留最近10条`, 'success');
        } else {
            await DB.clearMessages(char.id);
            setMessages([]);
            setTotalMsgCount(0);
            setVisibleCount(LOAD_BATCH_SIZE);
            visibleCountRef.current = LOAD_BATCH_SIZE;
            addToast('已清空', 'success');
        }
        setModalType('none');
    };

    const handleSetHistoryStart = (messageId: number | undefined) => {
        updateCharacter(char.id, { hideBeforeMessageId: messageId });
        setModalType('none');
        addToast(messageId ? '已隐藏历史消息' : '已恢复全部历史记录', 'success');
    };

    const handleFullArchive = async () => {
        if (!apiConfig.apiKey || !char) {
            addToast('请先配置 API Key', 'error');
            return;
        }
        const allMessages = await DB.getMessagesByCharId(char.id);
        const msgsByDate: Record<string, Message[]> = {};
        allMessages
        .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .forEach(m => {
            const d = new Date(m.timestamp);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
            msgsByDate[dateStr].push(m);
        });

        const datesToProcess = Object.keys(msgsByDate).sort();
        if (datesToProcess.length === 0) {
            addToast('聊天记录为空，无法归档', 'info');
            return;
        }

        setIsSummarizing(true);
        setShowPanel('none');
        setModalType('none');
        
        try {
            let processedCount = 0;
            const newMemories: MemoryFragment[] = [];
            const templateObj = archivePrompts.find(p => p.id === selectedPromptId) || DEFAULT_ARCHIVE_PROMPTS[0];
            const template = templateObj.content;

            for (const dateStr of datesToProcess) {
                const dayMsgs = msgsByDate[dateStr];
                const rawLog = dayMsgs.map(m => {
                    const sender = m.role === 'user' ? userProfile.name : (m.role === 'system' ? '[系统]' : char.name);
                    let content = m.content;
                    if (m.type === 'image') content = '[Image]';
                    else if (m.type === 'emoji') content = `[表情包]`;
                    else if ((m.type as string) === 'score_card') {
                        try {
                            const card = m.metadata?.scoreCard || JSON.parse(m.content);
                            if (card?.type === 'lifesim_reset_card') {
                                content = formatLifeSimResetCardForContext(card, char.name);
                            } else if (card?.type === 'guidebook_card') {
                                const diff = (card.finalAffinity ?? 0) - (card.initialAffinity ?? 0);
                                content = `[攻略本游戏结算] ${char.name}和${userProfile.name}玩了一局"攻略本"恋爱小游戏（${card.rounds || '?'}回合）。结局：「${card.title || '???'}」 好感度变化：${card.initialAffinity} → ${card.finalAffinity}（${diff >= 0 ? '+' : ''}${diff}） ${char.name}的评语：${card.charVerdict || '无'} ${char.name}对${userProfile.name}的新发现：${card.charNewInsight || '无'}`;
                            } else if (card?.type === 'whiteday_card') {
                                const passedStr = card.passed ? `通过测验，解锁了DIY巧克力` : `未通过测验`;
                                const questionsText = (card.questions as any[])?.map((q: any, i: number) =>
                                    `第${i + 1}题"${q.question}"：${userProfile.name}选"${q.userAnswer}"（${q.isCorrect ? '✓' : '✗'}）${q.review ? `，${char.name}评语：${q.review}` : ''}`
                                ).join('；') || '';
                                content = `[白色情人节默契测验] ${userProfile.name}完成了${char.name}出的白色情人节测验，答对${card.score}/${card.total}题，${passedStr}。${questionsText}${card.finalDialogue ? `。${char.name}最终评价：${card.finalDialogue}` : ''}`;
                            } else {
                                content = '[系统卡片]';
                            }
                        } catch { content = '[系统卡片]'; }
                    }
                    else if (m.type === 'interaction') content = `[系统: ${userProfile.name}戳了${char.name}一下]`;
                    else if (m.type === 'transfer') content = `[系统: ${userProfile.name}转账 ${m.metadata?.amount}]`;
                    return `[${formatTime(m.timestamp)}] ${sender}: ${content}`;
                }).join('\n');
                
                let prompt = template;
                prompt = prompt.replace(/\$\{dateStr\}/g, dateStr);
                prompt = prompt.replace(/\$\{char\.name\}/g, char.name);
                prompt = prompt.replace(/\$\{userProfile\.name\}/g, userProfile.name);
                prompt = prompt.replace(/\$\{rawLog.*?\}/g, rawLog.substring(0, 200000));

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.5,
                        max_tokens: 8000 
                    })
                });

                if (!response.ok) throw new Error(`API Error on ${dateStr}`);
                const data = await safeResponseJson(response);
                let summary = data.choices?.[0]?.message?.content || '';
                summary = summary.trim().replace(/^["']|["']$/g, ''); 

                if (summary) {
                    newMemories.push({ id: `mem-${Date.now()}`, date: dateStr, summary: summary, mood: 'archive' });
                    processedCount++;
                }
                await new Promise(r => setTimeout(r, 500));
            }

            const finalMemories = [...(char.memories || []), ...newMemories];
            updateCharacter(char.id, { memories: finalMemories });
            addToast(`成功归档 ${processedCount} 天`, 'success');

        } catch (e: any) {
            addToast(`归档中断: ${e.message}`, 'error');
        } finally {
            setIsSummarizing(false);
        }
    };

    // --- Message Management ---
    const handleDeleteMessage = async () => {
        if (!selectedMessage) return;
        await DB.deleteMessage(selectedMessage.id);
        setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
        setTotalMsgCount(prev => Math.max(0, prev - 1));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已删除', 'success');
    };

    const confirmEditMessage = async () => {
        if (!selectedMessage) return;
        await DB.updateMessage(selectedMessage.id, editContent);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, content: editContent } : m));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已修改', 'success');
    };

    const handleReplyMessage = () => {
        if (!selectedMessage) return;
        setReplyTarget({
            ...selectedMessage,
            metadata: { ...selectedMessage.metadata, senderName: selectedMessage.role === 'user' ? '我' : char.name }
        });
        setModalType('none');
    };

    const handleCopyMessage = () => {
        if (!selectedMessage) return;
        navigator.clipboard.writeText(selectedMessage.content);
        setModalType('none');
        setSelectedMessage(null);
        addToast('已复制到剪贴板', 'success');
    };

    const handleDeleteEmoji = async () => {
        if (!selectedEmoji) return;
        await DB.deleteEmoji(selectedEmoji.name);
        await loadEmojiData();
        setModalType('none');
        setSelectedEmoji(null);
        addToast('表情包已删除', 'success');
    };

    // --- Batch Selection ---
    const handleEnterSelectionMode = () => {
        if (selectedMessage) {
            setSelectedMsgIds(new Set([selectedMessage.id]));
            setSelectionMode(true);
            setModalType('none');
            setSelectedMessage(null);
        }
    };

    const toggleMessageSelection = useCallback((id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Memoized callbacks for MessageItem to avoid busting React.memo
    const handleMessageLongPress = useCallback((msg: Message) => {
        setSelectedMessage(msg);
        setModalType('message-options');
    }, []);

    const handleBatchDelete = async () => {
        if (selectedMsgIds.size === 0) return;
        const deleteCount = selectedMsgIds.size;
        await DB.deleteMessages(Array.from(selectedMsgIds));
        setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
        setTotalMsgCount(prev => Math.max(0, prev - deleteCount));
        addToast(`已删除 ${deleteCount} 条消息`, 'success');
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    // --- Forward Chat Records ---
    const [showForwardModal, setShowForwardModal] = useState(false);

    const handleForwardSelected = () => {
        if (selectedMsgIds.size === 0) return;
        setShowForwardModal(true);
    };

    const handleForwardToCharacter = async (targetCharId: string) => {
        if (!char) return;
        const selectedMsgs = messages
            .filter(m => selectedMsgIds.has(m.id))
            .sort((a, b) => a.id - b.id);

        if (selectedMsgs.length === 0) return;

        // Build preview text (first few messages)
        const previewLines = selectedMsgs.slice(0, 4).map(m => {
            const sender = m.role === 'user' ? userProfile.name : char.name;
            const text = m.type === 'text' ? m.content.slice(0, 30) : `[${m.type === 'image' ? '图片' : m.type === 'emoji' ? '表情' : m.type}]`;
            return `${sender}: ${text}`;
        });
        if (selectedMsgs.length > 4) previewLines.push(`... 共 ${selectedMsgs.length} 条消息`);

        const forwardData = {
            fromUserName: userProfile.name,
            fromCharName: char.name,
            count: selectedMsgs.length,
            preview: previewLines,
            messages: selectedMsgs.map(m => ({
                role: m.role,
                type: m.type,
                content: m.content,
                timestamp: m.timestamp || Date.now()
            }))
        };

        // Save forward card to target character's chat
        await DB.saveMessage({
            charId: targetCharId,
            role: 'user',
            type: 'chat_forward' as MessageType,
            content: JSON.stringify(forwardData),
        });

        // Also save a copy in the current chat so the user can see what they forwarded
        const targetChar = characters.find(c => c.id === targetCharId);
        if (char.id !== targetCharId) {
            await DB.saveMessage({
                charId: char.id,
                role: 'system',
                type: 'text' as MessageType,
                content: `[转发了 ${selectedMsgs.length} 条聊天记录给 ${targetChar?.name || ''}]`,
            });
            // Refresh messages to show the forwarding system message
            reloadMessages(visibleCountRef.current);
        }

        addToast(`已转发 ${selectedMsgs.length} 条记录给 ${targetChar?.name || ''}`, 'success');
        setShowForwardModal(false);
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    const displayMessages = useMemo(() => dedupeStarterMessages(messages
        .filter(m => m.metadata?.source !== 'date' && m.metadata?.source !== 'call')
        .filter(m => !m.metadata?.proactiveHint) // Hide proactive system hints
        .filter(m => !char?.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .filter(m => { if (char?.hideSystemLogs && m.role === 'system' && m.type !== 'score_card') return false; return true; })
        ).slice(-visibleCount),
        [messages, char?.id, char?.hideBeforeMessageId, char?.hideSystemLogs, visibleCount]);

    const collapsedCount = Math.max(0, totalMsgCount - displayMessages.length);

    // Reset active category if it becomes invisible for the current character
    useEffect(() => {
        if (activeCategory !== 'default' && !visibleCategories.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    }, [visibleCategories, activeCategory]);

    // Memoize filtered emojis for ChatInputArea
    const filteredEmojis = useMemo(() => emojis.filter(e => {
        // Exclude emojis from hidden categories
        if (e.categoryId && hiddenCategoryIds.has(e.categoryId)) return false;
        if (activeCategory === 'default') return !e.categoryId || e.categoryId === 'default';
        return e.categoryId === activeCategory;
    }), [emojis, activeCategory, hiddenCategoryIds]);

    // Memoize ChatInputArea callbacks
    const handleSendCallback = useCallback(() => handleSendText(), [char, input, replyTarget]);
    const handleCharSelectCallback = useCallback((id: string) => { setActiveCharacterId(id); setShowPanel('none'); }, []);
    const chatChromeStyle = osTheme.chatChromeStyle || 'soft';
    const chatBackgroundStyle = osTheme.chatBackgroundStyle || 'plain';
    const chatBackgroundImage = char.chatBackground || (osTheme.chatBackgroundImage ?? DEFAULT_CHAT_BACKGROUND_IMAGE);
    const chatImageBackgroundColor = chatBackgroundImage === DEFAULT_CHAT_BACKGROUND_IMAGE ? '#e7e5e4' : '#eef0f3';
    const isDeepSpaceAppearance = appearancePresetId === DEEP_SPACE_APPEARANCE_PRESET_ID;
    const chatRootClass =
        chatChromeStyle === 'pixel'
            ? 'flex flex-col h-full bg-[#efe1cf] overflow-hidden relative font-sans transition-[background-image,background-color] duration-500'
            : chatChromeStyle === 'flat'
              ? 'flex flex-col h-full bg-white overflow-hidden relative font-sans transition-[background-image,background-color] duration-500'
              : chatChromeStyle === 'floating'
                ? 'flex flex-col h-full bg-[#eef2ff] overflow-hidden relative font-sans transition-[background-image,background-color] duration-500'
                : 'flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative font-sans transition-[background-image,background-color] duration-500';
    const chatRootStyle: React.CSSProperties = chatBackgroundImage
        ? {
            backgroundColor: chatImageBackgroundColor,
            backgroundImage: `linear-gradient(rgba(245,245,245,0.10), rgba(245,245,245,0.10)), url(${chatBackgroundImage})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
          }
        : chatBackgroundStyle === 'grid'
          ? {
              backgroundColor: chatChromeStyle === 'pixel' ? '#efe1cf' : '#f8fafc',
              backgroundImage:
                  'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }
          : chatBackgroundStyle === 'paper'
            ? {
                backgroundColor: chatChromeStyle === 'pixel' ? '#f4e8d9' : '#f9f7f2',
                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)',
                backgroundSize: '16px 16px',
              }
            : chatBackgroundStyle === 'mesh'
              ? {
                  backgroundColor: '#f8fafc',
                  backgroundImage:
                      'radial-gradient(circle at 15% 20%, rgba(59,130,246,0.18), transparent 28%), radial-gradient(circle at 85% 15%, rgba(244,114,182,0.18), transparent 24%), radial-gradient(circle at 60% 75%, rgba(45,212,191,0.18), transparent 26%)',
                }
              : {
                  backgroundImage: 'none',
                };
    const chatScrollStyle: React.CSSProperties | undefined = chatBackgroundImage
        ? {
            backgroundColor: 'transparent',
            backgroundImage: 'none',
        }
        : (activeTheme.type === 'custom' && activeTheme.user.backgroundImage)
            ? { backgroundImage: 'none' }
            : undefined;

    return (
        <div 
            className={chatRootClass}
            style={chatRootStyle}
        >
             {activeTheme.customCss && <style>{activeTheme.customCss}</style>}

             <ChatModals 
                modalType={modalType} setModalType={setModalType}
                transferAmt={transferAmt} setTransferAmt={setTransferAmt}
                emojiImportText={emojiImportText} setEmojiImportText={setEmojiImportText}
                settingsContextLimit={settingsContextLimit} setSettingsContextLimit={setSettingsContextLimit}
                settingsHideSysLogs={settingsHideSysLogs} setSettingsHideSysLogs={setSettingsHideSysLogs}
                preserveContext={preserveContext} setPreserveContext={setPreserveContext}
                editContent={editContent} setEditContent={setEditContent}
                archivePrompts={archivePrompts} selectedPromptId={selectedPromptId} setSelectedPromptId={setSelectedPromptId}
                editingPrompt={editingPrompt} setEditingPrompt={setEditingPrompt} isSummarizing={isSummarizing}
                selectedMessage={selectedMessage} selectedEmoji={selectedEmoji} activeCharacter={char} messages={messages}
                allHistoryMessages={allHistoryMessages}
                
                newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onAddCategory={handleAddCategory}
                selectedCategory={selectedCategory}

                onTransfer={() => { if(transferAmt) handleSendText(`[转账]`, 'transfer', { amount: transferAmt }); setModalType('none'); }}
                onImportEmoji={handleImportEmoji}
                onSaveSettings={saveSettings} onBgUpload={handleBgUpload} onRemoveBg={() => updateCharacter(char.id, { chatBackground: undefined })}
                onClearHistory={handleClearHistory} onArchive={handleFullArchive}
                onCreatePrompt={createNewPrompt} onEditPrompt={editSelectedPrompt} onSavePrompt={handleSavePrompt} onDeletePrompt={handleDeletePrompt}
                onSetHistoryStart={handleSetHistoryStart} onEnterSelectionMode={handleEnterSelectionMode}
                onReplyMessage={handleReplyMessage} onEditMessageStart={() => { if (selectedMessage) { setEditContent(selectedMessage.content); setModalType('edit-message'); } }}
                onConfirmEditMessage={confirmEditMessage} onDeleteMessage={handleDeleteMessage} onCopyMessage={handleCopyMessage} onDeleteEmoji={handleDeleteEmoji} onDeleteCategory={handleDeleteCategory}
                allCharacters={characters} onSaveCategoryVisibility={handleSaveCategoryVisibility}
                emojiCategories={categories}
                onTogglePublicEmojiCategory={handleTogglePublicEmojiCategory}
                translationEnabled={translationEnabled}
                onToggleTranslation={() => { const next = !translationEnabled; setTranslationEnabled(next); localStorage.setItem(`chat_translate_enabled_${activeCharacterId}`, JSON.stringify(next)); if (!next) { setShowingTargetIds(new Set()); } }}
                translateSourceLang={translateSourceLang}
                translateTargetLang={translateTargetLang}
                onSetTranslateSourceLang={(lang: string) => { setTranslateSourceLang(lang); localStorage.setItem('chat_translate_source_lang', lang); setShowingTargetIds(new Set()); }}
                onSetTranslateLang={(lang: string) => { setTranslateTargetLang(lang); localStorage.setItem('chat_translate_lang', lang); setShowingTargetIds(new Set()); }}
                chatVoiceEnabled={!!char.chatVoiceEnabled}
                onToggleChatVoice={() => updateCharacter(char.id, { chatVoiceEnabled: !char.chatVoiceEnabled })}
                chatVoiceLang={char.chatVoiceLang || ''}
                onSetChatVoiceLang={(lang: string) => updateCharacter(char.id, { chatVoiceLang: lang })}
                voiceAvailable={!!(char.voiceProfile?.voiceId || char.voiceProfile?.timberWeights?.length)}
                onGenerateVoice={selectedMessage ? () => handleManualTts(selectedMessage) : undefined}
             />
             
             <ChatHeader
                selectionMode={selectionMode}
                selectedCount={selectedMsgIds.size}
                onCancelSelection={() => { setSelectionMode(false); setSelectedMsgIds(new Set()); }}
                activeCharacter={char}
                isTyping={isTyping}
                isSummarizing={isSummarizing}
                isEmotionEvaluating={emotionStatus === 'evaluating'}
                lastTokenUsage={lastTokenUsage}
                tokenBreakdown={tokenBreakdown}
                onClose={closeApp}
                onTriggerAI={() => triggerAI(messages)}
                onOpenReplyControls={() => setShowReplyModeModal(true)}
                onShowCharsPanel={() => setShowPanel('chars')}
                onDeleteBuff={(buffId) => {
                    const currentBuffs = char.activeBuffs || [];
                    const newBuffs = currentBuffs.filter(b => b.id !== buffId);
                    const newInjection = newBuffs.length === 0 ? '' : (char.buffInjection || '');
                    updateCharacter(char.id, { activeBuffs: newBuffs, buffInjection: newInjection });
                    addToast('已删除该情绪状态', 'info');
                }}
                headerStyle={osTheme.chatHeaderStyle}
                avatarShape={osTheme.chatAvatarShape}
                headerAlign={osTheme.chatHeaderAlign}
                headerDensity={osTheme.chatHeaderDensity}
                statusStyle={osTheme.chatStatusStyle}
                chromeStyle={osTheme.chatChromeStyle}
                useHeaderBackgroundImage={isDeepSpaceAppearance}
                isAutoReplyEnabled={autoReplyEnabled}
                isProactiveActive={replySignalActive}
             />

            <div
                ref={scrollRef}
                className="relative flex-1 overflow-y-auto overflow-x-hidden pt-8 pb-3 no-scrollbar"
                style={chatScrollStyle}
            >
                <div className="pointer-events-none sticky top-0 z-0 h-0" />
                {collapsedCount > 0 && (
                    <div className="relative z-10 flex justify-center mb-6">
                        <button onClick={async () => {
                            const nextVisibleCount = visibleCount + LOAD_BATCH_SIZE;
                            visibleCountRef.current = nextVisibleCount;
                            setVisibleCount(nextVisibleCount);
                            await reloadMessages(nextVisibleCount);
                        }} className="px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full text-xs text-slate-500 shadow-sm border border-white hover:bg-white transition-colors">加载历史消息 ({collapsedCount})</button>
                    </div>
                )}

                <div className="relative z-10">
                {displayMessages.map((m, i) => {
                    const prevMessage = i > 0 ? displayMessages[i - 1] : null;
                    const nextMessage = i < displayMessages.length - 1 ? displayMessages[i + 1] : null;
                    const messageGroupGapMs = 30 * 60 * 1000;
                    const breaksWithPrevious =
                        !prevMessage ||
                        prevMessage.role !== m.role ||
                        Math.abs(m.timestamp - prevMessage.timestamp) > messageGroupGapMs;
                    const breaksWithNext =
                        !nextMessage ||
                        nextMessage.role !== m.role ||
                        Math.abs(nextMessage.timestamp - m.timestamp) > messageGroupGapMs;
                    return (
                        <MessageItem
                            key={m.id || i}
                            msg={m}
                            isFirstInGroup={breaksWithPrevious}
                            isLastInGroup={breaksWithNext}
                            activeTheme={activeTheme}
                            charAvatar={char.avatar}
                            charName={char.name}
                            userAvatar={userProfile.avatar}
                            onLongPress={handleMessageLongPress}
                            selectionMode={selectionMode}
                            isSelected={selectedMsgIds.has(m.id)}
                            onToggleSelect={toggleMessageSelection}
                            translationEnabled={translationEnabled && m.type === 'text' && m.role === 'assistant'}
                            isShowingTarget={showingTargetIds.has(m.id)}
                            onTranslateToggle={handleTranslateToggle}
                            voiceData={voiceDataMap[m.id]}
                            voiceLoading={voiceLoading.has(m.id)}
                            isVoicePlaying={playingMsgId === m.id}
                            onPlayVoice={() => handlePlayVoice(m.id)}
                            avatarShape={osTheme.chatAvatarShape}
                            avatarSize={osTheme.chatAvatarSize}
                            avatarMode={osTheme.chatAvatarMode}
                            bubbleVariant={osTheme.chatBubbleStyle}
                            messageSpacing={osTheme.chatMessageSpacing}
                            showTimestamp={osTheme.chatShowTimestamp}
                        />
                    );
                })}
                </div>
                
                {(isTyping || recallStatus) && !selectionMode && (
                    <div className="relative z-10 flex items-end gap-3 px-3 mb-6 animate-fade-in">
                        <img src={char.avatar} className={`${osTheme.chatAvatarSize === 'small' ? 'w-7 h-7' : osTheme.chatAvatarSize === 'large' ? 'w-12 h-12' : 'w-9 h-9'} ${osTheme.chatAvatarShape === 'square' ? 'rounded-sm' : osTheme.chatAvatarShape === 'rounded' ? 'rounded-xl' : 'rounded-full'} object-cover`} />
                        <div className="bg-white px-4 py-3 rounded-2xl shadow-sm">
                            {recallStatus ? (
                                <div className="flex items-center gap-2 text-xs text-indigo-500 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    {recallStatus}
                                </div>
                            ) : (
                                <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div></div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative z-40">
                {replyTarget && (
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <div className="flex items-center gap-2 truncate"><span className="font-bold text-slate-700">正在回复:</span><span className="truncate max-w-[200px]">{replyTarget.content.length > 10 ? replyTarget.content.slice(0, 10) + '...' : replyTarget.content}</span></div>
                        <button onClick={() => setReplyTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">×</button>
                    </div>
                )}
                
                <ChatInputArea
                    input={input} setInput={handleInputChange}
                    isTyping={isTyping} selectionMode={selectionMode}
                    showPanel={showPanel} setShowPanel={setShowPanel}
                    onSend={handleSendCallback}
                    onDeleteSelected={handleBatchDelete}
                    onForwardSelected={handleForwardSelected}
                    selectedCount={selectedMsgIds.size}
                    emojis={filteredEmojis}
                    characters={characters} activeCharacterId={activeCharacterId}
                    onCharSelect={handleCharSelectCallback}
                    onPanelAction={handlePanelAction}
                    onImageSelect={handleImageSelect}
                    isSummarizing={isSummarizing}
                    categories={visibleCategories}
                    activeCategory={activeCategory}
                    onReroll={handleReroll}
                    canReroll={canReroll}
                    isProactiveActive={replySignalActive}
                    isEmotionEnabled={!!char.emotionConfig?.enabled}
                    inputStyle={osTheme.chatInputStyle}
                    sendButtonStyle={osTheme.chatSendButtonStyle}
                    chromeStyle={osTheme.chatChromeStyle}
                />
            </div>


            {/* Reply Mode Modal */}
            {char && (
                <Modal isOpen={showReplyModeModal} title="回复方式" onClose={() => setShowReplyModeModal(false)}>
                    <div className="space-y-3">
                        <button
                            onClick={() => {
                                updateCharacter(char.id, { autoReplyEnabled: false });
                                setShowReplyModeModal(false);
                                addToast('已切换为手动接话', 'info');
                            }}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${!autoReplyEnabled ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="font-bold">手动接话</div>
                                {!autoReplyEnabled && <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">当前</span>}
                            </div>
                            <div className={`mt-1 text-xs leading-relaxed ${!autoReplyEnabled ? 'text-indigo-500' : 'text-slate-400'}`}>只在点右上角闪电时生成回复。</div>
                        </button>

                        <button
                            onClick={() => {
                                updateCharacter(char.id, { autoReplyEnabled: true });
                                setShowReplyModeModal(false);
                                addToast('已开启自动回复', 'success');
                            }}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${autoReplyEnabled ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="font-bold">自动回复</div>
                                {autoReplyEnabled && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">当前</span>}
                            </div>
                            <div className={`mt-1 text-xs leading-relaxed ${autoReplyEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>你发送消息后自动思考并回复。</div>
                        </button>

                        <button
                            onClick={() => {
                                void handleToggleCompanionWakeup();
                                setShowReplyModeModal(false);
                            }}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99] ${replySignalActive ? 'border-violet-400 bg-violet-50 text-violet-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="font-bold">主动来信</div>
                                {replySignalActive && <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">已允许</span>}
                            </div>
                            <div className={`mt-1 text-xs leading-relaxed ${replySignalActive ? 'text-violet-600' : 'text-slate-400'}`}>
                                {replySignalActive
                                    ? `下次点亮：${formatCompanionWakeupTime(companionWakeupStatus.nextTriggerAt)}`
                                    : '允许他偶尔自己想起你；再次点击会暂停。'}
                            </div>
                            {replySignalActive && (
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold text-violet-400">{companionWakeupStatus.nextTitle || '自然惦念'}</span>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={handleCompanionWakeupProbe}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') void handleCompanionWakeupProbe(event);
                                        }}
                                        className="rounded-full bg-violet-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm active:scale-95"
                                    >
                                        试亮一次
                                    </span>
                                </div>
                            )}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Emotion Settings Modal */}
            {char && (
                <EmotionSettingsModal
                    isOpen={showEmotionModal}
                    onClose={() => setShowEmotionModal(false)}
                    char={char}
                    apiPresets={apiPresets}
                    addApiPreset={addApiPreset}
                    onSave={(config) => {
                        updateCharacter(char.id, { emotionConfig: config });
                        addToast(config.enabled ? '情绪感知已启用' : '情绪感知已关闭', config.enabled ? 'success' : 'info');
                    }}
                    onClearBuffs={() => {
                        updateCharacter(char.id, { activeBuffs: [], buffInjection: '' });
                        addToast('情绪状态已清除', 'info');
                    }}
                />
            )}

            {/* Forward Modal */}
            <Modal isOpen={showForwardModal} title="转发聊天记录" onClose={() => setShowForwardModal(false)}>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-xs text-slate-400 mb-3">选择要转发给的角色 (已选 {selectedMsgIds.size} 条消息)</p>
                    {characters.filter(c => c.id !== activeCharacterId).map(c => (
                        <button
                            key={c.id}
                            onClick={() => handleForwardToCharacter(c.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all border border-slate-100"
                        >
                            <img src={c.avatar} className="w-10 h-10 rounded-xl object-cover" />
                            <div className="flex-1 text-left">
                                <div className="font-bold text-sm text-slate-700">{c.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">{c.description}</div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </button>
                    ))}
                    {characters.filter(c => c.id !== activeCharacterId).length === 0 && (
                        <div className="text-center text-xs text-slate-400 py-8">没有其他角色可以转发</div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default Chat;
