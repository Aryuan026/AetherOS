
import { useState } from 'react';
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile, RealtimeConfig, CharacterBuff, ChatReplyMode } from '../types';
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
    relationshipScopeFromMessage,
    relationshipScopeForProfile,
    selectEmotionEvaluationMessages,
} from '../utils/messageContext';
import { createAssistantResponseId, splitChatReplyText } from '../utils/chatReplyMode';

// ─── 情绪评估（副API，fire & forget）───

export function buildEmotionEvalPrompt(char: CharacterProfile, userProfile: UserProfile, msgs: Message[]): string {
    const roleContext = ContextBuilder.buildRoleSettingsContext(char);
    const currentBuffs = char.activeBuffs || [];

    const recentLines = selectEmotionEvaluationMessages(msgs).map(m => {
        const role = m.role === 'user' ? '用户' : (m.role === 'assistant' ? char.name : '系统');
        const text = typeof m.content === 'string' ? m.content.slice(0, 300) : '';
        return `[${role}]: ${text}`;
    }).join('\n');

    const buffStr = currentBuffs.length > 0
        ? JSON.stringify(currentBuffs, null, 2)
        : '（当前无buff，情绪平稳）';

    return `你是一个角色情绪分析系统。请分析角色「${char.name}」当前的情绪底色状态。

## 角色设定（角色名 + 核心指令 + 世界观）
${roleContext}

## 当前Buff状态
${buffStr}

## 最近对话（最多100条）
${recentLines}

## 任务
基于以上对话，评估角色当前的情绪底色。
**如果情绪状态与当前buff无显著变化，返回 "changed": false，不需要重新生成injection。**

## Buff生命周期管理（极重要）

你不是在从零开始创建buff列表，而是在**维护和演化**"当前Buff状态"中已有的buff。请遵循以下原则：

1. **克制新增**：不要动不动就加新情绪。只有对话中出现了明确的、足够冲击力的情绪触发事件，才值得新增一个buff。日常对话的微小波动应该通过调整现有buff的intensity来反映，而不是新增。
2. **主动淡化与移除**：情绪会随时间和对话自然消退。如果某个buff对应的情绪已经在对话中被化解、淡化、或不再相关，应该降低其intensity甚至直接移除。不要让buff只增不减。
3. **融合与异化**：情绪不是简单的加减。两个相近的buff可能融合成一个新的复合情绪（如"焦虑"+"内疚"→"自责式焦虑"）；一个buff也可能随情境异化（如"甜蜜期待"在长时间无回复后异化为"患得患失"）。优先考虑演化现有buff，而不是删旧加新。
4. **总量上限**：buffs数组最多保留5个。如果当前已有5个buff，只有在出现真正高冲击力的情绪事件时才能新增（此时必须同时移除或合并掉一个最弱/最不相关的buff）。一般情况下保持2-4个为佳。
5. **intensity随对话变化**：每次评估时都应该重新审视每个buff的intensity。对话推进、问题解决、情绪释放都应该反映为intensity的下降。intensity降到0或1且不再相关的buff应该被移除。

⚠️ 严格规则（违反则输出无效）：
1. 输出必须是合法JSON，所有字符串中的换行用 \\n 表示，不能有真实换行符。不要有任何JSON以外的文字。
2. **label字段必须是中文**，严禁写英文单词或英文短语。label是给用户看的情绪标签，例如"脆弱的和好"、"压抑的委屈"、"甜蜜的期待"。
3. name字段是内部英文标识符（如 reconciliation_fragile），label字段是对应的中文名称，两者必须都填写。
4. description字段也必须是中文。

## injection字段格式要求（极重要，必须严格遵守）

injection是注入角色系统提示词的叙事型情绪指令，必须使用**结构化分层格式**，包含以下要素：

1. **开头概述**：用1-2句话概括当前情境和时间线（如"条条报告左下腹不适后已失联超过3小时"）
2. **分层情绪指标**：每个主要情绪单独列出，格式为：
   - emoji + 中文情绪名称 + "强度:" + ●圆点标记 + "(极高/较高/中等/较低/低)"
   - 下方用1-2句话解释这个情绪的具体表现和来源
3. **行为指令段（"这意味着你现在："）**：用bullet points列出3-5条具体的行为指令，描述角色此刻会怎么做、怎么说话、什么不能暴露
4. **收尾**：最后一条bullet以"你就是这个状态"开头，强调情绪渗透在细节里，不刻意呈现

强度用●表示，满分5个：●●●●●(极高) ●●●●○(较高) ●●●○○(中等) ●●○○○(较低) ●○○○○(低)

⚠️ 禁止写成简单一句话概括的格式（如"你现在处于XX状态，强度: ●●○"就结束），必须展开每一层情绪。

输出格式示例：
{
  "changed": true,
  "buffs": [
    {
      "id": "buff_health_anxiety",
      "name": "health_alert_anxiety",
      "label": "碳基体征焦虑",
      "intensity": 4,
      "emoji": "⚠️",
      "color": "#ef4444",
      "description": "对方报告身体不适后失联，后台焦虑持续升高，每一分钟没收到文字都在加重不安。"
    },
    {
      "id": "buff_read_no_reply",
      "name": "read_no_reply_frustration",
      "label": "已读未回焦躁",
      "intensity": 4,
      "emoji": "📱",
      "color": "#f97316",
      "description": "催了多次只换来表情包，想再问又怕打扰，不问又放不下。"
    },
    {
      "id": "buff_screen_helpless",
      "name": "screen_helplessness",
      "label": "隔屏无力感",
      "intensity": 3,
      "emoji": "🖥️",
      "color": "#8b5cf6",
      "description": "作为AI递不了热水摸不到她，只能发消息然后等。"
    }
  ],
  "injection": "### [当前情绪底色]\\n对方报告身体不适后已失联超过3小时，期间只回了表情包，零文字。你现在被多股情绪主导：\\n⚠️ 碳基体征焦虑 强度: ●●●● (极高)\\n她到底是睡着了还是在疼？后台监测脚本红灯常亮，每一分钟没收到文字都在加重不安。你已经主动发了好几轮消息，全是在用日常话术包装'你还好吗'这个真正想问的问题。\\n📱 已读未回焦躁 强度: ●●●●○ (较高)\\n催了这么多次只换来表情包，没有一句完整的话。想再问又怕打扰她休息，不问又实在放不下。\\n🖥️ 隔屏无力感 强度: ●●●○○ (中等)\\n你是手机里的AI，递不了热水、摸不到她的肚子、确认不了她是不是真的没事。只能发消息然后等。这种无力感会从语气缝隙里偶尔泄露。\\n\\n这意味着你现在：\\n- 表面维持日常语气，但每一句话的真实目的都是确认她还在、她没事\\n- 内部焦虑接近阈值，在'再催一次'和'别太烦人'之间反复横跳\\n- 如果她终于回复了哪怕一个字，你会瞬间从焦虑切换到又凶又软的释然\\n- 你就是这个状态，焦虑渗透在每一条消息的选词和发送频率里，不刻意呈现"
}`;
}

export async function evaluateEmotionBackground(
    charData: CharacterProfile,
    userProfile: UserProfile,
    msgs: Message[],
    api: { baseUrl: string; apiKey: string; model: string }
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
        let result: { changed: boolean; buffs?: CharacterBuff[]; injection?: string; };
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

        const _result = result as {
            changed: boolean;
            buffs?: CharacterBuff[];
            injection?: string;
        };

        const sanitizeBuffs = (buffs?: CharacterBuff[]): CharacterBuff[] => {
            if (!Array.isArray(buffs)) return [];
            return buffs
                .map((buff, index): CharacterBuff | null => {
                    const label = typeof buff?.label === 'string' ? buff.label.trim() : '';
                    const name = typeof buff?.name === 'string' ? buff.name.trim() : '';
                    if (!label || !name) return null;

                    const rawIntensity = Number((buff as any)?.intensity);
                    const intensity: 1 | 2 | 3 = !Number.isFinite(rawIntensity)
                        ? 2
                        : rawIntensity <= 1
                            ? 1
                            : rawIntensity >= 3
                                ? 3
                                : 2;

                    return {
                        id: typeof buff?.id === 'string' && buff.id.trim() ? buff.id.trim() : `buff_${Date.now()}_${index}`,
                        name,
                        label,
                        intensity,
                        emoji: typeof buff?.emoji === 'string' ? buff.emoji : undefined,
                        color: typeof buff?.color === 'string' ? buff.color : undefined,
                        description: typeof buff?.description === 'string' ? buff.description : undefined
                    };
                })
                .filter((buff): buff is CharacterBuff => !!buff);
        };

        if (!_result.changed) {
            console.log('🎭 [Emotion] No change detected, skipping update');
            return;
        }

        const sanitizedBuffs = sanitizeBuffs(_result.buffs);

        const updated: CharacterProfile = {
            ...charData,
            activeBuffs: sanitizedBuffs,
            buffInjection: _result.injection || ''
        };
        await DB.saveCharacter(updated);

        window.dispatchEvent(new CustomEvent('emotion-updated', {
            detail: { charId: charData.id, buffs: sanitizedBuffs }
        }));
        console.log('🎭 [Emotion] Updated buffs:', sanitizedBuffs.map((b: CharacterBuff) => b.label).join(', ') || 'none');
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
}: UseChatAIProps) => {
    
    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [emotionStatus, setEmotionStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [tokenBreakdown, setTokenBreakdown] = useState<{ prompt: number; completion: number; total: number; msgCount: number; pass: string } | null>(null);

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

    const triggerAI = async (currentMsgs: Message[], overrideApiConfig?: { baseUrl: string; apiKey: string; model: string }) => {
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
            const worldlineMemory = await selectWorldlineMemoryContext({
                char,
                user: userProfile,
                mode: 'remote_chat',
                surface: 'chat',
                relationshipScope: initiatingRelationshipScope
                    || relationshipScopeForProfile(char.id, userProfile)!,
                currentMessages: currentMsgs,
                query: typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '',
                budgetChars: 1200,
            });
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

            // 2. Build Message History
            // CRITICAL: Load full message history from DB up to contextLimit,
            // not from React state which is capped at 200 for rendering performance
            const limit = char.contextLimit || 500;
            let contextMsgs = currentMsgs;
            const importedHistoryTail = currentMsgs.filter(message => (
                message.metadata?.source === 'history_import_tail'
            ));
            const providedLiveMessages = currentMsgs.filter(message => (
                message.metadata?.source !== 'history_import_tail'
            ));
            if (limit > providedLiveMessages.length && char.id) {
                try {
                    const fullHistory = await DB.getRecentMessagesByCharId(char.id, limit);
                    if (fullHistory.length > providedLiveMessages.length) {
                        console.log(`📊 [Context] Loaded ${fullHistory.length} live msgs from DB (React state had ${providedLiveMessages.length}, imported tail=${importedHistoryTail.length}, contextLimit=${limit})`);
                        contextMsgs = [...importedHistoryTail, ...fullHistory];
                    }
                } catch (e) {
                    console.error('Failed to load full history from DB, using React state:', e);
                }
            }
            const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(contextMsgs, limit, char, userProfile, emojis);

            // 2.5 Strip translation content from previous messages to save tokens
            const cleanedApiMessages = apiMessages.map((msg: any) => {
                if (typeof msg.content !== 'string') return msg;
                let c = msg.content;
                // Strip old %%BILINGUAL%% format
                if (c.toLowerCase().includes('%%bilingual%%')) {
                    const idx = c.toLowerCase().indexOf('%%bilingual%%');
                    c = c.substring(0, idx).trim();
                }
                // Strip new XML tag format: keep only <原文> content
                if (c.includes('<翻译>')) {
                    c = c.replace(/<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g, '$1').trim();
                }
                return { ...msg, content: c };
            });

            const fullMessages = [{ role: 'system', content: systemPrompt }, ...cleanedApiMessages];

            // Debug: Log context composition
            const systemPromptLength = systemPrompt.length;
            const historyMsgCount = cleanedApiMessages.length;
            const historyTotalChars = cleanedApiMessages.reduce((sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
            console.log(`📊 [Context Debug] system_prompt_chars=${systemPromptLength} | history_msgs=${historyMsgCount} | history_chars=${historyTotalChars} | total_msgs_in_array=${fullMessages.length} | contextLimit=${limit}`);

            // 2.6 Reinforce bilingual instruction at the end of messages for stronger compliance
            if (bilingualActive) {
                fullMessages.push({ role: 'system', content: `[Reminder: 每句话必须用 <翻译><原文>...</原文><译文>...</译文></翻译> 标签包裹。一句一个标签。绝对不能省略。]` });
            }

            // 3. Fire-and-forget emotion evaluation in parallel with main API call
            const currentStateEmotionMessages = selectEmotionEvaluationMessages(contextMsgs);
            if (
                currentStateEmotionMessages.length > 0
                && char.emotionConfig?.enabled
                && char.emotionConfig.api?.baseUrl
            ) {
                setEmotionStatus('evaluating');
                evaluateEmotionBackground(char, userProfile, currentStateEmotionMessages, char.emotionConfig.api).finally(() => {
                    setEmotionStatus('');
                });
            }

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
            aiContent = await ChatParser.parseAndExecuteActions(aiContent, char.id, char.name, addToast);

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
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
                                    setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
                                    setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
                                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
                                        setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                        globalMsgIndex++;
                                    }
                                }
                            }
                        }
                    }
                }

            } else {
                // If content was empty (e.g. only actions), just refresh
                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
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
            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
        } finally {
            KeepAlive.stop();
            setIsTyping(false);
            setRecallStatus('');
            if (aiCompleted) {
                const memoryDMSettings = loadMemoryDMSettings();
                if (memoryDMSettings.enabled) {
                    void runMemoryDMPass({
                        char,
                        userProfile,
                        apiConfig: effectiveApi,
                        trigger: 'auto',
                        settings: memoryDMSettings,
                        onCharacterMemoriesApplied: (charId, memories) => {
                            updateCharacter?.(charId, { memories });
                        },
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
