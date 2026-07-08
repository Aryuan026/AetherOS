import { useEffect, useRef } from 'react';
import { APIConfig, CharacterProfile, CompanionWakeupRule, GroupProfile, RealtimeConfig, Toast, UserProfile } from '../types';
import { DB } from '../utils/db';
import { ChatParser } from '../utils/chatParser';
import { ContextBuilder } from '../utils/context';
import { safeFetchJson } from '../utils/safeApi';
import { buildRealitySyncContext } from '../utils/realitySync';
import {
    COMPANION_WAKEUP_EVENT,
    DEFAULT_DIRECT_LINES,
    loadCompanionWakeupSettings,
    naturalWakeupEnabled,
    pickDirectWakeupLine,
    resolveCompanionWakeupMode,
    scheduleNextCompanionWakeup,
} from '../utils/companionWakeups';
import { pickVoiceDirectWakeupLine, selectWorldlineMemoryContext } from '../utils/memoryCore';

const HEARTBEAT_USER_COOLDOWN_MS = 90 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 1000;

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
- 一到两句话，像手机聊天里自然发出的短消息。
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
            continue;
        }

        const chunks = ChatParser.chunkText(part.content)
            .map(chunk => ChatParser.sanitize(chunk))
            .filter(chunk => ChatParser.hasDisplayContent(chunk));

        for (const chunk of chunks) {
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
    }

    return previewChunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
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

            if (effectiveRule.kind === 'heartbeat') {
                const lastUserAt = await latestRealUserMessageAt(effectiveRule.charId);
                if (lastUserAt && now - lastUserAt < HEARTBEAT_USER_COOLDOWN_MS) {
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
                        reason: 'user_cooldown',
                    });
                    return;
                }
            }

            let message = '';
            try {
                if (effectiveRule.mode === 'render') {
                    message = await renderWakeupWithAI(effectiveRule, char, currentUser, currentApi, currentGroups, currentRealtime);
                }
                if (!message && wakeupSettings.hiddenWordsEnabled) {
                    message = await pickVoiceDirectWakeupLine(effectiveRule, char, currentUser, now);
                }
                if (!message && wakeupSettings.hiddenWordsEnabled && directLines?.length) {
                    message = pickDirectWakeupLine({ ...effectiveRule, lines: directLines }, char, currentUser, now);
                }
                message = normalizeWakeupText(message);
                if (!message) throw new Error('empty wakeup message');

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
                    if (!rule.nextTriggerAt) {
                        await DB.saveCompanionWakeupRule({
                            ...rule,
                            nextTriggerAt: scheduleNextCompanionWakeup(rule, now),
                            updatedAt: now,
                        });
                    }
                }

                const dueRules = await DB.getDueCompanionWakeupRules(Date.now());
                for (const rule of dueRules) {
                    if (cancelled) return;
                    await processRule(rule);
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
