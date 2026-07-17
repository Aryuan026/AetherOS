import React, { useEffect, useMemo, useState } from 'react';
import {
    appendStoryDirection,
    createStoryDirection,
    discardStoryDirection,
    isEditableStoryDirection,
    reviseStoryDirection,
    type StoryDirectionDraft,
} from '../../domain/narrative/directives';
import type { NarrativeDirective } from '../../domain/narrative/types';
import type { CharacterProfile } from '../../types';

interface StoryDeskDirectivePanelProps {
    bookId: string;
    progressBundleId?: string;
    directives: NarrativeDirective[];
    allDirectives: NarrativeDirective[];
    characters: CharacterProfile[];
    availableCharacters: CharacterProfile[];
    defaultCharacterIds: string[];
    onDirectivesChange: (directives: NarrativeDirective[]) => Promise<void>;
}

type EditorStep = 'closed' | 'draft' | 'review';

const DIRECTIVE_STATUS_LABELS = {
    pending: '待采纳',
    activated: '已激活',
    played: '已游玩',
    archived: '已归档',
    discarded: '已舍弃',
} as const;

const emptyDraft = (charIds: string[]): StoryDirectionDraft => ({
    title: '',
    summary: '',
    lane: 'pending_mainline',
    charIds,
});

const makeDirectiveId = (): string => {
    if (globalThis.crypto?.randomUUID) return `directive-${globalThis.crypto.randomUUID()}`;
    return `directive-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const formatSaveError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('changed after this review')) {
        return '这条方向刚刚被更新过，请退出复核后重新打开。';
    }
    if (message.includes('progress bundle')) {
        return '当前身份进度已经变化，这次没有保存。';
    }
    return '这次没有保存成功，草稿仍留在这里，可以稍后再试。';
};

export const StoryDeskDirectivePanel: React.FC<StoryDeskDirectivePanelProps> = ({
    bookId,
    progressBundleId,
    directives,
    allDirectives,
    characters,
    availableCharacters,
    defaultCharacterIds,
    onDirectivesChange,
}) => {
    const [step, setStep] = useState<EditorStep>('closed');
    const [draft, setDraft] = useState<StoryDirectionDraft>(() => emptyDraft(defaultCharacterIds));
    const [editingDirectiveId, setEditingDirectiveId] = useState<string>();
    const [editingUpdatedAt, setEditingUpdatedAt] = useState<number>();
    const [discardingDirectiveId, setDiscardingDirectiveId] = useState<string>();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string>();

    const characterById = useMemo(() => new Map(
        characters.map(character => [character.id, character]),
    ), [characters]);
    const availableIdSet = useMemo(() => new Set(
        availableCharacters.map(character => character.id),
    ), [availableCharacters]);
    const unavailableSelectedIds = draft.charIds.filter(charId => !availableIdSet.has(charId));
    const sortedDirectives = useMemo(() => [...directives].sort(
        (left, right) => right.updatedAt - left.updatedAt,
    ), [directives]);
    const pendingCount = directives.filter(directive => directive.status === 'pending').length;
    const canOpenComposer = Boolean(progressBundleId && availableCharacters.length > 0);
    const canReview = Boolean(
        draft.title.trim()
        && draft.summary.trim()
        && draft.charIds.length > 0
        && unavailableSelectedIds.length === 0
    );

    useEffect(() => {
        setStep('closed');
        setDraft(emptyDraft(defaultCharacterIds));
        setEditingDirectiveId(undefined);
        setEditingUpdatedAt(undefined);
        setDiscardingDirectiveId(undefined);
        setError(undefined);
    }, [bookId, progressBundleId]);

    const closeEditor = () => {
        setStep('closed');
        setDraft(emptyDraft(defaultCharacterIds));
        setEditingDirectiveId(undefined);
        setEditingUpdatedAt(undefined);
        setError(undefined);
    };

    const openNewDirection = () => {
        if (!canOpenComposer) return;
        setDraft(emptyDraft(defaultCharacterIds));
        setEditingDirectiveId(undefined);
        setEditingUpdatedAt(undefined);
        setError(undefined);
        setStep('draft');
    };

    const openExistingDirection = (directive: NarrativeDirective) => {
        if (!isEditableStoryDirection(directive)) return;
        setDraft({
            title: directive.title,
            summary: directive.summary,
            lane: directive.lane === 'if_line' ? 'if_line' : 'pending_mainline',
            charIds: [...directive.charIds],
        });
        setEditingDirectiveId(directive.id);
        setEditingUpdatedAt(directive.updatedAt);
        setDiscardingDirectiveId(undefined);
        setError(undefined);
        setStep('draft');
    };

    const toggleCharacter = (charId: string) => {
        setDraft(current => ({
            ...current,
            charIds: current.charIds.includes(charId)
                ? current.charIds.filter(id => id !== charId)
                : [...current.charIds, charId],
        }));
    };

    const saveDirection = async () => {
        if (!progressBundleId || !canReview || isSaving) return;
        setIsSaving(true);
        setError(undefined);
        try {
            const now = Date.now();
            const nextDirectives = editingDirectiveId && editingUpdatedAt !== undefined
                ? reviseStoryDirection(allDirectives, editingDirectiveId, {
                    ...draft,
                    progressBundleId,
                    expectedUpdatedAt: editingUpdatedAt,
                }, now)
                : appendStoryDirection(allDirectives, createStoryDirection({
                    ...draft,
                    id: makeDirectiveId(),
                    bookId,
                    progressBundleId,
                }, now));
            await onDirectivesChange(nextDirectives);
            closeEditor();
        } catch (saveError) {
            setError(formatSaveError(saveError));
        } finally {
            setIsSaving(false);
        }
    };

    const discardDirection = async (directive: NarrativeDirective) => {
        if (!progressBundleId || !isEditableStoryDirection(directive) || isSaving) return;
        setIsSaving(true);
        setError(undefined);
        try {
            const nextDirectives = discardStoryDirection(
                allDirectives,
                directive.id,
                progressBundleId,
                directive.updatedAt,
                Date.now(),
            );
            await onDirectivesChange(nextDirectives);
            setDiscardingDirectiveId(undefined);
            if (editingDirectiveId === directive.id) closeEditor();
        } catch (saveError) {
            setError(formatSaveError(saveError));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="space-y-3" data-testid="story-direction-panel">
            <div className="flex items-end justify-between gap-3 px-1">
                <div>
                    <h3 className="font-black text-sm">待演方向</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">先写意图、再复核；保存不等于已经发生</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{pendingCount}</span>
            </div>

            {step === 'closed' && (
                <button
                    type="button"
                    onClick={openNewDirection}
                    disabled={!canOpenComposer}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3.5 text-left text-white shadow-sm transition-all enabled:active:scale-[0.99] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    data-testid="story-direction-create"
                >
                    <span className="flex items-center justify-between gap-3">
                        <span>
                            <span className="block text-sm font-black">写一个剧情方向</span>
                            <span className="mt-0.5 block text-[10px] text-current opacity-60">
                                {!progressBundleId
                                    ? '先建立当前身份的进度包'
                                    : availableCharacters.length === 0
                                        ? '先给当前身份链接至少一位角色'
                                        : '只存为待采纳方向，不会自动开演'}
                            </span>
                        </span>
                        <span className="text-xl" aria-hidden="true">＋</span>
                    </span>
                </button>
            )}

            {step !== 'closed' && (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="story-direction-editor">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-black tracking-[0.16em] text-slate-400 uppercase">
                                {step === 'review' ? 'Review before saving' : editingDirectiveId ? 'Edit direction' : 'New direction'}
                            </div>
                            <h4 className="mt-1 font-black text-base">
                                {step === 'review' ? '确认这只是一个方向' : editingDirectiveId ? '修改待演方向' : '把想去的地方写下来'}
                            </h4>
                        </div>
                        <button type="button" onClick={closeEditor} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500" aria-label="关闭方向草稿">×</button>
                    </div>

                    {step === 'draft' ? (
                        <div className="mt-4 space-y-4">
                            <label className="block">
                                <span className="text-[10px] font-bold text-slate-500">一句话标题</span>
                                <input
                                    value={draft.title}
                                    onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
                                    maxLength={48}
                                    placeholder="例如：雨停以前先把话说完"
                                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold outline-none focus:border-slate-500"
                                    data-testid="story-direction-title"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-bold text-slate-500">想推演的方向</span>
                                <textarea
                                    value={draft.summary}
                                    onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))}
                                    maxLength={800}
                                    placeholder="写人物想做什么、此刻不能忽略什么；不要把结果提前写成既定事实。"
                                    className="mt-1.5 h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-500"
                                    data-testid="story-direction-summary"
                                />
                            </label>
                            <fieldset>
                                <legend className="text-[10px] font-bold text-slate-500">放在哪条线</legend>
                                <div className="mt-1.5 grid grid-cols-2 gap-2">
                                    {([
                                        ['pending_mainline', '主线候选', '以后可继续，但现在还不算发生'],
                                        ['if_line', 'IF 支线', '只看另一种可能，不进入主线事实'],
                                    ] as const).map(([lane, label, hint]) => (
                                        <button
                                            key={lane}
                                            type="button"
                                            onClick={() => setDraft(current => ({ ...current, lane }))}
                                            aria-pressed={draft.lane === lane}
                                            className={`rounded-xl border p-3 text-left transition-colors ${draft.lane === lane ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                                        >
                                            <span className="block text-xs font-black">{label}</span>
                                            <span className="mt-1 block text-[9px] leading-relaxed opacity-60">{hint}</span>
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend className="text-[10px] font-bold text-slate-500">这次和谁有关</legend>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {availableCharacters.map(character => {
                                        const selected = draft.charIds.includes(character.id);
                                        return (
                                            <button
                                                key={character.id}
                                                type="button"
                                                onClick={() => toggleCharacter(character.id)}
                                                aria-pressed={selected}
                                                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-bold ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}
                                            >
                                                <img src={character.avatar} alt="" className="h-7 w-7 rounded-full object-cover bg-slate-100" />
                                                {character.name}
                                            </button>
                                        );
                                    })}
                                    {unavailableSelectedIds.map(charId => (
                                        <button
                                            key={charId}
                                            type="button"
                                            onClick={() => toggleCharacter(charId)}
                                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700"
                                        >
                                            {characterById.get(charId)?.name || '已移出范围的角色'} · 点此移除
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                            <button
                                type="button"
                                onClick={() => { setError(undefined); setStep('review'); }}
                                disabled={!canReview}
                                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                                data-testid="story-direction-review"
                            >
                                去复核
                            </button>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3" data-testid="story-direction-review-card">
                            <div className={`rounded-2xl p-4 ${draft.lane === 'if_line' ? 'bg-violet-50 text-violet-900' : 'bg-amber-50 text-amber-950'}`}>
                                <div className="text-[9px] font-black tracking-wider opacity-50">{draft.lane === 'if_line' ? 'IF LINE' : 'MAINLINE CANDIDATE'}</div>
                                <div className="mt-1 font-black text-base">{draft.title.trim()}</div>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed opacity-75">{draft.summary.trim()}</p>
                                <div className="mt-3 text-[10px] font-bold opacity-60">
                                    参与：{draft.charIds.map(charId => characterById.get(charId)?.name || charId).join('、')}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
                                保存后仍只是“待采纳方向”：不会启动剧情、不会推进角色时间，也不会写入任何角色记忆。
                            </div>
                            {error && <div className="text-xs leading-relaxed text-rose-600">{error}</div>}
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setStep('draft')} disabled={isSaving} className="rounded-xl border border-slate-200 py-3 text-xs font-black text-slate-600">返回修改</button>
                                <button type="button" onClick={saveDirection} disabled={isSaving} className="rounded-xl bg-slate-900 py-3 text-xs font-black text-white disabled:opacity-50" data-testid="story-direction-save">
                                    {isSaving ? '保存中…' : editingDirectiveId ? '保存修改' : '存为待演方向'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && step === 'closed' && <div className="px-1 text-xs leading-relaxed text-rose-600">{error}</div>}

            {sortedDirectives.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 p-5 text-center text-xs text-slate-400">
                    当前身份还没有已绑定的剧情方向。
                </div>
            ) : sortedDirectives.map(directive => {
                const editable = isEditableStoryDirection(directive);
                const participantNames = directive.charIds
                    .map(charId => characterById.get(charId)?.name || charId)
                    .join('、');
                const isConfirmingDiscard = discardingDirectiveId === directive.id;
                return (
                    <article key={directive.id} className={`rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm ${directive.status === 'discarded' ? 'opacity-55' : ''}`}>
                        <div className="flex items-start gap-3">
                            <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${directive.lane === 'if_line' ? 'bg-violet-400' : 'bg-amber-400'}`}></div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-sm font-bold">{directive.title}</h4>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{DIRECTIVE_STATUS_LABELS[directive.status]}</span>
                                    <span className="text-[9px] font-bold text-slate-400">{directive.lane === 'if_line' ? 'IF' : '主线候选'}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{directive.summary}</p>
                                <div className="mt-2 text-[9px] text-slate-400">参与：{participantNames || '未记录'}</div>
                            </div>
                        </div>
                        {directive.status === 'pending' && (
                            editable ? (
                                isConfirmingDiscard ? (
                                    <div className="mt-3 rounded-xl bg-rose-50 p-3">
                                        <p className="text-[10px] leading-relaxed text-rose-700">只舍弃这条待演方向；正文、线路和记忆都不会被删除。</p>
                                        <div className="mt-2 flex justify-end gap-2">
                                            <button type="button" onClick={() => setDiscardingDirectiveId(undefined)} className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-500">先留着</button>
                                            <button type="button" onClick={() => discardDirection(directive)} disabled={isSaving} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">确认舍弃</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                                        <button type="button" onClick={() => setDiscardingDirectiveId(directive.id)} className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-400">舍弃</button>
                                        <button type="button" onClick={() => openExistingDirection(directive)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-700">修改</button>
                                    </div>
                                )
                            ) : (
                                <div className="mt-3 border-t border-slate-100 pt-2 text-[9px] text-slate-400">来自旧版或其他入口，当前只读</div>
                            )
                        )}
                    </article>
                );
            })}
        </section>
    );
};
