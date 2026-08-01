
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { CharacterProfile, Message, DateState } from '../types';
import type { DatePresentationMode } from '../types';
import type { HistoryScope } from '../domain/historyImport/types';
import { ContextBuilder } from '../utils/context';
import { safeResponseJson } from '../utils/safeApi';
import { selectWorldlineMemoryContext } from '../utils/memoryCore';
import Modal from '../components/os/Modal';
import DateSession from '../components/date/DateSession';
import DateSettings from '../components/date/DateSettings';
import AppHeader from '../components/shell/AppHeader';
import { SHELL_APP_HEADER_CONTENT_TOP } from '../components/shell/shellLayout';
import { resolveShellChromeMode } from '../utils/shellChrome';
import { useVirtualWorldClock } from '../hooks/useVirtualWorldClock';
import { BookOpen } from '@phosphor-icons/react';
import { filterCharactersForPersonaSurface, resolvePersonaRouteScope } from '../utils/personaRouteScope';
import { DATE_EXPERIENCE_BOUNDARY, getBuiltInDateBackgroundForHour, getDateFallbackMood, resolveDateDefaultPortrait } from '../utils/dateExperience';
import { buildDateSessionOutputContract, resolveDatePresentationMode } from '../utils/datePresentation';
import {
    prepareCompanionMaterialPrompt,
    recordPreparedCompanionMaterialPromptDelivery,
    type PreparedCompanionMaterialPrompt,
} from '../utils/companionMaterial/promptConsumer';
import { buildDateOpeningCompanionMaterialRequest } from '../utils/companionMaterial/requestBuilders';
import { buildLiveUserTurnGroundingRefs } from '../utils/companionMaterial/grounding';
import {
    buildCompanionInteractionQualityProjection,
} from '../utils/companionMaterial/interactionQuality';
import { prepareCharacterBehaviorBoundaryProjection } from '../utils/characterBehaviorBoundary';
import { buildDateOpeningModelMessages } from '../utils/dateOpeningModelMessages';
import { DateCharacterSelectCard } from '../components/date/DateCharacterSelectCard';
import { DatePersonaScopeNotice, DateSelectIntro } from '../components/date/DateSelectIntro';
import {
    messageMatchesRelationshipScope,
    normalizeMessageRelationshipScope,
    relationshipScopeFromMessage,
    sameMessageRelationshipScope,
    strictRelationshipScopeForProfile,
} from '../utils/messageContext';

type DateHistorySession = {
    id: string;
    date: string;
    timestamp: number;
    msgs: Message[];
    excerpt: string;
    isFavorite: boolean;
    anchorMessageId?: number;
};

const cleanDateHistoryText = (text: string) => (
    (text || '')
        .replace(/\[[^\]]*?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
);

const cleanDateHistoryLine = (text: string) => (
    (text || '')
        .replace(/\[[^\]]*?\]/g, '')
        .trim()
);

const getDateHistoryLines = (text: string) => (
    (text || '')
        .split(/\n+/)
        .map(cleanDateHistoryLine)
        .filter(Boolean)
);

const isDateHistoryDialogueLine = (text: string) => /^[""\u201C\u300C]/.test(text.trim());

const stripDateHistoryDialogueQuotes = (text: string) => (
    text
        .trim()
        .replace(/^[""\u201C\u300C]\s*/, '')
        .replace(/\s*[""\u201D\u300D]$/, '')
        .trim()
);

const splitUserDateHistoryLine = (text: string) => {
    const trimmed = text.trim();
    const match = trimmed.match(/^([（(][^）)]{1,80}[）)])\s*(.*)$/);
    if (!match) return { action: '', text: trimmed };
    return { action: match[1], text: match[2].trim() };
};

const getDateHistoryExcerpt = (msgs: Message[]) => {
    const preferred = msgs.find(m => m.role === 'assistant' && !m.metadata?.isOpening && cleanDateHistoryText(m.content));
    const fallback = msgs.find(m => cleanDateHistoryText(m.content));
    const sourceText = cleanDateHistoryText((preferred || fallback)?.content || '');
    if (!sourceText) return '这次见面还没留下可读片段。';
    return sourceText.length > 92 ? `${sourceText.slice(0, 92)}…` : sourceText;
};

const DATE_PEEK_LOADING_LINES = [
    '门还没完全推开，里面的声响先轻了一点。',
    '你在门口停了一下，灯影慢慢稳住。',
    '空气安静下来，像有人刚好把目光收回。',
    '脚步声被地面吞掉一点，场景正在成形。',
];

const DATE_PEEK_READY_LINES = [
    '可以过去了。',
    '他在那边，等你靠近。',
    '这一刻已经安静下来。',
    '再往前一步，就能进入他的时间里。',
];

const pickDatePeekLine = (lines: string[], seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return lines[hash % lines.length];
};

const createDateSessionId = (): string => (
    globalThis.crypto?.randomUUID?.()
    ?? `date-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
);

const DateApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, setActiveCharacterId, apiConfig, addToast, updateCharacter, virtualTime, userProfile, theme, setShellStatusBarVariantOverride } = useOS();
    const virtualWorld = useVirtualWorldClock(userProfile);
    const requestedShellChromeMode = resolveShellChromeMode(theme);
    const shellChromeMode = requestedShellChromeMode === 'virtual_city'
      ? (virtualWorld.context ? 'virtual_city' : 'software')
      : requestedShellChromeMode;
    
    // Modes: 'select' -> 'peek' -> 'session' | 'settings' | 'history'
    const [mode, setMode] = useState<'select' | 'peek' | 'session' | 'settings' | 'history'>('select');
    // Track previous mode for Settings back navigation
    const [previousMode, setPreviousMode] = useState<'select' | 'peek'>('select');
    
    const [peekStatus, setPeekStatus] = useState<string>('');
    const [peekLoading, setPeekLoading] = useState(false);
    const [peekCopySeed, setPeekCopySeed] = useState(0);
    // History State
    const [historySessions, setHistorySessions] = useState<DateHistorySession[]>([]);
    const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
    const [deleteTargetSession, setDeleteTargetSession] = useState<DateHistorySession | null>(null);
    
    // Resume Logic State
    const [pendingSessionChar, setPendingSessionChar] = useState<CharacterProfile | null>(null);

    // --- NEW: Editing State lifted to here for DB sync ---
    const [dateMessages, setDateMessages] = useState<Message[]>([]);
    const [hasSavedOpening, setHasSavedOpening] = useState(false);
    const dateSessionIdRef = useRef<string | null>(null);
    const dateRelationshipScopeRef = useRef<HistoryScope | null>(null);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTargetMsg, setEditTargetMsg] = useState<Message | null>(null);
    const [editContent, setEditContent] = useState('');

    const personaScope = useMemo(() => (
        resolvePersonaRouteScope(userProfile, characters, activeCharacterId)
    ), [userProfile, characters, activeCharacterId]);
    const dateScopedCharacters = useMemo(() => (
        filterCharactersForPersonaSurface(characters, personaScope, { surface: 'date' })
    ), [characters, personaScope]);
    const char = dateScopedCharacters.find(c => c.id === activeCharacterId);
    const peekVisual = useMemo(() => {
        if (!char) return null;
        const portrait = resolveDateDefaultPortrait(char);
        const mood = getDateFallbackMood(char.name, virtualTime.hours);
        const background = char.dateBackground || getBuiltInDateBackgroundForHour(virtualTime.hours)?.src || '';
        return { ...portrait, mood, background };
    }, [char, virtualTime.hours]);
    const peekLine = useMemo(() => (
        pickDatePeekLine(
            peekLoading ? DATE_PEEK_LOADING_LINES : DATE_PEEK_READY_LINES,
            `${char?.id || 'date'}-${virtualTime.day}-${virtualTime.hours}-${peekCopySeed}-${peekLoading ? 'loading' : 'ready'}`
        )
    ), [char?.id, virtualTime.day, virtualTime.hours, peekCopySeed, peekLoading]);
    const visibleDateCharacters = dateScopedCharacters;

    useEffect(() => {
        const isImmersiveMode = mode === 'peek' || mode === 'session';
        setShellStatusBarVariantOverride(isImmersiveMode ? 'dark' : null);
        return () => setShellStatusBarVariantOverride(null);
    }, [mode, setShellStatusBarVariantOverride]);

    // --- Data Loading ---
    const loadDateMessages = async () => {
        if (char) {
            const msgs = await DB.getMessagesByCharId(char.id);
            const scope = dateRelationshipScopeRef.current
                || strictRelationshipScopeForProfile(char.id, userProfile);
            // 只筛选 source='date' 的消息用于小说模式显示
            const filtered = scope
                ? msgs.filter(m => (
                    m.metadata?.source === 'date'
                    && messageMatchesRelationshipScope(m, scope)
                )).sort((a,b) => a.timestamp - b.timestamp)
                : [];
            setDateMessages(filtered);
            
            // 检查数据库中是否已经包含当前的 peekStatus（通过内容比对），避免重复保存
            if (peekStatus && filtered.some(m => m.content === peekStatus && m.role === 'assistant')) {
                setHasSavedOpening(true);
            }
        }
    };

    useEffect(() => {
        if (char && mode === 'session') {
            loadDateMessages();
        }
    }, [char, mode]);

    // --- Navigation Helpers ---
    const handleBack = () => {
        if (mode === 'peek') {
            setMode('select');
            setPeekStatus('');
        } else if (mode === 'history') {
            if (selectedHistorySessionId) {
                setSelectedHistorySessionId(null);
                return;
            }
            setMode('select');
        } else closeApp();
    };

    const formatTime = () => `${virtualTime.hours.toString().padStart(2, '0')}:${virtualTime.minutes.toString().padStart(2, '0')}`;

    // Improved Time Gap Logic
    const getTimeGapHint = (lastMsgTimestamp: number | undefined): string => {
        if (!lastMsgTimestamp) return '这是你们的初次互动。';
        const now = Date.now();
        const diffMs = now - lastMsgTimestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 23 || currentHour <= 6;

        if (diffMins < 5) return ''; 
        if (diffMins < 60) return `[系统提示: 距离上次互动: ${diffMins} 分钟。]`;
        if (diffHours < 6) {
            if (isNight) return `[系统提示: 距离上次互动: ${diffHours} 小时。现在是深夜/清晨。]`;
            return `[系统提示: 距离上次互动: ${diffHours} 小时。]`;
        }
        if (diffHours < 24) return `[系统提示: 距离上次互动: ${diffHours} 小时。]`;
        const days = Math.floor(diffHours / 24);
        return `[系统提示: 距离上次互动: ${days} 天。]`;
    };
    const getTimeGapClaimKey = (lastMsgTimestamp: number | undefined): string | undefined => {
        if (!lastMsgTimestamp) return undefined;
        const diffMs = Math.max(0, Date.now() - lastMsgTimestamp);
        if (diffMs < 5 * 60 * 1000) return undefined;
        if (diffMs < 60 * 60 * 1000) return 'gap_short';
        if (diffMs < 24 * 60 * 60 * 1000) return 'gap_medium';
        return 'gap_long';
    };

    // --- Resume / Start Logic ---
    const handleCharClick = (c: CharacterProfile) => {
        if (c.savedDateState) {
            setPendingSessionChar(c);
        } else {
            startDateSession(c);
        }
    };

    const handleResumeSession = () => {
        if (!pendingSessionChar) return;
        const savedScope = normalizeMessageRelationshipScope(
            pendingSessionChar.savedDateState?.relationshipScope,
        );
        const activeScope = strictRelationshipScopeForProfile(pendingSessionChar.id, userProfile);
        const savedSessionId = pendingSessionChar.savedDateState?.sessionId;
        if (!savedScope || !activeScope || !sameMessageRelationshipScope(savedScope, activeScope) || !savedSessionId) {
            addToast('这份旧存档没有可靠的关系归属，请从新见面开始。', 'info');
            return;
        }
        dateRelationshipScopeRef.current = savedScope;
        dateSessionIdRef.current = savedSessionId;
        setActiveCharacterId(pendingSessionChar.id);
        setMode('session');
        setPendingSessionChar(null);
        addToast('已恢复上次进度', 'success');
    };

    const handleStartNewSession = () => {
        if (!pendingSessionChar) return;
        updateCharacter(pendingSessionChar.id, { savedDateState: undefined });
        startDateSession(pendingSessionChar);
        setPendingSessionChar(null);
    };

    // --- 关键修复: 进入 Session 时立即归档开场白 ---
    const handleEnterSession = async () => {
        if (!char) return;
        const relationshipScope = dateRelationshipScopeRef.current;
        const dateSessionId = dateSessionIdRef.current;
        if (!relationshipScope || !dateSessionId) {
            addToast('这次见面还没有绑定关系，请重新进入。', 'info');
            return;
        }
        const usablePeekStatus = peekStatus && !peekStatus.startsWith('(无法感知状态:') ? peekStatus : '';

        // 1. 如果有开场白且未保存，立即保存到数据库
        // 这确保了 user 发送第一句话时，AI 能在历史记录里读到这个开场
        // UPDATE: 添加 isOpening 标记，用于区分新会话
        if (usablePeekStatus && !hasSavedOpening) {
            try {
                await DB.saveMessage({
                    charId: char.id,
                    role: 'assistant',
                    type: 'text',
                    content: usablePeekStatus,
                    metadata: {
                        source: 'date',
                        isOpening: true,
                        temporalClass: 'live',
                        relationshipScope,
                        dateSessionId,
                        interactionId: `date:${dateSessionId}`,
                        turnId: `date-opening:${dateSessionId}`,
                        sceneProposalAccepted: true,
                        sceneProvenance: 'generated_date_opening',
                    }
                });
                setHasSavedOpening(true);
            } catch (e) {
                console.error("Failed to save opening", e);
            }
        }

        // 2. 切换模式并刷新数据
        setMode('session');
        await loadDateMessages();
    };

    const resolveDefaultPresentation = (c: CharacterProfile): DatePresentationMode => (
        resolveDatePresentationMode(
            c.datePresentationPreference,
            resolveDateDefaultPortrait(c).hasDedicatedPortrait,
        )
    );

    const startReadingSession = (c: CharacterProfile) => {
        const relationshipScope = strictRelationshipScopeForProfile(c.id, userProfile);
        if (!relationshipScope) {
            addToast('请先把当前面具与角色关系连接好。', 'info');
            return;
        }
        dateRelationshipScopeRef.current = relationshipScope;
        dateSessionIdRef.current = createDateSessionId();
        setActiveCharacterId(c.id);
        setPeekLoading(false);
        setHasSavedOpening(false);
        // Reading is a real session surface, not an empty visual peek. This quiet line
        // gives a new meeting a readable first beat without pretending to be a portrait.
        setPeekStatus('这次见面刚刚开始。');
        setMode('session');
    };

    const startDateSession = (c: CharacterProfile) => {
        if (resolveDefaultPresentation(c) === 'reading') {
            startReadingSession(c);
            return;
        }
        startPeek(c);
    };

    // --- Peek (Generation) Logic ---
    const startPeek = async (c: CharacterProfile) => {
        const relationshipScope = strictRelationshipScopeForProfile(c.id, userProfile);
        if (!relationshipScope) {
            addToast('请先把当前面具与角色关系连接好。', 'info');
            return;
        }
        dateRelationshipScopeRef.current = relationshipScope;
        dateSessionIdRef.current = createDateSessionId();
        setActiveCharacterId(c.id);
        setMode('peek');
        setPeekLoading(true);
        setPeekCopySeed(prev => prev + 1);
        setPeekStatus('');
        setHasSavedOpening(false); 

        try {
            const requestTime = Date.now();
            const msgs = (await DB.getMessagesByCharId(c.id))
                .filter(message => messageMatchesRelationshipScope(message, relationshipScope));
            const limit = c.contextLimit || 500; 
            const peekLimit = Math.min(limit, 50); 
            const lastMsg = msgs[msgs.length - 1];
            const gapHint = getTimeGapHint(lastMsg?.timestamp);
            const gapClaimKey = getTimeGapClaimKey(lastMsg?.timestamp);

            const recentMsgs = msgs.slice(-peekLimit).map(m => {
                const content = m.type === 'image' ? '[User sent an image]' : m.content;
                return `${m.role}: ${content}`;
            }).join('\n');
            
            const timeStr = `${virtualTime.day} ${formatTime()}`;
            const worldlineMemory = await selectWorldlineMemoryContext({
                char: c,
                user: userProfile,
                mode: 'meet_scene',
                surface: 'date',
                relationshipScope,
                currentMessages: msgs,
                query: '用户正在进入见面场景；只读取与本次开场可靠相关的背景。',
                budgetChars: 900,
            });
            let preparedCompanionMaterial: PreparedCompanionMaterialPrompt | null = null;
            try {
                preparedCompanionMaterial = await prepareCompanionMaterialPrompt(
                  buildDateOpeningCompanionMaterialRequest({
                    requestId: `date-opening-material:${dateSessionIdRef.current}:${requestTime}`,
                    scope: relationshipScope,
                    sceneRefId: `date-opening:${dateSessionIdRef.current}:${requestTime}`,
                    occurredAt: requestTime,
                    observedGap: lastMsg && gapClaimKey ? {
                      claimKey: gapClaimKey,
                      refId: `message-gap:${lastMsg.id}:${requestTime}`,
                    } : undefined,
                  }),
                );
            } catch (error) {
                console.warn('[date] opening companion material unavailable', error);
            }
            const messages = buildDateOpeningModelMessages({
                characterName: c.name,
                coreContext: ContextBuilder.buildCoreContext(c, userProfile, false),
                worldlineContext: worldlineMemory.markdown,
                companionMaterialContext: preparedCompanionMaterial?.markdown,
                characterBehaviorBoundaryContext: prepareCharacterBehaviorBoundaryProjection({
                    requestId: `date-opening-behavior-boundary:${dateSessionIdRef.current}:${requestTime}`,
                    char: c,
                    scope: relationshipScope,
                    surface: 'meet_scene',
                    query: '用户正准备进入见面场景',
                    semanticSignals: ['light_scene', 'opening'],
                    maxItems: 2,
                    budgetChars: 520,
                })?.markdown,
                recentContext: recentMsgs,
                timeText: timeStr,
                gapHint,
                experienceBoundary: DATE_EXPERIENCE_BOUNDARY,
            });

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages,
                    temperature: 0.85
                })
            });

            if (!response.ok) throw new Error('Failed to sense presence');
            const data = await safeResponseJson(response);
            const content = data?.choices?.[0]?.message?.content?.trim() || '';
            if (!content) throw new Error('Failed to sense presence');
            if (preparedCompanionMaterial) {
                try {
                    await recordPreparedCompanionMaterialPromptDelivery({
                        prepared: preparedCompanionMaterial,
                        consumerRef: {
                            kind: 'prompt',
                            id: `date-opening:${dateSessionIdRef.current}:${requestTime}`,
                            revision: 'date-opening-v1',
                        },
                        occurredAt: Date.now(),
                    });
                } catch (error) {
                    console.warn('[date] opening companion material receipt unavailable', error);
                }
            }
            setPeekStatus(content);

        } catch (e: any) {
            setPeekStatus(`(无法感知状态: ${e.message})`);
        } finally {
            setPeekLoading(false);
        }
    };

    // --- Session API Logic ---
    const handleSendMessage = async (text: string, presentationMode: DatePresentationMode): Promise<string> => {
        if (!char) throw new Error("No char");
        const requestTime = Date.now();
        const relationshipScope = dateRelationshipScopeRef.current;
        const dateSessionId = dateSessionIdRef.current;
        if (!relationshipScope || !dateSessionId) throw new Error('Date session scope missing');
        
        // 1. Save User Msg
        await DB.saveMessage({
            charId: char.id,
            role: 'user',
            type: 'text',
            content: text,
            metadata: {
                source: 'date',
                temporalClass: 'live',
                relationshipScope,
                dateSessionId,
                interactionId: `date:${dateSessionId}`,
            },
        });
        
        // 2. Prepare Context
        // Re-fetch messages. Since we saved the opening in handleEnterSession, 
        // 'allMsgs' will now correctly contain: [History..., Opening, UserMsg]
        const allCharMsgs = await DB.getMessagesByCharId(char.id);
        const allMsgs = allCharMsgs.filter(message => (
            messageMatchesRelationshipScope(message, relationshipScope)
        ));
        
        // Update local state for display
        const dateFiltered = allMsgs.filter(m => m.metadata?.source === 'date').sort((a,b) => a.timestamp - b.timestamp);
        setDateMessages(dateFiltered);

        const limit = char.contextLimit || 500;
        
        // Construct History for AI
        // We exclude the very last message (UserMsg we just sent) from history array 
        // because we'll pass it as the explicit user prompt "content".
        // BUT, we must ensure the Opening (Assistant) is included in history.
        const historyMsgs = allMsgs.slice(-limit, -1).map(m => {
            const timeAxis = `[${new Date(m.timestamp).toLocaleString('zh-CN')}]`;
            const source = m.metadata?.source === 'call' ? '[通话]' : m.metadata?.source === 'date' ? '[约会]' : '[聊天]';
            return {
                role: m.role,
                content: m.type === 'image' ? `${timeAxis} ${source} [User sent an image]` : `${timeAxis} ${source} ${m.content}`
            };
        });
        const previousDateUserMessage = [...allMsgs.slice(0, -1)].reverse().find(message => message.role === 'user');

        const worldlineMemory = await selectWorldlineMemoryContext({
            char,
            user: userProfile,
            mode: 'date_scene',
            surface: 'date',
            relationshipScope,
            currentMessages: allMsgs,
            query: text,
            budgetChars: 1200,
        });
        let preparedCompanionMaterial: PreparedCompanionMaterialPrompt | null = null;
        try {
            preparedCompanionMaterial = await prepareCompanionMaterialPrompt({
                requestId: `date-turn-material:${dateSessionId}:${requestTime}`,
                scope: relationshipScope,
                surface: 'date',
                mode: 'date_scene',
                purpose: 'stable_context',
                query: text,
                semanticTags: ['stable_voice', 'date_scene'],
                groundingRefs: buildLiveUserTurnGroundingRefs({
                    scope: relationshipScope,
                    refId: `date-input:${dateSessionId}:${requestTime}`,
                    query: text,
                    semanticTags: ['stable_voice'],
                    surface: 'date',
                    mode: 'date_scene',
                    purpose: 'stable_context',
                    occurredAt: requestTime,
                }),
                relationshipStage: 'unknown',
                budgetChars: 420,
                maxItems: 1,
                now: requestTime,
            });
        } catch (error) {
            console.warn('[date] turn companion material unavailable', error);
        }
        const characterBehaviorBoundary = prepareCharacterBehaviorBoundaryProjection({
            requestId: `date-behavior-boundary:${dateSessionId}:${requestTime}`,
            char,
            scope: relationshipScope,
            surface: 'date_scene',
            query: text,
            previousQuery: typeof previousDateUserMessage?.content === 'string'
                ? previousDateUserMessage.content
                : undefined,
            maxItems: 2,
            budgetChars: 560,
        });
        let systemPrompt = [
            ContextBuilder.buildCoreContext(char, userProfile),
            worldlineMemory.markdown,
            preparedCompanionMaterial?.markdown,
            characterBehaviorBoundary?.markdown,
            !characterBehaviorBoundary?.containsPlayerAuthoredInteractionPattern
              ? buildCompanionInteractionQualityProjection({
                charId: char.id,
                query: text,
                previousQuery: typeof previousDateUserMessage?.content === 'string'
                    ? previousDateUserMessage.content
                    : undefined,
                occurredAt: requestTime,
                previousOccurredAt: previousDateUserMessage?.timestamp,
                surface: 'date',
                mode: 'date_scene',
                purpose: 'stable_context',
              })?.markdown
              : undefined,
        ].filter(Boolean).join('\n');
        const dateEmotions = ['normal', 'happy', 'angry', 'sad', 'shy', ...(char.customDateSprites || [])];
        const outputContract = buildDateSessionOutputContract(presentationMode, dateEmotions);
        systemPrompt += `${DATE_EXPERIENCE_BOUNDARY}\n\n${outputContract.systemPrompt}`;

        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...historyMsgs,
                    { role: 'user', content: `${text}\n\n${outputContract.userPrompt}` }
                ],
                temperature: 0.85
            })
        });

        if (!response.ok) throw new Error('API Error');
        const data = await safeResponseJson(response);
        const content = data?.choices?.[0]?.message?.content?.trim() || '';
        if (!content) throw new Error('API Error');
        if (preparedCompanionMaterial) {
            try {
                await recordPreparedCompanionMaterialPromptDelivery({
                    prepared: preparedCompanionMaterial,
                    consumerRef: {
                        kind: 'prompt',
                        id: `date-turn:${dateSessionId}:${requestTime}`,
                        revision: 'date-turn-v1',
                    },
                    occurredAt: Date.now(),
                });
            } catch (error) {
                console.warn('[date] turn companion material receipt unavailable', error);
            }
        }

        // 3. Save AI Response
        await DB.saveMessage({
            charId: char.id,
            role: 'assistant',
            type: 'text',
            content,
            metadata: {
                source: 'date',
                temporalClass: 'live',
                relationshipScope,
                dateSessionId,
                interactionId: `date:${dateSessionId}`,
                assistantResponseId: `date-response-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            },
        });
        
        // Refresh local state
        const freshMsgs = await DB.getMessagesByCharId(char.id);
        setDateMessages(freshMsgs.filter(m => (
            m.metadata?.source === 'date'
            && messageMatchesRelationshipScope(m, relationshipScope)
        )).sort((a,b) => a.timestamp - b.timestamp));

        return content;
    };

    const handleReroll = async (presentationMode: DatePresentationMode): Promise<string> => {
        if (!char || dateMessages.length === 0) throw new Error("No context");
        const requestTime = Date.now();
        
        const lastMsg = dateMessages[dateMessages.length - 1];
        if (lastMsg.role !== 'assistant') throw new Error("Cannot reroll user message");
        const initiatingScope = relationshipScopeFromMessage(lastMsg);
        const dateSessionId = typeof lastMsg.metadata?.dateSessionId === 'string'
            ? lastMsg.metadata.dateSessionId
            : undefined;
        if (!initiatingScope || !dateSessionId) throw new Error('Date reroll scope missing');

        // 1. Delete last AI message
        await DB.deleteMessage(lastMsg.id);
        
        // 2. Find the user input that triggered it
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const validMsgs = allMsgs.filter(m => (
            m.id !== lastMsg.id
            && messageMatchesRelationshipScope(m, initiatingScope)
        ));
        const lastUserMsg = validMsgs[validMsgs.length - 1];
        
        if (!lastUserMsg || lastUserMsg.role !== 'user') throw new Error("Context lost");
        const previousDateUserMessage = [...validMsgs.slice(0, -1)].reverse().find(message => message.role === 'user');

        // 3. Call API logic
        const limit = char.contextLimit || 500;
        const historyMsgs = validMsgs.slice(-limit, -1).map(m => ({
            role: m.role,
            content: m.type === 'image' ? '[User sent an image]' : m.content
        }));

        const worldlineMemoryR = await selectWorldlineMemoryContext({
            char,
            user: userProfile,
            mode: 'date_scene',
            surface: 'date',
            relationshipScope: initiatingScope,
            currentMessages: validMsgs,
            query: String(lastUserMsg.content || ''),
            budgetChars: 1200,
        });
        let preparedCompanionMaterial: PreparedCompanionMaterialPrompt | null = null;
        try {
            preparedCompanionMaterial = await prepareCompanionMaterialPrompt({
                requestId: `date-reroll-material:${dateSessionId}:${requestTime}`,
                scope: initiatingScope,
                surface: 'date',
                mode: 'date_scene',
                purpose: 'stable_context',
                query: String(lastUserMsg.content || ''),
                semanticTags: ['stable_voice', 'date_scene', 'reroll'],
                groundingRefs: buildLiveUserTurnGroundingRefs({
                    scope: initiatingScope,
                    refId: `message:${lastUserMsg.id}`,
                    query: String(lastUserMsg.content || ''),
                    semanticTags: ['stable_voice'],
                    surface: 'date',
                    mode: 'date_scene',
                    purpose: 'stable_context',
                    occurredAt: requestTime,
                }),
                relationshipStage: 'unknown',
                budgetChars: 420,
                maxItems: 1,
                now: requestTime,
            });
        } catch (error) {
            console.warn('[date] reroll companion material unavailable', error);
        }
        const characterBehaviorBoundary = prepareCharacterBehaviorBoundaryProjection({
            requestId: `date-reroll-behavior-boundary:${dateSessionId}:${requestTime}`,
            char,
            scope: initiatingScope,
            surface: 'date_scene',
            query: String(lastUserMsg.content || ''),
            previousQuery: typeof previousDateUserMessage?.content === 'string'
                ? previousDateUserMessage.content
                : undefined,
            maxItems: 2,
            budgetChars: 560,
        });
        let systemPrompt = [
            ContextBuilder.buildCoreContext(char, userProfile),
            worldlineMemoryR.markdown,
            preparedCompanionMaterial?.markdown,
            characterBehaviorBoundary?.markdown,
            !characterBehaviorBoundary?.containsPlayerAuthoredInteractionPattern
              ? buildCompanionInteractionQualityProjection({
                charId: char.id,
                query: String(lastUserMsg.content || ''),
                previousQuery: typeof previousDateUserMessage?.content === 'string'
                    ? previousDateUserMessage.content
                    : undefined,
                occurredAt: lastUserMsg.timestamp,
                previousOccurredAt: previousDateUserMessage?.timestamp,
                surface: 'date',
                mode: 'date_scene',
                purpose: 'stable_context',
              })?.markdown
              : undefined,
        ].filter(Boolean).join('\n');
        const dateEmotions = ['normal', 'happy', 'angry', 'sad', 'shy', ...(char.customDateSprites || [])];
        const outputContract = buildDateSessionOutputContract(presentationMode, dateEmotions);
        systemPrompt += `${DATE_EXPERIENCE_BOUNDARY}\n\n${outputContract.systemPrompt}`;

        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...historyMsgs,
                    { role: 'user', content: `${lastUserMsg.content}\n\n${outputContract.userPrompt}` }
                ],
                temperature: 0.9 
            })
        });

        if (!response.ok) throw new Error('API Error');
        const data = await safeResponseJson(response);
        const content = data?.choices?.[0]?.message?.content?.trim() || '';
        if (!content) throw new Error('API Error');
        if (preparedCompanionMaterial) {
            try {
                await recordPreparedCompanionMaterialPromptDelivery({
                    prepared: preparedCompanionMaterial,
                    consumerRef: {
                        kind: 'prompt',
                        id: `date-reroll:${dateSessionId}:${requestTime}`,
                        revision: 'date-reroll-v1',
                    },
                    occurredAt: Date.now(),
                });
            } catch (error) {
                console.warn('[date] reroll companion material receipt unavailable', error);
            }
        }

        await DB.saveMessage({
            charId: char.id,
            role: 'assistant',
            type: 'text',
            content,
            metadata: {
                source: 'date',
                temporalClass: 'live',
                relationshipScope: initiatingScope,
                dateSessionId,
                interactionId: `date:${dateSessionId}`,
                assistantResponseId: `date-response-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                rerollOfMessageId: lastMsg.id,
            },
        });
        
        // Sync
        const freshMsgs = await DB.getMessagesByCharId(char.id);
        setDateMessages(freshMsgs.filter(m => (
            m.metadata?.source === 'date'
            && messageMatchesRelationshipScope(m, initiatingScope)
        )).sort((a,b) => a.timestamp - b.timestamp));

        return content;
    };

    // --- Editing & Deletion ---
    const handleDeleteMessage = async (msg: Message) => {
        await DB.deleteMessage(msg.id);
        setDateMessages(prev => prev.filter(m => m.id !== msg.id));
    };

    const handleDeleteMessages = async (ids: number[]) => {
        if (ids.length === 0) return;
        await Promise.all(ids.map(id => DB.deleteMessage(id)));
        setDateMessages(prev => prev.filter(m => !ids.includes(m.id)));
    };

    const handleUpdateMessage = async (id: number, content: string) => {
        await DB.updateMessage(id, content);
        setDateMessages(prev => prev.map(m => m.id === id ? { ...m, content } : m));
    };

    const confirmEditMessage = async () => {
        if (!editTargetMsg) return;
        await DB.updateMessage(editTargetMsg.id, editContent);
        setDateMessages(prev => prev.map(m => m.id === editTargetMsg.id ? { ...m, content: editContent } : m));
        setIsEditModalOpen(false);
        setEditTargetMsg(null);
        addToast('已修改', 'success');
    };

    const onExitSession = (finalState: DateState) => {
        if (char) {
            updateCharacter(char.id, {
                savedDateState: {
                    ...finalState,
                    sessionId: dateSessionIdRef.current || undefined,
                    relationshipScope: dateRelationshipScopeRef.current || undefined,
                },
            });
            addToast('进度已保存', 'success');
        }
        setMode('select');
        setPeekStatus('');
        setHasSavedOpening(false);
    };

    const openHistory = async (c: CharacterProfile) => {
        setActiveCharacterId(c.id);
        setSelectedHistorySessionId(null);
        setDeleteTargetSession(null);
        const msgs = await DB.getMessagesByCharId(c.id);
        const relationshipScope = strictRelationshipScopeForProfile(c.id, userProfile);
        if (!relationshipScope) {
            setHistorySessions([]);
            setMode('history');
            return;
        }
        // dateMsgs sorted DESCENDING (newest first)
        const dateMsgs = msgs.filter(m => (
            m.metadata?.source === 'date'
            && messageMatchesRelationshipScope(m, relationshipScope)
        )).sort((a, b) => b.timestamp - a.timestamp);
        
        const sessions: DateHistorySession[] = [];
        const pushSession = (rawSession: Message[]) => {
            const chrono = [...rawSession].reverse();
            const sessionStartMsg = chrono[0];
            const sessionEndMsg = chrono[chrono.length - 1] || sessionStartMsg;
            const anchorMsg = chrono.find(m => m.metadata?.isOpening === true) || sessionStartMsg;
            sessions.push({
                id: String(anchorMsg?.metadata?.dateSessionId || `${anchorMsg?.id || sessionStartMsg?.id || Date.now()}-${sessionEndMsg?.id || ''}`),
                date: new Date(sessionStartMsg.timestamp).toLocaleString('zh-CN'),
                timestamp: sessionStartMsg.timestamp,
                msgs: chrono,
                excerpt: getDateHistoryExcerpt(chrono),
                isFavorite: chrono.some(m => m.metadata?.dateFavorite === true),
                anchorMessageId: anchorMsg?.id,
            });
        };

        if (dateMsgs.length > 0) {
            // Group by strict time gap (30 mins) OR explicit Opening flag
            let currentSession: Message[] = [dateMsgs[0]];
            
            for (let i = 1; i < dateMsgs.length; i++) {
                const prev = dateMsgs[i-1]; // Newer message
                const curr = dateMsgs[i];   // Older message
                
                // Break session if:
                // 1. Time gap > 30 minutes
                // 2. OR THE PREVIOUS (Newer) message was an opening. 
                //    (If 'prev' is an opening, it means 'prev' is the START of the newer session we just accumulated. 
                //     So 'curr' must belong to an older, different session.)
                const isTimeBreak = Math.abs(prev.timestamp - curr.timestamp) > 30 * 60 * 1000;
                const splitSincePrevWasOpening = prev.metadata?.isOpening === true;
                const previousSessionId = prev.metadata?.dateSessionId;
                const currentSessionId = curr.metadata?.dateSessionId;
                const splitBySessionId = previousSessionId !== currentSessionId
                    && Boolean(previousSessionId || currentSessionId);

                if (splitBySessionId || isTimeBreak || splitSincePrevWasOpening) {
                    // This session ends. Convert from DESC accumulation to chronological display data.
                    pushSession(currentSession);
                    currentSession = [curr];
                } else {
                    currentSession.push(curr);
                }
            }
            // Push final session
            pushSession(currentSession);
        }
        // Do NOT reverse sessions array. We want [NewestSession, OlderSession, OldestSession].
        // Default loop populated them New -> Old.
        setHistorySessions(sessions);
        setMode('history');
    };

    const toggleHistoryFavorite = async (session: DateHistorySession) => {
        const nextFavorite = !session.isFavorite;
        const anchorId = session.anchorMessageId || session.msgs[0]?.id;
        if (!anchorId) return;
        await DB.updateMessageMetadata(anchorId, { dateFavorite: nextFavorite });
        setHistorySessions(prev => prev.map(item => {
            if (item.id !== session.id) return item;
            const nextMsgs = item.msgs.map(msg => (
                msg.id === anchorId
                    ? { ...msg, metadata: { ...(msg.metadata || {}), dateFavorite: nextFavorite } }
                    : msg
            ));
            return { ...item, isFavorite: nextFavorite, msgs: nextMsgs };
        }));
        addToast(nextFavorite ? '已收藏这次见面' : '已取消收藏', 'success');
    };

    const confirmDeleteHistorySession = async () => {
        if (!deleteTargetSession) return;
        const ids = deleteTargetSession.msgs.map(m => m.id).filter(Boolean);
        if (ids.length === 0) {
            setDeleteTargetSession(null);
            return;
        }
        await DB.deleteMessages(ids);
        const deletingNewestSession = historySessions[0]?.id === deleteTargetSession.id;
        if (char && deletingNewestSession && char.savedDateState) {
            updateCharacter(char.id, { savedDateState: undefined });
        }
        setHistorySessions(prev => prev.filter(item => item.id !== deleteTargetSession.id));
        if (selectedHistorySessionId === deleteTargetSession.id) {
            setSelectedHistorySessionId(null);
        }
        setDeleteTargetSession(null);
        addToast('见面记录已删除', 'success');
    };

    // --- Render ---

    if (mode === 'select' || !char) {
        return (
            <div className="h-full w-full bg-gradient-to-b from-rose-50 via-slate-50 to-white flex flex-col font-light">
                <AppHeader
                    title="见面"
                    subtitle={`日常陪伴 · 当前面具 ${dateScopedCharacters.length} 位`}
                    onBack={closeApp}
                    center
                />
                <DateSelectIntro />
                {personaScope.hasLinkedFocus && (
                    <DatePersonaScopeNotice
                        activeMaskLabel={personaScope.activeMaskLabel}
                    />
                )}
                <div className="p-4 grid grid-cols-2 gap-4 overflow-y-auto">
                    {visibleDateCharacters.map(c => (
                        <DateCharacterSelectCard
                            key={c.id}
                            character={c}
                            onClick={() => handleCharClick(c)}
                            onOpenHistory={(e) => { e.stopPropagation(); openHistory(c); }}
                        />
                    ))}
                    {visibleDateCharacters.length === 0 && (
                        <div className="col-span-2 rounded-[28px] border border-rose-100 bg-white/75 px-5 py-10 text-center text-sm leading-6 text-slate-400">
                            当前面具还没有链接角色。先在通讯录里建立关系，再来赴约。
                        </div>
                    )}
                </div>
                <Modal isOpen={!!pendingSessionChar} title="发现进度" onClose={() => setPendingSessionChar(null)} footer={<div className="flex gap-3 w-full"><button onClick={handleStartNewSession} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">新的见面</button><button onClick={handleResumeSession} className="flex-1 py-3 bg-green-500 text-white rounded-2xl font-bold shadow-lg shadow-green-200">继续上次</button></div>}>
                    <div className="text-center text-slate-500 text-sm py-4">检测到 {pendingSessionChar?.name} 有未结束的见面。<br/><span className="text-xs text-slate-400 mt-2 block">(存档时间: {pendingSessionChar?.savedDateState?.timestamp ? new Date(pendingSessionChar.savedDateState.timestamp).toLocaleString() : 'Unknown'})</span></div>
                </Modal>
            </div>
        );
    }

    if (mode === 'history') {
        const selectedHistorySession = selectedHistorySessionId
            ? historySessions.find(session => session.id === selectedHistorySessionId) || null
            : null;

        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <AppHeader
                    title={selectedHistorySession ? '见面全文' : '见面记录'}
                    subtitle={selectedHistorySession ? selectedHistorySession.date : '点开记录查看全文'}
                    onBack={handleBack}
                    center
                    titleClassName="truncate text-xl font-bold tracking-wide text-slate-800"
                />
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
                    {selectedHistorySession ? (
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-white bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-bold tracking-[0.16em] text-slate-400 uppercase">Date Record</div>
                                        <div className="mt-1 text-sm font-bold text-slate-700">{selectedHistorySession.date}</div>
                                        <div className="mt-1 text-[11px] text-slate-400">{selectedHistorySession.msgs.length} 句 · {selectedHistorySession.isFavorite ? '已收藏' : '未收藏'}</div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => toggleHistoryFavorite(selectedHistorySession)}
                                            className={`h-8 rounded-full px-3 text-[11px] font-bold transition active:scale-95 ${selectedHistorySession.isFavorite ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                                        >
                                            {selectedHistorySession.isFavorite ? '已收藏' : '收藏'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTargetSession(selectedHistorySession)}
                                            className="h-8 rounded-full bg-rose-50 px-3 text-[11px] font-bold text-rose-400 transition active:scale-95"
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-5 space-y-6">
                                    {selectedHistorySession.msgs.map(m => {
                                        const lines = getDateHistoryLines(m.content);
                                        return (
                                            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                {m.role === 'user' ? (
                                                    <div className="flex w-full flex-col items-end gap-2">
                                                        {lines.length === 0 ? (
                                                            <div className="max-w-[86%] rounded-2xl rounded-tr-md bg-slate-100 px-3.5 py-2.5 text-right text-[13px] leading-6 text-slate-500 italic">(无内容)</div>
                                                        ) : lines.map((line, lineIndex) => {
                                                            const userLine = splitUserDateHistoryLine(line);
                                                            return (
                                                                <div key={`${m.id}-${lineIndex}`} className="max-w-[86%] rounded-2xl rounded-tr-md bg-slate-100 px-3.5 py-2.5 text-right text-[13px] leading-6 text-slate-500">
                                                                    {userLine.action && <span className="italic text-slate-400">{userLine.action}</span>}
                                                                    {userLine.action && userLine.text && <span> </span>}
                                                                    {userLine.text && <span className="italic">{userLine.text}</span>}
                                                                    {!userLine.action && !userLine.text && <span className="italic">(无内容)</span>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="w-full space-y-3 border-l-2 border-slate-100 pl-4">
                                                        {lines.length === 0 ? (
                                                            <p className="text-[14px] leading-7 text-slate-500">(无内容)</p>
                                                        ) : lines.map((line, lineIndex) => (
                                                            isDateHistoryDialogueLine(line) ? (
                                                                <p key={`${m.id}-${lineIndex}`} className="max-w-[86%] rounded-2xl rounded-tl-md bg-slate-50 px-3.5 py-2.5 text-[14px] leading-7 text-slate-600">
                                                                    {stripDateHistoryDialogueQuotes(line)}
                                                                </p>
                                                            ) : (
                                                                <p key={`${m.id}-${lineIndex}`} className="whitespace-pre-wrap text-[15px] leading-8 tracking-wide text-slate-700">
                                                                    {line}
                                                                </p>
                                                            )
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : historySessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <BookOpen size={48} className="opacity-50" />
                            <span className="text-xs">暂无见面记录</span>
                        </div>
                    ) : (
                        historySessions.map((session) => (
                            <div
                                role="button"
                                tabIndex={0}
                                key={session.id}
                                onClick={() => setSelectedHistorySessionId(session.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedHistorySessionId(session.id);
                                    }
                                }}
                                className="w-full text-left bg-white rounded-3xl shadow-sm border border-slate-100 p-4 active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-xs font-bold tracking-[0.12em] text-slate-500 uppercase">{session.date}</span>
                                            {session.isFavorite && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">收藏</span>}
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-slate-600">{session.excerpt}</p>
                                        <div className="mt-3 text-[11px] font-semibold text-slate-300">{session.msgs.length} 句 · 点开查看全文</div>
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-2">
                                        <span className="self-end rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{session.msgs.length} 句</span>
                                        <div className="flex gap-1.5">
                                            <button
                                                type="button"
                                                aria-label={session.isFavorite ? '取消收藏见面记录' : '收藏见面记录'}
                                                onClick={(e) => { e.stopPropagation(); toggleHistoryFavorite(session); }}
                                                className={`h-8 w-8 rounded-full flex items-center justify-center transition active:scale-95 ${session.isFavorite ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={session.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.28 4.62a.6.6 0 0 0 .45.33l5.1.74a.6.6 0 0 1 .33 1.02l-3.69 3.6a.6.6 0 0 0-.17.53l.87 5.08a.6.6 0 0 1-.87.63l-4.56-2.4a.6.6 0 0 0-.56 0l-4.56 2.4a.6.6 0 0 1-.87-.63l.87-5.08a.6.6 0 0 0-.17-.53l-3.69-3.6a.6.6 0 0 1 .33-1.02l5.1-.74a.6.6 0 0 0 .45-.33L11.48 3.5Z" /></svg>
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="删除见面记录"
                                                onClick={(e) => { e.stopPropagation(); setDeleteTargetSession(session); }}
                                                className="h-8 w-8 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center transition active:scale-95"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.35 9m-4.78 0L9.26 9m9.97-3.21c.34.05.68.1 1.02.16M19.23 5.79 18.16 19.67A2.25 2.25 0 0 1 15.92 21H8.08a2.25 2.25 0 0 1-2.24-2.33L4.77 5.79m14.46 0a48.1 48.1 0 0 0-3.48-.34m-12 .34c.34-.06.68-.11 1.02-.16m0 0a48.11 48.11 0 0 1 3.48-.34m7.5 0V4.88c0-1.18-.91-2.16-2.09-2.2a51.96 51.96 0 0 0-3.32 0 2.25 2.25 0 0 0-2.09 2.2v.57m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <Modal isOpen={!!deleteTargetSession} title="删除见面记录" onClose={() => setDeleteTargetSession(null)} footer={<div className="flex gap-3 w-full"><button onClick={() => setDeleteTargetSession(null)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">取消</button><button onClick={confirmDeleteHistorySession} className="flex-1 py-3 bg-rose-500 text-white rounded-2xl font-bold shadow-lg shadow-rose-100">删除</button></div>}>
                    <div className="py-4 text-center text-sm leading-relaxed text-slate-500">
                        确定删除这次见面吗？<br/>
                        <span className="mt-1 block text-xs text-rose-400">会删除这段见面里的全部文字记录，无法恢复。</span>
                    </div>
                </Modal>
            </div>
        );
    }

    if (mode === 'peek') {
        return (
            <div
                className="h-full w-full relative flex flex-col font-sans overflow-hidden bg-black"
                style={{
                    background: peekVisual?.background
                        ? '#050505'
                        : `radial-gradient(circle at 50% 28%, ${peekVisual?.mood.glow || 'rgba(255,255,255,0.24)'} 0%, transparent 32%), linear-gradient(160deg, ${peekVisual?.mood.from || '#111827'} 0%, ${peekVisual?.mood.via || '#1f2937'} 52%, ${peekVisual?.mood.to || '#f5b5c8'} 140%)`,
                }}
            >
                {peekVisual?.background ? (
                    <div className="absolute inset-0 bg-cover bg-center opacity-80 blur-[0.5px] scale-105" style={{ backgroundImage: `url(${peekVisual.background})` }} />
                ) : (
                    <>
                        <img src={char.avatar} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-3xl scale-125" />
                        <div className="absolute inset-0 bg-black/35" />
                    </>
                )}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.18)_54%,rgba(0,0,0,0.72)_100%)]" />

                <div className="relative z-10 px-7" style={{ paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}>
                    <div className="flex items-center justify-between">
                        <button onClick={handleBack} className="h-10 w-10 rounded-full bg-black/25 text-white/80 backdrop-blur-md border border-white/10 active:scale-95">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="mx-auto h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="text-right">
                            {shellChromeMode === 'virtual_city' && virtualWorld.context && (
                                <div className="text-[10px] font-mono tracking-[0.18em] text-white/40">
                                    {virtualWorld.context.locationLabel} · {virtualWorld.context.clock.timeLabel}
                                </div>
                            )}
                            {shellChromeMode === 'simulated_phone' && (
                                <div className="text-[10px] font-mono tracking-[0.24em] text-white/40">
                                    {virtualTime.day.toUpperCase()} {formatTime()}
                                </div>
                            )}
                            <div className="mt-1 text-xs tracking-[0.18em] text-white/60">DAILY MEET</div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-end px-7 pb-8">
                    <div className="absolute inset-x-0 bottom-[340px] top-24 flex items-end justify-center pointer-events-none">
                        {peekVisual?.hasDedicatedPortrait && peekVisual.portrait ? (
                            <img
                                src={peekVisual.portrait}
                                alt={char.name}
                                className="max-h-full max-w-[92%] object-contain drop-shadow-[0_24px_44px_rgba(0,0,0,0.52)] animate-fade-in"
                            />
                        ) : (
                            <div className="mb-2 flex flex-col items-center animate-fade-in">
                                <div className="relative h-36 w-36">
                                    <div className="absolute inset-0 rounded-full blur-2xl opacity-70" style={{ backgroundColor: peekVisual?.mood.glow || 'rgba(255,255,255,0.35)' }} />
                                    <div className="absolute inset-3 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl" />
                                    <img src={char.avatar} alt={char.name} className="absolute inset-6 h-24 w-24 rounded-full object-cover border border-white/30 shadow-xl" />
                                </div>
                                <div className="mt-4 rounded-full border border-white/15 bg-black/25 px-4 py-1.5 text-xs font-bold tracking-[0.18em] text-white/70 backdrop-blur-md">
                                    {char.name}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-full max-w-lg rounded-[28px] border border-white/12 bg-black/48 p-5 shadow-2xl backdrop-blur-xl animate-slide-up">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Presence</div>
                                <div className="mt-1 text-lg font-bold tracking-tight text-white">{char.name}</div>
                            </div>
                            {peekLoading && <div className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />}
                        </div>

                        <div className="space-y-3 py-2">
                            <p className="text-[13px] leading-relaxed tracking-wide text-white/70">
                                {peekLine}
                            </p>
                            {peekLoading && (
                                <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/25 to-white/10" />
                                    <div className="date-presence-flow absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                                </div>
                            )}
                        </div>

                        {!peekLoading && peekStatus.startsWith('(无法感知状态:') && (
                            <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                                当前开场生成失败，可重试，或先走过去进入空场。
                            </p>
                        )}

                        <div className="mt-5 flex gap-3">
                            <button
                                onClick={handleEnterSession}
                                disabled={peekLoading}
                                className="h-12 flex-1 rounded-full bg-white text-sm font-bold tracking-[0.16em] text-black shadow-[0_12px_30px_rgba(255,255,255,0.16)] transition-transform active:scale-95 disabled:opacity-45"
                            >
                                走过去
                            </button>
                            <button
                                onClick={() => startPeek(char)}
                                disabled={peekLoading}
                                className="h-12 w-12 rounded-full border border-white/15 bg-white/10 text-white/80 backdrop-blur-md active:scale-95 disabled:opacity-45"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                            </button>
                        </div>
                        <div className="mt-4 flex justify-center gap-5 text-[10px] font-medium tracking-[0.16em] text-white/40">
                            <button onClick={() => { setPreviousMode('peek'); setMode('settings'); }} className="hover:text-white/70 transition-colors">布置场景 / 设定立绘</button>
                            <button onClick={handleBack} className="hover:text-white/70 transition-colors">悄悄离开</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (mode === 'settings') {
        return <DateSettings char={char} onBack={() => setMode(previousMode)} />;
    }

    if (mode === 'session') {
        return (
            <>
                <DateSession 
                    char={char}
                    userProfile={userProfile}
                    messages={dateMessages}
                    peekStatus={peekStatus.startsWith('(无法感知状态:') ? '' : peekStatus}
                    initialState={char.savedDateState}
                    initialPresentationMode={resolveDefaultPresentation(char)}
                    sessionId={dateSessionIdRef.current || undefined}
                    relationshipScope={dateRelationshipScopeRef.current || undefined}
                    onSendMessage={handleSendMessage}
                    onReroll={handleReroll}
                    onExit={onExitSession}
                    onEditMessage={(msg) => { setEditTargetMsg(msg); setEditContent(msg.content); setIsEditModalOpen(true); }}
                    onDeleteMessage={handleDeleteMessage}
                    onDeleteMessages={handleDeleteMessages}
                    onUpdateMessage={handleUpdateMessage}
                    onSettings={() => {}} // Removed parent state change, DateSession handles it internally now
                />
                
                {/* Global Message Edit Modal for Session Mode */}
                <Modal isOpen={isEditModalOpen} title="编辑内容" onClose={() => setIsEditModalOpen(false)} footer={<><button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={confirmEditMessage} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">保存</button></>}>
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-32 bg-slate-100 rounded-2xl p-4 resize-none focus:ring-1 focus:ring-primary/20 transition-all text-sm leading-relaxed" />
                </Modal>
            </>
        );
    }

    return null;
};

export default DateApp;
