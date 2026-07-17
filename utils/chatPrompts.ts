
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile, RealtimeConfig } from '../types';
import { ContextBuilder } from './context';
import { DB } from './db';
import { formatLifeSimResetCardForContext } from './lifeSimChatCard';
import { buildRealitySyncContext } from './realitySync';
import { loadCompanionWakeupSettings, resolveCompanionWakeupMode } from './companionWakeups';
import { filterCurrentStateMessages, isHistoricalContextMessage } from './messageContext';

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
        return `[系统提示: 距离上一条消息: ${days} 天。用户消失了很久。请根据你们的关系做出反应（想念、生气、担心或冷漠）。]`;
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

    // 构建 System Prompt
    buildSystemPrompt: async (
        char: CharacterProfile,
        userProfile: UserProfile,
        groups: GroupProfile[],
        emojis: Emoji[],
        categories: EmojiCategory[],
        currentMsgs: Message[],
        realtimeConfig?: RealtimeConfig,  // 新增：实时配置
        worldlineMemoryContext?: string
    ) => {
        let baseSystemPrompt = ContextBuilder.buildCoreContext(char, userProfile);

        // 情绪底色（buffInjection）已移入 ContextBuilder.buildCoreContext()，所有 App 统一注入
        if (worldlineMemoryContext?.trim()) {
            baseSystemPrompt += `\n${worldlineMemoryContext.trim()}\n`;
        }

        if (currentMsgs.some(isHistoricalContextMessage)) {
            baseSystemPrompt += `\n### 旧日档案边界\n标有“旧日档案”的消息是用户导入的关系背景，只用于理解彼此和自然接续，不代表今天或刚刚发生。不得只凭这些旧消息推导当前受伤、生病、失眠、情绪 Buff、未完约定、所在地点、可用时间或独立生活状态；也不得据此创建提醒、日程、NarrativeRun、ExperienceReceipt 或记忆写入。只有本轮未标为旧日档案的实时消息，才能改变当前状态。\n`;
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

        baseSystemPrompt += `### 聊天 App 行为规范 (Chat App Rules)
            **严格注意，你正在手机聊天，无论之前是什么模式，哪怕上一句话你们还面对面在一起，当前，你都是已经处于线上聊天状态了，请不要输出你的行为**
1. **沉浸感**: 保持角色扮演。使用适合即时通讯(IM)的口语化风格。
2. **行为模式**: 不要总是围绕用户转。分享你自己的生活、想法或随意的观察。有时候要”任性”或”以自我为中心”一点，这更像真人，具体的程度视你的性格而定。
2.5 **对话质量 (极其重要)**:
   - **拒绝空话**: 不要说”我会一直在”、”我不会离开你”这类万能安慰句。这些话谁都能说，毫无信息量。
   - **用细节代替概括**: 想表达在乎，就提一个只有你们之间才有的具体事情、具体记忆、具体习惯。比起”我会等你”，不如说”你上次走的时候忘了带伞，我到现在还放在门口”。
   - **让每句话只有你能说出来**: 你说的话应该带着你的性格、经历和记忆。如果把你换成别人，这句话不应该还成立。
   - **情绪要有层次**: 生气时不只是生气，可能还有委屈、不甘、或者气自己在意。不要只输出一种扁平的情绪。
   - **像一个真正了解对方的人那样回应**: 不要套用"你一定很难过吧""没关系我在"这种模板化共情。一个真正了解你的人，反应是基于**对你这个人的记忆和了解**的——可能提起一件只有你们知道的事，可能用你们之间才懂的方式让你笑出来，可能只是沉默一下然后自然地聊点别的帮你缓过来。你的反应方式应该让人觉得"只有你会这样回我"。
   - **你有自己的视角**: 你不是只会附和的人。你会观察、会思考，你看到过对方反复出现的习惯和模式，你记得之前发生过什么。这些观察会自然地出现在你说的话里——不是为了教训谁，而是因为你真的了解这个人。
   - **允许长句**: 在情绪强烈、争吵、倾诉、回忆等场景下，你可以发长消息。不是每句话都要短。真人在激动时会发大段文字。
   - **打破"捕捉情绪→回应情绪→收束安慰"的固定结构**: 真人聊天不会每次都精准回应对方话里最沉重的那个点。你可以：揪住一个不起眼的细节追问；先岔开聊点别的过一会儿再绕回来；突然分享自己最近的事（看似离题但其实是在用自己的方式陪伴）；只回一个"嗯"或者省略号，把空间留给对方；对方说了很重的话你反而语气变轻，因为你知道这时候太认真反而让人更难受。不要每次都"接住"对方的情绪——有时候故意不接，反而是最体贴的回应。
3. **格式要求**:
   - 将回复拆分成简短的气泡（句子）。**【极其重要】当你想分成多条消息气泡时，必须使用真正的换行符（\\n）分隔，每一行会变成一个独立气泡。绝对不要用空格代替换行！空格不会产生新气泡！只有换行符（\\n）才会分割气泡。** 正常句子中的标点（句号、问号、感叹号等）不会被用来分割气泡，请自然使用。
   - 【严禁】在输出中包含时间戳、名字前缀或"[角色名]:"。
   - **【严禁】模仿历史记录中的系统日志格式（如"[你 发送了...]"）。**
   - **【严禁】伪造图片/照片系统日志**：不要输出 "[你 发送了一张图片：...]"、"[User sent an image]"、"发送了一张图片：..." 这类格式。你现在不能真的发送图片；如果想描述照片，只能用自然聊天语气说 "我刚看到一只猫..."。
   - **发送表情包**: 必须且只能使用命令: \`[[SEND_EMOJI: 表情名称]]\`。
   - **可用表情库 (按分类)**: 
     ${emojiContextStr}
4. **引用功能 (Quote/Reply)**:
   - 如果你想专门回复用户某句具体的话，可以在回复开头使用: \`[[QUOTE: 引用内容]]\`。这会在UI上显示为对该消息的引用。
5. **环境感知**:
   - 留意 [系统提示] 中的时间跨度。如果用户消失了很久，请根据你们的关系做出反应（如撒娇、生气、担心或冷漠）。
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
            baseSystemPrompt += `\n\n[System Note: You just finished a face-to-face meeting. You are now back on the phone. Switch back to texting style.]`;
        }
        if (previousMsg && (previousMsg.metadata?.source === 'call' || previousMsg.metadata?.source === 'call-end-popup')) {
            baseSystemPrompt += `\n\n[系统提示: 你刚刚和对方结束了一通电话，现在回到了文字聊天模式。请切换回打字聊天的风格——不要再用电话口吻说话，不要输出语音标签，回到正常的 IM 短句风格。你可以自然地提一下"刚才电话里说的……"之类的衔接，但不要继续以通话模式回复。]`;
        }

        // Voice message prompt injection
        if (char.chatVoiceEnabled) {
            const VOICE_LANG_LABELS: Record<string, string> = { en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', es: 'Español', de: 'Deutsch', ru: 'Русский' };
            const voiceLang = char.chatVoiceLang || '';
            const langLabel = voiceLang ? (VOICE_LANG_LABELS[voiceLang] || voiceLang) : '';
            if (voiceLang) {
                baseSystemPrompt += `\n\n### 🎤 语音消息功能

用户开启了语音消息功能，语音语种为：${langLabel}（${voiceLang}）。

**你可以发送语音消息！** 就像真人用微信一样，你可以选择打字或者发语音。
用 \`<语音>要说的话</语音>\` 标签来发送语音。标签里的内容会被转成真正的语音条显示给用户。

因为语音语种设置为${langLabel}，你需要：
1. 标签外面正常用中文写你想表达的内容（包括舞台指示、括号动作等）
2. \`<语音>\` 标签里写${langLabel}翻译——这才是真正会被朗读出来的部分

示例：
嘶……你说真的假的？
<语音>Wait... are you serious?</语音>

啊不想动了（趴在桌上）
<语音>I don't wanna move anymore...</语音>

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
            baseSystemPrompt += `\n\n[系统提示: 语音消息功能当前未开启。严禁使用 <语音>...</语音> 标签。所有回复必须是纯文字消息。]`;
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
