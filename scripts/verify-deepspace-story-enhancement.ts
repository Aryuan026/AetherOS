import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS,
  DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION,
  XAVIER_REVIEWED_BEHAVIOR_EVIDENCE_V4,
  XAVIER_REVIEWED_DATE_THEME_CANDIDATES_V4,
  XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT,
  XAVIER_REVIEWED_STORY_WORLDBOOKS,
  XAVIER_REVIEWED_WORLDVIEW,
  storyEnhancementPackAllowsRuntime,
  validateDeepspaceStoryEnhancementPack,
  type DeepspaceStoryEnhancementPack,
} from '../domain/deepspaceStoryEnhancement/index.ts';
import { BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL } from '../domain/companionMaterial/index.ts';
import { createWorldbookEntry } from '../domain/worldbook/index.ts';
import type { CharacterProfile } from '../types.ts';
import { DB } from '../utils/db.ts';
import { prepareWorldbookRuntimeProjection } from '../utils/worldbookRuntime.ts';

const base: DeepspaceStoryEnhancementPack = {
  schemaVersion: DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION,
  id: 'fixture:xavier:if',
  worldbookEntryId: 'fixture-worldbook:xavier:if',
  applicability: { kind: 'character', charId: 'builtin-xavier' },
  sourceLane: 'if_line',
  continuityClass: 'playable_if_premise',
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

assert.equal(storyEnhancementPackAllowsRuntime({
  pack: {
    ...base,
    id: 'fixture:universal:worldline',
    applicability: { kind: 'universal' },
    sourceLane: 'world_expansion',
    continuityClass: 'optional_world_expansion',
    runtimeGate: { allowedConsumers: ['story_mainline'] },
  },
  charId: 'builtin-zayne',
  consumer: 'story_mainline',
  continuity: { lane: 'mainline', routeId: 'fixture-mainline' },
}), true, 'a universal expansion may be explicitly mounted for a different character');

assert.ok(validateDeepspaceStoryEnhancementPack({
  ...base,
  defaultMounted: true as false,
}).includes('defaultMounted must be false'));
assert.ok(validateDeepspaceStoryEnhancementPack({
  ...base,
  truthEffect: 'current' as 'none',
}).includes('truthEffect must be none'));

assert.equal(BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.length, 13);
assert.equal(XAVIER_REVIEWED_STORY_WORLDBOOKS.length, 13);
assert.equal(
  new Set(BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.map(pack => pack.worldbookEntryId)).size,
  13,
);
assert.equal(
  BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.filter(pack => pack.sourceLane === 'world_expansion').length,
  2,
);
assert.equal(
  XAVIER_REVIEWED_STORY_WORLDBOOKS.filter(book => book.knowledgePolicy.kind === 'director_only').length,
  2,
  'source endings remain Director-only references while the eleven route/expansion books stay player-visible',
);
assert.equal(
  XAVIER_REVIEWED_STORY_WORLDBOOKS.filter(book => book.knowledgePolicy.kind !== 'director_only').length,
  11,
);
assert.equal(
  XAVIER_REVIEWED_STORY_WORLDBOOKS.some(book => book.id.includes('cosmic')),
  false,
  'an empty cosmic compatibility slot must not become a runtime book',
);
const fateExpansion = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-expansion-universal-multi-worldline');
const governanceExpansion = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-expansion-universal-anomaly-governance');
assert.match(fateExpansion?.content || '', /量子记录固定带/);
assert.match(fateExpansion?.content || '', /抑止力/);
assert.equal(fateExpansion?.title, 'Fate 式多世界线规则');
assert.doesNotMatch(fateExpansion?.content || '', /例如烬城菲罗斯世界线的 \{\{user\}\}/);
assert.match(fateExpansion?.content || '', /不会反向说明深空原作/);
assert.match(governanceExpansion?.content || '', /特殊事件部/);
assert.match(governanceExpansion?.content || '', /分级协作请求/);
assert.match(governanceExpansion?.content || '', /时钟塔/);
assert.equal(fateExpansion?.category, '通用拓展玩法');
assert.equal(governanceExpansion?.category, '通用拓展玩法');
assert.deepEqual(fateExpansion?.visibleToCharacterIds, []);
assert.deepEqual(governanceExpansion?.visibleToCharacterIds, []);
assert.equal(fateExpansion?.knowledgePolicy.kind, 'public');
assert.equal(governanceExpansion?.knowledgePolicy.kind, 'public');
const canonicalChronology = BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS
  .filter(pack => pack.continuityClass === 'canonical_chronology')
  .sort((left, right) => (left.chronologyOrder || 0) - (right.chronologyOrder || 0));
assert.deepEqual(
  canonicalChronology.map(pack => [pack.worldlineId, pack.routeStage, pack.chronologyOrder]),
  [
    ['present_world_xavier_canonical_chronology', 'special-police-013', 100],
    ['present_world_xavier_canonical_chronology', 'light-hunter-emergence', 200],
    ['present_world_xavier_canonical_chronology', 'restricted-zone-42-and-concealed-identity', 300],
    ['present_world_xavier_canonical_chronology', 'resident-hunter-mainline', 400],
    ['present_world_xavier_canonical_chronology', 'yicheng-pursuit-and-rift', 500],
    ['present_world_xavier_canonical_chronology', 'outcast-voyage-and-retro-team', 600],
    ['present_world_xavier_canonical_chronology', 'philos-transplant-and-stele-crisis', 700],
  ],
  'all seven Xavier stages are one ordered present-world history, not independent IF routes',
);
const emberPlayableBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-ember-city-if');
assert.match(emberPlayableBook?.content || '', /巴别会主教/);
assert.match(emberPlayableBook?.content || '', /烬河摆渡人/);
assert.match(emberPlayableBook?.content || '', /双星之剑/);
assert.match(emberPlayableBook?.content || '', /藏书馆钥匙/);
assert.doesNotMatch(emberPlayableBook?.content || '', /双死|共同留下|城市崩塌/);
assert.match(emberPlayableBook?.content || '', /没有被预先决定/);
assert.equal(emberPlayableBook?.title, '沈星回·烬城世界');
assert.doesNotMatch(`${emberPlayableBook?.title}\n${emberPlayableBook?.content}`, /可游玩/);
assert.ok(
  XAVIER_REVIEWED_STORY_WORLDBOOKS
    .filter(book => book.category === '沈星回现世履历')
    .every(book => book.content.length >= 400),
  'player-visible chronology books must carry concrete people, events, places and causality rather than stage summaries',
);
assert.ok(
  XAVIER_REVIEWED_STORY_WORLDBOOKS
    .filter(book => book.category === '沈星回IF世界')
    .every(book => book.content.length >= 600),
  'player-visible IF books must carry a playable world rather than a fixed ending summary',
);
assert.equal(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT.includes('待填写占位卡'), false);
assert.equal(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT.includes('默认撒娇'), true);
assert.equal(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT.includes('菲罗斯王储'), false);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /酸奶油青瓜三明治/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /实体钥匙/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /抑制器/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /ST-1101/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /不是你每轮对话的默认状态/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /小闹钟/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /心率也比常人偏低/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /沈一光/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /一枚硬币/);
assert.match(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /抓娃娃从入门到精通/);

const specialPoliceBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-special-police-anecdote');
const lightHunterBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-light-hunter-card');
const zone42Book = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-restricted-zone-42');
const mainlineBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-mainline-hunter-n109');
const yichengBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-yicheng-rift');
const outcastBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-outcast-voyage');
const transplantBook = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-philos-transplant-crisis');
const emberEndingReference = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-ember-city-ending-reference');
const philosEndingReference = XAVIER_REVIEWED_STORY_WORLDBOOKS.find(book => book.id === 'builtin-deepspace-story-xavier-philos-ending-reference');
assert.match(specialPoliceBook?.content || '', /ST-1101/);
assert.match(specialPoliceBook?.content || '', /SD19940122/);
assert.match(specialPoliceBook?.content || '', /沈大勇/);
assert.match(specialPoliceBook?.content || '', /赵老三/);
assert.match(lightHunterBook?.content || '', /2034 年裂空灾变/);
assert.match(lightHunterBook?.content || '', /《末日曦光》/);
assert.match(lightHunterBook?.content || '', /季秉程/);
assert.match(zone42Book?.content || '', /回溯Ⅱ号飞船/);
assert.match(zone42Book?.content || '', /休眠舱/);
assert.match(mainlineBook?.content || '', /第 85 号特令/);
assert.match(mainlineBook?.content || '', /花苑西路末班地铁/);
assert.match(mainlineBook?.content || '', /602 室/);
assert.match(mainlineBook?.content || '', /寰飞金融商务圈/);
assert.match(mainlineBook?.content || '', /被改造的芯核/);
assert.match(mainlineBook?.content || '', /蓝色原生磁线/);
assert.match(mainlineBook?.content || '', /红色异常磁线/);
assert.match(mainlineBook?.content || '', /携带以太芯核的能量/);
assert.match(mainlineBook?.content || '', /并不因此等同于以太芯核/);
assert.doesNotMatch(mainlineBook?.content || '', /以太芯核是一种经过改造/);
assert.doesNotMatch(mainlineBook?.content || '', /玩家|当前设定|当前剧情选择/);
assert.match(mainlineBook?.content || '', /原作猎人主线中的女主角/);
assert.doesNotMatch(mainlineBook?.content || '', /极地调查结束后，\{\{user\}\}/);
assert.match(yichengBook?.content || '', /瓦尔疗养院/);
assert.match(yichengBook?.content || '', /伊澄/);
assert.match(yichengBook?.content || '', /装甲货车/);
assert.match(yichengBook?.content || '', /普通市民.*表层现象/);
assert.match(outcastBook?.content || '', /嘉会大学/);
assert.match(outcastBook?.content || '', /回溯Ⅱ号/);
assert.match(outcastBook?.content || '', /普通学生.*设备异常/);
assert.match(transplantBook?.content || '', /女神圣剑碑/);
assert.match(transplantBook?.content || '', /苏洛维/);
assert.match(transplantBook?.content || '', /三小时/);
assert.match(transplantBook?.content || '', /Echo/);
assert.doesNotMatch(transplantBook?.content || '', /祁煜|利莫里亚|海神|月升/);
assert.equal(emberEndingReference?.knowledgePolicy.kind, 'director_only');
assert.equal(philosEndingReference?.knowledgePolicy.kind, 'director_only');
assert.match(emberEndingReference?.content || '', /不是.*预言|并不知道自己必然走向这里/);
assert.doesNotMatch(emberEndingReference?.content || '', /双死已经|必然双死/);
assert.match(philosEndingReference?.content || '', /不是新线路的固定步骤/);

const modelFacingMetaLanguage = /AetherOS|可游玩|玩法用途|使用边界|角色参与|适合展开|这是沈星回.*阶段|需要.*递送|当前挂载|本轮筛选|本轮递送|不应在生成时/;
assert.ok(
  XAVIER_REVIEWED_STORY_WORLDBOOKS.every(book => !modelFacingMetaLanguage.test(`${book.title}\n${book.content}`)),
  'worldbook content must contain story-world facts, never compiler or delivery instructions',
);
assert.doesNotMatch(XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT, /AetherOS|当前挂载|本轮递送/);
assert.doesNotMatch(XAVIER_REVIEWED_WORLDVIEW, /AetherOS|可游玩|世界书|挂载|递送|启用|关闭|玩家/);
const osContextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
assert.match(osContextSource, /普通芯核、改造芯核或出现异常磁线的芯核不会因此自动等同于以太芯核/);
assert.match(osContextSource, /部分被改造的芯核可以携带来自以太芯核的能量/);
assert.doesNotMatch(osContextSource, /以太芯核：极特殊的芯核类型，力量远超普通芯核。原作主控线/);
assert.ok(BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.every(pack => (
  pack.defaultMounted === false
  && pack.activation === 'explicit_opt_in'
  && pack.truthEffect === 'none'
  && pack.mergePolicy === 'additive_not_rewrite'
)));

assert.equal(XAVIER_REVIEWED_DATE_THEME_CANDIDATES_V4.length, 5);
assert.equal(XAVIER_REVIEWED_BEHAVIOR_EVIDENCE_V4.length, 4);
assert.ok(XAVIER_REVIEWED_DATE_THEME_CANDIDATES_V4.every(candidate => (
  candidate.status === 'typed_candidate'
  && candidate.allowedConsumers.length === 1
  && candidate.allowedConsumers[0] === 'date'
  && candidate.truthEffect === 'none'
  && candidate.runtimeDelivery === 'typed_only_not_connected'
  && candidate.currentFactPolicy.length > 0
  && candidate.sourceRefIds.every(ref => ref.startsWith('src:bwiki:'))
)));
assert.ok(XAVIER_REVIEWED_BEHAVIOR_EVIDENCE_V4.every(candidate => (
  candidate.status === 'reviewed_revision_evidence'
  && candidate.runtimeEligible === false
  && candidate.sourceRefIds.length >= 2
)));
const companionMaterialIds = new Set(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.map(record => record.id));
assert.ok(
  XAVIER_REVIEWED_DATE_THEME_CANDIDATES_V4.every(candidate => !companionMaterialIds.has(candidate.id)),
  'Date premises remain typed-only until Date supplies an explicit premise consumer',
);
assert.ok(
  XAVIER_REVIEWED_BEHAVIOR_EVIDENCE_V4.every(candidate => !companionMaterialIds.has(candidate.id)),
  'review evidence must not duplicate stable prompt guidance into CompanionMaterial',
);
const xavierDeltaV4Serialized = JSON.stringify({
  date: XAVIER_REVIEWED_DATE_THEME_CANDIDATES_V4,
  behavior: XAVIER_REVIEWED_BEHAVIOR_EVIDENCE_V4,
});
assert.doesNotMatch(xavierDeltaV4Serialized, /https?:\/\/|\/Users\/|research\/lysk|sourceTitle|currentMotives|relationshipMemory|playedTruth/);

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
const yichengId = 'builtin-deepspace-story-xavier-yicheng-rift';
const outcastId = 'builtin-deepspace-story-xavier-outcast-voyage';
const transplantId = 'builtin-deepspace-story-xavier-philos-transplant-crisis';
const princeIfId = 'builtin-deepspace-story-xavier-philos-prince-knight-if';
const emberIfId = 'builtin-deepspace-story-xavier-ember-city-if';
const emberEndingId = 'builtin-deepspace-story-xavier-ember-city-ending-reference';
const philosEndingId = 'builtin-deepspace-story-xavier-philos-ending-reference';
const fateExpansionId = 'builtin-deepspace-expansion-universal-multi-worldline';
const governanceExpansionId = 'builtin-deepspace-expansion-universal-anomaly-governance';
const mainlineRuntime = prepareWorldbookRuntimeProjection({
  requestId: 'fixture:chat:model-facing-audit',
  library: reviewedLibrary,
  character: runtimeCharacter([mainlineId]),
  scope,
  consumer: { kind: 'chat', id: 'fixture:chat', revision: '1' },
  knowledgeSubjects: [{ kind: 'character', id: 'builtin-xavier' }],
  query: '7号禁猎区的改造芯核和以太芯核是什么关系？',
  storyContext: { identityMode: 'canon_hunter' },
  budget: { maxTotalChars: 700, maxEntries: 1, maxEntryChars: 560 },
});
assert.match(mainlineRuntime.markdown, /当前可参考的世界信息/);
assert.match(mainlineRuntime.markdown, /沈星回·隐姓埋名的常驻猎人与主线调查/);
assert.match(mainlineRuntime.markdown, /携带以太芯核的能量/);
assert.match(mainlineRuntime.markdown, /并不因此等同于以太芯核/);
assert.match(mainlineRuntime.markdown, /协会.*不知道以太芯核/);
assert.doesNotMatch(mainlineRuntime.markdown, /沈星回现世履历|当前角色挂载|本轮相关世界资料|通用拓展玩法/);
const compiledModelContext = [
  XAVIER_REVIEWED_STABLE_SYSTEM_PROMPT,
  XAVIER_REVIEWED_WORLDVIEW,
  mainlineRuntime.markdown,
].join('\n\n');
assert.match(compiledModelContext, /被改造的芯核/);
assert.match(compiledModelContext, /携带以太芯核的能量/);
assert.doesNotMatch(compiledModelContext, /AetherOS|可游玩|当前挂载|本轮递送|通用拓展玩法|以太芯核是一种经过改造/);
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'chat',
  query: 'N109 调查',
  identityMode: 'canon_hunter',
}), [mainlineId], 'an explicitly mounted canonical history may answer a topic-relevant Chat turn');
assert.deepEqual(project({
  mountedIds: [mainlineId],
  consumer: 'chat',
  query: '今天午饭吃什么',
  identityMode: 'canon_hunter',
}), [], 'topic relevance must keep detailed history out of unrelated Chat turns');
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
for (const fixture of [
  { id: yichengId, query: '伊澄 瓦尔疗养院 空中隧道 装甲货车' },
  { id: outcastId, query: '嘉会大学 回溯Ⅱ号 重叠空间 严颂' },
  { id: transplantId, query: '女神圣剑碑 引力锚 菲罗斯 移植 Echo' },
]) {
  assert.deepEqual(project({
    mountedIds: [fixture.id],
    consumer: 'story_mainline',
    continuity: { lane: 'mainline', routeId: 'player-mainline' },
    query: fixture.query,
    identityMode: 'canon_hunter',
  }), [fixture.id], `${fixture.id} has a legal relevant mainline path`);
  assert.deepEqual(project({
    mountedIds: [fixture.id],
    consumer: 'chat',
    query: '午饭想吃烤肉配苏打水',
    identityMode: 'canon_hunter',
  }), [], `${fixture.id} stays out of unrelated Chat`);
  assert.deepEqual(project({
    mountedIds: [fixture.id],
    consumer: 'story_if',
    continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
    query: fixture.query,
    identityMode: 'canon_hunter',
  }), [], `${fixture.id} does not cross into an IF lane`);
}
assert.deepEqual(project({
  mountedIds: [princeIfId],
  consumer: 'story_if',
  continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
  query: '菲罗斯王储 骑士 星降森林',
}), [princeIfId], 'an explicitly mounted IF pack may reach an IF story');
const philosDirectorItems = project({
  mountedIds: [princeIfId],
  consumer: 'world_director',
  continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
  query: '菲罗斯原作终局 女王 首席圣剑骑士 辞行 远航',
});
assert.ok(
  philosDirectorItems.includes(philosEndingId),
  'mounting the visible Philos premise exposes its source ending only to the IF Director',
);
assert.ok(
  !project({
    mountedIds: [princeIfId],
    consumer: 'chat',
    query: '菲罗斯原作终局 女王 首席圣剑骑士 辞行 远航',
  }).includes(philosEndingId),
  'ordinary Chat never receives the paired source ending',
);
assert.deepEqual(project({
  mountedIds: [],
  consumer: 'world_director',
  continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
  query: '菲罗斯原作终局 女王 首席圣剑骑士 辞行 远航',
}), [], 'a source ending is not independently active without its visible premise');
const emberDirectorItems = project({
  mountedIds: [emberIfId],
  consumer: 'world_director',
  continuity: { lane: 'if_line', routeId: 'player-if', branchId: 'branch-a' },
  query: '烬城原作终局 双星之剑 城市崩塌 共同留下',
});
assert.ok(
  emberDirectorItems.includes(emberEndingId),
  'mounting the visible Ember premise exposes its cautious source-ending reference to the Director',
);
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
}), [fateExpansionId], 'an explicitly assigned expansion may reach a directly relevant Chat turn');

const zayneScope = {
  progressBundleId: 'fixture-zayne-bundle',
  personaMaskId: 'fixture-zayne-mask',
  charId: 'builtin-zayne',
};
const universalForZayne = prepareWorldbookRuntimeProjection({
  requestId: 'fixture:zayne:universal-worldline',
  library: reviewedLibrary,
  character: {
    id: 'builtin-zayne',
    mountedWorldbooks: reviewedLibrary
      .filter(book => book.id === fateExpansionId)
      .map(book => ({ id: book.id, title: book.title, content: book.content })),
    mountedWorldbookGroupIds: [],
  },
  scope: zayneScope,
  consumer: { kind: 'story_mainline', id: 'fixture:zayne:story-mainline', revision: '1' },
  knowledgeSubjects: [{ kind: 'character', id: 'builtin-zayne' }],
  continuity: { lane: 'mainline', routeId: 'fixture-zayne-mainline' },
  query: '多世界线 人理维持 时钟塔',
  budget: { maxTotalChars: 1_200, maxEntries: 3, maxEntryChars: 600 },
}).projection.items.map(item => item.entryId);
assert.deepEqual(
  universalForZayne,
  [fateExpansionId],
  'the universal multi-worldline package must really project for a different character, not only move in UI',
);

const universalGovernanceForZayne = prepareWorldbookRuntimeProjection({
  requestId: 'fixture:zayne:universal-anomaly-governance',
  library: reviewedLibrary,
  character: {
    id: 'builtin-zayne',
    mountedWorldbooks: reviewedLibrary
      .filter(book => book.id === governanceExpansionId)
      .map(book => ({ id: book.id, title: book.title, content: book.content })),
    mountedWorldbookGroupIds: [],
  },
  scope: zayneScope,
  consumer: { kind: 'story_mainline', id: 'fixture:zayne:story-mainline', revision: '1' },
  knowledgeSubjects: [{ kind: 'character', id: 'builtin-zayne' }],
  continuity: { lane: 'mainline', routeId: 'fixture-zayne-mainline' },
  query: '现代城市出现异常能量，需要跨部门保密调查与组织协作',
  budget: { maxTotalChars: 1_200, maxEntries: 3, maxEntryChars: 800 },
}).projection.items.map(item => item.entryId);
assert.deepEqual(
  universalGovernanceForZayne,
  [governanceExpansionId],
  'modern anomaly governance must really project for a different character after explicit assignment',
);

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
