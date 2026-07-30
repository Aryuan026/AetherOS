import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle,
  Sparkle,
  SpinnerGap,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import type { DailyArchiveCoverage } from '../../domain/dailyArchive/types.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import type { APIConfig } from '../../types.ts';
import {
  loadHistoryCompanionAnalysisPreview,
  runHistoryCompanionAnalysis,
  type HistoryCompanionAnalysisPreview,
  type HistoryCompanionAnalysisProgress,
  type HistoryCompanionAnalysisRange,
  type HistoryCompanionAnalysisRunResult,
} from '../../utils/historyImport/companionMaterial/runtimeAnalysis.ts';

interface HistoryCompanionAnalysisSheetProps {
  scope: HistoryScope;
  relationshipLabel: string;
  coverage?: DailyArchiveCoverage;
  apiConfig: APIConfig;
  onClose: () => void;
  onComplete?: (result: HistoryCompanionAnalysisRunResult) => void;
}

const formatCompactNumber = (value: number): string => {
  if (value >= 10_000) {
    const scaled = value / 10_000;
    return `${scaled >= 100
      ? Math.round(scaled)
      : scaled.toFixed(scaled >= 10 ? 1 : 2).replace(/\.?0+$/, '')} 万`;
  }
  return value.toLocaleString('zh-CN');
};

const rangeLabel = (
  range: HistoryCompanionAnalysisRange,
): string => {
  if (range.kind === 'all') return '全部记录';
  if (range.startDateKey === range.endDateKey) return range.startDateKey.replace(/-/g, '.');
  return `${range.startDateKey.replace(/-/g, '.')}—${range.endDateKey.replace(/-/g, '.')}`;
};

const HistoryCompanionAnalysisSheet: React.FC<HistoryCompanionAnalysisSheetProps> = ({
  scope,
  relationshipLabel,
  coverage,
  apiConfig,
  onClose,
  onComplete,
}) => {
  const [rangeMode, setRangeMode] = useState<'all' | 'date_range'>('all');
  const [rangeStartKey, setRangeStartKey] = useState(coverage?.earliestDateKey || '');
  const [rangeEndKey, setRangeEndKey] = useState(coverage?.latestDateKey || '');
  const [preview, setPreview] = useState<HistoryCompanionAnalysisPreview>();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<HistoryCompanionAnalysisProgress>();
  const [result, setResult] = useState<HistoryCompanionAnalysisRunResult>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const abortRef = useRef<AbortController>();

  const range = useMemo<HistoryCompanionAnalysisRange>(() => (
    rangeMode === 'all'
      ? { kind: 'all' }
      : {
        kind: 'date_range',
        startDateKey: rangeStartKey,
        endDateKey: rangeEndKey,
      }
  ), [rangeEndKey, rangeMode, rangeStartKey]);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setErrorMessage(undefined);
    const timer = window.setTimeout(() => {
      void loadHistoryCompanionAnalysisPreview({ scope, range })
        .then(next => {
          if (!cancelled) setPreview(next);
        })
        .catch(error => {
          if (!cancelled) {
            setPreview(undefined);
            setErrorMessage(error instanceof Error ? error.message : '暂时读不到这段旧日记录。');
          }
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    range.kind,
    range.kind === 'date_range' ? range.startDateKey : '',
    range.kind === 'date_range' ? range.endDateKey : '',
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const apiReady = Boolean(
    apiConfig.baseUrl.trim()
    && apiConfig.model.trim(),
  );
  const totalCalls = progress?.totalCalls || preview?.estimatedCalls || 0;
  const completedCalls = progress?.completedCalls || 0;
  const progressPercent = progress?.stage === 'completed'
    ? 100
    : totalCalls > 0
      ? Math.min(96, Math.round((completedCalls / totalCalls) * 100))
      : running ? 8 : 0;

  const close = () => {
    if (running) return;
    onClose();
  };

  const start = async () => {
    if (running || !preview?.executable || !apiReady) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(undefined);
    setErrorMessage(undefined);
    setProgress({
      stage: 'loading_source',
      completedCalls: 0,
      totalCalls: preview.estimatedCalls,
      detail: '正在读取本机日档',
    });
    try {
      const next = await runHistoryCompanionAnalysis({
        scope,
        range,
        apiConfig,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(next);
      onComplete?.(next);
    } catch (error) {
      if (controller.signal.aborted) {
        setErrorMessage('这次整理已经取消，没有发布新的角色素材。');
      } else {
        setErrorMessage(error instanceof Error ? error.message : '这次整理没有完成，可以稍后重试。');
      }
    } finally {
      abortRef.current = undefined;
      setRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex items-end bg-slate-950/30 backdrop-blur-[2px]"
      onClick={close}
      data-testid="history-companion-analysis-sheet"
    >
      <section
        className="flex max-h-[86%] w-full flex-col overflow-hidden rounded-t-[32px] border-t border-white bg-[#fbf9ff] shadow-[0_-22px_64px_rgba(54,42,78,0.20)]"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="整理旧日角色素材"
      >
        <div className="shrink-0 border-b border-white/80 bg-[#fbf9ff]/96 px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-200">
              <Sparkle size={20} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-black text-slate-800">让旧记录帮助角色接上你</h2>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                提炼表达习惯和稳定细节，不把整份聊天塞进每次对话。
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={running}
              aria-label="关闭旧日角色素材整理"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm active:scale-95 disabled:opacity-35"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 no-scrollbar">
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white bg-white/80 px-3 py-2.5 shadow-sm">
            <Archive size={15} className="shrink-0 text-violet-500" weight="duotone" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-black text-slate-600">
              {relationshipLabel}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black text-emerald-600">
              日档存本机
            </span>
          </div>

          {!running && !result && (
            <>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black tracking-[0.12em] text-violet-500">01 · 范围</p>
                  <h3 className="mt-0.5 text-[13px] font-black text-slate-800">这次读哪一段</h3>
                </div>
                <span className="max-w-[58%] truncate text-[9px] font-bold text-slate-400">
                  {rangeLabel(range)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRangeMode('all')}
                  aria-pressed={rangeMode === 'all'}
                  className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98] ${
                    rangeMode === 'all'
                      ? 'border-violet-200 bg-violet-600 text-white shadow-md shadow-violet-200/70'
                      : 'border-white bg-white/85 text-slate-600 shadow-sm'
                  }`}
                >
                  <span className="block text-[11px] font-black">全部记录</span>
                  <span className={`mt-0.5 block text-[8px] font-bold ${rangeMode === 'all' ? 'text-violet-100' : 'text-slate-400'}`}>
                    后台自动分批
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode('date_range')}
                  aria-pressed={rangeMode === 'date_range'}
                  className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98] ${
                    rangeMode === 'date_range'
                      ? 'border-violet-200 bg-violet-600 text-white shadow-md shadow-violet-200/70'
                      : 'border-white bg-white/85 text-slate-600 shadow-sm'
                  }`}
                >
                  <span className="block text-[11px] font-black">选择日期</span>
                  <span className={`mt-0.5 block text-[8px] font-bold ${rangeMode === 'date_range' ? 'text-violet-100' : 'text-slate-400'}`}>
                    可跨月圈定事件
                  </span>
                </button>
              </div>

              {rangeMode === 'date_range' && (
                <div className="mt-2 rounded-[22px] border border-violet-100 bg-white/88 p-3 shadow-sm">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <label className="min-w-0">
                      <span className="mb-1 block text-[8px] font-black text-slate-400">开始日期</span>
                      <input
                        type="date"
                        value={rangeStartKey}
                        min={coverage?.earliestDateKey}
                        max={coverage?.latestDateKey}
                        onChange={event => {
                          const next = event.target.value;
                          setRangeStartKey(next);
                          if (rangeEndKey && next > rangeEndKey) setRangeEndKey(next);
                        }}
                        className="h-10 w-full min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-2 text-[10px] font-black text-slate-700 outline-none focus:border-violet-200"
                      />
                    </label>
                    <span className="pb-3 text-[9px] font-black text-violet-300">至</span>
                    <label className="min-w-0">
                      <span className="mb-1 block text-[8px] font-black text-slate-400">结束日期</span>
                      <input
                        type="date"
                        value={rangeEndKey}
                        min={coverage?.earliestDateKey}
                        max={coverage?.latestDateKey}
                        onChange={event => {
                          const next = event.target.value;
                          setRangeEndKey(next);
                          if (rangeStartKey && next < rangeStartKey) setRangeStartKey(next);
                        }}
                        className="h-10 w-full min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-2 text-[10px] font-black text-slate-700 outline-none focus:border-violet-200"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-[24px] border border-white bg-white/88 p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black tracking-[0.12em] text-violet-500">02 · 用量预估</p>
                    <h3 className="mt-0.5 text-[13px] font-black text-slate-800">发送前先看一眼</h3>
                  </div>
                  {previewLoading && <SpinnerGap size={18} className="animate-spin text-violet-500" />}
                </div>
                {preview && preview.messageCount > 0 ? (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span className="block text-[8px] font-bold text-slate-400">读取记录</span>
                        <span className="mt-0.5 block text-[12px] font-black text-slate-700">
                          {formatCompactNumber(preview.messageCount)} 条
                        </span>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span className="block text-[8px] font-bold text-slate-400">输入 token</span>
                        <span className="mt-0.5 block text-[12px] font-black text-slate-700">
                          约 {formatCompactNumber(preview.estimatedInputTokens)}
                        </span>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span className="block text-[8px] font-bold text-slate-400">后台分批</span>
                        <span className="mt-0.5 block text-[12px] font-black text-slate-700">
                          {preview.batchCount} 批
                        </span>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span className="block text-[8px] font-bold text-slate-400">预计调用</span>
                        <span className="mt-0.5 block text-[12px] font-black text-slate-700">
                          约 {preview.estimatedCalls} 次
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-[8px] leading-relaxed text-slate-400">
                      预计用量包含两遍整理，实际费用以你的 API 服务商为准。
                    </p>
                  </>
                ) : !previewLoading && (
                  <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-4 text-center text-[10px] leading-relaxed text-slate-400">
                    {preview?.blockedReason || '这段范围里还没有可以整理的记录。'}
                  </p>
                )}
              </div>

              <div className="mt-3 rounded-[22px] border border-violet-100 bg-violet-50/70 px-3 py-3">
                <p className="text-[10px] font-black text-violet-700">整理后会怎样</p>
                <p className="mt-1 text-[9px] leading-relaxed text-violet-700/75">
                  只保留非逐字的表达指纹、稳定细节，以及按场景使用的开场或场景候选。聊天时最多按需取一条；旧记录不会变成今天的心情、约定、已发生剧情或角色卡事实。
                </p>
              </div>
            </>
          )}

          {(running || progress) && !result && (
            <div className="mt-5 rounded-[26px] border border-violet-100 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                {running
                  ? <SpinnerGap size={22} className="animate-spin text-violet-600" />
                  : <WarningCircle size={22} className="text-rose-500" weight="fill" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-black text-slate-800">
                    {running ? '正在整理旧记录' : '这次没有完成'}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500">
                    {progress?.detail || '正在准备'}
                  </p>
                </div>
                {totalCalls > 0 && (
                  <span className="text-[9px] font-black text-violet-500">
                    {Math.min(completedCalls, totalCalls)}/{totalCalls}
                  </span>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-50">
                <div
                  className="h-full rounded-full bg-violet-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {running && progress?.stage !== 'publishing' && (
                <button
                  type="button"
                  onClick={cancel}
                  className="mt-4 w-full rounded-2xl bg-slate-100 py-2.5 text-[10px] font-black text-slate-500"
                >
                  取消这次整理
                </button>
              )}
              {running && progress?.stage === 'publishing' && (
                <p className="mt-3 text-center text-[8px] font-bold text-slate-400">
                  正在完成本机写入，这一小步不会中途打断。
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="mt-5 rounded-[26px] border border-emerald-100 bg-emerald-50/80 p-4 text-center">
              <CheckCircle size={32} className="mx-auto text-emerald-600" weight="fill" />
              <h3 className="mt-2 text-[14px] font-black text-slate-800">
                {result.status === 'published' ? '旧记录已经接上角色' : '这次没有硬凑新结论'}
              </h3>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
                {result.status === 'published'
                  ? `第二遍核对后保留 ${result.approvedMaterialCount} 条方向；从下一轮聊天起按需参与。`
                  : '现有证据门槛没有找到足够稳定的新方向，原记录仍完整留在日历里。'}
              </p>
              {result.budgetWithheldFindingCount > 0 && (
                <p className="mt-2 rounded-2xl bg-white/70 px-3 py-2 text-[8px] leading-relaxed text-amber-700">
                  另有 {result.budgetWithheldFindingCount} 条方向因本轮复核上限没有激活；缩小日期范围后可以再整理。
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded-2xl bg-emerald-600 py-3 text-[11px] font-black text-white shadow-md shadow-emerald-100"
              >
                完成
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-[9px] leading-relaxed text-rose-700">
              <WarningCircle size={15} className="mt-0.5 shrink-0" />
              {errorMessage}
            </div>
          )}

          {!running && !result && (
            <>
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/85 px-3 py-2.5 text-[9px] leading-relaxed text-amber-800">
                选定范围的原文片段会临时发送给当前已启用 API 分析；本机素材库不会保存原句。
              </div>
              <button
                type="button"
                disabled={!preview?.executable || previewLoading || !apiReady}
                onClick={() => void start()}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 text-[12px] font-black text-white shadow-lg shadow-violet-200 transition active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <Sparkle size={16} weight="fill" />
                开始整理
              </button>
              <p className="mt-2 text-center text-[8px] leading-relaxed text-slate-400">
                {!apiReady
                  ? '请先在设置里启用一个 API 配置。'
                  : preview?.blockedReason || '整理会分两遍完成，减少遗漏和误判。'}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default HistoryCompanionAnalysisSheet;
