import React from 'react';

export const SpecialMomentsIntro: React.FC = () => (
    <>
        <div className="mb-5 rounded-[30px] border border-white/80 bg-white/85 p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-pink-300">Keepsake Moments</div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-800">由重要日子长出来的小约会</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                特别时光默认是纪念胶囊：生日、节日、第一次见面、纪念日，或他从你喜欢的地点和故事里策划的小范围角色扮演。
                完成后先封存留念，需要你确认才会进入时光簿或未来剧情钩子。
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                <div className="rounded-2xl bg-pink-50 px-2 py-2 text-pink-400">日历触发</div>
                <div className="rounded-2xl bg-amber-50 px-2 py-2 text-amber-500">时光簿节点</div>
                <div className="rounded-2xl bg-rose-50 px-2 py-2 text-rose-400">角色发起</div>
            </div>
        </div>
        <div className="mb-5 rounded-3xl border border-dashed border-rose-200 bg-rose-50/70 p-4">
            <div className="text-[11px] font-bold text-rose-400">下一步接入</div>
            <p className="mt-1 text-[12px] leading-relaxed text-rose-400/80">
                后续这里会读取日历、时光簿和收藏地点，让角色主动发起生日、纪念日、初雪、主线后休整等主题邀约。
            </p>
        </div>
    </>
);

export const SpecialMomentsScopeNotice: React.FC<{
    activeMaskLabel?: string;
    showAll: boolean;
    onToggleShowAll: () => void;
}> = ({ activeMaskLabel, showAll, onToggleShowAll }) => (
    <div className="mb-5 rounded-2xl border border-pink-100 bg-white/70 px-3 py-2.5 text-[11px] leading-relaxed text-pink-400">
        <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1">
                默认只显示当前面具「{activeMaskLabel || '未命名面具'}」链接的角色；临时回看其他人的纪念活动时可展开。
            </span>
            <button
                type="button"
                onClick={onToggleShowAll}
                className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-pink-400 shadow-sm active:scale-95"
            >
                {showAll ? '只看链接' : '显示全部'}
            </button>
        </div>
    </div>
);
