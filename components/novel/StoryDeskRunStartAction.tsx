import React, { useState } from 'react';

interface StoryDeskRunStartActionProps {
    runId: string;
    disabledReason?: string;
    onStart: () => Promise<void>;
}

export const StoryDeskRunStartAction: React.FC<StoryDeskRunStartActionProps> = ({
    runId,
    disabledReason,
    onStart,
}) => {
    const [isReviewing, setIsReviewing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const confirmStart = async () => {
        if (disabledReason || isSaving) return;
        setError('');
        setIsSaving(true);
        try {
            await onStart();
            setIsReviewing(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '故事线没有开始成功，请重新打开故事线后再试。');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isReviewing) {
        return (
            <div className="mt-4">
                <button
                    type="button"
                    data-testid={`story-run-start-${runId}`}
                    disabled={Boolean(disabledReason)}
                    onClick={() => {
                        setError('');
                        setIsReviewing(true);
                    }}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white shadow-sm transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                    开始这条故事线
                </button>
                {disabledReason && (
                    <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-400">{disabledReason}</p>
                )}
            </div>
        );
    }

    return (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid={`story-run-start-review-${runId}`}>
            <h5 className="text-sm font-black text-slate-800">开始这条故事线？</h5>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                开始后就可以准备第一幕，再去手稿和角色一起把它写下来。
            </p>
            {error && (
                <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] leading-relaxed text-rose-600">{error}</div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                        setError('');
                        setIsReviewing(false);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-500 disabled:opacity-50"
                >
                    再想想
                </button>
                <button
                    type="button"
                    data-testid={`story-run-start-confirm-${runId}`}
                    disabled={isSaving}
                    onClick={confirmStart}
                    className="rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                    {isSaving ? '正在开始…' : '确认开始'}
                </button>
            </div>
        </div>
    );
};
