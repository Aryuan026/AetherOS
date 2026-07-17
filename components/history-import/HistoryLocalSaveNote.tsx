import React from 'react';
import { CheckCircle, CaretDown, HardDrives, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import type { HistoryStorageHealthSnapshot } from '../../domain/historyImport/storageHealth';
import type { HistoryPersistenceRequestResult } from '../../utils/historyImport/storage/storageHealth';

interface HistoryLocalSaveNoteProps {
  snapshot?: HistoryStorageHealthSnapshot;
  loading: boolean;
  requestingPersistence: boolean;
  persistenceResult?: HistoryPersistenceRequestResult;
  errorMessage?: string;
  onRequestPersistence: () => void;
}

const requestResultCopy: Record<HistoryPersistenceRequestResult['status'], string> = {
  granted: '已让浏览器更稳地保留本站数据。',
  denied: '浏览器没有开启，但不影响继续；之后请记得导出备份。',
  unsupported: '这个浏览器不支持该设置；之后请记得导出备份。',
  user_gesture_required: '请再点一次按钮完成设置。',
  failed: '这次没有设置成功，稍后可以再试。',
};

const HistoryLocalSaveNote: React.FC<HistoryLocalSaveNoteProps> = ({
  snapshot,
  loading,
  requestingPersistence,
  persistenceResult,
  errorMessage,
  onRequestPersistence,
}) => {
  const persistent = snapshot?.persistenceState === 'persistent';
  const summary = loading
    ? '正在确认保存方式…'
    : persistent
      ? '已减少被浏览器自动清理的风险'
      : '清理浏览器数据时，记录可能会丢失';

  return (
    <details className="group mt-4 rounded-2xl border border-slate-200/80 bg-white/75 px-3.5 py-3 shadow-sm backdrop-blur-xl">
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          persistent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
        }`}>
          {persistent ? <ShieldCheck size={19} weight="duotone" /> : <HardDrives size={19} weight="duotone" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black text-slate-700">保存在哪里？这个浏览器里</span>
          <span className="mt-0.5 block truncate text-[9px] text-slate-400">{summary}</span>
        </span>
        <CaretDown size={14} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[10px] leading-relaxed text-slate-600">
          AetherOS 不会把聊天记录存到运营服务器。这里的设置只是请求浏览器少自动清理本站数据，不会读取你设备里的其他文件。
        </p>

        {!persistent && (
          <button
            type="button"
            disabled={loading || requestingPersistence}
            onClick={onRequestPersistence}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-3.5 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
          >
            <ShieldCheck size={14} />
            {requestingPersistence ? '正在设置…' : '让浏览器更稳地保存'}
          </button>
        )}

        {persistenceResult && (
          <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[9px] leading-relaxed ${
            persistenceResult.status === 'granted'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {persistenceResult.status === 'granted'
              ? <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
              : <WarningCircle size={14} className="mt-0.5 shrink-0" />}
            <span>{requestResultCopy[persistenceResult.status]}</span>
          </div>
        )}

        {errorMessage && (
          <p className="mt-2 text-[9px] leading-relaxed text-amber-700">暂时无法确认保存状态；不影响选择和校对文件。</p>
        )}
      </div>
    </details>
  );
};

export default HistoryLocalSaveNote;
