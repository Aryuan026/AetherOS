import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import type { CharacterProfile, Worldbook } from '../types.ts';
import {
  acceptWorldGrowthCandidate,
  archiveWorldbookEntry,
  createWorldGrowthCandidate,
  createWorldbookEntry,
  getActiveWorldbookRevision,
  restoreWorldbookRevision,
  reviseWorldbookEntry,
} from '../domain/worldbook/index.ts';
import { DB } from '../utils/db.ts';
import { indexedDbWorldbookPersistence } from '../utils/worldbookPersistence.ts';
import {
  AETHEROS_WORLDBOOK_IMPORT_SCHEMA,
  AETHEROS_WORLDBOOK_IMPORT_VERSION,
  inferWorldbookImportGroupName,
  parseWorldbookImport,
} from '../utils/worldbookImport.ts';
import { buildWorldbookGroupIndex, createWorldbookGroupAssignment } from '../utils/worldbookGroups.ts';
import {
  listPlayerVisibleWorldbooks,
  resolveWorldbookSupplementLinks,
  splitWorldbookWorkspace,
  worldbookMountedCharacterNames,
  worldbookMountCount,
} from '../utils/worldbookPlayerView.ts';

const legacyBook = (id: string, patch: Partial<Worldbook> = {}): Worldbook => ({
  id,
  title: id,
  content: `${id} 正文`,
  category: '测试资料',
  createdAt: 100,
  updatedAt: 100,
  ...patch,
});
const roleGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:main',
  name: '角色资料',
  owner: { kind: 'character', charId: 'char-1' },
});
const otherGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:other',
  name: '备用资料',
  owner: { kind: 'character', charId: 'char-1' },
});
const reviewGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:story',
  name: '确认分组',
  owner: { kind: 'character', charId: 'char-1' },
});

await DB.deleteDB();

// Parsing stays pure. The import screen may commit immediately after a successful parse.
const txtDrafts = parseWorldbookImport({ source: '潮汐会倒流。', fileName: '雾港.txt' });
assert.deepEqual(txtDrafts.map(draft => [draft.title, draft.content]), [['雾港', '潮汐会倒流。']]);
const jsonDrafts = parseWorldbookImport({
  source: JSON.stringify({
    schema: AETHEROS_WORLDBOOK_IMPORT_SCHEMA,
    version: AETHEROS_WORLDBOOK_IMPORT_VERSION,
    entries: [
      { title: '北门', content: '北门由守潮人看守。', category: '地点' },
      { title: '潮汐钟', content: '每天午夜响一次。' },
    ],
  }),
  fileName: 'worldbook.json',
});
assert.equal(jsonDrafts.length, 2);
assert.equal(
  inferWorldbookImportGroupName({ drafts: jsonDrafts, fileName: '雾港整本.json' }),
  '雾港整本',
);
assert.equal(
  inferWorldbookImportGroupName({ drafts: txtDrafts, fileName: '雾港.txt' }),
  '雾港',
);
assert.deepEqual(await DB.getAllWorldbooks(), [], 'preview and cancel must not write anything');
assert.throws(
  () => parseWorldbookImport({ source: '{"schema":', fileName: 'broken.json' }),
  /没有读完整/,
);
assert.deepEqual(await DB.getAllWorldbooks(), [], 'invalid JSON must not leave a partial entry');
assert.throws(
  () => parseWorldbookImport({ source: 'word', fileName: 'unsupported.docx' }),
  /支持 AetherOS \/ 酒馆 JSON、PNG 和 TXT/,
);

const atomicImportEntries = jsonDrafts.map((draft, index) => createWorldbookEntry({
  book: legacyBook(`atomic-import-${index + 1}`, {
    title: draft.title,
    content: draft.content,
    category: draft.category,
    createdAt: 110 + index,
    updatedAt: 110 + index,
  }),
  sourceRef: { kind: 'import', refId: 'atomic-import-session', revision: 1 },
}));
const originalImportPut = IDBObjectStore.prototype.put;
let queuedImportWrites = 0;
(IDBObjectStore.prototype as any).put = function patchedImportPut(
  this: IDBObjectStore,
  value: unknown,
  key?: IDBValidKey,
) {
  if (this.name === 'worldbooks') {
    queuedImportWrites += 1;
    if (queuedImportWrites === 2) {
      throw new DOMException('fixture forces second import write failure', 'DataCloneError');
    }
  }
  return key === undefined
    ? originalImportPut.call(this, value)
    : originalImportPut.call(this, value, key);
};
try {
  await assert.rejects(() => indexedDbWorldbookPersistence.createEntries(atomicImportEntries));
} finally {
  IDBObjectStore.prototype.put = originalImportPut;
}
assert.deepEqual(
  await DB.getAllWorldbooks(),
  [],
  'a failed multi-entry import must roll back every queued entry',
);

// Manual save and explicit import save both become ordinary editable entries.
const manual = createWorldbookEntry({
  book: legacyBook('manual-entry', {
    title: '手写世界',
    content: '玩家写下的世界。',
    category: roleGroup.name,
    group: roleGroup,
  }),
  sourceRef: { kind: 'player', refId: 'manual:entry' },
});
await indexedDbWorldbookPersistence.createEntry(manual);
await indexedDbWorldbookPersistence.createEntries(jsonDrafts.map((draft, index) => (
  createWorldbookEntry({
    book: legacyBook(`import-entry-${index + 1}`, {
      title: draft.title,
      content: draft.content,
      category: draft.category,
      createdAt: 120 + index,
      updatedAt: 120 + index,
    }),
    sourceRef: { kind: 'import', refId: 'import-session:1', revision: 1 },
  })
)));
assert.equal((await DB.getAllWorldbooks()).length, 3);

// Built-in content is immutable; a supplement is a separate player entry.
const builtIn = createWorldbookEntry({
  book: legacyBook('built-in-entry', {
    title: '内置深空资料',
    isBuiltIn: true,
    lockEditing: true,
    builtInVersion: 1,
  }),
});
assert.throws(() => reviseWorldbookEntry({
  current: builtIn,
  patch: { content: '不允许改写' },
  sourceRef: { kind: 'player', refId: 'bad-edit' },
  updatedAt: 200,
}), /read-only/);
const supplement = createWorldbookEntry({
  book: legacyBook('built-in-supplement', {
    title: '我的补充',
    category: otherGroup.name,
    group: otherGroup,
    createdAt: 130,
    updatedAt: 130,
  }),
  supplementsEntryIds: [builtIn.id],
  sourceRef: { kind: 'player', refId: 'supplement:1' },
});
assert.deepEqual(getActiveWorldbookRevision(supplement).supplementsEntryIds, [builtIn.id]);
assert.deepEqual(
  resolveWorldbookSupplementLinks(supplement, [builtIn, supplement]),
  { status: 'linked', parents: [builtIn], invalidParentIds: [] },
);
const missingParentSupplement = createWorldbookEntry({
  book: legacyBook('missing-parent-supplement', { createdAt: 131, updatedAt: 131 }),
  supplementsEntryIds: ['missing-built-in'],
});
assert.deepEqual(
  resolveWorldbookSupplementLinks(missingParentSupplement, [builtIn, missingParentSupplement]),
  { status: 'needs_repair', parents: [], invalidParentIds: ['missing-built-in'] },
  'a missing supplement parent must stay visibly unresolved instead of being guessed',
);
const wrongParentSupplement = createWorldbookEntry({
  book: legacyBook('wrong-parent-supplement', { createdAt: 132, updatedAt: 132 }),
  supplementsEntryIds: [manual.id],
});
assert.deepEqual(
  resolveWorldbookSupplementLinks(wrongParentSupplement, [builtIn, manual, wrongParentSupplement]),
  { status: 'needs_repair', parents: [], invalidParentIds: [manual.id] },
  'a supplement cannot silently bind itself to another player entry',
);

// Mount count comes from character mounts, never a second enabled field.
const mountedCharacter = {
  id: 'char-1',
  name: '角色',
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
  contextLimit: 10,
  mountedWorldbooks: [{
    id: manual.id,
    title: manual.title,
    content: manual.content,
    category: manual.category,
  }],
  mountedWorldbookGroupIds: [roleGroup.id],
} as CharacterProfile;
assert.equal(worldbookMountCount(manual, [mountedCharacter]), 1);
assert.equal(worldbookMountCount(supplement, [mountedCharacter]), 0);
assert.deepEqual(worldbookMountedCharacterNames(manual, [mountedCharacter]), ['角色']);
await DB.saveCharacter(mountedCharacter);

// Each growth candidate is independent; defer remains, ignore disappears.
assert.throws(() => createWorldGrowthCandidate({
  id: 'growth-source-mismatch',
  source: { kind: 'manual', refId: 'manual:canonical' },
  draft: {
    title: '来源不一致',
    content: '不应进入候选箱。',
    category: '故事',
    bindings: [{ id: 'global-source-mismatch', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'narrative_promotion', refId: 'different-source' }],
  },
  createdAt: 290,
}), /source must match/);
assert.throws(() => createWorldGrowthCandidate({
  id: 'growth-invalid-optional-scope',
  scope: { progressBundleId: '', personaMaskId: 'mask', charId: 'char' },
  source: { kind: 'manual', refId: 'manual:bad-scope' },
  draft: {
    title: '坏作用域',
    content: '不应进入候选箱。',
    category: '故事',
    bindings: [{ id: 'global-bad-scope', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'player', refId: 'manual:bad-scope' }],
  },
  createdAt: 291,
}), /scope is invalid/);
assert.throws(() => createWorldGrowthCandidate({
  id: 'growth-archived-draft',
  source: { kind: 'manual', refId: 'manual:archived' },
  draft: {
    title: '不可静默归档',
    content: '玩家审核候选只能进入当前书架。',
    category: '故事',
    publicationStatus: 'archived',
    bindings: [{ id: 'global-archived', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'player', refId: 'manual:archived' }],
  } as any,
  createdAt: 292,
}), /must be published/);

const deferredCandidate = createWorldGrowthCandidate({
  id: 'growth-defer',
  source: { kind: 'manual', refId: 'scene:defer' },
  draft: {
    title: '稍后整理',
    content: '保留到以后。',
    category: '故事',
    bindings: [{ id: 'global-defer', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'player', refId: 'scene:defer' }],
  },
  createdAt: 300,
});
const ignoredCandidate = createWorldGrowthCandidate({
  id: 'growth-ignore',
  source: { kind: 'manual', refId: 'scene:ignore' },
  draft: {
    title: '不要这条',
    content: '忽略不会影响其他候选。',
    category: '故事',
    bindings: [{ id: 'global-ignore', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'player', refId: 'scene:ignore' }],
  },
  createdAt: 310,
});
await indexedDbWorldbookPersistence.saveGrowthCandidate(deferredCandidate);
await indexedDbWorldbookPersistence.saveGrowthCandidate(ignoredCandidate);
await indexedDbWorldbookPersistence.saveGrowthCandidate({
  ...deferredCandidate,
  status: 'deferred',
  updatedAt: 320,
});
await indexedDbWorldbookPersistence.saveGrowthCandidate({
  ...ignoredCandidate,
  status: 'ignored',
  updatedAt: 330,
});
let visible = splitWorldbookWorkspace({
  entries: await DB.getAllWorldbooks(),
  candidates: await DB.getAllWorldGrowthCandidates(),
});
assert.deepEqual(visible.growthCandidates.map(candidate => candidate.id), ['growth-defer']);

// Player review may change only title/body/group; acceptance remains atomic and non-repeatable.
const acceptedSource = createWorldGrowthCandidate({
  id: 'growth-accept',
  source: { kind: 'manual', refId: 'scene:accept' },
  draft: {
    title: '原建议标题',
    content: '原建议正文。',
    category: '原分组',
    bindings: [{ id: 'global-accept', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [
      { kind: 'player', refId: 'scene:accept' },
      { kind: 'import', refId: 'supporting-review-cluster', revision: 3 },
    ],
  },
  createdAt: 340,
});
await indexedDbWorldbookPersistence.saveGrowthCandidate(acceptedSource);
const reviewedDraft = { title: '玩家确认标题', content: '玩家修改后的正文。', group: reviewGroup };
const accepted = acceptWorldGrowthCandidate({
  candidate: acceptedSource,
  newEntryId: 'growth-accepted-entry',
  reviewedDraft,
  acceptedAt: 350,
});
await indexedDbWorldbookPersistence.commitAcceptedCandidate({
  ...accepted,
  reviewedDraft,
  expectedBaseRevisionId: null,
  expectedCandidateUpdatedAt: acceptedSource.updatedAt,
});
const acceptedEntry = (await DB.getAllWorldbooks()).find(entry => entry.id === 'growth-accepted-entry');
assert.equal(acceptedEntry?.title, reviewedDraft.title);
assert.equal(acceptedEntry?.content, reviewedDraft.content);
assert.deepEqual(acceptedEntry?.group, reviewGroup);
assert.equal(acceptedEntry?.category, reviewGroup.name);
assert.deepEqual(getActiveWorldbookRevision(acceptedEntry!).bindings, acceptedSource.draft.bindings);
assert.deepEqual(getActiveWorldbookRevision(acceptedEntry!).knowledgePolicy, acceptedSource.draft.knowledgePolicy);
assert.deepEqual(getActiveWorldbookRevision(acceptedEntry!).sourceRefs, [
  ...acceptedSource.draft.sourceRefs,
  { kind: 'player', refId: `world-growth-accept:${acceptedSource.id}` },
]);
await assert.rejects(
  () => indexedDbWorldbookPersistence.commitAcceptedCandidate({
    ...accepted,
    reviewedDraft,
    expectedBaseRevisionId: null,
    expectedCandidateUpdatedAt: acceptedSource.updatedAt,
  }),
  /cannot be accepted/,
  'an accepted candidate must not be written twice',
);

// A stale base revision fails loudly and leaves the player's latest entry untouched.
const base = createWorldbookEntry({
  book: legacyBook('stale-target', {
    title: '目标条目',
    category: roleGroup.name,
    group: roleGroup,
    createdAt: 400,
    updatedAt: 400,
  }),
  sourceRef: { kind: 'player', refId: 'base:1' },
});
await indexedDbWorldbookPersistence.createEntry(base);
const staleCandidate = createWorldGrowthCandidate({
  id: 'growth-stale',
  targetEntryId: base.id,
  baseRevisionId: base.activeRevisionId,
  source: { kind: 'manual', refId: 'scene:stale' },
  draft: {
    title: '目标条目',
    content: '候选试图覆盖。',
    category: '测试资料',
    bindings: [{ id: 'global-stale', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'player', refId: 'scene:stale' }],
  },
  createdAt: 410,
});
await indexedDbWorldbookPersistence.saveGrowthCandidate(staleCandidate);
const playerLatest = reviseWorldbookEntry({
  current: base,
  patch: { content: '玩家刚刚保存的新正文。' },
  sourceRef: { kind: 'player', refId: 'player-newer' },
  updatedAt: 420,
});
await indexedDbWorldbookPersistence.updateEntry(playerLatest, base.activeRevisionId!);
assert.throws(() => acceptWorldGrowthCandidate({
  candidate: staleCandidate,
  currentEntry: playerLatest,
  acceptedAt: 430,
}), /base revision is stale/);
assert.equal(
  (await DB.getAllWorldbooks()).find(entry => entry.id === base.id)?.content,
  '玩家刚刚保存的新正文。',
);

// Archive is visible in its own shelf without mount status; restore creates N+1.
const archived = archiveWorldbookEntry({
  current: manual,
  sourceRef: { kind: 'player', refId: 'archive:manual' },
  archivedAt: 500,
});
await indexedDbWorldbookPersistence.archiveEntry(archived, manual.activeRevisionId!);
assert.equal(
  (await DB.getAllCharacters())[0]?.mountedWorldbooks?.[0]?.publicationStatus,
  'archived',
  'archiving keeps the mount relationship but disables its runtime projection',
);
visible = splitWorldbookWorkspace({
  entries: await DB.getAllWorldbooks(),
  candidates: await DB.getAllWorldGrowthCandidates(),
});
assert.ok(visible.archived.some(entry => entry.id === manual.id));
const restored = restoreWorldbookRevision({
  current: archived,
  revisionId: manual.activeRevisionId!,
  restoredAt: 510,
});
await indexedDbWorldbookPersistence.restoreRevision(restored, archived.activeRevisionId!);
assert.equal(getActiveWorldbookRevision(restored).publicationStatus, 'published');
assert.equal(restored.revisionSnapshots?.length, 3);
assert.equal(
  (await DB.getAllCharacters())[0]?.mountedWorldbooks?.[0]?.publicationStatus,
  'published',
  'restoring content must re-enable every retained mount in the same persistence transaction',
);

// Whole-group archive is one transaction: every live entry is archived, the
// group disappears, and no character keeps a stale whole-group mount.
const archiveGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:archive-together',
  name: '整组归档测试',
  owner: { kind: 'character', charId: 'char-1' },
});
const archiveGroupEntries = [
  createWorldbookEntry({
    book: legacyBook('archive-group-entry-a', {
      title: '随组归档 A',
      category: archiveGroup.name,
      group: archiveGroup,
      createdAt: 520,
      updatedAt: 520,
    }),
    sourceRef: { kind: 'player', refId: 'archive-group:entry-a' },
  }),
  createWorldbookEntry({
    book: legacyBook('archive-group-entry-b', {
      title: '随组归档 B',
      category: archiveGroup.name,
      group: archiveGroup,
      createdAt: 521,
      updatedAt: 521,
    }),
    sourceRef: { kind: 'player', refId: 'archive-group:entry-b' },
  }),
];
const initiallyArchivedGroupEntry = createWorldbookEntry({
  book: legacyBook('archive-group-entry-initially-disabled', {
    title: '开场白 5',
    category: archiveGroup.name,
    group: archiveGroup,
    createdAt: 522,
    updatedAt: 522,
  }),
  publicationStatus: 'archived',
  sourceRef: { kind: 'import', refId: 'archive-group:initially-disabled' },
});
const allArchiveGroupEntries = [...archiveGroupEntries, initiallyArchivedGroupEntry];
await DB.saveWorldbookGroup(archiveGroup);
await indexedDbWorldbookPersistence.createEntries(allArchiveGroupEntries);
const archiveGroupCharacter = {
  ...(await DB.getAllCharacters())[0],
  mountedWorldbookGroupIds: [archiveGroup.id],
} as CharacterProfile;
await DB.saveCharacter(archiveGroupCharacter);
const groupArchiveCharacterUpdates = await DB.archiveWorldbookGroup({
  group: archiveGroup,
  entries: archiveGroupEntries.map((entry, index) => ({
    entry: archiveWorldbookEntry({
      current: entry,
      sourceRef: { kind: 'player', refId: `archive-group:confirm-${index}` },
      archivedAt: 530 + index,
    }),
    expectedActiveRevisionId: entry.activeRevisionId!,
  })),
});
assert.equal(groupArchiveCharacterUpdates.length, 1);
assert.equal((await DB.getAllWorldbookGroups()).some(group => group.id === archiveGroup.id), false);
const archivedGroupEntryIds = new Set(
  (await DB.getAllWorldbooks())
    .filter(entry => allArchiveGroupEntries.some(source => source.id === entry.id))
    .filter(entry => getActiveWorldbookRevision(entry).publicationStatus === 'archived')
    .map(entry => entry.id),
);
assert.deepEqual(archivedGroupEntryIds, new Set(allArchiveGroupEntries.map(entry => entry.id)));
assert.equal(
  (await DB.getAllCharacters())[0]?.mountedWorldbookGroupIds?.includes(archiveGroup.id),
  false,
);
const storedArchivedGroupEntries = (await DB.getAllWorldbooks())
  .filter(entry => allArchiveGroupEntries.some(source => source.id === entry.id));
const buildRestoredGroupEntries = (entries: Worldbook[], restoredAt: number) => entries.map((entry, index) => {
  const latestPublished = [...(entry.revisionSnapshots || [])]
    .filter(revision => revision.publicationStatus === 'published')
    .sort((left, right) => right.revision - left.revision)[0];
  const restoreSource = latestPublished || getActiveWorldbookRevision(entry);
  return {
    entry: restoreWorldbookRevision({
      current: entry,
      revisionId: restoreSource.id,
      restoredAt: restoredAt + index,
    }),
    expectedActiveRevisionId: entry.activeRevisionId!,
  };
});
const restoredGroupEntries = buildRestoredGroupEntries(storedArchivedGroupEntries, 540);
const concurrentlyRearchived = archiveWorldbookEntry({
  current: storedArchivedGroupEntries[1],
  sourceRef: { kind: 'player', refId: 'archive-group:concurrent-change' },
  archivedAt: 535,
});
await indexedDbWorldbookPersistence.archiveEntry(
  concurrentlyRearchived,
  storedArchivedGroupEntries[1].activeRevisionId!,
);
await assert.rejects(
  () => DB.restoreWorldbookGroup({
    group: archiveGroup,
    entries: restoredGroupEntries,
  }),
  /changed before group restore/,
);
assert.equal(
  (await DB.getAllWorldbookGroups()).some(group => group.id === archiveGroup.id),
  false,
  'failed whole-group restore must not recreate the group',
);
assert.equal(
  (await DB.getAllWorldbooks())
    .filter(entry => allArchiveGroupEntries.some(source => source.id === entry.id))
    .every(entry => getActiveWorldbookRevision(entry).publicationStatus === 'archived'),
  true,
  'failed whole-group restore must leave every entry archived',
);
const freshArchivedGroupEntries = (await DB.getAllWorldbooks())
  .filter(entry => allArchiveGroupEntries.some(source => source.id === entry.id));
await DB.restoreWorldbookGroup({
  group: archiveGroup,
  entries: buildRestoredGroupEntries(freshArchivedGroupEntries, 550),
});
assert.equal((await DB.getAllWorldbookGroups()).some(group => group.id === archiveGroup.id), true);
assert.equal(
  (await DB.getAllWorldbooks())
    .filter(entry => allArchiveGroupEntries.some(source => source.id === entry.id))
    .every(entry => getActiveWorldbookRevision(entry).publicationStatus === 'published'),
  true,
);
assert.equal(
  (await DB.getAllCharacters())[0]?.mountedWorldbookGroupIds?.includes(archiveGroup.id),
  false,
  'restoring a library group must not silently re-enable it for the character',
);
const emptyArchiveGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:empty-archive',
  name: '空分组删除测试',
  owner: { kind: 'character', charId: 'char-1' },
});
await DB.saveWorldbookGroup(emptyArchiveGroup);
await DB.archiveWorldbookGroup({ group: emptyArchiveGroup, entries: [] });
assert.equal((await DB.getAllWorldbookGroups()).some(group => group.id === emptyArchiveGroup.id), false);
await assert.rejects(
  () => DB.archiveWorldbookGroup({
    group: createWorldbookGroupAssignment({ name: '通用区', owner: { kind: 'universal' } }),
    entries: [],
  }),
  /通用区不能整组归档/,
);

// The visible legacy repair bucket is actionable without becoming a fake
// persisted group: entries can be assigned or archived in one transaction.
const repairTargetGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:repaired',
  name: '整理后的资料',
  owner: { kind: 'character', charId: 'char-1' },
});
const unassignedToRepair = [
  createWorldbookEntry({
    book: legacyBook('unassigned-repair-a', { createdAt: 580, updatedAt: 580 }),
    sourceRef: { kind: 'legacy_normalization', refId: 'unassigned:repair:a' },
  }),
  createWorldbookEntry({
    book: legacyBook('unassigned-repair-b', { createdAt: 581, updatedAt: 581 }),
    sourceRef: { kind: 'legacy_normalization', refId: 'unassigned:repair:b' },
  }),
];
await indexedDbWorldbookPersistence.createEntries(unassignedToRepair);
await DB.assignUnassignedWorldbooks({
  group: repairTargetGroup,
  entries: unassignedToRepair.map(entry => ({
    entryId: entry.id,
    expectedActiveRevisionId: entry.activeRevisionId!,
  })),
  assignedAt: 590,
});
const repairedEntries = (await DB.getAllWorldbooks())
  .filter(entry => unassignedToRepair.some(source => source.id === entry.id));
assert.equal(repairedEntries.every(entry => entry.group?.id === repairTargetGroup.id), true);
assert.equal(repairedEntries.every(entry => entry.category === repairTargetGroup.name), true);
assert.equal((await DB.getAllWorldbookGroups()).some(group => group.id === repairTargetGroup.id), true);

const unassignedToArchive = [
  createWorldbookEntry({
    book: legacyBook('unassigned-archive-a', { createdAt: 600, updatedAt: 600 }),
    sourceRef: { kind: 'legacy_normalization', refId: 'unassigned:archive:a' },
  }),
  createWorldbookEntry({
    book: legacyBook('unassigned-archive-b', { createdAt: 601, updatedAt: 601 }),
    sourceRef: { kind: 'legacy_normalization', refId: 'unassigned:archive:b' },
  }),
];
await indexedDbWorldbookPersistence.createEntries(unassignedToArchive);
await assert.rejects(
  () => DB.archiveUnassignedWorldbooks({
    entries: [
      { entryId: unassignedToArchive[0].id, expectedActiveRevisionId: unassignedToArchive[0].activeRevisionId! },
      { entryId: unassignedToArchive[1].id, expectedActiveRevisionId: 'stale-revision' },
    ],
    archivedAt: 610,
  }),
  /changed before unassigned repair/,
);
assert.equal(
  (await DB.getAllWorldbooks())
    .filter(entry => unassignedToArchive.some(source => source.id === entry.id))
    .every(entry => getActiveWorldbookRevision(entry).publicationStatus === 'published'),
  true,
  'a stale unassigned batch must not archive its first entry',
);
await DB.archiveUnassignedWorldbooks({
  entries: unassignedToArchive.map(entry => ({
    entryId: entry.id,
    expectedActiveRevisionId: entry.activeRevisionId!,
  })),
  archivedAt: 620,
});
assert.equal(
  (await DB.getAllWorldbooks())
    .filter(entry => unassignedToArchive.some(source => source.id === entry.id))
    .every(entry => getActiveWorldbookRevision(entry).publicationStatus === 'archived'),
  true,
);

// Permanent deletion is available only from the archive. Whole-group deletion
// removes every archived revision and any stale character portability cache in
// one transaction.
const permanentDeleteGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-1:permanent-delete',
  name: '彻底删除测试',
  owner: { kind: 'character', charId: 'char-1' },
});
const permanentDeleteEntries = [
  createWorldbookEntry({
    book: legacyBook('permanent-delete-a', {
      category: permanentDeleteGroup.name,
      group: permanentDeleteGroup,
      createdAt: 630,
      updatedAt: 630,
    }),
    publicationStatus: 'archived',
    sourceRef: { kind: 'player', refId: 'permanent-delete:a' },
  }),
  createWorldbookEntry({
    book: legacyBook('permanent-delete-b', {
      category: permanentDeleteGroup.name,
      group: permanentDeleteGroup,
      createdAt: 631,
      updatedAt: 631,
    }),
    publicationStatus: 'archived',
    sourceRef: { kind: 'player', refId: 'permanent-delete:b' },
  }),
];
await DB.saveWorldbookGroup(permanentDeleteGroup);
await indexedDbWorldbookPersistence.createEntries(permanentDeleteEntries);
const characterBeforePermanentDelete = (await DB.getAllCharacters())[0] as CharacterProfile;
await DB.saveCharacter({
  ...characterBeforePermanentDelete,
  mountedWorldbookGroupIds: [
    ...(characterBeforePermanentDelete.mountedWorldbookGroupIds || []),
    permanentDeleteGroup.id,
  ],
  mountedWorldbooks: [
    ...(characterBeforePermanentDelete.mountedWorldbooks || []),
    ...permanentDeleteEntries.map(entry => ({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      publicationStatus: 'archived' as const,
    })),
  ],
});
await DB.deleteArchivedWorldbooks({
  entryIds: permanentDeleteEntries.map(entry => entry.id),
  groupId: permanentDeleteGroup.id,
});
assert.equal(
  (await DB.getAllWorldbooks()).some(entry => permanentDeleteEntries.some(source => source.id === entry.id)),
  false,
);
assert.equal((await DB.getAllWorldbookGroups()).some(group => group.id === permanentDeleteGroup.id), false);
const characterAfterPermanentDelete = (await DB.getAllCharacters())[0] as CharacterProfile;
assert.equal(characterAfterPermanentDelete.mountedWorldbookGroupIds?.includes(permanentDeleteGroup.id), false);
assert.equal(
  characterAfterPermanentDelete.mountedWorldbooks?.some(entry => permanentDeleteEntries.some(source => source.id === entry.id)),
  false,
);

// Director-only material never enters player DOM candidates, lists, or counts.
const hiddenEntry = createWorldbookEntry({
  book: legacyBook('hidden-entry', { title: '不可见秘密', createdAt: 600, updatedAt: 600 }),
  knowledgePolicy: { kind: 'director_only' },
  sourceRef: { kind: 'player', refId: 'hidden:entry' },
});
const hiddenCandidate = createWorldGrowthCandidate({
  id: 'hidden-candidate',
  source: { kind: 'manual', refId: 'hidden:candidate' },
  draft: {
    title: '隐藏候选',
    content: '不进入玩家页面。',
    category: '秘密',
    bindings: [{ id: 'global-hidden', kind: 'global' }],
    knowledgePolicy: { kind: 'director_only' },
    sourceRefs: [{ kind: 'player', refId: 'hidden:candidate' }],
  },
  createdAt: 610,
});
visible = splitWorldbookWorkspace({ entries: [hiddenEntry], candidates: [hiddenCandidate] });
assert.deepEqual(visible, { published: [], archived: [], growthCandidates: [] });
const playerCatalog = listPlayerVisibleWorldbooks([builtIn, supplement, hiddenEntry]);
assert.deepEqual(
  playerCatalog.map(entry => entry.id),
  [builtIn.id, supplement.id],
  'Character catalog/count/view/mount inputs must exclude Director-only entries before rendering',
);
const playerCatalogGroups = buildWorldbookGroupIndex(playerCatalog);
assert.equal(playerCatalogGroups.builtInCount, 1);
assert.equal(playerCatalogGroups.customCount, 1);
assert.equal(worldbookMountCount(archived, [mountedCharacter]), 1);

// Deleting one character archives only that role's owned entries and removes
// even empty owned groups. Universal material and independent copies survive.
const deletedRoleGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-delete:owned',
  name: '待删除角色资料',
  owner: { kind: 'character', charId: 'char-delete' },
});
const deletedRoleEmptyGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-delete:empty',
  name: '待删除空组',
  owner: { kind: 'character', charId: 'char-delete' },
});
const survivorGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-survivor:copy',
  name: '幸存副本',
  owner: { kind: 'character', charId: 'char-survivor' },
});
const universalGroup = createWorldbookGroupAssignment({
  name: '通用区',
  owner: { kind: 'universal' },
});
await DB.saveWorldbookGroup(deletedRoleGroup);
await DB.saveWorldbookGroup(deletedRoleEmptyGroup);
await DB.saveWorldbookGroup(survivorGroup);
await DB.saveWorldbookGroup(universalGroup);
await DB.saveWorldbookGroupLayout([
  { ...deletedRoleGroup, sortOrder: 1 },
  { ...survivorGroup, sortOrder: 0, pinned: true },
]);
const savedLayout = new Map((await DB.getAllWorldbookGroups()).map(group => [group.id, group]));
assert.equal(savedLayout.get(deletedRoleGroup.id)?.sortOrder, 1);
assert.equal(savedLayout.get(survivorGroup.id)?.pinned, true);
await assert.rejects(
  () => DB.saveWorldbookGroupLayout([{
    ...survivorGroup,
    name: '试图借排序改名',
    sortOrder: 2,
  }]),
  /cannot be reordered/,
);
await DB.saveCharacter({
  id: 'char-delete',
  name: '待删除角色',
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
  mountedWorldbookGroupIds: [deletedRoleGroup.id, deletedRoleEmptyGroup.id],
} as CharacterProfile);
const ownedBeforeDelete = createWorldbookEntry({
  book: legacyBook('owned-before-delete', {
    category: deletedRoleGroup.name,
    group: deletedRoleGroup,
    createdAt: 700,
    updatedAt: 700,
  }),
  sourceRef: { kind: 'import', refId: 'card:char-delete', revision: 1 },
});
const copiedSurvivor = createWorldbookEntry({
  book: legacyBook('copied-survivor', {
    category: survivorGroup.name,
    group: survivorGroup,
    createdAt: 701,
    updatedAt: 701,
  }),
  sourceRefs: [
    { kind: 'import', refId: 'card:char-delete', revision: 1 },
    { kind: 'player', refId: 'worldbook-copy:owned-before-delete' },
  ],
});
await indexedDbWorldbookPersistence.createEntry(ownedBeforeDelete);
await indexedDbWorldbookPersistence.createEntry(copiedSurvivor);
const ownedArchived = archiveWorldbookEntry({
  current: ownedBeforeDelete,
  sourceRef: { kind: 'player', refId: 'character-delete:char-delete' },
  archivedAt: 710,
});
await DB.deleteCharacterAndArchiveOwnedWorldbooks({
  charId: 'char-delete',
  groups: [deletedRoleGroup, deletedRoleEmptyGroup],
  entries: [{
    entry: ownedArchived,
    expectedActiveRevisionId: ownedBeforeDelete.activeRevisionId!,
  }],
});
assert.equal((await DB.getAllCharacters()).some(character => character.id === 'char-delete'), false);
assert.deepEqual(
  (await DB.getAllWorldbookGroups()).map(group => group.id).filter(id => id.includes('char-delete')),
  [],
);
assert.equal(
  getActiveWorldbookRevision((await DB.getAllWorldbooks()).find(entry => entry.id === ownedBeforeDelete.id)!).publicationStatus,
  'archived',
);
assert.equal(
  getActiveWorldbookRevision((await DB.getAllWorldbooks()).find(entry => entry.id === copiedSurvivor.id)!).publicationStatus,
  'published',
);
assert.ok((await DB.getAllWorldbookGroups()).some(group => group.id === survivorGroup.id));
assert.ok((await DB.getAllWorldbookGroups()).some(group => group.id === universalGroup.id));

// UI shape: one App, shared header, short menu, and full-screen long flows.
const appSource = readFileSync(new URL('../apps/WorldbookApp.tsx', import.meta.url), 'utf8');
const osContextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../components/worldbook/WorldbookEntryEditor.tsx', import.meta.url), 'utf8');
const importSource = readFileSync(new URL('../components/worldbook/WorldbookImportScreen.tsx', import.meta.url), 'utf8');
const growthSource = readFileSync(new URL('../components/worldbook/WorldGrowthReviewScreen.tsx', import.meta.url), 'utf8');
const historySource = readFileSync(new URL('../components/worldbook/WorldbookVersionHistoryScreen.tsx', import.meta.url), 'utf8');
const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
assert.match(appSource, /<AppHeader/);
assert.match(appSource, /<AppHeaderAddButton/);
assert.match(appSource, /growthBatches\.length > 0/);
assert.match(appSource, /写一条/);
assert.match(appSource, /导入资料/);
assert.match(appSource, /AI 智能整理/);
assert.match(appSource, /data-worldbook-show-built-in/);
assert.match(appSource, /updateWorldbookGroupLayout/);
assert.match(appSource, /archiveWorldbookGroup/);
assert.match(appSource, /归档整组/);
assert.match(appSource, /restoreWorldbookGroup/);
assert.match(appSource, /恢复整组/);
assert.match(appSource, /data-worldbook-archived-group/);
assert.match(appSource, /旧版或早期导入中缺少归属/);
assert.match(appSource, /data-worldbook-unassigned-repair/);
assert.match(appSource, /data-worldbook-unassigned-archive/);
assert.match(appSource, /data-worldbook-pin-built-in/);
assert.match(appSource, /data-worldbook-delete-archived-group/);
assert.match(appSource, /data-worldbook-delete-archived-entry/);
assert.match(appSource, /data-worldbook-permanent-delete-confirm/);
assert.match(appSource, /M7\.5 7\.5 12 12/);
assert.match(appSource, /添加我的补充/);
assert.match(appSource, /补充自：/);
assert.match(appSource, /补充关系待修复/);
assert.match(appSource, /data-worldbook-related-supplements/);
assert.match(appSource, /单条归档 · 查看版本/);
assert.match(appSource, /已归档 · 查看版本/);
assert.match(appSource, /mountedCharacterNames\[0\].*正在使用/);
assert.match(appSource, /reenabledCharacterCount=\{worldbookMountCount\(historyEntry, characters\)\}/);
assert.match(historySource, /reenabledCharacterCount/);
assert.match(historySource, /data-worldbook-restore-confirm/);
assert.match(historySource, /保留的挂载会随之重新启用/);
assert.match(characterSource, /listPlayerVisibleWorldbooks\(worldbooks\)/);
assert.match(characterSource, /mountedWorldbookGroupIds/);
assert.match(characterSource, /启用整组/);
assert.match(characterSource, /filter\(wb => playerVisibleWorldbookIds\.has\(wb\.id\)\)/);
assert.match(osContextSource, /indexedDbWorldbookPersistence\.createEntries\(createdEntries\)/);
assert.match(osContextSource, /copyWorldbookToGroup/);
assert.match(osContextSource, /worldbook-copy:/);
assert.match(editorSource, /data-worldbook-fullscreen-editor/);
assert.match(importSource, /data-worldbook-import-screen/);
assert.doesNotMatch(importSource, /data-worldbook-import-preview|预览导入内容/);
assert.match(growthSource, /data-world-growth-review-screen/);
assert.doesNotMatch(`${editorSource}\n${importSource}\n${growthSource}`, /<Modal/);

console.log('Worldbook W2 player UI workflows, review gate, archive, and import: OK');
