import React, { useEffect, useRef, useState } from 'react';
import {
    ArrowRight,
    BookmarkSimple,
    CaretDown,
    CaretUp,
    MagnifyingGlass,
    SpinnerGap,
    Trash,
    X,
} from '@phosphor-icons/react';
import type {
    ConversationClipping,
    DailyArchiveSearchHit,
    DailyArchiveSearchResponse,
} from '../../domain/dailyArchive/types';
import AppHeader from '../shell/AppHeader';

interface ConversationClippingLibraryProps {
    clippings: ConversationClipping[];
    characterName: string;
    onClose: () => void;
    onDelete: (id: string) => void;
    onSearch: (query: string, signal: AbortSignal) => Promise<DailyArchiveSearchResponse>;
    onOpenSearchHit: (hit: DailyArchiveSearchHit) => void;
}

const SearchHitText: React.FC<{ content: string; query: string }> = ({ content, query }) => {
    const index = content.toLocaleLowerCase('zh-CN').indexOf(query.toLocaleLowerCase('zh-CN'));
    if (index < 0) return <>{content}</>;
    const start = Math.max(0, index - 36);
    const end = Math.min(content.length, index + query.length + 52);
    return (
        <>
            {start > 0 ? '…' : ''}
            {content.slice(start, index)}
            <mark className="rounded bg-violet-100 px-0.5 font-black text-violet-700">
                {content.slice(index, index + query.length)}
            </mark>
            {content.slice(index + query.length, end)}
            {end < content.length ? '…' : ''}
        </>
    );
};

const searchHitDate = (hit: DailyArchiveSearchHit): string => (
    hit.dateKey?.replace(/-/gu, '.') || '未标日期'
);

const ConversationClippingLibrary: React.FC<ConversationClippingLibraryProps> = ({
    clippings,
    characterName,
    onClose,
    onDelete,
    onSearch,
    onOpenSearchHit,
}) => {
    const [expandedId, setExpandedId] = useState<string>();
    const [deleteReadyId, setDeleteReadyId] = useState<string>();
    const [searchText, setSearchText] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState('');
    const [searchResponse, setSearchResponse] = useState<DailyArchiveSearchResponse>();
    const [searchError, setSearchError] = useState<string>();
    const [searching, setSearching] = useState(false);
    const searchAbortRef = useRef<AbortController>();

    useEffect(() => () => searchAbortRef.current?.abort(), []);

    const clearSearch = () => {
        searchAbortRef.current?.abort();
        setSearchText('');
        setSubmittedQuery('');
        setSearchResponse(undefined);
        setSearchError(undefined);
        setSearching(false);
    };

    const submitSearch = async (event: React.FormEvent) => {
        event.preventDefault();
        const query = searchText.trim();
        if (!query) {
            clearSearch();
            return;
        }
        searchAbortRef.current?.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setSubmittedQuery(query);
        setSearchResponse(undefined);
        setSearchError(undefined);
        setSearching(true);
        try {
            const response = await onSearch(query, controller.signal);
            if (!controller.signal.aborted) setSearchResponse(response);
        } catch (error) {
            if (!controller.signal.aborted) {
                setSearchError(error instanceof Error ? error.message : '这次没有搜完，再试一次。');
            }
        } finally {
            if (!controller.signal.aborted) setSearching(false);
        }
    };

    return (
        <section className="absolute inset-0 z-[70] flex flex-col overflow-hidden bg-[#f7f4fb] text-slate-800" data-testid="conversation-clipping-library">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_5%,rgba(216,180,254,0.28),transparent_34%),radial-gradient(circle_at_8%_70%,rgba(255,255,255,0.95),transparent_38%)]" />
            <AppHeader
                title="对话剪藏库"
                subtitle={`${characterName} · ${clippings.length} 份剪藏`}
                onBack={onClose}
                titleClassName="truncate text-[15px] font-black text-slate-800"
                subtitleClassName="mt-0.5 truncate text-[9px] font-bold text-slate-400"
                className="relative z-10 !border-white/80 !bg-white/78"
                right={(
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                        <BookmarkSimple size={19} weight="duotone" />
                    </span>
                )}
            />

            <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 no-scrollbar">
                <form
                    onSubmit={event => void submitSearch(event)}
                    className="flex items-center gap-2 rounded-3xl border border-violet-100 bg-white/86 p-2 pl-3 shadow-sm backdrop-blur"
                    role="search"
                >
                    <MagnifyingGlass size={18} className="shrink-0 text-violet-500" weight="duotone" />
                    <input
                        value={searchText}
                        onChange={event => setSearchText(event.target.value)}
                        maxLength={80}
                        placeholder={`搜索和${characterName}的全部聊天`}
                        aria-label="搜索全部聊天记录"
                        className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[12px] font-bold text-slate-700 outline-none placeholder:font-semibold placeholder:text-slate-400"
                    />
                    {searchText && (
                        <button
                            type="button"
                            onClick={clearSearch}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
                            aria-label="清空搜索"
                        >
                            <X size={14} weight="bold" />
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={!searchText.trim() || searching}
                        className="flex h-9 shrink-0 items-center justify-center rounded-full bg-violet-600 px-3 text-[10px] font-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        {searching ? <SpinnerGap size={15} className="animate-spin" /> : '搜索'}
                    </button>
                </form>

                {submittedQuery ? (
                    <div className="mt-4">
                        <div className="flex items-center justify-between px-1">
                            <p className="text-[10px] font-black text-slate-600">
                                {searching
                                    ? `正在找“${submittedQuery}”`
                                    : searchResponse ? `找到 ${searchResponse.totalMatchCount.toLocaleString()} 条` : `“${submittedQuery}”`}
                            </p>
                            <button type="button" onClick={clearSearch} className="text-[9px] font-black text-violet-500">
                                回到剪藏
                            </button>
                        </div>

                        {searchError && (
                            <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-3 text-[10px] font-bold text-rose-600">
                                {searchError}
                            </div>
                        )}

                        {searching && (
                            <div className="mt-4 flex items-center justify-center gap-2 rounded-[24px] bg-white/60 px-4 py-10 text-[10px] font-bold text-violet-500">
                                <SpinnerGap size={18} className="animate-spin" />
                                正在翻找全部聊天…
                            </div>
                        )}

                        {!searching && searchResponse && searchResponse.hits.length === 0 && (
                            <div className="mt-4 rounded-[24px] border border-dashed border-violet-200 bg-white/55 px-5 py-10 text-center">
                                <MagnifyingGlass size={28} className="mx-auto text-violet-300" weight="duotone" />
                                <p className="mt-3 text-sm font-black text-slate-600">没有找到这句话</p>
                            </div>
                        )}

                        {!searching && searchResponse && searchResponse.hits.length > 0 && (
                            <div className="mt-3 space-y-2.5" data-testid="daily-archive-search-results">
                                {searchResponse.hits.map(hit => (
                                    <button
                                        key={`${hit.documentId}:${hit.messageId}`}
                                        type="button"
                                        onClick={() => onOpenSearchHit(hit)}
                                        className="flex w-full items-center gap-3 rounded-[22px] border border-white bg-white/86 p-3.5 text-left shadow-[0_8px_24px_rgba(100,82,135,0.07)] transition active:scale-[0.99]"
                                        aria-label={`打开 ${searchHitDate(hit)} 的原对话`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[9px] font-black text-violet-500">
                                                {searchHitDate(hit)} · {hit.role === 'character' ? characterName : '我'}
                                            </p>
                                            <p className="mt-1.5 max-h-[4.5rem] overflow-hidden whitespace-pre-wrap break-words text-[11px] font-semibold leading-5 text-slate-700">
                                                <SearchHitText content={hit.content} query={submittedQuery} />
                                            </p>
                                        </div>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                                            <ArrowRight size={14} weight="bold" />
                                        </span>
                                    </button>
                                ))}
                                {searchResponse.truncated && (
                                    <p className="py-2 text-center text-[9px] font-bold text-slate-400">
                                        先显示最近 {searchResponse.hits.length} 条
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ) : clippings.length === 0 ? (
                    <div className="mt-5 rounded-[28px] border border-dashed border-violet-200 bg-white/55 px-5 py-10 text-center">
                        <BookmarkSimple size={30} className="mx-auto text-violet-300" weight="duotone" />
                        <p className="mt-3 text-sm font-black text-slate-600">还没有剪藏</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">打开某一天，点右上角“剪藏”，选几句最像 TA 的对话就好。</p>
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {clippings.map(clipping => {
                            const expanded = expandedId === clipping.id;
                            const deleteReady = deleteReadyId === clipping.id;
                            return (
                                <article key={clipping.id} className="rounded-[24px] border border-white bg-white/86 p-4 shadow-[0_10px_30px_rgba(100,82,135,0.08)]">
                                    <div className="flex items-start gap-3">
                                        <button type="button" onClick={() => setExpandedId(current => current === clipping.id ? undefined : clipping.id)} className="min-w-0 flex-1 text-left">
                                            <h3 className="truncate text-[12px] font-black text-slate-700">{clipping.title}</h3>
                                            <p className="mt-1 text-[9px] font-bold text-violet-500">
                                                {clipping.messageCount} 条 · {clipping.characterMessageCount} 句角色原话
                                            </p>
                                        </button>
                                        <button type="button" onClick={() => setExpandedId(current => current === clipping.id ? undefined : clipping.id)} className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-500" aria-label={expanded ? '收起剪藏' : '展开剪藏'}>
                                            {expanded ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                                        </button>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        {(expanded ? clipping.messages : clipping.messages.slice(0, 2)).map(message => (
                                            <div key={`${clipping.id}:${message.messageId}`} className={`rounded-2xl px-3 py-2 text-[10px] leading-relaxed ${
                                                message.role === 'character' ? 'border border-slate-100 bg-white text-slate-700' : 'bg-violet-50 text-violet-800'
                                            }`}>
                                                <span className="mr-1 font-black text-[8px] text-slate-400">{message.role === 'character' ? characterName : '我'}</span>
                                                {message.content}
                                            </div>
                                        ))}
                                    </div>

                                    {!expanded && clipping.messages.length > 2 && (
                                        <p className="mt-2 text-center text-[8px] font-bold text-slate-400">展开可查看完整 {clipping.messages.length} 条</p>
                                    )}

                                    {expanded && (
                                        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (deleteReady) {
                                                        onDelete(clipping.id);
                                                        setDeleteReadyId(undefined);
                                                        return;
                                                    }
                                                    setDeleteReadyId(clipping.id);
                                                }}
                                                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-black ${
                                                    deleteReady ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-500'
                                                }`}
                                            >
                                                <Trash size={13} weight="duotone" />
                                                {deleteReady ? '再点一次删除' : '删除这份剪藏'}
                                            </button>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </main>
        </section>
    );
};

export default ConversationClippingLibrary;
