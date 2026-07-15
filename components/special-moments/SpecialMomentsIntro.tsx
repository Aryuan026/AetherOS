import React from 'react';

export const SpecialMomentsIntro: React.FC = () => (
    <div className="relative mb-3 overflow-hidden rounded-[26px] border border-white/80 bg-gradient-to-br from-white/90 via-rose-50/85 to-orange-50/80 px-4 py-4 shadow-sm">
        <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-rose-200/30 blur-2xl" />
        <div className="absolute -bottom-10 left-8 h-20 w-20 rounded-full bg-amber-200/30 blur-2xl" />
        <div className="relative">
            <div className="text-[8px] font-black uppercase tracking-[0.24em] text-rose-300">PLAY TOGETHER</div>
            <h2 className="mt-1 text-[17px] font-black tracking-tight text-slate-800">和 TA 玩点什么</h2>
            <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-bold text-rose-400">轻松一点</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-500">更懂彼此</span>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold text-sky-500">随时可停</span>
            </div>
        </div>
    </div>
);
