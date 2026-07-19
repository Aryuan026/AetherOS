import React from 'react';
import { DATE_SELECT_TAGS } from '../../utils/dateExperience';

const tagClassNames = [
    'bg-rose-50 text-rose-400',
    'bg-amber-50 text-amber-500',
    'bg-sky-50 text-sky-500',
];

export const DateSelectIntro: React.FC = () => (
    <div className="mx-4 mt-3 rounded-[28px] border border-white/80 bg-white/80 p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-rose-300">Daily Meet</div>
        <div className="mt-1 text-lg font-bold tracking-tight text-slate-800">去赴一场今天的小约</div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
            {DATE_SELECT_TAGS.map((tag, index) => (
                <span key={tag} className={`rounded-full px-2.5 py-1 ${tagClassNames[index]}`}>
                    {tag}
                </span>
            ))}
        </div>
    </div>
);

export const DatePersonaScopeNotice: React.FC<{
    activeMaskLabel?: string;
}> = ({ activeMaskLabel }) => (
    <div className="mx-4 mt-3 rounded-2xl border border-rose-100 bg-white/70 px-3 py-2.5 text-[11px] leading-relaxed text-rose-400">
        这里属于面具「{activeMaskLabel || '未命名面具'}」的生活圈，只显示已经链接的角色。
    </div>
);
