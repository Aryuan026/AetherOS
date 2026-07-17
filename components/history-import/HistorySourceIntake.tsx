import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  FileText,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import type { HistoryIdentityBindingDraft } from '../../domain/historyImport/identityBinding';
import type { HistoryReviewWorkspaceManifest } from '../../domain/historyImport/reviewWorkspace';
import {
  MAX_HISTORY_IMPORT_FILE_BYTES,
} from '../../utils/historyImport/parsers/sourcePreview';
import {
  createHistoryReviewWorkspaceFromSource,
  type HistoryReviewWorkspaceCreateProgress,
} from '../../utils/historyImport/storage/reviewWorkspace';

interface HistorySourceIntakeProps {
  enabled: boolean;
  bindingDraft?: HistoryIdentityBindingDraft;
  onWorkspaceChange?: (workspace?: HistoryReviewWorkspaceManifest) => void;
}

const formatBytes = (value: number): string => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const HistorySourceIntake: React.FC<HistorySourceIntakeProps> = ({
  enabled,
  bindingDraft,
  onWorkspaceChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<HistoryReviewWorkspaceManifest>();
  const [reading, setReading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [progress, setProgress] = useState<HistoryReviewWorkspaceCreateProgress>();

  const bindingKey = useMemo(() => (
    enabled && bindingDraft
      ? [
          bindingDraft.id,
          bindingDraft.scope.personaMaskId,
          bindingDraft.scope.progressBundleId,
          bindingDraft.scope.charId,
        ].join(':')
      : 'disabled'
  ), [bindingDraft, enabled]);

  useEffect(() => {
    setWorkspace(undefined);
    setErrorMessage(undefined);
    setProgress(undefined);
    setReading(false);
    if (inputRef.current) inputRef.current.value = '';
    onWorkspaceChange?.(undefined);
  }, [bindingKey, onWorkspaceChange]);

  const chooseFile = () => {
    if (!enabled || !bindingDraft || reading) return;
    inputRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !enabled || !bindingDraft) return;

    setReading(true);
    setErrorMessage(undefined);
    setWorkspace(undefined);
    setProgress({ phase: 'parsing', processedRows: 0 });
    onWorkspaceChange?.(undefined);
    try {
      if (file.size > MAX_HISTORY_IMPORT_FILE_BYTES) {
        throw new Error('文件超过 64 MiB。为避免手机卡住，请先把文件拆小后再试。');
      }
      const next = await createHistoryReviewWorkspaceFromSource({
        bindingDraft,
        source: {
          name: file.name,
          mimeType: file.type,
          lastModifiedAt: file.lastModified,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        onProgress: setProgress,
      });
      setWorkspace(next);
      onWorkspaceChange?.(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时无法读取这个文件。');
    } finally {
      setReading(false);
    }
  };

  return (
    <section
      data-history-source-intake={workspace ? `ready-${workspace.format}` : enabled ? 'waiting' : 'locked'}
      className="mt-4 rounded-[1.75rem] border border-rose-100/90 bg-white/85 p-4 shadow-[0_16px_45px_rgba(244,114,182,0.08)] backdrop-blur-xl"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFile}
        className="hidden"
        aria-label="选择 TXT 或 DOCX 历史对话文件"
      />

      {!workspace ? (
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <FileText size={24} weight="duotone" />
          </div>
          <div className="mt-2 text-[10px] font-black text-rose-500">第 2 步</div>
          <h2 className="mt-0.5 text-lg font-black text-slate-800">选择聊天记录</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            支持 TXT 和 Word（.docx）。文件只在这台设备上读取，不会上传。
          </p>
          <button
            type="button"
            disabled={!enabled || reading}
            onClick={chooseFile}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-violet-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-rose-200/45 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
          >
            {reading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : (
              <UploadSimple size={16} weight="bold" />
            )}
            {reading
              ? progress?.phase === 'saving' && progress.totalRows
                ? `正在保存 ${progress.processedRows} / ${progress.totalRows}`
                : '正在读取并整理…'
              : '选择 TXT 或 Word'}
          </button>
          <p className="mt-2 text-[9px] text-slate-400">单个文件不超过 64 MiB；旧版 .doc 请先另存为 .docx。</p>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <CheckCircle size={21} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black text-emerald-600">文件读取完成</div>
              <h2 className="mt-0.5 truncate text-sm font-black text-slate-800">{workspace.sourceFile.name}</h2>
              <p className="mt-0.5 text-[9px] text-slate-500">
                {workspace.format === 'docx' ? 'Word · DOCX' : 'TXT'} · {formatBytes(workspace.sourceFile.sizeBytes)} · 已整理 {workspace.counts.parsed} 条对话
              </p>
              {workspace.counts.skipped > 0 && (
                <p className="mt-0.5 text-[8px] text-slate-400">已自动忽略 {workspace.counts.skipped} 个空行或分隔符。</p>
              )}
            </div>
            <button
              type="button"
              onClick={chooseFile}
              disabled={reading}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-600"
            >
              <ArrowsClockwise size={12} />
              换文件
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ['可直接保留', workspace.counts.accepted, 'text-emerald-600'],
              ['稍后整理', workspace.counts.uncertain, 'text-amber-600'],
              ['重复或空行', workspace.counts.duplicates + workspace.counts.skipped, 'text-slate-500'],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 px-1 py-2">
                <div className={`text-base font-black ${color}`}>{count}</div>
                <div className="text-[8px] font-bold text-slate-400">{label}</div>
              </div>
            ))}
          </div>

          {workspace.warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {workspace.warnings.map(warning => (
                <div key={warning} className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[9px] leading-relaxed text-amber-700">
                  <WarningCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-center text-[9px] font-bold text-violet-600">下一步：确认分析结果，导入后直接继续聊天</p>
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[10px] leading-relaxed text-rose-700">
          <WarningCircle size={17} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </section>
  );
};

export default HistorySourceIntake;
