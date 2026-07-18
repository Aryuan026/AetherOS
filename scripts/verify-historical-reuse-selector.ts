import assert from 'node:assert/strict';
import type {
    HistoricalDerivedBase,
    HistoricalKnowledgeScope,
    ResolvedHistoricalInterpretation,
} from '../domain/historyImport/analysis/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import type { CharacterProfile, UserProfile } from '../types.ts';
import {
    HISTORICAL_SURFACE_POLICIES,
    selectHistoricalRelationshipCandidates,
} from '../utils/memoryCore/historicalSelector.ts';
import { buildWorldlineMemoryReceipt } from '../utils/memoryCore/receipts.ts';
import { formatWorldlinePromptBlock } from '../utils/memoryCore/promptFormatter.ts';
import type { HistoricalConsumerSurface, WorldlinePromptContext } from '../utils/memoryCore/types.ts';

const SCOPE_A: HistoryScope = {
    progressBundleId: 'progress-a',
    personaMaskId: 'mask-a',
    charId: 'char-a',
};
const SCOPE_B: HistoryScope = {
    progressBundleId: 'progress-b',
    personaMaskId: 'mask-b',
    charId: 'char-a',
};
const user: UserProfile = {
    name: '阿鸢',
    avatar: '',
    bio: '',
    activePersonaMaskId: SCOPE_A.personaMaskId,
    activeProgressBundleId: SCOPE_A.progressBundleId,
    personaMasks: [{
        id: SCOPE_A.personaMaskId,
        label: '面具 A',
        name: '阿鸢',
        avatar: '',
        bio: '',
        linkedCharacterIds: [SCOPE_A.charId],
        progressBundleId: SCOPE_A.progressBundleId,
        createdAt: 1,
        updatedAt: 1,
    }],
    progressBundles: [{
        id: SCOPE_A.progressBundleId,
        maskId: SCOPE_A.personaMaskId,
        label: '进度 A',
        surfacePolicy: {},
        createdAt: 1,
        updatedAt: 1,
    }],
};
const char: CharacterProfile = {
    id: SCOPE_A.charId,
    name: '糯米',
    avatar: '',
    description: '',
    systemPrompt: '',
    memories: [],
};

const sourceRef = {
    documentId: 'daily:2025-07-16',
    documentRevision: 1,
    dateKey: '2025-07-16',
    startMessageOffset: 0,
    endMessageOffset: 2,
};
const base = (
    id: string,
    knowledge: HistoricalKnowledgeScope,
    status: HistoricalDerivedBase['status'] = 'confirmed',
): HistoricalDerivedBase => ({
    id,
    scope: { ...SCOPE_A },
    temporalClass: 'historical',
    sourceRefs: [{ ...sourceRef }],
    authority: knowledge === 'public_safe' ? 'source_explicit' : 'source_inferred',
    knowledge,
    confidence: 0.8,
    status,
    analysisRunId: 'run-a',
    extractorVersion: 'fixture-v1',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
});

const resolved: ResolvedHistoricalInterpretation = {
    schemaVersion: 2,
    workspaceId: 'workspace-a',
    workspaceRevision: 1,
    scope: { ...SCOPE_A },
    contributingPassIds: ['pass-a'],
    relationshipMemories: [
        { ...base('private-memory', 'relationship_private'), kind: 'relationship_memory', title: '只属于两人的雨天', summary: '两人在旧日记录里一起看雨。', memoryPolicy: 'relationship_echo' },
        { ...base('public-memory', 'public_safe'), kind: 'relationship_memory', title: '大家都知道的旅行', summary: '这段旅行可以在公开场景提起。', memoryPolicy: 'relationship_echo' },
        { ...base('user-memory', 'user_private'), kind: 'relationship_memory', title: '只给用户看的札记', summary: '不应交给角色。', memoryPolicy: 'relationship_echo' },
        { ...base('soft-memory', 'shared', 'soft_canon'), kind: 'relationship_memory', title: '尚未确认的共同片段', summary: '群聊不应收到软事实。', memoryPolicy: 'relationship_echo' },
    ],
    timebookNodes: [],
    narrativeProfile: {
        ...base('profile', 'relationship_private'),
        kind: 'narrative_profile',
        title: '旧剧情地图',
        summary: '只作历史参考。',
        routes: [],
        npcs: [],
        relationshipStages: [],
        openThreads: [{
            ...base('old-promise', 'relationship_private'),
            kind: 'open_thread',
            threadId: 'old-promise',
            title: '明天一起去蹦迪',
            summary: '这是旧记录中的约定，不是当前待办。',
            state: 'open',
        }],
    },
    provenance: [],
};

const expectedSurfaces: HistoricalConsumerSurface[] = [
    'chat', 'proactive_letter', 'group_chat', 'call', 'date', 'special_moments',
    'contact_impression', 'exchange_diary', 'storydesk', 'guidebook', 'social',
    'check_phone', 'songwriting', 'companion_plan', 'study', 'worldbook', 'room',
    'trpg', 'lifesim', 'bank', 'timebook', 'settings',
];
assert.deepEqual(Object.keys(HISTORICAL_SURFACE_POLICIES).sort(), [...expectedSurfaces].sort());

let readerCalls = 0;
const reader = async () => {
    readerCalls += 1;
    return resolved;
};
const chat = await selectHistoricalRelationshipCandidates({
    scope: SCOPE_A,
    user,
    charId: char.id,
    surface: 'chat',
    query: '雨天',
    reader,
});
assert.equal(readerCalls, 1);
assert.deepEqual(chat.candidates.map(item => item.title), ['大家都知道的旅行', '只属于两人的雨天', '尚未确认的共同片段']);
assert.equal(chat.candidates.every(item => item.temporalClass === 'historical'), true);
assert.equal(chat.candidates.some(item => item.summary.includes('只给用户')), false);

const group = await selectHistoricalRelationshipCandidates({
    scope: SCOPE_A,
    user,
    charId: char.id,
    surface: 'group_chat',
    reader,
});
assert.deepEqual(group.candidates.map(item => item.title), ['大家都知道的旅行']);

const storydesk = await selectHistoricalRelationshipCandidates({
    scope: SCOPE_A,
    user,
    charId: char.id,
    surface: 'storydesk',
    reader,
});
assert.equal(storydesk.candidates.some(item => item.title === '明天一起去蹦迪'), true);
assert.equal('openThreads' in storydesk, false, 'historical open threads must not become live openThreads');
const historicalPrompt = formatWorldlinePromptBlock(storydesk.candidates, [], 4_000);
assert.ok(historicalPrompt.includes('旧日关系证据（不是当前状态）'));
assert.ok(historicalPrompt.includes('不得据此生成当前关怀、待办、生活状态'));

for (const surface of ['study', 'worldbook', 'room', 'trpg', 'lifesim', 'bank', 'timebook', 'settings'] as const) {
    const callsBefore: number = readerCalls;
    const selection = await selectHistoricalRelationshipCandidates({
        scope: SCOPE_A,
        user,
        charId: char.id,
        surface,
        reader,
    });
    assert.equal(selection.candidates.length, 0);
    assert.equal(readerCalls, callsBefore, `${surface} must not open the historical database`);
}

const callsBeforeMissingQuery = readerCalls;
const socialWithoutQuery = await selectHistoricalRelationshipCandidates({
    scope: SCOPE_A,
    user,
    charId: char.id,
    surface: 'social',
    reader,
});
assert.equal(socialWithoutQuery.candidates.length, 0);
assert.equal(readerCalls, callsBeforeMissingQuery);

await assert.rejects(() => selectHistoricalRelationshipCandidates({
    scope: SCOPE_B,
    user,
    charId: char.id,
    surface: 'chat',
    reader,
}), /does not match/);
await assert.rejects(() => selectHistoricalRelationshipCandidates({
    scope: SCOPE_A,
    user,
    charId: char.id,
    surface: 'chat',
    reader: async () => ({ ...resolved, scope: { ...SCOPE_B } }),
}), /cross-scope/);

const context: WorldlinePromptContext = {
    markdown: 'PRIVATE RAW TEXT MUST NOT ENTER RECEIPT',
    candidates: chat.candidates,
    openThreads: [],
    budgetChars: 1_200,
    warnings: [],
    historicalDelivery: chat.metadata,
};
const receipt = buildWorldlineMemoryReceipt({
    char,
    user,
    mode: 'remote_chat',
    surface: 'chat',
    relationshipScope: SCOPE_A,
}, context, 100);
assert.deepEqual(receipt.relationshipScope, SCOPE_A);
assert.equal(receipt.surface, 'chat');
assert.equal(receipt.personaMaskLabel, '面具 A');
assert.equal(receipt.progressBundleLabel, '进度 A');
assert.equal(receipt.historicalCandidateCount, chat.candidates.length);
assert.equal('markdownPreview' in receipt, false);
assert.equal(JSON.stringify(receipt).includes('PRIVATE RAW TEXT'), false);
assert.equal(JSON.stringify(receipt).includes('membership'), false);

console.log('historical reuse selector scope, surface policy, and safe receipt verification passed');
