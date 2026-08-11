import { DOCK_APPS, INSTALLED_APPS, LAUNCHER_APP_GROUPS } from '../constants';
import { AppID, LauncherLayoutV1 } from '../types';

export const LAUNCHER_LAYOUT_VERSION = 1 as const;
export const LAUNCHER_APPS_PER_PAGE = 8;

export interface LauncherLayoutCatalog {
  installedAppIds: readonly AppID[];
  defaultAppOrder: readonly AppID[];
  defaultDockAppIds: readonly AppID[];
}

const installedAppIds = INSTALLED_APPS.map(app => app.id);
const installedAppIdSet = new Set<AppID>(installedAppIds);
const defaultDockAppIdSet = new Set<AppID>(DOCK_APPS);

const uniqueKnownIds = (value: unknown, allowed: ReadonlySet<AppID>): AppID[] => {
  if (!Array.isArray(value)) return [];
  const result: AppID[] = [];
  const seen = new Set<AppID>();
  value.forEach(item => {
    if (typeof item !== 'string') return;
    const appId = item as AppID;
    if (!allowed.has(appId) || seen.has(appId)) return;
    seen.add(appId);
    result.push(appId);
  });
  return result;
};

const appendMissing = (current: AppID[], defaults: readonly AppID[]): AppID[] => {
  const seen = new Set(current);
  return [...current, ...defaults.filter(appId => !seen.has(appId))];
};

const groupedGridIds = LAUNCHER_APP_GROUPS.flatMap(group => group.appIds)
  .filter(appId => installedAppIdSet.has(appId) && !defaultDockAppIdSet.has(appId));
const installedGridIds = installedAppIds.filter(appId => !defaultDockAppIdSet.has(appId));

export const DEFAULT_LAUNCHER_APP_ORDER = appendMissing(
  uniqueKnownIds(groupedGridIds, new Set(installedGridIds)),
  installedGridIds,
);

export const DEFAULT_LAUNCHER_DOCK_APP_IDS = [...DOCK_APPS];

const chunkLauncherAppIds = (appIds: readonly AppID[]): AppID[][] => {
  const pages: AppID[][] = [];
  for (let index = 0; index < appIds.length; index += LAUNCHER_APPS_PER_PAGE) {
    pages.push(appIds.slice(index, index + LAUNCHER_APPS_PER_PAGE));
  }
  return pages;
};

const DEFAULT_LAUNCHER_GROUP_PAGES = (() => {
  const allowed = new Set(DEFAULT_LAUNCHER_APP_ORDER);
  const seen = new Set<AppID>();
  const pages = LAUNCHER_APP_GROUPS.flatMap(group => {
    const groupAppIds = group.appIds.filter(appId => {
      if (!allowed.has(appId) || seen.has(appId)) return false;
      seen.add(appId);
      return true;
    });
    return chunkLauncherAppIds(groupAppIds);
  });
  return [
    ...pages,
    ...chunkLauncherAppIds(DEFAULT_LAUNCHER_APP_ORDER.filter(appId => !seen.has(appId))),
  ];
})();

const currentLauncherCatalog: LauncherLayoutCatalog = {
  installedAppIds,
  defaultAppOrder: DEFAULT_LAUNCHER_APP_ORDER,
  defaultDockAppIds: DEFAULT_LAUNCHER_DOCK_APP_IDS,
};

export const createDefaultLauncherLayout = (): LauncherLayoutV1 => ({
  version: LAUNCHER_LAYOUT_VERSION,
  appOrder: [...DEFAULT_LAUNCHER_APP_ORDER],
  dockAppIds: [...DEFAULT_LAUNCHER_DOCK_APP_IDS],
  hiddenAppIds: [],
});

/**
 * Resolve partial, old or shared layout data against the apps installed by this
 * version. Unknown ids disappear; newly shipped apps are appended visibly.
 */
export const normalizeLauncherLayoutForCatalog = (
  value: unknown,
  catalog: LauncherLayoutCatalog,
): LauncherLayoutV1 => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const catalogInstalledIds = [...catalog.installedAppIds];
  const catalogInstalledSet = new Set(catalogInstalledIds);
  const defaultDockAppIds = uniqueKnownIds(catalog.defaultDockAppIds, catalogInstalledSet);
  const dockAllowed = new Set(defaultDockAppIds);
  const defaultAppOrder = appendMissing(
    uniqueKnownIds(catalog.defaultAppOrder, catalogInstalledSet),
    catalogInstalledIds.filter(appId => !dockAllowed.has(appId)),
  ).filter(appId => !dockAllowed.has(appId));
  const gridAllowed = new Set(defaultAppOrder);
  const appOrder = appendMissing(
    uniqueKnownIds(source.appOrder, gridAllowed),
    defaultAppOrder,
  );
  const dockAppIds = appendMissing(
    uniqueKnownIds(source.dockAppIds, dockAllowed),
    defaultDockAppIds,
  );
  const hiddenAppIds = uniqueKnownIds(source.hiddenAppIds, catalogInstalledSet)
    .filter(appId => appId !== AppID.Settings);

  return {
    version: LAUNCHER_LAYOUT_VERSION,
    appOrder,
    dockAppIds,
    hiddenAppIds,
  };
};

export const normalizeLauncherLayout = (value: unknown): LauncherLayoutV1 => (
  normalizeLauncherLayoutForCatalog(value, currentLauncherCatalog)
);

const sameAppOrder = (left: readonly AppID[], right: readonly AppID[]): boolean => (
  left.length === right.length && left.every((appId, index) => appId === right[index])
);

/** Settings only needs a recovery row after the human has changed the layout. */
export const isDefaultLauncherLayout = (value: unknown): boolean => {
  const layout = normalizeLauncherLayout(value);
  const defaults = createDefaultLauncherLayout();
  return sameAppOrder(layout.appOrder, defaults.appOrder)
    && sameAppOrder(layout.dockAppIds, defaults.dockAppIds)
    && sameAppOrder(layout.hiddenAppIds, defaults.hiddenAppIds);
};

/** Launcher and Appearance share this projection so page boundaries cannot drift. */
export const paginateLauncherAppIds = (value: unknown): AppID[][] => {
  const layout = normalizeLauncherLayout(value);
  if (
    layout.hiddenAppIds.length === 0
    && sameAppOrder(layout.appOrder, DEFAULT_LAUNCHER_APP_ORDER)
  ) {
    return DEFAULT_LAUNCHER_GROUP_PAGES.map(page => [...page]);
  }
  const hiddenIds = new Set(layout.hiddenAppIds);
  const visibleIds = layout.appOrder.filter(appId => !hiddenIds.has(appId));
  const pages = chunkLauncherAppIds(visibleIds);
  return pages.length > 0 ? pages : [[]];
};

/** Invalid nested contracts are ignored so an old shared preset keeps the
 * recipient's current launcher layout instead of resetting it. */
export const sanitizeImportedLauncherLayout = (value: unknown): LauncherLayoutV1 | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (source.version !== LAUNCHER_LAYOUT_VERSION) return undefined;
  if (
    !Array.isArray(source.appOrder)
    && !Array.isArray(source.dockAppIds)
    && !Array.isArray(source.hiddenAppIds)
  ) return undefined;
  return normalizeLauncherLayout(source);
};

export const setLauncherAppHidden = (
  value: unknown,
  appId: AppID,
  hidden: boolean,
): LauncherLayoutV1 => {
  const layout = normalizeLauncherLayout(value);
  if (!installedAppIdSet.has(appId) || appId === AppID.Settings) return layout;
  const nextHidden = new Set(layout.hiddenAppIds);
  if (hidden) nextHidden.add(appId);
  else nextHidden.delete(appId);
  return { ...layout, hiddenAppIds: installedAppIds.filter(id => nextHidden.has(id)) };
};

export const moveLauncherApp = (
  value: unknown,
  appId: AppID,
  direction: -1 | 1,
): LauncherLayoutV1 => {
  const layout = normalizeLauncherLayout(value);
  const key = layout.dockAppIds.includes(appId) ? 'dockAppIds' : 'appOrder';
  const list = [...layout[key]];
  const index = list.indexOf(appId);
  if (index < 0) return layout;
  const appIsHidden = layout.hiddenAppIds.includes(appId);
  let target = index + direction;
  if (key === 'appOrder') {
    while (
      target >= 0
      && target < list.length
      && layout.hiddenAppIds.includes(list[target]) !== appIsHidden
    ) target += direction;
  }
  if (target < 0 || target >= list.length) return layout;
  [list[index], list[target]] = [list[target], list[index]];
  return { ...layout, [key]: list };
};
