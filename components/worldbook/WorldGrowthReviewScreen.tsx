import React, { useMemo, useState } from 'react';
import { ArrowBendDownRight, Clock, Trash } from '@phosphor-icons/react';
import AppHeader from '../shell/AppHeader';
import type {
  CharacterProfile,
  WorldbookGroupAssignment,
  WorldGrowthCandidate,
  WorldGrowthCandidatePlayerReview,
} from '../../types';
import { createWorldbookGroupAssignment } from '../../utils/worldbookGroups';
import { worldGrowthSourceLabel } from '../../utils/worldbookPlayerView';
import WorldbookGroupPicker from './WorldbookGroupPicker';

interface Props {
  candidates: readonly WorldGrowthCandidate[];
  characters: readonly Pick<CharacterProfile, 'id' | 'name'>[];
  groupOptions: readonly WorldbookGroupAssignment[];
  defaultGroup: WorldbookGroupAssignment;
  targetGroupsByEntryId: Readonly<Record<string, WorldbookGroupAssignment | undefined>>;
  onClose: () => void;
  onAccept: (candidateId: string, review: WorldGrowthCandidatePlayerReview) => Promise<void>;
  onDefer: (candidateId: string) => Promise<void>;
  onIgnore: (candidateId: string) => Promise<void>;
}

const humanCandidateError = (reason: unknown): string => {
  const message = reason instanceof Error ? reason.message : '';
  if (/stale|base revision|active revision/iu.test(message)) {
    return '这条世界书在候选出现后又被修改过。请返回书架查看最新版，再重新处理这条建议。';
  }
  if (/cannot be accepted|already|accepted|ignored/iu.test(message)) {
    return '这条建议已经处理过，不会重复写入。';
  }
  return message || '这次没有保存成功，请稍后再试。';
};

const WorldGrowthReviewScreen: React.FC<Props> = ({
  candidates,
  characters,
  groupOptions,
  defaultGroup,
  targetGroupsByEntryId,
  onClose,
  onAccept,
  onDefer,
  onIgnore,
}) => {
  const initialGroupFor = (candidate: WorldGrowthCandidate): WorldbookGroupAssignment => {
    const targetGroup = candidate.targetEntryId
      ? targetGroupsByEntryId[candidate.targetEntryId]
      : undefined;
    if (targetGroup) return targetGroup;
    const scopeOwner = candidate.scope?.charId;
    const existing = scopeOwner
      ? groupOptions.find(group => group.owner.kind === 'character' && group.owner.charId === scopeOwner)
      : undefined;
    if (existing) return existing;
    const character = characters.find(item => item.id === scopeOwner);
    return character
      ? createWorldbookGroupAssignment({
          name: candidate.draft.category.trim() || character.name,
          owner: { kind: 'character', charId: character.id },
        })
      : defaultGroup;
  };
  const [reviews, setReviews] = useState<Record<string, WorldGrowthCandidatePlayerReview>>(() => (
    Object.fromEntries(candidates.map(candidate => [candidate.id, {
      title: candidate.draft.title,
      content: candidate.draft.content,
      group: initialGroupFor(candidate),
    }]))
  ));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sourceLabel = useMemo(
    () => candidates[0] ? worldGrowthSourceLabel(candidates[0]) : '故事生长',
    [candidates],
  );

  const run = async (candidateId: string, action: () => Promise<void>, closeAfter = false) => {
    setBusyId(candidateId);
    setErrors(previous => ({ ...previous, [candidateId]: '' }));
    try {
      await action();
      if (closeAfter) onClose();
    } catch (reason) {
      setErrors(previous => ({ ...previous, [candidateId]: humanCandidateError(reason) }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans" data-world-growth-review-screen>
      <AppHeader
        title="整理故事生长"
        subtitle={`${sourceLabel} · ${candidates.length} 条`}
        onBack={onClose}
        className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"
      />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 no-scrollbar">
        <div className="rounded-[24px] border border-violet-100 bg-violet-50/70 px-4 py-4 text-xs leading-6 text-violet-700">
          这些只是整理建议。保存前不会改变世界书；每一条都可以单独留下、稍后处理或忽略。
        </div>

        {candidates.map((candidate, index) => {
          const review = reviews[candidate.id] || {
            title: candidate.draft.title,
            content: candidate.draft.content,
            group: initialGroupFor(candidate),
          };
          const busy = busyId === candidate.id;
          return (
            <section key={candidate.id} className="space-y-4 rounded-[28px] border border-white bg-white/85 p-4 shadow-sm" data-world-growth-candidate={candidate.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.18em] text-violet-400">建议 {index + 1}</div>
                  <div className="mt-1 text-xs text-slate-400">{candidate.targetEntryId ? '补充已有条目' : '新增世界书条目'}</div>
                </div>
                {candidate.status === 'deferred' && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">稍后处理</span>
                )}
              </div>

              <input
                value={review.title}
                onChange={event => setReviews(previous => ({
                  ...previous,
                  [candidate.id]: { ...review, title: event.target.value },
                }))}
                placeholder="标题"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-violet-400"
              />
              {candidate.targetEntryId && targetGroupsByEntryId[candidate.targetEntryId] ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  保存回原分组：<strong className="text-slate-700">{review.group.name}</strong>
                </div>
              ) : (
                <WorldbookGroupPicker
                  characters={characters}
                  groups={groupOptions}
                  value={review.group}
                  onChange={group => setReviews(previous => ({
                    ...previous,
                    [candidate.id]: { ...review, group },
                  }))}
                />
              )}
              <textarea
                value={review.content}
                onChange={event => setReviews(previous => ({
                  ...previous,
                  [candidate.id]: { ...review, content: event.target.value },
                }))}
                placeholder="设定正文"
                className="min-h-60 w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm leading-7 text-slate-700 outline-none focus:border-violet-400"
              />

              {errors[candidate.id] && (
                <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">
                  {errors[candidate.id]}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void run(candidate.id, () => onAccept(candidate.id, {
                  ...review,
                  title: review.title.trim(),
                  group: { ...review.group, name: review.group.name.trim() },
                }))}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-100 disabled:opacity-50"
              >
                <ArrowBendDownRight size={18} weight="bold" /> 保存到我的世界书
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(candidate.id, () => onDefer(candidate.id), true)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-xs font-bold text-slate-600 disabled:opacity-50"
                >
                  <Clock size={16} /> 以后再说
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(candidate.id, () => onIgnore(candidate.id))}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-xs font-bold text-red-500 disabled:opacity-50"
                >
                  <Trash size={16} /> 忽略
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default WorldGrowthReviewScreen;
