import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppID } from '../types';
import { INSTALLED_APPS } from '../constants';
import {
  DEFAULT_LAUNCHER_APP_ORDER,
  DEFAULT_LAUNCHER_DOCK_APP_IDS,
  LAUNCHER_APPS_PER_PAGE,
  createDefaultLauncherLayout,
  isDefaultLauncherLayout,
  moveLauncherApp,
  normalizeLauncherLayout,
  normalizeLauncherLayoutForCatalog,
  paginateLauncherAppIds,
  sanitizeImportedLauncherLayout,
  setLauncherAppHidden,
} from '../utils/launcherLayout';

const defaults = createDefaultLauncherLayout();
assert.deepEqual(defaults.appOrder, DEFAULT_LAUNCHER_APP_ORDER);
assert.deepEqual(defaults.dockAppIds, DEFAULT_LAUNCHER_DOCK_APP_IDS);
assert.deepEqual(defaults.hiddenAppIds, []);
assert.ok(defaults.dockAppIds.includes(AppID.Settings));
assert.equal(isDefaultLauncherLayout(undefined), true);
assert.equal(isDefaultLauncherLayout(defaults), true);

const omittedCurrentApp = defaults.appOrder[defaults.appOrder.length - 1];
const normalized = normalizeLauncherLayout({
  version: 1,
  appOrder: [AppID.FAQ, AppID.Character, 'future_unknown_app', AppID.FAQ],
  dockAppIds: [AppID.Settings, AppID.Chat, 'future_unknown_dock_app'],
  hiddenAppIds: [AppID.Appearance, AppID.Settings, 'future_unknown_app', AppID.Appearance],
});
assert.deepEqual(normalized.appOrder.slice(0, 2), [AppID.FAQ, AppID.Character]);
assert.ok(normalized.appOrder.includes(omittedCurrentApp), 'new/current apps omitted by an older layout must be appended');
assert.deepEqual(normalized.dockAppIds.slice(0, 2), [AppID.Settings, AppID.Chat]);
assert.deepEqual(new Set(normalized.dockAppIds), new Set(DEFAULT_LAUNCHER_DOCK_APP_IDS));
assert.deepEqual(normalized.hiddenAppIds, [AppID.Appearance]);

const hidden = setLauncherAppHidden(defaults, AppID.Appearance, true);
assert.ok(hidden.hiddenAppIds.includes(AppID.Appearance));
assert.equal(isDefaultLauncherLayout(hidden), false);
const restored = setLauncherAppHidden(hidden, AppID.Appearance, false);
assert.ok(!restored.hiddenAppIds.includes(AppID.Appearance));
const settingsCannotHide = setLauncherAppHidden(defaults, AppID.Settings, true);
assert.ok(!settingsCannotHide.hiddenAppIds.includes(AppID.Settings));
assert.ok(settingsCannotHide.dockAppIds.includes(AppID.Settings));

const firstGridApp = defaults.appOrder[0];
const secondGridApp = defaults.appOrder[1];
const movedGrid = moveLauncherApp(defaults, firstGridApp, 1);
assert.deepEqual(movedGrid.appOrder.slice(0, 2), [secondGridApp, firstGridApp]);
assert.equal(isDefaultLauncherLayout(movedGrid), false);
const movedDock = moveLauncherApp(defaults, AppID.Settings, -1);
assert.equal(movedDock.dockAppIds.indexOf(AppID.Settings), defaults.dockAppIds.indexOf(AppID.Settings) - 1);

const defaultPages = paginateLauncherAppIds(defaults);
assert.deepEqual(defaultPages.flat(), defaults.appOrder);
assert.ok(defaultPages.every(page => page.length <= LAUNCHER_APPS_PER_PAGE));
assert.deepEqual(defaults.appOrder, [
  // 日常陪伴核心
  AppID.Character,
  AppID.CompanionPlan,
  AppID.Schedule,
  AppID.Social,
  AppID.Journal,
  AppID.Study,
  AppID.GroupChat,
  AppID.User,
  // 关系与共同生活
  AppID.Date,
  AppID.Room,
  AppID.CheckPhone,
  AppID.SpecialMoments,
  AppID.DailyArchive,
  AppID.HistoryImport,
  // 独立故事创作
  AppID.Novel,
  AppID.Worldbook,
  AppID.CreativeScheme,
  AppID.Game,
  AppID.LifeSim,
  AppID.Guidebook,
  AppID.Songwriting,
  // 装扮与工具
  AppID.ThemeMaker,
  AppID.Appearance,
  AppID.Widget,
  AppID.Bank,
  AppID.FAQ,
]);
assert.deepEqual(defaultPages[0], [
  AppID.Character,
  AppID.CompanionPlan,
  AppID.Schedule,
  AppID.Social,
  AppID.Journal,
  AppID.Study,
  AppID.GroupChat,
  AppID.User,
]);
assert.deepEqual(defaultPages.slice(1), [
  [
    AppID.Date,
    AppID.Room,
    AppID.CheckPhone,
    AppID.SpecialMoments,
    AppID.DailyArchive,
    AppID.HistoryImport,
  ],
  [
    AppID.Novel,
    AppID.Worldbook,
    AppID.CreativeScheme,
    AppID.Game,
    AppID.LifeSim,
    AppID.Guidebook,
    AppID.Songwriting,
  ],
  [
    AppID.ThemeMaker,
    AppID.Appearance,
    AppID.Widget,
    AppID.Bank,
    AppID.FAQ,
  ],
]);
assert.equal(INSTALLED_APPS.find(app => app.id === AppID.Novel)?.name, '手稿');
const pageBoundaryApp = defaults.appOrder[LAUNCHER_APPS_PER_PAGE - 1];
const crossedPageBoundary = moveLauncherApp(defaults, pageBoundaryApp, 1);
assert.equal(
  paginateLauncherAppIds(crossedPageBoundary)[1][0],
  pageBoundaryApp,
  'moving item 8 down must make it the first app on page 2',
);
const hiddenSecond = setLauncherAppHidden(defaults, secondGridApp, true);
const movedPastHidden = moveLauncherApp(hiddenSecond, firstGridApp, 1);
assert.deepEqual(
  paginateLauncherAppIds(movedPastHidden)[0].slice(0, 2),
  [defaults.appOrder[2], firstGridApp],
  'visible sorting must skip hidden rows so every tap has a visible result',
);
const customAcrossGroupBoundary = moveLauncherApp(defaults, AppID.Novel, -1);
assert.ok(
  paginateLauncherAppIds(customAcrossGroupBoundary)[1].includes(AppID.Novel),
  'a moved layout must fall back to the saved flat order instead of reconstructing default groups',
);
const hiddenDefaultApp = setLauncherAppHidden(defaults, AppID.Date, true);
assert.equal(
  paginateLauncherAppIds(hiddenDefaultApp)[1].length,
  LAUNCHER_APPS_PER_PAGE,
  'a hidden app must repaginate the saved visible order in ordinary 8-app pages',
);

const futureRegisteredApp = 'future_registered_app' as AppID;
const upgradedCatalogLayout = normalizeLauncherLayoutForCatalog(defaults, {
  installedAppIds: [...defaults.appOrder, ...defaults.dockAppIds, futureRegisteredApp],
  defaultAppOrder: [...defaults.appOrder, futureRegisteredApp],
  defaultDockAppIds: defaults.dockAppIds,
});
assert.equal(
  upgradedCatalogLayout.appOrder[upgradedCatalogLayout.appOrder.length - 1],
  futureRegisteredApp,
  'an app added only to the shared registry must automatically enter Appearance and Launcher',
);
assert.ok(!upgradedCatalogLayout.hiddenAppIds.includes(futureRegisteredApp));

assert.equal(sanitizeImportedLauncherLayout(undefined), undefined);
assert.equal(sanitizeImportedLauncherLayout({ version: 2, appOrder: [] }), undefined);
assert.deepEqual(sanitizeImportedLauncherLayout({
  version: 1,
  appOrder: [AppID.FAQ, 'unknown'],
  dockAppIds: [AppID.Settings],
  hiddenAppIds: [AppID.Appearance, AppID.Settings],
}), normalizeLauncherLayout({
  appOrder: [AppID.FAQ],
  dockAppIds: [AppID.Settings],
  hiddenAppIds: [AppID.Appearance],
}));

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const launcherSource = read('apps/Launcher.tsx');
const appearanceSource = read('apps/Appearance.tsx');
const settingsSource = read('apps/Settings.tsx');
assert.match(launcherSource, /normalizeLauncherLayout\(theme\.launcherLayout\)/);
assert.doesNotMatch(launcherSource, /LAUNCHER_APP_GROUPS/);
assert.doesNotMatch(launcherSource, /日常陪伴核心|关系与共同生活|独立故事创作|装扮与工具/);
assert.match(launcherSource, /paginateLauncherAppIds\(launcherLayout\)/);
assert.match(appearanceSource, /<LauncherLayoutEditor/);
assert.match(appearanceSource, /INSTALLED_APPS\.map\(app =>/);
assert.match(appearanceSource, />美化预设<\/button>/);
const layoutEditorSource = read('components/appearance/LauncherLayoutEditor.tsx');
assert.match(layoutEditorSource, /个 App 页/);
assert.match(layoutEditorSource, /固定日历页不参与排序/);
assert.match(settingsSource, /data-launcher-layout-recovery/);
assert.match(settingsSource, /createDefaultLauncherLayout\(\)/);
assert.match(settingsSource, /hasCustomizedLauncherLayout\s*&&\s*<section/);
assert.match(settingsSource, /!isDefaultLauncherLayout\(theme\.launcherLayout\)/);

console.log('launcher layout contract: OK — shared pagination, visibility, Dock recovery, and registry-driven new apps are guarded');
