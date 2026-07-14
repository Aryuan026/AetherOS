import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { CharacterProfile, Message, DateState, DialogueItem, UserProfile } from '../../types';
import Modal from '../../components/os/Modal';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import DateSettings from './DateSettings';
import { synthesizeSpeech, cleanTextForTts } from '../../utils/minimaxTts';
import { SHELL_APP_HEADER_CONTENT_TOP } from '../shell/shellLayout';
import { DATE_REQUIRED_EMOTIONS, getBuiltInDateBackgroundForHour, getDateFallbackMood, resolveDateDefaultPortrait, resolveDateSpriteMap } from '../../utils/dateExperience';

// Helper: Parse dialogue with simple state machine
const isContextNoise = (line: string) => {
    const l = line.trim().toLowerCase();
    if (l.startsWith('(') && l.endsWith(')')) {
        if (l.includes('in person') || l.includes('face-to-face') || l.includes('location') || l.includes('time')) return true;
    }
    if (l.startsWith('[system') || l.startsWith('(system')) return true;
    return false;
};

// Helper: Strip emotion tags like [shy], [happy] for pure text display
const cleanTextForDisplay = (text: string) => {
    // Remove content inside brackets [] and trim extra spaces
    // Also remove typical system prompts if any leak through
    return text.replace(/\[.*?\]/g, '').trim();
};

// Helper: Check if a line is dialogue (starts with quoted speech "...")
// A dialogue line must BEGIN with a quote character (after trimming).
// Lines that merely contain incidental quotes (e.g. 把"项圈草图"塞进...) are narration.
const isDialogueLine = (text: string) => {
    const clean = cleanTextForDisplay(text);
    return /^[""\u201C\u300C]/.test(clean);
};

// Helper: Extract only the dialogue text from a line for TTS
const extractDialogueText = (text: string): string => {
    const clean = cleanTextForDisplay(text);
    const matches = clean.match(/["\u201C]([^"\u201D]*)["\u201D]/g)
        || clean.match(/[\u300C]([^\u300D]*)[\u300D]/g);
    if (matches) {
        return matches.map(m => m.replace(/["\u201C\u201D\u300C\u300D]/g, '')).join(' ');
    }
    return clean;
};

const stripOuterDialogueQuotes = (text: string): string => (
    cleanTextForDisplay(text)
        .replace(/^["\u201C\u300C]\s*/, '')
        .replace(/\s*["\u201D\u300D]$/, '')
);

const DATE_SCENE_CONTROLS_TOP = `calc(${SHELL_APP_HEADER_CONTENT_TOP} + 0.8rem)`;
const DATE_NOVEL_TOP_GUTTER = `calc(${SHELL_APP_HEADER_CONTENT_TOP} + 5.6rem)`;
const DATE_NOVEL_TOP_SCRIM_HEIGHT = `calc(${SHELL_APP_HEADER_CONTENT_TOP} + 5.2rem)`;

const parseDialogue = (fullText: string, initialEmotion: string = 'normal'): DialogueItem[] => {
    if (!fullText) return [];
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results: DialogueItem[] = [];
    let currentEmotion = initialEmotion;

    for (const line of lines) {
        if (isContextNoise(line)) continue;
        const tagMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
        let content = line;
        
        if (tagMatch) {
            currentEmotion = tagMatch[1].toLowerCase();
            content = tagMatch[2];
        } else {
            const standaloneTag = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
            if (standaloneTag) {
                currentEmotion = standaloneTag[1].toLowerCase();
                continue; 
            }
        }
        if (content) {
            results.push({ text: content, emotion: currentEmotion });
        }
    }
    return results;
};

interface DateSessionProps {
    char: CharacterProfile;
    userProfile: UserProfile;
    messages: Message[]; // The DB messages for history/novel mode
    peekStatus: string;  // Initial text from the Peek phase
    initialState?: DateState; // Resume state
    onSendMessage: (text: string) => Promise<string>; // Returns AI content
    onReroll: () => Promise<string>;
    onExit: (currentState: DateState) => void;
    onEditMessage: (msg: Message) => void;
    onDeleteMessage: (msg: Message) => void;
    onDeleteMessages: (ids: number[]) => Promise<void>;
    onUpdateMessage: (id: number, content: string) => Promise<void>;
    onSettings: () => void;
}

const DateSession: React.FC<DateSessionProps> = ({ 
    char, 
    userProfile,
    messages, 
    peekStatus, 
    initialState,
    onSendMessage, 
    onReroll, 
    onExit,
    onEditMessage,
    onDeleteMessage,
    onDeleteMessages,
    onUpdateMessage,
    onSettings
}) => {
    const { addToast, registerBackHandler, apiConfig, updateCharacter, virtualTime } = useOS();
    
    // Core VN State
    const [isNovelMode, setIsNovelMode] = useState(false);
    const [bgImage, setBgImage] = useState<string>(char.dateBackground || '');
    const [currentSprite, setCurrentSprite] = useState<string>('');
    const [spriteConfig, setSpriteConfig] = useState(char.spriteConfig || { scale: 1, x: 0, y: 0 });
    
    // Dialogue Engine State
    const [dialogueQueue, setDialogueQueue] = useState<DialogueItem[]>([]);
    const [dialogueBatch, setDialogueBatch] = useState<DialogueItem[]>([]); // For replaying current batch
    const [currentText, setCurrentText] = useState('');
    const [displayedText, setDisplayedText] = useState('');
    const [isTextAnimating, setIsTextAnimating] = useState(false);
    
    // Interaction State
    const [input, setInput] = useState('');
    const [showInputBox, setShowInputBox] = useState(false);
    const [isTyping, setIsTyping] = useState(false); // Waiting for API
    const [isShowingOpening, setIsShowingOpening] = useState(!initialState); // True until first user interaction
    const [showExitModal, setShowExitModal] = useState(false);
    
    // Settings Overlay State (Internal)
    const [showSettings, setShowSettings] = useState(false);

    // Edit Msg Logic
    const [modalType, setModalType] = useState<'none' | 'options'>('none');
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [isBatchSelectMode, setIsBatchSelectMode] = useState(false);
    const [selectedSegmentKeys, setSelectedSegmentKeys] = useState<Set<string>>(new Set());
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<{x: number, y: number} | null>(null);
    const novelScrollRef = useRef<HTMLDivElement>(null);

    // Voice TTS — single shared cache keyed by dialogue text, used by both GAL & novel mode
    const [dateVoicePlaying, setDateVoicePlaying] = useState(false);
    const [galVoiceLoading, setGalVoiceLoading] = useState(false);
    const [showVoiceLangPicker, setShowVoiceLangPicker] = useState(false);
    const voiceCacheRef = useRef<Record<string, string>>({});
    const [novelVoiceLoading, setNovelVoiceLoading] = useState<Set<string>>(new Set());
    const [novelPlayingId, setNovelPlayingId] = useState<string | null>(null);
    const dateAudioRef = useRef<HTMLAudioElement | null>(null);
    const voiceEnabled = !!char.dateVoiceEnabled;
    const voiceLang = char.dateVoiceLang || '';

    const VOICE_LANG_LABELS: Record<string, string> = { en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', es: 'Español' };
    const VOICE_LANG_OPTIONS = [{v:'',l:'默认'},{v:'en',l:'EN'},{v:'ja',l:'JP'},{v:'ko',l:'KR'},{v:'fr',l:'FR'},{v:'es',l:'ES'}];

    const translateAndSpeak = async (text: string): Promise<string | null> => {
        if (!char.voiceProfile?.voiceId && (!char.voiceProfile?.timberWeights?.length)) return null;
        try {
            let ttsText = cleanTextForTts(text);
            if (!ttsText || ttsText.length < 2) return null;
            if (voiceLang) {
                const langLabel = VOICE_LANG_LABELS[voiceLang] || voiceLang;
                try {
                    const transRes = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
                        body: JSON.stringify({
                            model: apiConfig.model,
                            messages: [{ role: 'system', content: `Translate the following text to ${langLabel}. Output ONLY the translation, nothing else.` }, { role: 'user', content: ttsText }],
                            temperature: 0.3,
                        }),
                    });
                    const transData = await transRes.json();
                    const translated = transData?.choices?.[0]?.message?.content?.trim();
                    if (translated) ttsText = translated;
                } catch { /* use original */ }
            }
            return await synthesizeSpeech(ttsText, char, apiConfig, {
                languageBoost: voiceLang || undefined,
                groupId: apiConfig.minimaxGroupId || undefined,
            });
        } catch (err: any) {
            console.warn('Date TTS failed:', err?.message);
            return null;
        }
    };

    // GAL mode: auto-play voice only for dialogue lines (quoted text), stop previous on advance
    // Uses cache so replaying the same line doesn't re-fetch
    useEffect(() => {
        if (!voiceEnabled || isNovelMode || !currentText || isTyping) return;
        // Stop any currently playing audio when text changes (advancing to next line)
        if (dateAudioRef.current) {
            dateAudioRef.current.pause();
            dateAudioRef.current.currentTime = 0;
            setDateVoicePlaying(false);
        }
        setGalVoiceLoading(false);
        // Skip voice during opening phase and for non-dialogue lines
        if (isShowingOpening) return;
        if (!isDialogueLine(currentText)) return;
        let cancelled = false;
        const dialogueText = extractDialogueText(currentText);
        const cacheKey = dialogueText;
        const play = async () => {
            // Check cache first
            let url = voiceCacheRef.current[cacheKey];
            if (!url) {
                setGalVoiceLoading(true);
                url = await translateAndSpeak(dialogueText) || '';
                if (cancelled) return;
                setGalVoiceLoading(false);
                if (!url) return;
                voiceCacheRef.current[cacheKey] = url;
            }
            if (cancelled) return;
            if (!dateAudioRef.current) dateAudioRef.current = new Audio();
            dateAudioRef.current.src = url;
            dateAudioRef.current.onended = () => setDateVoicePlaying(false);
            dateAudioRef.current.play().catch(() => {});
            setDateVoicePlaying(true);
        };
        play();
        return () => { cancelled = true; setGalVoiceLoading(false); if (dateAudioRef.current) { dateAudioRef.current.pause(); } };
    }, [currentText, voiceEnabled, isNovelMode]);

    // GAL mode: manual play/pause for the current dialogue line
    const handleGalVoiceToggle = async () => {
        if (!currentText || !isDialogueLine(currentText)) return;
        // If playing, pause
        if (dateVoicePlaying && dateAudioRef.current) {
            dateAudioRef.current.pause();
            setDateVoicePlaying(false);
            return;
        }
        const dialogueText = extractDialogueText(currentText);
        const cacheKey = dialogueText;
        let url = voiceCacheRef.current[cacheKey];
        if (!url) {
            setGalVoiceLoading(true);
            url = await translateAndSpeak(dialogueText) || '';
            setGalVoiceLoading(false);
            if (!url) return;
            voiceCacheRef.current[cacheKey] = url;
        }
        if (!dateAudioRef.current) dateAudioRef.current = new Audio();
        dateAudioRef.current.src = url;
        dateAudioRef.current.onended = () => setDateVoicePlaying(false);
        dateAudioRef.current.play().catch(() => {});
        setDateVoicePlaying(true);
    };

    // Novel/Reading mode: play a specific dialogue line (shares voiceCacheRef with GAL mode)
    const handleNovelLinePlay = async (lineKey: string, dialogueText: string) => {
        const cachedUrl = voiceCacheRef.current[dialogueText];
        if (cachedUrl) {
            // Already have URL (from GAL or previous novel play), just play/pause
            if (!dateAudioRef.current) dateAudioRef.current = new Audio();
            if (novelPlayingId === lineKey) {
                dateAudioRef.current.pause();
                setNovelPlayingId(null);
                return;
            }
            dateAudioRef.current.src = cachedUrl;
            dateAudioRef.current.onended = () => setNovelPlayingId(null);
            dateAudioRef.current.play().catch(() => {});
            setNovelPlayingId(lineKey);
            return;
        }
        setNovelVoiceLoading(prev => new Set(prev).add(lineKey));
        const url = await translateAndSpeak(dialogueText);
        setNovelVoiceLoading(prev => { const n = new Set(prev); n.delete(lineKey); return n; });
        if (!url) return;
        voiceCacheRef.current[dialogueText] = url;
        if (!dateAudioRef.current) dateAudioRef.current = new Audio();
        dateAudioRef.current.src = url;
        dateAudioRef.current.onended = () => setNovelPlayingId(null);
        dateAudioRef.current.play().catch(() => {});
        setNovelPlayingId(lineKey);
    };

    // Back Handler
    useEffect(() => {
        const unregister = registerBackHandler(() => {
            if (showSettings) {
                setShowSettings(false);
                return true;
            }
            if (showExitModal) {
                setShowExitModal(false);
                return true;
            }
            setShowExitModal(true);
            return true;
        });
        return unregister;
    }, [showSettings, showExitModal, registerBackHandler]);

    // Filter messages for Novel Mode: Show only current session
    // Logic: Find the LAST message with `isOpening: true`. Show all messages from there onwards.
    const sessionMessages = React.useMemo(() => {
        const openingIndex = messages.map(m => m.metadata?.isOpening).lastIndexOf(true);
        if (openingIndex !== -1) {
            return messages.slice(openingIndex);
        }
        // Fallback: If no opening found (legacy data), show all
        return messages;
    }, [messages]);

    // Initialization
    useEffect(() => {
        if (initialState) {
            // Resume
            setBgImage(initialState.bgImage);
            setCurrentSprite(initialState.currentSprite);
            setCurrentText(initialState.currentText);
            setDisplayedText(initialState.currentText);
            setDialogueQueue(initialState.dialogueQueue);
            setDialogueBatch(initialState.dialogueBatch);
            setIsNovelMode(initialState.isNovelMode);
        } else {
            // New Session - pick initial sprite from active skin set or default sprites
            const initPortrait = resolveDateDefaultPortrait(char);
            setCurrentSprite(initPortrait.portrait || '');
            
            // Parse Peek Status as opening
            const startText = peekStatus || "你向前走近了一点。空气像被轻轻拨开，场景从这一刻开始。";
            const items = parseDialogue(startText, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            
            if (items.length > 0) {
                // Manually trigger first item processing
                const first = items[0];
                setCurrentText(first.text);
                // Note: Not setting sprite here because useEffect below will handle emotion->sprite mapping if needed, 
                // or we rely on default.
                setDialogueQueue(items.slice(1));
            }
        }
    }, []); // Run once on mount

    // Sprite & Config Sync (If user goes to settings and comes back, this helps)
    useEffect(() => {
        if (char.spriteConfig) setSpriteConfig(char.spriteConfig);
        setBgImage(char.dateBackground || '');
    }, [char]);

    // Novel Mode Scroll
    useEffect(() => {
        if (isNovelMode && novelScrollRef.current) {
            novelScrollRef.current.scrollTop = novelScrollRef.current.scrollHeight;
        }
    }, [sessionMessages.length, isNovelMode, showInputBox]);

    // Typewriter effect
    useEffect(() => {
        if (!currentText || isNovelMode) {
            if (isNovelMode) setDisplayedText(currentText);
            return;
        }
        setIsTextAnimating(true);
        setDisplayedText('');
        let i = 0;
        const timer = setInterval(() => {
            setDisplayedText(currentText.substring(0, i + 1));
            i++;
            if (i >= currentText.length) {
                clearInterval(timer);
                setIsTextAnimating(false);
            }
        }, 20);
        return () => clearInterval(timer);
    }, [currentText, isNovelMode]);

    // --- Logic ---

    // Only allow date-relevant emotions (required + custom), never chibi or other non-date sprites
    const dateEmotionKeys = [...DATE_REQUIRED_EMOTIONS, ...(char.customDateSprites || [])];

    // Resolve active sprites: if a skin set is active, use its sprites; otherwise fall back to char.sprites
    const activeSprites = React.useMemo(() => {
        return resolveDateSpriteMap(char);
    }, [char]);

    const processNextDialogue = (item: DialogueItem, remaining: DialogueItem[]) => {
        setCurrentText(item.text);
        if (item.emotion && activeSprites) {
            const emotionKey = item.emotion.toLowerCase();
            if (dateEmotionKeys.includes(emotionKey)) {
                const nextSprite = activeSprites[emotionKey];
                if (nextSprite) setCurrentSprite(nextSprite);
            } else {
                const found = dateEmotionKeys.find(k => emotionKey.includes(k));
                if (found && activeSprites[found]) {
                    setCurrentSprite(activeSprites[found]);
                }
            }
        }
        setDialogueQueue(remaining);
    };

    const handleScreenClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button, input, textarea, .control-panel')) return;
        if (isNovelMode) return;

        // Skip animation
        if (isTextAnimating) {
            setDisplayedText(currentText);
            setIsTextAnimating(false);
            return;
        }

        // Next item
        if (dialogueQueue.length > 0) {
            processNextDialogue(dialogueQueue[0], dialogueQueue.slice(1));
            return;
        }

        // End of current beat: invite user input instead of replaying the batch.
        if (dialogueBatch.length > 0) {
            setShowInputBox(true);
            return;
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;
        const text = input.trim();
        setInput('');
        setShowInputBox(false);
        setIsTyping(true);
        setIsShowingOpening(false); // First user interaction - opening phase is over

        try {
            const aiContent = await onSendMessage(text);
            // Parse new content
            const items = parseDialogue(aiContent, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) {
                processNextDialogue(items[0], items.slice(1));
            }
        } catch (e: any) {
            setCurrentText("(连接中断)");
            setShowInputBox(true);
        } finally {
            setIsTyping(false);
        }
    };

    const handleRerollClick = async () => {
        if (isTyping) return;
        setIsTyping(true);
        try {
            const aiContent = await onReroll();
            const items = parseDialogue(aiContent, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) processNextDialogue(items[0], items.slice(1));
        } catch(e) {
            // Error handled in parent
        } finally {
            setIsTyping(false);
        }
    };

    const buildCurrentState = (): DateState => ({
        dialogueQueue,
        dialogueBatch,
        currentText,
        bgImage,
        currentSprite,
        isNovelMode,
        timestamp: Date.now(),
        peekStatus
    });

    const handleExitClick = () => {
        onExit(buildCurrentState());
    };

    // Auto-save: persist date state so refresh/close doesn't lose progress
    const stateRef = useRef<() => DateState>(buildCurrentState);
    stateRef.current = buildCurrentState;
    const charRef = useRef(char);
    charRef.current = char;

    useEffect(() => {
        // Direct DB save — works during beforeunload when React state updates are useless
        const saveStateToDB = () => {
            try {
                const state = stateRef.current();
                DB.saveCharacter({ ...charRef.current, savedDateState: state });
            } catch (e) { /* best-effort */ }
        };

        // beforeunload: catch page refresh / tab close
        const handleBeforeUnload = () => { saveStateToDB(); };
        // visibilitychange: catch tab switch / app background (more reliable on mobile)
        const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') saveStateToDB(); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Periodic auto-save every 30s
        const interval = setInterval(saveStateToDB, 30000);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(interval);
            // Also save on React unmount, but do not route back or toast.
            // Explicit exit is handled only by the “保存并退出” button.
            saveStateToDB();
        };
    }, []);

    // Message Touch Logic (Robust version for scrollable lists)
    const handleMsgTouchStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
        if (!isNovelMode) return;
        // If already in batch select mode, don't start a new long press timer
        if (isBatchSelectMode) return;
        if ('touches' in e) {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            touchStartRef.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
                setSelectedMessage(msg);
            setModalType('options');
        }, 600);
    };

    const handleMsgTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current || !touchStartRef.current) return;
        
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const dx = Math.abs(clientX - touchStartRef.current.x);
        const dy = Math.abs(clientY - touchStartRef.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (dx > 10 || dy > 10) {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleMsgTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    };

    const makeSegmentKey = (msgId: number, lineIndex: number) => `${msgId}:${lineIndex}`;

    const getSelectableSegments = (msg: Message) => {
        if (msg.role === 'assistant') {
            return (msg.content || '')
                .split('\n')
                .map((raw, index) => ({ key: makeSegmentKey(msg.id, index), index, raw, clean: cleanTextForDisplay(raw) }))
                .filter(segment => segment.clean.length > 0);
        }
        const clean = cleanTextForDisplay(msg.content || '');
        return clean ? [{ key: makeSegmentKey(msg.id, -1), index: -1, raw: msg.content || '', clean }] : [];
    };

    const toggleSelectedSegment = (key: string) => {
        setSelectedSegmentKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const exitBatchMode = () => {
        setIsBatchSelectMode(false);
        setSelectedSegmentKeys(new Set());
    };

    const handleBatchDelete = async () => {
        if (selectedSegmentKeys.size === 0) return;
        const messageIdsToDelete: number[] = [];
        const partialUpdates: Array<{ id: number; content: string }> = [];

        messages.forEach(msg => {
            const segments = getSelectableSegments(msg);
            const selectedForMessage = segments.filter(segment => selectedSegmentKeys.has(segment.key));
            if (selectedForMessage.length === 0) return;

            if (msg.role !== 'assistant' || selectedForMessage.length >= segments.length) {
                messageIdsToDelete.push(msg.id);
                return;
            }

            const selectedLineIndexes = new Set(selectedForMessage.map(segment => segment.index));
            const nextContent = (msg.content || '')
                .split('\n')
                .filter((line, index) => !selectedLineIndexes.has(index) && cleanTextForDisplay(line).length > 0)
                .join('\n');

            if (nextContent.trim()) {
                partialUpdates.push({ id: msg.id, content: nextContent });
            } else {
                messageIdsToDelete.push(msg.id);
            }
        });

        await Promise.all(partialUpdates.map(update => onUpdateMessage(update.id, update.content)));
        if (messageIdsToDelete.length > 0) {
            await onDeleteMessages(messageIdsToDelete);
        }
        addToast(`已删除 ${selectedSegmentKeys.size} 段`, 'success');
        exitBatchMode();
    };

    // Determine if we can reroll (last message is assistant)
    const canReroll = messages.length > 0 && messages[messages.length - 1].role === 'assistant';
    const currentLineIsDialogue = isDialogueLine(currentText);
    const displayedCleanText = cleanTextForDisplay(displayedText);
    const displayedDialogueText = currentLineIsDialogue ? stripOuterDialogueQuotes(displayedText || currentText) : displayedCleanText;
    const fallbackMood = React.useMemo(() => getDateFallbackMood(char.name, virtualTime.hours), [char.name, virtualTime.hours]);
    const defaultPortrait = React.useMemo(() => resolveDateDefaultPortrait(char), [char]);
    const hasVisualPortrait = Boolean(currentSprite && (defaultPortrait.hasDedicatedPortrait || currentSprite !== char.avatar));
    const resolvedBgImage = bgImage || getBuiltInDateBackgroundForHour(virtualTime.hours)?.src || '';

    useEffect(() => {
        if (isNovelMode || isTyping || isTextAnimating || showInputBox || !currentText) return;
        if (dialogueQueue.length > 0 || dialogueBatch.length === 0) return;
        const timer = window.setTimeout(() => {
            setShowInputBox(true);
        }, 520);
        return () => window.clearTimeout(timer);
    }, [isNovelMode, isTyping, isTextAnimating, showInputBox, currentText, dialogueQueue.length, dialogueBatch.length]);

    return (
            <div className="h-full w-full relative bg-black overflow-hidden font-sans select-none" onClick={handleScreenClick}>

            {/* Background Layer */}
            {resolvedBgImage ? (
                <div
                    className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ${isNovelMode ? 'blur-xl opacity-30' : 'opacity-80'}`}
                    style={{ backgroundImage: `url(${resolvedBgImage})` }}
                />
            ) : (
                <>
                    <div
                        className={`absolute inset-0 transition-all duration-1000 ${isNovelMode ? 'blur-xl opacity-30' : 'opacity-100'}`}
                        style={{
                            background: `radial-gradient(circle at 50% 30%, ${fallbackMood.glow} 0%, transparent 34%), linear-gradient(160deg, ${fallbackMood.from} 0%, ${fallbackMood.via} 56%, ${fallbackMood.to} 145%)`,
                        }}
                    />
                    <img src={char.avatar} alt="" className={`absolute inset-0 h-full w-full object-cover blur-3xl scale-125 transition-opacity duration-1000 ${isNovelMode ? 'opacity-10' : 'opacity-20'}`} />
                    <div className="absolute inset-0 bg-black/35" />
                </>
            )}

            {/* Menu Layer */}
            <div className="absolute top-0 right-0 z-[100] flex justify-end gap-2.5 px-3 pb-3 pointer-events-auto" style={{ paddingTop: DATE_SCENE_CONTROLS_TOP }}>
                {!isTyping && canReroll && (
                    <button onClick={(e) => { e.stopPropagation(); handleRerollClick(); }} className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${isNovelMode ? 'bg-white/10 backdrop-blur-md border-slate-300/30 text-slate-400 hover:bg-white/20' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    </button>
                )}
                
                {/* Voice Toggle — tap to enable/disable, long-press or second tap when enabled to show lang picker */}
                <div className="relative">
                    <button onClick={(e) => {
                            e.stopPropagation();
                            if (voiceEnabled) {
                                setShowVoiceLangPicker(prev => !prev);
                            } else {
                                updateCharacter(char.id, { dateVoiceEnabled: true });
                                addToast('语音已开启', 'info');
                                setShowVoiceLangPicker(true);
                            }
                        }}
                        onDoubleClick={(e) => { e.stopPropagation(); if (voiceEnabled) { updateCharacter(char.id, { dateVoiceEnabled: false }); setShowVoiceLangPicker(false); addToast('语音已关闭', 'info'); } }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${voiceEnabled ? 'bg-white/20 backdrop-blur-md border-white/30 text-white/80' : 'bg-black/30 backdrop-blur-md border-white/20 text-white/50 hover:bg-white/20'}`}
                        title={voiceEnabled ? '点击切换语种 / 双击关闭' : '开启语音'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                            {voiceEnabled
                                ? <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                : <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />}
                        </svg>
                        {voiceEnabled && voiceLang && <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-white/30 text-white rounded-full px-1 leading-tight">{VOICE_LANG_OPTIONS.find(o => o.v === voiceLang)?.l || ''}</span>}
                    </button>
                    {/* Collapsible Language Picker */}
                    {voiceEnabled && showVoiceLangPicker && (
                        <div className="absolute top-10 right-0 flex flex-col gap-1 animate-fade-in">
                            {VOICE_LANG_OPTIONS.map(opt => (
                                <button key={opt.v} onClick={(e) => { e.stopPropagation(); updateCharacter(char.id, { dateVoiceLang: opt.v }); setShowVoiceLangPicker(false); }}
                                    className={`h-7 px-2.5 rounded-full text-[10px] font-bold transition-all active:scale-95 whitespace-nowrap ${voiceLang === opt.v ? 'bg-white/30 text-white shadow-md' : 'bg-black/30 backdrop-blur-md text-white/60 border border-white/10'}`}>
                                    {opt.l}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Novel Mode Toggle */}
                <button onClick={(e) => { e.stopPropagation(); setIsNovelMode(!isNovelMode); exitBatchMode(); }} className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${isNovelMode ? 'bg-white text-black border-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                    {isNovelMode ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                    )}
                </button>

                <button onClick={(e) => { e.stopPropagation(); setShowInputBox(!showInputBox); }} className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${showInputBox ? 'bg-primary border-primary text-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} className="bg-black/30 backdrop-blur-md text-white w-9 h-9 rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all shadow-lg active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 2.555c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.212 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-2.555c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                </button>
                {isNovelMode && (
                    <button
                        onClick={(e) => { e.stopPropagation(); isBatchSelectMode ? exitBatchMode() : setIsBatchSelectMode(true); }}
                        className={`px-3 h-9 rounded-full text-xs font-bold border shadow-lg ${isBatchSelectMode ? 'bg-primary text-white border-primary' : 'bg-black/30 backdrop-blur-md border-white/20 text-white'}`}
                    >
                        {isBatchSelectMode ? '完成' : '管理'}
                    </button>
                )}
                <button onClick={() => setShowExitModal(true)} className="bg-red-500/80 backdrop-blur-md text-white px-3.5 h-9 rounded-full flex items-center justify-center gap-1 border border-white/20 hover:bg-red-600 transition-colors shadow-lg active:scale-95">
                    <span className="text-xs font-bold mr-1">离开</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                </button>
            </div>

            {/* Novel Mode View */}
            {isNovelMode && (
                <>
                <div
                    ref={novelScrollRef}
                    className={`absolute inset-0 z-20 overflow-y-auto no-scrollbar pb-32 px-6 overscroll-contain ${char.dateLightReading ? 'bg-[#faf8f5]' : 'bg-black/90 backdrop-blur-sm'}`}
                    style={{ paddingTop: DATE_NOVEL_TOP_GUTTER, scrollPaddingTop: DATE_NOVEL_TOP_GUTTER }}
                    onClick={(e) => { e.stopPropagation(); }}
                >
                    <div className="min-h-full flex flex-col justify-end">
                        <div className="max-w-xl mx-auto animate-fade-in space-y-3">
                            {isBatchSelectMode && (
                                <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-white/90 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-700 shadow-sm backdrop-blur-md">
                                    <span className="min-w-0 flex-1">
                                        <span className="font-bold">已选 {selectedSegmentKeys.size} 段</span>
                                        <span className="ml-2 text-stone-400">点选段落，删除选中</span>
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleBatchDelete(); }}
                                        disabled={selectedSegmentKeys.size === 0}
                                        className="px-3 py-1 rounded-full bg-red-500 text-white disabled:opacity-40"
                                    >删除选中</button>
                                </div>
                            )}
                            {sessionMessages.length === 0 && peekStatus && (
                                <div className={`italic text-center text-[13px] mb-8 px-4 ${char.dateLightReading ? 'text-stone-400' : 'text-slate-200/50'}`}>
                                    {cleanTextForDisplay(peekStatus).split('\n').map((line, idx) => line.trim() && <p key={idx} className="whitespace-pre-wrap leading-relaxed tracking-wide my-2">{line}</p>)}
                                </div>
                            )}
                            {sessionMessages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`group relative rounded-xl transition-colors -mx-4 px-4 py-2 ${char.dateLightReading ? 'active:bg-stone-100' : 'active:bg-white/5'}`}
                                    onTouchStart={(e) => handleMsgTouchStart(e, msg)}
                                    onTouchEnd={handleMsgTouchEnd}
                                    onTouchMove={handleMsgTouchMove}
                                    onMouseDown={(e) => handleMsgTouchStart(e, msg)}
                                    onMouseUp={handleMsgTouchEnd}
                                    onMouseMove={handleMsgTouchMove}
                                    onMouseLeave={handleMsgTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); if (!isBatchSelectMode) { setSelectedMessage(msg); setModalType('options'); } }}
                                >
                                    {msg.role === 'user' ? (
                                        (() => {
                                            const userSegment = getSelectableSegments(msg)[0];
                                            const selected = userSegment ? selectedSegmentKeys.has(userSegment.key) : false;
                                            return (
                                                <div
                                                    className={`relative flex items-start justify-end gap-2 ${isBatchSelectMode ? 'cursor-pointer' : ''}`}
                                                    onClick={(e) => {
                                                        if (!isBatchSelectMode || !userSegment) return;
                                                        e.stopPropagation();
                                                        toggleSelectedSegment(userSegment.key);
                                                    }}
                                                >
                                                    {isBatchSelectMode && userSegment && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); toggleSelectedSegment(userSegment.key); }}
                                                            className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'bg-white border-stone-300'}`}
                                                        >
                                                            {selected && <span className="text-white text-[10px]">✓</span>}
                                                        </button>
                                                    )}
                                                    <p className={`whitespace-pre-wrap font-serif text-[13px] text-right leading-6 tracking-wide italic pr-4 ${char.dateLightReading ? 'text-stone-400 border-r-2 border-stone-300/50' : 'text-slate-400 border-r-2 border-slate-600/50'}`}>{cleanTextForDisplay(msg.content)} <span className="text-[10px] uppercase font-sans not-italic ml-2 opacity-50">{userProfile.name}</span></p>
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        <div>
                                            {getSelectableSegments(msg).map((segment) => {
                                                const lineIsDialogue = isDialogueLine(segment.raw);
                                                const lineKey = `${msg.id}-${segment.index}`;
                                                const isOpeningMsg = msg.metadata?.isOpening === true;
                                                const selected = selectedSegmentKeys.has(segment.key);
                                                return (
                                                    <div
                                                        key={segment.key}
                                                        className={`flex items-start gap-2 mb-4 last:mb-0 rounded-xl transition-colors ${isBatchSelectMode ? (selected ? 'bg-primary/5' : 'hover:bg-black/5') : ''}`}
                                                        onClick={(e) => {
                                                            if (!isBatchSelectMode) return;
                                                            e.stopPropagation();
                                                            toggleSelectedSegment(segment.key);
                                                        }}
                                                    >
                                                        {isBatchSelectMode && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); toggleSelectedSegment(segment.key); }}
                                                                className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'bg-white border-stone-300'}`}
                                                            >
                                                                {selected && <span className="text-white text-[10px]">✓</span>}
                                                            </button>
                                                        )}
                                                        <p className={`flex-1 whitespace-pre-wrap font-serif text-[14px] text-justify leading-7 tracking-wide ${isBatchSelectMode ? 'pl-2' : 'pl-4'} ${char.dateLightReading ? 'text-stone-700 border-l-2 border-stone-200' : 'text-slate-200 drop-shadow-md border-l-2 border-white/10'}`}>{segment.clean}</p>
                                                        {/* Voice button: only for dialogue lines, not opening */}
                                                        {voiceEnabled && lineIsDialogue && !isOpeningMsg && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleNovelLinePlay(lineKey, extractDialogueText(segment.raw)); }}
                                                                className={`shrink-0 mt-2 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 select-none ${
                                                                    novelPlayingId === lineKey
                                                                        ? (char.dateLightReading ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-500/20 text-emerald-300')
                                                                        : (char.dateLightReading ? 'bg-stone-100 text-stone-400 hover:bg-stone-200' : 'bg-white/5 text-white/40 hover:bg-white/10')
                                                                }`}
                                                            >
                                                                {novelVoiceLoading.has(lineKey) ? (
                                                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                                                ) : novelPlayingId === lineKey ? (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" /></svg>
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" /></svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div
                    className={`absolute inset-x-0 top-0 z-30 pointer-events-none ${char.dateLightReading ? 'bg-gradient-to-b from-[#faf8f5] via-[#faf8f5]/95 to-transparent' : 'bg-gradient-to-b from-black via-black/90 to-transparent'}`}
                    style={{ height: DATE_NOVEL_TOP_SCRIM_HEIGHT }}
                />
                </>
            )}

            {/* Visual Mode View */}
            {!isNovelMode && (
                <>
                    <div className="absolute inset-x-0 bottom-0 h-[90%] flex items-end justify-center pointer-events-none z-10 overflow-hidden">
                        {hasVisualPortrait && currentSprite ? (
                            <img
                                src={currentSprite}
                                className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all duration-300 origin-bottom"
                                style={{ filter: showInputBox ? 'brightness(1)' : (isTextAnimating ? 'brightness(1.05)' : 'brightness(1)'), transform: `translate(${spriteConfig.x}%, ${spriteConfig.y}%) scale(${isTextAnimating ? spriteConfig.scale * 1.02 : spriteConfig.scale})` }}
                                alt={char.name}
                            />
                        ) : (
                            <div className="mb-[42vh] flex flex-col items-center opacity-95 transition-all duration-500">
                                <div className="relative h-36 w-36">
                                    <div className="absolute inset-0 rounded-full blur-3xl opacity-80" style={{ backgroundColor: fallbackMood.glow }} />
                                    <div className="absolute inset-3 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl" />
                                    <img src={char.avatar} alt={char.name} className="absolute inset-6 h-24 w-24 rounded-full object-cover border border-white/30 shadow-xl" />
                                </div>
                                <div className="mt-4 rounded-full border border-white/15 bg-black/25 px-4 py-1.5 text-xs font-bold tracking-[0.18em] text-white/70 backdrop-blur-md">
                                    {char.name}
                                </div>
                            </div>
                        )}
                    </div>

                    {!isTyping && currentText && !currentLineIsDialogue && (
                        <div className={`absolute inset-x-0 z-30 flex justify-center px-7 pointer-events-none ${showInputBox ? 'bottom-32' : 'bottom-10'}`}>
                            <div className={`w-[86%] max-w-lg rounded-[26px] border border-white/12 bg-black/48 px-5 py-4 text-center shadow-2xl backdrop-blur-xl animate-fade-in overflow-y-auto no-scrollbar pointer-events-auto ${showInputBox ? 'max-h-[28vh]' : 'max-h-[34vh]'}`}>
                                <p className="whitespace-pre-wrap text-[14px] leading-7 tracking-wide text-white/75 drop-shadow-md">
                                    {displayedCleanText}
                                    {isTextAnimating && <span className="ml-1 inline-block h-4 w-1.5 align-middle bg-white/50 animate-pulse" />}
                                </p>
                                {!isTextAnimating && dialogueQueue.length > 0 && (
                                    <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">tap to continue</div>
                                )}
                            </div>
                        </div>
                    )}

                    {!isTyping && currentText && currentLineIsDialogue && (
                        <div className={`absolute inset-x-0 z-30 flex justify-center px-7 ${showInputBox ? 'bottom-32' : 'bottom-10'}`}>
                            <div className={`w-[86%] max-w-lg bg-black/60 backdrop-blur-xl rounded-[24px] border border-white/10 p-5 min-h-[112px] shadow-2xl animate-slide-up hover:bg-black/70 cursor-pointer overflow-y-auto no-scrollbar ${showInputBox ? 'max-h-[28vh]' : 'max-h-[34vh]'}`}>
                                <div className="absolute -top-3 left-6 flex items-center gap-2">
                                    <div className="bg-white/90 text-black px-4 py-1 rounded-sm text-xs font-bold tracking-widest uppercase shadow-[0_4px_10px_rgba(0,0,0,0.3)] transform -skew-x-12">{char.name}</div>
                                    {/* Voice play button next to name */}
                                    {voiceEnabled && !isTextAnimating && !isShowingOpening && isDialogueLine(currentText) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleGalVoiceToggle(); }}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90 ${dateVoicePlaying ? 'bg-white/30 text-white/90' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                        >
                                            {galVoiceLoading ? (
                                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                            ) : dateVoicePlaying ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" /></svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" /></svg>
                                            )}
                                        </button>
                                    )}
                                </div>
                                <p className="text-white/90 text-[15px] leading-7 font-light tracking-wide drop-shadow-md mt-2">
                                    {displayedDialogueText}
                                    {isTextAnimating && <span className="inline-block w-2 h-4 bg-white/70 ml-1 animate-pulse align-middle"></span>}
                                </p>
                                {!isTextAnimating && dialogueQueue.length > 0 && <div className="absolute bottom-3 right-4 animate-bounce opacity-70"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white"><path fillRule="evenodd" d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z" clipRule="evenodd" /></svg></div>}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Input Layer */}
            <div className={`absolute inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none transition-all duration-300 ${isTyping || showInputBox ? 'opacity-100' : 'opacity-0'}`}>
                {isTyping && (
                    <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-auto">
                        <div className="bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-2xl animate-pulse flex items-center gap-3">
                             <div className="flex gap-1.5"><div className="w-2 h-2 bg-white rounded-full animate-bounce"></div><div className="w-2 h-2 bg-white rounded-full animate-bounce delay-75"></div><div className="w-2 h-2 bg-white rounded-full animate-bounce delay-150"></div></div>
                             <span className="text-xs text-white font-bold tracking-widest uppercase">Typing...</span>
                        </div>
                    </div>
                )}
                {showInputBox && (
                    <div className={`w-[88%] max-w-md backdrop-blur-xl rounded-[22px] p-1.5 flex gap-1.5 shadow-2xl animate-fade-in mb-6 pointer-events-auto ${char.dateLightReading ? 'bg-stone-100 border border-stone-300' : 'bg-white/10 border border-white/20'}`} onClick={(e) => e.stopPropagation()}>
                        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={isTyping ? "等他回应..." : "写下动作或轻声回应..."} disabled={isTyping} className={`flex-1 bg-transparent px-3 py-2 outline-none font-light resize-none h-11 no-scrollbar text-[13px] leading-5 ${char.dateLightReading ? 'text-stone-800 placeholder:text-stone-400' : 'text-white placeholder:text-white/30'}`} autoFocus />
                        <button onClick={handleSend} disabled={!input.trim() || isTyping} className="px-4 bg-white text-black rounded-[18px] font-bold text-xs hover:bg-slate-200 disabled:opacity-50 transition-colors h-11 flex items-center justify-center">送出</button>
                    </div>
                )}
            </div>

            {/* Settings Overlay */}
            {showSettings && (
                <div className="absolute inset-0 z-[200] animate-slide-up bg-white">
                    <DateSettings char={char} onBack={() => setShowSettings(false)} />
                </div>
            )}

            {/* Exit Modal */}
            <Modal isOpen={showExitModal} title="暂时离开?" onClose={() => setShowExitModal(false)} footer={<div className="flex gap-3 w-full"><button onClick={() => setShowExitModal(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">留在这里</button><button onClick={handleExitClick} className="flex-1 py-3 bg-slate-800 text-white rounded-2xl font-bold">保存并退出</button></div>}>
                <div className="text-center text-slate-500 text-sm py-2 leading-relaxed">选择“保存并退出”将保留当前对话进度。<br/>下次见面时，你可以选择继续话题。</div>
            </Modal>

            {/* Message Options Modal */}
            <Modal isOpen={modalType === 'options'} title="操作" onClose={() => setModalType('none')}>
                <div className="space-y-3">
                    <button onClick={() => {
                        if (selectedMessage) {
                            setIsBatchSelectMode(true);
                            setSelectedSegmentKeys(new Set(getSelectableSegments(selectedMessage).map(segment => segment.key)));
                        }
                        setModalType('none');
                    }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">管理段落</button>
                    <button onClick={() => {
                        if (selectedMessage) {
                            const clean = (selectedMessage.content || '').replace(/\[.*?\]/g, '').trim();
                            navigator.clipboard.writeText(clean).then(() => addToast('已复制', 'success')).catch(() => addToast('复制失败', 'error'));
                        }
                        setModalType('none');
                    }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">复制文本</button>
                    <button onClick={() => { onEditMessage(selectedMessage!); setModalType('none'); }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">编辑内容</button>
                    <button onClick={() => { onDeleteMessage(selectedMessage!); setModalType('none'); }} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl">删除记录</button>
                </div>
            </Modal>
        </div>
    );
};

export default DateSession;
