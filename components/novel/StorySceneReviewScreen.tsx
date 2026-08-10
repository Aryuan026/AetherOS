import React, { useMemo, useState } from 'react';
import type { AcceptedNarrativeSceneShell } from '../../domain/narrative/sceneLifecycle';
import type { NarrativeRun } from '../../domain/narrative/types';
import type { CharacterProfile } from '../../types';
import AppHeader from '../shell/AppHeader';

interface StorySceneReviewScreenProps {
    run: NarrativeRun;
    characters: CharacterProfile[];
    requiredCharacterId: string;
    onBack: () => void;
    onAccept: (shell: AcceptedNarrativeSceneShell) => Promise<void>;
    onPrepareWithAI?: (draft: StorySceneDraft) => Promise<StorySceneDraft>;
}

export interface StorySceneDraft {
    title: string;
    location?: string;
    participantIds: string[];
    objective?: string;
    constraints: string[];
}

const uniqueStrings = (values: readonly string[]): string[] => [...new Set(
    values.map(value => value.trim()).filter(Boolean),
)];

export const StorySceneReviewScreen: React.FC<StorySceneReviewScreenProps> = ({
    run,
    characters,
    requiredCharacterId,
    onBack,
    onAccept,
    onPrepareWithAI,
}) => {
    const availableParticipants = useMemo(() => characters.filter(character => (
        run.participantCharIds.includes(character.id)
    )), [characters, run.participantCharIds]);
    const [title, setTitle] = useState(run.routeSummary?.trim() || '下一幕');
    const [location, setLocation] = useState('');
    const [objective, setObjective] = useState(run.routeSummary?.trim() || '');
    const [constraintsText, setConstraintsText] = useState('');
    const [participantIds, setParticipantIds] = useState<string[]>(run.participantCharIds);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const buildDraft = (): StorySceneDraft => ({
        title: title.trim(),
        location: location.trim() || undefined,
        participantIds: uniqueStrings(participantIds),
        objective: objective.trim() || undefined,
        constraints: uniqueStrings(constraintsText.split('\n')),
    });

    const buildShell = (): AcceptedNarrativeSceneShell => ({
        kind: 'narrative_scene_shell',
        acceptedByUser: true,
        id: `narrative-scene:${run.id}:${Date.now()}`,
        runId: run.id,
        ...buildDraft(),
    });

    const accept = async () => {
        setError('');
        if (!title.trim()) {
            setError('先给这一幕起个容易认出来的名字');
            return;
        }
        if (!participantIds.includes(requiredCharacterId)) {
            setError('当前关系中的角色必须留在这一幕里');
            return;
        }
        setIsSaving(true);
        try {
            await onAccept(buildShell());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '这一幕没有开始成功，请稍后再试');
        } finally {
            setIsSaving(false);
        }
    };

    const prepareWithAI = async () => {
        if (!onPrepareWithAI) return;
        setError('');
        setIsSaving(true);
        try {
            const prepared = await onPrepareWithAI(buildDraft());
            setTitle(prepared.title);
            setLocation(prepared.location || '');
            setObjective(prepared.objective || '');
            setParticipantIds([...prepared.participantIds]);
            setConstraintsText(prepared.constraints.join('\n'));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '这次没有整理成功，你仍可以手动修改');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="h-full min-h-0 w-full bg-[#f7f5f1] flex flex-col" data-testid="story-scene-review">
            <AppHeader title="准备下一幕" subtitle="确认后再去手稿继续写" onBack={onBack} />
            <main className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-[max(7rem,env(safe-area-inset-bottom))] no-scrollbar">
                <div className="mx-auto max-w-xl space-y-5">
                    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <div className="text-[10px] font-black tracking-[0.18em] text-slate-400">{run.lane === 'if_line' ? 'IF 线' : '主线'}</div>
                        <h2 className="mt-2 text-lg font-black text-slate-800">{run.routeSummary || '未命名故事线'}</h2>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">这里只准备一个可修改的开场壳。还没去手稿写出的内容，不会算作已经发生。</p>
                    </section>

                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">这一幕叫什么</span>
                        <input value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-slate-400" />
                    </label>
                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">这一幕要尊重的条件 <span className="font-normal text-slate-300">（一行一条，可留空）</span></span>
                        <textarea value={constraintsText} onChange={event => setConstraintsText(event.target.value)} rows={4} placeholder="例如：秘密身份暂时不能被旁人发现" className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                    </label>
                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">从哪里开始 <span className="font-normal text-slate-300">（可留空）</span></span>
                        <input value={location} onChange={event => setLocation(event.target.value)} placeholder="例如：雨停后的车站" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400" />
                    </label>
                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">这次想往哪里走 <span className="font-normal text-slate-300">（可留空）</span></span>
                        <textarea value={objective} onChange={event => setObjective(event.target.value)} rows={4} className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                    </label>

                    <fieldset>
                        <legend className="mb-2 text-xs font-bold text-slate-500">谁在这一幕里</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {availableParticipants.map(character => {
                                const selected = participantIds.includes(character.id);
                                return (
                                    <button
                                        type="button"
                                        key={character.id}
                                        aria-pressed={selected}
                                        disabled={character.id === requiredCharacterId}
                                        onClick={() => setParticipantIds(current => selected
                                            ? current.filter(id => id !== character.id)
                                            : [...current, character.id])}
                                        className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-xs font-bold transition-colors disabled:cursor-default ${selected ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                                    >
                                        <img src={character.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                                        <span className="truncate">{character.name}{character.id === requiredCharacterId ? ' · 必须在场' : ''}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                    {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-600">{error}</p>}
                </div>
            </main>
            <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur-xl">
                <div className="mx-auto flex max-w-xl gap-3">
                    {onPrepareWithAI && (
                        <button type="button" disabled={isSaving} onClick={prepareWithAI} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 disabled:opacity-50">帮我整理</button>
                    )}
                    <button type="button" disabled={isSaving} onClick={accept} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50">
                        {isSaving ? '正在开始…' : '开始这一幕'}
                    </button>
                </div>
            </footer>
        </div>
    );
};
