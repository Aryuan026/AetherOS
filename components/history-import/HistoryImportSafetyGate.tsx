import React from 'react';
import {
  CheckCircle,
  CircleNotch,
  Database,
  Key,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import type { HistoryStorageHealthSnapshot } from '../../domain/historyImport/storageHealth';
import type { HistoryPersistenceRequestResult } from '../../utils/historyImport/storage/storageHealth';

interface HistoryImportSafetyGateProps {
  snapshot?: HistoryStorageHealthSnapshot;
  loading: boolean;
  requestingPersistence: boolean;
  persistenceResult?: HistoryPersistenceRequestResult;
  errorMessage?: string;
  onRefresh: () => void;
  onRequestPersistence: () => void;
}

const formatBytes = (bytes?: number): string => {
  if (bytes === undefined) return '浏览器未提供';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** order);
  return `${value >= 10 || order === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[order]}`;
};

const persistenceCopy = (snapshot?: HistoryStorageHealthSnapshot): {
  label: string;
  detail: string;
  tone: 'ready' | 'warning' | 'muted';
} => {
  switch (snapshot?.persistenceState) {
    case 'persistent':
      return {
        label: '已获持久保存',
        detail: '浏览器会尽量避免在自动清理空间时移除这批本机数据。',
        tone: 'ready',
      };
    case 'best_effort':
      return {
        label: '目前是尽力保存',
        detail: '记录仍在本机，但浏览器空间紧张时存在被回收的可能。',
        tone: 'warning',
      };
    case 'unknown':
      return {
        label: '保存级别未知',
        detail: '浏览器没有返回可靠状态，不能把它显示成已经安全。',
        tone: 'warning',
      };
    default:
      return {
        label: '浏览器不支持持久化申请',
        detail: '稍后需要依靠加密救援包补上浏览器之外的副本。',
        tone: 'muted',
      };
  }
};

const requestResultCopy = (result?: HistoryPersistenceRequestResult): string | undefined => {
  if (!result) return undefined;
  switch (result.status) {
    case 'granted': return '申请成功，这个浏览器已将本机记录提升为持久保存。';
    case 'denied': return '浏览器没有授予持久保存；记录没有消失，但之后仍需要救援包兜底。';
    case 'unsupported': return '当前浏览器不支持这项申请。';
    case 'user_gesture_required': return '申请需要由你亲自点击触发，请再点一次。';
    case 'failed': return '这次申请没有完成，可以稍后重试。';
  }
};

const SafetyStep: React.FC<{
  icon: React.ReactNode;
  title: string;
  detail: string;
  state: 'complete' | 'attention' | 'pending';
  badge: string;
}> = ({ icon, title, detail, state, badge }) => {
  const tone = state === 'complete'
    ? 'border-emerald-100 bg-emerald-50/70 text-emerald-700'
    : state === 'attention'
      ? 'border-amber-100 bg-amber-50/70 text-amber-700'
      : 'border-slate-100 bg-white/65 text-slate-400';

  return (
    <div className={`flex gap-3 rounded-2xl border p-3.5 ${tone}`}>
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-sm">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700">{title}</h3>
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[9px] font-bold tracking-wide">
            {badge}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p>
      </div>
    </div>
  );
};

const HistoryImportSafetyGate: React.FC<HistoryImportSafetyGateProps> = ({
  snapshot,
  loading,
  requestingPersistence,
  persistenceResult,
  errorMessage,
  onRefresh,
  onRequestPersistence,
}) => {
  const persistence = persistenceCopy(snapshot);
  const resultCopy = requestResultCopy(persistenceResult);
  const usageRatio = snapshot?.estimateState === 'available'
    && snapshot.quotaBytes
    && snapshot.usageBytes !== undefined
      ? Math.min(100, Math.max(0, (snapshot.usageBytes / snapshot.quotaBytes) * 100))
      : undefined;
  const canRequestPersistence = snapshot?.persistenceState === 'best_effort'
    || snapshot?.persistenceState === 'unknown';

  return (
    <section className="space-y-4" aria-labelledby="history-storage-title">
      <div className="rounded-[1.75rem] border border-white/90 bg-white/80 p-4 shadow-[0_16px_40px_rgba(99,102,241,0.10)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-500">
              <ShieldCheck size={18} weight="duotone" />
              <span className="text-[10px] font-black tracking-[0.18em]">G0 · 保存安全检查</span>
            </div>
            <h2 id="history-storage-title" className="mt-2 text-lg font-black tracking-tight text-slate-800">
              先确认旧日有地方安稳落脚
            </h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border border-slate-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm disabled:opacity-50"
          >
            {loading ? '检测中…' : '重新检测'}
          </button>
        </div>

        {errorMessage ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-600">
            <WarningCircle size={18} className="mt-0.5 shrink-0" />
            {errorMessage}
          </div>
        ) : loading && !snapshot ? (
          <div className="mt-5 flex items-center justify-center gap-2 py-7 text-xs font-semibold text-slate-400">
            <CircleNotch size={18} className="animate-spin" /> 正在读取浏览器给出的真实状态
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-rose-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400">本机浏览器空间</div>
                  <div className="mt-1 text-base font-black text-slate-700">
                    {formatBytes(snapshot?.usageBytes)} / {formatBytes(snapshot?.quotaBytes)}
                  </div>
                </div>
                <Database size={28} weight="duotone" className="text-indigo-400" />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-300 to-rose-300 transition-all duration-500"
                  style={{ width: usageRatio === undefined ? '0%' : `${Math.max(2, usageRatio)}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                {snapshot?.estimateState === 'available'
                  ? '这是整个站点当前使用量，不会伪装成导入记录单独占用量。'
                  : '当前浏览器没有提供可靠容量数字，正式导入会继续保持关闭。'}
              </p>
            </div>

            <div className="mt-4 space-y-2.5">
              <SafetyStep
                icon={<Database size={20} weight="duotone" />}
                title="浏览器内的本机空间"
                detail={snapshot?.estimateState === 'available'
                  ? '容量信息可读取，后续可以按真实文件大小做导入前预算。'
                  : '容量仍不可验证，不能开始大批量写入。'}
                state={snapshot?.estimateState === 'available' ? 'complete' : 'attention'}
                badge={snapshot?.estimateState === 'available' ? '已读取' : '待确认'}
              />
              <SafetyStep
                icon={persistence.tone === 'ready'
                  ? <CheckCircle size={20} weight="fill" />
                  : <ShieldCheck size={20} weight="duotone" />}
                title={persistence.label}
                detail={persistence.detail}
                state={persistence.tone === 'ready' ? 'complete' : 'attention'}
                badge={persistence.tone === 'ready' ? '已保护' : '还需一步'}
              />
              <SafetyStep
                icon={<Key size={20} weight="duotone" />}
                title="真实记录的加密救援包"
                detail="下面的空载演练不等于真实备份；正式生成时，恢复密钥只展示一次。"
                state="pending"
                badge="尚未生成"
              />
            </div>

            {canRequestPersistence && (
              <button
                type="button"
                onClick={onRequestPersistence}
                disabled={requestingPersistence}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-200 transition active:scale-[0.99] disabled:opacity-60"
              >
                {requestingPersistence ? <CircleNotch size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                {requestingPersistence ? '正在向浏览器申请…' : '申请本机持久保存'}
              </button>
            )}

            {resultCopy && (
              <p
                role="status"
                className={`mt-3 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed ${
                  persistenceResult?.status === 'granted'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {resultCopy}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default HistoryImportSafetyGate;
