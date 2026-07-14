import React from 'react';
import type { CharacterProfile } from '../../types';

export const DateCharacterSelectCard: React.FC<{
    character: CharacterProfile;
    onClick: () => void;
    onOpenHistory: (e: React.MouseEvent) => void;
}> = ({ character, onClick, onOpenHistory }) => (
    <div
        onClick={onClick}
        className="bg-white/90 rounded-[24px] p-4 shadow-sm border border-white active:scale-95 transition-transform flex flex-col items-center gap-3 relative group"
    >
        <button
            onClick={onOpenHistory}
            className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-20 active:scale-90"
            aria-label={`查看 ${character.name} 的见面记录`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
        </button>
        <img src={character.avatar} className="w-16 h-16 rounded-full object-cover" alt={character.name} />
        <div className="text-center">
            <span className="block font-bold text-slate-700">{character.name}</span>
            <span className="mt-0.5 block text-[10px] text-slate-400">
                {character.savedDateState ? '有未结束的见面' : '开始一段日常场景'}
            </span>
        </div>
        {character.savedDateState && (
            <div className="absolute top-2 left-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-500">
                存档
            </div>
        )}
    </div>
);
