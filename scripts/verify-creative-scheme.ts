import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import {
  BUILT_IN_DREAMWORLD,
  DREAMWORLD_SCHEME_ID,
  archiveCreativeScheme,
  createCreativeScheme,
  createDefaultCreativeSchemeSettings,
  detachCreativeSchemeFromSettings,
  importCreativeSchemeJson,
  isCreativeSchemeArchived,
  prepareCreativeScheme,
  reorderCreativeSchemeModules,
  restoreCreativeScheme,
  reviseCreativeScheme,
  toggleCreativeSchemePinned,
  updateCreativeSchemeLibraryOrder,
} from '../domain/creativeScheme/index.ts';
import { DB } from '../utils/db.ts';
import { preparePlainNovelCreativeScheme } from '../utils/creativeSchemeRuntime.ts';

const builtIn = prepareCreativeScheme({
  schemes: [],
  settings: createDefaultCreativeSchemeSettings(1),
  surface: 'plain_novel',
});
assert.equal(builtIn.schemeId, DREAMWORLD_SCHEME_ID);
assert.equal(builtIn.revisionId, BUILT_IN_DREAMWORLD.revisionId);
assert.match(builtIn.markdown, /你已来到梦世界/u);
assert.match(builtIn.markdown, /距离、朝向、姿态/u);
assert.match(builtIn.markdown, /冲突可以停留一会儿/u);
assert.match(builtIn.markdown, /空白可以生长/u);
assert.match(builtIn.markdown, /每一轮都带来一点新的东西/u);
assert.match(builtIn.markdown, /直接交付可以接进手稿/u);
assert.doesNotMatch(builtIn.markdown, /心理驯化/u);
assert.equal(BUILT_IN_DREAMWORLD.modules.length, 20);

const custom = createCreativeScheme({
  id: 'creative-scheme:test',
  name: '测试方案',
  source: 'player',
  modules: [{
    id: 'module:test',
    title: '潮湿的城市',
    content: '让雨声和城市表面参与叙事。',
    category: '文体表达',
    enabled: true,
    order: 1,
    surfaces: ['plain_novel'],
  }],
  now: 2,
});
const revised = reviseCreativeScheme({
  scheme: custom,
  modules: [{
    ...custom.revisions[0].modules[0],
    content: '让雨声、反光和城市表面参与叙事。',
  }],
  now: 3,
});
assert.equal(revised.revisions.length, 2);
assert.equal(custom.revisions[0].modules[0].content, '让雨声和城市表面参与叙事。');
assert.equal(revised.lifecycle, 'active');

const reorderedModules = reorderCreativeSchemeModules({
  modules: [
    { ...revised.revisions[1].modules[0], id: 'frame-a', category: '创作框架', order: 0 },
    { ...revised.revisions[1].modules[0], id: 'style-a', category: '文体表达', order: 1 },
    { ...revised.revisions[1].modules[0], id: 'frame-b', category: '创作框架', order: 2 },
  ],
  category: '创作框架',
  orderedModuleIds: ['frame-b', 'frame-a'],
});
assert.deepEqual(reorderedModules.map(module => module.id), ['frame-b', 'style-a', 'frame-a']);
assert.deepEqual(reorderedModules.map(module => module.order), [0, 1, 2]);
assert.throws(() => reorderCreativeSchemeModules({
  modules: reorderedModules,
  category: '创作框架',
  orderedModuleIds: ['frame-b'],
}), /完整条目顺序/u);

const settings = {
  ...createDefaultCreativeSchemeSettings(4),
  characterSchemeIds: { 'char-a': revised.id },
};
const orderedSettings = updateCreativeSchemeLibraryOrder({
  settings,
  schemeOrderIds: [revised.id, DREAMWORLD_SCHEME_ID, revised.id],
  now: 4,
});
assert.deepEqual(orderedSettings.schemeOrderIds, [revised.id, DREAMWORLD_SCHEME_ID]);
const pinnedSettings = toggleCreativeSchemePinned({ settings: orderedSettings, schemeId: revised.id, now: 5 });
assert.deepEqual(pinnedSettings.pinnedSchemeIds, [revised.id]);
assert.deepEqual(
  toggleCreativeSchemePinned({ settings: pinnedSettings, schemeId: revised.id, now: 6 }).pinnedSchemeIds,
  [],
);
const detachedSettings = detachCreativeSchemeFromSettings({
  settings: { ...settings, defaultSchemeId: revised.id },
  schemeId: revised.id,
  now: 5,
});
assert.equal(detachedSettings.defaultSchemeId, DREAMWORLD_SCHEME_ID);
assert.deepEqual(detachedSettings.characterSchemeIds, {});
const archived = archiveCreativeScheme(revised, 6);
assert.equal(isCreativeSchemeArchived(archived), true);
assert.throws(() => prepareCreativeScheme({
  schemes: [archived],
  settings,
  characterId: 'char-a',
  surface: 'plain_novel',
}), /已经归档/u);
const restored = restoreCreativeScheme(archived, 7);
assert.equal(restored.lifecycle, 'active');
assert.equal(restored.archivedAt, undefined);
const preparedCustom = prepareCreativeScheme({
  schemes: [revised],
  settings,
  characterId: 'char-a',
  surface: 'plain_novel',
});
assert.equal(preparedCustom.schemeId, revised.id);
assert.match(preparedCustom.markdown, /反光/u);

assert.throws(() => prepareCreativeScheme({
  schemes: [],
  settings: { ...settings, characterSchemeIds: { 'char-a': 'missing-scheme' } },
  characterId: 'char-a',
  surface: 'plain_novel',
}), /不存在/u);

const imported = importCreativeSchemeJson({
  fileName: '外部方案.json',
  now: 10,
  json: JSON.stringify({
    name: '外部方案',
    temperature: 0.72,
    prompts: [
      { identifier: 'voice', name: '文风', content: '让句式跟随现场节奏。', enabled: true },
      { identifier: 'format', name: '输出格式', content: '直接输出正文。', enabled: true },
    ],
    prompt_order: [{
      character_id: 100001,
      order: [
        { identifier: 'format', enabled: false },
        { identifier: 'voice', enabled: true },
      ],
    }],
  }),
});
const importedRevision = imported.revisions[0];
assert.deepEqual(importedRevision.modules.map(module => module.sourceIdentifier), ['voice', 'format']);
assert.equal(importedRevision.modules.find(module => module.sourceIdentifier === 'format')?.enabled, false);
assert.equal(importedRevision.modules.find(module => module.sourceIdentifier === 'format')?.order, 0);
assert.equal(importedRevision.modelHints?.temperature, 0.72);
assert.throws(() => importCreativeSchemeJson({
  fileName: '快捷按钮.json',
  now: 11,
  json: JSON.stringify({ quickReplySlots: [] }),
}), /不是可导入的创作方案/u);

await DB.deleteDB();
await DB.saveCreativeSchemeRecord(revised);
await DB.saveCreativeSchemeRecord(settings);
const runtimePrepared = await preparePlainNovelCreativeScheme('char-a');
assert.equal(runtimePrepared.schemeId, revised.id);
const exported = await DB.exportFullData();
assert.equal(exported.creativeSchemeRecords?.length, 2);
const exportedSettings = exported.creativeSchemeRecords?.find(record => record.kind === 'settings');
assert.deepEqual(exportedSettings?.schemeOrderIds, [DREAMWORLD_SCHEME_ID]);
assert.deepEqual(exportedSettings?.pinnedSchemeIds, []);

await DB.importFullData({
  timestamp: 20,
  version: 1,
  creativeSchemeRecords: [],
} as any);
assert.deepEqual(await DB.getAllCreativeSchemeRecords(), []);
await DB.importFullData({
  timestamp: 21,
  version: 1,
  creativeSchemeRecords: exported.creativeSchemeRecords,
} as any);
assert.equal((await DB.getAllCreativeSchemeRecords()).length, 2);

const archivedSettings = detachCreativeSchemeFromSettings({
  settings,
  schemeId: revised.id,
  now: 30,
});
await assert.rejects(() => DB.deleteCreativeScheme(revised.id), /请先归档/u);
await assert.rejects(() => DB.archiveCreativeScheme(revised.id, settings), /必须先解除/u);
await DB.archiveCreativeScheme(revised.id, archivedSettings);
await assert.rejects(() => DB.archiveCreativeScheme(revised.id, archivedSettings), /已经在归档/u);
const archivedRecords = await DB.getAllCreativeSchemeRecords();
assert.equal(archivedRecords.find(record => record.kind === 'scheme')?.lifecycle, 'archived');
assert.deepEqual(
  archivedRecords.find(record => record.kind === 'settings' && record.id === archivedSettings.id),
  archivedSettings,
);
await DB.restoreCreativeScheme(revised.id);
await assert.rejects(() => DB.restoreCreativeScheme(revised.id), /不在归档/u);
assert.equal(
  (await DB.getAllCreativeSchemeRecords()).find(record => record.kind === 'scheme')?.lifecycle,
  'active',
);
await DB.archiveCreativeScheme(revised.id, archivedSettings);
await DB.deleteCreativeScheme(revised.id);
assert.equal((await DB.getAllCreativeSchemeRecords()).some(record => record.kind === 'scheme'), false);

const appSource = readFileSync(new URL('../apps/CreativeSchemeApp.tsx', import.meta.url), 'utf8');
assert.match(appSource, /方案组/u);
assert.match(appSource, /DB\.archiveCreativeScheme/u);
assert.match(appSource, /DB\.restoreCreativeScheme/u);
assert.match(appSource, /detachCreativeSchemeFromSettings/u);
assert.match(appSource, /归档整组/u);
assert.match(appSource, /activeSchemes\.map/u);
assert.match(appSource, /data-creative-scheme-group-id/u);
assert.match(appSource, /toggleCreativeSchemePinned/u);
assert.match(appSource, /updateCreativeSchemeLibraryOrder/u);
assert.match(appSource, /reorderCreativeSchemeModules/u);
assert.match(appSource, /data-creative-scheme-module-id/u);
assert.match(appSource, /expandedModuleIds/u);
assert.match(appSource, /所有角色默认使用/u);
assert.match(appSource, /设为所有角色默认/u);
assert.match(appSource, /取消后回到通用方案/u);
assert.match(appSource, /title="导入方案"/u);
assert.match(appSource, /M3 16\.5v2\.25/u);
assert.doesNotMatch(appSource, /grid grid-cols-2 gap-2 sm:grid-cols-3/u);

console.log('CreativeScheme built-in, grouped library, archive, import, revision, binding, runtime and backup: OK');
