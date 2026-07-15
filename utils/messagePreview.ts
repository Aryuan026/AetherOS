import { Message } from '../types';

type PreviewMessage = Pick<Message, 'type' | 'content' | 'metadata' | 'role'>;

const DEFAULT_MAX_LENGTH = 88;

const normalizeText = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const clipText = (value: string, maxLength: number): string => {
    const normalized = normalizeText(value);
    const chars = Array.from(normalized);
    return chars.length > maxLength
        ? `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…`
        : normalized;
};

const parseStructuredContent = (content: string): Record<string, any> | null => {
    const normalized = content.trim();
    if (!normalized || (!normalized.startsWith('{') && !normalized.startsWith('['))) return null;

    try {
        const parsed = JSON.parse(normalized);
        if (Array.isArray(parsed)) return { type: 'structured_list', count: parsed.length };
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const getScoreCardPreview = (card: Record<string, any>): string => {
    if (card.type === 'whiteday_card') {
        return `心契留信${normalizeText(card.letterTitle) ? ` · ${normalizeText(card.letterTitle)}` : ''}`;
    }

    if (card.type === 'guidebook_card') {
        return `攻略本${normalizeText(card.title) ? ` · ${normalizeText(card.title)}` : ' · 本轮已完成'}`;
    }

    if (card.type === 'quiz_card') {
        const subject = normalizeText(card.chapterTitle) || normalizeText(card.courseTitle) || '练习完成';
        const score = Number.isFinite(card.score) && Number.isFinite(card.total)
            ? ` · ${card.score}/${card.total}`
            : '';
        return `练习册 · ${subject}${score}`;
    }

    if (card.type === 'lifesim_reset_card') {
        const headline = normalizeText(card.headline) || normalizeText(card.title) || '城市小结';
        return `都市人生 · ${headline}`;
    }

    if (card.songId || card.lyrics || card.lineCount) {
        return `乐谱 · ${normalizeText(card.title) || '未命名作品'}`;
    }

    const title = normalizeText(card.title)
        || normalizeText(card.headline)
        || normalizeText(card.label)
        || normalizeText(card.summary);
    return title ? `卡片 · ${title}` : '收到一张新卡片';
};

const getStructuredPreview = (payload: Record<string, any>): string => {
    if (payload.type === 'whiteday_card'
        || payload.type === 'guidebook_card'
        || payload.type === 'quiz_card'
        || payload.type === 'lifesim_reset_card'
        || payload.songId
        || payload.lyrics
        || payload.lineCount) {
        return getScoreCardPreview(payload);
    }

    const title = normalizeText(payload.title)
        || normalizeText(payload.headline)
        || normalizeText(payload.label)
        || normalizeText(payload.summary);
    return title ? `新消息 · ${title}` : '收到一条特殊消息';
};

/**
 * Turns a persisted chat message into safe, human-readable compact copy.
 * Structured content is never exposed as raw JSON; known message/card types
 * get a meaningful summary and unknown structured payloads keep a calm fallback.
 */
export const getMessagePreview = (
    message: PreviewMessage,
    maxLength = DEFAULT_MAX_LENGTH,
): string => {
    const metadata = message.metadata && typeof message.metadata === 'object'
        ? message.metadata
        : {};
    const structuredContent = parseStructuredContent(message.content);

    let preview = '';
    switch (message.type) {
        case 'image':
            preview = '发来一张图片';
            break;
        case 'emoji':
            preview = '发来一个表情';
            break;
        case 'interaction':
            preview = message.role === 'user' ? '你戳了戳 TA' : '戳了戳你';
            break;
        case 'transfer': {
            const amount = normalizeText(String(metadata.amount ?? ''));
            preview = amount ? `转账 · ${amount}` : '发来一笔转账';
            break;
        }
        case 'social_card': {
            const post = metadata.post && typeof metadata.post === 'object' ? metadata.post : {};
            const title = normalizeText(post.title) || normalizeText(post.content);
            preview = title ? `分享动态 · ${title}` : '分享了一条动态';
            break;
        }
        case 'chat_forward': {
            const count = Number(structuredContent?.count);
            const fromName = normalizeText(structuredContent?.fromCharName);
            const subject = fromName ? `与 ${fromName} 的聊天记录` : '聊天记录';
            preview = Number.isFinite(count) && count > 0 ? `${subject} · ${count} 条` : subject;
            break;
        }
        case 'score_card': {
            const scoreCard = metadata.scoreCard && typeof metadata.scoreCard === 'object'
                ? metadata.scoreCard
                : structuredContent;
            preview = scoreCard ? getScoreCardPreview(scoreCard) : '收到一张新卡片';
            break;
        }
        case 'system':
            preview = structuredContent
                ? getStructuredPreview(structuredContent)
                : normalizeText(message.content) || '系统消息';
            break;
        case 'text':
        default:
            preview = structuredContent
                ? getStructuredPreview(structuredContent)
                : normalizeText(message.content) || '新消息';
            break;
    }

    return clipText(preview, maxLength) || '新消息';
};
