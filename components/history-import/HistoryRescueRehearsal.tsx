import React, { useRef, useState } from 'react';
import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  ClipboardText,
  DownloadSimple,
  Key,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  advanceHistoryRecoverySecretHandoff,
  confirmHistoryBackupExternalSave,
} from '../../domain/historyImport/backupReceipt';
import type { HistoryBackupReceipt } from '../../domain/historyImport/types';
import {
  copyHistoryRecoverySecretToClipboard,
} from '../../utils/historyImport/backup/rescueDelivery';
import {
  createHistoryRescueRehearsal,
  requestHistoryRescueRehearsalDownload,
  validateHistoryRescueRehearsalExternalArchive,
  verifyHistoryRescueRehearsal,
  type HistoryRescueRehearsalArtifact,
} from '../../utils/historyImport/backup/rescueRehearsal';

type BusyState = 'generating' | 'downloading' | 'verifying';
type ClipboardState = 'idle' | 'copied' | 'failed';

const receiptHasExternalCopy = (receipt?: HistoryBackupReceipt): boolean => Boolean(
  receipt?.externalCopyConfirmed
  && (receipt.status === 'external_save_confirmed' || receipt.status === 'restore_verified'),
);

const ReceiptStep: React.FC<{
  title: string;
  detail: string;
  status: 'complete' | 'current' | 'pending';
  badge: string;
}> = ({ title, detail, status, badge }) => {
  const tone = status === 'complete'
    ? 'border-emerald-100 bg-emerald-50/80'
    : status === 'current'
      ? 'border-indigo-100 bg-indigo-50/80'
      : 'border-slate-100 bg-slate-50/70';
  const iconTone = status === 'complete'
    ? 'text-emerald-500'
    : status === 'current'
      ? 'text-indigo-500'
      : 'text-slate-300';

  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-3.5 ${tone}`}>
      <div className={`mt-0.5 ${iconTone}`}>
        {status === 'complete'
          ? <CheckCircle size={21} weight="fill" />
          : <ShieldCheck size={21} weight="duotone" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700">{title}</h3>
          <span className="shrink-0 rounded-full bg-white/85 px-2 py-1 text-[9px] font-bold text-slate-500">
            {badge}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p>
      </div>
    </div>
  );
};

const HistoryRescueRehearsal: React.FC = () => {
  const [artifact, setArtifact] = useState<HistoryRescueRehearsalArtifact>();
  const [receipt, setReceipt] = useState<HistoryBackupReceipt>();
  const [secretVisible, setSecretVisible] = useState(false);
  const [busy, setBusy] = useState<BusyState>();
  const [clipboardState, setClipboardState] = useState<ClipboardState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [cleanupMessage, setCleanupMessage] = useState<string>();
  const [selectedExternalArchive, setSelectedExternalArchive] = useState<string>();
  const [selectedExternalFileName, setSelectedExternalFileName] = useState<string>();
  const recoverySecretRef = useRef<string>();

  const resetRehearsal = () => {
    recoverySecretRef.current = undefined;
    setArtifact(undefined);
    setReceipt(undefined);
    setSecretVisible(false);
    setClipboardState('idle');
    setErrorMessage(undefined);
    setCleanupMessage(undefined);
    setSelectedExternalArchive(undefined);
    setSelectedExternalFileName(undefined);
  };

  const handleGenerate = async () => {
    resetRehearsal();
    setBusy('generating');
    try {
      const created = await createHistoryRescueRehearsal();
      recoverySecretRef.current = created.recoverySecret;
      setArtifact(created.artifact);
      setReceipt(created.receipt);
      setSecretVisible(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '空载救援包生成失败。');
    } finally {
      setBusy(undefined);
    }
  };

  const handleCopySecret = async () => {
    const recoverySecret = recoverySecretRef.current;
    if (!recoverySecret || !receipt) return;
    const copied = await copyHistoryRecoverySecretToClipboard({
      recoverySecret,
      userGestureConfirmed: true,
    });
    if (copied.status === 'copied_to_clipboard') {
      setReceipt(advanceHistoryRecoverySecretHandoff(receipt, copied.status, Date.now()));
      setClipboardState('copied');
    } else {
      setClipboardState('failed');
    }
  };

  const handleConfirmSecretHeld = () => {
    if (!receipt) return;
    setReceipt(advanceHistoryRecoverySecretHandoff(receipt, 'user_confirmed', Date.now()));
    setSecretVisible(false);
  };

  const handleDownload = () => {
    if (!artifact || !receipt) return;
    setBusy('downloading');
    setErrorMessage(undefined);
    setSelectedExternalArchive(undefined);
    setSelectedExternalFileName(undefined);
    try {
      const nextReceipt = requestHistoryRescueRehearsalDownload({ artifact, receipt });
      setReceipt(nextReceipt);
      if (nextReceipt.lastDeliveryAttempt?.outcome === 'failed') {
        setErrorMessage('浏览器没有完成下载请求，演练包仍只存在于当前页面内存中。');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '演练包下载失败。');
    } finally {
      setBusy(undefined);
    }
  };

  const handleConfirmExternalSave = () => {
    if (!receipt) return;
    try {
      setReceipt(confirmHistoryBackupExternalSave(receipt, Date.now()));
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法确认演练包已保存到 App 外。');
    }
  };

  const handleSelectExternalArchive = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !artifact) return;
    setErrorMessage(undefined);
    setSelectedExternalArchive(undefined);
    setSelectedExternalFileName(undefined);
    if (file.size > 1024 * 1024) {
      setErrorMessage('空载演练包不应超过 1 MB；这可能不是刚才生成的演练文件。');
      return;
    }
    try {
      const serializedArchive = await file.text();
      validateHistoryRescueRehearsalExternalArchive({ artifact, serializedArchive });
      setSelectedExternalArchive(serializedArchive);
      setSelectedExternalFileName(file.name);
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? `无法使用这份演练包：${error.message}`
        : '无法读取选中的演练包。');
    }
  };

  const handleVerifyRestore = async () => {
    const recoverySecret = recoverySecretRef.current;
    if (!artifact || !receipt || !recoverySecret || !selectedExternalArchive) {
      setErrorMessage('请重新选择刚才保存到 App 外的演练包，再开始恢复验证。');
      return;
    }
    setBusy('verifying');
    setErrorMessage(undefined);
    try {
      const verified = await verifyHistoryRescueRehearsal({
        artifact,
        receipt,
        recoverySecret,
        serializedExternalArchive: selectedExternalArchive,
      });
      setReceipt(verified.receipt);
      recoverySecretRef.current = undefined;
      setSelectedExternalArchive(undefined);
      setCleanupMessage(verified.temporaryDatabaseCleanup === 'completed'
        ? '隔离临时库已验证并清理；演练链路没有读取或写入生产数据库。'
        : '恢复验证已通过，但临时实验库清理失败，可在下次演练时重试清理。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '临时恢复验证失败。');
    } finally {
      setBusy(undefined);
    }
  };

  const generated = Boolean(receipt);
  const externalSaved = receiptHasExternalCopy(receipt);
  const restoreVerified = receipt?.status === 'restore_verified';
  const awaitingDownloadConfirmation = receipt?.lastDeliveryAttempt?.outcome === 'confirmation_required'
    && !receipt.externalCopyConfirmed;
  const secretConfirmed = receipt?.recoverySecretHandoff === 'user_confirmed';

  return (
    <section
      data-history-rescue-rehearsal="empty-synthetic"
      className="mt-4 rounded-[1.75rem] border border-white/90 bg-white/80 p-4 shadow-[0_16px_42px_rgba(99,102,241,0.10)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-indigo-500">
            <Key size={17} weight="duotone" />
            <span className="text-[10px] font-black tracking-[0.16em]">G0 · 加密救援演练</span>
          </div>
          <h2 className="mt-2 text-lg font-black text-slate-800">先用空盒子走完整条回家路</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            演练包只有 8 个空仓位、0 条聊天记录。它会真实加密、下载并恢复校验，但不能恢复你的真实对话。
          </p>
        </div>
        {restoreVerified && (
          <button
            type="button"
            onClick={resetRehearsal}
            className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-2 text-[9px] font-bold text-slate-500"
          >
            <ArrowClockwise size={13} /> 再演练
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        <ReceiptStep
          title="生成加密救援包"
          detail={generated
            ? 'AES-256-GCM 加密包已在当前页面内存中生成，恢复密钥不进入回执。'
            : '尚未生成；不会读取任何聊天仓或角色资料。'}
          status={generated ? 'complete' : 'current'}
          badge={generated ? '已生成' : '第一步'}
        />
        <ReceiptStep
          title="保存到 App 之外"
          detail={externalSaved
            ? '你已确认加密文件抵达浏览器下载目录或其他外部位置。'
            : awaitingDownloadConfirmation
              ? '下载已经触发，但需要你确认文件确实落在 App 外。'
              : '仅在页面内生成不算备份，下载动作本身也不会自动冒充成功。'}
          status={externalSaved ? 'complete' : generated ? 'current' : 'pending'}
          badge={externalSaved ? '已确认' : awaitingDownloadConfirmation ? '等你确认' : '未保存'}
        />
        <ReceiptStep
          title="临时数据库恢复验证"
          detail={restoreVerified
            ? '重新选择的外部文件已在隔离实验库中通过清单、计数和校验和验证。'
            : selectedExternalFileName
              ? `已重新读入 ${selectedExternalFileName}，可以开始隔离恢复。`
              : '只有外部副本与用户持有的密钥都确认后，才允许重新选文件验证。'}
          status={restoreVerified ? 'complete' : externalSaved ? 'current' : 'pending'}
          badge={restoreVerified ? '已验证' : '未验证'}
        />
      </div>

      {!generated && (
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busy === 'generating'}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
        >
          {busy === 'generating' ? <CircleNotch size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
          {busy === 'generating' ? '正在生成空载加密包…' : '开始空载安全演练'}
        </button>
      )}

      {generated && secretConfirmed && !awaitingDownloadConfirmation && !externalSaved && (
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy === 'downloading'}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
        >
          {busy === 'downloading' ? <CircleNotch size={17} className="animate-spin" /> : <DownloadSimple size={17} />}
          {busy === 'downloading' ? '正在交给浏览器…' : '下载空载加密演练包'}
        </button>
      )}

      {awaitingDownloadConfirmation && (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3.5">
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-700">
            <WarningCircle size={18} className="mt-0.5 shrink-0" />
            浏览器只告诉我们“下载已请求”，不能证明文件最终留在了哪里。请先在下载列表里确认文件存在。
          </div>
          <button
            type="button"
            onClick={handleConfirmExternalSave}
            className="mt-3 w-full rounded-xl bg-amber-600 px-3 py-3 text-xs font-bold text-white"
          >
            我确认文件已经保存到 App 外
          </button>
        </div>
      )}

      {externalSaved && !restoreVerified && (
        <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/75 p-3.5">
          <p className="text-[11px] leading-relaxed text-indigo-700">
            为了验证 App 外的副本，而不是页面内存，请重新选择刚才下载的 `.aetherrescue` 文件。
          </p>
          <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-3 text-xs font-bold text-indigo-600">
            <ClipboardText size={16} />
            {selectedExternalFileName ? '重新选择另一份演练包' : '选择刚才下载的演练包'}
            <input
              type="file"
              accept=".aetherrescue,application/vnd.aetheros.history-rescue+json"
              onChange={event => void handleSelectExternalArchive(event)}
              className="sr-only"
              aria-label="选择刚才下载的演练包"
            />
          </label>
          {selectedExternalFileName && (
            <p role="status" className="mt-2 break-all text-center text-[10px] text-emerald-600">
              已读入外部文件：{selectedExternalFileName}
            </p>
          )}
          {selectedExternalArchive && (
            <button
              type="button"
              onClick={() => void handleVerifyRestore()}
              disabled={busy === 'verifying'}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-200 disabled:opacity-60"
            >
              {busy === 'verifying' ? <CircleNotch size={17} className="animate-spin" /> : <CheckCircle size={17} />}
              {busy === 'verifying' ? '正在隔离临时库中恢复…' : '验证选中的外部副本可以恢复'}
            </button>
          )}
        </div>
      )}

      {restoreVerified && (
        <div role="status" className="mt-4 rounded-2xl bg-emerald-50 p-3.5 text-[11px] leading-relaxed text-emerald-700">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle size={18} weight="fill" /> G0 救援回执链演练通过
          </div>
          <p className="mt-1.5">{cleanupMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] leading-relaxed text-rose-600">
          <WarningCircle size={17} className="mt-0.5 shrink-0" /> {errorMessage}
        </div>
      )}

      {secretVisible && receipt && recoverySecretRef.current && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-recovery-secret-title"
            className="w-full max-w-md rounded-[2rem] border border-white/90 bg-white p-5 shadow-2xl"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Key size={25} weight="duotone" />
            </div>
            <h2 id="history-recovery-secret-title" className="mt-3 text-center text-lg font-black text-slate-800">
              恢复密钥只显示这一次
            </h2>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
              请把它保存到 AetherOS 之外。回执只记录“你是否确认持有”，永远不会保存这串密钥本身。
            </p>
            <code className="mt-4 block select-all break-all rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-center text-sm font-bold leading-relaxed text-indigo-700">
              {recoverySecretRef.current}
            </code>
            <button
              type="button"
              onClick={() => void handleCopySecret()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-600"
            >
              <ClipboardText size={16} />
              {clipboardState === 'copied' ? '已复制，但还需要你确认保存位置' : '复制恢复密钥'}
            </button>
            {clipboardState === 'failed' && (
              <p className="mt-2 text-center text-[10px] leading-relaxed text-amber-600">
                浏览器没有允许自动复制，请长按或选择上面的密钥手动复制。
              </p>
            )}
            <button
              type="button"
              onClick={handleConfirmSecretHeld}
              className="mt-3 w-full rounded-xl bg-slate-800 px-3 py-3.5 text-xs font-bold text-white"
            >
              我已把密钥保存在 App 外，隐藏它
            </button>
            <p className="mt-3 text-center text-[9px] leading-relaxed text-slate-400">
              隐藏后本轮演练不会再次显示。丢失它就只能重新生成一份新演练包。
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default HistoryRescueRehearsal;
