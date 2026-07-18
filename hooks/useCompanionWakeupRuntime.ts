import { useEffect, useRef } from 'react';
import { APIConfig, CharacterProfile, CompanionWakeupRule, GroupProfile, RealtimeConfig, Toast, UserProfile } from '../types';
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
import { pickVoiceDirectWakeupLine, selectWorldlineMemoryContext } from '../utils/memoryCore';
import { isDuplicateBuiltInCareRule, isObsoleteHeartbeatRule } from '../utils/companionWakeupRules';
import { relationshipScopeForProfile } from '../utils/messageContext';

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
): Promise<Set<string>> => {
    const recent = await DB.getRecentMessagesByCharId(charId, SENT_WAKEUP_HISTORY_LIMIT);
    return new Set(recent
        .filter(message => (
            message.role === 'assistant'
            && message.metadata?.source === 'companion_wakeup'
        ))
        .map(message => normalizeWakeupComparable(String(message.content || '')))
        .filter(Boolean));
};

const isRecentWakeupDuplicate = async (
    charId: string,
    message: string,
    now = Date.now(),
): Promise<boolean> => {
    const comparable = normalizeWakeupComparable(message);
    if (!comparable) return false;
    void now;
    return (await sentWakeupComparableSet(charId)).has(comparable);
};

const pickFreshDirectWakeupLine = async (
    rule: CompanionWakeupRule,
    char: CharacterProfile,
    userProfile: UserProfile,
    lines: string[] | undefined,
    now = Date.now(),
): Promise<string> => {
    const pool = (lines?.length ? lines : DEFAULT_DIRECT_LINES)
        .map(line => normalizeWakeupText(line))
        .map(line => line && line
            .replace(/\{\{char\}\}/g, char.name)
            .replace(/\{\{user\}\}/g, userProfile.name || '你'))
        .filter(Boolean);
    if (!pool.length) return '';

    const used = await sentWakeupComparableSet(char.id);
    const pickPool = pool.filter(line => !used.has(normalizeWakeupComparable(line)));
    if (!pickPool.length) return '';
    const index = hashText(`${rule.id}:${now}:${rule.title}`) % pickPool.length;
    return pickPool[index] || '';
};

const latestSentWakeupAt = async (charId: string): Promise<number | null> => {
    const recent = await DB.getRecentMessagesByCharId(charId, SENT_WAKEUP_HISTORY_LIMIT);
    const last = [...recent].reverse().find(message => (
        message.role === 'assistant'
        && message.metadata?.source === 'companion_wakeup'
    ));
    return last?.timestamp || null;
};

const latestRealUserMessageAt = async (charId: string): Promise<number | null> => {
    const recent = await DB.getRecentMessagesByCharId(charId, 80);
    const lastUser = [...recent].reverse().find(message => (
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

    const lastSentAt = await latestSentWakeupAt(rule.charId);
    if (lastSentAt) {
        const sendGapMs = getCompanionWakeupSendGapMs(rule.charId, lastSentAt);
        if (now - lastSentAt < sendGapMs) {
            eligibleAt = Math.max(eligibleAt, lastSentAt + sendGapMs);
            reason = 'send_gap';
        }
    }

    const lastUserAt = await latestRealUserMessageAt(rule.charId);
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
): Promise<string> => {
    if (!apiConfig.baseUrl) return '';

    const recent = await DB.getRecentMessagesByCharId(char.id, 80);
    const visibleRecent = recent
        .filter(message => !message.metadata?.hidden)
        .slice(-8)
        .map(message => `${message.role === 'user' ? userProfile.name : char.name}: ${message.content}`)
        .join('\n') || '暂无最近对话。';

    const worldlineMemory = await selectWorldlineMemoryContext({
        char,
        user: userProfile,
        mode: 'proactive_letter',
        surface: 'proactive_letter',
        relationshipScope: relationshipScopeForProfile(char.id, userProfile)!,
        currentMessages: recent,
        query: `${rule.title} ${rule.value || ''}`,
        budgetChars: 1000,
    });
    const realityContext = await buildRealitySyncContext(realtimeConfig, 'proactive_letter');
    const baseContext = `${ContextBuilder.buildCoreContext(char, userProfile)}${worldlineMemory.markdown ? `\n${worldlineMemory.markdown}\n` : ''}\n${realityContext}\n`;
    const now = new Date();
    const timeText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const systemPrompt = `${baseContext}

### 主动来信
现在是 ${timeText}。
你正在主动给 ${userProfile.name || '对方'} 发一条消息，不是回复刚刚的新消息。
触发意图：${rule.value || rule.title}
规则标题：${rule.title}

输出要求：
- 只输出真正要发送的消息正文。
- 一到两句话，像手机聊天里自然发出的短消息；最多只用一次换行。
- 最近对话只用于判断语气，不要接续或回答用户刚刚说的话。
- 如果是吃饭、睡觉这类照看，只轻轻提醒用户，不要连续追问，也不要展开成多轮对话。
- 遵守现实同频规则。不要为了天气或时间强行越过世界边界。
- 不要解释规则，不要写时间戳，不要写“系统提示”。`;

    const userPrompt = `最近对话片段：\n${visibleRecent}\n\n请按角色口吻写这次主动来信。`;
    const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.75,
            stream: false,
        }),
    });

    const _keepDepsVisible = groups.length;
    void _keepDepsVisible;
    return normalizeWakeupText(data.choices?.[0]?.message?.content || '');
};

const saveWakeupMessage = async (
    rule: CompanionWakeupRule,
    char: CharacterProfile,
    message: string,
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
                    wakeupRuleId: rule.id,
                    wakeupKind: rule.kind,
                    wakeupMode: rule.mode,
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
                    wakeupRuleId: rule.id,
                    wakeupKind: rule.kind,
                    wakeupMode: rule.mode,
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
            const { characters: currentCharacters, userProfile: currentUser, apiConfig: currentApi, groups: currentGroups, realtimeConfig: currentRealtime } = refs.current;
            const char = currentCharacters.find(item => item.id === rule.charId);
            if (!char) return;
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
            try {
                if (effectiveRule.mode === 'render') {
                    message = await renderWakeupWithAI(effectiveRule, char, currentUser, currentApi, currentGroups, currentRealtime);
                }
                const usedLines = await sentWakeupComparableSet(char.id);
                if (!message && wakeupSettings.hiddenWordsEnabled) {
                    message = await pickVoiceDirectWakeupLine(effectiveRule, char, currentUser, now, usedLines);
                }
                if (!message && wakeupSettings.hiddenWordsEnabled && directLines?.length) {
                    message = await pickFreshDirectWakeupLine(effectiveRule, char, currentUser, directLines, now);
                }
                message = normalizeWakeupText(message);
                if (!message) throw new Error('empty wakeup message');
                if (await isRecentWakeupDuplicate(char.id, message, now)) {
                    const alternative = directLines?.length
                        ? await pickFreshDirectWakeupLine(effectiveRule, char, currentUser, directLines, now + 1)
                        : '';
                    const normalizedAlternative = normalizeWakeupText(alternative);
                    if (normalizedAlternative && !(await isRecentWakeupDuplicate(char.id, normalizedAlternative, now))) {
                        message = normalizedAlternative;
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

                const preview = await saveWakeupMessage(effectiveRule, char, message);
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
