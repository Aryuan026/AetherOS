import type { ChatReplyMode } from '../types';
import { ChatParser } from './chatParser';

export const DEFAULT_CHAT_REPLY_MODE: ChatReplyMode = 'preserve';

export const createAssistantResponseId = (): string => {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `chat-response:${randomPart}`;
};

export const normalizeChatReplyMode = (value: unknown): ChatReplyMode => (
    value === 'preserve' || value === 'texting'
        ? value
        : DEFAULT_CHAT_REPLY_MODE
);

const PRESERVE_REPLY_PROMPT = `### 回复格式：跟随玩家格式
- 只参考玩家当前消息采用的文本结构：纯对白、括号动作、叙述与对白混合，或自然段落。用相应结构自然接续；玩家没有使用某种结构时，不要为了此设置强行添加。
- 跟随的只有格式。不要模仿玩家的语气、措辞、句式、句长、节奏或口癖，也不要替玩家发言。角色怎样表达始终服从角色卡、可靠上下文和角色自己的语言习惯。
- 按内容自然分段，不要为了制造多条消息而逐句断行。`;

const TEXTING_REPLY_PROMPT = `### 回复格式：只发消息
- 当前是远程文字聊天。正文只写可以直接发出的消息，不使用现场动作、镜头说明或第三人称环境旁白。
- 如果确实想发送多条独立消息，请用真正的换行分隔；每一行应当是一条可以独立发送的消息。`;

export const buildChatReplyModePrompt = (
    replyMode: ChatReplyMode,
    delivery: 'interactive' | 'proactive' = 'interactive',
): string => {
    const effectiveMode: ChatReplyMode = delivery === 'proactive' ? 'texting' : replyMode;
    return effectiveMode === 'texting' ? TEXTING_REPLY_PROMPT : PRESERVE_REPLY_PROMPT;
};

export const splitChatReplyText = (
    content: string,
    replyMode: ChatReplyMode,
): string[] => {
    const clean = content.trim();
    if (!clean) return [];
    if (replyMode === 'preserve') return [clean];

    const rawBlocks = clean.split(/^\s*---\s*$/m).filter(block => block.trim());
    const chunks = rawBlocks.flatMap(block => ChatParser.chunkText(block.trim()));
    return chunks.length > 0 ? chunks : [clean];
};
