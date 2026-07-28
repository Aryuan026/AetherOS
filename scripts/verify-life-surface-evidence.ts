import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import type { CharacterProfile, DiaryEntry, SocialPost } from '../types.ts';
import { DB } from '../utils/db.ts';
import { createDefaultHeartbeatRules } from '../utils/companionWakeups.ts';
import { dailyArchiveEvidenceReadPort } from '../utils/memoryCore/evidencePort.ts';
import {
    listAllDailyArchiveDocuments,
    listAllDailyArchiveMessageRevisions,
} from '../utils/dailyArchive/storage.ts';

const at = (value: string): number => Date.parse(value);
const scopeA = {
    progressBundleId: 'life-progress',
    personaMaskId: 'life-mask',
    charId: 'life-char-a',
};
const scopeB = {
    progressBundleId: 'life-progress',
    personaMaskId: 'life-mask',
    charId: 'life-char-b',
};
const otherMaskScopeA = {
    progressBundleId: 'other-progress',
    personaMaskId: 'other-mask',
    charId: scopeA.charId,
};

const character: CharacterProfile = {
    id: scopeA.charId,
    name: '星河',
    avatar: '',
    description: '虚构生活面验收角色',
    systemPrompt: '',
    memories: [],
};

await DB.saveMessage({
    charId: scopeA.charId,
    role: 'user',
    type: 'text',
    content: '电话里我说，今晚会晚一点回来。',
    timestamp: at('2026-07-20T10:00:00+08:00'),
    metadata: {
        source: 'call',
        callSessionId: 'call-fixture',
        interactionId: 'call:call-fixture',
        temporalClass: 'live',
        relationshipScope: scopeA,
    },
});

const groupMessageId = await DB.saveMessage({
    charId: 'user',
    groupId: 'group-fixture',
    role: 'user',
    type: 'text',
    content: '大家周末一起去看展吗？',
    timestamp: at('2026-07-20T10:05:00+08:00'),
    metadata: {
        source: 'group_chat',
        temporalClass: 'live',
        relationshipScopes: [scopeA, scopeB],
        interactionId: 'group:group-fixture',
        groupSpeakerCharId: 'user',
        groupSpeakerName: '旅人',
    },
});

const diary: DiaryEntry = {
    id: 'diary-fixture',
    charId: scopeA.charId,
    relationshipScope: scopeA,
    date: '2026-07-20',
    userPage: { text: '今天终于把花房收拾好了。', paperStyle: 'grid', stickers: [] },
    charPage: { text: '我把最后一盆薄荷放到了窗边。', paperStyle: 'plain', stickers: [] },
    timestamp: at('2026-07-20T10:10:00+08:00'),
    isArchived: false,
};
await DB.saveDiary(diary);

const socialPost: SocialPost = {
    id: 'social-fixture',
    kind: 'moment',
    sourceType: 'user',
    charId: null,
    authorName: '旅人',
    authorAvatar: '',
    title: '看展邀请',
    content: '周末一起去看玻璃艺术展。',
    images: [],
    likes: 0,
    isCollected: false,
    isLiked: false,
    comments: [{
        id: 'cmt-char-a',
        authorName: '星河',
        charId: scopeA.charId,
        content: '我把下午空出来。',
        likes: 0,
        isCharacter: true,
    }],
    timestamp: at('2026-07-20T10:15:00+08:00'),
    tags: ['朋友圈'],
    socialScope: {
        progressBundleId: scopeA.progressBundleId,
        personaMaskId: scopeA.personaMaskId,
    },
    evidenceAudienceCharIds: [scopeA.charId, scopeB.charId],
};
await DB.saveSocialPost(socialPost);

await DB.saveMessage({
    charId: scopeA.charId,
    role: 'assistant',
    type: 'text',
    content: '路过面包店，给你留了一块柠檬挞。',
    timestamp: at('2026-07-20T10:20:00+08:00'),
    metadata: {
        source: 'companion_wakeup',
        temporalClass: 'live',
        relationshipScope: scopeA,
        interactionId: 'proactive:fixture',
    },
});

const evidenceA = await dailyArchiveEvidenceReadPort.listActiveEvidence({
    scope: scopeA,
    temporalClass: 'live',
});
const surfacesA = new Set(evidenceA.map(record => record.evidence.source.surface));
for (const surface of ['call', 'group_chat', 'journal', 'social', 'proactive'] as const) {
    assert.ok(surfacesA.has(surface), `scope A missing ${surface} evidence`);
}
const evidenceB = await dailyArchiveEvidenceReadPort.listActiveEvidence({
    scope: scopeB,
    temporalClass: 'live',
});
assert.deepEqual(
    new Set(evidenceB.map(record => record.evidence.source.surface)),
    new Set(['group_chat', 'social']),
    'group/social evidence must be copied into each participant scope without private call/diary leakage',
);
assert.ok(evidenceA.some(record => (
    record.evidence.source.surface === 'group_chat'
    && record.content.includes('群聊发言人：旅人')
)), 'group evidence must preserve the transport speaker');

await DB.updateMessage(groupMessageId, '大家周日一起去看展吗？');
const groupRevisions = (await listAllDailyArchiveMessageRevisions())
    .filter(revision => revision.message.origin?.surface === 'group_chat');
assert.equal(groupRevisions.length, 2, 'one group edit must retain one superseded revision per participant scope');
await DB.deleteMessage(groupMessageId);
const afterGroupDeleteA = await dailyArchiveEvidenceReadPort.listActiveEvidence({ scope: scopeA, temporalClass: 'live' });
const afterGroupDeleteB = await dailyArchiveEvidenceReadPort.listActiveEvidence({ scope: scopeB, temporalClass: 'live' });
assert.ok(!afterGroupDeleteA.some(record => record.evidence.source.surface === 'group_chat'));
assert.ok(!afterGroupDeleteB.some(record => record.evidence.source.surface === 'group_chat'));

await DB.saveDiary({
    ...diary,
    userPage: { ...diary.userPage, text: '今天终于把玻璃花房收拾好了。' },
});
await DB.deleteDiary(diary.id);
await DB.deleteSocialPost(socialPost.id);
const documents = await listAllDailyArchiveDocuments();
assert.ok(documents.flatMap(document => document.messages).some(message => (
    message.origin?.surface === 'journal' && message.status === 'tombstoned'
)));
assert.ok(documents.flatMap(document => document.messages).some(message => (
    message.origin?.surface === 'social' && message.status === 'tombstoned'
)));

const scopedRules = createDefaultHeartbeatRules(character, 'direct', scopeA);
const otherMaskRules = createDefaultHeartbeatRules(character, 'direct', otherMaskScopeA);
assert.ok(scopedRules.every(rule => rule.relationshipScope?.personaMaskId === scopeA.personaMaskId));
assert.notDeepEqual(
    scopedRules.map(rule => rule.id),
    otherMaskRules.map(rule => rule.id),
    'the same character in two masks must not share delayed-rule ids',
);

const callSource = readFileSync(new URL('../apps/CallApp.tsx', import.meta.url), 'utf8');
const dateSource = readFileSync(new URL('../apps/DateApp.tsx', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('../apps/GroupChat.tsx', import.meta.url), 'utf8');
const journalSource = readFileSync(new URL('../apps/JournalApp.tsx', import.meta.url), 'utf8');
const chatSource = readFileSync(new URL('../hooks/useChatAI.ts', import.meta.url), 'utf8');
const wakeupSource = readFileSync(new URL('../hooks/useCompanionWakeupRuntime.ts', import.meta.url), 'utf8');
const materialRequestBuilderSource = readFileSync(
    new URL('../utils/companionMaterial/requestBuilders.ts', import.meta.url),
    'utf8',
);
for (const [source, seam] of [
    [callSource, 'callRelationshipScopeRef'],
    [groupSource, 'relationshipScopes: scopes'],
    [journalSource, 'relationshipScope: strictRelationshipScopeForProfile'],
    [wakeupSource, 'relationship_scope_missing'],
] as const) assert.ok(source.includes(seam), `life surface missing scoped seam: ${seam}`);
for (const seam of [
    'prepareCompanionMaterialPrompt',
    'buildWakeupCompanionMaterialRequest',
    "rule.priority === 'care'",
    'recordPreparedCompanionMaterialPromptDelivery',
    "revision: 'proactive-letter-v1'",
] as const) assert.ok(wakeupSource.includes(seam), `proactive material consumer missing seam: ${seam}`);
for (const seam of [
    "surface: 'proactive_letter'",
    "mode: 'proactive_letter'",
    "purpose: 'proactive_intent'",
    "kind: 'wakeup_rule'",
    "claimKey: 'proactive_intent'",
    'maxItems: 2',
] as const) assert.ok(
    materialRequestBuilderSource.includes(seam),
    `proactive material request builder missing seam: ${seam}`,
);
assert.ok(
    wakeupSource.lastIndexOf('recordPreparedCompanionMaterialPromptDelivery')
      > wakeupSource.indexOf("safeFetchJson(`${baseUrl}/chat/completions`"),
    'proactive material receipt must be recorded only after the provider accepted the prompt',
);
assert.ok(
    wakeupSource.indexOf('const normalizedContent = normalizeWakeupText')
      < wakeupSource.lastIndexOf('recordPreparedCompanionMaterialPromptDelivery'),
    'proactive material receipt must wait for a non-empty normalized completion',
);
assert.ok(
    chatSource.indexOf('ChatParser.hasDisplayContent(aiContent)')
      < chatSource.lastIndexOf('recordPreparedCompanionMaterialPromptDelivery'),
    'Chat material receipt must wait for a displayable completion instead of consuming the local fallback',
);
for (const seam of [
    'prepareCompanionMaterialPrompt',
    'buildCallCompanionMaterialRequest',
    'recordPreparedCompanionMaterialPromptDelivery',
    "revision: 'call-v1'",
] as const) assert.ok(callSource.includes(seam), `call material consumer missing seam: ${seam}`);
for (const seam of [
    "surface: 'call'",
    "mode: 'call'",
    "const purpose = input.opening ? 'opening' : 'stable_context'",
    "kind: 'call_session'",
    "claimKey: 'opened'",
    'maxItems: input.opening ? 2 : 1',
] as const) assert.ok(
    materialRequestBuilderSource.includes(seam),
    `call material request builder missing seam: ${seam}`,
);
assert.ok(
    callSource.lastIndexOf('recordPreparedCompanionMaterialPromptDelivery')
      > callSource.indexOf("safeFetchJson(`${baseUrl}/chat/completions`"),
    'call material receipt must be recorded only after the provider accepted the prompt',
);
assert.ok(
    callSource.indexOf("const assistantText = sanitizeAssistantOutput(chatData?.choices?.[0]?.message?.content || '')")
      < callSource.lastIndexOf('recordPreparedCompanionMaterialPromptDelivery'),
    'call material receipt must wait until transport labels are removed and displayable content remains',
);
for (const forbiddenPromptLeak of [
    '我刚差点把咖啡洒了',
    '今天有件事我还挺想跟你说的',
    '系统已经把你此刻所在的场景单独显示给用户',
] as const) {
    assert.ok(
        !callSource.includes(forbiddenPromptLeak),
        `call prompt must not use an invented-current-life example: ${forbiddenPromptLeak}`,
    );
}
for (const seam of [
    'prepareCompanionMaterialPrompt',
    'buildDateOpeningCompanionMaterialRequest',
    "surface: 'date'",
    "mode: 'date_scene'",
    "purpose: 'stable_context'",
    'recordPreparedCompanionMaterialPromptDelivery',
    "revision: 'date-opening-v1'",
    "revision: 'date-turn-v1'",
    "revision: 'date-reroll-v1'",
] as const) assert.ok(dateSource.includes(seam), `date material consumer missing seam: ${seam}`);
for (const seam of [
    "surface: 'meet_scene'",
    "mode: 'meet_scene'",
    "purpose: 'opening'",
    "kind: 'scene_context'",
    "claimKey: 'light_scene'",
    'maxItems: 2',
] as const) assert.ok(
    materialRequestBuilderSource.includes(seam),
    `date opening material request builder missing seam: ${seam}`,
);
assert.equal(
    dateSource.includes("purpose: 'scene_planning'"),
    false,
    'date prompt consumer must not bypass ScenePlan by consuming motive or scene-planning material directly',
);
assert.ok(
    dateSource.lastIndexOf('recordPreparedCompanionMaterialPromptDelivery')
      > dateSource.lastIndexOf('const data = await safeResponseJson(response);'),
    'date material receipt must be recorded only after a provider response is accepted',
);

console.log('life surface evidence OK: call, group, journal, social and proactive records are scoped, revisioned and tombstoned');
