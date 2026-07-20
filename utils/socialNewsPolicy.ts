import {
    SocialNewsFeedbackReason,
    SocialNewsFeedbackSentiment,
    SocialPost,
} from '../types';

export const SOCIAL_NEWS_POLICY_VERSION = '2026-07-public-boundary-v1';

export const SOCIAL_NEWS_FEEDBACK_REASON_LABELS: Record<SocialNewsFeedbackReason, string> = {
    natural: '氛围自然',
    'interesting-peripheral': '新人物有趣',
    'useful-story-hook': '能接上剧情',
    'liked-style': '喜欢这种文风',
    'forced-setting': '像在硬套设定',
    'secret-leak': '泄露秘密或越权揣测',
    'out-of-character': '角色行为不合理',
    'repeated-cast': '总抓着同一批人',
    'report-like': '太像报告',
    other: '其他',
};

export const SOCIAL_NEWS_FEEDBACK_REASONS: Record<SocialNewsFeedbackSentiment, SocialNewsFeedbackReason[]> = {
    like: ['natural', 'interesting-peripheral', 'useful-story-hook', 'liked-style'],
    dislike: ['forced-setting', 'secret-leak', 'out-of-character', 'repeated-cast', 'report-like', 'other'],
};

const compact = (value: unknown, maxLength: number) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

export interface SocialNewsPreferenceProfile {
    likedReasons: string[];
    dislikedReasons: string[];
    recentSignals: Array<{
        sentiment: SocialNewsFeedbackSentiment;
        category: string;
        channel: string;
        title: string;
        reason: string;
    }>;
}

export const buildSocialNewsPreferenceProfile = (
    scopedPosts: SocialPost[],
    limit = 8,
): SocialNewsPreferenceProfile => {
    const recentSignals = scopedPosts
        .filter(post => (post.kind || 'moment') === 'news' && post.newsFeedback)
        .sort((a, b) => (b.newsFeedback?.updatedAt || 0) - (a.newsFeedback?.updatedAt || 0))
        .slice(0, Math.max(1, Math.min(limit, 12)))
        .map(post => {
            const feedback = post.newsFeedback!;
            const label = feedback.reason ? SOCIAL_NEWS_FEEDBACK_REASON_LABELS[feedback.reason] : '';
            const note = compact(feedback.note, 120);
            return {
                sentiment: feedback.sentiment,
                category: compact(post.newsCategory || 'sidequest', 24),
                channel: compact(post.newsChannel || post.authorName, 30),
                title: compact(post.title, 60),
                reason: compact([label, note].filter(Boolean).join('：'), 150) || '未补充原因',
            };
        });

    return {
        likedReasons: Array.from(new Set(recentSignals
            .filter(signal => signal.sentiment === 'like')
            .map(signal => signal.reason))),
        dislikedReasons: Array.from(new Set(recentSignals
            .filter(signal => signal.sentiment === 'dislike')
            .map(signal => signal.reason))),
        recentSignals,
    };
};

export const buildSocialNewsPreferencePrompt = (scopedPosts: SocialPost[]): string => {
    const profile = buildSocialNewsPreferenceProfile(scopedPosts);
    if (profile.recentSignals.length === 0) {
        return '当前还没有玩家反馈。先保证自然、可信和人物分布多样，不要为了显得相关而硬塞角色设定。';
    }

    const signalLines = profile.recentSignals.map(signal => (
        `- ${signal.sentiment === 'like' ? '喜欢' : '不喜欢'}｜${signal.category}/${signal.channel}｜《${signal.title}》｜原因：${signal.reason}`
    ));
    return [
        '下面是当前面具范围内、玩家主动留下的资讯偏好。它只调整选题和文风，不能推翻角色事实或知识边界。',
        profile.likedReasons.length > 0 ? `倾向保留：${profile.likedReasons.join('；')}` : '',
        profile.dislikedReasons.length > 0 ? `明确避开：${profile.dislikedReasons.join('；')}` : '',
        '最近反馈：',
        ...signalLines,
    ].filter(Boolean).join('\n');
};

export const socialNewsBoundaryPolicyPrompt = () => `### 公开知识与角色可信度边界（最高优先级）
1. 输入里的角色档案、世界书、关系印象、记忆、最近私聊都只是创作参考，不等于资讯站作者或路人知道这些内容。除非原文明确标注“公开/新闻已报道/大众皆知”，一律按私密资料处理。
2. 秘密身份、内心想法、私聊、私人习惯、未公开关系与剧情真相不得被媒体或路人猜中、暗示命中或集体附和。传闻口吻不能替越权知情开脱。
3. 角色档案里出现某个微小设定，不代表本批必须提它。眼镜、衣着、口头禅、饮食等细节只有在当前事件有直接因果作用时才出现；禁止为了证明读过设定而反复点题。
4. 不给已知角色强塞极端、危险、违法、伤害自己或严重违背人设的行为。涉及具名角色的行动必须有明确公开依据；没有依据就改写为与具名角色无关的城市现象、合理的周边人物经历，或直接删除。
5. 不需要每条都提用户或已知角色。允许创造店员、邻居、记者、游客、同事等一次性或可复用的周边 NPC，让世界自然运转；但不能凭空捏造他们与主角的亲密关系、共同历史或特权知情。
6. 同一批最多两条以具名角色为中心，其余从地点、职业、公共事件、生活习惯或周边 NPC 切入。零条直接提具名角色也完全合格。
7. 资讯仍是候选故事素材，不是当前事实、角色记忆或生活状态。`;

export interface SocialNewsReviewCharacter {
    id: string;
    name: string;
}

export interface ReviewedSocialNewsItem {
    [key: string]: unknown;
    editorDecision?: 'keep' | 'rewrite' | 'drop';
    riskFlags?: string[];
    knowledgeBasis?: 'ambient' | 'explicit-public' | 'peripheral-fiction';
    namedCharacterIds?: string[];
    namedCharacterBasis?: 'none' | 'explicit-public';
    relevanceReason?: string;
}

export const acceptReviewedSocialNewsItems = (
    items: ReviewedSocialNewsItem[],
    allowedCharacters: SocialNewsReviewCharacter[],
): ReviewedSocialNewsItem[] => {
    const allowedIds = new Set(allowedCharacters.map(character => character.id));
    return items.filter(item => {
        if (item.editorDecision !== 'keep' && item.editorDecision !== 'rewrite') return false;
        if (!Array.isArray(item.riskFlags) || item.riskFlags.length > 0) return false;
        if (!['ambient', 'explicit-public', 'peripheral-fiction'].includes(String(item.knowledgeBasis))) return false;
        if (!Array.isArray(item.namedCharacterIds) || item.namedCharacterIds.some(id => !allowedIds.has(String(id)))) return false;
        const titleAndContent = `${compact(item.title, 200)}\n${compact(item.content, 12_000)}`;
        const mentioned = allowedCharacters.filter(character => titleAndContent.includes(character.name));
        if (mentioned.some(character => !item.namedCharacterIds!.includes(character.id))) return false;
        if (mentioned.length > 0 && (
            item.knowledgeBasis !== 'explicit-public'
            || item.namedCharacterBasis !== 'explicit-public'
        )) return false;
        if (mentioned.length === 0 && item.namedCharacterIds.length > 0) return false;
        return Boolean(compact(item.title, 200) && compact(item.content, 12_000) && compact(item.relevanceReason, 240));
    });
};
