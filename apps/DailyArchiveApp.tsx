import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bookmarks,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import type {
  ConversationClipping,
  DailyArchiveCoverage,
  DailyArchiveMonthDay,
  DailyArchiveMessage,
  DailyArchiveMessagePage,
  DailyArchiveSearchHit,
  DailyArchiveSearchResponse,
} from '../domain/dailyArchive/types';
import {
  createConversationClipping,
  MAX_CONVERSATION_CLIPPING_MESSAGES,
} from '../domain/dailyArchive/clippings';
import type { HistoryScope } from '../domain/historyImport/types';
import {
  deleteConversationClipping,
  getDailyArchiveManifest,
  listConversationClippings,
  listDailyArchiveMonth,
  listUndatedDailyArchiveManifests,
  readDailyArchiveMessagePage,
  readDailyArchiveCoverage,
  readUndatedDailyArchiveMessagePage,
  saveConversationClipping,
  searchDailyArchiveMessages,
} from '../utils/dailyArchive/storage';
import { syncActiveHistoryToDailyArchive } from '../utils/dailyArchive/historySync';
import {
  getActivePersonaMask,
  normalizeUserPersonaProfile,
  switchUserPersonaMask,
} from '../utils/userPersonaMasks';
import AppHeader from '../components/shell/AppHeader';
import DailyArchiveReader, {
  type DailyArchiveReaderFocus,
  type DailyArchiveReaderSource,
} from '../components/daily-archive/DailyArchiveReader';
import ConversationClippingLibrary from '../components/daily-archive/ConversationClippingLibrary';

const PAGE_SIZE = 80;

const monthKeyFor = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

const shiftMonth = (monthKey: string, delta: number): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return monthKeyFor(new Date(year, month - 1 + delta, 1));
};

const formatCoverageDate = (dateKey?: string): string => {
  if (!dateKey) return '暂无日期';
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
};

const DailyArchiveApp: React.FC = () => {
  const {
    closeApp,
    characters,
    activeCharacterId,
    setActiveCharacterId,
    userProfile,
    updateUserProfile,
    addToast,
  } = useOS();
  const personaProfile = useMemo(() => normalizeUserPersonaProfile(userProfile), [userProfile]);
  const personaMasks = personaProfile.personaMasks || [];
  const activeMask = getActivePersonaMask(personaProfile);
  const character = characters.find(item => item.id === activeCharacterId) || characters[0];
  const scope = useMemo<HistoryScope | undefined>(() => {
    if (!character || !userProfile.activeProgressBundleId || !userProfile.activePersonaMaskId) return undefined;
    return {
      progressBundleId: userProfile.activeProgressBundleId,
      personaMaskId: userProfile.activePersonaMaskId,
      charId: character.id,
    };
  }, [character?.id, userProfile.activePersonaMaskId, userProfile.activeProgressBundleId]);
  const [monthKey, setMonthKey] = useState(() => monthKeyFor(new Date()));
  const [days, setDays] = useState<DailyArchiveMonthDay[]>([]);
  const [coverage, setCoverage] = useState<DailyArchiveCoverage>();
  const [selectedDateKey, setSelectedDateKey] = useState<string>();
  const [selectedUndatedKey, setSelectedUndatedKey] = useState<string>();
  const [selectedSource, setSelectedSource] = useState<DailyArchiveReaderSource>();
  const [readerFocus, setReaderFocus] = useState<DailyArchiveReaderFocus>();
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Map<string, DailyArchiveMessage>>(() => new Map());
  const [clippings, setClippings] = useState<ConversationClipping[]>([]);
  const [showClippingLibrary, setShowClippingLibrary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState<{ scanned: number; matched: number }>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showUndated, setShowUndated] = useState(false);
  const [showScopePicker, setShowScopePicker] = useState(false);
  const [pickerMaskId, setPickerMaskId] = useState(activeMask?.id || '');
  const initialMonthChosenRef = useRef(false);

  const pickerMask = personaMasks.find(mask => mask.id === pickerMaskId) || activeMask || personaMasks[0];
  const pickerLinkedCharacterIds = useMemo(
    () => new Set(pickerMask?.linkedCharacterIds || []),
    [pickerMask?.id, pickerMask?.linkedCharacterIds],
  );
  const pickerCharacters = useMemo(() => (
    [...characters].sort((left, right) => {
      const leftLinked = pickerLinkedCharacterIds.has(left.id) ? 1 : 0;
      const rightLinked = pickerLinkedCharacterIds.has(right.id) ? 1 : 0;
      if (leftLinked !== rightLinked) return rightLinked - leftLinked;
      return left.name.localeCompare(right.name, 'zh-CN');
    })
  ), [characters, pickerLinkedCharacterIds]);

  const openScopePicker = () => {
    setPickerMaskId(activeMask?.id || personaMasks[0]?.id || '');
    setShowScopePicker(true);
  };

  const switchRelationshipScope = (maskId: string, charId: string) => {
    const nextProfile = switchUserPersonaMask(personaProfile, maskId);
    const nextMask = nextProfile.personaMasks?.find(mask => mask.id === maskId);
    const nextCharacter = characters.find(item => item.id === charId);
    updateUserProfile(nextProfile);
    setActiveCharacterId(charId);
    setShowScopePicker(false);
    setReaderOpen(false);
    setShowClippingLibrary(false);
    addToast(`正在看 ${nextMask?.label || '面具'} × ${nextCharacter?.name || '角色'} 的日档`, 'success');
  };

  useEffect(() => {
    initialMonthChosenRef.current = false;
    setCoverage(undefined);
    setDays([]);
    setSelectedDateKey(undefined);
    setSelectedUndatedKey(undefined);
    setSelectedSource(undefined);
    setReaderFocus(undefined);
    setShowUndated(false);
    setReaderOpen(false);
    setSelectionMode(false);
    setSelectedMessages(new Map());
    setShowClippingLibrary(false);
  }, [scope?.progressBundleId, scope?.personaMaskId, scope?.charId]);

  useEffect(() => {
    if (!scope) {
      setClippings([]);
      return;
    }
    let cancelled = false;
    void listConversationClippings({ scope })
      .then(items => {
        if (!cancelled) setClippings(items);
      })
      .catch(error => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : '暂时打不开剪藏库。');
      });
    return () => {
      cancelled = true;
    };
  }, [scope?.progressBundleId, scope?.personaMaskId, scope?.charId]);

  useEffect(() => {
    if (!scope) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(undefined);
    void syncActiveHistoryToDailyArchive({
      scope,
      onProgress: progress => {
        if (!cancelled) setSyncProgress(progress);
      },
    })
      .then(async () => {
        const nextCoverage = await readDailyArchiveCoverage({ scope });
        if (cancelled) return;
        setCoverage(nextCoverage);
        if (!initialMonthChosenRef.current && nextCoverage.latestDateKey) {
          initialMonthChosenRef.current = true;
          setMonthKey(nextCoverage.latestDateKey.slice(0, 7));
        }
      })
      .catch(error => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : '暂时打不开本机日档。');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSyncProgress(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scope?.progressBundleId, scope?.personaMaskId, scope?.charId]);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    void listDailyArchiveMonth({ scope, monthKey })
      .then(summary => {
        if (cancelled) return;
        setDays(summary.days);
        setShowUndated(false);
        const nextSelected = summary.days.some(day => day.dateKey === selectedDateKey)
          ? selectedDateKey
          : summary.days[summary.days.length - 1]?.dateKey;
        setSelectedDateKey(nextSelected);
      })
      .catch(error => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : '暂时打不开这个月份。');
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey, scope?.progressBundleId, scope?.personaMaskId, scope?.charId, coverage?.messageCount]);

  useEffect(() => {
    if (!scope || !selectedDateKey || showUndated || !readerOpen) {
      if (!showUndated) setSelectedSource(undefined);
      return;
    }
    let cancelled = false;
    setReaderLoading(true);
    void getDailyArchiveManifest({ scope, dateKey: selectedDateKey })
      .then(manifest => {
        if (!cancelled) setSelectedSource(manifest ? {
          id: manifest.id,
          dateKey: manifest.dateKey,
          messageCount: manifest.messageCount,
        } : undefined);
      })
      .catch(error => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : '暂时打不开这一天。');
      })
      .finally(() => {
        if (!cancelled) setReaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readerOpen, selectedDateKey, showUndated, scope?.progressBundleId, scope?.personaMaskId, scope?.charId]);

  const openDatedReader = (dateKey: string) => {
    setShowUndated(false);
    setSelectedUndatedKey(undefined);
    setSelectedSource(undefined);
    setSelectedDateKey(dateKey);
    setReaderFocus(undefined);
    setSelectionMode(false);
    setSelectedMessages(new Map());
    setReaderOpen(true);
  };

  const closeReader = () => {
    setReaderOpen(false);
    setReaderLoading(false);
    setSelectionMode(false);
    setSelectedMessages(new Map());
    setReaderFocus(undefined);
  };

  const openUndated = async () => {
    if (!scope) return;
    setErrorMessage(undefined);
    setReaderLoading(true);
    setReaderOpen(true);
    setSelectedUndatedKey(undefined);
    setReaderFocus(undefined);
    setSelectionMode(false);
    setSelectedMessages(new Map());
    try {
      const manifests = await listUndatedDailyArchiveManifests({ scope });
      setSelectedSource({
        id: `undated-view:${scope.progressBundleId}:${scope.personaMaskId}:${scope.charId}`,
        messageCount: manifests.reduce((total, manifest) => total + manifest.messageCount, 0),
      });
      setShowUndated(true);
      setSelectedDateKey(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂时打不开未标日期记录。');
      setReaderOpen(false);
    } finally {
      setReaderLoading(false);
    }
  };

  const loadReaderPage = useCallback(async (offset: number, limit: number): Promise<DailyArchiveMessagePage> => {
    if (!scope) throw new Error('当前关系范围已经变化，请返回日历重试。');
    if (showUndated) {
      if (selectedUndatedKey) {
        const page = await readDailyArchiveMessagePage({
          scope,
          undatedKey: selectedUndatedKey,
          offset,
          limit,
        });
        if (!page) throw new Error('这段未标日期的日档暂时没有找到。');
        return page;
      }
      return readUndatedDailyArchiveMessagePage({ scope, offset, limit });
    }
    if (!selectedDateKey) throw new Error('这一天暂时没有可读取的日期。');
    const page = await readDailyArchiveMessagePage({ scope, dateKey: selectedDateKey, offset, limit });
    if (!page) throw new Error('这一天的日档暂时没有找到。');
    return page;
  }, [scope?.progressBundleId, scope?.personaMaskId, scope?.charId, selectedDateKey, selectedUndatedKey, showUndated]);

  const searchArchive = useCallback((query: string, signal: AbortSignal): Promise<DailyArchiveSearchResponse> => {
    if (!scope) return Promise.reject(new Error('先选择一个面具和角色。'));
    return searchDailyArchiveMessages({ scope, query, signal });
  }, [scope?.progressBundleId, scope?.personaMaskId, scope?.charId]);

  const openSearchHit = (hit: DailyArchiveSearchHit) => {
    setShowClippingLibrary(false);
    setSelectionMode(false);
    setSelectedMessages(new Map());
    setReaderFocus({
      requestId: Date.now(),
      messageId: hit.messageId,
      offset: hit.messageOffset,
    });
    setReaderOpen(true);
    setReaderLoading(false);
    if (hit.dateKey) {
      setShowUndated(false);
      setSelectedUndatedKey(undefined);
      setSelectedSource(undefined);
      setSelectedDateKey(hit.dateKey);
      setMonthKey(hit.dateKey.slice(0, 7));
      return;
    }
    setShowUndated(true);
    setSelectedDateKey(undefined);
    setSelectedUndatedKey(hit.undatedKey);
    setSelectedSource({
      id: hit.documentId,
      messageCount: hit.documentMessageCount,
    });
  };

  const toggleSelectedMessage = (message: DailyArchiveMessage) => {
    setSelectedMessages(current => {
      const next = new Map(current);
      if (next.has(message.id)) {
        next.delete(message.id);
        return next;
      }
      if (next.size >= MAX_CONVERSATION_CLIPPING_MESSAGES) {
        addToast(`每份剪藏最多 ${MAX_CONVERSATION_CLIPPING_MESSAGES} 条，可以分成几份保存`, 'info');
        return current;
      }
      next.set(message.id, message);
      return next;
    });
  };

  const saveCurrentClipping = async () => {
    if (!scope || !selectedSource) return;
    try {
      const clipping = createConversationClipping({
        scope,
        sourceDocument: {
          id: selectedSource.id,
          scope,
          dateKey: selectedSource.dateKey,
          messages: Array.from(selectedMessages.values()),
        },
        selectedMessageIds: selectedMessages.keys(),
      });
      await saveConversationClipping({ clipping });
      setClippings(current => [clipping, ...current.filter(item => item.id !== clipping.id)]);
      setSelectionMode(false);
      setSelectedMessages(new Map());
      addToast(`已把 ${clipping.messageCount} 条对话放进剪藏库`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这份剪藏暂时没保存下来。', 'error');
    }
  };

  const removeClipping = async (id: string) => {
    try {
      await deleteConversationClipping({ id });
      setClippings(current => current.filter(item => item.id !== id));
      addToast('这份剪藏已经从本机移除', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这份剪藏暂时删不掉。', 'error');
    }
  };

  const [year, month] = monthKey.split('-').map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const totalDays = new Date(year, month, 0).getDate();
  const dayByKey = new Map(days.map(day => [day.dateKey, day]));
  const selectedMessageIds = useMemo(() => new Set(selectedMessages.keys()), [selectedMessages]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f4f0fb] text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(196,181,253,0.34),transparent_34%),radial-gradient(circle_at_12%_42%,rgba(255,255,255,0.88),transparent_34%)]" />
      <AppHeader
        title="对话日历"
        subtitle="本机日档"
        onBack={closeApp}
        center
        titleClassName="truncate text-[16px] font-black text-slate-800"
        subtitleClassName="mt-0.5 truncate text-[9px] font-black tracking-[0.14em] text-violet-500"
        className="!border-white/70 !bg-white/58"
        right={(
          <button
            type="button"
            onClick={() => setShowClippingLibrary(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/76 text-violet-500 shadow-sm"
            aria-label="打开对话剪藏库"
          >
            <Bookmarks size={20} weight="duotone" />
            {clippings.length > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[7px] font-black text-white">
                {clippings.length > 99 ? '99+' : clippings.length}
              </span>
            )}
          </button>
        )}
      />

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-10 no-scrollbar">
        {!scope && (
          <div className="mt-8 rounded-3xl border border-white bg-white/80 p-5 text-center shadow-sm">
            <Archive size={30} className="mx-auto text-violet-400" weight="duotone" />
            <p className="mt-3 text-sm font-black">先选择一个面具和角色</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">日档会按当前关系范围分开保存，不会把不同角色混在一起。</p>
          </div>
        )}

        {scope && (
          <>
            <section className="rounded-[28px] border border-white/90 bg-white/78 p-4 shadow-[0_14px_38px_rgba(100,82,135,0.10)] backdrop-blur-xl">
              <button
                type="button"
                onClick={openScopePicker}
                className="flex w-full items-center gap-3 rounded-2xl text-left transition active:scale-[0.99]"
                aria-label="切换面具和角色关系"
              >
                <span className="relative h-12 w-14 shrink-0">
                  <img
                    src={activeMask?.avatar || userProfile.avatar}
                    alt=""
                    className="absolute left-0 top-0 h-10 w-10 rounded-2xl border-2 border-white object-cover shadow-sm"
                  />
                  {character?.avatar ? (
                    <img
                      src={character.avatar}
                      alt=""
                      className="absolute bottom-0 right-0 h-8 w-8 rounded-xl border-2 border-white object-cover shadow-sm"
                    />
                  ) : (
                    <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-xl border-2 border-white bg-violet-100 text-violet-600 shadow-sm">
                      <Archive size={15} weight="duotone" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-black">
                      {activeMask?.label || '当前面具'} × {character?.name || '当前角色'}
                    </h2>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black text-emerald-600">仅本机</span>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-violet-500">点这里切换要看的关系</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                  {loading ? <SpinnerGap size={15} className="animate-spin" /> : <CaretDown size={15} weight="bold" />}
                </span>
              </button>
              <div className="mt-3 rounded-2xl bg-white/65 px-3 py-2.5">
                <p className="text-[10px] leading-relaxed text-slate-500">
                  {coverage?.messageCount
                    ? `${coverage.messageCount.toLocaleString()} 条 · ${formatCoverageDate(coverage.earliestDateKey)}—${formatCoverageDate(coverage.latestDateKey)}`
                    : loading ? '正在整理按日 JSON 档案…' : '还没有可以按日期打开的对话。'}
                </p>
                {syncProgress && (
                  <p className="mt-1 text-[9px] font-bold text-violet-500">已检查 {syncProgress.scanned.toLocaleString()} 条，收进日档 {syncProgress.matched.toLocaleString()} 条</p>
                )}
              </div>
              {coverage && coverage.undatedMessageCount > 0 && (
                <button
                  type="button"
                  onClick={() => void openUndated()}
                  className="mt-3 flex w-full items-center justify-between rounded-2xl bg-amber-50 px-3 py-2.5 text-left"
                >
                  <span className="text-[10px] font-black text-amber-700">未标日期的记录</span>
                  <span className="text-[9px] font-bold text-amber-600">{coverage.undatedMessageCount} 条</span>
                </button>
              )}
            </section>

            <section className="mt-3 rounded-[28px] border border-white/90 bg-white/82 p-4 shadow-[0_14px_38px_rgba(100,82,135,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setMonthKey(current => shiftMonth(current, -1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                  <CaretLeft size={16} weight="bold" />
                </button>
                <div className="text-center">
                  <div className="text-[15px] font-black">{year} 年 {month} 月</div>
                  <div className="mt-0.5 text-[8px] font-bold tracking-[0.16em] text-slate-400">DAILY TRANSCRIPT</div>
                </div>
                <button type="button" onClick={() => setMonthKey(current => shiftMonth(current, 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-7 text-center text-[9px] font-black text-slate-400">
                {['日', '一', '二', '三', '四', '五', '六'].map(label => <span key={label}>{label}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-y-1">
                {Array.from({ length: firstWeekday }).map((_, index) => <span key={`pad-${index}`} />)}
                {Array.from({ length: totalDays }, (_, index) => index + 1).map(dayNumber => {
                  const dateKey = `${monthKey}-${String(dayNumber).padStart(2, '0')}`;
                  const day = dayByKey.get(dateKey);
                  const selected = selectedDateKey === dateKey && !showUndated;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={!day}
                      onClick={() => openDatedReader(dateKey)}
                      className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-2xl text-[11px] font-black transition ${
                        selected
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                          : day ? 'bg-violet-50 text-slate-700 active:scale-95' : 'text-slate-300'
                      }`}
                    >
                      {dayNumber}
                      {day && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-violet-500" />}
                    </button>
                  );
                })}
              </div>
              {days.length === 0 && !loading && (
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-center text-[10px] text-slate-400">这个月没有对话日档</p>
              )}
            </section>

            {errorMessage && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-[10px] leading-relaxed text-rose-700">
                <WarningCircle size={15} className="mt-0.5 shrink-0" />
                {errorMessage}
              </div>
            )}
          </>
        )}
      </main>

      {readerOpen && (
        <DailyArchiveReader
          source={selectedSource}
          loading={readerLoading}
          title={showUndated ? '未标日期' : formatCoverageDate(selectedDateKey || selectedSource?.dateKey)}
          userName={activeMask?.name || userProfile.name || '我'}
          characterName={character?.name || '角色'}
          pageSize={PAGE_SIZE}
          selectionMode={selectionMode}
          selectedMessageIds={selectedMessageIds}
          focus={readerFocus}
          loadPage={loadReaderPage}
          onBack={closeReader}
          onStartSelection={() => {
            setSelectionMode(true);
            setSelectedMessages(new Map());
          }}
          onCancelSelection={() => {
            setSelectionMode(false);
            setSelectedMessages(new Map());
          }}
          onToggleMessage={toggleSelectedMessage}
          onSaveClipping={() => void saveCurrentClipping()}
          onOpenLibrary={() => setShowClippingLibrary(true)}
        />
      )}

      {showClippingLibrary && (
        <ConversationClippingLibrary
          clippings={clippings}
          characterName={character?.name || '角色'}
          onClose={() => setShowClippingLibrary(false)}
          onDelete={id => void removeClipping(id)}
          onSearch={searchArchive}
          onOpenSearchHit={openSearchHit}
        />
      )}

      {showScopePicker && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-slate-950/28 backdrop-blur-[2px]"
          onClick={() => setShowScopePicker(false)}
        >
          <section
            className="max-h-[78%] w-full overflow-y-auto rounded-t-[32px] border-t border-white bg-[#fbf9ff] px-4 pb-8 pt-4 shadow-[0_-20px_60px_rgba(40,31,60,0.18)] no-scrollbar"
            onClick={event => event.stopPropagation()}
            aria-label="选择要看的关系"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-800">选择要看的关系</h2>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">先选面具，再点角色。切换只改变当前关系入口，不会合并或搬动日档。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowScopePicker(false)}
                className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-slate-500 shadow-sm"
              >
                完成
              </button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {personaMasks.map(mask => {
                const selected = pickerMask?.id === mask.id;
                return (
                  <button
                    key={mask.id}
                    type="button"
                    onClick={() => setPickerMaskId(mask.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                      selected
                        ? 'border-violet-200 bg-violet-600 text-white shadow-sm shadow-violet-200'
                        : 'border-slate-100 bg-white text-slate-600'
                    }`}
                  >
                    <img src={mask.avatar} alt="" className="h-8 w-8 rounded-xl object-cover" />
                    <span>
                      <span className="block max-w-28 truncate text-[11px] font-black">{mask.label}</span>
                      <span className={`block max-w-28 truncate text-[8px] font-bold ${selected ? 'text-violet-100' : 'text-slate-400'}`}>{mask.name || '未命名 user'}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-[11px] font-black text-slate-700">这个面具下的角色</h3>
              <span className="text-[9px] font-bold text-slate-400">
                {pickerLinkedCharacterIds.size > 0 ? '已链接角色排在前面' : '尚未链接，显示全部角色'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {pickerCharacters.map(item => {
                const linked = pickerLinkedCharacterIds.has(item.id);
                const current = pickerMask?.id === activeMask?.id && item.id === character?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickerMask && switchRelationshipScope(pickerMask.id, item.id)}
                    className={`relative flex min-w-0 items-center gap-2 rounded-2xl border p-2.5 text-left transition active:scale-[0.98] ${
                      current ? 'border-violet-200 bg-violet-50' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <img src={item.avatar} alt="" className="h-10 w-10 shrink-0 rounded-2xl object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-black text-slate-700">{item.name}</span>
                      <span className={`mt-0.5 block text-[8px] font-bold ${linked ? 'text-violet-500' : 'text-slate-400'}`}>
                        {linked ? '已链接关系' : '其他角色'}
                      </span>
                    </span>
                    {current && (
                      <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white">
                        <Check size={10} weight="bold" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {pickerCharacters.length === 0 && (
              <p className="mt-3 rounded-2xl bg-white px-3 py-4 text-center text-[10px] text-slate-400">还没有角色可以查看</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default DailyArchiveApp;
