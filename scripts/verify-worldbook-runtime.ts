import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  archiveWorldbookEntry,
  createWorldbookEntry,
  getActiveWorldbookRevision,
  reviseWorldbookEntry,
  type WorldbookBinding,
  type WorldbookProjectionConsumerRef,
} from '../domain/worldbook/index.ts';
import type { CharacterProfile, UserProfile, Worldbook } from '../types.ts';
import { ContextBuilder } from '../utils/context.ts';
import { DB } from '../utils/db.ts';
import {
  prepareWorldbookRuntimeProjection,
  recordWorldbookRuntimeProjectionDelivery,
} from '../utils/worldbookRuntime.ts';
import { createWorldbookGroupAssignment } from '../utils/worldbookGroups.ts';

const root = process.cwd();
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
const roleGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-a:runtime',
  name: '测试资料',
  owner: { kind: 'character', charId: 'char-a' },
});

const book = (id: string, patch: Partial<Worldbook> = {}): Worldbook => ({
  id,
  title: id,
  content: `${id} 正文`,
  category: '测试资料',
  group: roleGroup,
  createdAt: 1_000,
  updatedAt: 1_000,
  ...patch,
});
const relationshipBinding = (id: string, scope: HistoryScope = scopeA): WorldbookBinding => ({
  id: `${id}:relationship`,
  kind: 'relationship',
  scope,
});
const createEntry = (
  id: string,
  patch: Partial<Worldbook> = {},
  bindings: readonly WorldbookBinding[] = [relationshipBinding(id)],
  knowledgePolicy: Parameters<typeof createWorldbookEntry>[0]['knowledgePolicy'] = { kind: 'public' },
): Worldbook => createWorldbookEntry({
  book: book(id, patch),
  bindings,
  knowledgePolicy,
  sourceRef: { kind: 'player', refId: `fixture:${id}` },
});

const relevant = createEntry('harbor-lore', {
  title: '雾港潮汐钟',
  content: '潮汐钟只在雾港北门开启时鸣响。',
  activationHint: '谈到雾港、潮汐钟或北门时',
});
const mainlineOnly = createEntry('mainline-lore', {
  title: '主线议会',
  content: '主线议会只属于当前主线。',
  activationHint: '主线议会',
}, [{ id: 'mainline:binding', kind: 'mainline', scope: scopeA, routeId: 'main-route' }]);
const ifOnly = createEntry('if-lore', {
  title: '月影支线',
  content: '月影支线只属于指定 IF 分支。',
  activationHint: '月影支线',
}, [{
  id: 'if:binding',
  kind: 'if_branch',
  scope: scopeA,
  routeId: 'if-route',
  branchId: 'moon-branch',
}]);
const unknownSecret = createEntry('secret-lore', {
  title: '封存密令',
  content: '只有另一位角色知道封存密令。',
  activationHint: '封存密令',
}, undefined, { kind: 'entities', subjects: [{ kind: 'character', id: 'char-secret' }] });
const publicGlobal = createEntry('public-global-lore', {
  title: '公开星历',
  content: '公开星历允许尚未迁移的普通 App 兼容读取。',
  activationHint: '公开星历',
}, [{ id: 'public-global:binding', kind: 'global' }]);
const directorOnly = createEntry('director-lore', {
  title: '导演侧暗线',
  content: '这条暗线只能交给世界主持，不能进入普通角色提示词。',
  activationHint: '导演侧暗线',
}, [{ id: 'director:binding', kind: 'global' }], { kind: 'director_only' });
const archived = archiveWorldbookEntry({
  current: createEntry('archived-lore', {
    title: '废弃码头',
    content: '废弃码头已经归档。',
    activationHint: '废弃码头',
  }),
  sourceRef: { kind: 'player', refId: 'fixture:archive' },
  archivedAt: 2_000,
});
const staleBase = createEntry('revised-lore', {
  title: '旧钟楼',
  content: '旧版本钟楼资料。',
  activationHint: '钟楼',
});
const staleRevisionId = getActiveWorldbookRevision(staleBase).id;
const revised = reviseWorldbookEntry({
  current: staleBase,
  patch: { title: '新钟楼', content: '当前版本钟楼资料。', activationHint: '钟楼' },
  sourceRef: { kind: 'player', refId: 'fixture:revise' },
  updatedAt: 2_000,
});

const library = [
  relevant,
  mainlineOnly,
  ifOnly,
  unknownSecret,
  publicGlobal,
  directorOnly,
  archived,
  revised,
];
const character: CharacterProfile = {
  id: 'char-a',
  name: '阿雾',
  avatar: '',
  description: '',
  systemPrompt: '保持角色自己的判断。',
  memories: [],
  mountedWorldbooks: library.map(entry => ({
    id: entry.id,
    title: `缓存:${entry.title}`,
    content: `MOUNT_CACHE_POISON:${entry.id}`,
    category: '缓存副本',
    publicationStatus: getActiveWorldbookRevision(entry).publicationStatus,
    legacyPromptEligibility:
      getActiveWorldbookRevision(entry).knowledgePolicy.kind === 'public'
      && getActiveWorldbookRevision(entry).bindings.every(binding => binding.kind === 'global')
        ? 'public_global'
        : 'typed_only',
    knowledgePolicy: getActiveWorldbookRevision(entry).knowledgePolicy,
  })),
  mountedWorldbookGroupIds: [roleGroup.id],
};
const user: UserProfile = { name: '玩家', avatar: '', bio: '' };
const consumer = (kind: 'chat' | 'call', suffix: string): WorldbookProjectionConsumerRef => ({
  kind,
  id: `${kind}:${suffix}`,
  revision: `worldbook-${kind}-v1`,
});
const prepare = (input: {
  kind?: 'chat' | 'call';
  suffix?: string;
  scope?: HistoryScope;
  query?: string;
  entries?: readonly Worldbook[];
  mountedIds?: readonly string[];
  groupIds?: readonly string[];
  explicitRefs?: readonly { entryId: string; revisionId?: string }[];
}) => prepareWorldbookRuntimeProjection({
  requestId: `fixture:${input.kind ?? 'chat'}:${input.suffix ?? 'default'}`,
  library: input.entries ?? library,
  character: {
    ...character,
    mountedWorldbookGroupIds: [...(input.groupIds ?? character.mountedWorldbookGroupIds ?? [])],
    mountedWorldbooks: (input.mountedIds ?? library.map(entry => entry.id)).map(id => ({
      id,
      title: `cache:${id}`,
      content: `MOUNT_CACHE_POISON:${id}`,
      publicationStatus: getActiveWorldbookRevision(library.find(entry => entry.id === id)!).publicationStatus,
      legacyPromptEligibility:
        getActiveWorldbookRevision(library.find(entry => entry.id === id)!).knowledgePolicy.kind === 'public'
        && getActiveWorldbookRevision(library.find(entry => entry.id === id)!).bindings.every(binding => binding.kind === 'global')
          ? 'public_global'
          : 'typed_only',
      knowledgePolicy: getActiveWorldbookRevision(library.find(entry => entry.id === id)!).knowledgePolicy,
    })),
  },
  scope: input.scope ?? scopeA,
  consumer: consumer(input.kind ?? 'chat', input.suffix ?? 'default'),
  knowledgeSubjects: [{ kind: 'character', id: 'char-a' }],
  query: input.query ?? '雾港潮汐钟',
  explicitRefs: input.explicitRefs,
  budget: input.kind === 'call'
    ? { maxTotalChars: 800, maxEntries: 2, maxEntryChars: 400 }
    : { maxTotalChars: 700, maxEntries: 1, maxEntryChars: 560 },
});

// Canonical core keeps role, worldview and memory, but never the mounted cache body.
const canonicalCore = ContextBuilder.buildCanonicalCoreContext(character, user);
const legacyCore = ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(character, user);
assert.ok(canonicalCore.includes('保持角色自己的判断'));
assert.ok(!canonicalCore.includes('MOUNT_CACHE_POISON'));
assert.ok(legacyCore.includes('MOUNT_CACHE_POISON:public-global-lore'));
assert.ok(!legacyCore.includes('MOUNT_CACHE_POISON:director-lore'));
assert.ok(!legacyCore.includes('MOUNT_CACHE_POISON:harbor-lore'));

// Positive path: exact scope + current character knowledge + mounted id + relevant live query.
const chatHit = prepare({ kind: 'chat', suffix: 'success', query: '雾港的潮汐钟今天响了吗？' });
assert.deepEqual(chatHit.projection.items.map(item => item.entryId), [relevant.id]);
assert.ok(chatHit.markdown.includes('本轮相关世界资料'));
assert.ok(chatHit.markdown.includes(relevant.content));
assert.ok(chatHit.projection.usedChars <= 700);
assert.equal(chatHit.projection.items.length, 1);
assert.ok(!`${canonicalCore}\n${chatHit.markdown}`.includes('MOUNT_CACHE_POISON'));
assert.equal(`${canonicalCore}\n${chatHit.markdown}`.split(relevant.content).length - 1, 1);

const callHit = prepare({ kind: 'call', suffix: 'success', query: '电话里聊聊雾港北门和潮汐钟' });
assert.deepEqual(callHit.projection.items.map(item => item.entryId), [relevant.id]);
assert.ok(callHit.projection.usedChars <= 800);

// Low-signal live turns without explicit refs add no entry, heading, or receipt.
for (const query of ['你好', '嗯', '在吗']) {
  const lowSignal = prepare({ suffix: `low:${query}`, query });
  assert.equal(lowSignal.projection.items.length, 0);
  assert.equal(lowSignal.markdown, '');
}

assert.equal(prepare({ scope: scopeB, query: '雾港潮汐钟' }).projection.items.length, 0);
assert.throws(
  () => prepare({ scope: scopeWrongCharacter, query: '雾港潮汐钟' }),
  /does not match exact HistoryScope/,
);
assert.equal(prepare({ groupIds: [], query: '雾港潮汐钟' }).projection.items.length, 0);
assert.equal(prepare({ query: '主线议会' }).projection.items.length, 0);
assert.equal(prepare({ kind: 'call', query: '月影支线' }).projection.items.length, 0);
assert.equal(prepare({ query: '封存密令' }).projection.items.length, 0);
assert.equal(prepare({ query: '导演侧暗线' }).projection.items.length, 0);
assert.equal(prepare({ query: '废弃码头' }).projection.items.length, 0);
assert.equal(prepare({
  query: '钟楼',
  explicitRefs: [{ entryId: revised.id, revisionId: staleRevisionId }],
}).projection.items.length, 0);
const directorHit = prepareWorldbookRuntimeProjection({
  requestId: 'fixture:world-director',
  library: [directorOnly],
  character: {
    id: character.id,
    mountedWorldbooks: character.mountedWorldbooks?.filter(mounted => mounted.id === directorOnly.id),
    mountedWorldbookGroupIds: character.mountedWorldbookGroupIds,
  },
  scope: scopeA,
  consumer: { kind: 'world_director', id: 'director:fixture', revision: 'worldbook-director-v1' },
  knowledgeSubjects: [{ kind: 'narrator', id: 'world-director' }],
  query: '导演侧暗线',
  budget: { maxTotalChars: 700, maxEntries: 1, maxEntryChars: 560 },
});
assert.deepEqual(directorHit.projection.items.map(item => item.entryId), [directorOnly.id]);

// Prepare is side-effect free. Only a usable provider result should call the receipt seam.
await DB.deleteDB();
assert.equal((await indexedReceipts()).length, 0);
await recordWorldbookRuntimeProjectionDelivery({
  prepared: chatHit,
  consumer: consumer('chat', 'success'),
  deliveredAt: 3_000,
});
await recordWorldbookRuntimeProjectionDelivery({
  prepared: callHit,
  consumer: consumer('call', 'success'),
  deliveredAt: 3_001,
});
const receipts = await indexedReceipts();
assert.equal(receipts.length, 2);
assert.deepEqual(receipts.map(receipt => receipt.consumer.kind).sort(), ['call', 'chat']);
assert.ok(receipts.every(receipt => receipt.scope.personaMaskId === scopeA.personaMaskId));
assert.ok(receipts.every(receipt => receipt.delivered[0]?.revisionId === getActiveWorldbookRevision(relevant).id));

// No receipt call is made for provider failure, empty/sanitized output, or local fallback.
assert.equal((await indexedReceipts()).length, 2);

// The explicitly named unmigrated legacy wrapper is static and may not grow silently.
const allowedLegacyCoreCallsites = [
  'apps/BankApp.tsx',
  'apps/Character.tsx',
  'apps/CheckPhone.tsx',
  'apps/CompanionPlanApp.tsx',
  'apps/DateApp.tsx',
  'apps/GameApp.tsx',
  'apps/GroupChat.tsx',
  'apps/JournalApp.tsx',
  'apps/RoomApp.tsx',
  'apps/ScheduleApp.tsx',
  'apps/SocialApp.tsx',
  'apps/StudyApp.tsx',
  'components/ValentineEvent.tsx',
  'components/WhiteDayEvent.tsx',
  'components/bank/BankShopScene.tsx',
  'hooks/useCompanionWakeupRuntime.ts',
  'utils/guidebookPrompts.ts',
  'utils/lifeSimPrompts.ts',
  'utils/songPrompts.ts',
].sort();
assert.deepEqual(findLegacyCoreCallsites(), allowedLegacyCoreCallsites);
const chatSource = readFileSync(join(root, 'hooks/useChatAI.ts'), 'utf8');
const chatPromptSource = readFileSync(join(root, 'utils/chatPrompts.ts'), 'utf8');
const callSource = readFileSync(join(root, 'apps/CallApp.tsx'), 'utf8');
assert.ok(chatPromptSource.includes('buildCanonicalCoreContext'));
assert.ok(callSource.includes('buildCanonicalCoreContext'));
assert.ok(!chatSource.includes('buildLegacyCoreContextWithMountedWorldbooks'));
assert.ok(!chatPromptSource.includes('buildLegacyCoreContextWithMountedWorldbooks'));
assert.ok(!callSource.includes('buildLegacyCoreContextWithMountedWorldbooks'));
assert.ok(chatSource.lastIndexOf('await recordWorldbookRuntimeProjectionDelivery') > chatSource.indexOf('ChatParser.sanitize(aiContent)'));
assert.ok(callSource.lastIndexOf('await recordWorldbookRuntimeProjectionDelivery') > callSource.indexOf("if (!assistantText) throw new Error('文本接口返回为空')"));

// Novel keeps its own supplementary setting text, but must not copy raw
// Worldbook bodies into a second prompt-owned snapshot.
const novelSource = readFileSync(join(root, 'apps/NovelApp.tsx'), 'utf8');
const novelPromptSource = readFileSync(join(root, 'utils/novelUtils.ts'), 'utf8');
const novelWriterSource = readFileSync(join(root, 'components/novel/NovelWriter.tsx'), 'utf8');
assert.ok(novelSource.includes('worldSetting: tempWorld'));
assert.ok(novelSource.includes('本书补充设定'));
assert.ok(!novelSource.includes('const importWorldbook'));
assert.ok(!novelSource.includes('isWorldbookModalOpen'));
assert.ok(novelPromptSource.includes('buildCanonicalCoreContext'));
assert.ok(!novelPromptSource.includes('buildLegacyCoreContextWithMountedWorldbooks'));
assert.ok(novelWriterSource.includes('prepareWorldbookRuntimeProjection'));
assert.ok(novelWriterSource.includes('recordWorldbookRuntimeProjectionDelivery'));
assert.ok(
  novelWriterSource.lastIndexOf('await recordWorldbookRuntimeProjectionDelivery')
  > novelWriterSource.indexOf('await persistSegments([...contextSegments, ...newAiSegments])'),
  'Novel must record Worldbook delivery only after usable prose is durably accepted',
);

await DB.deleteDB();
console.log('✅ Worldbook runtime adapter + Chat/Call typed projection verification passed');

async function indexedReceipts() {
  return (await import('../utils/worldbookPersistence.ts')).indexedDbWorldbookPersistence
    .listProjectionDeliveryReceipts(scopeA);
}

function findLegacyCoreCallsites(): string[] {
  const roots = ['apps', 'components', 'hooks', 'utils'];
  const files: string[] = [];
  const visit = (directory: string) => {
    readdirSync(directory).forEach(name => {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (/\.tsx?$/u.test(name) && readFileSync(path, 'utf8').includes('ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(')) {
        files.push(relative(root, path));
      }
    });
  };
  roots.forEach(directory => visit(join(root, directory)));
  return files.sort();
}
