import React, { useState, useSyncExternalStore } from 'react';
import {
  applyPwaUpdate,
  getPwaRuntimeSnapshot,
  requestPwaInstall,
  subscribePwaRuntime,
} from '../../utils/pwaRuntime';
import { resolvePwaInstallRowPresentation } from '../../utils/pwaInstallPresentation';

const PwaInstallRow: React.FC = () => {
  const snapshot = useSyncExternalStore(
    subscribePwaRuntime,
    getPwaRuntimeSnapshot,
    getPwaRuntimeSnapshot,
  );
  const [pendingAction, setPendingAction] = useState<'install' | 'update' | null>(null);
  const [actionError, setActionError] = useState('');
  const presentation = resolvePwaInstallRowPresentation(snapshot);

  if (!presentation) return null;

  const runAction = async () => {
    if (!presentation.action || pendingAction) return;
    setActionError('');
    setPendingAction(presentation.action);
    try {
      if (presentation.action === 'update') {
        const outcome = await applyPwaUpdate();
        if (outcome === 'unavailable') {
          setActionError('连接还没准备好，当前页面已保留，请稍后再试');
        }
      } else {
        await requestPwaInstall();
      }
    } finally {
      setPendingAction(null);
    }
  };

  const busyLabel = pendingAction === 'update' ? '正在更新…' : '正在打开…';

  return (
    <section
      data-pwa-install-row
      data-pwa-install-state={presentation.key}
      aria-live="polite"
      className="rounded-3xl border border-violet-100 bg-white/70 px-4 py-3.5 shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold leading-5 text-slate-600">
            {presentation.title}
          </h2>
          <p className="mt-0.5 break-words text-[10px] leading-[1.55] text-slate-400">
            {actionError || presentation.description}
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
          <span className="flex min-h-10 shrink-0 items-center rounded-xl bg-violet-50 px-3 text-[10px] font-semibold text-violet-500">
            {presentation.badge}
          </span>
        )}
      </div>
    </section>
  );
};

export default PwaInstallRow;
