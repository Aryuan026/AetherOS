import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDots,
  CheckCircle,
  SpinnerGap,
  TrayArrowDown,
} from '@phosphor-icons/react';
import { AppID } from '../../types';
import { useOS } from '../../context/OSContext';
import {
  buildHistoryIdentityMaterializationPlan,
  type HistoryIdentityMaterializationPlan,
} from '../../domain/historyImport/identityMaterialization';
import type { HistoryReviewWorkspaceManifest } from '../../domain/historyImport/reviewWorkspace';
import {
  activatePreparedHistoryArchiveCandidate,
  prepareHistoryArchiveCandidateFromWorkspace,
  readHistoryArchiveWorkspaceImportStatus,
  type HistoryArchiveCandidateProgress,
} from '../../utils/historyImport/archive/importCandidate';
import { syncActiveHistoryToDailyArchive } from '../../utils/dailyArchive/historySync';

interface HistoryArchiveCommitProps {
  workspace: HistoryReviewWorkspaceManifest;
  onCommittedChange: (committed: boolean | undefined) => void;
  startImmediately?: boolean;
  openChatAfterCommit?: boolean;
}

type CommitStage =
  | 'checking'
  | 'idle'
  | 'preparing'
  | 'active'
  | 'already_imported';

const progressText = (progress?: HistoryArchiveCandidateProgress): string => {
  if (!progress) return '正在准备本机档案…';
  if (progress.phase === 'reading_current_archive') return '正在保留原有历史…';
  if (progress.phase === 'preparing_candidate') return '正在准备新的本机档案…';
  if (progress.phase === 'verifying_candidate') return '正在核对写入结果…';
  if (progress.phase === 'candidate_ready') return '本机档案已经准备好';
  return `正在写入 ${progress.processed} / ${progress.total} 条…`;
};

const HistoryArchiveCommit: React.FC<HistoryArchiveCommitProps> = ({
  workspace,
  onCommittedChange,
  startImmediately = false,
  openChatAfterCommit = false,
}) => {
  const {
    characters,
    userProfile,
    addPreparedCharacter,
    updateUserProfile,
    setActiveCharacterId,
    openApp,
    addToast,
  } = useOS();
  const [stage, setStage] = useState<CommitStage>('checking');
  const [progress, setProgress] = useState<HistoryArchiveCandidateProgress>();
  const [completedCount, setCompletedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [identityError, setIdentityError] = useState<string>();
  const [identityPlan, setIdentityPlan] = useState<HistoryIdentityMaterializationPlan>();
  const [dailyArchiveStatus, setDailyArchiveStatus] = useState<'idle' | 'syncing' | 'ready' | 'failed'>('idle');
  const openedChatRef = useRef(false);

  const materializeIdentity = async (): Promise<HistoryIdentityMaterializationPlan> => {
    const plan = buildHistoryIdentityMaterializationPlan({
      source: workspace,
      userProfile,
      characters,
    });
    if (plan.createCharacter) await addPreparedCharacter(plan.character);
    updateUserProfile(plan.profilePatch);
    setIdentityPlan(plan);
    setIdentityError(undefined);
    return plan;
  };

  const finishCommitted = async (
    nextStage: Extract<CommitStage, 'active' | 'already_imported'>,
    sourceMessageCount: number,
  ) => {
    setCompletedCount(sourceMessageCount);
    setStage(nextStage);
    onCommittedChange(true);
    let nextIdentityPlan: HistoryIdentityMaterializationPlan | undefined;
    try {
      nextIdentityPlan = await materializeIdentity();
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : '身份入口暂时没有建好。');
    }
    if (workspace.decision?.scope) {
      setDailyArchiveStatus('syncing');
      const syncDailyArchive = async () => {
        try {
          await syncActiveHistoryToDailyArchive({ scope: workspace.decision!.scope });
          setDailyArchiveStatus('ready');
        } catch (error) {
          console.warn('Daily archive sync after import failed', error);
          setDailyArchiveStatus('failed');
        }
      };
      if (openChatAfterCommit) void syncDailyArchive();
      else await syncDailyArchive();
    }
    if (openChatAfterCommit && nextIdentityPlan && !openedChatRef.current) {
      openedChatRef.current = true;
      updateUserProfile(nextIdentityPlan.activationPatch);
      setActiveCharacterId(nextIdentityPlan.character.id);
      openApp(AppID.Chat);
      addToast('旧聊天已经接回来了', 'success');
    }
  };

  const performImport = async () => {
    setStage('preparing');
    setProgress(undefined);
    setErrorMessage(undefined);
    try {
      const candidate = await prepareHistoryArchiveCandidateFromWorkspace({
        manifest: workspace,
        onProgress: setProgress,
      });
      if (candidate.status === 'already_imported') {
        await finishCommitted('already_imported', candidate.sourceMessageCount);
        return;
      }
      await activatePreparedHistoryArchiveCandidate({ candidate });
      await finishCommitted('active', candidate.sourceMessageCount);
    } catch (error) {
      setStage('idle');
      setErrorMessage(error instanceof Error ? error.message : '暂时无法导入这份历史档案。');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setStage('checking');
    onCommittedChange(undefined);
    setErrorMessage(undefined);
    setIdentityError(undefined);
    void readHistoryArchiveWorkspaceImportStatus({ manifest: workspace })
      .then(async status => {
        if (cancelled) return;
        if (status) {
          await finishCommitted('already_imported', status.sourceMessageCount);
        } else if (startImmediately) {
          await performImport();
        } else {
          setStage('idle');
          onCommittedChange(false);
        }
      })
      .catch(error => {
        if (cancelled) return;
        setStage('idle');
        setErrorMessage(error instanceof Error ? error.message : '暂时无法确认这份记录是否已经导入。');
      });
    return () => {
      cancelled = true;
    };
  }, [onCommittedChange, startImmediately, workspace]);

  const startImport = async () => {
    await performImport();
  };

  if (stage === 'active' || stage === 'already_imported') {
    return (
      <div
        data-history-archive-commit={stage}
        className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3"
      >
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle size={20} weight="fill" />
          <span className="text-xs font-black">
            {stage === 'active' ? '已经导入本机' : '这份记录已经导入过'}
          </span>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-emerald-800/80">
          {completedCount} 条聊天已经进入历史档案；原文件不需要加密，也不会上传。
        </p>
        {identityPlan && (
          <div className="mt-2 rounded-xl border border-emerald-100 bg-white/75 px-3 py-2 text-[9px] leading-relaxed text-slate-600">
            <span className="font-black text-emerald-700">
              {identityPlan.createMask ? '已新建面具' : '已连接面具'}
              ·
              {identityPlan.createCharacter ? '已新建角色' : '已连接角色'}
            </span>
            <span> “{workspace.identity.maskLabel}” × “{identityPlan.character.name}”</span>
          </div>
        )}
        {dailyArchiveStatus !== 'idle' && (
          <div className={`mt-2 rounded-xl px-3 py-2 text-[9px] font-bold ${
            dailyArchiveStatus === 'failed'
              ? 'bg-amber-50 text-amber-700'
              : 'border border-emerald-100 bg-white/75 text-emerald-700'
          }`}>
            {dailyArchiveStatus === 'syncing' && '正在按日期建立本机 JSON 日档…'}
            {dailyArchiveStatus === 'ready' && '对话日档已经按日期整理好，可以从日历逐天打开。'}
            {dailyArchiveStatus === 'failed' && '聊天已经导入；日档暂未整理完成，打开“对话日历”会自动重试。'}
          </div>
        )}
        {identityError && (
          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[9px] leading-relaxed text-amber-700">
            <p>聊天已经安全导入，但角色入口还没建好：{identityError}</p>
            <button
              type="button"
              onClick={() => {
                void materializeIdentity().catch(error => {
                  setIdentityError(error instanceof Error ? error.message : '身份入口暂时没有建好。');
                });
              }}
              className="mt-2 rounded-lg bg-white px-2.5 py-1.5 font-black text-amber-700"
            >
              重试建立入口
            </button>
          </div>
        )}
        {identityPlan && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                updateUserProfile(identityPlan.activationPatch);
                setActiveCharacterId(identityPlan.character.id);
                openApp(AppID.DailyArchive);
                addToast('已打开按日期保存的对话', 'success');
              }}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-[10px] font-black text-emerald-700"
            >
              <CalendarDots size={15} weight="bold" />
              对话日历
            </button>
            <button
              type="button"
              onClick={() => {
                updateUserProfile(identityPlan.activationPatch);
                setActiveCharacterId(identityPlan.character.id);
                openApp(AppID.Chat);
                addToast('已打开这段旧日对话', 'success');
              }}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-3 py-3 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(5,150,105,0.22)]"
            >
              继续聊天
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-history-archive-commit={stage}
      className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/65 p-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
          <TrayArrowDown size={19} weight="duotone" />
        </span>
        <div>
          <h3 className="text-xs font-black text-slate-800">正在导入本机</h3>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
            确认后直接写入本机历史档案。备份和加密可以以后在“设置”里单独处理。
          </p>
        </div>
      </div>

      {stage === 'idle' && (
        <button
          type="button"
          onClick={() => void startImport()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-xs font-black text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)]"
        >
          <TrayArrowDown size={16} weight="bold" />
          {openChatAfterCommit ? '导入并继续聊天' : `导入 ${workspace.decision?.counts.included ?? 0} 条聊天`}
        </button>
      )}

      {stage === 'checking' && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-[10px] font-black text-violet-700">
          <SpinnerGap size={16} className="animate-spin" />
          正在确认这份记录有没有导入过…
        </div>
      )}

      {stage === 'preparing' && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-[10px] font-black text-violet-700">
          <SpinnerGap size={16} className="animate-spin" />
          {progressText(progress)}
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[9px] leading-relaxed text-rose-700">
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default HistoryArchiveCommit;
