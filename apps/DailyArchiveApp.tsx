import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bookmarks,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Sparkle,
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
  curateDailyArchiveMessages,
  addManualDailyArchiveMessages,
  confirmDailyArchiveDay,
  unlockDailyArchiveDay,
  type DailyArchiveCurationOperation,
  type DailyArchiveCurationResult,
  type DailyArchiveManualEntryDraft,
} from '../utils/dailyArchive/storage';
import { syncActiveHistoryToDailyArchive } from '../utils/dailyArchive/historySync';
import {
  getActivePersonaMask,
  normalizeUserPersonaProfile,
  switchUserPersonaMask,
} from '../utils/userPersonaMasks';
import AppHeader from '../components/shell/AppHeader';
import DailyArchiveReader, {
  type DailyArchiveCurationAction,
  type DailyArchiveReaderFocus,
  type DailyArchiveReaderSource,
  type DailyArchiveSelectionPurpose,
} from '../components/daily-archive/DailyArchiveReader';
import ConversationClippingLibrary from '../components/daily-archive/ConversationClippingLibrary';
import HistoryCompanionAnalysisSheet from '../components/daily-archive/HistoryCompanionAnalysisSheet';
import {
  consumeDailyArchiveNavigation,
  type DailyArchiveNavigationTarget,
} from '../utils/dailyArchive/navigation';

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
    apiConfig,
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
  const [selectionPurpose, setSelectionPurpose] = useState<DailyArchiveSelectionPurpose>();
  const [selectedMessages, setSelectedMessages] = useState<Map<string, DailyArchiveMessage>>(() => new Map());
  const [curationDialog, setCurationDialog] = useState<'edit' | 'role' | 'date' | 'merge_date' | 'delete'>();
  const [curationDraft, setCurationDraft] = useState('');
  const [curationBusy, setCurationBusy] = useState(false);
  const [manualDialog, setManualDialog] = useState(false);
  const [manualDrafts, setManualDrafts] = useState<Array<DailyArchiveManualEntryDraft & { id: string }>>([]);
  const [clippings, setClippings] = useState<ConversationClipping[]>([]);
  const [showClippingLibrary, setShowClippingLibrary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState<{ scanned: number; matched: number }>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showUndated, setShowUndated] = useState(false);
  const [showScopePicker, setShowScopePicker] = useState(false);
  const [showCompanionAnalysis, setShowCompanionAnalysis] = useState(false);
  const [pickerMaskId, setPickerMaskId] = useState(activeMask?.id || '');
  const initialMonthChosenRef = useRef(false);
  const pendingNavigationRef = useRef<DailyArchiveNavigationTarget | undefined>(undefined);
  const initializedScopeKeyRef = useRef('');

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
    setShowCompanionAnalysis(false);
    addToast(`正在看 ${nextMask?.label || '面具'} × ${nextCharacter?.name || '角色'} 的日档`, 'success');
  };

  useEffect(() => {
    const scopeKey = scope
      ? `${scope.progressBundleId}::${scope.personaMaskId}::${scope.charId}`
      : 'no-scope';
    if (initializedScopeKeyRef.current === scopeKey) return;
    initializedScopeKeyRef.current = scopeKey;
    initialMonthChosenRef.current = false;
    setCoverage(undefined);
    setDays([]);
    setSelectedDateKey(undefined);
    setSelectedUndatedKey(undefined);
    setSelectedSource(undefined);
    setReaderFocus(undefined);
    setShowUndated(false);
    setReaderOpen(false);
    setSelectionPurpose(undefined);
    setSelectedMessages(new Map());
    setShowClippingLibrary(false);
    if (scope) {
      const pending = consumeDailyArchiveNavigation(scope);
      pendingNavigationRef.current = pending;
      if (pending) {
        initialMonthChosenRef.current = true;
        setMonthKey(pending.dateKey.slice(0, 7));
      }
    } else {
      pendingNavigationRef.current = undefined;
    }
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
        const pending = pendingNavigationRef.current;
        const pendingDate = pending?.dateKey.slice(0, 7) === monthKey
          && summary.days.some(day => day.dateKey === pending.dateKey)
            ? pending.dateKey
            : undefined;
        const nextSelected = pendingDate || (summary.days.some(day => day.dateKey === selectedDateKey)
          ? selectedDateKey
          : summary.days[summary.days.length - 1]?.dateKey);
        setSelectedDateKey(nextSelected);
        if (pendingDate) {
          pendingNavigationRef.current = undefined;
          setSelectedUndatedKey(undefined);
          setSelectedSource(undefined);
          setReaderFocus(undefined);
          setSelectionPurpose(undefined);
          setSelectedMessages(new Map());
          setReaderOpen(true);
        }
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
          revisionToken: manifest.revision,
          dayConfirmation: manifest.dayConfirmation,
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
    setSelectionPurpose(undefined);
    setSelectedMessages(new Map());
    setReaderOpen(true);
  };

  const closeReader = () => {
    setReaderOpen(false);
    setReaderLoading(false);
    setSelectionPurpose(undefined);
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
    setSelectionPurpose(undefined);
    setSelectedMessages(new Map());
    try {
      const manifests = await listUndatedDailyArchiveManifests({ scope });
      setSelectedSource({
        id: `undated-view:${scope.progressBundleId}:${scope.personaMaskId}:${scope.charId}`,
        messageCount: manifests.reduce((total, manifest) => total + manifest.messageCount, 0),
        revisionToken: Date.now(),
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
    setSelectionPurpose(undefined);
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
      revisionToken: Date.now(),
    });
  };

  const startSelection = (purpose: DailyArchiveSelectionPurpose, initial?: DailyArchiveMessage) => {
    if (purpose === 'curation' && selectedSource?.dayConfirmation?.status === 'confirmed') {
      addToast('这一天已经锁定，解锁后才能继续整理', 'info');
      return;
    }
    setSelectionPurpose(purpose);
    setSelectedMessages(initial ? new Map([[initial.id, initial]]) : new Map());
  };

  const toggleSelectedMessage = (message: DailyArchiveMessage) => {
    setSelectedMessages(current => {
      const next = new Map(current);
      if (next.has(message.id)) {
        next.delete(message.id);
        return next;
      }
      const limit = selectionPurpose === 'clipping' ? MAX_CONVERSATION_CLIPPING_MESSAGES : 200;
      if (next.size >= limit) {
        addToast(`一次最多选择 ${limit} 条，可以分几次整理`, 'info');
        return current;
      }
      next.set(message.id, message);
      return next;
    });
  };

  const saveCurrentClipping = async () => {
    if (!scope || !selectedSource) return;
    try {
      const clippingMessages = Array.from(selectedMessages.values())
        .filter(message => message.role === 'user' || message.role === 'character');
      if (clippingMessages.length !== selectedMessages.size) {
        addToast('原文片段要先标成“我”或“角色”，才能作为语气素材剪藏', 'info');
        return;
      }
      const clipping = createConversationClipping({
        scope,
        sourceDocument: {
          id: selectedSource.id,
          scope,
          dateKey: selectedSource.dateKey,
          messages: clippingMessages,
        },
        selectedMessageIds: selectedMessages.keys(),
      });
      await saveConversationClipping({ clipping });
      setClippings(current => [clipping, ...current.filter(item => item.id !== clipping.id)]);
      setSelectionPurpose(undefined);
      setSelectedMessages(new Map());
      addToast(`已把 ${clipping.messageCount} 条对话放进剪藏库`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这份剪藏暂时没保存下来。', 'error');
    }
  };

  const refreshArchiveAfterCuration = async (result?: DailyArchiveCurationResult) => {
    if (!scope) return;
    if (result?.destinationDateKey) {
      const targetMonthKey = result.destinationDateKey.slice(0, 7);
      const [nextCoverage, nextMonth, manifest] = await Promise.all([
        readDailyArchiveCoverage({ scope }),
        listDailyArchiveMonth({ scope, monthKey: targetMonthKey }),
        getDailyArchiveManifest({ scope, dateKey: result.destinationDateKey }),
      ]);
      setCoverage(nextCoverage);
      setMonthKey(targetMonthKey);
      setDays(nextMonth.days);
      setShowUndated(false);
      setSelectedUndatedKey(undefined);
      setSelectedDateKey(result.destinationDateKey);
      setReaderOpen(true);
      if (manifest) {
        setSelectedSource({
          id: manifest.id,
          dateKey: manifest.dateKey,
          messageCount: manifest.messageCount,
          revisionToken: manifest.revision,
          dayConfirmation: manifest.dayConfirmation,
        });
      }
      if (result.primaryMessageId && result.destinationMessageOffset !== undefined) {
        setReaderFocus({
          requestId: Date.now(),
          messageId: result.primaryMessageId,
          offset: result.destinationMessageOffset,
        });
      }
      return;
    }
    const [nextCoverage, nextMonth] = await Promise.all([
      readDailyArchiveCoverage({ scope }),
      listDailyArchiveMonth({ scope, monthKey }),
    ]);
    setCoverage(nextCoverage);
    setDays(nextMonth.days);
    if (!readerOpen) return;
    if (showUndated) {
      if (selectedUndatedKey) {
        const manifest = await getDailyArchiveManifest({ scope, undatedKey: selectedUndatedKey });
        if (!manifest || manifest.messageCount === 0) {
          closeReader();
          return;
        }
        setSelectedSource({
          id: manifest.id,
          messageCount: manifest.messageCount,
          revisionToken: manifest.revision,
          dayConfirmation: manifest.dayConfirmation,
        });
        return;
      }
      const manifests = await listUndatedDailyArchiveManifests({ scope });
      const messageCount = manifests.reduce((total, manifest) => total + manifest.messageCount, 0);
      if (messageCount === 0) {
        closeReader();
        return;
      }
      setSelectedSource({
        id: `undated-view:${scope.progressBundleId}:${scope.personaMaskId}:${scope.charId}`,
        messageCount,
        revisionToken: Date.now(),
      });
      return;
    }
    if (!selectedDateKey) return;
    const manifest = await getDailyArchiveManifest({ scope, dateKey: selectedDateKey });
    if (!manifest || manifest.messageCount === 0) {
      closeReader();
      return;
    }
    setSelectedSource({
      id: manifest.id,
      dateKey: manifest.dateKey,
      messageCount: manifest.messageCount,
      revisionToken: manifest.revision,
      dayConfirmation: manifest.dayConfirmation,
    });
  };

  const applyCuration = async (operation: DailyArchiveCurationOperation, successMessage: string) => {
    if (!scope || selectedMessages.size === 0 || curationBusy) return;
    setCurationBusy(true);
    try {
      const result = await curateDailyArchiveMessages({
        scope,
        messages: Array.from(selectedMessages.values()),
        operation,
      });
      setCurationDialog(undefined);
      setSelectionPurpose(undefined);
      setSelectedMessages(new Map());
      await refreshArchiveAfterCuration(result);
      addToast(successMessage, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这次整理暂时没有保存下来。', 'error');
    } finally {
      setCurationBusy(false);
    }
  };

  const handleCurationAction = (action: DailyArchiveCurationAction) => {
    const messages = Array.from(selectedMessages.values());
    if (messages.length === 0) return;
    if (action === 'clip') {
      void saveCurrentClipping();
      return;
    }
    if (action === 'edit') {
      setCurationDraft(messages[0]?.content || '');
      setCurationDialog('edit');
      return;
    }
    if (action === 'role') {
      setCurationDialog('role');
      return;
    }
    if (action === 'date') {
      setCurationDraft(selectedDateKey || new Date().toISOString().slice(0, 10));
      setCurationDialog('date');
      return;
    }
    if (action === 'delete') {
      setCurationDialog('delete');
      return;
    }
    if (action === 'merge') {
      if (showUndated) {
        setCurationDraft(new Date().toISOString().slice(0, 10));
        setCurationDialog('merge_date');
      } else {
        void applyCuration({ kind: 'merge' }, `已把 ${messages.length} 条原文合成一段`);
      }
      return;
    }
  };

  const openManualDialog = () => {
    if (!selectedDateKey || selectedSource?.dayConfirmation?.status === 'confirmed') return;
    setManualDrafts([{ id: `draft-${Date.now()}`, role: 'unknown', content: '' }]);
    setManualDialog(true);
  };

  const saveManualDrafts = async () => {
    if (!scope || !selectedDateKey || curationBusy) return;
    setCurationBusy(true);
    try {
      const saved = await addManualDailyArchiveMessages({
        scope,
        dateKey: selectedDateKey,
        entries: manualDrafts,
      });
      setManualDialog(false);
      setManualDrafts([]);
      await refreshArchiveAfterCuration({
        affectedDocumentIds: [saved.documentId],
        activeMessageIds: saved.messageIds,
        destinationDateKey: selectedDateKey,
        primaryMessageId: saved.messageIds[0],
        destinationMessageOffset: saved.firstMessageOffset,
      });
      addToast(`已补录 ${saved.messageIds.length} 条；锁定当天后会成为已确认历史`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '补录暂时没有保存下来。', 'error');
    } finally {
      setCurationBusy(false);
    }
  };

  const setDayLocked = async (locked: boolean) => {
    if (!scope || !selectedDateKey || curationBusy) return;
    setCurationBusy(true);
    try {
      if (locked) {
        await confirmDailyArchiveDay({ scope, dateKey: selectedDateKey });
      } else {
        await unlockDailyArchiveDay({ scope, dateKey: selectedDateKey });
      }
      setSelectionPurpose(undefined);
      setSelectedMessages(new Map());
      await refreshArchiveAfterCuration();
      addToast(
        locked
          ? '这一天已锁定；补录内容已成为确认过的历史来源'
          : '这一天已解锁，可以继续补录和整理',
        'success',
      );
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这一天的状态暂时没有保存下来。', 'error');
    } finally {
      setCurationBusy(false);
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

            <button
              type="button"
              onClick={() => setShowCompanionAnalysis(true)}
              disabled={!coverage?.messageCount || loading}
              className="mt-3 flex w-full items-center gap-3 rounded-[26px] border border-violet-100 bg-gradient-to-br from-white/94 to-violet-50/88 p-4 text-left shadow-[0_14px_38px_rgba(100,82,135,0.08)] transition active:scale-[0.99] disabled:opacity-45"
              aria-label="整理旧日角色素材"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-200">
                <Sparkle size={20} weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-black text-slate-800">让旧记录帮助角色接上你</span>
                <span className="mt-1 block text-[9px] leading-relaxed text-slate-500">
                  自动提炼表达习惯和稳定细节；先估算用量，再由你开始。
                </span>
              </span>
              <CaretRight size={15} className="shrink-0 text-violet-400" weight="bold" />
            </button>

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
          selectionPurpose={selectionPurpose}
          selectedMessageIds={selectedMessageIds}
          focus={readerFocus}
          loadPage={loadReaderPage}
          onBack={closeReader}
          onStartSelection={startSelection}
          onCancelSelection={() => {
            setSelectionPurpose(undefined);
            setSelectedMessages(new Map());
          }}
          onToggleMessage={toggleSelectedMessage}
          onSaveClipping={() => void saveCurrentClipping()}
          onCurationAction={handleCurationAction}
          onOpenLibrary={() => setShowClippingLibrary(true)}
          onAddManual={openManualDialog}
          onConfirmDay={() => void setDayLocked(true)}
          onUnlockDay={() => void setDayLocked(false)}
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

      {showCompanionAnalysis && scope && (
        <HistoryCompanionAnalysisSheet
          scope={scope}
          relationshipLabel={`${activeMask?.label || '当前面具'} × ${character?.name || '当前角色'}`}
          coverage={coverage}
          apiConfig={apiConfig}
          onClose={() => setShowCompanionAnalysis(false)}
          onComplete={result => {
            if (result.status === 'published') {
              addToast(
                `已保留 ${result.approvedMaterialCount} 条可靠方向，从下一轮聊天起按需参与`,
                'success',
              );
              return;
            }
            addToast('这次没有硬凑新结论，旧记录仍完整留在日历里', 'info');
          }}
        />
      )}

      {curationDialog && (
        <div
          className="absolute inset-0 z-[60] flex items-end bg-slate-950/30 backdrop-blur-[2px]"
          onClick={() => !curationBusy && setCurationDialog(undefined)}
        >
          <section
            className="w-full rounded-t-[30px] border-t border-white bg-[#fbf9ff] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-20px_60px_rgba(40,31,60,0.20)]"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <h2 className="text-base font-black text-slate-800">
              {curationDialog === 'edit' && '修改这段原文'}
              {curationDialog === 'role' && '这是谁说的'}
              {curationDialog === 'date' && '归入哪一天'}
              {curationDialog === 'merge_date' && '合并并归入哪一天'}
              {curationDialog === 'delete' && '删除选中的记录'}
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              {curationDialog === 'delete'
                ? `将隐藏 ${selectedMessages.size} 条日档记录；原始导入来源仍保留在本机档案中。`
                : '这次校正只整理历史档案，不会把旧事变成角色的当前状态。'}
            </p>

            {curationDialog === 'edit' && (
              <textarea
                value={curationDraft}
                onChange={event => setCurationDraft(event.target.value)}
                rows={7}
                autoFocus
                className="mt-4 w-full resize-none rounded-2xl border border-violet-100 bg-white px-3 py-3 text-[12px] leading-relaxed text-slate-700 outline-none focus:border-violet-300"
              />
            )}

            {(curationDialog === 'date' || curationDialog === 'merge_date') && (
              <input
                type="date"
                value={curationDraft}
                onChange={event => setCurationDraft(event.target.value)}
                className="mt-4 w-full rounded-2xl border border-violet-100 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-violet-300"
              />
            )}

            {curationDialog === 'role' && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {([
                  ['user', '我'],
                  ['character', character?.name || '角色'],
                  ['unknown', '原文片段'],
                ] as const).map(([role, label]) => (
                  <button
                    key={role}
                    type="button"
                    disabled={curationBusy}
                    onClick={() => void applyCuration({ kind: 'set_role', role }, `已归入“${label}”`)}
                    className="rounded-2xl bg-white px-2 py-3 text-[11px] font-black text-violet-600 shadow-sm disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {curationDialog !== 'role' && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={curationBusy}
                  onClick={() => setCurationDialog(undefined)}
                  className="flex-1 rounded-2xl bg-slate-100 py-3 text-[11px] font-black text-slate-500 disabled:opacity-50"
                >
                  返回
                </button>
                <button
                  type="button"
                  disabled={curationBusy || (curationDialog !== 'delete' && !curationDraft.trim())}
                  onClick={() => {
                    if (curationDialog === 'edit') {
                      void applyCuration({ kind: 'edit_content', content: curationDraft }, '原文已经修改');
                    } else if (curationDialog === 'date') {
                      void applyCuration({ kind: 'set_date', dateKey: curationDraft }, `已归入 ${curationDraft}`);
                    } else if (curationDialog === 'merge_date') {
                      void applyCuration(
                        { kind: 'merge_and_set_date', dateKey: curationDraft },
                        `已合并 ${selectedMessages.size} 条并归入 ${curationDraft}`,
                      );
                    } else {
                      void applyCuration({ kind: 'delete' }, `已删除 ${selectedMessages.size} 条日档记录`);
                    }
                  }}
                  className={`flex-1 rounded-2xl py-3 text-[11px] font-black text-white shadow-lg disabled:bg-slate-200 disabled:shadow-none ${
                    curationDialog === 'delete' ? 'bg-rose-500 shadow-rose-100' : 'bg-violet-600 shadow-violet-200'
                  }`}
                >
                  {curationBusy
                    ? '正在保存…'
                    : curationDialog === 'delete'
                      ? '确认删除'
                      : curationDialog === 'merge_date'
                        ? '合并并归入'
                        : '保存修改'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {manualDialog && (
        <div
          className="absolute inset-0 z-[60] flex items-end bg-slate-950/30 backdrop-blur-[2px]"
          onClick={() => !curationBusy && setManualDialog(false)}
        >
          <section
            className="max-h-[82%] w-full overflow-y-auto rounded-t-[30px] border-t border-white bg-[#fbf9ff] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-20px_60px_rgba(40,31,60,0.20)] no-scrollbar"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <h2 className="text-base font-black text-slate-800">补录 {formatCoverageDate(selectedDateKey)}</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              先作为可编辑草稿放进这一天；锁定当天后，才会进入已确认的人工历史来源。
            </p>
            <div className="mt-4 space-y-3">
              {manualDrafts.map((draft, index) => (
                <div key={draft.id} className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    {([['user', '我'], ['character', character?.name || '角色'], ['unknown', '原文片段']] as const).map(([role, label]) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setManualDrafts(current => current.map(item => (
                          item.id === draft.id ? { ...item, role } : item
                        )))}
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black ${
                          draft.role === role ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-500'
                        }`}
                      >{label}</button>
                    ))}
                    {manualDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setManualDrafts(current => current.filter(item => item.id !== draft.id))}
                        className="ml-auto text-[9px] font-black text-rose-500"
                      >移除</button>
                    )}
                  </div>
                  <textarea
                    value={draft.content}
                    onChange={event => setManualDrafts(current => current.map(item => (
                      item.id === draft.id ? { ...item, content: event.target.value } : item
                    )))}
                    rows={4}
                    autoFocus={index === 0}
                    placeholder="写下要补进这一天的原话或片段…"
                    className="mt-2 w-full resize-none rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setManualDrafts(current => [
                ...current,
                { id: `draft-${Date.now()}-${current.length}`, role: 'unknown', content: '' },
              ])}
              disabled={manualDrafts.length >= 50}
              className="mt-3 w-full rounded-2xl border border-dashed border-violet-200 py-2.5 text-[10px] font-black text-violet-500 disabled:opacity-40"
            >再补一条</button>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={curationBusy}
                onClick={() => setManualDialog(false)}
                className="flex-1 rounded-2xl bg-slate-100 py-3 text-[11px] font-black text-slate-500"
              >返回</button>
              <button
                type="button"
                disabled={curationBusy || manualDrafts.every(draft => !draft.content.trim())}
                onClick={() => void saveManualDrafts()}
                className="flex-1 rounded-2xl bg-violet-600 py-3 text-[11px] font-black text-white shadow-lg shadow-violet-200 disabled:bg-slate-200 disabled:shadow-none"
              >{curationBusy ? '正在保存…' : '保存补录草稿'}</button>
            </div>
          </section>
        </div>
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
