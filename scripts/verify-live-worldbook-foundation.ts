import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION,
  WORLDBOOK_PROJECTION_SCHEMA_VERSION,
  acceptWorldGrowthCandidate,
  archiveWorldbookEntry,
  createWorldGrowthCandidate,
  createWorldbookEntry,
  createWorldbookProjectionDeliveryReceipt,
  getActiveWorldbookRevision,
  normalizeWorldbookEntry,
  projectWorldbook,
  refreshBuiltInWorldbookEntry,
  restoreWorldbookRevision,
  reviseWorldbookEntry,
  type WorldbookBinding,
  type WorldbookKnowledgeSubjectRef,
  type WorldbookProjectionConsumerRef,
} from '../domain/worldbook/index.ts';
import type { CharacterProfile, FullBackupData, Worldbook, WorldGrowthCandidate } from '../types.ts';
import { DB } from '../utils/db.ts';
import { indexedDbWorldbookPersistence } from '../utils/worldbookPersistence.ts';

const scopeA: HistoryScope = {
  progressBundleId: 'bundle-a',
  personaMaskId: 'mask-a',
  charId: 'char-a',
};
const scopeB: HistoryScope = {
  progressBundleId: 'bundle-b',
  personaMaskId: 'mask-b',
  charId: 'char-a',
};
const scopeWrongCharacter: HistoryScope = {
  progressBundleId: 'bundle-a',
  personaMaskId: 'mask-a',
  charId: 'char-b',
};
const characterSubject: WorldbookKnowledgeSubjectRef = { kind: 'character', id: 'char-a' };
const consumer = (
  kind: WorldbookProjectionConsumerRef['kind'] = 'story_mainline',
): WorldbookProjectionConsumerRef => ({ kind, id: `${kind}:fixture`, revision: '1' });
const legacyBook = (id: string, patch: Partial<Worldbook> = {}): Worldbook => ({
  id,
  title: id,
  content: `${id} 的正文`,
  category: '测试资料',
  createdAt: 1_000,
  updatedAt: 1_000,
  ...patch,
});
const binding = (value: WorldbookBinding): WorldbookBinding => value;
const roleGroup = {
  id: 'worldbook-group:char-a:story',
  name: '测试资料',
  owner: { kind: 'character' as const, charId: 'char-a' },
};

const projection = (input: {
  library: readonly Worldbook[];
  mountedEntryIds: readonly string[];
  knowledgeSubjects?: readonly WorldbookKnowledgeSubjectRef[];
  query?: string;
  scope?: HistoryScope;
  consumer?: WorldbookProjectionConsumerRef;
  continuity?: { lane: 'mainline' | 'if_line'; routeId?: string; branchId?: string };
  explicitRefs?: readonly { entryId: string; revisionId?: string }[];
  budgetChars?: number;
}) => projectWorldbook({
  schemaVersion: WORLDBOOK_PROJECTION_SCHEMA_VERSION,
  requestId: `projection:${Math.random()}`,
  scope: input.scope ?? scopeA,
  consumer: input.consumer ?? consumer(),
  continuity: input.continuity ?? { lane: 'mainline', routeId: 'route-main' },
  library: input.library,
  mountedEntryIds: input.mountedEntryIds,
  knowledgeSubjects: input.knowledgeSubjects ?? [],
  query: input.query ?? '星港守门人',
  explicitRefs: input.explicitRefs,
  budgetChars: input.budgetChars ?? 180,
  maxEntries: 4,
  maxCharsPerEntry: 120,
});

// Legacy normalization is lossless and never turns UI visibility into a secret policy.
const legacyVisible = normalizeWorldbookEntry(legacyBook('legacy-visible', {
  title: '旧星港',
  content: '旧数据正文必须完整保留。',
  category: '旧分组',
  activationHint: '提到星港时',
  visibleToCharacterIds: ['char-a'],
}));
const legacyRevision = getActiveWorldbookRevision(legacyVisible);
assert.equal(legacyVisible.title, '旧星港');
assert.equal(legacyVisible.content, '旧数据正文必须完整保留。');
assert.equal(legacyVisible.category, '旧分组');
assert.equal(legacyRevision.knowledgePolicy.kind, 'public');
assert.equal(legacyRevision.bindings[0]?.kind, 'global');
assert.equal(
  projection({
    library: [legacyVisible],
    mountedEntryIds: [legacyVisible.id],
    query: '旧星港',
    knowledgeSubjects: [],
  }).items.length,
  1,
  'legacy visibleToCharacterIds must remain UI visibility, not an in-world knower list',
);
assert.equal(
  projection({
    library: [legacyVisible],
    mountedEntryIds: [legacyVisible.id],
    query: '旧星港',
    scope: scopeWrongCharacter,
    knowledgeSubjects: [],
  }).items.length,
  0,
  'legacy Character-UI visibility remains a separate mountability gate',
);
assert.equal(
  projection({ library: [legacyVisible], mountedEntryIds: [], query: '旧星港' }).items.length,
  0,
  'a global binding must not enable an unmounted entry',
);

const mainAndIf = createWorldbookEntry({
  book: legacyBook('shared-route-lore', {
    title: '雾港守门人',
    content: '老周守着雾港北门，钥匙刻着潮汐纹。'.repeat(8),
    activationHint: '雾港、北门、守门人或钥匙相关场景',
    group: roleGroup,
  }),
  aliases: ['门卫老周', '守钥人'],
  bindings: [
    binding({ id: 'bind-main', kind: 'mainline', scope: scopeA, routeId: 'route-main' }),
    binding({ id: 'bind-if', kind: 'if_branch', scope: scopeA, routeId: 'route-if', branchId: 'branch-moon' }),
  ],
  knowledgePolicy: { kind: 'entities', subjects: [characterSubject] },
  sourceRef: { kind: 'player', refId: 'manual:shared-route-lore' },
});

assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [],
}).items.length, 0, 'entity knowledge must fail closed when no viewpoint subject is supplied');
assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [],
  consumer: { kind: 'story_mainline', id: 'char-a', revision: '1' },
}).items.length, 0, 'a consumer id that looks like a character id must not grant knowledge');
assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [{ kind: 'npc', id: 'char-a' }],
}).items.length, 0, 'consumer ids and matching raw ids cannot impersonate a knowledge subject kind');
const selectedMain = projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
});
assert.deepEqual(selectedMain.items[0]?.matchedBindingIds, ['bind-main']);
assert.ok(selectedMain.usedChars <= selectedMain.budgetChars);
assert.ok((selectedMain.items[0]?.charCount ?? 0) <= 120);

const selectedIf = projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
  consumer: consumer('story_if'),
  continuity: { lane: 'if_line', routeId: 'route-if', branchId: 'branch-moon' },
});
assert.deepEqual(selectedIf.items[0]?.matchedBindingIds, ['bind-if']);
assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
  scope: scopeB,
}).items.length, 0, 'relationship scope must not cross persona or progress bundle');
assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
  query: '你好',
}).items.length, 0, 'ordinary greetings must not pull an entire mounted library');

const activeMainRevision = getActiveWorldbookRevision(mainAndIf);
assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
  query: '你好',
  explicitRefs: [{ entryId: mainAndIf.id, revisionId: activeMainRevision.id }],
}).items[0]?.selectedBy, 'explicit_ref');
assert.equal(projection({
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
  explicitRefs: [{ entryId: mainAndIf.id, revisionId: 'stale-revision' }],
}).items.length, 0);

const directorOnly = createWorldbookEntry({
  book: legacyBook('director-secret', { title: '导演秘密', content: 'A 与 B 是同一人。' }),
  knowledgePolicy: { kind: 'director_only' },
  sourceRef: { kind: 'player', refId: 'manual:director-secret' },
});
assert.equal(projection({
  library: [directorOnly],
  mountedEntryIds: [directorOnly.id],
  knowledgeSubjects: [{ kind: 'narrator', id: 'narrator' }],
  query: '导演秘密',
}).items.length, 0);
assert.equal(projection({
  library: [directorOnly],
  mountedEntryIds: [directorOnly.id],
  knowledgeSubjects: [{ kind: 'narrator', id: 'narrator' }],
  query: '导演秘密',
  consumer: consumer('world_director'),
}).items.length, 1);

const secondRevision = reviseWorldbookEntry({
  current: mainAndIf,
  patch: { content: '第二版：老周把钥匙交给了守潮人。' },
  sourceRef: { kind: 'player', refId: 'edit:2' },
  updatedAt: 2_000,
});
assert.equal(secondRevision.revisionSnapshots?.length, 2);
const alternateSecondRevision = reviseWorldbookEntry({
  current: mainAndIf,
  patch: { content: '另一份第二版：老周仍保管潮汐钥匙。' },
  sourceRef: { kind: 'player', refId: 'edit:alternate-2' },
  updatedAt: 2_100,
});
const duplicateRevisionNumberEntry: Worldbook = {
  ...alternateSecondRevision,
  revisionSnapshots: [
    ...secondRevision.revisionSnapshots!,
    getActiveWorldbookRevision(alternateSecondRevision),
  ],
};
assert.throws(
  () => normalizeWorldbookEntry(duplicateRevisionNumberEntry),
  /duplicate revision numbers/,
  'different snapshot ids must not disguise the same revision number',
);
const restored = restoreWorldbookRevision({
  current: secondRevision,
  revisionId: activeMainRevision.id,
  restoredAt: 3_000,
});
assert.equal(restored.revisionSnapshots?.length, 3);
assert.equal(restored.content, mainAndIf.content);
assert.equal(getActiveWorldbookRevision(restored).sourceRefs[0]?.kind, 'revision_restore');
const archived = archiveWorldbookEntry({
  current: restored,
  sourceRef: { kind: 'player', refId: 'archive:1' },
  archivedAt: 4_000,
});
assert.equal(getActiveWorldbookRevision(archived).publicationStatus, 'archived');
assert.equal(projection({
  library: [archived],
  mountedEntryIds: [archived.id],
  knowledgeSubjects: [characterSubject],
}).items.length, 0);

const builtIn = createWorldbookEntry({
  book: legacyBook('builtin-deepspace', {
    title: '深空书',
    isBuiltIn: true,
    lockEditing: true,
    builtInVersion: 1,
  }),
});
assert.throws(() => reviseWorldbookEntry({
  current: builtIn,
  patch: { content: '偷偷覆盖内置正文' },
  sourceRef: { kind: 'player', refId: 'bad-edit' },
}), /read-only/);
const supplement = createWorldbookEntry({
  book: legacyBook('builtin-supplement', { title: '我的深空补充', content: '补充一处海边观察站。' }),
  supplementsEntryIds: [builtIn.id],
  sourceRef: { kind: 'player', refId: 'manual:supplement' },
});
assert.deepEqual(getActiveWorldbookRevision(supplement).supplementsEntryIds, [builtIn.id]);

assert.throws(() => projectWorldbook({
  schemaVersion: WORLDBOOK_PROJECTION_SCHEMA_VERSION,
  requestId: 'bad-scope',
  scope: { ...scopeA, personaMaskId: '' },
  consumer: consumer(),
  continuity: { lane: 'mainline' },
  library: [mainAndIf],
  mountedEntryIds: [mainAndIf.id],
  knowledgeSubjects: [characterSubject],
  query: '雾港',
  budgetChars: 100,
  maxEntries: 2,
}), /scope rejected/);

const receipt = createWorldbookProjectionDeliveryReceipt({
  projection: selectedMain,
  consumer: selectedMain.consumer,
  deliveredAt: 5_000,
});
assert.equal(receipt.truthEffect, 'none');
assert.equal('excerpt' in receipt.delivered[0], false, 'delivery receipt must remain metadata-only');

// Production IndexedDB: revision + all mounted portability caches are atomic.
await DB.deleteDB();
const mountedCharacter = (id: string): CharacterProfile => ({
  id,
  name: id,
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
  mountedWorldbooks: [{
    id: mainAndIf.id,
    title: '旧缓存',
    content: '旧缓存',
    category: '旧缓存',
  }],
} as CharacterProfile);
await DB.saveCharacter(mountedCharacter('char-a'));
await DB.saveCharacter(mountedCharacter('char-b'));
await indexedDbWorldbookPersistence.createEntry(mainAndIf);
let storedCharacters = await DB.getAllCharacters();
assert.equal(storedCharacters.every(character => (
  character.mountedWorldbooks?.[0]?.content === mainAndIf.content
)), true);

const persistedV1 = (await DB.getAllWorldbooks()).find(book => book.id === mainAndIf.id)!;
const persistedV1Id = getActiveWorldbookRevision(persistedV1).id;
const persistedV2 = reviseWorldbookEntry({
  current: persistedV1,
  patch: { content: '事务第二版：北门新增潮汐锁。' },
  sourceRef: { kind: 'player', refId: 'transaction-edit:2' },
  updatedAt: 6_000,
});
await indexedDbWorldbookPersistence.updateEntry(persistedV2, persistedV1Id);
storedCharacters = await DB.getAllCharacters();
assert.equal(storedCharacters.every(character => (
  character.mountedWorldbooks?.[0]?.content === persistedV2.content
)), true);

const staleAttempt = reviseWorldbookEntry({
  current: persistedV1,
  patch: { content: '不应覆盖已落地第二版的并发版本' },
  sourceRef: { kind: 'player', refId: 'stale-edit' },
  updatedAt: 7_000,
});
await assert.rejects(
  () => indexedDbWorldbookPersistence.updateEntry(staleAttempt, persistedV1Id),
  /stale/,
);
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === mainAndIf.id)?.content,
  persistedV2.content,
);
assert.equal((await DB.getAllCharacters()).every(character => (
  character.mountedWorldbooks?.[0]?.content === persistedV2.content
)), true, 'aborted stale revision must leave entry and every portability cache unchanged');

const builtInV1 = createWorldbookEntry({
  book: legacyBook('builtin-concurrent-refresh', {
    isBuiltIn: true,
    lockEditing: true,
    builtInVersion: 1,
  }),
  knowledgePolicy: { kind: 'public' },
});
await indexedDbWorldbookPersistence.createEntry(builtInV1);
const builtInV1RevisionId = getActiveWorldbookRevision(builtInV1).id;
const builtInV2 = refreshBuiltInWorldbookEntry({
  current: builtInV1,
  incoming: {
    ...builtInV1,
    content: '第二版内置资料',
    builtInVersion: 2,
  },
  refreshedAt: 7_250,
});
await indexedDbWorldbookPersistence.updateEntry(builtInV2, builtInV1RevisionId);
await indexedDbWorldbookPersistence.updateEntry(builtInV2, builtInV1RevisionId);
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === builtInV2.id)?.content,
  '第二版内置资料',
  'the exact same built-in version may race safely without weakening ordinary stale-write rejection',
);

const forcedAbortRevision = reviseWorldbookEntry({
  current: persistedV2,
  patch: { content: '排队写入后也必须整体回滚' },
  sourceRef: { kind: 'player', refId: 'forced-transaction-abort' },
  updatedAt: 7_500,
});
const originalObjectStorePut = IDBObjectStore.prototype.put;
let queuedWorldbookWrite = false;
(IDBObjectStore.prototype as any).put = function patchedPut(
  this: IDBObjectStore,
  value: unknown,
  key?: IDBValidKey,
) {
  if (this.name === 'worldbooks') queuedWorldbookWrite = true;
  if (this.name === 'characters' && queuedWorldbookWrite) {
    throw new DOMException('fixture forces cache write failure', 'DataCloneError');
  }
  return key === undefined
    ? originalObjectStorePut.call(this, value)
    : originalObjectStorePut.call(this, value, key);
};
try {
  await assert.rejects(() => indexedDbWorldbookPersistence.updateEntry(
    forcedAbortRevision,
    persistedV2.activeRevisionId!,
  ));
} finally {
  IDBObjectStore.prototype.put = originalObjectStorePut;
}
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === persistedV2.id)?.activeRevisionId,
  persistedV2.activeRevisionId,
  'a cache-write failure must roll back the already queued entry revision',
);
assert.equal((await DB.getAllCharacters()).every(character => (
  character.mountedWorldbooks?.[0]?.content === persistedV2.content
)), true, 'a cache-write failure must leave every mounted portability cache unchanged');

await assert.rejects(
  () => DB.importFullData({
    timestamp: 7_600,
    version: 5,
    worldbooks: [duplicateRevisionNumberEntry],
  } as FullBackupData),
  /duplicate revision numbers/,
  'a malformed backup with duplicate revision numbers must be rejected before import',
);
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === persistedV2.id)?.activeRevisionId,
  persistedV2.activeRevisionId,
  'rejected malformed backup must not alter the live library',
);

const candidate = createWorldGrowthCandidate({
  id: 'growth-candidate-1',
  targetEntryId: persistedV2.id,
  baseRevisionId: persistedV2.activeRevisionId,
  scope: scopeA,
  source: {
    kind: 'narrative',
    refId: 'confirmed-scene:1',
    lane: 'mainline',
    routeId: 'route-main',
  },
  draft: {
    title: persistedV2.title,
    content: '玩家审核后接纳：北门新增潮汐锁与守潮铃。',
    category: persistedV2.category,
    bindings: [{ id: 'candidate-mainline', kind: 'mainline', scope: scopeA, routeId: 'route-main' }],
    knowledgePolicy: { kind: 'entities', subjects: [characterSubject] },
    sourceRefs: [{ kind: 'narrative_promotion', refId: 'confirmed-scene:1' }],
  },
  createdAt: 8_000,
});
assert.equal(candidate.truthEffect, 'none');
assert.throws(() => createWorldGrowthCandidate({
  id: 'bad-if-growth-candidate',
  scope: scopeA,
  source: {
    kind: 'narrative',
    refId: 'confirmed-if-scene:1',
    lane: 'if_line',
    routeId: 'route-if',
    branchId: 'branch-moon',
  },
  draft: {
    title: '不应泄漏的 IF 设定',
    content: '不能绑定到主线。',
    category: '路线',
    bindings: [{ id: 'bad-mainline', kind: 'mainline', scope: scopeA, routeId: 'route-main' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'narrative_promotion', refId: 'confirmed-if-scene:1' }],
  },
  createdAt: 8_100,
}), /exact lane/);
await indexedDbWorldbookPersistence.saveGrowthCandidate(candidate);
assert.equal(
  projection({
    library: [persistedV2],
    mountedEntryIds: [persistedV2.id],
    knowledgeSubjects: [characterSubject],
    query: '守潮铃',
  }).items.length,
  0,
  'a stored growth candidate must not appear in runtime projection before acceptance',
);
const accepted = acceptWorldGrowthCandidate({ candidate, currentEntry: persistedV2, acceptedAt: 9_000 });
await assert.rejects(() => DB.saveWorldGrowthCandidate(accepted.candidate), /atomic entry commit path/);
await indexedDbWorldbookPersistence.commitAcceptedCandidate({
  ...accepted,
  expectedBaseRevisionId: candidate.baseRevisionId!,
  expectedCandidateUpdatedAt: candidate.updatedAt,
});
assert.equal(
  (await DB.getAllWorldGrowthCandidates()).find(item => item.id === candidate.id)?.status,
  'accepted',
);
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === persistedV2.id)?.activeRevisionId,
  accepted.entry.activeRevisionId,
);
await assert.rejects(() => DB.saveWorldGrowthCandidate({
  ...candidate,
  updatedAt: 9_500,
}), /cannot change from accepted/);

const tamperCandidate = createWorldGrowthCandidate({
  id: 'growth-candidate-tamper',
  targetEntryId: accepted.entry.id,
  baseRevisionId: accepted.entry.activeRevisionId,
  scope: scopeA,
  source: {
    kind: 'narrative',
    refId: 'confirmed-scene:tamper',
    lane: 'mainline',
    routeId: 'route-main',
  },
  draft: {
    title: accepted.entry.title,
    content: '候选真正申请写入的潮汐钟设定。',
    category: accepted.entry.category,
    bindings: [{ id: 'candidate-tamper-mainline', kind: 'mainline', scope: scopeA, routeId: 'route-main' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'narrative_promotion', refId: 'confirmed-scene:tamper' }],
  },
  createdAt: 9_600,
});
await indexedDbWorldbookPersistence.saveGrowthCandidate(tamperCandidate);
const legitimateTamperAcceptance = acceptWorldGrowthCandidate({
  candidate: tamperCandidate,
  currentEntry: accepted.entry,
  acceptedAt: 9_700,
});
const attackerSuppliedEntry = reviseWorldbookEntry({
  current: accepted.entry,
  patch: {
    ...tamperCandidate.draft,
    content: '调用方偷偷替换成了不在候选里的任意正文。',
  },
  sourceRef: { kind: 'narrative_promotion', refId: tamperCandidate.source.refId },
  updatedAt: 9_700,
});
const attackerSuppliedAcceptance: WorldGrowthCandidate = {
  ...legitimateTamperAcceptance.candidate,
  acceptedRevisionId: attackerSuppliedEntry.activeRevisionId,
};
await assert.rejects(
  () => indexedDbWorldbookPersistence.commitAcceptedCandidate({
    entry: attackerSuppliedEntry,
    candidate: attackerSuppliedAcceptance,
    expectedBaseRevisionId: tamperCandidate.baseRevisionId!,
    expectedCandidateUpdatedAt: tamperCandidate.updatedAt,
  }),
  /does not match the stored proposal/,
);
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === accepted.entry.id)?.activeRevisionId,
  accepted.entry.activeRevisionId,
  'tampered accepted entry must not change the stored Worldbook',
);
assert.equal(
  (await DB.getAllWorldGrowthCandidates()).find(item => item.id === tamperCandidate.id)?.status,
  'pending',
  'tampered accepted entry must not mark its candidate accepted',
);

const abortCandidate = createWorldGrowthCandidate({
  id: 'growth-candidate-abort',
  targetEntryId: accepted.entry.id,
  baseRevisionId: accepted.entry.activeRevisionId,
  scope: scopeA,
  source: {
    kind: 'narrative',
    refId: 'confirmed-scene:abort',
    lane: 'mainline',
    routeId: 'route-main',
  },
  draft: {
    title: accepted.entry.title,
    content: '这次事务必须整体回滚。',
    category: accepted.entry.category,
    bindings: [{ id: 'candidate-abort-mainline', kind: 'mainline', scope: scopeA, routeId: 'route-main' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'narrative_promotion', refId: 'confirmed-scene:abort' }],
  },
  createdAt: 10_000,
});
await indexedDbWorldbookPersistence.saveGrowthCandidate(abortCandidate);
const abortAccepted = acceptWorldGrowthCandidate({
  candidate: abortCandidate,
  currentEntry: accepted.entry,
  acceptedAt: 11_000,
});
const originalCandidateCommitPut = IDBObjectStore.prototype.put;
let queuedAcceptedEntry = false;
(IDBObjectStore.prototype as any).put = function patchedAcceptedCandidatePut(
  this: IDBObjectStore,
  value: unknown,
  key?: IDBValidKey,
) {
  if (this.name === 'worldbooks') queuedAcceptedEntry = true;
  if (this.name === 'worldbook_growth_candidates' && queuedAcceptedEntry) {
    throw new DOMException('fixture forces candidate write failure', 'DataCloneError');
  }
  return key === undefined
    ? originalCandidateCommitPut.call(this, value)
    : originalCandidateCommitPut.call(this, value, key);
};
try {
  await assert.rejects(() => indexedDbWorldbookPersistence.commitAcceptedCandidate({
    entry: abortAccepted.entry,
    candidate: abortAccepted.candidate,
    expectedBaseRevisionId: abortCandidate.baseRevisionId!,
    expectedCandidateUpdatedAt: abortCandidate.updatedAt,
  }));
} finally {
  IDBObjectStore.prototype.put = originalCandidateCommitPut;
}
assert.equal(
  (await DB.getAllWorldbooks()).find(book => book.id === accepted.entry.id)?.activeRevisionId,
  accepted.entry.activeRevisionId,
  'transaction abort must roll back the queued entry revision',
);
assert.equal(
  (await DB.getAllWorldGrowthCandidates()).find(item => item.id === abortCandidate.id)?.status,
  'pending',
  'transaction abort must leave the proposal unaccepted',
);

const persistedBeforeArchive = (await DB.getAllWorldbooks())
  .find(book => book.id === accepted.entry.id)!;
const archivedPersisted = archiveWorldbookEntry({
  current: persistedBeforeArchive,
  sourceRef: { kind: 'player', refId: 'archive:persisted' },
  archivedAt: 11_500,
});
await indexedDbWorldbookPersistence.archiveEntry(
  archivedPersisted,
  persistedBeforeArchive.activeRevisionId!,
);
assert.equal((await DB.getAllCharacters()).every(character => (
  character.mountedWorldbooks?.[0]?.id === archivedPersisted.id
  && character.mountedWorldbooks[0].publicationStatus === 'archived'
)), true, 'archiving keeps mount membership while atomically mirroring library lifecycle');
const restoredPersisted = restoreWorldbookRevision({
  current: archivedPersisted,
  revisionId: accepted.entry.activeRevisionId!,
  restoredAt: 11_600,
});
await indexedDbWorldbookPersistence.restoreRevision(
  restoredPersisted,
  archivedPersisted.activeRevisionId!,
);
assert.equal(
  getActiveWorldbookRevision((await DB.getAllWorldbooks()).find(
    book => book.id === restoredPersisted.id,
  )!).publicationStatus,
  'published',
);
assert.equal((await DB.getAllCharacters()).every(character => (
  character.mountedWorldbooks?.[0]?.publicationStatus === 'published'
)), true, 'old-version restore creates N+1 and refreshes portability lifecycle mirrors');

await indexedDbWorldbookPersistence.createEntry(builtIn);
await indexedDbWorldbookPersistence.createEntry(supplement);
const storedReceipt = await indexedDbWorldbookPersistence.recordProjectionDeliveryReceipt({
  projection: selectedMain,
  consumer: selectedMain.consumer,
  deliveredAt: receipt.deliveredAt,
});
assert.deepEqual(storedReceipt, receipt);
assert.deepEqual(
  await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scopeA),
  [receipt],
);
assert.deepEqual(
  await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scopeB),
  [],
  'delivery receipt reads must stay inside exact relationship scope',
);
const beforeBackup = await DB.exportFullData();
assert.ok(beforeBackup.worldbooks?.some(book => book.id === accepted.entry.id));
assert.ok(beforeBackup.worldbookGrowthCandidates?.some(item => item.id === candidate.id));
assert.deepEqual(beforeBackup.worldbookProjectionDeliveryReceipts, [receipt]);
await DB.importFullData({
  timestamp: 12_000,
  version: 5,
  characters: [],
  worldbooks: [],
  worldbookGrowthCandidates: [],
  worldbookProjectionDeliveryReceipts: [],
});
assert.deepEqual(await DB.getAllWorldbooks(), []);
assert.deepEqual(await DB.getAllWorldGrowthCandidates(), []);
assert.deepEqual(await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scopeA), []);
await DB.importFullData({
  timestamp: 13_000,
  version: 5,
  characters: beforeBackup.characters,
  worldbooks: beforeBackup.worldbooks,
  worldbookGrowthCandidates: beforeBackup.worldbookGrowthCandidates,
  worldbookProjectionDeliveryReceipts: beforeBackup.worldbookProjectionDeliveryReceipts,
} as FullBackupData);
assert.ok((await DB.getAllWorldbooks()).some(book => book.id === accepted.entry.id));
assert.ok((await DB.getAllWorldGrowthCandidates()).some(item => item.id === candidate.id));
assert.deepEqual(
  await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scopeA),
  [receipt],
);
assert.equal(
  (await DB.getAllWorldGrowthCandidates())[0]?.schemaVersion,
  WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION,
);

const worldbookTypeSource = readFileSync(
  new URL('../domain/worldbook/types.ts', import.meta.url),
  'utf8',
);
const revisionTypeBlock = worldbookTypeSource.slice(
  worldbookTypeSource.indexOf('export interface WorldbookRevisionSnapshot'),
  worldbookTypeSource.indexOf('export interface WorldbookLiveFields'),
);
const candidateDraftStart = worldbookTypeSource.indexOf('export interface WorldGrowthCandidateDraft');
const candidateDraftTypeBlock = worldbookTypeSource.slice(
  candidateDraftStart,
  worldbookTypeSource.indexOf('export interface WorldGrowthCandidate {', candidateDraftStart),
);
assert.doesNotMatch(revisionTypeBlock, /\benabled\??\s*:/);
assert.doesNotMatch(candidateDraftTypeBlock, /\benabled\??\s*:/);
assert.match(revisionTypeBlock, /publicationStatus: 'published' \| 'archived'/);

const projectionSource = readFileSync(
  new URL('../domain/worldbook/projection.ts', import.meta.url),
  'utf8',
);
const knowledgeGateBlock = projectionSource.slice(
  projectionSource.indexOf('const knowledgeAllows'),
  projectionSource.indexOf('const scoreRevision'),
);
assert.doesNotMatch(knowledgeGateBlock, /consumer\.id/);
assert.match(knowledgeGateBlock, /consumer\.kind === 'world_director'/);
const legacyContextSource = readFileSync(
  new URL('../utils/context.ts', import.meta.url),
  'utf8',
);
assert.match(
  legacyContextSource,
  /worldbook\.publicationStatus !== 'archived'/,
  'legacy prompt consumers must not re-inject an archived portability cache',
);

console.log('live Worldbook W1 contract, projection, atomic persistence, and backup: OK');
