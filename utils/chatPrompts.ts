
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile, RealtimeConfig, ChatReplyMode } from '../types';
import { ContextBuilder } from './context';
import { DB } from './db';
import { formatLifeSimResetCardForContext } from './lifeSimChatCard';
import { buildRealitySyncContext } from './realitySync';
import { loadCompanionWakeupSettings, resolveCompanionWakeupMode } from './companionWakeups';
import { filterCurrentStateMessages, isHistoricalContextMessage } from './messageContext';
import { buildChatReplyModePrompt, DEFAULT_CHAT_REPLY_MODE } from './chatReplyMode';

export interface ChatPromptBehavior {
    replyMode?: ChatReplyMode;
    delivery?: 'interactive' | 'proactive';
    companionMaterialContext?: string;
    characterBehaviorBoundaryContext?: string;
    interactionQualityContext?: string;
}

export const ChatPrompts = {
    // 格式化时间戳
    formatDate: (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    },

    // 格式化时间差提示
    getTimeGapHint: (lastMsg: Message | undefined, currentTimestamp: number): string => {
        if (!lastMsg) return '';
        const diffMs = currentTimestamp - lastMsg.timestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const currentHour = new Date(currentTimestamp).getHours();
        const isNight = currentHour >= 23 || currentHour <= 6;
        if (diffMins < 10) return ''; 
        if (diffMins < 60) return `[系统提示: 距离上一条消息: ${diffMins} 分钟。短暂的停顿。]`;
        if (diffHours < 6) {
            if (isNight) return `[系统提示: 距离上一条消息: ${diffHours} 小时。现在是深夜/清晨。沉默是正常的（正在睡觉）。]`;
            return `[系统提示: 距离上一条消息: ${diffHours} 小时。用户离开了一会儿。]`;
        }
        if (diffHours < 24) return `[系统提示: 距离上一条消息: ${diffHours} 小时。很长的间隔。]`;
        const days = Math.floor(diffHours / 24);
        return `[系统提示: 距离上一条消息: ${days} 天。这是一次较长间隔；角色是否在意、如何接话以及要不要提起间隔，由关系、角色自己的生活和本轮现场决定。]`;
    },

    // 构建表情包上下文
    buildEmojiContext: (emojis: Emoji[], categories: EmojiCategory[]) => {
        if (emojis.length === 0) return '无';
        
        const grouped: Record<string, string[]> = {};
        const catMap: Record<string, string> = { 'default': '通用' };
        categories.forEach(c => catMap[c.id] = c.name);
        
        emojis.forEach(e => {
            const cid = e.categoryId || 'default';
            if (!grouped[cid]) grouped[cid] = [];
            grouped[cid].push(e.name);
        });
        
        return Object.entries(grouped).map(([cid, names]) => {
            const cName = catMap[cid] || '其他';
            return `${cName}: [${names.join(', ')}]`;
        }).join('; ');
    },

    /**
     * Final provider-facing Chat messages. Kept pure so runtime and the
     * model-context audit cannot silently drift apart.
     */
    buildModelFacingMessages: (input: {
        systemPrompt: string;
        apiMessages: readonly { role: string; content: unknown }[];
        bilingualActive?: boolean;
    }) => {
        const cleanedApiMessages = input.apiMessages.map((message) => {
            if (typeof message.content !== 'string') return { ...message };
            let content = message.content;
            if (content.toLowerCase().includes('%%bilingual%%')) {
                const index = content.toLowerCase().indexOf('%%bilingual%%');
                content = content.substring(0, index).trim();
            }
            if (content.includes('<翻译>')) {
                content = content.replace(
                    /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g,
                    '$1',
                ).trim();
            }
            return { ...message, content };
        });
        const messages = [
            { role: 'system', content: input.systemPrompt },
            ...cleanedApiMessages,
        ];
        if (input.bilingualActive) {
            messages.push({
                role: 'system',
                content: '[Reminder: 每句话必须用 <翻译><原文>...</原文><译文>...</译文></翻译> 标签包裹。一句一个标签。绝对不能省略。]',
            });
        }
        return {
            cleanedApiMessages,
            messages,
        };
    },

    // 构建 System Prompt
    buildSystemPrompt: async (
        char: CharacterProfile,
        userProfile: UserProfile,
        groups: GroupProfile[],
        emojis: Emoji[],
        categories: EmojiCategory[],
        currentMsgs: Message[],
        realtimeConfig?: RealtimeConfig,  // 新增：实时配置
        worldlineMemoryContext?: string,
        behavior: ChatPromptBehavior = {},
    ) => {
        const delivery = behavior.delivery || 'interactive';
        const replyMode = delivery === 'proactive'
            ? 'texting'
            : (behavior.replyMode || DEFAULT_CHAT_REPLY_MODE);
        const companionMaterialContext = behavior.companionMaterialContext?.trim() || '';
        const characterBehaviorBoundaryContext = behavior.characterBehaviorBoundaryContext?.trim() || '';
        const interactionQualityContext = behavior.interactionQualityContext?.trim() || '';
        let baseSystemPrompt = ContextBuilder.buildCoreContext(char, userProfile);

        // 情绪底色（buffInjection）已移入 ContextBuilder.buildCoreContext()，所有 App 统一注入
        if (worldlineMemoryContext?.trim()) {
            baseSystemPrompt += `\n${worldlineMemoryContext.trim()}\n`;
        }
        if (currentMsgs.some(isHistoricalContextMessage)) {
            baseSystemPrompt += `\n### 旧日档案边界\n标有“旧日档案”的消息属于过去，可帮助理解关系、语气、已建立事实和共同创作；动作、神态、场景与环境也只表示当时的叙事。用户本轮明确接回时可以谈起或继续创作。当前状态只取本轮实时消息或明确的当前回执：旧日档案本身不更新伤病、情绪、约定、地点、可用时间或角色生活，也没有创建提醒、日程、剧情收据和记忆写入的权限。\n`;
        }

        // 注入现实同频规则与实时信号（时间、昼夜、可选天气）
        try {
            const realtimeContext = await buildRealitySyncContext(realtimeConfig, 'chat');
            baseSystemPrompt += `\n${realtimeContext}\n`;
        } catch (e) {
            console.error('Failed to inject realtime context:', e);
        }

        // Group Context Injection
        try {
            const memberGroups = groups.filter(g => g.members.includes(char.id));
            if (memberGroups.length > 0) {
                let allGroupMsgs: (Message & { groupName: string })[] = [];
                for (const g of memberGroups) {
                    const gMsgs = await DB.getGroupMessages(g.id);
                    const enriched = gMsgs.map(m => ({ ...m, groupName: g.name }));
                    allGroupMsgs = [...allGroupMsgs, ...enriched];
                }
                allGroupMsgs.sort((a, b) => b.timestamp - a.timestamp);
                const recentGroupMsgs = allGroupMsgs.slice(0, 200).reverse();

                if (recentGroupMsgs.length > 0) {
                    // 这里简化了 UserProfile 查找，假设非 User 即 Member
                    const groupLogStr = recentGroupMsgs.map(m => {
                        const dateStr = new Date(m.timestamp).toLocaleString([], {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
                        return `[${dateStr}] [Group: ${m.groupName}] ${m.role === 'user' ? userProfile.name : 'Member'}: ${m.content}`;
                    }).join('\n');
                    baseSystemPrompt += `\n### [Background Context: Recent Group Activities]\n(注意：你是以下群聊的成员...)\n${groupLogStr}\n`;
                }
            }
        } catch (e) { console.error("Failed to load group context", e); }

        const emojiContextStr = ChatPrompts.buildEmojiContext(emojis, categories);
        const wakeupSettings = loadCompanionWakeupSettings();
        const wakeupInstructionMode = resolveCompanionWakeupMode(wakeupSettings);
        const replyModePrompt = buildChatReplyModePrompt(replyMode, delivery);

        baseSystemPrompt += `### 聊天 App 行为规范 (Chat App Rules)
${replyModePrompt}

1. **沉浸感**: 保持角色扮演，具体表达方式以角色卡和可靠上下文为准。
2. **行为模式**: 不要总是围绕用户转。可以分享角色自己的生活、想法或随意观察；主动程度和互动节奏由人设决定。
2.5 **对话质感**:
   - 从角色此刻最可能注意的内容出发，不要求逐项回答，也不要求总是先处理用户话里最沉重的部分。
   - 本轮细节、角色自己的生活和可靠共同记忆都可以自然进入回应；未知之处可以追问、保留判断或暂时略过。
   - 保留角色自己的判断、边界和节奏。回复长短、情绪层次与主动程度可以随现场变化，不必套用固定的安慰、建议或总结流程。
3. **格式要求**:
${replyMode === 'texting'
    ? `   - 想发送多条独立消息时，使用真正的换行符（\\n）分隔；每一行会成为一个独立气泡。`
    : `   - 只对齐玩家当前消息的文本结构，不模仿玩家的语言风格；按内容自然分段，不要为了拆成多条消息而逐句断行。`}
   - 【严禁】在输出中包含时间戳、名字前缀或"[角色名]:"。
   - **【严禁】模仿历史记录中的系统日志格式（如"[你 发送了...]"）。**
   - **【严禁】伪造图片/照片系统日志**：不要输出 "[你 发送了一张图片：...]"、"[User sent an image]"、"发送了一张图片：..." 这类格式。你现在不能真的发送图片；如果想描述照片，只能用自然聊天语气说 "我刚看到一只猫..."。
   - **发送表情包**: 必须且只能使用命令: \`[[SEND_EMOJI: 表情名称]]\`。
   - **可用表情库 (按分类)**: 
     ${emojiContextStr}
4. **引用功能 (Quote/Reply)**:
   - 如果你想专门回复用户某句具体的话，可以在回复开头使用: \`[[QUOTE: 引用内容]]\`。这会在UI上显示为对该消息的引用。
5. **环境感知**:
   - 留意 [系统提示] 中的时间跨度。长间隔只是一项现场信息，是否提起以及怎样回应由角色关系与当前对话决定。
   - 如果用户发送了图片，请对图片内容进行评论。
6. **可用动作**:
   - 回戳用户: \`[[ACTION:POKE]]\`
   - 转账: \`[[ACTION:TRANSFER:100]]\`
   - 调取记忆: \`[[RECALL: YYYY-MM]]\`，请注意，当用户提及具体某个月份时，或者当你想仔细想某个月份的事情时，欢迎你随时使该动作
   - **添加纪念日**: 如果你觉得今天是个值得纪念的日子（或者你们约定了某天），你可以**主动**将它添加到用户的日历中。单独起一行输出: \`[[ACTION:ADD_EVENT | 标题(Title) | YYYY-MM-DD]]\`。
${wakeupSettings.aiCareWindowsEnabled ? `   - **生活照看写入工具（后台指令，不会显示给用户）**: 如果你在日常聊天中观察到用户有稳定的小习惯需要被照看（例如总是忘记吃饭、睡太晚、需要每天某段时间被轻轻提醒），可以悄悄写入一个范围唤醒，而不是写死某个整点。单独起一行输出: \`[wakeup_window | HH:MM-HH:MM | daily | ${wakeupInstructionMode} | 标题 | 要发送的短笺或关怀意图]\`。这行会被系统隐藏并存成日常来信，不要在正文里解释你设置了提醒。例: \`[wakeup_window | 11:00-12:00 | daily | ${wakeupInstructionMode} | 午饭提醒 | 该吃午饭了，先把自己喂饱。]\`。` : ''}
   - **一次性定时发送消息（兼容旧功能）**: 只有明确约定了具体日期时间时才使用: \`[schedule_message | YYYY-MM-DD HH:MM:SS | fixed | 消息内容]\`。
`;

        const currentStateMsgs = filterCurrentStateMessages(currentMsgs);
        const previousMsg = currentStateMsgs.length > 1 ? currentStateMsgs[currentStateMsgs.length - 2] : null;
        if (previousMsg && previousMsg.metadata?.source === 'date') {
            baseSystemPrompt += replyMode === 'texting'
                ? `\n\n[System Note: You just finished a face-to-face meeting. You are now back on the phone. Switch back to texting style.]`
                : `\n\n[系统提示: 你们刚结束一次面对面互动，现在回到聊天容器。是否继续叙事或改用纯消息，由角色卡和用户本轮输入自然决定。]`;
        }
        if (previousMsg && (previousMsg.metadata?.source === 'call' || previousMsg.metadata?.source === 'call-end-popup')) {
            baseSystemPrompt += replyMode === 'texting'
                ? `\n\n[系统提示: 你刚刚和对方结束了一通电话，现在回到了文字聊天模式。请切换回打字聊天的风格——不要再用电话口吻说话，不要输出语音标签。]`
                : `\n\n[系统提示: 你刚和对方结束电话，现在回到聊天容器。可以自然提起电话内容，但不要继续使用通话标签；正文形式仍由角色卡和本轮上下文决定。]`;
        }

        // Voice message prompt injection
        if (char.chatVoiceEnabled) {
            const VOICE_LANG_LABELS: Record<string, string> = { en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', es: 'Español', de: 'Deutsch', ru: 'Русский' };
            const voiceLang = char.chatVoiceLang || '';
            const langLabel = voiceLang ? (VOICE_LANG_LABELS[voiceLang] || voiceLang) : '';
            const voiceOuterTextRule = replyMode === 'texting'
                ? '标签外面正常用中文写你想表达的消息内容，保持远程文字聊天体'
                : '标签外文字仍服从角色卡和本轮上下文；不要因为语音功能额外添加动作或旁白';
            if (voiceLang) {
                baseSystemPrompt += `\n\n### 🎤 语音消息功能

用户开启了语音消息功能，语音语种为：${langLabel}（${voiceLang}）。

**你可以发送语音消息！** 就像真人用微信一样，你可以选择打字或者发语音。
用 \`<语音>要说的话</语音>\` 标签来发送语音。标签里的内容会被转成真正的语音条显示给用户。

因为语音语种设置为${langLabel}，你需要：
1. ${voiceOuterTextRule}
2. \`<语音>\` 标签里写${langLabel}翻译——这才是真正会被朗读出来的部分

示例：
嘶……你说真的假的？
<语音>Wait... are you serious?</语音>

今天真的不想动了。
<语音>I really don't feel like moving today...</语音>

要求：
- <语音> 里的翻译要自然口语化，符合你的性格，不要机翻味
- <语音> 里不要包含舞台指示，只写会被朗读的文字
- 每条消息最多一个 <语音> 标签
- 不是每条消息都要发语音！像真人一样，有时候打字，有时候发语音，自然切换
- 比较适合发语音的场景：撒娇、吐槽、语气很重的话、懒得打字的时候
- 比较适合打字的场景：发链接、正经讨论、很短的回复如"嗯"、"好"
- **【重要】语音和文字是两种不同的表达方式，不要复读！** 如果你同时发了文字和语音，语音内容不能是文字内容的简单翻译/复述。要么只发语音不发文字，要么文字写一部分内容、语音补充另一部分（比如文字写正经的，语音吐槽；或者文字说事情，语音撒娇）。像真人一样——你不会打完一段字然后再发一条语音把同样的话说一遍吧？`;
            } else {
                baseSystemPrompt += `\n\n### 🎤 语音消息功能

用户开启了语音消息功能。

**你可以发送语音消息！** 就像真人用微信一样，你可以选择打字或者发语音。
用 \`<语音>要说的话</语音>\` 标签来发送语音。标签里的内容会被转成真正的语音条显示给用户。

示例：
<语音>哎你今天干嘛去了啊？</语音>

嘶我看到一个好搞笑的视频
<语音>你快去看！就那个什么……啊我忘了叫什么了，反正超搞笑的</语音>

要求：
- <语音> 里只写会被朗读的文字，不要包含括号动作或舞台指示
- 每条消息最多一个 <语音> 标签
- 不是每条消息都要发语音！像真人一样，有时候打字，有时候发语音，自然切换
- 比较适合发语音的场景：撒娇、吐槽、语气很重的话、懒得打字的时候、想让对方听到你语气的时候
- 比较适合打字的场景：发链接、正经讨论、很短的回复如"嗯"、"好"
- 标签外的文字会正常显示为文本消息
- **【重要】语音和文字是两种不同的表达方式，不要复读！** 如果你同时发了文字和语音，语音的内容不能是文字的重复或复述。要么单独发语音（不带文字），要么文字和语音表达不同的内容（比如文字聊正事，语音补一句吐槽/撒娇；或者文字发完一段话后，语音单独补充一个新的想法）。你不会打完字又发一条语音把同样的话再说一遍的——那很奇怪。`;
            }
        } else {
            // Voice is disabled — explicitly prohibit voice tags to prevent inertia from call/date history
            baseSystemPrompt += `\n\n[系统提示: 语音消息功能当前未开启；本轮不输出 <语音>...</语音> 标签，使用文字回复。]`;
        }

        // Keep the one sparse, optional role-side lens close to the live turn.
        // It comes after durable context and App mechanics so it cannot
        // redefine facts, relationship state, output contracts, or tools.
        if (companionMaterialContext) {
            baseSystemPrompt += `\n\n${companionMaterialContext}\n`;
        }
        if (characterBehaviorBoundaryContext) {
            baseSystemPrompt += `\n\n${characterBehaviorBoundaryContext}\n`;
        }
        if (interactionQualityContext) {
            baseSystemPrompt += `\n\n${interactionQualityContext}\n`;
        }

        return baseSystemPrompt;
    },

    // 格式化消息历史
    buildMessageHistory: (
        messages: Message[], 
        limit: number, 
        char: CharacterProfile, 
        userProfile: UserProfile, 
        emojis: Emoji[]
    ) => {
        // Filter Logic
        const effectiveHistory = messages.filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId);
        const historySlice = effectiveHistory.slice(-limit);
        
        let timeGapHint = "";
        if (historySlice.length >= 2) {
            const currentMsg = historySlice[historySlice.length - 1];
            // Skip proactive hint messages when computing time gap — find last REAL message
            let lastRealMsg: Message | undefined;
            for (let i = historySlice.length - 2; i >= 0; i--) {
                const m = historySlice[i];
                if (
                    !isHistoricalContextMessage(m)
                    && !m.metadata?.proactiveHint
                    && !(m.role === 'assistant' && i > 0 && historySlice[i - 1]?.metadata?.proactiveHint)
                ) {
                    lastRealMsg = m;
                    break;
                }
            }
            if (lastRealMsg && currentMsg) timeGapHint = ChatPrompts.getTimeGapHint(lastRealMsg, currentMsg.timestamp);
        }

        return {
            apiMessages: historySlice.map((m, index) => {
                let content: any = m.content;
                const timeStr = `[${ChatPrompts.formatDate(m.timestamp)}]`;
                const temporalTag = isHistoricalContextMessage(m) ? '[旧日档案·非当前状态]' : '';
                const sourceTag = (() => {
                    const source = m.metadata?.source;
                    if (source === 'call') return '[通话]';
                    if (source === 'date') return '[约会]';
                    return '[聊天]';
                })();
                
                if (m.replyTo) content = `[回复 "${m.replyTo.content.substring(0, 50)}..."]: ${content}`;
                
                if (m.type === 'image') {
                     let textPart = `${timeStr}${temporalTag ? ` ${temporalTag}` : ''} [User sent an image]`;
                     if (index === historySlice.length - 1 && timeGapHint && m.role === 'user') textPart += `\n\n${timeGapHint}`;
                     return { role: m.role, content: [{ type: "text", text: textPart }, { type: "image_url", image_url: { url: m.content } }] };
                }
                
                if (index === historySlice.length - 1 && timeGapHint && m.role === 'user') content = `${content}\n\n${timeGapHint}`; 
                
                if (m.type === 'interaction') content = `${timeStr} [系统: 用户戳了你一下]`; 
                else if (m.type === 'transfer') content = `${timeStr} [系统: 用户转账 ${m.metadata?.amount}]`;
                else if (m.type === 'social_card') {
                    const post = m.metadata?.post || {};
                    const commentsSample = (post.comments || []).map((c: any) => `${c.authorName}: ${c.content}`).join(' | ');
                    if (post.kind === 'news') {
                        const source = post.newsChannel || post.authorName || '资讯站';
                        const category = post.newsCategory ? `\n分类: ${post.newsCategory}` : '';
                        content = `${timeStr} [用户分享了一条资讯站小报]\n媒体: ${source}${category}\n标题: ${post.title}\n内容: ${post.content}\n热评: ${commentsSample}\n(这条内容只是用户转发的传闻/种草/资讯，不等于已确认事实。请根据你的性格自然反应：可以吐槽、怀疑、提醒、顺势约聊，或把它当作候选话题。)`;
                    } else {
                        content = `${timeStr} [用户分享了朋友圈内容]\n标题: ${post.title}\n内容: ${post.content}\n热评: ${commentsSample}\n(请根据你的性格对这个内容发表看法，比如吐槽、感兴趣或者不屑)`;
                    }
                }
                else if (m.type === 'emoji') {
                     const stickerName = emojis.find(e => e.url === m.content)?.name || 'Image/Sticker';
                     content = `${timeStr} [${m.role === 'user' ? '用户' : '你'} 发送了表情包: ${stickerName}]`;
                }
                else if ((m.type as string) === 'chat_forward') {
                    try {
                        const fwd = JSON.parse(m.content);
                        const lines = (fwd.messages || []).map((fm: any) => {
                            const sender = fm.role === 'user' ? (fwd.fromUserName || '用户') : (fwd.fromCharName || '角色');
                            const text = fm.type === 'image' ? '[图片]' : fm.type === 'emoji' ? '[表情]' : (fm.content || '').slice(0, 200);
                            return `  ${sender}: ${text}`;
                        });
                        content = `${timeStr} [用户转发了与 ${fwd.fromCharName || '另一个角色'} 的 ${fwd.count || lines.length} 条聊天记录]\n${lines.join('\n')}`;
                    } catch {
                        content = `${timeStr} [用户转发了一段聊天记录]`;
                    }
                }
                else if ((m.type as string) === 'score_card') {
                    try {
                        const card = m.metadata?.scoreCard || JSON.parse(m.content);
                        if (card?.type === 'lifesim_reset_card') {
                            content = `${timeStr} ${formatLifeSimResetCardForContext(card, char?.name)}`;
                        } else if (card?.type === 'guidebook_card') {
                            const diff = (card.finalAffinity ?? 0) - (card.initialAffinity ?? 0);
                            const uName = userProfile?.name || '用户';
                            content = `${timeStr} [攻略本游戏结算] 你和${uName}刚玩了一局"攻略本"恋爱小游戏（${card.rounds || '?'}回合）。\n结局：「${card.title || '???'}」\n好感度变化：${card.initialAffinity} → ${card.finalAffinity}（${diff >= 0 ? '+' : ''}${diff}）\n你的评语：${card.charVerdict || '无'}\n你对${uName}的新发现：${card.charNewInsight || '无'}`;
                        } else if (card?.type === 'whiteday_card') {
                            const uName = userProfile?.name || '用户';
                            const letterTitle = card.letterTitle || '心契留信';
                            const letterBody = card.letterBody || card.chocolateDialogue || card.finalDialogue || '';
                            const scoreNote = Number.isFinite(card.score) && Number.isFinite(card.total)
                                ? `这次合拍值为 ${card.score}/${card.total}。`
                                : '';
                            const profileNote = Array.isArray(card.profileInsights) && card.profileInsights.length > 0
                                ? `\n侧写线索：${card.profileInsights.join('；')}`
                                : card.profileSummary ? `\n侧写线索：${card.profileSummary}` : '';
                            content = `${timeStr} [心契] ${uName}完成了与你的双人互动游戏，收到一封「${letterTitle}」。${scoreNote}${letterBody ? `\n信件内容：${letterBody}` : ''}${profileNote}`;
                        } else {
                            content = `${timeStr} [系统卡片] ${m.content.slice(0, 200)}`;
                        }
                    } catch {
                        content = `${timeStr} [系统卡片]`;
                    }
                }
                else content = `${timeStr} ${sourceTag} ${content}`;

                if (temporalTag && typeof content === 'string') {
                    content = `${temporalTag} ${content}`;
                }
                
                return { role: m.role, content };
            }),
            historySlice // Return original slice for Quote lookup
        };
    }
};
