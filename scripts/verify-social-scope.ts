import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import type { SocialPost, SocialRelationshipScope, UserProfile } from '../types.ts';
import { DB } from '../utils/db.ts';
import {
    activeSocialRelationshipScope,
    inferLegacySocialPostScope,
    socialPostMatchesScope,
} from '../utils/socialScope.ts';
import { buildSocialProfileMetrics, visibleMomentLikes } from '../utils/socialMetrics.ts';

const now = Date.now();
const scopeA: SocialRelationshipScope = {
    progressBundleId: 'social-progress-a',
    personaMaskId: 'social-mask-a',
};
const scopeB: SocialRelationshipScope = {
    progressBundleId: 'social-progress-b',
    personaMaskId: 'social-mask-b',
};

const profile: UserProfile = {
    name: '面具 A',
    avatar: '',
    bio: '',
    activePersonaMaskId: scopeA.personaMaskId,
    activeProgressBundleId: scopeA.progressBundleId,
    personaMasks: [
        {
            id: scopeA.personaMaskId,
            label: '面具 A',
            name: '面具 A',
            avatar: '',
            bio: '',
            linkedCharacterIds: ['custom-char-a', 'shared-char'],
            progressBundleId: scopeA.progressBundleId,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: scopeB.personaMaskId,
            label: '面具 B',
            name: '面具 B',
            avatar: '',
            bio: '',
            linkedCharacterIds: ['custom-char-b', 'shared-char'],
            progressBundleId: scopeB.progressBundleId,
            createdAt: now,
            updatedAt: now,
        },
    ],
    progressBundles: [
        {
            id: scopeA.progressBundleId,
            maskId: scopeA.personaMaskId,
            label: '进度 A',
            surfacePolicy: { social: 'mask_scoped' },
            createdAt: now,
            updatedAt: now,
        },
        {
            id: scopeB.progressBundleId,
            maskId: scopeB.personaMaskId,
            label: '进度 B',
            surfacePolicy: { social: 'mask_scoped' },
            createdAt: now,
            updatedAt: now,
        },
    ],
};

const post = (id: string, patch: Partial<SocialPost> = {}): SocialPost => ({
    id,
    kind: 'moment',
    sourceType: 'character',
    charId: 'custom-char-a',
    authorName: '自建角色 A',
    authorAvatar: '',
    title: '作用域夹具',
    content: '这条动态只能留在面具 A。',
    images: [],
    likes: 0,
    isCollected: false,
    isLiked: false,
    comments: [],
    timestamp: now,
    tags: ['朋友圈'],
    socialScope: scopeA,
    ...patch,
});

assert.deepEqual(activeSocialRelationshipScope(profile), scopeA);
assert.equal(socialPostMatchesScope(post('scoped-a'), scopeA), true);
assert.equal(socialPostMatchesScope(post('scoped-a'), scopeB), false);

assert.deepEqual(
    inferLegacySocialPostScope(post('legacy-a', { socialScope: undefined }), profile),
    scopeA,
    'a custom character linked to one mask should migrate to that mask',
);
assert.equal(
    inferLegacySocialPostScope(post('legacy-shared', {
        socialScope: undefined,
        charId: 'shared-char',
    }), profile),
    undefined,
    'a character linked to multiple masks must not be guessed into the active mask',
);
assert.equal(
    inferLegacySocialPostScope(post('legacy-user', {
        socialScope: undefined,
        sourceType: 'user',
        charId: null,
    }), profile),
    undefined,
    'an unscoped user post with multiple masks must remain unassigned',
);

const singleMaskProfile: UserProfile = {
    ...profile,
    personaMasks: [profile.personaMasks![0]],
    progressBundles: [profile.progressBundles![0]],
};
assert.deepEqual(
    inferLegacySocialPostScope(post('legacy-single', {
        socialScope: undefined,
        sourceType: 'news',
        charId: null,
    }), singleMaskProfile),
    scopeA,
    'a sole valid mask can safely adopt legacy Social rows',
);

Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
});
const stored = post(`social-db-${now}`);
await DB.saveSocialPost(stored);
assert.equal((await DB.getSocialPosts()).some(item => item.id === stored.id), true);
await DB.deleteSocialPost(stored.id);
assert.equal((await DB.getSocialPosts()).some(item => item.id === stored.id), false, 'awaited delete must be observable immediately');

const socialSource = readFileSync(new URL('../apps/SocialApp.tsx', import.meta.url), 'utf8');
assert.match(socialSource, /socialScopedCharacters\.map/);
assert.match(socialSource, /socialScopedCharacters\.slice\(0, 8\)/);
assert.match(socialSource, /socialPostMatchesScope\(post, activeSocialScope\)/);
assert.match(socialSource, /编辑我的动态/);
assert.match(socialSource, /从当前生活圈移除/);
assert.match(socialSource, /我收藏的/);
assert.doesNotMatch(socialSource, />142<|>12\.5k<|>8902</);
assert.doesNotMatch(socialSource, /demo-moment|placeholderFeed|characters\.slice\(0, 1\)/);

const socialRows = [
    post('own', { sourceType: 'user', charId: null, authorName: '面具 A', likes: 99 }),
    post('char', { sourceType: 'character', charId: 'custom-char-a', authorName: '角色小号' }),
    post('npc', { sourceType: 'npc', charId: null, authorName: '邻居 C' }),
    post('news', { kind: 'news', sourceType: 'news', charId: null, authorName: '媒体号' }),
];
const metrics = buildSocialProfileMetrics(socialRows, ['custom-char-a', 'shared-char'], '面具 A');
assert.deepEqual(metrics, { audience: 3, ownPosts: 1, receivedLikes: 3 });
assert.equal(visibleMomentLikes(socialRows[0], metrics.audience), 3);

const inputSource = readFileSync(new URL('../components/chat/ChatInputArea.tsx', import.meta.url), 'utf8');
const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const expandedSource = readFileSync(new URL('../components/chat/ExpandedChatComposer.tsx', import.meta.url), 'utf8');
assert.match(inputSource, /aria-label="展开长消息编辑"/);
assert.match(inputSource, /collapsedMaxHeight = 72/);
assert.match(chatSource, /input=\{input\}/);
assert.match(chatSource, /setInput=\{handleInputChange\}/);
assert.match(expandedSource, /关闭后草稿仍会保留/);
assert.match(expandedSource, /回到聊天页后仍是同一份草稿/);

console.log('social scope and expanded composer contract: OK');
