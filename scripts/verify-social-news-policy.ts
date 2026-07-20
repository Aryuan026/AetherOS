import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SocialPost } from '../types.ts';
import { dailyArchiveMessagesFromSocialPost } from '../utils/dailyArchive/lifeSurfaceSync.ts';
import {
    acceptReviewedSocialNewsItems,
    buildSocialNewsPreferenceProfile,
    buildSocialNewsPreferencePrompt,
    SOCIAL_NEWS_POLICY_VERSION,
    socialNewsBoundaryPolicyPrompt,
} from '../utils/socialNewsPolicy.ts';

const scopedNews = (overrides: Partial<SocialPost>): SocialPost => ({
    id: 'news-fixture',
    kind: 'news',
    sourceType: 'news',
    charId: null,
    authorName: '边角料',
    authorAvatar: '',
    title: '旧街区新开了一间夜班面包房',
    content: '这是不应进入偏好提示词的超长正文 SECRET_BODY_MARKER。',
    images: [],
    likes: 12,
    isCollected: false,
    isLiked: false,
    comments: [],
    timestamp: Date.parse('2026-07-20T10:00:00+08:00'),
    tags: ['资讯站'],
    newsCategory: 'daily',
    newsChannel: '边角料',
    storyLineStatus: 'candidate',
    storySeedStatus: 'candidate',
    socialScope: { progressBundleId: 'progress-a', personaMaskId: 'mask-a' },
    ...overrides,
});

const feedbackPosts = [
    scopedNews({
        id: 'liked',
        newsFeedback: {
            sentiment: 'like',
            reason: 'interesting-peripheral',
            note: '喜欢夜班店员这种自然出现的新人物',
            updatedAt: 20,
        },
    }),
    scopedNews({
        id: 'disliked',
        title: '某角色今天又把眼镜摘了',
        newsFeedback: {
            sentiment: 'dislike',
            reason: 'forced-setting',
            note: '不要因为档案里写了眼镜就每次都提',
            updatedAt: 30,
        },
    }),
];

const profile = buildSocialNewsPreferenceProfile(feedbackPosts);
assert.equal(profile.recentSignals.length, 2);
assert.ok(profile.dislikedReasons.some(reason => reason.includes('硬套设定')));
const preferencePrompt = buildSocialNewsPreferencePrompt(feedbackPosts);
assert.match(preferencePrompt, /不要因为档案里写了眼镜就每次都提/);
assert.doesNotMatch(preferencePrompt, /SECRET_BODY_MARKER/, 'preference prompt must not resend full article bodies');

const boundaryPrompt = socialNewsBoundaryPolicyPrompt();
for (const requiredBoundary of ['私密资料', '秘密身份', '微小设定', '极端', '周边 NPC', '最多两条']) {
    assert.ok(boundaryPrompt.includes(requiredBoundary), `missing Information Station boundary: ${requiredBoundary}`);
}

const allowedCharacters = [{ id: 'char-a', name: '星河' }];
const accepted = acceptReviewedSocialNewsItems([
    {
        editorDecision: 'rewrite',
        riskFlags: [],
        knowledgeBasis: 'peripheral-fiction',
        namedCharacterIds: [],
        namedCharacterBasis: 'none',
        relevanceReason: '让旧街区有独立运转的夜间生活。',
        title: '夜班面包房把最后一炉留给收工的人',
        content: '店员把写着“给晚归的人”的纸袋摆到了窗边。',
    },
    {
        editorDecision: 'keep',
        riskFlags: [],
        knowledgeBasis: 'explicit-public',
        namedCharacterIds: ['char-a'],
        namedCharacterBasis: 'explicit-public',
        relevanceReason: '角色参加的是资料明确写明的公开活动。',
        title: '星河将参加公开讲座',
        content: '主办方公开名单显示，星河会参加周末讲座。',
    },
    {
        editorDecision: 'drop',
        riskFlags: ['secret-leak'],
        knowledgeBasis: 'explicit-public',
        namedCharacterIds: ['char-a'],
        namedCharacterBasis: 'explicit-public',
        relevanceReason: '泄露秘密。',
        title: '路人猜中了秘密身份',
        content: '星河其实是另一个身份。',
    },
    {
        editorDecision: 'keep',
        riskFlags: ['out-of-character'],
        knowledgeBasis: 'explicit-public',
        namedCharacterIds: ['char-a'],
        namedCharacterBasis: 'explicit-public',
        relevanceReason: '无依据极端行为。',
        title: '星河要跳海',
        content: '有人说星河要跳海。',
    },
    {
        editorDecision: 'keep',
        riskFlags: [],
        knowledgeBasis: 'peripheral-fiction',
        namedCharacterIds: [],
        namedCharacterBasis: 'none',
        relevanceReason: '字段谎报。',
        title: '星河的私人习惯',
        content: '星河私下不戴眼镜。',
    },
], allowedCharacters);
assert.equal(accepted.length, 2, 'only audited ambient or explicitly public items may pass');

const newsEvidence = dailyArchiveMessagesFromSocialPost({
    post: scopedNews({
        evidenceAudienceCharIds: ['char-a'],
        newsEditorialAudit: {
            policyVersion: SOCIAL_NEWS_POLICY_VERSION,
            reviewedAt: Date.now(),
            knowledgeBasis: 'peripheral-fiction',
            namedCharacterIds: [],
            namedCharacterBasis: 'none',
            relevanceReason: '城市氛围',
        },
    }),
});
assert.deepEqual(newsEvidence, [], 'Information Station candidates must not become ordinary live memory evidence');

const socialSource = readFileSync(new URL('../apps/SocialApp.tsx', import.meta.url), 'utf8');
for (const integrationMarker of [
    'buildSocialNewsPreferencePrompt(scopedFeed)',
    'acceptReviewedSocialNewsItems',
    'patchPostInFeed(post.id, {',
    "throw new Error('\u751f\u6210\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5')",
    '以后想多刷到这种吗？',
    '只能回应帖子里公开可见的内容',
    '刷一批资讯',
    '再刷一批资讯',
]) {
    assert.ok(socialSource.includes(integrationMarker), `SocialApp missing integration marker: ${integrationMarker}`);
}

console.log('✅ Information Station policy, preference learning, editorial gate, and memory boundary verified');
