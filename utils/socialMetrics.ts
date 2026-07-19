import type { SocialPost } from '../types';

const normalizedName = (value?: string) => String(value || '').trim().toLocaleLowerCase();

export interface SocialProfileMetrics {
    audience: number;
    ownPosts: number;
    receivedLikes: number;
}

/**
 * 朋友圈的数字只描述当前面具的真实本机关系网：已链接角色，以及已经在
 * 当前朋友圈里出现的 NPC。角色的多个账号不会被重复计算，资讯站路人也
 * 不会伪装成用户的生活圈成员。
 */
export const collectSocialAudienceKeys = (
    posts: SocialPost[],
    linkedCharacterIds: string[],
    userName: string,
): string[] => {
    const linkedIds = new Set(linkedCharacterIds);
    const keys = new Set(linkedCharacterIds.map(id => `char:${id}`));
    const userKey = normalizedName(userName);

    posts.forEach(post => {
        if ((post.kind || 'moment') === 'news') return;

        if (post.sourceType === 'character' && post.charId && linkedIds.has(post.charId)) {
            keys.add(`char:${post.charId}`);
        } else if (post.sourceType === 'npc') {
            const author = normalizedName(post.authorName);
            if (author && author !== userKey) keys.add(`npc:${author}`);
        }

        (post.comments || []).forEach(comment => {
            if (comment.charId && linkedIds.has(comment.charId)) {
                keys.add(`char:${comment.charId}`);
                return;
            }
            if (comment.isCharacter) return;
            const author = normalizedName(comment.authorName);
            if (author && author !== userKey) keys.add(`npc:${author}`);
        });
    });

    return [...keys];
};

export const visibleMomentLikes = (post: SocialPost, audienceCount: number): number => (
    Math.max(0, Math.min(Math.round(Number(post.likes) || 0), Math.max(0, audienceCount)))
);

export const buildSocialProfileMetrics = (
    posts: SocialPost[],
    linkedCharacterIds: string[],
    userName: string,
): SocialProfileMetrics => {
    const audience = collectSocialAudienceKeys(posts, linkedCharacterIds, userName).length;
    const ownPosts = posts.filter(post => (post.kind || 'moment') !== 'news' && post.sourceType === 'user');
    return {
        audience,
        ownPosts: ownPosts.length,
        receivedLikes: ownPosts.reduce((sum, post) => sum + visibleMomentLikes(post, audience), 0),
    };
};
