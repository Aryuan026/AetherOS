import React, { useEffect, useState } from 'react';
import {
  ClockCounterClockwise,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import type { HistoryScope, HistorySourceMessage } from '../../domain/historyImport/types';
import {
  historySourceMessageTimestamp,
  pageActiveHistoryChatTimeline,
} from '../../utils/historyImport/archive/chatTimeline';

interface ImportedHistoryTimelineProps {
  scope: HistoryScope;
  userName: string;
  characterName: string;
  onInitialLoaded?: (count: number) => void;
}

const PAGE_SIZE = 30;

const messageTime = (message: HistorySourceMessage): string => {
  const original = message.sourceTime.originalText
    ?.replace(/^timestamp\s*[:：]\s*/iu, '')
    .trim();
  if (original) return original;
  return new Date(historySourceMessageTimestamp(message)).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ImportedHistoryTimeline: React.FC<ImportedHistoryTimelineProps> = ({
  scope,
  userName,
  characterName,
  onInitialLoaded,
}) => {
  const [items, setItems] = useState<HistorySourceMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setCursor(undefined);
    setHasMore(false);
    setTotal(0);
    setLoading(true);
    setErrorMessage(undefined);
    void pageActiveHistoryChatTimeline({ scope, limit: PAGE_SIZE })
      .then(page => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
        onInitialLoaded?.(page.items.length);
      })
      .catch(error => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '暂时读不到旧日记录。');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    onInitialLoaded,
    scope.charId,
    scope.personaMaskId,
    scope.progressBundleId,
  ]);

  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setErrorMessage(undefined);
    try {
      const page = await pageActiveHistoryChatTimeline({
        scope,
        cursor,
        limit: PAGE_SIZE,
      });
      setItems(current => [...page.items, ...current]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotal(page.total);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时读不到更早的记录。');
    } finally {
      setLoadingOlder(false);
    }
  };

  if (loading) {
    return (
      <div className="relative z-10 mb-5 flex justify-center" data-imported-history-timeline="loading">
        <span className="inline-flex items-center gap-2 rounded-full border border-white bg-white/70 px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm backdrop-blur-sm">
          <SpinnerGap size={13} className="animate-spin" />
          正在打开旧日记录…
        </span>
      </div>
    );
  }

  if (items.length === 0 && !errorMessage) return null;

  return (
    <section className="relative z-10 mb-4" data-imported-history-timeline="ready">
      <div className="mx-3 mb-4 rounded-2xl border border-violet-100 bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[10px] font-black text-violet-600">
          <ClockCounterClockwise size={15} weight="duotone" />
          从旧日记录接上
          <span className="ml-auto rounded-full bg-violet-50 px-2 py-0.5 text-[8px] text-violet-500">
            共 {total} 条
          </span>
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
          这里按需分页显示；回复时只携带最近一小段，不会把整份文件都塞进对话。
        </p>
      </div>

      {hasMore && (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className="inline-flex items-center gap-2 rounded-full border border-white bg-white/70 px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm backdrop-blur-sm disabled:opacity-60"
          >
            {loadingOlder && <SpinnerGap size={12} className="animate-spin" />}
            再往前看 {Math.max(0, total - items.length)} 条
          </button>
        </div>
      )}

      <div className="space-y-3 px-3">
        {items.map(message => {
          const isUser = message.speakerRole === 'user';
          const isCharacter = message.speakerRole === 'character';
          if (!isUser && !isCharacter) {
            return (
              <div key={message.id} className="flex justify-center">
                <div className="max-w-[86%] rounded-xl bg-slate-500/10 px-3 py-2 text-center text-[10px] leading-relaxed text-slate-500 backdrop-blur-sm">
                  {message.content}
                </div>
              </div>
            );
          }
          return (
            <article key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[80%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className="mb-1 px-1 text-[8px] font-medium text-slate-500/80">
                  {isUser ? userName : characterName} · {messageTime(message)}
                </div>
                <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                  isUser
                    ? 'rounded-br-md bg-violet-500 text-white'
                    : 'rounded-bl-md border border-white/80 bg-white/90 text-slate-700 backdrop-blur-sm'
                }`}>
                  {message.content}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {errorMessage && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-amber-50/90 px-3 py-2 text-[9px] leading-relaxed text-amber-700">
          <WarningCircle size={13} className="mt-0.5 shrink-0" />
          {errorMessage}
        </div>
      )}

      <div className="mx-5 mt-5 flex items-center gap-3 text-[9px] font-bold text-slate-400">
        <span className="h-px flex-1 bg-slate-300/60" />
        旧记录到这里 · 从下方继续聊
        <span className="h-px flex-1 bg-slate-300/60" />
      </div>
    </section>
  );
};

export default ImportedHistoryTimeline;
