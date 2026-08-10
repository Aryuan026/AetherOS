import { useEffect, useRef } from 'react';
import { APIConfig, CharacterProfile, CompanionWakeupRule, GroupProfile, RealtimeConfig, Toast, UserProfile, MessageRelationshipScope } from '../types';
import { DB } from '../utils/db';
import { ChatParser } from '../utils/chatParser';
import { ContextBuilder } from '../utils/context';
import { safeFetchJson } from '../utils/safeApi';
import { buildRealitySyncContext } from '../utils/realitySync';
import {
    COMPANION_WAKEUP_DUPLICATE_DEFER_MS,
    COMPANION_WAKEUP_EVENT,
    COMPANION_WAKEUP_USER_COOLDOWN_MS,
    DEFAULT_DIRECT_LINES,
    getCompanionWakeupBatchStaggerMs,
    getCompanionWakeupSendGapMs,
    loadCompanionWakeupSettings,
    naturalWakeupEnabled,
    resolveCompanionWakeupMode,
    scheduleNextCompanionWakeup,
} from '../utils/companionWakeups';
import { pickVoiceDirectWakeupCandidate, selectWorldlineMemoryContext } from '../utils/memoryCore';
import { isDuplicateBuiltInCareRule, isObsoleteHeartbeatRule } from '../utils/companionWakeupRules';
import {
    filterCurrentStateMessages,
    messageMatchesRelationshipScope,
    normalizeMessageRelationshipScope,
    sameMessageRelationshipScope,
    strictRelationshipScopeForProfile,
} from '../utils/messageContext';
import {
    buildCompanionInteractionQualityProjection,
    buildWakeupCompanionMaterialRequest,
    prepareCompanionMaterialPrompt,
    recordPreparedCompanionMaterialPromptDelivery,
    type PreparedCompanionMaterialPrompt,
} from '../utils/companionMaterial';
import { buildCompanionWakeupModelMessages } from '../utils/companionWakeupModelMessages';
import { prepareCharacterBehaviorBoundaryProjection } from '../utils/characterBehaviorBoundary';

const TICK_INTERVAL_MS = 60 * 1000;
const SENT_WAKEUP_HISTORY_LIMIT = 500;
const MAX_WAKEUP_BUBBLES = 2;

interface RuntimeParams {
    isReady: boolean;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    groups: GroupProfile[];
    realtimeConfig: RealtimeConfig;
    addToast: (message: string, type: Toast['type']) => void;
}

const normalizeWakeupText = (raw: string): string => {
    let cleaned = raw || '';
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '');
    cleaned = cleaned.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
    cleaned = cleaned.replace(/^[\w一-龥]+:\s*/, '');
    cleaned = cleaned.replace(/\s*\[(?:聊天|通话|约会)\]\s*/g, '\n').trim();
    cleaned = ChatParser.sanitize(cleaned);
    return cleaned;
};

const normalizeWakeupComparable = (value: string): string => (
    ChatParser.sanitize(value || '')
        .replace(/[，。！？、,.!?；;：:\s"'“”‘’]/g, '')
        .toLowerCase()
        .trim()
);

const hashText = (value: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const sentWakeupComparableSet = async (
    charId: string,
    relationshipScope?: MessageRelationshipScope,
): Promise<Set<string>> => {
    const recent = await DB.getRecentMessagesByCharId(charId, SENT_WAKEUP_HISTORY_LIMIT);
    return new Set(recent
        .filter(message => (
            message.role === 'assistant'
            && message.metadata?.source === 'companion_wakeup'
            && (!relationshipScope || messageMatchesRelationshipScope(message, relationshipScope))
        ))
        .map(message => normalizeWakeupComparable(String(message.content || '')))
        .filter(Boolean));
};

const isRecentWakeupDuplicate = async (
    charId: string,
    message: string,
    now = Date.now(),
    relationshipScope?: MessageRelationshipScope,
): Promise<boolean> => {
    const comparable = normalizeWakeupComparable(message);
    if (!comparable) return false;
    void now;
    return (await sentWakeupComparableSet(charId, relationshipScope)).has(comparable);
};

const pickFreshDirectWakeupLine = async (
    rule: CompanionWakeupRule,
    char: CharacterProfile,
    userProfile: UserProfile,
    lines: string[] | undefined,
    now = Date.now(),
    relationshipScope?: MessageRelationshipScope,
): Promise<string> => {
    const pool = (lines?.length ? lines : DEFAULT_DIRECT_LINES)
        .map(line => normalizeWakeupText(line))
        .map(line => line && line
            .replace(/\{\{char\}\}/g, char.name)
            .replace(/\{\{user\}\}/g, userProfile.name || '你'))
        .filter(Boolean);
    if (!pool.length) return '';

    const used = await sentWakeupComparableSet(char.id, relationshipScope);
    const pickPool = pool.filter(line => !used.has(normalizeWakeupComparable(line)));
    if (!pickPool.length) return '';
    const index = hashText(`${rule.id}:${now}:${rule.title}`) % pickPool.length;
    return pickPool[index] || '';
};

const voiceDirectDeliveryHistory = async (
    charId: string,
    relationshipScope: MessageRelationshipScope,
): Promise<Map<string, number[]>> => {
    const history = new Map<string, number[]>();
    const logs = await DB.getCompanionWakeupLogsByCharId(charId);
    logs.forEach(log => {
        if (
            log.status !== 'sent'
            || !log.voiceLineId
            || !log.relationshipScope
            || !sameMessageRelationshipScope(log.relationshipScope, relationshipScope)
        ) return;
        const deliveredAt = history.get(log.voiceLineId) || [];
        deliveredAt.push(log.triggeredAt);
        history.set(log.voiceLineId, deliveredAt);
    });
    return history;
};

const latestSentWakeupAt = async (
    charId: string,
    relationshipScope: MessageRelationshipScope,
): Promise<number | null> => {
    const recent = await DB.getRecentMessagesByCharId(charId, SENT_WAKEUP_HISTORY_LIMIT);
    const last = [...recent].reverse().find(message => (
        messageMatchesRelationshipScope(message, relationshipScope)
        && message.role === 'assistant'
        && message.metadata?.source === 'companion_wakeup'
    ));
    return last?.timestamp || null;
};

const latestRealUserMessageAt = async (
    charId: string,
    relationshipScope: MessageRelationshipScope,
): Promise<number | null> => {
    const recent = await DB.getRecentMessagesByCharId(charId, 80);
    const lastUser = [...filterCurrentStateMessages(
        recent.filter(message => messageMatchesRelationshipScope(message, relationshipScope)),
    )].reverse().find(message => (
        message.role === 'user'
        && !message.metadata?.hidden
        && !message.metadata?.proactiveHint
        && message.metadata?.source !== 'companion_wakeup'
    ));
    return lastUser?.timestamp || null;
};

const nextEligibleWakeupAt = async (
    rule: CompanionWakeupRule,
    now = Date.now(),
): Promise<{ at: number; reason?: string }> => {
    let eligibleAt = now;
    let reason: string | undefined;
    const relationshipScope = normalizeMessageRelationshipScope(rule.relationshipScope);
    if (!relationshipScope) return { at: now + TICK_INTERVAL_MS, reason: 'relationship_scope_missing' };

    const lastSentAt = await latestSentWakeupAt(rule.charId, relationshipScope);
    if (lastSentAt) {
        const sendGapMs = getCompanionWakeupSendGapMs(rule.charId, lastSentAt);
        if (now - lastSentAt < sendGapMs) {
            eligibleAt = Math.max(eligibleAt, lastSentAt + sendGapMs);
            reason = 'send_gap';
        }
    }

    const lastUserAt = await latestRealUserMessageAt(rule.charId, relationshipScope);
    if (lastUserAt && now - lastUserAt < COMPANION_WAKEUP_USER_COOLDOWN_MS) {
        eligibleAt = Math.max(eligibleAt, lastUserAt + COMPANION_WAKEUP_USER_COOLDOWN_MS);
        reason = 'user_cooldown';
    }

    return { at: eligibleAt, reason };
};

const renderWakeupWithAI = async (
    rule: CompanionWakeupRule,
    char: CharacterProfile,
    userProfile: UserProfile,
    apiConfig: APIConfig,
    groups: GroupProfile[],
    realtimeConfig: RealtimeConfig,
    relationshipScope: MessageRelationshipScope,
    hiddenWordsEnabled: boolean,
): Promise<string> => {
    if (!apiConfig.baseUrl) return '';

    const requestTime = Date.now();
    const recent = (await DB.getRecentMessagesByCharId(char.id, 80))
        .filter(message => messageMatchesRelationshipScope(message, relationshipScope));
    const visibleMessages = filterCurrentStateMessages(recent)
        .filter(message => !message.metadata?.hidden)
        .slice(-8);
    const visibleRecent = visibleMessages
        .map(message => `${message.role === 'user' ? userProfile.name : char.name}: ${message.content}`)
        .join('\n') || '暂无最近对话。';
    const latestVisibleUser = [...visibleMessages].reverse().find(message => (
        message.role === 'user'
        && !message.metadata?.proactiveHint
        && message.metadata?.source !== 'companion_wakeup'
    ));

    const worldlineMemory = await selectWorldlineMemoryContext({
        char,
        user: userProfile,
        mode: 'proactive_letter',
        surface: 'proactive_letter',
        relationshipScope,
        currentMessages: recent,
        query: `${rule.title} ${rule.value || ''}`,
        budgetChars: 1000,
    });
    const realityContext = await buildRealitySyncContext(realtimeConfig, 'proactive_letter');
    let preparedCompanionMaterial: PreparedCompanionMaterialPrompt | null = null;
    try {
        preparedCompanionMaterial = await prepareCompanionMaterialPrompt(
          buildWakeupCompanionMaterialRequest({
            requestId: `wakeup-material:${rule.id}:${requestTime}`,
            scope: relationshipScope,
            ruleRefId: `wakeup-rule:${rule.id}:${requestTime}`,
            query: `${rule.title} ${rule.value || ''}`.trim(),
            occurredAt: requestTime,
            carePriority: rule.priority === 'care',
            ruleKind: rule.kind,
            hiddenWordsEnabled,
          }),
        );
    } catch (error) {
        console.warn('Companion material proactive context unavailable:', error);
    }
    const now = new Date();
    const timeText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const characterBehaviorBoundary = prepareCharacterBehaviorBoundaryProjection({
        requestId: `wakeup-behavior:${rule.id}:${requestTime}`,
        char,
        scope: relationshipScope,
        surface: 'proactive_letter',
        query: typeof latestVisibleUser?.content === 'string'
            ? latestVisibleUser.content
            : `${rule.title} ${rule.value || ''}`.trim(),
        previousQuery: `${rule.title} ${rule.value || ''}`.trim(),
        semanticSignals: rule.priority === 'care' ? ['care_needed'] : undefined,
        maxItems: 2,
        budgetChars: 420,
    });
    const messages = buildCompanionWakeupModelMessages({
        coreContext: ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(char, userProfile),
        worldlineContext: worldlineMemory.markdown,
        realityContext,
        companionMaterialContext: preparedCompanionMaterial?.markdown,
        characterBehaviorBoundaryContext: characterBehaviorBoundary?.markdown,
        interactionQualityContext: !characterBehaviorBoundary?.containsPlayerAuthoredInteractionPattern
          ? buildCompanionInteractionQualityProjection({
            charId: char.id,
            query: typeof latestVisibleUser?.content === 'string'
                ? latestVisibleUser.content
                : `${rule.title} ${rule.value || ''}`.trim(),
            surface: 'proactive_letter',
            mode: 'proactive_letter',
            purpose: 'proactive_intent',
            explicitSignals: rule.priority === 'care' ? ['care_needed'] : undefined,
          })?.markdown
          : undefined,
        timeText,
        userName: userProfile.name,
        ruleTitle: rule.title,
        ruleValue: rule.value,
        visibleRecent,
    });
    const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            messages,
            temperature: 0.75,
            stream: false,
        }),
    });

    const normalizedContent = normalizeWakeupText(data.choices?.[0]?.message?.content || '');
    if (preparedCompanionMaterial?.projection.fragments.length && normalizedContent) {
        try {
            await recordPreparedCompanionMaterialPromptDelivery({
                prepared: preparedCompanionMaterial,
                consumerRef: {
                    kind: 'prompt',
                    id: `companion-wakeup:${rule.id}:${requestTime}`,
                    revision: 'proactive-letter-v1',
                },
                occurredAt: Date.now(),
            });
        } catch (error) {
            console.warn('Companion material proactive receipt unavailable:', error);
        }
    }

    const _keepDepsVisible = groups.length;
    void _keepDepsVisible;
    return normalizedContent;
};

const saveWakeupMessage = async (
    rule: CompanionWakeupRule,
    char: CharacterProfile,
    message: string,
    relationshipScope: MessageRelationshipScope,
    voiceLineId?: string,
): Promise<string> => {
    const parts = ChatParser.splitResponse(message);
    const previewChunks: string[] = [];
    const baseTimestamp = Date.now();
    let offset = 0;

    for (const part of parts) {
        if (part.type === 'emoji') {
            const fallbackText = `发送了表情包：${part.content}`;
            await DB.saveMessage({
                charId: char.id,
                role: 'assistant',
                type: 'text',
                content: fallbackText,
                timestamp: baseTimestamp + offset,
                metadata: {
                    source: 'companion_wakeup',
                    temporalClass: 'live',
                    relationshipScope,
                    interactionId: `proactive:${relationshipScope.progressBundleId}:${relationshipScope.personaMaskId}:${char.id}`,
                    wakeupRuleId: rule.id,
                    wakeupKind: rule.kind,
                    wakeupMode: rule.mode,
                    wakeupVoiceLineId: voiceLineId,
                },
            });
            previewChunks.push(fallbackText);
            offset += 1;
            if (previewChunks.length >= MAX_WAKEUP_BUBBLES) break;
            continue;
        }

        const chunks = ChatParser.chunkText(part.content)
            .map(chunk => ChatParser.sanitize(chunk))
            .filter(chunk => ChatParser.hasDisplayContent(chunk));

        for (const chunk of chunks) {
            if (previewChunks.length >= MAX_WAKEUP_BUBBLES) break;
            await DB.saveMessage({
                charId: char.id,
                role: 'assistant',
                type: 'text',
                content: chunk,
                timestamp: baseTimestamp + offset,
                metadata: {
                    source: 'companion_wakeup',
                    temporalClass: 'live',
                    relationshipScope,
                    interactionId: `proactive:${relationshipScope.progressBundleId}:${relationshipScope.personaMaskId}:${char.id}`,
                    wakeupRuleId: rule.id,
                    wakeupKind: rule.kind,
                    wakeupMode: rule.mode,
                    wakeupVoiceLineId: voiceLineId,
                },
            });
            previewChunks.push(chunk);
            offset += 1;
        }
        if (previewChunks.length >= MAX_WAKEUP_BUBBLES) break;
    }

    return previewChunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
};

const wakeupPriorityRank = (rule: CompanionWakeupRule): number => {
    if (rule.priority === 'calendar') return 0;
    if (rule.priority === 'care') return 1;
    if (rule.kind === 'window') return 2;
    return 3;
};

const sortDueWakeupRules = (rules: CompanionWakeupRule[]): CompanionWakeupRule[] => (
    [...rules].sort((a, b) => (
        wakeupPriorityRank(a) - wakeupPriorityRank(b)
        || (a.nextTriggerAt || 0) - (b.nextTriggerAt || 0)
        || a.id.localeCompare(b.id)
    ))
);

const deferCrowdedWakeupRule = async (
    rule: CompanionWakeupRule,
    index: number,
    now = Date.now(),
): Promise<void> => {
    const deferredFrom = now + (index + 1) * getCompanionWakeupBatchStaggerMs(rule.charId, now, index);
    await DB.saveCompanionWakeupRule({
        ...rule,
        nextTriggerAt: scheduleNextCompanionWakeup(rule, deferredFrom),
        updatedAt: now,
    });
    await DB.saveCompanionWakeupLog({
        id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ruleId: rule.id,
        charId: rule.charId,
        triggeredAt: now,
        status: 'skipped',
        mode: rule.mode,
        kind: rule.kind,
        reason: 'batch_deferred',
    });
};

export const useCompanionWakeupRuntime = ({
    isReady,
    characters,
    userProfile,
    apiConfig,
    groups,
    realtimeConfig,
    addToast,
}: RuntimeParams) => {
    const runningRef = useRef(false);
    const refs = useRef({ characters, userProfile, apiConfig, groups, realtimeConfig, addToast });
    refs.current = { characters, userProfile, apiConfig, groups, realtimeConfig, addToast };

    useEffect(() => {
        if (!isReady) return;
        let cancelled = false;

        const processRule = async (rule: CompanionWakeupRule) => {
            const {
                characters: currentCharacters,
                userProfile: currentUser,
                apiConfig: currentApi,
                groups: currentGroups,
                realtimeConfig: currentRealtime,
            } = refs.current;
            const char = currentCharacters.find(item => item.id === rule.charId);
            if (!char) return;
            const ruleScope = normalizeMessageRelationshipScope(rule.relationshipScope);
            const activeScope = strictRelationshipScopeForProfile(rule.charId, currentUser);
            if (!ruleScope || !activeScope || !sameMessageRelationshipScope(ruleScope, activeScope)) {
                const now = Date.now();
                await DB.saveCompanionWakeupRule({
                    ...rule,
                    nextTriggerAt: scheduleNextCompanionWakeup(rule, now + TICK_INTERVAL_MS),
                    updatedAt: now,
                });
                await DB.saveCompanionWakeupLog({
                    id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ruleId: rule.id,
                    charId: rule.charId,
                    triggeredAt: now,
                    status: 'skipped',
                    mode: rule.mode,
                    kind: rule.kind,
                    reason: ruleScope ? 'relationship_scope_inactive' : 'relationship_scope_missing',
                });
                return;
            }
            const wakeupSettings = loadCompanionWakeupSettings();
            if (rule.kind === 'heartbeat' && !naturalWakeupEnabled(wakeupSettings)) {
                const now = Date.now();
                const nextTriggerAt = scheduleNextCompanionWakeup(rule, now + TICK_INTERVAL_MS);
                await DB.saveCompanionWakeupRule({ ...rule, nextTriggerAt, updatedAt: now });
                await DB.saveCompanionWakeupLog({
                    id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ruleId: rule.id,
                    charId: rule.charId,
                    triggeredAt: now,
                    status: 'skipped',
                    mode: rule.mode,
                    kind: rule.kind,
                    reason: 'natural_wakeup_disabled',
                });
                return;
            }
            const resolvedMode = resolveCompanionWakeupMode(wakeupSettings, rule);
            const directLines = rule.lines?.length
                ? rule.lines
                : rule.kind === 'heartbeat'
                    ? DEFAULT_DIRECT_LINES
                    : rule.value
                        ? [rule.value]
                        : undefined;
            const effectiveRule: CompanionWakeupRule = {
                ...rule,
                mode: resolvedMode,
                lines: resolvedMode === 'direct' ? directLines : undefined,
            };

            const now = Date.now();
            if (effectiveRule.kind === 'window' && effectiveRule.source === 'ai_calendar' && !wakeupSettings.aiCareWindowsEnabled) {
                const nextTriggerAt = scheduleNextCompanionWakeup(effectiveRule, now + TICK_INTERVAL_MS);
                await DB.saveCompanionWakeupRule({ ...effectiveRule, nextTriggerAt, updatedAt: now });
                await DB.saveCompanionWakeupLog({
                    id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ruleId: effectiveRule.id,
                    charId: effectiveRule.charId,
                    triggeredAt: now,
                    status: 'skipped',
                    mode: effectiveRule.mode,
                    kind: effectiveRule.kind,
                    reason: 'ai_care_disabled',
                });
                return;
            }

            const eligible = await nextEligibleWakeupAt(effectiveRule, now);
            if (eligible.at > now) {
                const nextTriggerAt = scheduleNextCompanionWakeup(effectiveRule, Math.max(now + TICK_INTERVAL_MS, eligible.at));
                await DB.saveCompanionWakeupRule({ ...effectiveRule, nextTriggerAt, updatedAt: now });
                await DB.saveCompanionWakeupLog({
                    id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ruleId: effectiveRule.id,
                    charId: effectiveRule.charId,
                    triggeredAt: now,
                    status: 'skipped',
                    mode: effectiveRule.mode,
                    kind: effectiveRule.kind,
                    reason: eligible.reason || 'not_eligible_yet',
                });
                return;
            }

            let message = '';
            let voiceLineId: string | undefined;
            try {
                if (effectiveRule.mode === 'render') {
                    try {
                        message = await renderWakeupWithAI(
                            effectiveRule,
                            char,
                            currentUser,
                            currentApi,
                            currentGroups,
                            currentRealtime,
                            ruleScope,
                            wakeupSettings.hiddenWordsEnabled,
                        );
                    } catch (error) {
                        console.warn('Companion wakeup render unavailable; trying local direct warehouse:', error);
                        message = '';
                    }
                }
                const usedLines = await sentWakeupComparableSet(char.id, ruleScope);
                if (!message && wakeupSettings.hiddenWordsEnabled) {
                    const picked = await pickVoiceDirectWakeupCandidate(
                        effectiveRule,
                        char,
                        currentUser,
                        now,
                        usedLines,
                        await voiceDirectDeliveryHistory(char.id, ruleScope),
                    );
                    message = picked?.text || '';
                    voiceLineId = picked?.line.id;
                }
                if (!message && wakeupSettings.hiddenWordsEnabled && directLines?.length) {
                    message = await pickFreshDirectWakeupLine(
                        effectiveRule,
                        char,
                        currentUser,
                        directLines,
                        now,
                        ruleScope,
                    );
                    voiceLineId = undefined;
                }
                message = normalizeWakeupText(message);
                if (!message) throw new Error('empty wakeup message');
                if (await isRecentWakeupDuplicate(char.id, message, now, ruleScope)) {
                    const alternative = directLines?.length
                        ? await pickFreshDirectWakeupLine(
                            effectiveRule,
                            char,
                            currentUser,
                            directLines,
                            now + 1,
                            ruleScope,
                        )
                        : '';
                    const normalizedAlternative = normalizeWakeupText(alternative);
                    if (
                        normalizedAlternative
                        && !(await isRecentWakeupDuplicate(char.id, normalizedAlternative, now, ruleScope))
                    ) {
                        message = normalizedAlternative;
                        voiceLineId = undefined;
                    } else {
                        const nextTriggerAt = scheduleNextCompanionWakeup(effectiveRule, now + COMPANION_WAKEUP_DUPLICATE_DEFER_MS);
                        await DB.saveCompanionWakeupRule({ ...effectiveRule, nextTriggerAt, updatedAt: now });
                        await DB.saveCompanionWakeupLog({
                            id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            ruleId: effectiveRule.id,
                            charId: effectiveRule.charId,
                            triggeredAt: now,
                            status: 'skipped',
                            mode: effectiveRule.mode,
                            kind: effectiveRule.kind,
                            reason: 'duplicate_recent_message',
                        });
                        return;
                    }
                }

                const preview = await saveWakeupMessage(
                    effectiveRule,
                    char,
                    message,
                    ruleScope,
                    voiceLineId,
                );
                const nextTriggerAt = effectiveRule.repeat === 'daily'
                    ? scheduleNextCompanionWakeup(effectiveRule, now + TICK_INTERVAL_MS)
                    : undefined;
                await DB.saveCompanionWakeupRule({
                    ...effectiveRule,
                    enabled: effectiveRule.repeat === 'daily' ? effectiveRule.enabled : false,
                    lastTriggeredAt: now,
                    nextTriggerAt,
                    updatedAt: now,
                });
                await DB.saveCompanionWakeupLog({
                    id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ruleId: effectiveRule.id,
                    charId: effectiveRule.charId,
                    triggeredAt: now,
                    status: 'sent',
                    mode: effectiveRule.mode,
                    kind: effectiveRule.kind,
                    message: preview || message.slice(0, 120),
                    relationshipScope: ruleScope,
                    voiceLineId,
                });
                window.dispatchEvent(new CustomEvent(COMPANION_WAKEUP_EVENT, {
                    detail: { charId: char.id, charName: char.name, body: preview || message.slice(0, 120), ruleId: effectiveRule.id },
                }));
                window.dispatchEvent(new CustomEvent('proactive-message-sent', {
                    detail: { charId: char.id, charName: char.name, body: preview || message.slice(0, 120), ruleId: effectiveRule.id },
                }));
            } catch (error: any) {
                const nextTriggerAt = scheduleNextCompanionWakeup(effectiveRule, now + TICK_INTERVAL_MS);
                await DB.saveCompanionWakeupRule({ ...effectiveRule, nextTriggerAt, updatedAt: now });
                await DB.saveCompanionWakeupLog({
                    id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    ruleId: effectiveRule.id,
                    charId: effectiveRule.charId,
                    triggeredAt: now,
                    status: 'error',
                    mode: effectiveRule.mode,
                    kind: effectiveRule.kind,
                    reason: error?.message || 'wakeup_failed',
                });
            }
        };

        const tick = async () => {
            if (cancelled || runningRef.current) return;
            runningRef.current = true;
            try {
                const now = Date.now();
                const allRules = await DB.getAllCompanionWakeupRules();
                for (const rule of allRules) {
                    if (cancelled) return;
                    if (!rule.enabled) continue;
                    const ruleChar = refs.current.characters.find(item => item.id === rule.charId);
                    if (ruleChar && isObsoleteHeartbeatRule(ruleChar, rule)) {
                        await DB.saveCompanionWakeupRule({ ...rule, enabled: false, updatedAt: now });
                        await DB.saveCompanionWakeupLog({
                            id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            ruleId: rule.id,
                            charId: rule.charId,
                            triggeredAt: now,
                            status: 'skipped',
                            mode: rule.mode,
                            kind: rule.kind,
                            reason: 'obsolete_heartbeat_duplicate',
                        });
                        continue;
                    }
                    if (ruleChar && isDuplicateBuiltInCareRule(ruleChar, rule, allRules)) {
                        await DB.saveCompanionWakeupRule({ ...rule, enabled: false, updatedAt: now });
                        await DB.saveCompanionWakeupLog({
                            id: `wake-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            ruleId: rule.id,
                            charId: rule.charId,
                            triggeredAt: now,
                            status: 'skipped',
                            mode: rule.mode,
                            kind: rule.kind,
                            reason: 'duplicate_care_window',
                        });
                        continue;
                    }
                    if (!rule.nextTriggerAt) {
                        await DB.saveCompanionWakeupRule({
                            ...rule,
                            nextTriggerAt: scheduleNextCompanionWakeup(rule, now),
                            updatedAt: now,
                        });
                    }
                }

                const dueRules = sortDueWakeupRules(await DB.getDueCompanionWakeupRules(Date.now()));
                const dueByChar = new Map<string, CompanionWakeupRule[]>();
                dueRules.forEach(rule => {
                    const group = dueByChar.get(rule.charId) || [];
                    group.push(rule);
                    dueByChar.set(rule.charId, group);
                });

                for (const group of dueByChar.values()) {
                    if (cancelled) return;
                    const [first, ...rest] = group;
                    if (!first) continue;
                    for (let index = 0; index < rest.length; index += 1) {
                        await deferCrowdedWakeupRule(rest[index], index, now);
                    }
                    await processRule(first);
                }
            } finally {
                runningRef.current = false;
            }
        };

        const interval = window.setInterval(() => void tick(), TICK_INTERVAL_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') void tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        void tick();

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isReady]);
};
