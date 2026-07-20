import type {
    DiaryEntry,
    MessageRelationshipScope,
    SocialComment,
    SocialPost,
} from '../../types.ts';
import type {
    DailyArchiveMessage,
    DailyArchiveMessageStatus,
} from '../../domain/dailyArchive/index.ts';
import { normalizeMessageRelationshipScope } from '../messageContext.ts';
import { upsertDailyArchiveMessages } from './storage.ts';

const safePart = (value: string): string => encodeURIComponent(value);

const scopeKey = (scope: MessageRelationshipScope): string => (
    [scope.progressBundleId, scope.personaMaskId, scope.charId]
        .map(safePart)
        .join('::')
);

const validRevision = (value: unknown): number => {
    const revision = Number(value);
    return Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
};

const dateEpoch = (dateKey: string, fallback: number): number => {
    const parsed = new Date(`${dateKey}T12:00:00`).getTime();
    return Number.isFinite(parsed) ? parsed : fallback;
};

const pageText = (text: string, stickerCount: number): string => {
    const trimmed = String(text || '').trim();
    if (trimmed) return trimmed;
    return stickerCount > 0 ? `[日记贴纸 ${stickerCount} 枚]` : '';
};

export const dailyArchiveMessagesFromDiary = (input: {
    diary: DiaryEntry;
    status?: DailyArchiveMessageStatus;
    recordedAt?: number;
}): DailyArchiveMessage[] => {
    const scope = normalizeMessageRelationshipScope(input.diary.relationshipScope);
    if (!scope || scope.charId !== input.diary.charId) return [];
    const revision = validRevision(input.diary.evidenceRevision);
    const occurredAt = dateEpoch(input.diary.date, input.diary.timestamp);
    const recordedAt = input.recordedAt ?? Date.now();
    const interactionId = `journal:${input.diary.id}`;
    const relationKey = scopeKey(scope);
    const rows: DailyArchiveMessage[] = [];
    const append = (
        side: 'user' | 'char',
        content: string,
        stickerCount: number,
        sequence: number,
    ) => {
        const portable = pageText(content, stickerCount);
        if (!portable) return;
        rows.push({
            schemaVersion: 2,
            id: `journal:${relationKey}:${safePart(input.diary.id)}:${side}`,
            scope: { ...scope },
            source: 'live_chat',
            sourceRecordId: `${input.diary.id}:${side}`,
            origin: {
                surface: 'journal',
                medium: 'diary',
                producer: side === 'user' ? 'user' : 'model',
                interactionId,
                turnId: side,
                sequence,
            },
            role: side === 'user' ? 'user' : 'character',
            kind: 'text',
            content: portable,
            time: {
                dateKey: input.diary.date,
                epochMs: occurredAt + sequence,
                iso: new Date(occurredAt + sequence).toISOString(),
                precision: 'day',
            },
            status: input.status ?? 'active',
            recordedAt,
            revision,
        });
    };
    append('user', input.diary.userPage.text, input.diary.userPage.stickers.length, 0);
    if (input.diary.charPage) {
        append('char', input.diary.charPage.text, input.diary.charPage.stickers.length, 1);
    }
    return rows;
};

const socialReferencedCharIds = (post: SocialPost): string[] => [...new Set([
    post.charId || '',
    ...(post.comments || []).map(comment => comment.charId || ''),
    ...(post.replyAudienceCharIds || []),
    ...(post.replyRemainingCharIds || []),
    ...(post.evidenceAudienceCharIds || []),
].filter(Boolean))];

export const socialEvidenceScopes = (post: SocialPost): MessageRelationshipScope[] => {
    if ((post.kind || 'moment') === 'news') return [];
    const socialScope = post.socialScope;
    if (!socialScope?.progressBundleId || !socialScope?.personaMaskId) return [];
    return socialReferencedCharIds(post).map(charId => ({
        progressBundleId: socialScope.progressBundleId,
        personaMaskId: socialScope.personaMaskId,
        charId,
    }));
};

const socialCommentRole = (comment: SocialComment): DailyArchiveMessage['role'] => {
    if (comment.charId) return 'character';
    if (comment.id.startsWith('cmt-user-')) return 'user';
    return 'unknown';
};

const socialCommentProducer = (comment: SocialComment) => {
    const role = socialCommentRole(comment);
    if (role === 'user') return 'user' as const;
    if (role === 'character') return 'model' as const;
    return 'system' as const;
};

export const dailyArchiveMessagesFromSocialPost = (input: {
    post: SocialPost;
    status?: DailyArchiveMessageStatus;
    recordedAt?: number;
}): DailyArchiveMessage[] => {
    const scopes = socialEvidenceScopes(input.post);
    if (scopes.length === 0) return [];
    const revision = validRevision(input.post.evidenceRevision);
    const recordedAt = input.recordedAt ?? Date.now();
    const interactionId = `social:${input.post.id}`;
    const rootContent = [input.post.title, input.post.content].filter(Boolean).join('\n').trim();
    const rows: DailyArchiveMessage[] = [];

    scopes.forEach(scope => {
        const relationKey = scopeKey(scope);
        if (rootContent) {
            const rootRole: DailyArchiveMessage['role'] = input.post.sourceType === 'user'
                ? 'user'
                : input.post.charId ? 'character' : 'unknown';
            rows.push({
                schemaVersion: 2,
                id: `social:${relationKey}:${safePart(input.post.id)}:post`,
                scope: { ...scope },
                source: 'live_chat',
                sourceRecordId: `${input.post.id}:post`,
                origin: {
                    surface: 'social',
                    medium: 'social',
                    producer: rootRole === 'user' ? 'user' : rootRole === 'character' ? 'model' : 'system',
                    interactionId,
                    turnId: 'post',
                    sequence: 0,
                },
                role: rootRole,
                kind: input.post.images.length > 0 ? 'other' : 'text',
                content: rootContent,
                time: {
                    dateKey: new Date(input.post.timestamp).toLocaleDateString('sv-SE'),
                    epochMs: input.post.timestamp,
                    iso: new Date(input.post.timestamp).toISOString(),
                    precision: 'exact',
                },
                status: input.status ?? 'active',
                recordedAt,
                revision,
            });
        }
        (input.post.comments || []).forEach((comment, index) => {
            const content = `${comment.authorName}: ${String(comment.content || '').trim()}`.trim();
            if (!content) return;
            const occurredAt = input.post.timestamp + index + 1;
            rows.push({
                schemaVersion: 2,
                id: `social:${relationKey}:${safePart(input.post.id)}:comment:${safePart(comment.id)}`,
                scope: { ...scope },
                source: 'live_chat',
                sourceRecordId: `${input.post.id}:comment:${comment.id}`,
                origin: {
                    surface: 'social',
                    medium: 'social',
                    producer: socialCommentProducer(comment),
                    interactionId,
                    turnId: comment.id,
                    sequence: index + 1,
                },
                role: socialCommentRole(comment),
                kind: 'text',
                content,
                time: {
                    dateKey: new Date(occurredAt).toLocaleDateString('sv-SE'),
                    epochMs: occurredAt,
                    iso: new Date(occurredAt).toISOString(),
                    precision: 'exact',
                },
                status: input.status ?? 'active',
                recordedAt,
                revision,
            });
        });
    });
    return rows;
};

export const archiveDiaryEvidence = async (input: {
    diary: DiaryEntry;
    status?: DailyArchiveMessageStatus;
    factory?: IDBFactory;
}): Promise<boolean> => {
    const messages = dailyArchiveMessagesFromDiary(input);
    if (messages.length === 0) return false;
    await upsertDailyArchiveMessages({ messages, factory: input.factory });
    return true;
};

export const archiveSocialPostEvidence = async (input: {
    post: SocialPost;
    status?: DailyArchiveMessageStatus;
    factory?: IDBFactory;
}): Promise<boolean> => {
    const messages = dailyArchiveMessagesFromSocialPost(input);
    if (messages.length === 0) return false;
    await upsertDailyArchiveMessages({ messages, factory: input.factory });
    return true;
};
