import React, { useMemo } from 'react';
import type { CharacterProfile, NovelBook } from '../../types';
import type { NarrativeDirective } from '../../domain/narrative/types';
import type { NarrativeInspectionSnapshot } from '../../domain/narrative/inspection';
import { StoryDeskDirectivePanel } from './StoryDeskDirectivePanel';

interface StoryDeskInspectorProps {
    activeBook: NovelBook;
    characters: CharacterProfile[];
    availableCharacters: CharacterProfile[];
    defaultCharacterIds: string[];
    activeMaskLabel?: string;
    inspection: NarrativeInspectionSnapshot;
    onDirectivesChange: (directives: NarrativeDirective[]) => Promise<void>;
    onExit: () => void;
}

const RUN_STATUS_LABELS = {
    draft: '草稿',
    active: '进行中',
    paused: '暂停',
    completed: '已完成',
    abandoned: '已放下',
} as const;

const MEMORY_POLICY_LABELS = {
    main_vault: '主线事实',
    relationship_echo: '关系回声',
    dream_material: 'IF / 梦境',
    excluded_from_main_vault: '不进主仓',
} as const;

const formatUpdatedAt = (timestamp: number): string => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未记录';
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
};

export const StoryDeskInspector: React.FC<StoryDeskInspectorProps> = ({
    activeBook,
    characters,
    availableCharacters,
    defaultCharacterIds,
    activeMaskLabel,
    inspection,
    onDirectivesChange,
    onExit,
}) => {
    const characterNameById = useMemo(() => new Map(
        characters.map(character => [character.id, character.name]),
    ), [characters]);
    const sortedRuns = useMemo(() => [...inspection.runs].sort((left, right) => {
        if (left.id === inspection.activeRunId) return -1;
        if (right.id === inspection.activeRunId) return 1;
        return right.updatedAt - left.updatedAt;
    }), [inspection.activeRunId, inspection.runs]);
    const sortedReceipts = useMemo(() => [...inspection.receipts].sort(
        (left, right) => (right.confirmedAt || right.playedAt) - (left.confirmedAt || left.playedAt),
    ), [inspection.receipts]);
    const pendingDirectiveCount = inspection.directives.filter(directive => directive.status === 'pending').length;

    return (
        <div className="h-full w-full bg-[#f4f1eb] flex flex-col font-sans text-slate-800" data-testid="story-desk-inspector">
            <header className="h-16 shrink-0 px-4 flex items-center gap-3 bg-[#fbfaf7]/95 border-b border-slate-200/80 backdrop-blur-md">
                <button onClick={onExit} className="w-10 h-10 -ml-2 rounded-full grid place-items-center hover:bg-slate-100 active:scale-95 transition-all" aria-label="返回书架">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <div className="min-w-0 flex-1">
                    <div className="font-black text-base truncate">{activeBook.title}</div>
                    <div className="text-[10px] tracking-[0.18em] text-slate-400 uppercase">剧情台 · 方向与线路</div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold">草拟</span>
            </header>

            <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 pb-12 no-scrollbar">
                <section className="rounded-3xl bg-slate-900 text-white p-5 shadow-lg shadow-slate-300/40 overflow-hidden relative">
                    <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full border border-white/10"></div>
                    <div className="absolute -right-2 -top-3 w-20 h-20 rounded-full border border-white/10"></div>
                    <div className="relative">
                        <div className="text-[10px] font-bold tracking-[0.2em] text-white/50 mb-2">CURRENT WORLDLINE</div>
                        <h2 className="font-black text-xl">{activeMaskLabel || '当前身份'}的剧情工作台</h2>
                        <p className="mt-2 text-xs leading-relaxed text-white/65">
                            可以先把想走的方向写下来并复核。保存后仍只是待采纳意图；没有开演、游玩和确认，就不会成为角色经历。
                        </p>
                        <div className="mt-4 text-[10px] font-bold tracking-wide text-white/45">
                            {inspection.progressBundleId ? '已绑定当前身份进度' : '尚未建立进度包 · 当前锁定'}
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-3 gap-2.5">
                    {[
                        ['待演指令', pendingDirectiveCount],
                        ['剧情线路', inspection.runs.length],
                        ['确认经历', inspection.receipts.length],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl bg-white border border-slate-200/70 px-3 py-4 text-center shadow-sm">
                            <div className="font-black text-xl text-slate-800">{value}</div>
                            <div className="text-[10px] text-slate-400 mt-1">{label}</div>
                        </div>
                    ))}
                </section>

                {(inspection.otherBundleDirectiveCount > 0 || inspection.otherBundleRunCount > 0) && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-xs leading-relaxed text-indigo-700">
                        已隔离其他身份的 {inspection.otherBundleDirectiveCount} 条指令和 {inspection.otherBundleRunCount} 条线路；它们不会在当前剧情台里混入。
                    </div>
                )}

                <StoryDeskDirectivePanel
                    bookId={activeBook.id}
                    progressBundleId={inspection.progressBundleId}
                    directives={inspection.directives}
                    allDirectives={activeBook.directives || []}
                    characters={characters}
                    availableCharacters={availableCharacters}
                    defaultCharacterIds={defaultCharacterIds}
                    onDirectivesChange={onDirectivesChange}
                />

                <section className="space-y-3">
                    <div className="flex items-end justify-between px-1">
                        <div>
                            <h3 className="font-black text-sm">线路存档</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">按 route / branch 保存实际游玩连续性</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{inspection.runs.length}</span>
                    </div>
                    {sortedRuns.length === 0 ? (
                        <div className="rounded-3xl bg-white border border-slate-200/70 p-6 text-center shadow-sm">
                            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 grid place-items-center text-xl">⌁</div>
                            <h4 className="mt-3 font-bold text-sm">还没有游玩中的长剧情</h4>
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">这不是生成按钮。下一阶段会先审阅方向，再由你明确开始一条线路。</p>
                        </div>
                    ) : sortedRuns.map(run => {
                        const runScenes = inspection.scenes.filter(scene => scene.runId === run.id);
                        const activeScene = runScenes.find(scene => scene.id === run.activeSceneId || scene.status === 'active');
                        const runReceiptCount = inspection.receipts.filter(receipt => receipt.runId === run.id).length;
                        const participantNames = run.participantCharIds
                            .map(charId => characterNameById.get(charId) || charId)
                            .join('、');
                        return (
                            <article key={run.id} className={`rounded-3xl bg-white border p-5 shadow-sm ${run.id === inspection.activeRunId ? 'border-slate-800 ring-1 ring-slate-800/10' : 'border-slate-200/70'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${run.lane === 'if_line' ? 'bg-violet-100 text-violet-700' : 'bg-slate-900 text-white'}`}>{run.lane === 'if_line' ? 'IF LINE' : 'MAINLINE'}</span>
                                            <span className="text-[10px] font-bold text-slate-400">{RUN_STATUS_LABELS[run.status]}</span>
                                        </div>
                                        <h4 className="mt-2 font-black text-base break-words">{run.routeSummary || run.routeId}</h4>
                                        <div className="mt-1 text-[10px] font-mono text-slate-400 break-all">{run.routeId} / {run.branchId}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-black text-lg">{runScenes.length}</div>
                                        <div className="text-[9px] text-slate-400">场景</div>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                                    <div className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-400">同行</span><div className="font-bold text-slate-600 mt-0.5 truncate">{participantNames || '未记录'}</div></div>
                                    <div className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-400">已确认</span><div className="font-bold text-slate-600 mt-0.5">{runReceiptCount} 次经历</div></div>
                                </div>
                                {activeScene && (
                                    <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                                        正停在：<span className="font-bold">{activeScene.title}</span>
                                    </div>
                                )}
                                <div className="mt-3 text-[9px] text-slate-400">最后整理于 {formatUpdatedAt(run.updatedAt)}</div>
                            </article>
                        );
                    })}
                </section>

                <section className="space-y-3">
                    <div className="flex items-end justify-between px-1">
                        <div>
                            <h3 className="font-black text-sm">确认经历</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">只有 played 且由你确认的回执会出现在这里</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{inspection.receipts.length}</span>
                    </div>
                    {sortedReceipts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 p-5 text-center text-xs text-slate-400">
                            还没有确认过的剧情经历。
                        </div>
                    ) : sortedReceipts.map(receipt => (
                        <article key={receipt.id} className="rounded-2xl bg-white border border-slate-200/70 p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black">已确认</span>
                                <span className="text-[9px] text-slate-400">{MEMORY_POLICY_LABELS[receipt.memoryPolicy]}</span>
                            </div>
                            <p className="mt-2.5 text-xs leading-relaxed text-slate-600">{receipt.summary}</p>
                            {receipt.acceptedFacts.length > 0 && (
                                <ul className="mt-3 space-y-1.5">
                                    {receipt.acceptedFacts.slice(0, 3).map(fact => (
                                        <li key={fact} className="text-[10px] text-slate-500 flex gap-2"><span className="text-emerald-500">✓</span><span>{fact}</span></li>
                                    ))}
                                </ul>
                            )}
                        </article>
                    ))}
                </section>

                {inspection.unscopedDirectives.length > 0 && (
                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-amber-100 grid place-items-center shrink-0">!</div>
                            <div>
                                <h3 className="font-bold text-sm text-amber-900">{inspection.unscopedDirectives.length} 条旧指令尚未绑定身份</h3>
                                <p className="mt-1 text-xs leading-relaxed text-amber-700">它们只作为待整理记录显示，不会进入当前线路，也不能自动写进记忆。</p>
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};
