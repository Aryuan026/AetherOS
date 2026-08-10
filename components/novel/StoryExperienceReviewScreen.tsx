import React, { useState } from 'react';
import type { NarrativeScene, NarrativeReceiptMemoryPolicy } from '../../domain/narrative/types';
import AppHeader from '../shell/AppHeader';

export interface StoryExperienceReviewDraft {
    summary: string;
    acceptedFacts: string[];
    rejectedOrEditedFacts: string[];
    memoryPolicy: NarrativeReceiptMemoryPolicy;
}

interface StoryExperienceReviewScreenProps {
    scene: NarrativeScene;
    initialDraft: StoryExperienceReviewDraft;
    onBack: () => void;
    onConfirm: (draft: StoryExperienceReviewDraft) => Promise<void>;
    onOrganizeWithAI?: (scene: NarrativeScene, draft: StoryExperienceReviewDraft) => Promise<StoryExperienceReviewDraft>;
}

const parseFacts = (value: string): string[] => [...new Set(
    value.split('\n').map(line => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean),
)];

export const StoryExperienceReviewScreen: React.FC<StoryExperienceReviewScreenProps> = ({
    scene,
    initialDraft,
    onBack,
    onConfirm,
    onOrganizeWithAI,
}) => {
    const [summary, setSummary] = useState(initialDraft.summary);
    const [factsText, setFactsText] = useState(initialDraft.acceptedFacts.join('\n'));
    const [rejectedFactsText, setRejectedFactsText] = useState(initialDraft.rejectedOrEditedFacts.join('\n'));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const currentDraft = (): StoryExperienceReviewDraft => ({
        summary: summary.trim(),
        acceptedFacts: parseFacts(factsText),
        rejectedOrEditedFacts: parseFacts(rejectedFactsText),
        memoryPolicy: initialDraft.memoryPolicy,
    });

    const confirm = async () => {
        setError('');
        if (!summary.trim()) {
            setError('先用一句话记下这一幕发生了什么');
            return;
        }
        setIsSaving(true);
        try {
            await onConfirm(currentDraft());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '这次没有确认成功，请稍后再试');
        } finally {
            setIsSaving(false);
        }
    };

    const organize = async () => {
        if (!onOrganizeWithAI) return;
        setError('');
        setIsSaving(true);
        try {
            const next = await onOrganizeWithAI(scene, currentDraft());
            setSummary(next.summary);
            setFactsText(next.acceptedFacts.join('\n'));
            setRejectedFactsText(next.rejectedOrEditedFacts.join('\n'));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '这次没有整理成功，你仍可以手动修改');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="h-full min-h-0 w-full bg-[#f7f5f1] flex flex-col" data-testid="story-experience-review">
            <AppHeader title="确认这一幕" subtitle="你确认的部分才会成为经历" onBack={onBack} />
            <main className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-[max(7rem,env(safe-area-inset-bottom))] no-scrollbar">
                <div className="mx-auto max-w-xl space-y-5">
                    <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg">
                        <div className="text-[10px] font-black tracking-[0.18em] text-white/50">刚刚结束</div>
                        <h2 className="mt-2 text-lg font-black">{scene.title}</h2>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-white/65">
                            {scene.location && <span className="rounded-full bg-white/10 px-2.5 py-1">{scene.location}</span>}
                            <span className="rounded-full bg-white/10 px-2.5 py-1">{scene.beats.length} 段正文</span>
                        </div>
                    </section>
                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">这一幕发生了什么</span>
                        <textarea value={summary} onChange={event => setSummary(event.target.value)} rows={6} className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                    </label>
                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">暂不算作事实 <span className="font-normal text-slate-300">（一行一条，可留空）</span></span>
                        <textarea value={rejectedFactsText} onChange={event => setRejectedFactsText(event.target.value)} rows={4} placeholder="有歧义、删改过或不希望延续的内容" className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                    </label>
                    <label className="block">
                        <span className="mb-2 block text-xs font-bold text-slate-500">要留下的事实 <span className="font-normal text-slate-300">（一行一条，可留空）</span></span>
                        <textarea value={factsText} onChange={event => setFactsText(event.target.value)} rows={6} placeholder="例如：两人约定下周再见" className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                    </label>
                    <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-400">手稿原文会继续留在这本书里；这里保存的是你确认后的经历，不会把章节总结冒充成剧情事实。</p>
                    {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-600">{error}</p>}
                </div>
            </main>
            <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur-xl">
                <div className="mx-auto flex max-w-xl gap-3">
                    {onOrganizeWithAI && (
                        <button type="button" disabled={isSaving} onClick={organize} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 disabled:opacity-50">帮我整理</button>
                    )}
                    <button type="button" disabled={isSaving} onClick={confirm} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50">
                        {isSaving ? '正在确认…' : '确认这段经历'}
                    </button>
                </div>
            </footer>
        </div>
    );
};
