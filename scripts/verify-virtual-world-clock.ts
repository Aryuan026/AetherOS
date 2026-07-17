import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createDefaultVirtualWorldClockConfig,
  formatVirtualWorldContextForPrompt,
  getVirtualWorldClockStorageKey,
  normalizeVirtualWorldClockConfig,
  parseVirtualWorldClockConfig,
  resolveVirtualWorldContext,
  resolveVirtualWorldScope,
} from '../utils/virtualWorldClock';
import type { UserProfile } from '../types';

const profile: UserProfile = {
  name: 'User',
  avatar: '',
  bio: '',
  activeProgressBundleId: 'progress-a',
  activePersonaMaskId: 'mask-a',
  personaMasks: [
    {
      id: 'mask-a',
      label: 'A',
      name: 'User',
      avatar: '',
      bio: '',
      progressBundleId: 'progress-a',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'mask-b',
      label: 'B',
      name: 'User B',
      avatar: '',
      bio: '',
      progressBundleId: 'progress-b',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  progressBundles: [
    { id: 'progress-a', maskId: 'mask-a', label: 'A', surfacePolicy: {}, createdAt: 1, updatedAt: 1 },
    { id: 'progress-b', maskId: 'mask-b', label: 'B', surfacePolicy: {}, createdAt: 1, updatedAt: 1 },
  ],
};

const scopeA = resolveVirtualWorldScope(profile);
assert.deepEqual(scopeA, { progressBundleId: 'progress-a', personaMaskId: 'mask-a' });
const scopeB = resolveVirtualWorldScope({
  ...profile,
  activeProgressBundleId: 'progress-b',
  activePersonaMaskId: 'mask-b',
});
assert.deepEqual(scopeB, { progressBundleId: 'progress-b', personaMaskId: 'mask-b' });
assert.notEqual(getVirtualWorldClockStorageKey(scopeA!), getVirtualWorldClockStorageKey(scopeB!));
assert.equal(getVirtualWorldClockStorageKey(scopeA!), 'virtual_world_clock_v1:progress-a:mask-a');

assert.equal(resolveVirtualWorldScope({ ...profile, activeProgressBundleId: 'progress-b' }), null);
assert.equal(resolveVirtualWorldScope({ ...profile, progressBundles: [] }), null);
assert.equal(resolveVirtualWorldScope({ ...profile, activePersonaMaskId: undefined }), null);

const base = createDefaultVirtualWorldClockConfig(scopeA!, 10);
const fixed = normalizeVirtualWorldClockConfig({
  ...base,
  progressBundleId: 'attempted-cross-scope-write',
  personaMaskId: 'wrong-mask',
  locationLabel: '  雾港  ',
  eraLabel: '  新历 47 年  ',
  timeZoneMode: 'fixed_offset',
  utcOffsetMinutes: -60,
  yearOffset: 100,
  weatherMode: 'manual',
  weather: { condition: '薄雾', temperatureLabel: '11°C', icon: '🌫️' },
}, scopeA!, 20);
assert.equal(fixed.progressBundleId, scopeA!.progressBundleId);
assert.equal(fixed.personaMaskId, scopeA!.personaMaskId);
assert.equal(fixed.locationLabel, '雾港');
assert.equal(fixed.eraLabel, '新历 47 年');

const utcProbe = Date.UTC(2026, 0, 1, 0, 30, 0);
const fixedContext = resolveVirtualWorldContext(fixed, utcProbe);
assert.equal(fixedContext.clock.timeLabel, '23:30');
assert.equal(fixedContext.clock.dateLabel, '2125年12月31日');
assert.equal(fixedContext.source, 'virtual_world_clock_v1');
assert.equal(fixedContext.readOnly, true);
assert.deepEqual(fixedContext.scope, scopeA);
assert.equal(fixedContext.weather.source, 'manual');

const iana = normalizeVirtualWorldClockConfig({
  ...base,
  locationLabel: '临空市',
  timeZoneMode: 'iana',
  timeZoneId: 'Asia/Shanghai',
  yearOffset: 0,
}, scopeA!, 30);
const ianaContext = resolveVirtualWorldContext(iana, utcProbe);
assert.equal(ianaContext.clock.timeLabel, '08:30');
assert.equal(ianaContext.clock.dateLabel, '2026年1月1日');

const fallbackZone = normalizeVirtualWorldClockConfig({ ...iana, timeZoneId: 'Mars/Olympus' }, scopeA!, 40);
assert.equal(fallbackZone.timeZoneId, 'Asia/Shanghai');
assert.equal(parseVirtualWorldClockConfig({ ...iana, personaMaskId: 'mask-b' }, scopeA!), null);
assert.equal(parseVirtualWorldClockConfig({ ...iana, version: 2 }, scopeA!), null);
assert.ok(parseVirtualWorldClockConfig(iana, scopeA!));

const seasonal = normalizeVirtualWorldClockConfig({ ...iana, weatherMode: 'seasonal_sim' }, scopeA!, 50);
const seasonalFirst = resolveVirtualWorldContext(seasonal, utcProbe);
const seasonalAgain = resolveVirtualWorldContext(seasonal, utcProbe);
assert.deepEqual(seasonalFirst.weather, seasonalAgain.weather);
assert.equal(seasonalFirst.weather.source, 'seasonal_sim');

const promptContext = formatVirtualWorldContextForPrompt(fixedContext);
assert.match(promptContext, /只读世界环境/);
assert.match(promptContext, /source=virtual_world_clock_v1/);
assert.match(promptContext, /scope\.progressBundleId=progress-a/);
assert.match(promptContext, /禁止据此改写消息时间、导入时间、日档日期、当前剧情、任务或记忆/);

const moduleSource = readFileSync(fileURLToPath(new URL('../utils/virtualWorldClock.ts', import.meta.url)), 'utf8');
for (const forbidden of ['saveMessage', 'saveDailyArchive', 'HistoryImport', 'timestamp =', '.timestamp =']) {
  assert.equal(moduleSource.includes(forbidden), false, `virtual world module must not contain ${forbidden}`);
}

console.log('virtual world clock contract: OK — scoped keys, fail-closed scope, fixed/IANA clocks, local weather, read-only context');
