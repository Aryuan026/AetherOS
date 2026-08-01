import React, { useState, useSyncExternalStore } from 'react';
import {
  applyPwaUpdate,
  getPwaRuntimeSnapshot,
  requestPwaInstall,
  subscribePwaRuntime,
} from '../../utils/pwaRuntime';
import type { PwaRuntimeSnapshot } from '../../utils/pwaRuntime';

type PwaInstallRowPresentation = {
  key: 'update' | 'standalone' | 'installed' | 'ios-manual' | 'prompt' | 'browser-menu';
  title: string;
  description: string;
  action?: 'install' | 'update';
  actionLabel?: string;
  badge?: string;
  tone: 'violet' | 'emerald';
};

export const resolvePwaInstallRowPresentation = (
  snapshot: PwaRuntimeSnapshot,
): PwaInstallRowPresentation | null => {
  if (snapshot.isCapacitor) return null;

  if (snapshot.updateAvailable) {
    return {
      key: 'update',
      title: '新版本可用',
      description: '重新打开即可使用最新版',
      action: 'update',
      actionLabel: '现在更新',
      tone: 'violet',
    };
  }

  if (snapshot.standalone) {
    return {
      key: 'standalone',
      title: '已从手机桌面打开',
      description: 'AetherOS 正在独立窗口运行',
      badge: '已添加',
      tone: 'emerald',
    };
  }

  if (snapshot.installedThisSession) {
    return {
      key: 'installed',
      title: '已添加到手机桌面',
      description: '回到桌面即可打开 AetherOS',
      badge: '已添加',
      tone: 'emerald',
    };
  }

  if (snapshot.platform === 'ios') {
    return {
      key: 'ios-manual',
      title: '添加到手机桌面',
      description: '点浏览器的分享按钮，再选「添加到主屏幕」',
      badge: '手动添加',
      tone: 'violet',
    };
  }

  if (snapshot.installPromptAvailable) {
    return {
      key: 'prompt',
      title: '添加到手机桌面',
      description: '以后可以像 App 一样直接打开',
      action: 'install',
      actionLabel: '添加',
      tone: 'violet',
    };
  }

  return {
    key: 'browser-menu',
    title: '添加到手机桌面',
    description: '浏览器菜单 →「安装应用」或「添加到主屏幕」',
    badge: '浏览器菜单',
    tone: 'violet',
  };
};

const PwaInstallRow: React.FC = () => {
  const snapshot = useSyncExternalStore(
    subscribePwaRuntime,
    getPwaRuntimeSnapshot,
    getPwaRuntimeSnapshot,
  );
  const [pendingAction, setPendingAction] = useState<'install' | 'update' | null>(null);
  const presentation = resolvePwaInstallRowPresentation(snapshot);

  if (!presentation) return null;

  const runAction = async () => {
    if (!presentation.action || pendingAction) return;
    setPendingAction(presentation.action);
    try {
      if (presentation.action === 'update') {
        await applyPwaUpdate();
      } else {
        await requestPwaInstall();
      }
    } finally {
      setPendingAction(null);
    }
  };

  const isEmerald = presentation.tone === 'emerald';
  const busyLabel = pendingAction === 'update' ? '正在更新…' : '正在打开…';

  return (
    <section
      data-pwa-install-row
      data-pwa-install-state={presentation.key}
      aria-live="polite"
      className={`rounded-3xl border px-4 py-3.5 shadow-sm ${
        isEmerald
          ? 'border-emerald-100 bg-emerald-50/70'
          : 'border-violet-100 bg-white/70'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold leading-5 text-slate-600">
            {presentation.title}
          </h2>
          <p className="mt-0.5 break-words text-[10px] leading-[1.55] text-slate-400">
            {presentation.description}
          </p>
        </div>

        {presentation.action ? (
          <button
            type="button"
            data-pwa-install-action={presentation.action}
            onClick={() => void runAction()}
            disabled={pendingAction !== null}
            className="min-h-10 shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-semibold text-violet-600 transition active:scale-95 disabled:cursor-wait disabled:opacity-60"
          >
            {pendingAction ? busyLabel : presentation.actionLabel}
          </button>
        ) : (
          <span
            className={`flex min-h-10 shrink-0 items-center rounded-xl px-3 text-[10px] font-semibold ${
              isEmerald
                ? 'bg-emerald-100/80 text-emerald-600'
                : 'bg-violet-50 text-violet-500'
            }`}
          >
            {presentation.badge}
          </span>
        )}
      </div>
    </section>
  );
};

export default PwaInstallRow;
