import React, { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, CheckCircle, FileText, Info, TrayArrowDown } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import type { HistoryStorageHealthSnapshot } from '../domain/historyImport/storageHealth';
import type { HistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding';
import type { HistoryReviewWorkspaceManifest } from '../domain/historyImport/reviewWorkspace';
import AppHeader from '../components/shell/AppHeader';
import HistoryIdentityBinding from '../components/history-import/HistoryIdentityBinding';
import HistorySourceIntake from '../components/history-import/HistorySourceIntake';
import HistoryPagedReview from '../components/history-import/HistoryPagedReview';
import HistoryLocalSaveNote from '../components/history-import/HistoryLocalSaveNote';
import {
  readHistoryStorageHealth,
  requestHistoryStoragePersistence,
  type HistoryPersistenceRequestResult,
} from '../utils/historyImport/storage/storageHealth';
import {
  deleteHistoryReviewWorkspace,
  getLatestHistoryReviewWorkspace,
} from '../utils/historyImport/storage/reviewWorkspace';

const HistoryImportApp: React.FC = () => {
  const { closeApp, userProfile, characters, activeCharacterId } = useOS();
  const [snapshot, setSnapshot] = useState<HistoryStorageHealthSnapshot>();
  const [persistenceResult, setPersistenceResult] = useState<HistoryPersistenceRequestResult>();
  const [loading, setLoading] = useState(true);
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [identityBindingLocked, setIdentityBindingLocked] = useState(false);
  const [identityBindingDraft, setIdentityBindingDraft] = useState<HistoryIdentityBindingDraft>();
  const [activeWorkspace, setActiveWorkspace] = useState<HistoryReviewWorkspaceManifest>();

  const refreshStorageHealth = useCallback(async () => {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      setSnapshot(await readHistoryStorageHealth());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法确认浏览器保存状态。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStorageHealth();
  }, [refreshStorageHealth]);

  useEffect(() => {
    let cancelled = false;
    setWorkspaceLoading(true);
    void getLatestHistoryReviewWorkspace()
      .then(workspace => {
        if (!cancelled && workspace) setActiveWorkspace(workspace);
      })
      .catch(error => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '暂时无法恢复上次校对。');
        }
      })
      .finally(() => {
        if (!cancelled) setWorkspaceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRequestPersistence = async () => {
    setRequestingPersistence(true);
    setPersistenceResult(undefined);
    try {
      const result = await requestHistoryStoragePersistence({ userGestureConfirmed: true });
      setPersistenceResult(result);
      await refreshStorageHealth();
    } finally {
      setRequestingPersistence(false);
    }
  };

  const handleIdentityLockChange = useCallback((
    draft: HistoryIdentityBindingDraft,
    locked: boolean,
  ) => {
    setIdentityBindingLocked(locked);
    setIdentityBindingDraft(locked ? draft : undefined);
  }, []);

  const handleWorkspaceChange = useCallback((workspace?: HistoryReviewWorkspaceManifest) => {
    setActiveWorkspace(workspace);
  }, []);

  const discardWorkspace = async () => {
    if (!activeWorkspace) return;
    const confirmed = window.confirm('这会删除当前校对工作台并重新选择身份和文件；已经生效的历史档案不会被删除。确定继续吗？');
    if (!confirmed) return;
    setErrorMessage(undefined);
    try {
      await deleteHistoryReviewWorkspace(activeWorkspace.id);
      setActiveWorkspace(undefined);
      setIdentityBindingLocked(false);
      setIdentityBindingDraft(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法删除这份校对草稿。');
    }
  };

  return (
    <div
      data-history-import-stage={activeWorkspace?.status || 'choose-identity'}
      className="flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-[#f7f3ff] via-[#fff8f8] to-[#f4f7ff] font-sans text-slate-800"
    >
      <AppHeader
        title="旧日迁入"
        subtitle="导入聊天记录"
        onBack={closeApp}
        className="border-b border-white/70 bg-white/55 backdrop-blur-2xl"
      />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 no-scrollbar">
        <section className="rounded-[1.75rem] border border-white/90 bg-white/82 p-4 shadow-[0_16px_42px_rgba(129,140,248,0.11)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <TrayArrowDown size={27} weight="bold" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight text-slate-800">导入聊天记录</h1>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                选好身份和 TXT / Word 文件，再校对谁说了什么。
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[9px] font-black">
            <span className="rounded-xl bg-indigo-50 px-2 py-2 text-indigo-600">1 选身份</span>
            <span className="rounded-xl bg-rose-50 px-2 py-2 text-rose-600">2 选文件</span>
            <span className="rounded-xl bg-violet-50 px-2 py-2 text-violet-600">3 校对</span>
            <span className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-600">4 导入</span>
          </div>
        </section>

        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-[9px] leading-relaxed text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>校对和历史档案只留在本机，不会上传；导入完成后，可在“设置”里另外备份整机数据。</span>
        </div>

        {workspaceLoading && (
          <div className="mt-4 rounded-2xl bg-white/75 p-4 text-center text-[10px] text-slate-400">
            正在看看有没有上次留下的校对草稿…
          </div>
        )}

        {!workspaceLoading && !activeWorkspace && (
          <>
            <HistoryIdentityBinding
              userProfile={userProfile}
              characters={characters}
              activeCharacterId={activeCharacterId}
              onLockChange={handleIdentityLockChange}
            />

            {identityBindingLocked && (
              <HistorySourceIntake
                enabled
                bindingDraft={identityBindingDraft}
                onWorkspaceChange={handleWorkspaceChange}
              />
            )}
          </>
        )}

        {activeWorkspace && (
          <>
            <section className="mt-4 rounded-[1.5rem] border border-emerald-100 bg-white/85 p-4 shadow-[0_12px_34px_rgba(16,185,129,0.08)] backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <CheckCircle size={21} weight="fill" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black text-emerald-600">本机校对草稿</div>
                  <h2 className="mt-0.5 truncate text-sm font-black text-slate-800">
                    {activeWorkspace.identity.maskLabel} × {activeWorkspace.identity.characterLabel}
                  </h2>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500">
                    {activeWorkspace.sourceFile.name} · {activeWorkspace.counts.parsed} 条对话
                    {activeWorkspace.counts.skipped > 0 ? ` · 已忽略 ${activeWorkspace.counts.skipped} 个空行 / 分隔` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void discardWorkspace()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-600"
                >
                  <ArrowsClockwise size={12} />
                  换一份
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[9px] text-slate-500">
                <FileText size={14} className="shrink-0 text-violet-500" />
                <span className="truncate">完整规范化结果已保存，页面只按需读取当前一页。</span>
              </div>
            </section>

            <HistoryPagedReview
              workspace={activeWorkspace}
              onWorkspaceChange={setActiveWorkspace}
            />

            <HistoryLocalSaveNote
              snapshot={snapshot}
              loading={loading}
              requestingPersistence={requestingPersistence}
              persistenceResult={persistenceResult}
              errorMessage={errorMessage}
              onRequestPersistence={() => void handleRequestPersistence()}
            />
          </>
        )}

        {errorMessage && !activeWorkspace && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[9px] leading-relaxed text-amber-700">{errorMessage}</p>
        )}

      </main>
    </div>
  );
};

export default HistoryImportApp;
