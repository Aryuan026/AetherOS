import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import type { CompanionWakeupLog, CompanionWakeupRule, FullBackupData } from '../types';
import { DB } from '../utils/db';
import {
  assignMainDatabaseBackupStore,
  MAIN_DATABASE_BACKUP_STORES,
} from '../utils/systemBackup/mainDatabaseBackupContract';

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

const envelope: Partial<FullBackupData> = {};
assignMainDatabaseBackupStore(envelope, 'companion_wakeups', [rule], 'full');
assignMainDatabaseBackupStore(envelope, 'companion_wakeup_logs', [log], 'full');
assert.deepEqual(envelope.companionWakeupRules, [rule]);
assert.deepEqual(envelope.companionWakeupLogs, [log]);

await DB.saveCompanionWakeupRule(rule);
await DB.saveCompanionWakeupLog(log);

const exported = await DB.exportFullData();
assert.equal(exported.companionWakeupRules?.length, 1);
assert.equal(exported.companionWakeupRules?.[0]?.id, rule.id);
assert.deepEqual(exported.companionWakeupLogs, [log]);

await DB.importFullData({
  timestamp: 1_720_000_120_000,
  version: 5,
  companionWakeupRules: [],
  companionWakeupLogs: [],
});
assert.deepEqual(await DB.getAllCompanionWakeupRules(), []);
assert.deepEqual(await DB.getCompanionWakeupLogsByCharId(rule.charId), []);

await DB.importFullData({
  timestamp: 1_720_000_180_000,
  version: 5,
  companionWakeupRules: exported.companionWakeupRules,
  companionWakeupLogs: exported.companionWakeupLogs,
});
const restoredRules = await DB.getAllCompanionWakeupRules();
const restoredLogs = await DB.getCompanionWakeupLogsByCharId(rule.charId);
assert.equal(restoredRules.length, 1);
assert.equal(restoredRules[0]?.id, rule.id);
assert.equal(restoredRules[0]?.value, rule.value);
assert.deepEqual(restoredLogs, [log]);

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
  `whole-device backup contract OK: ${MAIN_DATABASE_BACKUP_STORES.length} stores registered; companion wakeup rules/logs export and restore`,
);
