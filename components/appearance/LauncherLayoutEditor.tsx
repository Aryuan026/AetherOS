import React, { useMemo } from 'react';
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretUp,
  Eye,
  EyeSlash,
  LockKey,
} from '@phosphor-icons/react';
import { INSTALLED_APPS, Icons } from '../../constants';
import { AppConfig, AppID, OSTheme, Toast } from '../../types';
import {
  createDefaultLauncherLayout,
  LAUNCHER_APPS_PER_PAGE,
  moveLauncherApp,
  normalizeLauncherLayout,
  paginateLauncherAppIds,
  setLauncherAppHidden,
} from '../../utils/launcherLayout';

interface LauncherLayoutEditorProps {
  theme: OSTheme;
  customIcons: Record<string, string>;
  updateTheme: (updates: Partial<OSTheme>) => void;
  addToast: (message: string, type?: Toast['type']) => void;
}

const AppBadge: React.FC<{ app: AppConfig; customIcon?: string }> = ({ app, customIcon }) => {
  const Icon = Icons[app.icon] || Icons.Settings;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
      {customIcon ? (
        <img src={customIcon} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
    </div>
  );
};

const LauncherLayoutEditor: React.FC<LauncherLayoutEditorProps> = ({
  theme,
  customIcons,
  updateTheme,
  addToast,
}) => {
  const layout = useMemo(() => normalizeLauncherLayout(theme.launcherLayout), [theme.launcherLayout]);
  const appById = useMemo(() => new Map(INSTALLED_APPS.map(app => [app.id, app])), []);
  const hiddenIds = useMemo(() => new Set(layout.hiddenAppIds), [layout.hiddenAppIds]);
  const visibleAppIds = useMemo(
    () => layout.appOrder.filter(appId => !hiddenIds.has(appId)),
    [hiddenIds, layout.appOrder],
  );
  const hiddenGridAppIds = useMemo(
    () => layout.appOrder.filter(appId => hiddenIds.has(appId)),
    [hiddenIds, layout.appOrder],
  );
  const appPages = useMemo(() => paginateLauncherAppIds(layout), [layout]);

  const updateLayout = (nextLayout: ReturnType<typeof normalizeLauncherLayout>) => {
    updateTheme({ launcherLayout: nextLayout });
  };

  const toggleHidden = (app: AppConfig) => {
    if (app.id === AppID.Settings) return;
    const shouldHide = !hiddenIds.has(app.id);
    updateLayout(setLauncherAppHidden(layout, app.id, shouldHide));
    addToast(shouldHide ? `已从桌面隐藏「${app.name}」` : `「${app.name}」已回到桌面`, 'success');
  };

  const renderRows = (ids: AppID[], orderedIds: AppID[] = ids) => ids.flatMap(appId => {
    const app = appById.get(appId);
    if (!app) return [];
    const orderIndex = orderedIds.indexOf(appId);
    const isHidden = hiddenIds.has(app.id);
    const isSettings = app.id === AppID.Settings;
    return [(
      <div
        key={app.id}
        role="listitem"
        data-launcher-layout-row={app.id}
        className={`flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 transition ${
          isHidden ? 'border-slate-100 bg-slate-50/70 opacity-65' : 'border-slate-100 bg-white'
        }`}
      >
        <AppBadge app={app} customIcon={customIcons[app.id]} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold text-slate-600">{app.name}</div>
          <div className="mt-0.5 text-[9px] text-slate-400">
            {isSettings ? '始终保留在 Dock' : isHidden ? '已隐藏 · 不会删除数据' : '桌面可见'}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`将${app.name}上移`}
            disabled={orderIndex === 0}
            onClick={() => updateLayout(moveLauncherApp(layout, app.id, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <CaretUp className="h-4 w-4" weight="bold" />
          </button>
          <button
            type="button"
            aria-label={`将${app.name}下移`}
            disabled={orderIndex === orderedIds.length - 1}
            onClick={() => updateLayout(moveLauncherApp(layout, app.id, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <CaretDown className="h-4 w-4" weight="bold" />
          </button>
          <button
            type="button"
            aria-label={isSettings ? '设置始终显示' : `${isHidden ? '恢复' : '隐藏'}${app.name}`}
            aria-pressed={!isHidden}
            disabled={isSettings}
            onClick={() => toggleHidden(app)}
            className={`flex h-8 min-w-8 items-center justify-center rounded-xl border px-2 text-[9px] font-semibold transition active:scale-95 disabled:cursor-not-allowed ${
              isSettings
                ? 'border-emerald-100 bg-emerald-50 text-emerald-500'
                : isHidden
                  ? 'border-violet-200 bg-violet-50 text-violet-600'
                  : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {isSettings ? <LockKey className="h-4 w-4" /> : isHidden ? <Eye className="h-4 w-4" /> : <EyeSlash className="h-4 w-4" />}
          </button>
        </div>
      </div>
    )];
  });

  return (
    <section
      data-launcher-layout-editor
      className="rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-5 tracking-[0.02em] text-slate-700">桌面布局</h2>
          <p className="mt-1 text-[10px] leading-[1.55] text-slate-400">
            隐藏不会卸载 App；App 每页最多 8 个，排序或隐藏后会自动重新分页。固定日历页不参与排序。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            updateLayout(createDefaultLauncherLayout());
            addToast('桌面布局已恢复默认', 'success');
          }}
          className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[9px] font-semibold text-slate-500 transition active:scale-95"
        >
          <ArrowCounterClockwise className="h-3.5 w-3.5" weight="bold" />
          恢复默认
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" aria-label="桌面分页规则">
        <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-500">
          {appPages.length} 个 App 页
        </span>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-medium text-slate-400">
          每页最多 {LAUNCHER_APPS_PER_PAGE} 个
        </span>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-medium text-slate-400">
          另有 1 个固定日历页
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-semibold tracking-[0.08em] text-slate-400">
            <span>DOCK</span>
            <span>{layout.dockAppIds.length} 个</span>
          </div>
          <div className="space-y-2" role="list" aria-label="Dock 应用顺序">{renderRows(layout.dockAppIds)}</div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-semibold tracking-[0.08em] text-slate-400">
            <span>App 分页</span>
            <span>{visibleAppIds.length} 个可见</span>
          </div>
          <div className="space-y-3" aria-label="桌面应用分页">
            {appPages.map((pageIds, pageIndex) => (
              <section
                key={`page-${pageIndex + 1}`}
                data-launcher-layout-page={pageIndex + 1}
                className="rounded-2xl border border-violet-100/80 bg-violet-50/30 p-2"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-[10px] font-semibold text-violet-500">第 {pageIndex + 1} 页</h3>
                  <span className="text-[9px] font-medium text-slate-400">
                    {pageIds.length} / {LAUNCHER_APPS_PER_PAGE}
                  </span>
                </div>
                {pageIds.length > 0 ? (
                  <div className="space-y-2" role="list" aria-label={`桌面第 ${pageIndex + 1} 页`}>
                    {renderRows(pageIds, visibleAppIds)}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-[9px] text-slate-400">
                    暂无可见 App，可从下方恢复
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>

        {hiddenGridAppIds.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-semibold tracking-[0.08em] text-slate-400">
              <span>已隐藏</span>
              <span>{hiddenGridAppIds.length} 个</span>
            </div>
            <div className="space-y-2" role="list" aria-label="已隐藏的桌面应用">
              {renderRows(hiddenGridAppIds, hiddenGridAppIds)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default LauncherLayoutEditor;
