import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Funnel,
  LinkSimple,
  PencilSimple,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import HistoryArchiveCommit from './HistoryArchiveCommit';
import HistoryContextNotice from './HistoryContextNotice';
import type { HistoryPreviewReviewResolution } from '../../domain/historyImport/previewReview';
import type {
  HistoryReviewWorkspaceAssessment,
  HistoryReviewWorkspaceFilter,
  HistoryReviewWorkspaceManifest,
  HistoryReviewWorkspaceRowRecord,
} from '../../domain/historyImport/reviewWorkspace';
import type { HistorySourceMode, HistorySpeakerMapping, HistorySpeakerRole } from '../../domain/historyImport/types';
import {
  completeHistoryReviewWorkspace,
  getHistoryReviewWorkspaceAssessment,
  pageHistoryReviewWorkspaceRows,
  patchHistoryReviewWorkspaceRow,
  reopenHistoryReviewWorkspace,
  updateHistoryReviewWorkspaceSettings,
  type HistoryReviewWorkspacePage,
} from '../../utils/historyImport/storage/reviewWorkspace';

interface HistoryPagedReviewProps {
  workspace: HistoryReviewWorkspaceManifest;
  onWorkspaceChange: (workspace: HistoryReviewWorkspaceManifest) => void;
}

const PAGE_SIZE = 10;

const roleOptions: Array<{ value: HistorySpeakerRole; label: string }> = [
  { value: 'user', label: '我' },
  { value: 'character', label: '角色' },
  { value: 'system', label: '系统 / OOC' },
  { value: 'unknown', label: '暂不确定' },
];

const sourceModeOptions: Array<{ value: HistorySourceMode; label: string }> = [
  { value: 'relationship_chat', label: '陪伴聊天' },
  { value: 'roleplay', label: '角色扮演' },
  { value: 'ooc', label: 'OOC / 讨论' },
  { value: 'mixed', label: '混合内容' },
  { value: 'unknown', label: '暂不确定' },
];

const timezoneOptions = [
  { value: 'source' as const, label: '保留原文时间' },
  { value: 'user_selected' as const, label: '统一指定时区' },
  { value: 'unknown' as const, label: '时间含义未知' },
];

const filterOptions: Array<{ value: HistoryReviewWorkspaceFilter; label: string }> = [
  { value: 'pending', label: '待确认' },
  { value: 'all', label: '全部' },
  { value: 'included', label: '保留' },
  { value: 'excluded', label: '排除 / 合并' },
];

const resolutionLabels: Record<HistoryPreviewReviewResolution, string> = {
  pending: '待确认',
  accepted: '已保留',
  edited: '已修正',
  excluded: '已排除',
  merged: '已合并',
};

const resolutionStyles: Record<HistoryPreviewReviewResolution, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-600',
  edited: 'bg-indigo-100 text-indigo-600',
  excluded: 'bg-slate-100 text-slate-500',
  merged: 'bg-violet-100 text-violet-600',
};

const roleLabel = (role?: HistorySpeakerRole): string => (
  roleOptions.find(option => option.value === role)?.label || '尚未认领'
);

const HistoryPagedReview: React.FC<HistoryPagedReviewProps> = ({
  workspace,
  onWorkspaceChange,
}) => {
  const [filter, setFilter] = useState<HistoryReviewWorkspaceFilter>('pending');
  const [cursorHistory, setCursorHistory] = useState<Array<number | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<HistoryReviewWorkspacePage>({ items: [], hasMore: false });
  const [assessment, setAssessment] = useState<HistoryReviewWorkspaceAssessment>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [editingRowId, setEditingRowId] = useState<string>();
  const [editingContent, setEditingContent] = useState('');
  const [timezoneDraft, setTimezoneDraft] = useState(workspace.settings.selectedTimezone || '');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [archiveCommitted, setArchiveCommitted] = useState<boolean>();
  const autoIgnoredRowCount = workspace.counts.skipped + workspace.counts.duplicates;

  const mappingByLabel = useMemo(() => new Map(
    workspace.settings.speakerMappings.map(mapping => [mapping.sourceLabel, mapping]),
  ), [workspace.settings.speakerMappings]);

  const refresh = useCallback(() => setRefreshToken(value => value + 1), []);

  useEffect(() => {
    setCursorHistory([undefined]);
    setPageIndex(0);
  }, [filter, workspace.id]);

  useEffect(() => {
    setTimezoneDraft(workspace.settings.selectedTimezone || '');
  }, [workspace.id, workspace.settings.selectedTimezone]);

  useEffect(() => {
    if (workspace.status !== 'reviewing') return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(undefined);
    void Promise.all([
      pageHistoryReviewWorkspaceRows({
        workspaceId: workspace.id,
        filter,
        cursor: cursorHistory[pageIndex],
        limit: PAGE_SIZE,
      }),
      getHistoryReviewWorkspaceAssessment(workspace.id),
    ]).then(([nextPage, nextAssessment]) => {
      if (cancelled) return;
      setPage(nextPage);
      setAssessment(nextAssessment);
    }).catch(error => {
      if (!cancelled) setErrorMessage(error instanceof Error ? error.message : '暂时无法读取校对页。');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cursorHistory, filter, pageIndex, refreshToken, workspace.id, workspace.status]);

  const updateSettings = async (
    patch: Parameters<typeof updateHistoryReviewWorkspaceSettings>[0]['patch'],
  ) => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const next = await updateHistoryReviewWorkspaceSettings({ workspaceId: workspace.id, patch });
      onWorkspaceChange(next);
      refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法保存这个选择。');
    } finally {
      setSaving(false);
    }
  };

  const chooseSpeakerRole = async (sourceLabel: string, role: HistorySpeakerRole) => {
    const nextMappings: HistorySpeakerMapping[] = workspace.speakerCandidates.map(candidate => {
      const existing = mappingByLabel.get(candidate.label);
      if (candidate.label !== sourceLabel && existing) return { ...existing };
      if (candidate.label !== sourceLabel) return undefined;
      return {
        sourceLabel,
        role,
        targetId: role === 'user'
          ? workspace.scope.personaMaskId
          : role === 'character' ? workspace.scope.charId : undefined,
        confidence: 1,
        confirmedByUser: true,
      };
    }).filter((value): value is HistorySpeakerMapping => Boolean(value));
    await updateSettings({ speakerMappings: nextMappings });
  };

  const patchRow = async (
    record: HistoryReviewWorkspaceRowRecord,
    patch: Parameters<typeof patchHistoryReviewWorkspaceRow>[0]['patch'],
  ) => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      await patchHistoryReviewWorkspaceRow({
        workspaceId: workspace.id,
        rowRecordId: record.id,
        patch,
      });
      setEditingRowId(undefined);
      refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法保存这条校对。');
    } finally {
      setSaving(false);
    }
  };

  const finishReview = async () => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const next = await completeHistoryReviewWorkspace(workspace.id);
      onWorkspaceChange(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法完成全量校对。');
      refresh();
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
            <div className="text-[10px] font-black text-emerald-600">第 3 步完成</div>
            <h2 className="mt-0.5 text-lg font-black text-slate-800">{workspace.counts.parsed} 条对话已完整校对</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              全量校对决定已经锁定。确认后会直接写进本机历史档案。
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ['保留', workspace.decision.counts.included],
            ['手动排除', Math.max(0, workspace.decision.counts.excluded - autoIgnoredRowCount)],
            ['自动忽略', autoIgnoredRowCount],
            ['合并 / 修正', workspace.decision.counts.merged + workspace.decision.counts.edited],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-emerald-50 px-1 py-2">
              <div className="text-base font-black text-emerald-600">{value}</div>
              <div className="text-[8px] font-bold text-slate-400">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[9px] leading-relaxed text-slate-500">
          全量校验分成 {workspace.decision.chunkDigests.length} 个固定指纹块；分页、刷新或重新打开不会改变最终决定。
        </p>
        <HistoryArchiveCommit
          workspace={workspace}
          onCommittedChange={setArchiveCommitted}
        />
        {errorMessage && (
          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[9px] leading-relaxed text-rose-700">{errorMessage}</p>
        )}
        {archiveCommitted === false && (
          <button
            type="button"
            onClick={() => {
              setSaving(true);
              void reopenHistoryReviewWorkspace(workspace.id)
                .then(onWorkspaceChange)
                .catch(error => setErrorMessage(error instanceof Error ? error.message : '暂时无法返回校对。'))
                .finally(() => setSaving(false));
            }}
            disabled={saving}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black text-emerald-700 disabled:opacity-50"
          >
            <PencilSimple size={15} />
            返回修改
          </button>
        )}
      </section>
    );
  }

  const visibleFilteredCount = filter === 'pending'
    ? assessment?.attentionRows
    : filter === 'included'
      ? assessment?.includedRows
      : filter === 'excluded'
        ? assessment?.excludedRows
        : assessment?.totalRows;

  return (
    <section
      data-history-paged-review="editing"
      className="mt-4 rounded-[1.75rem] border border-violet-100/90 bg-white/85 p-4 shadow-[0_16px_45px_rgba(124,58,237,0.09)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black text-violet-500">第 3 步 · 校对</div>
          <h2 className="mt-0.5 text-lg font-black text-slate-800">确认谁说了什么</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            共 {workspace.counts.parsed} 条对话，页面每次只读取 {PAGE_SIZE} 条。
            {workspace.counts.skipped > 0 ? ` 已自动忽略 ${workspace.counts.skipped} 个空行或分隔符。` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-700">
          {assessment?.attentionRows ?? '…'} 条待确认
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/55 p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-black text-slate-700">1. 认领说话人</h3>
          <span className="text-[9px] text-slate-400">
            {workspace.settings.speakerMappings.length} / {workspace.speakerCandidates.length}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {workspace.speakerCandidates.length === 0 && (
            <p className="text-[9px] leading-relaxed text-amber-600">没有识别到稳定名字，请在待确认记录里逐条认领。</p>
          )}
          {workspace.speakerCandidates.map(candidate => (
            <div key={candidate.label} className="rounded-xl border border-white bg-white/80 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-black text-slate-700">{candidate.label}</span>
                <span className="text-[8px] text-slate-400">{candidate.occurrences} 条</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {roleOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving}
                    aria-pressed={mappingByLabel.get(candidate.label)?.role === option.value}
                    onClick={() => void chooseSpeakerRole(candidate.label, option.value)}
                    className={`rounded-xl border px-2 py-2 text-[9px] font-black ${
                      mappingByLabel.get(candidate.label)?.role === option.value
                        ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                        : 'border-slate-100 bg-white text-slate-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50/45 p-3">
        <h3 className="text-xs font-black text-slate-700">2. 对话类型和时间</h3>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {sourceModeOptions.map(option => (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              aria-pressed={workspace.settings.sourceMode === option.value}
              onClick={() => void updateSettings({ sourceMode: option.value })}
              className={`rounded-xl border px-2 py-2 text-[9px] font-black ${
                workspace.settings.sourceMode === option.value
                  ? 'border-rose-300 bg-rose-100 text-rose-700'
                  : 'border-slate-100 bg-white text-slate-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid gap-1.5">
          {timezoneOptions.map(option => (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              aria-pressed={workspace.settings.timezonePolicy === option.value}
              onClick={() => void updateSettings({ timezonePolicy: option.value })}
              className={`rounded-xl border px-3 py-2 text-left text-[9px] font-black ${
                workspace.settings.timezonePolicy === option.value
                  ? 'border-violet-300 bg-violet-100 text-violet-700'
                  : 'border-slate-100 bg-white text-slate-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {workspace.settings.timezonePolicy === 'user_selected' && (
          <input
            value={timezoneDraft}
            onChange={event => setTimezoneDraft(event.target.value)}
            onBlur={() => {
              if (timezoneDraft === (workspace.settings.selectedTimezone || '')) return;
              void updateSettings({ selectedTimezone: timezoneDraft });
            }}
            placeholder="Asia/Shanghai 或 +08:00"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] outline-none"
          />
        )}
        <HistoryContextNotice />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black text-slate-700">3. 逐条确认</h3>
            <p className="mt-0.5 text-[9px] text-slate-400">修改会随手存进本机工作台。</p>
          </div>
          <Funnel size={17} className="text-violet-400" />
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {filterOptions.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black ${
                filter === option.value
                  ? 'bg-violet-600 text-white'
                  : 'border border-slate-100 bg-white text-slate-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {loading && (
            <div className="rounded-2xl bg-slate-50 p-4 text-center text-[10px] text-slate-400">正在读取这一页…</div>
          )}
          {!loading && page.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-center text-[10px] text-emerald-700">
              这个分类里没有记录了。
            </div>
          )}
          {!loading && page.items.map(record => {
            const mappedRole = record.source.speakerLabel
              ? mappingByLabel.get(record.source.speakerLabel)?.role
              : record.review.speakerRole;
            const editing = editingRowId === record.id;
            return (
              <article key={record.id} className="rounded-2xl border border-slate-100 bg-white/85 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[8px] font-bold text-slate-400">
                    {record.source.sourceLocator.label || `第 ${record.sourceOrder + 1} 条`}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${resolutionStyles[record.review.resolution]}`}>
                    {resolutionLabels[record.review.resolution]}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px]">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-black text-indigo-600">
                    {record.source.speakerLabel || '无名字'} → {roleLabel(mappedRole)}
                  </span>
                  {record.source.sourceTime.originalText && (
                    <span
                      title={`来源时间 · ${record.source.sourceTime.precision}`}
                      className="rounded-full bg-slate-50 px-2 py-0.5 font-bold text-slate-500"
                    >
                      {record.source.sourceTime.originalText}
                    </span>
                  )}
                </div>

                {editing ? (
                  <div className="mt-2">
                    <textarea
                      value={editingContent}
                      onChange={event => setEditingContent(event.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-xl border border-indigo-200 bg-indigo-50/35 px-3 py-2 text-[11px] leading-relaxed text-slate-700 outline-none"
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void patchRow(record, { content: editingContent, resolution: 'edited' })}
                      className="mt-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-[9px] font-black text-white"
                    >
                      保存修改
                    </button>
                  </div>
                ) : (
                  <p className={`mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed ${
                    record.review.resolution === 'excluded' || record.review.resolution === 'merged'
                      ? 'text-slate-400 line-through'
                      : 'text-slate-700'
                  }`}>
                    {record.review.content || '（空内容）'}
                  </p>
                )}

                {!record.source.speakerLabel
                  && record.review.resolution !== 'excluded'
                  && record.review.resolution !== 'merged' && (
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-amber-50 p-2">
                    {roleOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={saving}
                        onClick={() => void patchRow(record, {
                          speakerRole: option.value,
                          speakerRoleConfirmedByUser: true,
                        })}
                        className={`rounded-lg px-2 py-1.5 text-[8px] font-black ${
                          record.review.speakerRoleConfirmedByUser && record.review.speakerRole === option.value
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-white text-slate-500'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {record.review.resolution === 'pending' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void patchRow(record, { resolution: 'accepted' })}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-2.5 py-1.5 text-[8px] font-black text-emerald-700"
                    >
                      <Check size={12} /> 保留
                    </button>
                  )}
                  {record.review.resolution !== 'excluded' && record.review.resolution !== 'merged' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRowId(editing ? undefined : record.id);
                          setEditingContent(record.review.content);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[8px] font-black text-indigo-600"
                      >
                        <PencilSimple size={12} /> {editing ? '收起' : '修改'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void patchRow(record, { resolution: 'excluded' })}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[8px] font-black text-slate-500"
                      >
                        <XCircle size={12} /> 排除
                      </button>
                    </>
                  )}
                  {record.source.issues.includes('possible_continuation')
                    && record.source.previousMeaningfulRowId
                    && record.review.resolution !== 'excluded'
                    && record.review.resolution !== 'merged' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void patchRow(record, {
                        resolution: 'merged',
                        mergeIntoRowId: record.source.previousMeaningfulRowId,
                      })}
                      className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-2.5 py-1.5 text-[8px] font-black text-violet-700"
                    >
                      <LinkSimple size={12} /> 接到上一条
                    </button>
                  )}
                  {(record.review.resolution === 'excluded' || record.review.resolution === 'merged') && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void patchRow(record, {
                        resolution: record.source.status === 'ready' ? 'accepted' : 'pending',
                      })}
                      className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-[8px] font-black text-amber-700"
                    >
                      恢复
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={pageIndex === 0 || loading}
            onClick={() => setPageIndex(index => Math.max(0, index - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 disabled:opacity-30"
            aria-label="上一页"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="text-[9px] font-bold text-slate-400">
            第 {pageIndex + 1} 页 · 此分类共 {visibleFilteredCount ?? '…'} 条
          </span>
          <button
            type="button"
            disabled={!page.hasMore || loading || page.nextCursor === undefined}
            onClick={() => {
              if (page.nextCursor === undefined) return;
              setCursorHistory(current => {
                const next = current.slice(0, pageIndex + 1);
                next.push(page.nextCursor);
                return next;
              });
              setPageIndex(index => index + 1);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 disabled:opacity-30"
            aria-label="下一页"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className={`mt-4 rounded-2xl border p-3 ${
        assessment?.canComplete
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-amber-100 bg-amber-50/60'
      }`}>
        <div className="flex items-start gap-2">
          {assessment?.canComplete
            ? <CheckCircle size={18} weight="fill" className="mt-0.5 text-emerald-500" />
            : <WarningCircle size={18} className="mt-0.5 text-amber-500" />}
          <div className="text-[9px] leading-relaxed text-slate-600">
            {assessment?.canComplete ? (
              <p>全量说话人和疑点都已处理，可以完成校对。</p>
            ) : (
              <ul className="space-y-0.5">
                {(assessment?.missingSpeakerMappings.length || 0) > 0 && <li>还有 {assessment?.missingSpeakerMappings.length} 个说话人未认领。</li>}
                {(assessment?.attentionRows || 0) > 0 && <li>还有 {assessment?.attentionRows} 条内容待确认。</li>}
                {assessment && !assessment.timezoneValid && <li>指定时区格式无效。</li>}
              </ul>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[9px] leading-relaxed text-rose-700">{errorMessage}</p>
      )}

      <button
        type="button"
        disabled={!assessment?.canComplete || saving}
        onClick={() => void finishReview()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-200/50 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        <Check size={15} weight="bold" />
        {saving ? '正在保存…' : `完成 ${workspace.counts.parsed} 条对话校对`}
      </button>
    </section>
  );
};

export default HistoryPagedReview;
