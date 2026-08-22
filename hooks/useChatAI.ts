
import { useRef, useState } from 'react';
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile, RealtimeConfig, CharacterBuff, ChatReplyMode, APIConfig } from '../types';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { ChatParser } from '../utils/chatParser';
import { safeFetchJson, safeResponseJson } from '../utils/safeApi';
import { KeepAlive } from '../utils/keepAlive';
import { ProactiveChat } from '../utils/proactiveChat';
import { ContextBuilder } from '../utils/context';
import { loadMemoryDMSettings, runMemoryDMPass, selectWorldlineMemoryContext } from '../utils/memoryCore';
import {
    filterCurrentStateMessages,
    isHistoricalContextMessage,
    messageMatchesRelationshipScope,
    relationshipScopeFromMessage,
    selectEmotionEvaluationMessages,
    strictRelationshipScopeForProfile,
} from '../utils/messageContext';
import { createAssistantResponseId, splitChatReplyText } from '../utils/chatReplyMode';
import {
    buildCompanionInteractionQualityProjection,
    buildChatCompanionMaterialRequest,
    prepareCompanionMaterialPrompt,
    recordPreparedCompanionMaterialPromptDelivery,
    type PreparedCompanionMaterialPrompt,
} from '../utils/companionMaterial';
import { prepareCharacterBehaviorBoundaryProjection } from '../utils/characterBehaviorBoundary';
import { prepareChatConversationContinuity } from '../utils/conversationContinuity';
import type { CharacterBehaviorBoundaryRule } from '../domain/characterBehaviorBoundary';
import type { WorldbookProjectionConsumerRef } from '../domain/worldbook';
import {
    buildWorldbookRecallQuery,
    prepareWorldbookRuntimeProjection,
    recordWorldbookRuntimeProjectionDelivery,
    type PreparedWorldbookRuntimeProjection,
} from '../utils/worldbookRuntime';
import { indexedDbWorldbookPersistence } from '../utils/worldbookPersistence';
import {
    advanceCharacterLiveState,
    activeCharacterBuffs,
    countVisibleGraphemes,
    createCharacterLivePresence,
    createCharacterMoodBuff,
    shouldEvaluateCharacterLiveState,
} from '../utils/characterLiveState';

// ─── 情绪评估（系统主持 AI，fire & forget）───

export function buildEmotionEvalPrompt(char: CharacterProfile, userProfile: UserProfile, msgs: Message[]): string {
    const roleContext = ContextBuilder.buildRoleSettingsContext(char);
    const currentBuffs = activeCharacterBuffs(char.activeBuffs).map(buff => ({
        name: buff.name,
        label: buff.label,
        intensity: buff.intensity,
        stateKey: buff.stateKey,
        remainingTurns: buff.remainingTurns,
        expiresAt: buff.expiresAt,
    }));

    const recentLines = selectEmotionEvaluationMessages(msgs).slice(-24).map(m => {
        const role = m.role === 'user' ? '用户' : (m.role === 'assistant' ? char.name : '系统');
        const text = typeof m.content === 'string' ? m.content.slice(0, 240) : '';
        return `[${role}]: ${text}`;
    }).join('\n');

    const buffStr = currentBuffs.length > 0
        ? JSON.stringify(currentBuffs)
        : '[]';

    return `你是 AetherOS 的系统主持分析器。请从角色「${char.name}」最近的真实对话中维护短期心情与近况。

## 角色基线
${roleContext}

## 当前短期心情
${buffStr}

## 最近真实对话
${recentLines}

## 判定边界
- 只维护最近发生、会自然衰减的状态。旧日导入、角色设定和举例不是当前事实。
- 日常微小波动不必生成；最多 2 个心情。已有状态能演化就不要换标签。
- 心情 label 最多 8 个可见字符；近况 text 最多 14 个可见字符。
- 近况只能是对话有证据支持的短期活动，如“刚结束手术”“在回家路上”。不要虚构重大事件。
- injection 只写 1–2 句宽松的表演底色，最多 160 字；鼓励自然发挥，不规定具体台词、剧情结果、关系强度或必须采取的动作。
- 不要把角色写成 AI，不要输出工具策略，不要复述角色卡。
- 若无显著变化，changed=false。presence 缺省表示保持；presence=null 表示清除。

只输出合法 JSON：
{
  "changed": true,
  "buffs": [
    {
      "name": "quiet_relief",
      "stateKey": "quiet_relief",
      "label": "悄悄松口气",
      "intensity": 2,
      "emoji": "🌙",
      "ttlMinutes": 240,
      "remainingTurns": 4,
      "description": "刚确认对方平安，紧绷感正在慢慢退去。"
    }
  ],
  "presence": {
    "text": "刚收好手术记录",
    "stateKey": "post_operation_notes",
    "ttlMinutes": 90,
    "remainingTurns": 3
  },
  "injection": "紧绷感刚刚松开一些，关心可以自然透出来，但仍保持角色原本的判断和表达节奏。"
}`;
}

export async function evaluateEmotionBackground(
    charData: CharacterProfile,
    userProfile: UserProfile,
    msgs: Message[],
    api: { baseUrl: string; apiKey: string; model: string },
    source: 'system-director' | 'dialogue-ai' = 'system-director',
): Promise<void> {
    try {
        const currentStateMessages = selectEmotionEvaluationMessages(msgs);
        if (currentStateMessages.length === 0) return;
        const prompt = buildEmotionEvalPrompt(charData, userProfile, currentStateMessages);

        const baseUrl = api.baseUrl.replace(/\/+$/, '');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.apiKey || 'sk-none'}`
        };

        const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: api.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.85,
                stream: false
            })
        });

        const raw = data.choices?.[0]?.message?.content || '';
        // Extract JSON (may be wrapped in ```json blocks)
        const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
        if (!jsonMatch) {
            console.warn('🎭 [Emotion] Could not parse JSON from response:', raw.slice(0, 200));
            return;
        }

        // Repair: escape literal newlines/tabs inside JSON string values
        const repairJson = (s: string): string => {
            let inStr = false, esc = false, out = '';
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (esc) { out += ch; esc = false; continue; }
                if (ch === '\\') { out += ch; esc = true; continue; }
                if (ch === '"') { inStr = !inStr; out += ch; continue; }
                if (inStr && ch === '\n') { out += '\\n'; continue; }
                if (inStr && ch === '\r') { out += '\\r'; continue; }
                if (inStr && ch === '\t') { out += '\\t'; continue; }
                out += ch;
            }
            return out;
        };

        let jsonStr = jsonMatch[1].trim();
        type EmotionEvaluationResult = {
            changed: boolean;
            buffs?: Array<Partial<CharacterBuff> & {
                ttlMinutes?: number;
                remainingTurns?: number;
            }>;
            presence?: {
                text?: string;
                stateKey?: string;
                ttlMinutes?: number;
                remainingTurns?: number;
            } | null;
            injection?: string;
        };
        let result: EmotionEvaluationResult;
        try {
            result = JSON.parse(jsonStr);
        } catch {
            try {
                result = JSON.parse(repairJson(jsonStr));
            } catch (e2: any) {
                console.warn('🎭 [Emotion] JSON parse failed even after repair:', e2.message, jsonStr.slice(0, 300));
                return;
            }
        }

        const _result = result;
        const now = Date.now();
        const latest = (await DB.getAllCharacters()).find(item => item.id === charData.id) || charData;
        const currentBuffs = latest.activeBuffs || [];
        const parsedBuffs = Array.isArray(_result.buffs)
            ? _result.buffs.slice(0, 2)
                .map((buff, index) => createCharacterMoodBuff(buff, {
                    now,
                    source,
                    index,
                    previous: currentBuffs.find(current => (
                        current.stateKey === buff.stateKey || current.name === buff.name
                    )),
                }))
                .filter((buff): buff is CharacterBuff => !!buff)
            : undefined;
        const sanitizedBuffs = Array.isArray(_result.buffs)
            ? (_result.buffs.length === 0 || parsedBuffs?.length
                ? parsedBuffs || []
                : currentBuffs)
            : currentBuffs;
        const chatPresenceStatus = _result.presence === null
            ? undefined
            : _result.presence
                ? createCharacterLivePresence({
                    text: _result.presence.text || '',
                    stateKey: _result.presence.stateKey,
                    ttlMinutes: _result.presence.ttlMinutes,
                    remainingTurns: _result.presence.remainingTurns,
                }, {
                    now,
                    source,
                    previous: latest.chatPresenceStatus,
                }) || latest.chatPresenceStatus
                : latest.chatPresenceStatus;
        const rawInjection = typeof _result.injection === 'string' ? _result.injection.trim() : '';
        const injection = rawInjection && countVisibleGraphemes(rawInjection) <= 160
            ? rawInjection
            : '';
        const lastEvaluatedMessage = selectEmotionEvaluationMessages(msgs).slice(-1)[0];

        const updated: CharacterProfile = {
            ...latest,
            ...(_result.changed
                ? {
                    activeBuffs: sanitizedBuffs,
                    chatPresenceStatus,
                    buffInjection: sanitizedBuffs.length > 0
                        ? (Array.isArray(_result.buffs) ? injection : latest.buffInjection || '')
                        : '',
                }
                : {}),
            chatLiveStateEvaluation: {
                lastEvaluatedAt: now,
                lastEvaluatedMessageId: lastEvaluatedMessage?.id,
                lastEvaluatedMessageTimestamp: lastEvaluatedMessage?.timestamp,
            },
        };
        await DB.saveCharacter(updated);

        window.dispatchEvent(new CustomEvent('emotion-updated', {
            detail: {
                charId: charData.id,
                buffs: updated.activeBuffs,
                chatPresenceStatus: updated.chatPresenceStatus,
                chatLiveStateEvaluation: updated.chatLiveStateEvaluation,
                buffInjection: updated.buffInjection,
            }
        }));
        console.log(
            _result.changed ? '🎭 [Emotion] Updated live state:' : '🎭 [Emotion] No significant change:',
            (updated.activeBuffs || []).map((b: CharacterBuff) => b.label).join(', ') || 'none',
        );
    } catch (e: any) {
        console.warn('🎭 [Emotion] Evaluation failed:', e.message);
    }
}

const normalizeAiContent = (raw: string): string => {
    let cleaned = raw || '';
    // Strip hidden chain-of-thought blocks such as <think>...</think>
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
    cleaned = cleaned.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
    cleaned = cleaned.replace(/^[\w一-龥]+:\s*/, '');
    // Strip source tags [聊天]/[通话]/[约会] leaked from history context — replace with newline to preserve intended splits
    cleaned = cleaned.replace(/\s*\[(?:聊天|通话|约会)\]\s*/g, '\n');
    cleaned = cleaned.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
    return cleaned;
};

interface UseChatAIProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: any;
    groups: GroupProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    addToast: (msg: string, type: 'info'|'success'|'error') => void;
    setMessages: (msgs: Message[]) => void; // Callback to update UI messages
    realtimeConfig?: RealtimeConfig; // 新增：实时配置
    translationConfig?: { enabled: boolean; sourceLang: string; targetLang: string };
    updateCharacter?: (id: string, updates: Partial<CharacterProfile>) => void;
    chatReplyMode: ChatReplyMode;
    emotionApiConfig?: APIConfig;
    emotionApiErrorMessage?: string;
    emotionApiSource?: 'system-director' | 'dialogue-ai';
}

export const useChatAI = ({
    char,
    userProfile,
    apiConfig,
    groups,
    emojis,
    categories,
    addToast,
    setMessages,
    realtimeConfig,  // 新增
    translationConfig,
    updateCharacter,
    chatReplyMode,
    emotionApiConfig,
    emotionApiErrorMessage,
    emotionApiSource = 'system-director',
}: UseChatAIProps) => {
    
    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [emotionStatus, setEmotionStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [tokenBreakdown, setTokenBreakdown] = useState<{ prompt: number; completion: number; total: number; msgCount: number; pass: string } | null>(null);
    const lastEmotionRouteErrorRef = useRef('');

    const updateTokenUsage = (data: any, msgCount: number, pass: string) => {
        if (data.usage?.total_tokens) {
            setLastTokenUsage(data.usage.total_tokens);
            const breakdown = {
                prompt: data.usage.prompt_tokens || 0,
                completion: data.usage.completion_tokens || 0,
                total: data.usage.total_tokens,
                msgCount,
                pass
            };
            setTokenBreakdown(breakdown);
            console.log(`🔢 [Token Usage] pass=${pass} | prompt=${breakdown.prompt} completion=${breakdown.completion} total=${breakdown.total} | msgs_in_context=${msgCount}`);
        }
    };

    const triggerAI = async (
        currentMsgs: Message[],
        overrideApiConfig?: { baseUrl: string; apiKey: string; model: string },
        runtimeOptions?: {
            transientBehaviorBoundaryRules?: readonly CharacterBehaviorBoundaryRule[];
            /** Local selector hint only; it is never rendered into the prompt. */
            transientBehaviorBoundaryQuery?: string;
        },
    ) => {
        if (isTyping || !char) return;
        const effectiveApi = overrideApiConfig || apiConfig;
        if (!effectiveApi.baseUrl) { alert("请先在设置中配置 API URL"); return; }

        setIsTyping(true);
        setRecallStatus('');

        const importedHistoryMessages = currentMsgs.filter(isHistoricalContextMessage);
        const initiatingUserMessage = [...filterCurrentStateMessages(currentMsgs)]
            .reverse()
            .find(message => message.role === 'user' && !message.metadata?.proactiveHint);
        const initiatingRelationshipScope = initiatingUserMessage
            ? relationshipScopeFromMessage(initiatingUserMessage)
            : undefined;
        const selectorRelationshipScope = initiatingRelationshipScope
            || strictRelationshipScopeForProfile(char.id, userProfile);
        const readScopedAllMessages = async (): Promise<Message[]> => {
            if (!selectorRelationshipScope) return [];
            const allMessages = await DB.getMessagesByCharId(char.id);
            return allMessages
                .filter(message => messageMatchesRelationshipScope(message, selectorRelationshipScope))
                .filter(message => message.metadata?.hidden !== true)
                .filter(message => message.metadata?.proactiveHint !== true)
                .filter(message => message.metadata?.source !== 'date' && message.metadata?.source !== 'call')
                .filter(message => !char.hideBeforeMessageId || message.id >= char.hideBeforeMessageId);
        };
        const readScopedRecentMessages = async (limit: number): Promise<Message[]> => {
            return (await readScopedAllMessages()).slice(-limit);
        };
        const assistantResponseId = createAssistantResponseId();
        const historyTailBatchIds = [...new Set(importedHistoryMessages
            .map(message => message.metadata?.historyBatchId)
            .filter((batchId): batchId is string => typeof batchId === 'string' && batchId.length > 0))];
        const saveAiMessage = (
            message: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number },
        ): Promise<number> => DB.saveMessage({
            ...message,
            metadata: {
                ...(message.metadata || {}),
                temporalClass: 'live',
                relationshipScope: initiatingRelationshipScope || null,
                historyTailContinuation: importedHistoryMessages.length > 0 || undefined,
                historyTailBatchIds: historyTailBatchIds.length > 0 ? historyTailBatchIds : undefined,
                assistantResponseId,
            },
        });

        // Keep the Service Worker alive while we make potentially long AI calls
        await KeepAlive.start();
        let aiCompleted = false;

        try {
            const baseUrl = effectiveApi.baseUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${effectiveApi.apiKey || 'sk-none'}` };

            // 1. Build System Prompt (包含实时世界信息)
            const lastUserMessage = [...filterCurrentStateMessages(currentMsgs)].reverse().find(m => m.role === 'user' && !m.metadata?.proactiveHint);
            const liveUserMessages = filterCurrentStateMessages(currentMsgs)
                .filter(message => message.role === 'user' && !message.metadata?.proactiveHint);
            const previousUserMessage = liveUserMessages.length > 1
                ? liveUserMessages[liveUserMessages.length - 2]
                : undefined;
            const worldlineMemory = selectorRelationshipScope ? await selectWorldlineMemoryContext({
                char,
                user: userProfile,
                mode: 'remote_chat',
                surface: 'chat',
                relationshipScope: selectorRelationshipScope,
                currentMessages: currentMsgs,
                query: typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '',
                budgetChars: 1200,
            }) : { markdown: '' };
            const worldbookConsumer: WorldbookProjectionConsumerRef = {
                kind: 'chat',
                id: `chat-prompt:${assistantResponseId}`,
                revision: 'worldbook-chat-v1',
            };
            let preparedWorldbookRuntime: PreparedWorldbookRuntimeProjection | null = null;
            if (initiatingRelationshipScope && lastUserMessage) {
                try {
                    const worldbookRecallQuery = buildWorldbookRecallQuery({
                        query: typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
                        previousQuery: typeof previousUserMessage?.content === 'string'
                            ? previousUserMessage.content
                            : undefined,
                    });
                    preparedWorldbookRuntime = prepareWorldbookRuntimeProjection({
                        requestId: `chat-worldbook:${assistantResponseId}`,
                        library: await indexedDbWorldbookPersistence.listEntries(),
                        character: char,
                        scope: initiatingRelationshipScope,
                        consumer: worldbookConsumer,
                        knowledgeSubjects: [{ kind: 'character', id: char.id }],
                        query: worldbookRecallQuery,
                        budget: {
                            maxTotalChars: 700,
                            maxEntries: 1,
                            maxEntryChars: 560,
                        },
                    });
                } catch (error) {
                    console.warn('[chat] Worldbook projection unavailable', error);
                }
            }
            let preparedCompanionMaterial: PreparedCompanionMaterialPrompt | null = null;
            if (selectorRelationshipScope && lastUserMessage) {
                try {
                    preparedCompanionMaterial = await prepareCompanionMaterialPrompt(
                      buildChatCompanionMaterialRequest({
                        requestId: `chat-material:${assistantResponseId}`,
                        scope: selectorRelationshipScope,
                        refId: `message:${lastUserMessage.id}`,
                        query: typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
                        previousQuery: typeof previousUserMessage?.content === 'string'
                            ? previousUserMessage.content
                            : undefined,
                        occurredAt: lastUserMessage.timestamp,
                        // A legacy message with no frozen relationship scope
                        // cannot borrow the currently active UI relationship as
                        // evidence.
                        allowGrounding: Boolean(initiatingRelationshipScope),
                      }),
                    );
                } catch (error) {
                    console.warn('Companion material context unavailable:', error);
                }
            }
            const behaviorBoundaryChar = runtimeOptions?.transientBehaviorBoundaryRules?.length
                ? {
                    ...char,
                    behaviorBoundaryRules: [
                        ...(char.behaviorBoundaryRules || []),
                        ...runtimeOptions.transientBehaviorBoundaryRules,
                    ],
                }
                : char;
            const characterBehaviorBoundary = selectorRelationshipScope && lastUserMessage
                ? prepareCharacterBehaviorBoundaryProjection({
                    requestId: `chat-behavior-boundary:${assistantResponseId}`,
                    char: behaviorBoundaryChar,
                    scope: selectorRelationshipScope,
                    surface: 'chat',
                    query: [
                        typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
                        runtimeOptions?.transientBehaviorBoundaryQuery || '',
                    ].filter(Boolean).join('\n'),
                    previousQuery: typeof previousUserMessage?.content === 'string'
                        ? previousUserMessage.content
                        : undefined,
                    maxItems: 2,
                    budgetChars: 520,
                })
                : null;
            const interactionQuality = lastUserMessage
                && !characterBehaviorBoundary?.containsPlayerAuthoredInteractionPattern
                ? buildCompanionInteractionQualityProjection({
                    charId: char.id,
                    query: typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
                    previousQuery: typeof previousUserMessage?.content === 'string'
                        ? previousUserMessage.content
                        : undefined,
                    occurredAt: lastUserMessage.timestamp,
                    previousOccurredAt: previousUserMessage?.timestamp,
                    surface: 'chat',
                    mode: 'remote_chat',
                    purpose: 'stable_context',
                })
                : null;
            let systemPrompt = await ChatPrompts.buildSystemPrompt(
                char,
                userProfile,
                groups,
                emojis,
                categories,
                currentMsgs,
                realtimeConfig,
                worldlineMemory.markdown,
                {
                    replyMode: chatReplyMode,
                    delivery: 'interactive',
                    worldbookContext: preparedWorldbookRuntime?.markdown,
                    companionMaterialContext: preparedCompanionMaterial?.markdown,
                    characterBehaviorBoundaryContext: characterBehaviorBoundary?.markdown,
                    interactionQualityContext: interactionQuality?.markdown,
                },
            );

            // 1.5 Inject bilingual output instruction when translation is enabled
            const bilingualActive = translationConfig?.enabled && translationConfig.sourceLang && translationConfig.targetLang;
            if (bilingualActive) {
                systemPrompt += `\n\n[CRITICAL: 双语输出模式 - 必须严格遵守]
你的每句话都必须用以下XML标签格式输出双语内容：
<翻译>
<原文>${translationConfig.sourceLang}内容</原文>
<译文>${translationConfig.targetLang}内容</译文>
</翻译>

规则：
- 每句话单独包裹一个<翻译>标签
- 多句话就输出多个<翻译>标签，一句一个
- <翻译>标签外不要写任何文字
- 表情包命令 [[SEND_EMOJI: ...]] 放在所有<翻译>标签外面

示例（${translationConfig.sourceLang}→${translationConfig.targetLang}）：
<翻译>
<原文>こんにちは！</原文>
<译文>你好！</译文>
</翻译>
<翻译>
<原文>今日は何する？</原文>
<译文>今天做什么？</译文>
</翻译>`;
            }

            // 2. Build Message History. The player-facing message limit remains
            // the latest point at which Chat must compact; the runtime also
            // compacts early when the estimated input budget is reached.
            const limit = char.contextLimit || 500;
            const importedHistoryTail = currentMsgs.filter(message => (
                message.metadata?.source === 'history_import_tail'
            ));
            const providedLiveMessages = currentMsgs.filter(message => (
                message.metadata?.source !== 'history_import_tail'
                && message.metadata?.hidden !== true
                && message.metadata?.proactiveHint !== true
                && message.metadata?.source !== 'date'
                && message.metadata?.source !== 'call'
                && (!char.hideBeforeMessageId || message.id >= char.hideBeforeMessageId)
            ));
            let deliveredLiveMessages = providedLiveMessages.slice(-limit);
            if (selectorRelationshipScope && char.id) {
                try {
                    const fullHistory = await readScopedAllMessages();
                    const continuity = await prepareChatConversationContinuity({
                        scope: selectorRelationshipScope,
                        messages: fullHistory,
                        promptText: systemPrompt,
                        messageLimit: limit,
                        apiConfig: effectiveApi,
                        userName: userProfile.name,
                        characterName: char.name,
                    });
                    deliveredLiveMessages = continuity.recentMessages;
                    if (continuity.markdown) {
                        systemPrompt += `\n\n${continuity.markdown}\n`;
                    }
                    console.log(
                        `🧶 [Chat Continuity] trigger=${continuity.diagnostic.trigger}`
                        + ` estimator=${continuity.diagnostic.estimatorId}`
                        + ` estimated_input_tokens=${continuity.diagnostic.estimatedInputTokens}`
                        + ` raw_msgs=${continuity.diagnostic.rawMessageCount}`
                        + ` delivered_msgs=${continuity.diagnostic.deliveredMessageCount}`
                        + ` summary_passes=${continuity.diagnostic.summaryPasses}`
                        + ` fallback=${continuity.diagnostic.fallback}`,
                    );
                } catch (e) {
                    console.error('Failed to prepare Chat continuity, using the current bounded tail:', e);
                }
            }
            const contextMsgs = [...importedHistoryTail, ...deliveredLiveMessages];
            const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(
                contextMsgs,
                Math.max(1, contextMsgs.length),
                char,
                userProfile,
                emojis,
            );

            // 2.5 Build the exact provider-facing payload through the same
            // pure builder used by the model-context audit.
            const {
                cleanedApiMessages,
                messages: fullMessages,
            } = ChatPrompts.buildModelFacingMessages({
                systemPrompt,
                apiMessages,
                bilingualActive: Boolean(bilingualActive),
            });

            // Debug: Log context composition
            const systemPromptLength = systemPrompt.length;
            const historyMsgCount = cleanedApiMessages.length;
            const historyTotalChars = cleanedApiMessages.reduce((sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
            console.log(`📊 [Context Debug] system_prompt_chars=${systemPromptLength} | history_msgs=${historyMsgCount} | history_chars=${historyTotalChars} | total_msgs_in_array=${fullMessages.length} | compact_after_messages=${limit}`);

            // 3. API Call (safe parsing: prevents "Unexpected token <" on HTML error pages)
            let data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify({ model: effectiveApi.model, messages: fullMessages, temperature: 0.85, stream: false })
            });
            updateTokenUsage(data, historyMsgCount, 'initial');

            // 4. Initial Cleanup
            let aiContent = data.choices?.[0]?.message?.content || '';
            aiContent = normalizeAiContent(aiContent);

            // 5. Handle Recall (Loop if needed)
            const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
            if (recallMatch) {
                const year = recallMatch[1];
                const month = recallMatch[2];
                const targetMonth = `${year}-${month.padStart(2, '0')}`;

                // Check if this month is already in activeMemoryMonths (already in system prompt)
                const alreadyActive = char.activeMemoryMonths?.includes(targetMonth);

                if (alreadyActive) {
                    // Memory already present in system prompt via buildCoreContext, skip redundant API call
                    console.log(`♻️ [Recall] ${targetMonth} already in activeMemoryMonths, skipping duplicate recall`);
                    aiContent = aiContent.replace(/\[\[RECALL:\s*\d{4}[-/年]\d{1,2}\]\]/g, '').trim();
                } else {
                    setRecallStatus(`正在调阅 ${year}年${month}月 的详细档案...`);

                    // Helper to fetch detailed logs (duplicated logic from Chat.tsx, moved inside hook context)
                    const getDetailedLogs = (y: string, m: string) => {
                        if (!char.memories) return null;
                        const target = `${y}-${m.padStart(2, '0')}`;
                        const logs = char.memories.filter(mem => {
                            return mem.date.includes(target) || mem.date.includes(`${y}年${parseInt(m)}月`);
                        });
                        if (logs.length === 0) return null;
                        return logs.map(mem => `[${mem.date}] (${mem.mood || 'normal'}): ${mem.summary}`).join('\n');
                    };

                    const detailedLogs = getDetailedLogs(year, month);

                    if (detailedLogs) {
                        const recallMessages = [...fullMessages, { role: 'user', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                        try {
                            data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                method: 'POST', headers,
                                body: JSON.stringify({ model: effectiveApi.model, messages: recallMessages, temperature: 0.8, stream: false })
                            });
                            updateTokenUsage(data, historyMsgCount, 'recall');
                            aiContent = data.choices?.[0]?.message?.content || '';
                            // Re-clean
                            aiContent = normalizeAiContent(aiContent);
                            addToast(`已调用 ${year}-${month} 详细记忆`, 'info');
                        } catch (recallErr: any) {
                            console.error('Recall API failed:', recallErr.message);
                        }
                    }
                }
            }
            setRecallStatus('');

            // 5.5 Clean removed external action tags.
            aiContent = aiContent
                .replace(/\[\[(?:SEARCH|READ_NOTE|READ_DIARY|FS_READ_DIARY)[:\s][\s\S]*?\]\]/g, '')
                .replace(/\[\[(?:DIARY|FS_DIARY):[\s\S]*?\]\]/g, '')
                .replace(/\[\[(?:DIARY_START|FS_DIARY_START):[\s\S]*?\]\][\s\S]*?\[\[(?:DIARY_END|FS_DIARY_END)\]\]/g, '')
                .trim();

            // 6. Parse Actions (Poke, Transfer, Schedule, etc.)
            aiContent = await ChatParser.parseAndExecuteActions(
                aiContent,
                char.id,
                char.name,
                addToast,
                initiatingRelationshipScope,
            );

            // 7. Handle Quote/Reply Logic (Robust: handles [[QUOTE:...]], [QUOTE:...], typos like QUATE/QOUTE, Chinese 引用, and [回复 "..."] format)
            const QUOTE_RE_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:]\s*([\s\S]*?)\]\]/;
            const QUOTE_RE_SINGLE = /\[(?:QU[OA]TE|引用)[：:]\s*([^\]]*)\]/;
            // Match [回复 "content"] or [回复 "content"]: (AI mimics history context format)
            const REPLY_RE_CN = /\[回复\s*[""\u201C]([^""\u201D]*?)[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/;
            const QUOTE_CLEAN_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g;
            const QUOTE_CLEAN_SINGLE = /\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g;
            const REPLY_CLEAN_CN = /\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g;
            let aiReplyTarget: { id: number, content: string, name: string } | undefined;
            const firstQuoteMatch = aiContent.match(QUOTE_RE_DOUBLE) || aiContent.match(QUOTE_RE_SINGLE) || aiContent.match(REPLY_RE_CN);
            if (firstQuoteMatch) {
                const quotedText = firstQuoteMatch[1].trim();
                if (quotedText) {
                    // Try exact include first, then fuzzy match (first 10 chars)
                    const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                        || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                    if (targetMsg) {
                        const truncated = targetMsg.content.length > 10 ? targetMsg.content.slice(0, 10) + '...' : targetMsg.content;
                        aiReplyTarget = { id: targetMsg.id, content: truncated, name: userProfile.name };
                    }
                }
            }
            // Clean all quote tag variants from content
            aiContent = aiContent.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').replace(REPLY_CLEAN_CN, '').trim();

            // 8. Split and Stream (Simulate Typing)
            // Note: SEND_EMOJI tags are preserved through sanitize so splitResponse can interleave them with text

            // Comprehensive AI output sanitization (strips name prefixes, headers, stray backticks, residual tags, etc.)
            aiContent = ChatParser.sanitize(aiContent);

            if (
                preparedWorldbookRuntime?.projection.items.length
                && preparedWorldbookRuntime.markdown
                && aiContent.trim()
                && ChatParser.hasDisplayContent(aiContent)
            ) {
                try {
                    await recordWorldbookRuntimeProjectionDelivery({
                        prepared: preparedWorldbookRuntime,
                        consumer: worldbookConsumer,
                        deliveredAt: Date.now(),
                    });
                } catch (error) {
                    console.warn('[chat] Worldbook delivery receipt unavailable', error);
                }
            }

            // A 200/JSON response is not yet a completed character reply. Record
            // material delivery only after the final model output survives recall
            // and sanitization; the local "嗯..." fallback must never consume a
            // material cooldown.
            if (
                preparedCompanionMaterial?.projection.fragments.length
                && aiContent.trim()
                && ChatParser.hasDisplayContent(aiContent)
            ) {
                try {
                    await recordPreparedCompanionMaterialPromptDelivery({
                        prepared: preparedCompanionMaterial,
                        consumerRef: {
                            kind: 'prompt',
                            id: `chat-prompt:${assistantResponseId}`,
                            revision: '1',
                        },
                        occurredAt: Date.now(),
                    });
                } catch (error) {
                    console.warn('Companion material delivery receipt unavailable:', error);
                }
            }

            // Fallback: if cleanup removed every displayable token, provide a minimal response.
            if (!aiContent.trim()) {
                aiContent = '嗯...';
            }
            if (aiContent) {

                // Check for <翻译> XML tags (new bilingual format)
                const hasTranslationTags = /<翻译>\s*<原文>[\s\S]*?<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/.test(aiContent);

                let globalMsgIndex = 0;

                if (hasTranslationTags) {
                    // ─── New bilingual format: each <翻译> block = one bubble ───
                    // Extract emojis for bilingual path (splitResponse not used here)
                    const bilingualEmojis: string[] = [];
                    let bEm;
                    const bEmojiPat = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
                    while ((bEm = bEmojiPat.exec(aiContent)) !== null) {
                        const name = bEm[1].trim();
                        if (!bilingualEmojis.includes(name)) bilingualEmojis.push(name);
                    }
                    aiContent = aiContent.replace(/\[\[SEND_EMOJI:\s*.*?\]\]/g, '').trim();
                    const tagPattern = /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>([\s\S]*?)<\/译文>\s*<\/翻译>/g;
                    let lastIndex = 0;
                    let tagMatch;

                    if (chatReplyMode === 'preserve') {
                        const originals: string[] = [];
                        const translations: string[] = [];
                        while ((tagMatch = tagPattern.exec(aiContent)) !== null) {
                            const textBefore = ChatParser.sanitize(aiContent.slice(lastIndex, tagMatch.index).trim());
                            if (textBefore && ChatParser.hasDisplayContent(textBefore)) originals.push(textBefore);
                            const originalText = ChatParser.sanitize(tagMatch[1].trim());
                            const translatedText = ChatParser.sanitize(tagMatch[2].trim());
                            if (originalText) originals.push(originalText);
                            if (translatedText) translations.push(translatedText);
                            lastIndex = tagMatch.index + tagMatch[0].length;
                        }
                        const textAfter = ChatParser.sanitize(
                            aiContent.slice(lastIndex).replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim(),
                        );
                        if (textAfter && ChatParser.hasDisplayContent(textAfter)) originals.push(textAfter);
                        const originalBlock = originals.join('\n').trim();
                        const translationBlock = translations.join('\n').trim();
                        const preservedContent = originalBlock && translationBlock
                            ? `${originalBlock}\n%%BILINGUAL%%\n${translationBlock}`
                            : (originalBlock || translationBlock);
                        if (preservedContent) {
                            await new Promise(r => setTimeout(r, Math.min(Math.max(preservedContent.length * 30, 400), 2000)));
                            await saveAiMessage({ charId: char.id, role: 'assistant', type: 'text', content: preservedContent, replyTo: aiReplyTarget });
                            setMessages(await readScopedRecentMessages(200));
                            globalMsgIndex++;
                        }
                    } else while ((tagMatch = tagPattern.exec(aiContent)) !== null) {
                        // Save any plain text BEFORE this <翻译> block
                        const textBefore = aiContent.slice(lastIndex, tagMatch.index).trim();
                        if (textBefore) {
                            const cleaned = ChatParser.sanitize(textBefore);
                            if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                                const chunks = ChatParser.chunkText(cleaned);
                                for (const chunk of chunks) {
                                    if (!chunk) continue;
                                    const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                    await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                    await saveAiMessage({ charId: char.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                                    setMessages(await readScopedRecentMessages(200));
                                    globalMsgIndex++;
                                }
                            }
                        }

                        // Save the bilingual pair (stored as langA\n%%BILINGUAL%%\nlangB for renderer compatibility)
                        const originalText = ChatParser.sanitize(tagMatch[1].trim());
                        const translatedText = ChatParser.sanitize(tagMatch[2].trim());
                        if (originalText || translatedText) {
                            const biContent = originalText && translatedText
                                ? `${originalText}\n%%BILINGUAL%%\n${translatedText}`
                                : (originalText || translatedText);
                            const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                            await new Promise(r => setTimeout(r, Math.min(Math.max(biContent.length * 30, 400), 2000)));
                            await saveAiMessage({ charId: char.id, role: 'assistant', type: 'text', content: biContent, replyTo: replyData });
                            setMessages(await readScopedRecentMessages(200));
                            globalMsgIndex++;
                        }

                        lastIndex = tagMatch.index + tagMatch[0].length;
                    }

                    if (chatReplyMode === 'texting') {
                        // Save any remaining text AFTER last <翻译> block
                        const textAfter = aiContent.slice(lastIndex).trim();
                        if (textAfter) {
                            // Strip any stray translation tags
                            const cleaned = ChatParser.sanitize(textAfter.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim());
                            if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                                const chunks = ChatParser.chunkText(cleaned);
                                for (const chunk of chunks) {
                                    if (!chunk) continue;
                                    const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                    await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                    await saveAiMessage({ charId: char.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                                    setMessages(await readScopedRecentMessages(200));
                                    globalMsgIndex++;
                                }
                            }
                        }
                    }

                    // Send extracted emojis after bilingual text
                    for (const emojiName of bilingualEmojis) {
                        const foundEmoji = emojis.find(e => e.name === emojiName);
                        if (foundEmoji) {
                            await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                            await saveAiMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                            setMessages(await readScopedRecentMessages(200));
                        }
                    }
                } else {
                    // ─── Normal text (no bilingual tags) ───
                    // Also handles legacy %%BILINGUAL%% format for backwards compatibility
                    const parts = ChatParser.splitResponse(aiContent);
                    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                        const part = parts[partIndex];

                        if (part.type === 'emoji') {
                            const foundEmoji = emojis.find(e => e.name === part.content);
                            if (foundEmoji) {
                                await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                                await saveAiMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                                setMessages(await readScopedRecentMessages(200));
                            }
                        } else {
                            const allChunks = splitChatReplyText(part.content, chatReplyMode);

                            for (let i = 0; i < allChunks.length; i++) {
                                let chunk = allChunks[i];
                                const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                                await new Promise(r => setTimeout(r, delay));

                                let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                                const chunkQuoteMatch = chunk.match(QUOTE_RE_DOUBLE) || chunk.match(QUOTE_RE_SINGLE);
                                if (chunkQuoteMatch) {
                                    const quotedText = chunkQuoteMatch[1].trim();
                                    if (quotedText) {
                                        const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                                            || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                                        if (targetMsg) {
                                            const truncated = targetMsg.content.length > 10 ? targetMsg.content.slice(0, 10) + '...' : targetMsg.content;
                                            chunkReplyTarget = { id: targetMsg.id, content: truncated, name: userProfile.name };
                                        }
                                    }
                                    chunk = chunk.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').trim();
                                }

                                const replyData = chunkReplyTarget || (globalMsgIndex === 0 ? aiReplyTarget : undefined);

                                if (ChatParser.hasDisplayContent(chunk)) {
                                    const cleanChunk = ChatParser.sanitize(chunk);
                                    if (cleanChunk) {
                                        await saveAiMessage({ charId: char.id, role: 'assistant', type: 'text', content: cleanChunk, replyTo: replyData });
                                        setMessages(await readScopedRecentMessages(200));
                                        globalMsgIndex++;
                                    }
                                }
                            }
                        }
                    }
                }

            } else {
                // If content was empty (e.g. only actions), just refresh
                setMessages(await readScopedRecentMessages(200));
            }

            aiCompleted = true;
        } catch (e: any) {
            await DB.saveMessage({
                charId: char.id,
                role: 'system',
                type: 'text',
                content: `[连接中断: ${e.message}]`,
                metadata: {
                    temporalClass: 'live',
                    relationshipScope: initiatingRelationshipScope || null,
                },
            });
            setMessages(await readScopedRecentMessages(200));
        } finally {
            KeepAlive.stop();
            setIsTyping(false);
            setRecallStatus('');
            if (aiCompleted) {
                void (async () => {
                    const latest = (await DB.getAllCharacters()).find(item => item.id === char.id) || char;
                    const advanced = advanceCharacterLiveState(latest);
                    const afterDecay: CharacterProfile = {
                        ...latest,
                        ...advanced,
                    };
                    await DB.saveCharacter(afterDecay);
                    window.dispatchEvent(new CustomEvent('emotion-updated', {
                        detail: {
                            charId: char.id,
                            buffs: afterDecay.activeBuffs,
                            chatPresenceStatus: afterDecay.chatPresenceStatus,
                            buffInjection: afterDecay.buffInjection,
                        },
                    }));

                    const latestMessages = await readScopedRecentMessages(200);
                    const currentStateEmotionMessages = selectEmotionEvaluationMessages(latestMessages);
                    if (
                        afterDecay.emotionConfig?.enabled !== false
                        && shouldEvaluateCharacterLiveState(afterDecay, currentStateEmotionMessages)
                    ) {
                        if (!emotionApiConfig?.baseUrl) {
                            if (
                                emotionApiErrorMessage
                                && lastEmotionRouteErrorRef.current !== emotionApiErrorMessage
                            ) {
                                lastEmotionRouteErrorRef.current = emotionApiErrorMessage;
                                addToast(emotionApiErrorMessage, 'error');
                            }
                            return;
                        }
                        lastEmotionRouteErrorRef.current = '';
                        setEmotionStatus('evaluating');
                        await evaluateEmotionBackground(
                            afterDecay,
                            userProfile,
                            currentStateEmotionMessages,
                            emotionApiConfig,
                            emotionApiSource,
                        );
                        setEmotionStatus('');
                    }
                })().catch(error => {
                    setEmotionStatus('');
                    console.warn('🎭 [Emotion] Live-state maintenance failed:', error);
                });

                const memoryDMSettings = loadMemoryDMSettings();
                if (memoryDMSettings.enabled && initiatingRelationshipScope) {
                    void runMemoryDMPass({
                        char,
                        userProfile,
                        relationshipScope: initiatingRelationshipScope,
                        apiConfig: effectiveApi,
                        trigger: 'auto',
                        settings: memoryDMSettings,
                    }).catch(error => {
                        console.warn('MemoryDM pass failed:', error);
                    });
                }
            }
        }
    };



    // ─── Proactive Messaging Controls ───
    // NOTE: The actual proactive trigger handler is registered globally in OSContext
    // so it works even when Chat is not open. These are just start/stop helpers.

    const startProactiveChat = (intervalMinutes: number) => {
        if (!char) return;
        ProactiveChat.start(char.id, intervalMinutes);
    };

    const stopProactiveChat = () => {
        if (!char) return;
        ProactiveChat.stop(char.id);
    };

    const isProactiveActive = char ? ProactiveChat.isActiveFor(char.id) : false;

    return {
        isTyping,
        recallStatus,
        emotionStatus,
        lastTokenUsage,
        tokenBreakdown,
        setLastTokenUsage, // Allow manual reset if needed
        triggerAI,
        startProactiveChat,
        stopProactiveChat,
        isProactiveActive
    };
};
