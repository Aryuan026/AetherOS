import React, { useState } from 'react';
import { useOS } from '../../context/OSContext';
import Modal from './Modal';

const SystemErrorIndicator: React.FC = () => {
  const { systemLogs, clearLogs } = useOS();
  const [showLogModal, setShowLogModal] = useState(false);
  const hasError = systemLogs.length > 0;

  return (
    <>
      {hasError && (
        <button
          type="button"
          data-shell-error-indicator
          onClick={() => setShowLogModal(true)}
          className="pointer-events-auto self-center z-[65] flex animate-pulse items-center gap-1.5 rounded-full border border-white/20 bg-red-500/90 px-4 py-1.5 text-[10px] font-bold text-white shadow-lg backdrop-blur-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <span>SYSTEM ERROR</span>
        </button>
      )}

      <Modal
        isOpen={showLogModal}
        title="系统调试终端"
        onClose={() => setShowLogModal(false)}
        footer={(
          <div className="flex w-full gap-2">
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(systemLogs, null, 2))} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-600">复制 JSON</button>
            <button onClick={clearLogs} className="flex-1 rounded-xl bg-red-500 py-3 font-bold text-white shadow-lg shadow-red-200">清空日志</button>
          </div>
        )}
      >
        <div className="h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-900 p-3 font-mono text-[10px] shadow-inner no-scrollbar">
          {systemLogs.length === 0 ? (
            <div className="mt-20 text-center text-slate-500">系统运行正常，暂无错误日志。</div>
          ) : systemLogs.map(log => (
            <div key={log.id} className="mb-2 border-b border-white/10 pb-2 last:mb-0 last:border-0 last:pb-0">
              <div className="mb-1 flex items-start justify-between text-white/50">
                <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`font-bold uppercase ${log.type === 'error' ? 'text-red-400' : 'text-orange-400'}`}>{log.type}</span>
              </div>
              <div className="mb-1 break-words font-bold text-white">{log.message}</div>
              {log.detail && <pre className="break-all whitespace-pre-wrap rounded bg-black/30 p-2 text-slate-400">{log.detail}</pre>}
              <div className="mt-1 text-right text-white/30">Src: {log.source}</div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};

export default SystemErrorIndicator;
