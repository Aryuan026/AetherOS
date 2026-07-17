import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Funnel,
  LinkSimple,
  LockKey,
  PencilSimple,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import HistoryContextNotice from './HistoryContextNotice';
import type { HistoryImportPreview, HistoryPreviewRow } from '../../domain/historyImport/preview';
import {
  assessHistoryPreviewReview,
  createHistoryPreviewRowReviewDrafts,
  freezeHistoryPreviewDecision,
  type FrozenHistoryPreviewDecision,
  type HistoryPreviewReviewDraftInput,
  type HistoryPreviewReviewResolution,
  type HistoryPreviewRowReviewDraft,
  type HistoryPreviewTimezonePolicy,
} from '../../domain/historyImport/previewReview';
import type {
  HistorySourceMode,
  HistorySpeakerMapping,
  HistorySpeakerRole,
} from '../../domain/historyImport/types';

interface HistoryPreviewReviewProps {
  preview: HistoryImportPreview;
  onDecisionChange?: (decision?: FrozenHistoryPreviewDecision) => void;
}

type ReviewFilter = 'all' | 'pending' | 'included' | 'excluded';

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

const timezoneOptions: Array<{ value: HistoryPreviewTimezonePolicy; label: string }> = [
  { value: 'source', label: '保留原文时间' },
  { value: 'user_selected', label: '统一指定时区' },
  { value: 'unknown', label: '时间含义未知' },
];

const filterOptions: Array<{ value: ReviewFilter; label: string }> = [
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
  merged: '已确认合并',
};

const resolutionStyles: Record<HistoryPreviewReviewResolution, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-600',
  edited: 'bg-indigo-100 text-indigo-600',
  excluded: 'bg-slate-100 text-slate-500',
  merged: 'bg-violet-100 text-violet-600',
};

const roleLabel = (role?: HistorySpeakerRole): string => (
  roleOptions.find(option => option.value === role)?.label || '尚未映射'
);

const targetIdForRole = (
  role: HistorySpeakerRole,
  preview: HistoryImportPreview,
): string | undefined => {
  if (role === 'user') return preview.scope.personaMaskId;
  if (role === 'character') return preview.scope.charId;
  return undefined;
};

const HistoryPreviewReview: React.FC<HistoryPreviewReviewProps> = ({
  preview,
  onDecisionChange,
}) => {
  const [sourceMode, setSourceMode] = useState<HistorySourceMode>('unknown');
  const [timezonePolicy, setTimezonePolicy] = useState<HistoryPreviewTimezonePolicy>('unknown');
  const [selectedTimezone, setSelectedTimezone] = useState('Asia/Shanghai');
  const [speakerRoles, setSpeakerRoles] = useState<Record<string, HistorySpeakerRole>>({});
  const [rowDrafts, setRowDrafts] = useState<HistoryPreviewRowReviewDraft[]>(
    () => createHistoryPreviewRowReviewDrafts(preview),
  );
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [page, setPage] = useState(0);
  const [editingRowId, setEditingRowId] = useState<string>();
  const [decision, setDecision] = useState<FrozenHistoryPreviewDecision>();
  const [freezing, setFreezing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    setSourceMode('unknown');
    setTimezonePolicy('unknown');
    setSelectedTimezone('Asia/Shanghai');
    setSpeakerRoles({});
    setRowDrafts(createHistoryPreviewRowReviewDrafts(preview));
    setFilter('pending');
    setPage(0);
    setEditingRowId(undefined);
    setDecision(undefined);
    setFreezing(false);
    setErrorMessage(undefined);
    onDecisionChange?.(undefined);
  }, [onDecisionChange, preview]);

  const speakerMappings = useMemo<HistorySpeakerMapping[]>(() => (
    preview.speakerCandidates.flatMap(candidate => {
      const role = speakerRoles[candidate.label];
      if (!role) return [];
      return [{
        sourceLabel: candidate.label,
        role,
        targetId: targetIdForRole(role, preview),
        confidence: 1,
        confirmedByUser: true,
      }];
    })
  ), [preview, speakerRoles]);

  const draftInput = useMemo<HistoryPreviewReviewDraftInput>(() => ({
    sourceMode,
    timezonePolicy,
    selectedTimezone: timezonePolicy === 'user_selected' ? selectedTimezone : undefined,
    // Retained only for compatibility with the original review schema.
    metadataConfirmedByUser: false,
    speakerMappings,
    rows: rowDrafts,
  }), [rowDrafts, selectedTimezone, sourceMode, speakerMappings, timezonePolicy]);

  const assessment = useMemo(
    () => assessHistoryPreviewReview(preview, draftInput),
    [draftInput, preview],
  );
  const blockerCount = (
    assessment.missingSpeakerMappings.length
    + assessment.pendingRowIds.length
    + assessment.missingRowRoleIds.length
    + assessment.invalidRowIds.length
    + (assessment.timezoneValid ? 0 : 1)
  );

  const rowDraftById = useMemo(
    () => new Map(rowDrafts.map(row => [row.rowId, row])),
    [rowDrafts],
  );

  const matchesFilter = (row: HistoryPreviewRow): boolean => {
    const resolution = rowDraftById.get(row.id)?.resolution || 'pending';
    if (filter === 'pending') {
      const rolePending = !row.speakerLabel
        && (resolution === 'accepted' || resolution === 'edited')
        && !rowDraftById.get(row.id)?.speakerRoleConfirmedByUser;
      return resolution === 'pending' || rolePending;
    }
    if (filter === 'included') return resolution === 'accepted' || resolution === 'edited';
    if (filter === 'excluded') return resolution === 'excluded' || resolution === 'merged';
    return true;
  };

  const filteredRows = useMemo(
    () => preview.rows.filter(matchesFilter),
    [filter, preview.rows, rowDraftById],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [filter]);

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const patchRow = (rowId: string, patch: Partial<HistoryPreviewRowReviewDraft>) => {
    setRowDrafts(current => current.map(row => (
      row.rowId === rowId ? { ...row, ...patch } : row
    )));
    setErrorMessage(undefined);
  };

  const previousMergeTarget = (row: HistoryPreviewRow): HistoryPreviewRow | undefined => {
    const index = preview.rows.findIndex(candidate => candidate.id === row.id);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (preview.rows[cursor].status !== 'skipped') return preview.rows[cursor];
    }
    return undefined;
  };

  const confirmKeep = (row: HistoryPreviewRow, draft: HistoryPreviewRowReviewDraft) => {
    patchRow(row.id, {
      resolution: draft.content === row.content ? 'accepted' : 'edited',
      mergeIntoRowId: undefined,
    });
  };

  const restoreRow = (row: HistoryPreviewRow) => {
    patchRow(row.id, {
      resolution: row.status === 'ready' ? 'accepted' : 'pending',
      mergeIntoRowId: undefined,
    });
  };

  const freezeDecision = async () => {
    setFreezing(true);
    setErrorMessage(undefined);
    try {
      const next = await freezeHistoryPreviewDecision(preview, draftInput);
      setDecision(next);
      setEditingRowId(undefined);
      onDecisionChange?.(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法冻结这一版审阅。');
    } finally {
      setFreezing(false);
    }
  };

  const reopenReview = () => {
    setDecision(undefined);
    setErrorMessage(undefined);
    onDecisionChange?.(undefined);
  };

  if (decision) {
    return (
      <section
        data-history-preview-review="frozen"
        className="mt-4 rounded-[1.75rem] border border-emerald-200/90 bg-white/85 p-4 shadow-[0_16px_45px_rgba(16,185,129,0.10)] backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <LockKey size={21} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black text-emerald-500">第 3 步完成</div>
            <h2 className="mt-1 text-lg font-black text-slate-800">这份记录已经校对好</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              校对结果目前只留在这一页，还没有写进聊天记录或长期记忆。
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ['保留', decision.counts.included],
            ['排除', decision.counts.excluded],
            ['合并', decision.counts.merged],
            ['修正', decision.counts.edited],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-emerald-50/75 px-1 py-2">
              <div className="text-base font-black text-emerald-600">{value}</div>
              <div className="text-[8px] font-bold text-slate-400">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/75 p-3 text-[9px] leading-relaxed text-slate-500">
          <div>模式：{sourceModeOptions.find(option => option.value === decision.sourceMode)?.label}</div>
          <div>时间：{timezoneOptions.find(option => option.value === decision.timezonePolicy)?.label}{decision.selectedTimezone ? ` · ${decision.selectedTimezone}` : ''}</div>
          {decision.coverage === 'materialized_prefix' && (
            <p className="mt-2 text-amber-600">
              这个文件很大，目前只校对到前 {decision.materializedRowCount} / {decision.totalPreviewRowCount} 条，还不能完整导入。
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={reopenReview}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black text-emerald-700"
        >
          <PencilSimple size={15} />
          返回修改
        </button>
      </section>
    );
  }

  return (
    <section
      data-history-preview-review="editing"
      className="mt-4 rounded-[1.75rem] border border-violet-100/90 bg-white/85 p-4 shadow-[0_16px_45px_rgba(124,58,237,0.09)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black text-violet-500">第 3 步 · 校对</div>
          <h2 className="mt-1 text-lg font-black text-slate-800">确认谁说了什么</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            先认领说话人，再处理系统没有把握的内容。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-700">
          {blockerCount} 项待确认
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/55 p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-black text-slate-700">1. 说话人映射</h3>
          <span className="text-[9px] text-slate-400">
            {speakerMappings.length} / {preview.speakerCandidates.length}
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {preview.speakerCandidates.length === 0 && (
            <p className="text-[9px] leading-relaxed text-amber-600">
              文件没有稳定名字；请在每条保留记录上单独确认角色归属。
            </p>
          )}
          {preview.speakerCandidates.map(candidate => (
            <div key={candidate.label} className="rounded-2xl border border-white bg-white/80 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-black text-slate-700">{candidate.label}</span>
                <span className="shrink-0 text-[8px] text-slate-400">{candidate.occurrences} 条</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {roleOptions.map(option => {
                  const selected = speakerRoles[candidate.label] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSpeakerRoles(current => ({
                        ...current,
                        [candidate.label]: option.value,
                      }))}
                      className={`rounded-xl border px-2 py-2 text-[9px] font-black ${
                        selected
                          ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                          : 'border-slate-100 bg-white text-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50/45 p-3">
        <h3 className="text-xs font-black text-slate-700">2. 来源语境与时间</h3>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
          “暂不确定”是合法答案；它比把陪伴聊天硬说成剧情更安全。
        </p>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {sourceModeOptions.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sourceMode === option.value}
              onClick={() => setSourceMode(option.value)}
              className={`rounded-xl border px-2 py-2 text-[9px] font-black ${
                sourceMode === option.value
                  ? 'border-rose-300 bg-rose-100 text-rose-700'
                  : 'border-slate-100 bg-white text-slate-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-1.5">
          {timezoneOptions.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={timezonePolicy === option.value}
              onClick={() => setTimezonePolicy(option.value)}
              className={`rounded-xl border px-3 py-2 text-left text-[9px] font-black ${
                timezonePolicy === option.value
                  ? 'border-violet-300 bg-violet-100 text-violet-700'
                  : 'border-slate-100 bg-white text-slate-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {timezonePolicy === 'user_selected' && (
          <label className="mt-2 block text-[9px] font-bold text-slate-500">
            IANA 时区或 UTC 偏移
            <input
              value={selectedTimezone}
              onChange={event => setSelectedTimezone(event.target.value)}
              placeholder="Asia/Shanghai 或 +08:00"
              className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-[10px] outline-none ${
                assessment.timezoneValid ? 'border-slate-100' : 'border-rose-300'
              }`}
            />
          </label>
        )}

        <HistoryContextNotice />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black text-slate-700">3. 逐行确认</h3>
            <p className="mt-0.5 text-[9px] text-slate-400">合并只在你明确点击后发生。</p>
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
          {visibleRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-center text-[10px] text-emerald-700">
              这个筛选里已经没有记录了。
            </div>
          )}
          {visibleRows.map(row => {
            const draft = rowDraftById.get(row.id)!;
            const mergeTarget = previousMergeTarget(row);
            const mappedRole = row.speakerLabel ? speakerRoles[row.speakerLabel] : draft.speakerRole;
            const editing = editingRowId === row.id;
            return (
              <article key={row.id} className="rounded-2xl border border-slate-100 bg-white/85 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[8px] font-bold text-slate-400">
                    {row.sourceLocator.label || `${row.sourceLocator.kind} ${row.sourceLocator.start}`}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${resolutionStyles[draft.resolution]}`}>
                    {resolutionLabels[draft.resolution]}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px]">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-black text-indigo-600">
                    {row.speakerLabel || '无名字'} → {roleLabel(mappedRole)}
                  </span>
                  {row.sourceTime.originalText && (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-500">
                      {row.sourceTime.originalText}
                    </span>
                  )}
                </div>

                {editing ? (
                  <textarea
                    value={draft.content}
                    onChange={event => patchRow(row.id, {
                      content: event.target.value,
                      resolution: 'edited',
                      mergeIntoRowId: undefined,
                    })}
                    rows={3}
                    className="mt-2 w-full resize-y rounded-xl border border-indigo-200 bg-indigo-50/35 px-3 py-2 text-[11px] leading-relaxed text-slate-700 outline-none focus:border-indigo-400"
                    aria-label={`修正 ${row.sourceLocator.label || row.id} 的正文`}
                  />
                ) : (
                  <p className={`mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed ${
                    draft.resolution === 'excluded' || draft.resolution === 'merged'
                      ? 'text-slate-400 line-through'
                      : 'text-slate-700'
                  }`}>
                    {draft.content || '（空内容）'}
                  </p>
                )}

                {!row.speakerLabel && draft.resolution !== 'excluded' && draft.resolution !== 'merged' && (
                  <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/60 p-2">
                    <div className="text-[8px] font-black text-amber-700">这条没有名字，请单独确认</div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1">
                      {roleOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={draft.speakerRoleConfirmedByUser && draft.speakerRole === option.value}
                          onClick={() => patchRow(row.id, {
                            speakerRole: option.value,
                            speakerRoleConfirmedByUser: true,
                          })}
                          className={`rounded-lg px-2 py-1.5 text-[8px] font-black ${
                            draft.speakerRoleConfirmedByUser && draft.speakerRole === option.value
                              ? 'bg-amber-200 text-amber-800'
                              : 'bg-white text-slate-500'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {draft.resolution === 'merged' && mergeTarget && (
                  <p className="mt-2 rounded-xl bg-violet-50 px-2 py-1.5 text-[8px] leading-relaxed text-violet-600">
                    已明确接到：{mergeTarget.sourceLocator.label || mergeTarget.id}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {draft.resolution === 'pending' && (
                    <button
                      type="button"
                      onClick={() => confirmKeep(row, draft)}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-2.5 py-1.5 text-[8px] font-black text-emerald-700"
                    >
                      <Check size={12} /> 确认保留
                    </button>
                  )}
                  {draft.resolution !== 'excluded' && draft.resolution !== 'merged' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingRowId(editing ? undefined : row.id)}
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[8px] font-black text-indigo-600"
                      >
                        <PencilSimple size={12} /> {editing ? '收起修改' : '修改正文'}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchRow(row.id, { resolution: 'excluded', mergeIntoRowId: undefined })}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[8px] font-black text-slate-500"
                      >
                        <XCircle size={12} /> 排除
                      </button>
                    </>
                  )}
                  {row.issues.includes('possible_continuation')
                    && mergeTarget
                    && draft.resolution !== 'excluded'
                    && draft.resolution !== 'merged' && (
                    <button
                      type="button"
                      onClick={() => patchRow(row.id, {
                        resolution: 'merged',
                        mergeIntoRowId: mergeTarget.id,
                      })}
                      className="inline-flex items-center gap-1 rounded-xl bg-violet-100 px-2.5 py-1.5 text-[8px] font-black text-violet-700"
                    >
                      <LinkSimple size={12} /> 确认并接到上一条
                    </button>
                  )}
                  {(draft.resolution === 'excluded' || draft.resolution === 'merged') && (
                    <button
                      type="button"
                      onClick={() => restoreRow(row)}
                      className="rounded-xl bg-amber-50 px-2.5 py-1.5 text-[8px] font-black text-amber-700"
                    >
                      恢复审阅
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(current => Math.max(0, current - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 disabled:opacity-30"
              aria-label="上一页"
            >
              <ArrowLeft size={14} />
            </button>
            <span className="text-[9px] font-bold text-slate-400">
              {page + 1} / {pageCount} · 共 {filteredRows.length} 条
            </span>
            <button
              type="button"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 disabled:opacity-30"
              aria-label="下一页"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={`mt-4 rounded-2xl border p-3 ${
        assessment.canFreeze
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-amber-100 bg-amber-50/60'
      }`}>
        <div className="flex items-start gap-2">
          {assessment.canFreeze
            ? <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-emerald-500" />
            : <WarningCircle size={18} className="mt-0.5 shrink-0 text-amber-500" />}
          <div className="text-[9px] leading-relaxed text-slate-600">
            {assessment.canFreeze ? (
              <p>说话人和疑点都已处理，可以完成这次校对。</p>
            ) : (
              <ul className="space-y-0.5">
                {assessment.missingSpeakerMappings.length > 0 && <li>还有 {assessment.missingSpeakerMappings.length} 个说话人未映射。</li>}
                {assessment.pendingRowIds.length > 0 && <li>还有 {assessment.pendingRowIds.length} 条疑点未确认。</li>}
                {assessment.missingRowRoleIds.length > 0 && <li>还有 {assessment.missingRowRoleIds.length} 条无名字记录未指定角色。</li>}
                {!assessment.timezoneValid && <li>指定时区格式无效。</li>}
                {assessment.invalidRowIds.length > 0 && <li>还有 {assessment.invalidRowIds.length} 条修正内容或合并目标无效。</li>}
              </ul>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[9px] text-rose-700">
          {errorMessage}
        </div>
      )}

      <button
        type="button"
        disabled={!assessment.canFreeze || freezing}
        onClick={() => void freezeDecision()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-200/50 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        <LockKey size={15} weight="bold" />
        {freezing ? '正在完成校对…' : '完成校对'}
      </button>

      <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-400">
        当前开发版只完成校对；真正导入接通前不会写入聊天或记忆。
      </p>
    </section>
  );
};

export default HistoryPreviewReview;
