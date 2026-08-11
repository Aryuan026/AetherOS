import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import type {
  CharacterProfile,
  CompanionWakeupLog,
  CompanionWakeupRule,
  FullBackupData,
  WorldGrowthCandidate,
  WorldbookGroupAssignment,
  WorldbookProjectionDeliveryReceipt,
} from '../types';
import { createHistoryScopeKey } from '../domain/historyImport/contract';
import {
  createWorldbookEntry,
  getActiveWorldbookRevision,
  reviseWorldbookEntry,
} from '../domain/worldbook/contract';
import { DB } from '../utils/db';
import {
  assignMainDatabaseBackupStore,
  MAIN_DATABASE_BACKUP_STORES,
} from '../utils/systemBackup/mainDatabaseBackupContract';
import {
  createCreativeScheme,
  createDefaultCreativeSchemeSettings,
} from '../domain/creativeScheme/index.ts';

const readSource = (relativePath: string): string => (
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
);

const dbSource = readSource('utils/db.ts');
const concreteStoreNames = Array.from(
  dbSource.matchAll(/^const STORE_[A-Z0-9_]+\s*=\s*'([^']+)'\s*;/gm),
  match => match[1],
);

assert.equal(
  new Set(concreteStoreNames).size,
  concreteStoreNames.length,
  'AetherOS_Data STORE_* declarations must remain unique',
);
assert.deepEqual(
  [...MAIN_DATABASE_BACKUP_STORES].sort(),
  [...concreteStoreNames].sort(),
  'every AetherOS_Data store needs an explicit whole-device backup registration',
);

const rule: CompanionWakeupRule = {
  id: 'backup-rule-sentinel',
  charId: 'backup-char',
  title: '傍晚来信',
  enabled: true,
  kind: 'window',
  mode: 'render',
  repeat: 'daily',
  windowStart: '18:00',
  windowEnd: '19:00',
  value: '问问今天过得怎么样',
  source: 'user',
  createdAt: 1_720_000_000_000,
  updatedAt: 1_720_000_000_000,
};
const log: CompanionWakeupLog = {
  id: 'backup-log-sentinel',
  ruleId: rule.id,
  charId: rule.charId,
  triggeredAt: 1_720_000_060_000,
  status: 'sent',
  mode: rule.mode,
  kind: rule.kind,
  message: '今天过得怎么样？',
};
const worldGrowthCandidate: WorldGrowthCandidate = {
  schemaVersion: 1,
  id: 'backup-world-growth-candidate',
  source: { kind: 'manual', refId: 'manual:backup-fixture' },
  draft: {
    title: '海边观察站',
    content: '等待玩家审核的世界书补充。',
    category: '地点',
    bindings: [{ id: 'binding-global', kind: 'global' }],
    knowledgePolicy: { kind: 'public' },
    sourceRefs: [{ kind: 'player', refId: 'manual:backup-fixture' }],
  },
  status: 'pending',
  truthEffect: 'none',
  createdAt: 1_720_000_000_000,
  updatedAt: 1_720_000_000_000,
};
const receiptScope = {
  progressBundleId: 'backup-bundle',
  personaMaskId: 'backup-mask',
  charId: 'backup-char',
};
const worldbookProjectionReceipt: WorldbookProjectionDeliveryReceipt = {
  schemaVersion: 1,
  id: 'backup-worldbook-delivery',
  selectionId: 'backup-worldbook-selection',
  requestId: 'backup-worldbook-request',
  scope: receiptScope,
  scopeKey: createHistoryScopeKey(receiptScope),
  consumer: { kind: 'chat', id: 'chat:backup', revision: '1' },
  knowledgeSubjects: [{ kind: 'user', id: 'user' }],
  delivered: [],
  budgetChars: 120,
  usedChars: 0,
  status: 'delivered',
  truthEffect: 'none',
  deliveredAt: 1_720_000_000_000,
};
const backupWorldbookGroup: WorldbookGroupAssignment = {
  id: 'worldbook-group:backup-char:places',
  name: '地点',
  owner: { kind: 'character', charId: 'backup-char' },
};
const backupWorldbookV1 = createWorldbookEntry({
  book: {
    id: 'backup-live-worldbook',
    title: '潮汐观察站',
    content: '第一版：观察站记录潮位。',
    category: '地点',
    group: backupWorldbookGroup,
    createdAt: 1_720_000_000_000,
    updatedAt: 1_720_000_000_000,
  },
  bindings: [{ id: 'backup-worldbook-global', kind: 'global' }],
  knowledgePolicy: { kind: 'public' },
  sourceRef: { kind: 'player', refId: 'backup-worldbook:create' },
});
const backupWorldbookV2 = reviseWorldbookEntry({
  current: backupWorldbookV1,
  patch: { content: '第二版：观察站新增了潮汐钟。' },
  sourceRef: { kind: 'player', refId: 'backup-worldbook:update' },
  updatedAt: 1_720_000_060_000,
});
const backupCharacter: CharacterProfile = {
  id: 'backup-char',
  name: '备份角色',
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
  mountedWorldbooks: [{
    id: backupWorldbookV1.id,
    title: '旧便携标题',
    content: '旧便携正文',
    category: '旧分组',
  }],
  mountedWorldbookGroupIds: [backupWorldbookGroup.id],
} as CharacterProfile;

const envelope: Partial<FullBackupData> = {};
const backupCreativeScheme = createCreativeScheme({
  id: 'creative-scheme:backup',
  name: '备份创作方案',
  source: 'player',
  modules: [{
    id: 'creative-module:backup',
    title: '备份笔触',
    content: '保留具体的空间连续性。',
    category: '文体表达',
    enabled: true,
    order: 1,
    surfaces: ['plain_novel'],
  }],
  now: 1_720_000_000_000,
});
const backupCreativeSchemeSettings = {
  ...createDefaultCreativeSchemeSettings(1_720_000_000_000),
  defaultSchemeId: backupCreativeScheme.id,
};
assignMainDatabaseBackupStore(envelope, 'companion_wakeups', [rule], 'full');
assignMainDatabaseBackupStore(envelope, 'companion_wakeup_logs', [log], 'full');
assignMainDatabaseBackupStore(
  envelope,
  'worldbook_growth_candidates',
  [worldGrowthCandidate],
  'full',
);
assignMainDatabaseBackupStore(envelope, 'worldbook_groups', [backupWorldbookGroup], 'full');
assignMainDatabaseBackupStore(
  envelope,
  'creative_schemes',
  [backupCreativeScheme, backupCreativeSchemeSettings],
  'full',
);
assignMainDatabaseBackupStore(
  envelope,
  'worldbook_projection_receipts',
  [worldbookProjectionReceipt],
  'full',
);
assert.deepEqual(envelope.companionWakeupRules, [rule]);
assert.deepEqual(envelope.companionWakeupLogs, [log]);
assert.deepEqual(envelope.worldbookGrowthCandidates, [worldGrowthCandidate]);
assert.deepEqual(envelope.worldbookProjectionDeliveryReceipts, [worldbookProjectionReceipt]);
assert.deepEqual(envelope.worldbookGroups, [backupWorldbookGroup]);
assert.deepEqual(envelope.creativeSchemeRecords, [backupCreativeScheme, backupCreativeSchemeSettings]);

await DB.deleteDB();
await DB.saveCharacter(backupCharacter);
await DB.saveWorldbookGroup(backupWorldbookGroup);
await DB.saveWorldbookRevision(backupWorldbookV1, null);
await DB.saveWorldbookRevision(
  backupWorldbookV2,
  getActiveWorldbookRevision(backupWorldbookV1).id,
);
await DB.saveCompanionWakeupRule(rule);
await DB.saveCompanionWakeupLog(log);
await DB.saveWorldGrowthCandidate(worldGrowthCandidate);
await DB.saveWorldbookProjectionDeliveryReceipt(worldbookProjectionReceipt);
await DB.saveCreativeSchemeRecord(backupCreativeScheme);
await DB.saveCreativeSchemeRecord(backupCreativeSchemeSettings);

const exported = await DB.exportFullData();
assert.equal(exported.companionWakeupRules?.length, 1);
assert.equal(exported.companionWakeupRules?.[0]?.id, rule.id);
assert.deepEqual(exported.companionWakeupLogs, [log]);
assert.deepEqual(exported.worldbookGrowthCandidates, [worldGrowthCandidate]);
assert.deepEqual(exported.worldbookProjectionDeliveryReceipts, [worldbookProjectionReceipt]);
assert.deepEqual(exported.worldbookGroups, [backupWorldbookGroup]);
assert.deepEqual(
  exported.creativeSchemeRecords?.slice().sort((left, right) => left.id.localeCompare(right.id)),
  [backupCreativeScheme, backupCreativeSchemeSettings].sort((left, right) => left.id.localeCompare(right.id)),
);
const exportedWorldbook = exported.worldbooks?.find(book => book.id === backupWorldbookV2.id);
assert.equal(exportedWorldbook?.revisionSnapshots?.length, 2);
assert.equal(exportedWorldbook?.activeRevisionId, backupWorldbookV2.activeRevisionId);
const exportedCharacter = exported.characters?.find(character => character.id === backupCharacter.id);
assert.deepEqual(exportedCharacter?.mountedWorldbooks, [{
  id: backupWorldbookV2.id,
  title: backupWorldbookV2.title,
  content: backupWorldbookV2.content,
  category: backupWorldbookV2.category,
  publicationStatus: 'published',
}]);

const originalBackupGetAll = IDBObjectStore.prototype.getAll;
for (const failingStore of [
  'worldbook_groups',
  'worldbooks',
  'worldbook_growth_candidates',
  'worldbook_projection_receipts',
  'creative_schemes',
]) {
  (IDBObjectStore.prototype as any).getAll = function failingBackupRead(this: IDBObjectStore) {
    if (this.name === failingStore) {
      throw new DOMException(`fixture blocks ${failingStore}`, 'InvalidStateError');
    }
    return originalBackupGetAll.call(this);
  };
  try {
    await assert.rejects(
      () => DB.exportFullData(),
      /fixture blocks/,
      `${failingStore} read failure must reject the whole backup`,
    );
  } finally {
    IDBObjectStore.prototype.getAll = originalBackupGetAll;
  }
}

await DB.importFullData({
  timestamp: 1_720_000_120_000,
  version: 5,
  characters: [],
  worldbookGroups: [],
  worldbooks: [],
  companionWakeupRules: [],
  companionWakeupLogs: [],
  worldbookGrowthCandidates: [],
  worldbookProjectionDeliveryReceipts: [],
  creativeSchemeRecords: [],
});
assert.deepEqual(await DB.getAllCompanionWakeupRules(), []);
assert.deepEqual(await DB.getCompanionWakeupLogsByCharId(rule.charId), []);
assert.deepEqual(await DB.getAllWorldGrowthCandidates(), []);
assert.deepEqual(await DB.getWorldbookProjectionDeliveryReceipts(worldbookProjectionReceipt.scopeKey), []);
assert.deepEqual(await DB.getAllWorldbooks(), []);
assert.deepEqual(await DB.getAllWorldbookGroups(), []);
assert.deepEqual(await DB.getAllCreativeSchemeRecords(), []);
assert.deepEqual(await DB.getAllCharacters(), []);

await DB.importFullData({
  timestamp: 1_720_000_180_000,
  version: 5,
  characters: exported.characters,
  worldbookGroups: exported.worldbookGroups,
  worldbooks: exported.worldbooks,
  companionWakeupRules: exported.companionWakeupRules,
  companionWakeupLogs: exported.companionWakeupLogs,
  worldbookGrowthCandidates: exported.worldbookGrowthCandidates,
  worldbookProjectionDeliveryReceipts: exported.worldbookProjectionDeliveryReceipts,
  creativeSchemeRecords: exported.creativeSchemeRecords,
});
const restoredRules = await DB.getAllCompanionWakeupRules();
const restoredLogs = await DB.getCompanionWakeupLogsByCharId(rule.charId);
assert.equal(restoredRules.length, 1);
assert.equal(restoredRules[0]?.id, rule.id);
assert.equal(restoredRules[0]?.value, rule.value);
assert.deepEqual(restoredLogs, [log]);
assert.deepEqual(await DB.getAllWorldGrowthCandidates(), [worldGrowthCandidate]);
assert.deepEqual(await DB.getAllWorldbookGroups(), [backupWorldbookGroup]);
assert.deepEqual(
  (await DB.getAllCreativeSchemeRecords()).sort((left, right) => left.id.localeCompare(right.id)),
  [backupCreativeScheme, backupCreativeSchemeSettings].sort((left, right) => left.id.localeCompare(right.id)),
);
assert.deepEqual(
  await DB.getWorldbookProjectionDeliveryReceipts(worldbookProjectionReceipt.scopeKey),
  [worldbookProjectionReceipt],
);
const restoredWorldbook = (await DB.getAllWorldbooks())
  .find(book => book.id === backupWorldbookV2.id);
assert.equal(restoredWorldbook?.revisionSnapshots?.length, 2);
assert.equal(restoredWorldbook?.activeRevisionId, backupWorldbookV2.activeRevisionId);
const restoredCharacter = (await DB.getAllCharacters())
  .find(character => character.id === backupCharacter.id);
assert.deepEqual(restoredCharacter?.mountedWorldbooks, exportedCharacter?.mountedWorldbooks);

const osContextSource = readSource('context/OSContext.tsx');
assert.match(
  osContextSource,
  /const allStores = \[\.\.\.MAIN_DATABASE_BACKUP_STORES\]/,
  'the full/text export path must consume the authoritative store registry',
);
assert.match(
  osContextSource,
  /assignMainDatabaseBackupStore\(\s*backupData,/,
  'the whole-device export path must use the tested store-to-envelope mapper',
);

console.log(
  `whole-device backup contract OK: ${MAIN_DATABASE_BACKUP_STORES.length} stores registered; Worldbook revision/cache roundtrip and fail-closed reads verified`,
);
