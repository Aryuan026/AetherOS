import {
    CONVERSATION_CLIPPING_SCHEMA_VERSION,
    type ConversationClipping,
    type ConversationClippingMessage,
    type DailyArchiveDocument,
    type DailyArchiveMessage,
} from './types.ts';
import type { HistoryScope } from '../historyImport/types.ts';

export const MAX_CONVERSATION_CLIPPING_MESSAGES = 80;
export const MAX_VOICE_PROMPT_CLIPPINGS = 24;
export const MAX_VOICE_PROMPT_MESSAGES = 240;
export const MAX_VOICE_PROMPT_CHARACTERS = 48_000;

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
    left.progressBundleId === right.progressBundleId
    && left.personaMaskId === right.personaMaskId
    && left.charId === right.charId
);

type ClippableDailyArchiveMessage = DailyArchiveMessage & { role: 'user' | 'character' };

const isClippableMessage = (message: DailyArchiveMessage): message is ClippableDailyArchiveMessage => (
    message.role === 'user' || message.role === 'character'
);

const portableSnapshot = (message: ClippableDailyArchiveMessage): ConversationClippingMessage => ({
    messageId: message.id,
    source: message.source,
    sourceRecordId: message.sourceRecordId,
    sourceBatchId: message.sourceBatchId,
    sourceOrder: message.sourceOrder,
    role: message.role,
    kind: message.kind,
    content: message.content,
    time: { ...message.time },
    revision: message.revision,
});

const clippingDateLabel = (dateKey?: string): string => {
    if (!dateKey) return '未标日期';
    const [year, month, day] = dateKey.split('-');
    return `${year}.${month}.${day}`;
};

const randomSuffix = (): string => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createConversationClipping = (input: {
    scope: HistoryScope;
    sourceDocument: Pick<DailyArchiveDocument, 'id' | 'scope' | 'dateKey' | 'messages'>;
    selectedMessageIds: Iterable<string>;
    title?: string;
    now?: number;
    id?: string;
}): ConversationClipping => {
    if (!sameScope(input.scope, input.sourceDocument.scope)) {
        throw new Error('剪藏来源与当前面具、角色不一致。');
    }
    const selectedIds = new Set(input.selectedMessageIds);
    const selected = input.sourceDocument.messages.filter((message): message is ClippableDailyArchiveMessage => (
        selectedIds.has(message.id)
        && message.status === 'active'
        && isClippableMessage(message)
    ));
    if (selected.length === 0) throw new Error('请先选中想剪藏的对话。');
    if (selected.length > MAX_CONVERSATION_CLIPPING_MESSAGES) {
        throw new Error(`每份剪藏最多保存 ${MAX_CONVERSATION_CLIPPING_MESSAGES} 条，请分成几份。`);
    }
    const characterMessageCount = selected.filter(message => message.role === 'character').length;
    if (characterMessageCount === 0) throw new Error('语气素材里至少需要一句角色原话。');
    const hasCharacterText = selected.some(message => (
        message.role === 'character'
        && message.kind === 'text'
        && message.content.trim().length > 0
    ));
    if (!hasCharacterText) throw new Error('语气素材里至少需要一句角色文字。');
    const titleAnchor = selected
        .find(message => message.role === 'character' && message.content.trim())
        ?.content.replace(/\s+/gu, ' ').trim();
    const titlePreview = titleAnchor
        ? `“${titleAnchor.slice(0, 18)}${titleAnchor.length > 18 ? '…' : ''}”`
        : `${selected.length} 条对话`;
    const now = input.now ?? Date.now();
    return {
        schemaVersion: CONVERSATION_CLIPPING_SCHEMA_VERSION,
        id: input.id || `conversation-clipping:${randomSuffix()}`,
        scope: { ...input.scope },
        title: input.title?.trim() || `${clippingDateLabel(input.sourceDocument.dateKey)} · ${titlePreview}`,
        purpose: 'voice_reference',
        status: 'source_only',
        sourceDocumentId: input.sourceDocument.id,
        sourceDateKey: input.sourceDocument.dateKey,
        messages: selected.map(portableSnapshot),
        messageCount: selected.length,
        characterMessageCount,
        createdAt: now,
        updatedAt: now,
    };
};

export const validateConversationClipping = (clipping: ConversationClipping): void => {
    if (clipping.schemaVersion !== CONVERSATION_CLIPPING_SCHEMA_VERSION) throw new Error('剪藏版本不受支持。');
    if (!clipping.id || !clipping.sourceDocumentId) throw new Error('剪藏缺少来源编号。');
    if (clipping.purpose !== 'voice_reference' || clipping.status !== 'source_only') {
        throw new Error('剪藏用途或状态不受支持。');
    }
    if (clipping.messages.length === 0 || clipping.messages.length > MAX_CONVERSATION_CLIPPING_MESSAGES) {
        throw new Error('剪藏消息数量无效。');
    }
    if (clipping.messages.some(message => message.role !== 'user' && message.role !== 'character')) {
        throw new Error('剪藏只能包含用户与角色对话。');
    }
    if (clipping.messageCount !== clipping.messages.length) throw new Error('剪藏消息计数不一致。');
    const characterCount = clipping.messages.filter(message => message.role === 'character').length;
    if (characterCount === 0 || clipping.characterMessageCount !== characterCount) {
        throw new Error('剪藏缺少角色原话或角色消息计数不一致。');
    }
    if (!clipping.messages.some(message => (
        message.role === 'character'
        && message.kind === 'text'
        && message.content.trim().length > 0
    ))) throw new Error('剪藏缺少可分析的角色文字。');
};

const sourceLabel = (clipping: ConversationClipping, message: ConversationClippingMessage): string => (
    [
        clipping.sourceDateKey || 'undated',
        message.source,
        message.sourceRecordId,
    ].join(' / ')
);

/**
 * DriftStone-inspired, bounded prompt material. This only prepares a reviewed
 * candidate task; callers must not directly inject its output into chat.
 */
export const buildClippingVoiceAnalysisPrompt = (input: {
    clippings: ConversationClipping[];
    characterName: string;
    userName: string;
}): { systemPrompt: string; userPrompt: string; clippingCount: number; messageCount: number } => {
    const chosen = input.clippings
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(-MAX_VOICE_PROMPT_CLIPPINGS);
    const lines: string[] = [];
    let messageCount = 0;
    let characterCount = 0;
    let clippingCount = 0;
    let usedCharacters = 0;
    for (const clipping of chosen) {
        validateConversationClipping(clipping);
        const clippingLines: string[] = [];
        for (const message of clipping.messages) {
            if (messageCount >= MAX_VOICE_PROMPT_MESSAGES) break;
            const speaker = message.role === 'character' ? input.characterName : input.userName;
            const nextLine = `[${speaker}] ${message.content}\n[source: ${sourceLabel(clipping, message)}]`;
            if (usedCharacters + nextLine.length > MAX_VOICE_PROMPT_CHARACTERS) break;
            clippingLines.push(nextLine);
            usedCharacters += nextLine.length;
            messageCount += 1;
            if (message.role === 'character') characterCount += 1;
        }
        if (clippingLines.length > 0) {
            if (lines.length) lines.push('');
            lines.push(`## ${clipping.title} [source: ${clipping.id}]`, ...clippingLines);
            clippingCount += 1;
        }
        if (messageCount >= MAX_VOICE_PROMPT_MESSAGES || usedCharacters >= MAX_VOICE_PROMPT_CHARACTERS) break;
    }
    if (characterCount === 0) throw new Error('剪藏里没有可分析的角色原话。');

    const systemPrompt = [
        `你负责从人工剪藏中整理 ${input.characterName} 面向 ${input.userName} 时的语言指纹候选。`,
        '这些剪藏是证据，不是完整人格，也不是可直接写入运行提示词的定稿。',
        '只把角色原句当语气证据；用户原句仅用于理解回应场景。',
        '一次出现的话题、事实或情节不能自动上升为口癖、人格或关系结论。',
        '优先寻找跨片段重复出现的节奏、称呼、语气词、标点、动作描写和情绪响应方式。',
        '每个候选必须附原句和 source；证据不足时明确写“这里还没长出来”。',
        '写作采用角色在里面说话的视角，不写成站在外面解剖他的研究报告。',
        '输出只能是待人工确认的提示词补充候选，禁止声称已经修改角色卡、记忆或聊天提示词。',
    ].join('\n');
    const userPrompt = [
        `请把下面 ${messageCount} 条人工剪藏整理为 ${input.characterName} 的语言指纹候选。`,
        '按真实相处场景和温度组织；保留原句，不润色。',
        '最后给出：可保留候选、证据不足候选、容易误判为语气但其实只是话题的内容。',
        '',
        lines.join('\n'),
    ].join('\n');
    return { systemPrompt, userPrompt, clippingCount, messageCount };
};
