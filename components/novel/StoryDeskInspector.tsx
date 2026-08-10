import React, { useMemo } from 'react';
import type { CharacterProfile, NovelBook } from '../../types';
import type { NarrativeDirective, NarrativeExperienceReceipt, NarrativeRun, NarrativeScene, NovelNarrativeState } from '../../domain/narrative/types';
import type { NarrativeInspectionSnapshot } from '../../domain/narrative/inspection';
import { startDraftNarrativeRun } from '../../domain/narrative/runLifecycle';
import { StoryDeskDirectivePanel } from './StoryDeskDirectivePanel';
import { StoryDeskRunStartAction } from './StoryDeskRunStartAction';
import AppHeader from '../shell/AppHeader';

interface StoryDeskInspectorProps {
    activeBook: NovelBook;
    characters: CharacterProfile[];
    availableCharacters: CharacterProfile[];
    defaultCharacterIds: string[];
    activeMaskLabel?: string;
    inspection: NarrativeInspectionSnapshot;
    onDirectivesChange: (directives: NarrativeDirective[]) => Promise<void>;
    onActivationChange: (
        directives: NarrativeDirective[],
        narrative: NovelNarrativeState,
    ) => Promise<void>;
    onRunStartChange: (narrative: NovelNarrativeState) => Promise<void>;
    onPrepareScene: (run: NarrativeRun) => void;
    onContinueScene: (scene: NarrativeScene) => void;
    onFinishScene: (scene: NarrativeScene) => Promise<void>;
    isWriterGenerating: boolean;
    onReviewPlayedScene: (scene: NarrativeScene) => void;
    growthCandidateCountByReceiptId: ReadonlyMap<string, number>;
    handledGrowthReceiptIds: ReadonlySet<string>;
    growthActionByReceiptId: ReadonlyMap<string, { status: 'idle' | 'loading' | 'none' | 'error'; message?: string }>;
    onGenerateWorldGrowth: (receipt: NarrativeExperienceReceipt) => Promise<void>;
    onOpenWorldbook: () => void;
    onExit: () => void;
}

const RUN_STATUS_LABELS = {
    draft: '待开始',
    active: '进行中',
    paused: '暂停',
    completed: '已完成',
    abandoned: '已放下',
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
    onActivationChange,
    onRunStartChange,
    onPrepareScene,
    onContinueScene,
    onFinishScene,
    isWriterGenerating,
    onReviewPlayedScene,
    growthCandidateCountByReceiptId,
    handledGrowthReceiptIds,
    growthActionByReceiptId,
    onGenerateWorldGrowth,
    onOpenWorldbook,
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
    const globallyActiveRun = inspection.state.runs.find(run => run.status === 'active');

    const startRun = async (runId: string, expectedUpdatedAt: number) => {
        if (!inspection.progressBundleId) throw new Error('当前身份还没有准备好，暂时不能开始这条故事线');
        const result = startDraftNarrativeRun({
            bookId: activeBook.id,
            progressBundleId: inspection.progressBundleId,
            runId,
            expectedUpdatedAt,
            narrative: activeBook.narrative,
        });
        await onRunStartChange(result.narrative);
    };

    return (
        <div className="h-full w-full bg-[#f4f1eb] flex flex-col font-sans text-slate-800" data-testid="story-desk-inspector">
            <AppHeader title={activeBook.title} subtitle="故事线 · 方向与进度" onBack={onExit} className="bg-[#fbfaf7]/95 border-b border-slate-200/80" />

            <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-12 no-scrollbar">
                <div className="mx-auto w-full max-w-3xl space-y-5">
                <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm overflow-hidden relative">
                    <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full border border-slate-100"></div>
                    <div className="absolute -right-2 -top-3 w-20 h-20 rounded-full border border-slate-100"></div>
                    <div className="relative">
                        <div className="text-[10px] font-bold tracking-[0.16em] text-slate-400 mb-2">故事线</div>
                        <h2 className="font-bold text-lg text-slate-800">{activeMaskLabel || '当前身份'}的故事线</h2>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            可以先把想走的方向写下来并复核。只有真正写过、结束并由你确认的内容，才会成为角色经历。
                        </p>
                        <div className="mt-4 text-[10px] font-bold tracking-wide text-slate-400">
                            {inspection.progressBundleId ? '当前身份已准备好' : '当前身份尚未准备好'}
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-3 gap-2.5">
                    {[
                        ['想去的方向', pendingDirectiveCount],
                        ['故事线', inspection.runs.length],
                        ['已经发生', inspection.receipts.length],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl bg-white border border-slate-200/70 px-3 py-4 text-center shadow-sm">
                            <div className="font-black text-xl text-slate-800">{value}</div>
                            <div className="text-[10px] text-slate-400 mt-1">{label}</div>
                        </div>
                    ))}
                </section>

                {(inspection.otherBundleDirectiveCount > 0 || inspection.otherBundleRunCount > 0) && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-xs leading-relaxed text-indigo-700">
                        其他身份下还有 {inspection.otherBundleDirectiveCount} 个方向和 {inspection.otherBundleRunCount} 条故事线；它们不会混进当前身份的故事。
                    </div>
                )}

                <StoryDeskDirectivePanel
                    bookId={activeBook.id}
                    progressBundleId={inspection.progressBundleId}
                    directives={inspection.directives}
                    allDirectives={activeBook.directives || []}
                    narrative={activeBook.narrative}
                    characters={characters}
                    availableCharacters={availableCharacters}
                    defaultCharacterIds={defaultCharacterIds}
                    onDirectivesChange={onDirectivesChange}
                    onActivationChange={onActivationChange}
                />

                <section className="space-y-3">
                    <div className="flex items-end justify-between px-1">
                        <div>
                            <h3 className="font-black text-sm">故事线</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">每一幕都要真正写过、结束并确认后才算发生</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{inspection.runs.length}</span>
                    </div>
                    {sortedRuns.length === 0 ? (
                        <div className="rounded-3xl bg-white border border-slate-200/70 p-6 text-center shadow-sm">
                            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 grid place-items-center text-xl">⌁</div>
                            <h4 className="mt-3 font-bold text-sm">还没有游玩中的长剧情</h4>
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">从一个待演方向建立故事线后，它才会出现在这里。</p>
                        </div>
                    ) : sortedRuns.map(run => {
                        const runScenes = inspection.scenes.filter(scene => scene.runId === run.id);
                        const activeScene = runScenes.find(scene => scene.id === run.activeSceneId || scene.status === 'active');
                        const playedScene = runScenes.find(scene => scene.status === 'played');
                        const runReceiptCount = inspection.receipts.filter(receipt => receipt.runId === run.id).length;
                        const activeSceneParagraphCount = activeScene
                            ? activeBook.segments.filter(segment => (
                                segment.type === 'story'
                                && segment.focus !== 'chapter_summary'
                                && segment.meta?.narrativeSceneId === activeScene.id
                            )).length
                            : 0;
                        const participantNames = run.participantCharIds
                            .map(charId => characterNameById.get(charId) || '已关联角色')
                            .join('、');
                        return (
                            <article key={run.id} className={`rounded-3xl bg-white border p-5 shadow-sm ${run.id === inspection.activeRunId ? 'border-slate-800 ring-1 ring-slate-800/10' : 'border-slate-200/70'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${run.lane === 'if_line' ? 'bg-violet-100 text-violet-700' : 'bg-slate-900 text-white'}`}>{run.lane === 'if_line' ? 'IF 线' : '主线'}</span>
                                            <span className="text-[10px] font-bold text-slate-400">{RUN_STATUS_LABELS[run.status]}</span>
                                        </div>
                                        <h4 className="mt-2 font-black text-base break-words">{run.routeSummary || '未命名故事线'}</h4>
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
                                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
                                        <div>正停在：<span className="font-bold">{activeScene.title}</span></div>
                                        <div className="mt-1 text-[10px] text-emerald-600/70">手稿中已有 {activeSceneParagraphCount} 段这一幕的正文</div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => onContinueScene(activeScene)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 font-bold">去手稿继续写</button>
                                            <button type="button" disabled={activeSceneParagraphCount === 0 || isWriterGenerating} onClick={() => void onFinishScene(activeScene)} className="rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white disabled:bg-emerald-200">{isWriterGenerating ? '等正文写完' : '结束这一幕'}</button>
                                        </div>
                                    </div>
                                )}
                                {playedScene && (
                                    <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                                        <div><span className="font-bold">{playedScene.title}</span> 已经写完，等你确认经历。</div>
                                        <button type="button" onClick={() => onReviewPlayedScene(playedScene)} className="mt-3 w-full rounded-xl bg-amber-600 px-3 py-2 font-bold text-white">查看并确认</button>
                                    </div>
                                )}
                                {run.status === 'draft' && runScenes.length === 0 && (
                                    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs leading-relaxed text-indigo-700">
                                        故事线已准备好；还没有写过任何一幕。
                                    </div>
                                )}
                                {run.status === 'active' && runScenes.length === 0 && (
                                    <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-700">
                                        已选为当前故事线；第一幕还没有开始。
                                    </div>
                                )}
                                {run.status === 'active' && !activeScene && !playedScene && (
                                    <button type="button" onClick={() => onPrepareScene(run)} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white shadow-sm">准备下一幕</button>
                                )}
                                {run.status === 'draft' && (
                                    <StoryDeskRunStartAction
                                        runId={run.id}
                                        disabledReason={
                                            globallyActiveRun
                                                ? '这本书已有一条进行中的故事线；请先完成当前一条。'
                                                : runScenes.length > 0 || runReceiptCount > 0
                                                    ? '只有还没开始写过的故事线可以开始。'
                                                    : undefined
                                        }
                                        onStart={() => startRun(run.id, run.updatedAt)}
                                    />
                                )}
                                <div className="mt-3 text-[9px] text-slate-400">最后整理于 {formatUpdatedAt(run.updatedAt)}</div>
                            </article>
                        );
                    })}
                </section>

                <section className="space-y-3">
                    <div className="flex items-end justify-between px-1">
                        <div>
                            <h3 className="font-black text-sm">已经发生</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">只有写完并由你确认的经历会出现在这里</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{inspection.receipts.length}</span>
                    </div>
                    {sortedReceipts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 p-5 text-center text-xs text-slate-400">
                            还没有确认过的剧情经历。
                        </div>
                    ) : sortedReceipts.map(receipt => {
                        const growthCount = growthCandidateCountByReceiptId.get(receipt.id) || 0;
                        const growthHandled = handledGrowthReceiptIds.has(receipt.id);
                        const growthAction = growthActionByReceiptId.get(receipt.id) || { status: 'idle' as const };
                        return (
                        <article key={receipt.id} className="rounded-2xl bg-white border border-slate-200/70 p-4 shadow-sm">
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black">已确认</span>
                            </div>
                            <p className="mt-2.5 text-xs leading-relaxed text-slate-600">{receipt.summary}</p>
                            {receipt.acceptedFacts.length > 0 && (
                                <ul className="mt-3 space-y-1.5">
                                    {receipt.acceptedFacts.slice(0, 3).map(fact => (
                                        <li key={fact} className="text-[10px] text-slate-500 flex gap-2"><span className="text-emerald-500">✓</span><span>{fact}</span></li>
                                    ))}
                                </ul>
                            )}
                            {growthCount > 0 && (
                                <button type="button" onClick={onOpenWorldbook} className="mt-3 w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-700">{growthCount} 条世界补充待审 · 去世界书审阅</button>
                            )}
                            {growthCount === 0 && !growthHandled && growthAction.status !== 'none' && (
                                <button type="button" disabled={growthAction.status === 'loading'} onClick={() => void onGenerateWorldGrowth(receipt)} className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-50">{growthAction.status === 'loading' ? '正在整理世界变化…' : '整理这一幕的世界变化'}</button>
                            )}
                            {growthCount === 0 && growthHandled && (
                                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">这一幕的世界变化已处理</p>
                            )}
                            {growthAction.message && (
                                <p className={`mt-2 rounded-xl px-3 py-2 text-[10px] leading-relaxed ${growthAction.status === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'}`}>{growthAction.message}</p>
                            )}
                        </article>
                        );
                    })}
                </section>

                {inspection.unscopedDirectives.length > 0 && (
                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-amber-100 grid place-items-center shrink-0">!</div>
                            <div>
                                <h3 className="font-bold text-sm text-amber-900">{inspection.unscopedDirectives.length} 个旧方向尚未绑定身份</h3>
                                <p className="mt-1 text-xs leading-relaxed text-amber-700">它们只作为待整理记录显示，不会进入当前故事线，也不会自动写进记忆。</p>
                            </div>
                        </div>
                    </section>
                )}
                </div>
            </main>
        </div>
    );
};
