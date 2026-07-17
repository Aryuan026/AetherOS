import React, { useState } from 'react';
import type { NarrativeDirective } from '../../domain/narrative/types';

interface StoryDeskRouteActivationActionProps {
    directive: NarrativeDirective;
    participantNames: string;
    disabledReason?: string;
    onActivate: () => Promise<void>;
}

const activationErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('changed after this activation review')) {
        return '方向刚刚变过，请重新打开这次准备。';
    }
    if (message.includes('active persona scope')) {
        return '有参与者已经不在当前身份范围，请先修改方向。';
    }
    if (message.includes('progress bundle')) {
        return '当前身份进度已经变化，这次没有建立线路。';
    }
    return '线路草稿没有建立，方向仍保持待采纳，可以稍后再试。';
};

export const StoryDeskRouteActivationAction: React.FC<StoryDeskRouteActivationActionProps> = ({
    directive,
    participantNames,
    disabledReason,
    onActivate,
}) => {
    const [isReviewing, setIsReviewing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string>();

    const confirmActivation = async () => {
        if (isSaving || disabledReason) return;
        setIsSaving(true);
        setError(undefined);
        try {
            await onActivate();
            setIsReviewing(false);
        } catch (activationError) {
            setError(activationErrorMessage(activationError));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isReviewing) {
        return (
            <button
                type="button"
                onClick={() => { setError(undefined); setIsReviewing(true); }}
                disabled={Boolean(disabledReason)}
                title={disabledReason}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
                data-testid={`story-direction-activate-${directive.id}`}
            >
                {disabledReason ? '先整理参与者' : '准备线路'}
            </button>
        );
    }

    return (
        <div className="basis-full w-full rounded-2xl border border-indigo-100 bg-indigo-50 p-3 text-left" data-testid="story-route-activation-review">
            <div className="text-[9px] font-black tracking-[0.16em] text-indigo-400">CREATE DRAFT ROUTE</div>
            <h5 className="mt-1 text-xs font-black text-indigo-950">
                建立一条{directive.lane === 'if_line' ? ' IF ' : '主线'}草稿线路？
            </h5>
            <p className="mt-1.5 text-[10px] leading-relaxed text-indigo-700">
                方向：{directive.title}<br />同行：{participantNames || '未记录'}
            </p>
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[10px] leading-relaxed text-indigo-700">
                这一步只建立可恢复的线路整理夹：不生成场景、不开始角色行动、不推进角色时间，也不写入记忆。
            </p>
            {error && <p className="mt-2 text-[10px] leading-relaxed text-rose-600">{error}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setIsReviewing(false); setError(undefined); }} disabled={isSaving} className="rounded-lg border border-indigo-100 bg-white py-2 text-[10px] font-bold text-indigo-600">先不建立</button>
                <button type="button" onClick={confirmActivation} disabled={isSaving || Boolean(disabledReason)} className="rounded-lg bg-indigo-700 py-2 text-[10px] font-bold text-white disabled:opacity-50" data-testid="story-route-activation-confirm">
                    {isSaving ? '建立中…' : '建立草稿线路'}
                </button>
            </div>
        </div>
    );
};
