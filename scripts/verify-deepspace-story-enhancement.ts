import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS,
  DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION,
  XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT,
  XAVIER_REVIEWED_STORY_WORLDBOOKS,
  storyEnhancementPackAllowsRuntime,
  validateDeepspaceStoryEnhancementPack,
  type DeepspaceStoryEnhancementPack,
} from '../domain/deepspaceStoryEnhancement/index.ts';
import { createWorldbookEntry } from '../domain/worldbook/index.ts';
import type { CharacterProfile } from '../types.ts';
import { DB } from '../utils/db.ts';
import { prepareWorldbookRuntimeProjection } from '../utils/worldbookRuntime.ts';

const base: DeepspaceStoryEnhancementPack = {
  schemaVersion: DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION,
  id: 'fixture:xavier:if',
  worldbookEntryId: 'fixture-worldbook:xavier:if',
  charId: 'builtin-xavier',
  sourceLane: 'if_line',
  worldlineId: 'fixture-if-worldline',
  routeStage: 'opening',
  contentAuthority: 'reviewed_source_projection',
  evidenceStrength: 'reviewed_multi_source',
  runtimeGate: {
    allowedConsumers: ['story_if', 'world_director', 'worldbook_preview'],
    identityModes: ['canon_hunter'],
    relationshipStageIds: ['fixture:relationship-established'],
  },
  activation: 'explicit_opt_in',
  defaultMounted: false,
  truthEffect: 'none',
  mergePolicy: 'additive_not_rewrite',
  prohibitedInferences: [
    'source route is not the current route merely because the package is mounted',
    'source relationship is not a player-lived experience without stage evidence',
  ],
  unresolvedClaims: [],
  sourceRefIds: ['fixture:reviewed-source'],
};

assert.deepEqual(validateDeepspaceStoryEnhancementPack(base), []);
assert.equal(storyEnhancementPackAllowsRuntime({
  pack: base,
  charId: 'builtin-xavier',
  consumer: 'story_if',
  continuity: { lane: 'if_line', routeId: 'fixture-if-worldline', branchId: 'fixture-branch' },
  context: {
    identityMode: 'canon_hunter',
    relationshipStageIds: ['fixture:relationship-established'],
  },
}), true, 'exact character, surface, identity and stage may use an explicitly mounted package');

assert.equal(storyEnhancementPackAllowsRuntime({
  pack: base,
  charId: 'builtin-xavier',
  consumer: 'chat',
  context: {
    identityMode: 'canon_hunter',
    relationshipStageIds: ['fixture:relationship-established'],
  },
}), false, 'an IF package must not leak into an unlisted surface');
assert.equal(storyEnhancementPackAllowsRuntime({
  pack: base,
  charId: 'builtin-zayne',
  consumer: 'story_if',
  context: {
    identityMode: 'canon_hunter',
    relationshipStageIds: ['fixture:relationship-established'],
  },
}), false, 'a package must not cross characters');
assert.equal(storyEnhancementPackAllowsRuntime({
  pack: base,
  charId: 'builtin-xavier',
  consumer: 'story_if',
  continuity: { lane: 'if_line', routeId: 'fixture-if-worldline', branchId: 'fixture-branch' },
  context: { identityMode: 'canon_hunter' },
}), false, 'missing relationship evidence fails closed');
assert.equal(storyEnhancementPackAllowsRuntime({
  pack: base,
  charId: 'builtin-xavier',
  consumer: 'story_if',
  continuity: { lane: 'if_line', routeId: 'fixture-if-worldline', branchId: 'fixture-branch' },
  context: { relationshipStageIds: ['fixture:relationship-established'] },
}), false, 'missing identity evidence fails closed');

assert.ok(validateDeepspaceStoryEnhancementPack({
  ...base,
  defaultMounted: true as false,
}).includes('defaultMounted must be false'));
assert.ok(validateDeepspaceStoryEnhancementPack({
  ...base,
  truthEffect: 'current' as 'none',
}).includes('truthEffect must be none'));

assert.equal(BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.length, 7);
assert.equal(XAVIER_REVIEWED_STORY_WORLDBOOKS.length, 7);
assert.equal(
  new Set(BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.map(pack => pack.worldbookEntryId)).size,
  7,
);
assert.equal(
  BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.filter(pack => pack.sourceLane === 'world_expansion').length,
  2,
);
assert.equal(
  XAVIER_REVIEWED_STORY_WORLDBOOKS.some(book => book.knowledgePolicy.kind === 'director_only'),
  false,
  'explicit optional route and expansion books must remain visible in the player library',
);
assert.equal(
  XAVIER_REVIEWED_STORY_WORLDBOOKS.some(book => book.id.includes('cosmic')),
  false,
  'an empty cosmic compatibility slot must not become a runtime book',
);
assert.equal(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT.includes('待填写占位卡'), false);
assert.equal(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT.includes('默认撒娇'), true);
assert.equal(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT.includes('菲罗斯王储'), false);
assert.ok(BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.every(pack => (
  pack.defaultMounted === false
  && pack.activation === 'explicit_opt_in'
  && pack.truthEffect === 'none'
  && pack.mergePolicy === 'additive_not_rewrite'
)));

const reviewedLibrary = XAVIER_REVIEWED_STORY_WORLDBOOKS.map((draft, index) => createWorldbookEntry({
  book: {
    id: draft.id,
    title: draft.title,
    content: draft.content,
    category: draft.category,
    activationHint: draft.activationHint,
    visibleToCharacterIds: [...draft.visibleToCharacterIds],
    createdAt: 100 + index,
    updatedAt: 100 + index,
    isBuiltIn: true,
    lockEditing: true,
    builtInVersion: 1,
  },
  knowledgePolicy: draft.knowledgePolicy,
}));
const scope = {
  progressBundleId: 'fixture-bundle',
  personaMaskId: 'fixture-mask',
  charId: 'builtin-xavier',
};
const runtimeCharacter = (mountedIds: readonly string[]) => ({
  id: 'builtin-xavier',
  mountedWorldbooks: reviewedLibrary
    .filter(book => mountedIds.includes(book.id))
    .map(book => ({ id: book.id, title: book.title, content: book.content })),
  mountedWorldbookGroupIds: [],
});
const project = (input: {
  mountedIds: readonly string[];
  consumer: 'chat' | 'story_mainline' | 'story_if' | 'world_director';
  query: string;
  continuity?: { lane: 'mainline' | 'if_line'; routeId: string; branchId?: string };
  identityMode?: 'custom_world' | 'custom_non_hunter' | 'custom_hunter' | 'canon_hunter';
}) => prepareWorldbookRuntimeProjection({
  requestId: `fixture:${input.consumer}:${input.query}`,
  library: reviewedLibrary,
  character: runtimeCharacter(input.mountedIds),
  scope,
  consumer: { kind: input.consumer, id: `fixture:${input.consumer}`, revision: '1' },
  knowledgeSubjects: [{ kind: 'character', id: 'builtin-xavier' }],
  continuity: input.continuity,
  query: input.query,
  storyContext: input.identityMode ? { identityMode: input.identityMode } : undefined,
  budget: { maxTotalChars: 1_200, maxEntries: 3, maxEntryChars: 600 },
}).projection.items.map(item => item.entryId);

const mainlineId = 'builtin-deepspace-story-xavier-mainline-hunter-n109';
const princeIfId = 'builtin-deepspace-story-xavier-philos-prince-knight-if';
const fateExpansionId = 'builtin-deepspace-expansion-xavier-fate-worldlines';
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'chat',
  query: 'N109 调查',
  identityMode: 'canon_hunter',
}), [], 'ordinary Chat must never receive an optional story route');
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'story_mainline',
  continuity: { lane: 'mainline', routeId: 'player-mainline' },
  query: 'N109 调查与深空猎人',
  identityMode: 'canon_hunter',
}), [mainlineId], 'a mounted mainline pack may reach a matching story consumer');
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'story_mainline',
  continuity: { lane: 'mainline', routeId: 'player-mainline' },
  query: 'N109 调查与深空猎人',
}), [], 'identity-gated mainline material fails closed without identity context');
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'story_mainline',
  continuity: { lane: 'mainline', routeId: 'player-mainline' },
  query: 'N109 调查与深空猎人',
  identityMode: 'custom_non_hunter',
}), [], 'hunter mainline material fails closed for a non-hunter identity');
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'story_if',
  continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
  query: 'N109 调查与深空猎人',
  identityMode: 'canon_hunter',
}), [], 'a native mainline pack must not cross into an IF lane');
assert.deepEqual(project({
  mountedIds: [princeIfId],
  consumer: 'story_if',
  continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
  query: '菲罗斯王储 骑士 星降森林',
}), [princeIfId], 'an explicitly mounted IF pack may reach an IF story');
assert.deepEqual(project({
  mountedIds: [fateExpansionId],
  consumer: 'story_mainline',
  continuity: { lane: 'mainline', routeId: 'player-mainline' },
  query: '多世界线 人理维持 时钟塔',
}), [fateExpansionId], 'an explicit additive expansion may reach story generation');
assert.deepEqual(project({
  mountedIds: [fateExpansionId],
  consumer: 'chat',
  query: '多世界线 人理维持 时钟塔',
}), [], 'an expansion must not leak into ordinary Chat');

await DB.deleteDB();
const deprecatedBook = createWorldbookEntry({
  book: {
    id: 'builtin-deepspace-story-xavier',
    title: '旧版沈星回剧情增强',
    content: '旧聚合正文',
    category: '深空剧情增强',
    createdAt: 1,
    updatedAt: 1,
    isBuiltIn: true,
    lockEditing: true,
    builtInVersion: 1,
  },
});
const unrelatedBook = createWorldbookEntry({
  book: {
    id: 'fixture-unrelated-book',
    title: '玩家资料',
    content: '不参与迁移',
    category: '玩家资料',
    createdAt: 2,
    updatedAt: 2,
  },
});
await DB.saveWorldbookRevision(deprecatedBook, null);
await DB.saveWorldbookRevision(unrelatedBook, null);
const character: CharacterProfile = {
  id: 'builtin-xavier',
  name: '沈星回',
  avatar: '',
  description: '',
  systemPrompt: '',
  worldview: '',
  memories: [],
  mountedWorldbooks: [
    { id: deprecatedBook.id, title: deprecatedBook.title, content: deprecatedBook.content },
    { id: unrelatedBook.id, title: unrelatedBook.title, content: unrelatedBook.content },
  ],
};
await DB.saveCharacter(character);
const migratedCharacters = await DB.removeDeprecatedBuiltInWorldbooks([
  'builtin-deepspace-story-xavier',
]);
assert.deepEqual(
  (await DB.getAllWorldbooks()).map(entry => entry.id),
  ['fixture-unrelated-book'],
  'migration deletes only the retired code-owned aggregate book',
);
assert.deepEqual(
  migratedCharacters[0]?.mountedWorldbooks?.map(entry => entry.id),
  ['fixture-unrelated-book'],
  'migration removes the retired mount without mounting replacement routes',
);

console.log('deepspace story enhancement contract: OK — explicit mounts, per-character routes, surface/identity/stage gates and truthEffect:none');
