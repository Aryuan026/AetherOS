import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import HistoryArchiveCommit from './HistoryArchiveCommit';
import HistoryContextNotice from './HistoryContextNotice';
import type { HistoryReviewWorkspaceManifest } from '../../domain/historyImport/reviewWorkspace';
import { completeHistoryReviewWorkspace } from '../../utils/historyImport/storage/reviewWorkspace';

interface HistoryPagedReviewProps {
  workspace: HistoryReviewWorkspaceManifest;
  onWorkspaceChange: (workspace: HistoryReviewWorkspaceManifest) => void;
}

const HistoryPagedReview: React.FC<HistoryPagedReviewProps> = ({
  workspace,
  onWorkspaceChange,
}) => {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [continueAfterAnalysis, setContinueAfterAnalysis] = useState(false);
  const [archiveCommitted, setArchiveCommitted] = useState<boolean>();
  const ignoredCount = workspace.counts.skipped + workspace.counts.duplicates;
  const strongRoleCount = useMemo(() => (
    workspace.speakerCandidates
      .filter(candidate => /^(?:user|assistant)$/iu.test(candidate.label.trim()))
      .reduce((total, candidate) => total + candidate.occurrences, 0)
  ), [workspace.speakerCandidates]);
  const preservedCount = Math.max(0, workspace.counts.parsed - workspace.counts.duplicates);

  const finishAnalysis = async () => {
    setSaving(true);
    setErrorMessage(undefined);
    setContinueAfterAnalysis(true);
    try {
      const next = await completeHistoryReviewWorkspace(workspace.id);
      onWorkspaceChange(next);
    } catch (error) {
      setContinueAfterAnalysis(false);
      setErrorMessage(error instanceof Error ? error.message : '本机分析还没有保存完整，请再试一次。');
    } finally {
      setSaving(false);
    }
  };

  if (workspace.status === 'review_complete' && workspace.decision) {
    return (
      <section
        data-history-paged-review="complete"
        className="mt-4 rounded-[1.75rem] border border-emerald-200 bg-white/85 p-4 shadow-[0_16px_45px_rgba(16,185,129,0.10)] backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle size={21} weight="duotone" />
          </span>
          <div>
            <div className="text-[10px] font-black text-emerald-600">分析完成</div>
            <h2 className="mt-0.5 text-lg font-black text-slate-800">旧聊天可以接回来了</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              已按明确的 user / assistant 粗分；其余非空内容先保留原样，不会再卡住导入。
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['准备导入', workspace.decision.counts.included],
            ['以后整理', workspace.counts.uncertain],
            ['自动忽略', ignoredCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-emerald-50 px-1 py-2">
              <div className="text-base font-black text-emerald-600">{value}</div>
              <div className="text-[8px] font-bold text-slate-400">{label}</div>
            </div>
          ))}
        </div>
        <HistoryArchiveCommit
          workspace={workspace}
          onCommittedChange={setArchiveCommitted}
          startImmediately={continueAfterAnalysis}
          openChatAfterCommit={continueAfterAnalysis}
        />
        {archiveCommitted === false && !continueAfterAnalysis && (
          <p className="mt-2 text-center text-[9px] text-slate-400">点“导入本机”后，就能继续聊天或打开对话日历。</p>
        )}
      </section>
    );
  }

  return (
    <section
      data-history-paged-review="fast-import"
      className="mt-4 rounded-[1.75rem] border border-violet-100/90 bg-white/85 p-4 shadow-[0_16px_45px_rgba(124,58,237,0.09)] backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
          <ClockCounterClockwise size={21} weight="duotone" />
        </span>
        <div>
          <div className="text-[10px] font-black text-violet-500">本机分析完成</div>
          <h2 className="mt-0.5 text-lg font-black text-slate-800">先把旧聊天接回来</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            这里不再要求你逐条认领、选择聊天类型或解释时区。旧时间只作为来源日期保存。
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['准备收好', preservedCount],
          ['明确对话', strongRoleCount],
          ['稍后整理', workspace.counts.uncertain],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-slate-50 px-1 py-3">
            <div className="text-lg font-black text-violet-600">{value}</div>
            <div className="text-[8px] font-bold text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/55 px-3 py-2.5 text-[9px] leading-relaxed text-slate-600">
        说话人不清楚、缺少日期或同时含陪伴与剧情的片段，会先原样进入本机日档。以后心情合适时，再到「对话日历」里翻看、检索和剪藏，不影响现在继续聊天。
      </div>

      <HistoryContextNotice />

      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-[9px] leading-relaxed text-rose-700">
          <WarningCircle size={16} className="mt-0.5 shrink-0" />
          {errorMessage}
        </div>
      )}

      <button
        type="button"
        disabled={saving || workspace.persistedRowCount !== workspace.totalRowCount}
        onClick={() => void finishAnalysis()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-200/50 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        {saving ? <SpinnerGap size={16} className="animate-spin" /> : <ArrowRight size={15} weight="bold" />}
        {saving ? '正在收好旧聊天…' : '导入并继续聊天'}
      </button>
    </section>
  );
};

export default HistoryPagedReview;
