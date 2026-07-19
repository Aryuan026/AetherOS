import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    BookmarkSimple,
    Bookmarks,
    CalendarBlank,
    Check,
    ClockCounterClockwise,
    LockKey,
    LockOpen,
    NotePencil,
    PencilSimple,
    Trash,
    UserSwitch,
    ArrowsMerge,
    SpinnerGap,
    Plus,
    X,
} from '@phosphor-icons/react';
import type {
    DailyArchiveDayConfirmation,
    DailyArchiveMessage,
    DailyArchiveMessagePage,
} from '../../domain/dailyArchive/types';
import AppHeader from '../shell/AppHeader';

const ESTIMATED_MESSAGE_HEIGHT = 92;
const MAX_CACHED_PAGES = 5;

const trimPageCache = (
    source: Map<number, DailyArchiveMessage[]>,
    anchorPage: number,
): Map<number, DailyArchiveMessage[]> => {
    if (source.size <= MAX_CACHED_PAGES) return source;
    const next = new Map(source);
    Array.from(next.keys())
        .sort((left, right) => Math.abs(right - anchorPage) - Math.abs(left - anchorPage))
        .slice(0, next.size - MAX_CACHED_PAGES)
        .forEach(pageIndex => next.delete(pageIndex));
    return next;
};

const messageTime = (message: DailyArchiveMessage): string => {
    const source = message.time.originalText?.replace(/^timestamp\s*[:：]\s*/iu, '').trim();
    if (source) return source;
    if (message.time.epochMs) {
        return new Date(message.time.epochMs).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    return '原文未标时间';
};

export interface DailyArchiveReaderSource {
    id: string;
    dateKey?: string;
    messageCount: number;
    revisionToken?: number;
    dayConfirmation?: DailyArchiveDayConfirmation;
}

export type DailyArchiveSelectionPurpose = 'clipping' | 'curation';
export type DailyArchiveCurationAction = 'clip' | 'edit' | 'merge' | 'role' | 'date' | 'delete';

export interface DailyArchiveReaderFocus {
    requestId: number;
    messageId: string;
    offset: number;
}

interface DailyArchiveReaderProps {
    source?: DailyArchiveReaderSource;
    loading: boolean;
    title: string;
    userName: string;
    characterName: string;
    pageSize: number;
    selectionPurpose?: DailyArchiveSelectionPurpose;
    selectedMessageIds: Set<string>;
    focus?: DailyArchiveReaderFocus;
    loadPage: (offset: number, limit: number) => Promise<DailyArchiveMessagePage>;
    onBack: () => void;
    onStartSelection: (purpose: DailyArchiveSelectionPurpose, initial?: DailyArchiveMessage) => void;
    onCancelSelection: () => void;
    onToggleMessage: (message: DailyArchiveMessage) => void;
    onSaveClipping: () => void;
    onCurationAction: (action: DailyArchiveCurationAction) => void;
    onOpenLibrary: () => void;
    onAddManual: () => void;
    onConfirmDay: () => void;
    onUnlockDay: () => void;
}

interface VirtualMessagePageProps {
    pageIndex: number;
    messages: DailyArchiveMessage[];
    top: number;
    userName: string;
    characterName: string;
    selectionPurpose?: DailyArchiveSelectionPurpose;
    selectedMessageIds: Set<string>;
    focusMessageId?: string;
    onToggleMessage: (message: DailyArchiveMessage) => void;
    onStartCuration: (message: DailyArchiveMessage) => void;
    onMeasure: (pageIndex: number, height: number) => void;
    curationLocked: boolean;
}

const VirtualMessagePage: React.FC<VirtualMessagePageProps> = ({
    pageIndex,
    messages,
    top,
    userName,
    characterName,
    selectionPurpose,
    selectedMessageIds,
    focusMessageId,
    onToggleMessage,
    onStartCuration,
    onMeasure,
    curationLocked,
}) => {
    const pageRef = useRef<HTMLDivElement>(null);
    const longPressTimerRef = useRef<number>();
    const longPressedMessageRef = useRef<string>();

    useEffect(() => {
        const element = pageRef.current;
        if (!element) return;
        const report = () => onMeasure(pageIndex, Math.max(1, Math.ceil(element.getBoundingClientRect().height)));
        report();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(report);
        observer.observe(element);
        return () => observer.disconnect();
    }, [messages, onMeasure, pageIndex]);

    return (
        <div
            ref={pageRef}
            className="absolute inset-x-0 space-y-3 pb-4"
            style={{ transform: `translateY(${top}px)` }}
            data-page-index={pageIndex}
        >
            {messages.map(message => {
                const isUser = message.role === 'user';
                const isCharacter = message.role === 'character';
                const selectable = isUser || isCharacter;
                const selected = selectedMessageIds.has(message.id);
                const focused = focusMessageId === message.id;
                const canSelect = selectionPurpose === 'curation' || selectable;
                const startLongPress = () => {
                    if (selectionPurpose || curationLocked) return;
                    if (longPressTimerRef.current !== undefined) window.clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = window.setTimeout(() => {
                        longPressedMessageRef.current = message.id;
                        onStartCuration(message);
                    }, 520);
                };
                const cancelLongPress = () => {
                    if (longPressTimerRef.current !== undefined) window.clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = undefined;
                };
                const handleMessageClick = () => {
                    if (longPressedMessageRef.current === message.id) {
                        longPressedMessageRef.current = undefined;
                        return;
                    }
                    if (selectionPurpose && canSelect) onToggleMessage(message);
                };
                if (!selectable) {
                    const sourceLabel = message.role === 'system' ? '来源说明' : '原文片段';
                    return (
                        <div key={message.id} className="flex justify-center">
                            <button
                                type="button"
                                onPointerDown={startLongPress}
                                onPointerUp={cancelLongPress}
                                onPointerCancel={cancelLongPress}
                                onPointerLeave={cancelLongPress}
                                onClick={handleMessageClick}
                                className={`max-w-[88%] rounded-2xl bg-slate-100 px-3 py-2 text-left text-[10px] leading-relaxed text-slate-500 ${selected ? 'ring-2 ring-violet-400' : ''}`}
                            >
                                <div className="mb-1 text-[8px] font-black tracking-wide text-slate-400">
                                    {selectionPurpose === 'curation' && (
                                        <span className={`mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full border align-middle ${
                                            selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-transparent'
                                        }`}><Check size={10} weight="bold" /></span>
                                    )}
                                    {sourceLabel}
                                    {message.manualEntry && (
                                        <span className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[7px] ${
                                            message.manualEntry.status === 'confirmed'
                                                ? 'bg-emerald-50 text-emerald-600'
                                                : 'bg-amber-50 text-amber-600'
                                        }`}>{message.manualEntry.status === 'confirmed' ? '补录已确认' : '补录草稿'}</span>
                                    )}
                                </div>
                                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                            </button>
                        </div>
                    );
                }
                return (
                    <article
                        key={message.id}
                        className={`relative flex ${isUser ? 'justify-end' : 'justify-start'}`}
                        data-focus-message={focused ? 'true' : undefined}
                    >
                        <button
                            type="button"
                            onPointerDown={startLongPress}
                            onPointerUp={cancelLongPress}
                            onPointerCancel={cancelLongPress}
                            onPointerLeave={cancelLongPress}
                            onClick={handleMessageClick}
                            className={`relative max-w-[88%] text-left transition ${
                                selectionPurpose ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
                            } ${isUser ? 'text-right' : 'text-left'}`}
                            aria-pressed={selectionPurpose ? selected : undefined}
                        >
                            <div className="mb-1 flex items-center gap-1 px-1 text-[8px] font-bold text-slate-400">
                                {selectionPurpose && (
                                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                        selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-transparent'
                                    }`}>
                                        <Check size={10} weight="bold" />
                                    </span>
                                )}
                                <span>{isUser ? userName || '我' : characterName || '角色'} · {messageTime(message)}</span>
                                {message.manualEntry && (
                                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[7px] font-black ${
                                        message.manualEntry.status === 'confirmed'
                                            ? 'bg-emerald-50 text-emerald-600'
                                            : 'bg-amber-50 text-amber-600'
                                    }`}>{message.manualEntry.status === 'confirmed' ? '补录已确认' : '补录草稿'}</span>
                                )}
                            </div>
                            <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed shadow-sm ring-offset-2 transition ${
                                isUser
                                    ? 'rounded-br-md bg-violet-600 text-white'
                                    : 'rounded-bl-md border border-slate-100 bg-white text-slate-700'
                            } ${selected ? 'ring-2 ring-violet-400' : focused ? 'ring-2 ring-amber-300' : ''}`}>
                                {message.content}
                            </div>
                        </button>
                    </article>
                );
            })}
        </div>
    );
};

const DailyArchiveReader: React.FC<DailyArchiveReaderProps> = ({
    source,
    loading,
    title,
    userName,
    characterName,
    pageSize,
    selectionPurpose,
    selectedMessageIds,
    focus,
    loadPage,
    onBack,
    onStartSelection,
    onCancelSelection,
    onToggleMessage,
    onSaveClipping,
    onCurationAction,
    onOpenLibrary,
    onAddManual,
    onConfirmDay,
    onUnlockDay,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const pagesRef = useRef(new Map<number, DailyArchiveMessage[]>());
    const loadingPagesRef = useRef(new Set<string>());
    const sourceIdRef = useRef(source?.id);
    const currentPageRef = useRef(0);
    const scrollFrameRef = useRef<number>();
    const pendingScrollPageRef = useRef<number>();
    const [pages, setPages] = useState<Map<number, DailyArchiveMessage[]>>(() => new Map());
    const [pageHeights, setPageHeights] = useState<Map<number, number>>(() => new Map());
    const [currentPage, setCurrentPage] = useState(0);
    const [pageError, setPageError] = useState<string>();
    const [failedPageIndex, setFailedPageIndex] = useState<number>();
    const pageCount = source ? Math.ceil(source.messageCount / pageSize) : 0;
    const dayLocked = source?.dayConfirmation?.status === 'confirmed';
    sourceIdRef.current = source?.id;
    currentPageRef.current = currentPage;

    const estimatedPageHeight = useCallback((pageIndex: number): number => {
        const count = source
            ? Math.min(pageSize, Math.max(0, source.messageCount - pageIndex * pageSize))
            : pageSize;
        return Math.max(180, count * ESTIMATED_MESSAGE_HEIGHT);
    }, [pageSize, source?.messageCount]);

    const pageLayout = useMemo(() => {
        const offsets: number[] = [];
        let totalHeight = 0;
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
            offsets.push(totalHeight);
            totalHeight += pageHeights.get(pageIndex) ?? estimatedPageHeight(pageIndex);
        }
        return { offsets, totalHeight };
    }, [estimatedPageHeight, pageCount, pageHeights]);

    const loadPageIndex = useCallback(async (pageIndex: number) => {
        if (!source || pageIndex < 0 || pageIndex >= pageCount) return;
        const sourceId = source.id;
        const loadKey = `${sourceId}:${pageIndex}`;
        if (pagesRef.current.has(pageIndex) || loadingPagesRef.current.has(loadKey)) return;
        loadingPagesRef.current.add(loadKey);
        setPageError(undefined);
        setFailedPageIndex(undefined);
        try {
            const page = await loadPage(pageIndex * pageSize, pageSize);
            if (sourceIdRef.current !== sourceId) return;
            if (page.documentId !== sourceId) throw new Error('日档分页来源发生变化，请返回日历重试。');
            pagesRef.current = trimPageCache(
                new Map(pagesRef.current).set(pageIndex, page.messages),
                currentPageRef.current,
            );
            setPages(new Map(pagesRef.current));
        } catch (error) {
            if (sourceIdRef.current !== sourceId) return;
            setPageError(error instanceof Error ? error.message : '这一小段暂时没有铺开。');
            setFailedPageIndex(pageIndex);
        } finally {
            loadingPagesRef.current.delete(loadKey);
        }
    }, [loadPage, pageCount, pageSize, source?.id]);

    useEffect(() => {
        pagesRef.current = new Map();
        loadingPagesRef.current.clear();
        setPages(new Map());
        setPageHeights(new Map());
        setCurrentPage(0);
        pendingScrollPageRef.current = 0;
        setPageError(undefined);
        setFailedPageIndex(undefined);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [source?.id, source?.messageCount, source?.revisionToken]);

    useEffect(() => {
        if (!source || !focus || source.messageCount === 0) return;
        const pageIndex = Math.min(
            Math.max(0, Math.floor(focus.offset / pageSize)),
            Math.max(0, pageCount - 1),
        );
        pendingScrollPageRef.current = pageIndex;
        setCurrentPage(pageIndex);
    }, [focus?.requestId, pageCount, pageSize, source?.id, source?.messageCount]);

    useEffect(() => {
        const pageIndex = pendingScrollPageRef.current;
        const element = scrollRef.current;
        if (pageIndex === undefined || !element) return;
        element.scrollTop = pageLayout.offsets[pageIndex] ?? 0;
        pendingScrollPageRef.current = undefined;
    }, [currentPage, pageLayout.offsets, source?.id]);

    useEffect(() => {
        if (!focus || !pages.has(Math.floor(focus.offset / pageSize))) return;
        const frame = requestAnimationFrame(() => {
            scrollRef.current
                ?.querySelector<HTMLElement>('[data-focus-message="true"]')
                ?.scrollIntoView({ block: 'center' });
        });
        return () => cancelAnimationFrame(frame);
    }, [focus?.requestId, pageSize, pages]);

    useEffect(() => {
        if (!source || pageCount === 0) return;
        const nearby = [currentPage - 1, currentPage, currentPage + 1]
            .filter(pageIndex => pageIndex >= 0 && pageIndex < pageCount);
        nearby.forEach(pageIndex => void loadPageIndex(pageIndex));
        const next = trimPageCache(pagesRef.current, currentPage);
        if (next !== pagesRef.current) {
            pagesRef.current = next;
            setPages(new Map(next));
        }
    }, [currentPage, loadPageIndex, pageCount, source?.id, source?.revisionToken]);

    useEffect(() => () => {
        if (scrollFrameRef.current !== undefined) cancelAnimationFrame(scrollFrameRef.current);
    }, []);

    const locatePage = useCallback((scrollTop: number): number => {
        let low = 0;
        let high = Math.max(0, pageCount - 1);
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const start = pageLayout.offsets[middle] ?? 0;
            const end = middle + 1 < pageCount ? pageLayout.offsets[middle + 1] : pageLayout.totalHeight;
            if (scrollTop < start) high = middle - 1;
            else if (scrollTop >= end) low = middle + 1;
            else return middle;
        }
        return Math.min(Math.max(0, low), Math.max(0, pageCount - 1));
    }, [pageCount, pageLayout.offsets, pageLayout.totalHeight]);

    const handleScroll = () => {
        if (scrollFrameRef.current !== undefined) return;
        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = undefined;
            const element = scrollRef.current;
            if (element) setCurrentPage(locatePage(element.scrollTop));
        });
    };

    const handleMeasure = useCallback((pageIndex: number, height: number) => {
        setPageHeights(current => {
            if (current.get(pageIndex) === height) return current;
            const next = new Map(current);
            next.set(pageIndex, height);
            return next;
        });
    }, []);

    const visiblePageIndexes = useMemo(() => (
        [currentPage - 1, currentPage, currentPage + 1]
            .filter(pageIndex => pageIndex >= 0 && pageIndex < pageCount)
    ), [currentPage, pageCount]);
    const rangeStart = source && source.messageCount > 0 ? currentPage * pageSize + 1 : 0;
    const rangeEnd = source ? Math.min(source.messageCount, (currentPage + 1) * pageSize) : 0;

    return (
        <section
            className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-[#f7f4fb] text-slate-800"
            data-testid="daily-archive-reader"
            aria-label={`${title} 对话记录`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_2%,rgba(196,181,253,0.30),transparent_32%),radial-gradient(circle_at_5%_65%,rgba(255,255,255,0.95),transparent_35%)]" />
            <AppHeader
                title={title}
                subtitle={source ? `${source.messageCount.toLocaleString()} 条对话` : '正在打开本机日档'}
                onBack={onBack}
                center
                titleClassName="truncate text-[15px] font-black text-slate-800"
                subtitleClassName="mt-0.5 truncate text-center text-[9px] font-bold text-slate-400"
                className="relative z-10 !border-white/80 !bg-white/78"
                right={(
                    <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={selectionPurpose ? onCancelSelection : () => onStartSelection('curation')}
                        disabled={!source || source.messageCount === 0 || dayLocked}
                        className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-2.5 text-[10px] font-black shadow-sm disabled:opacity-40 ${
                            selectionPurpose ? 'bg-violet-600 text-white' : 'bg-white text-violet-600'
                        }`}
                        aria-label={selectionPurpose ? '取消选择' : '整理对话记录'}
                    >
                        {selectionPurpose ? <X size={16} weight="bold" /> : <PencilSimple size={17} weight="duotone" />}
                    </button>
                    <button
                        type="button"
                        onClick={onOpenLibrary}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-500 shadow-sm"
                        aria-label="打开剪藏库"
                    >
                        <Bookmarks size={18} weight="duotone" />
                    </button>
                    </div>
                )}
            />

            {selectionPurpose && (
                <div className="relative z-10 shrink-0 px-4 py-2">
                    <p className="rounded-xl bg-violet-50 px-3 py-2 text-center text-[9px] font-bold leading-relaxed text-violet-600">
                        {selectionPurpose === 'clipping'
                            ? '点选想保留的原话；跨页选择会保留，每份最多 80 条。'
                            : '点选记录后可合并、改说话人、归入日期、修改或删除。长按任一气泡也能进入这里。'}
                    </p>
                </div>
            )}

            <main className="relative z-10 flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 px-4 pb-2 pt-3">
                    <div className="flex items-center gap-2 rounded-2xl bg-white/68 px-3 py-2 text-[9px] leading-relaxed text-slate-400">
                        <ClockCounterClockwise size={14} className="shrink-0 text-violet-400" weight="duotone" />
                        <span className="min-w-0 flex-1 font-bold text-slate-500">当天对话</span>
                        {source && source.messageCount > 0 && (
                            <span className="shrink-0 font-black text-violet-500">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}</span>
                        )}
                        {source?.dateKey && !dayLocked && (
                            <button
                                type="button"
                                onClick={onAddManual}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-1 font-black text-violet-600"
                            >
                                <Plus size={11} weight="bold" /> 补录
                            </button>
                        )}
                        {source?.dateKey && (
                            <button
                                type="button"
                                onClick={dayLocked ? onUnlockDay : onConfirmDay}
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-black ${
                                    dayLocked ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                {dayLocked ? <LockOpen size={11} weight="duotone" /> : <LockKey size={11} weight="duotone" />}
                                {dayLocked ? '解锁' : '锁定当天'}
                            </button>
                        )}
                    </div>
                </div>

                {(loading || (!source && !pageError)) && (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-violet-500">
                        <SpinnerGap size={28} className="animate-spin" />
                        <p className="mt-3 text-[10px] font-bold">正在铺开这一天…</p>
                    </div>
                )}

                {!loading && source && source.messageCount === 0 && (
                    <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center text-[11px] text-slate-400">
                        这一天暂时没有可见对话。
                    </div>
                )}

                {!loading && source && source.messageCount > 0 && (
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="min-h-0 flex-1 overflow-y-auto px-4 no-scrollbar"
                        data-testid="daily-archive-virtual-scroll"
                    >
                        <div className="relative" style={{ height: `${pageLayout.totalHeight}px` }}>
                            {visiblePageIndexes.map(pageIndex => {
                                const messages = pages.get(pageIndex);
                                const top = pageLayout.offsets[pageIndex] ?? 0;
                                if (!messages) {
                                    return (
                                        <div
                                            key={`loading-${pageIndex}`}
                                            className="absolute inset-x-0 flex items-start justify-center pt-10 text-violet-400"
                                            style={{
                                                height: `${pageHeights.get(pageIndex) ?? estimatedPageHeight(pageIndex)}px`,
                                                transform: `translateY(${top}px)`,
                                            }}
                                        >
                                            <SpinnerGap size={20} className="animate-spin" />
                                        </div>
                                    );
                                }
                                return (
                                    <VirtualMessagePage
                                        key={pageIndex}
                                        pageIndex={pageIndex}
                                        messages={messages}
                                        top={top}
                                        userName={userName}
                                        characterName={characterName}
                                        selectionPurpose={selectionPurpose}
                                        selectedMessageIds={selectedMessageIds}
                                        focusMessageId={focus?.messageId}
                                        onToggleMessage={onToggleMessage}
                                        onStartCuration={message => onStartSelection('curation', message)}
                                        onMeasure={handleMeasure}
                                        curationLocked={Boolean(dayLocked)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

                {pageError && (
                    <div className="shrink-0 px-4 pb-3">
                        <button
                            type="button"
                            onClick={() => void loadPageIndex(failedPageIndex ?? currentPage)}
                            className="w-full rounded-2xl bg-rose-50 px-3 py-3 text-[10px] font-bold text-rose-600"
                        >
                            {pageError} · 点这里重试
                        </button>
                    </div>
                )}
            </main>

            {selectionPurpose && (
                <footer className="relative z-20 shrink-0 border-t border-white bg-white/92 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
                    {selectionPurpose === 'clipping' ? (
                        <button
                            type="button"
                            onClick={onSaveClipping}
                            disabled={selectedMessageIds.size === 0}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-sm font-black text-white shadow-lg shadow-violet-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                        >
                            <BookmarkSimple size={18} weight="fill" />
                            {selectedMessageIds.size > 0 ? `存入剪藏库 · ${selectedMessageIds.size} 条` : '点选想留下的对话'}
                        </button>
                    ) : (
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {([
                                ['clip', BookmarkSimple, '剪藏'],
                                ['edit', NotePencil, '修改'],
                                ['merge', ArrowsMerge, '合并'],
                                ['role', UserSwitch, '说话人'],
                                ['date', CalendarBlank, '日期'],
                                ['delete', Trash, '删除'],
                            ] as const).map(([action, Icon, label]) => (
                                <button
                                    key={action}
                                    type="button"
                                    disabled={selectedMessageIds.size === 0 || (action === 'edit' && selectedMessageIds.size !== 1)}
                                    onClick={() => onCurationAction(action)}
                                    className={`flex min-w-[62px] shrink-0 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[9px] font-black disabled:opacity-35 ${
                                        action === 'delete' ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'
                                    }`}
                                >
                                    <Icon size={17} weight="duotone" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </footer>
            )}
        </section>
    );
};

export default DailyArchiveReader;
