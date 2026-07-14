import React from 'react';
import type { CharacterProfile } from '../../types';

export const DeleteSpecialMomentDialog: React.FC<{
    targetId: string | null;
    characters: CharacterProfile[];
    title: string;
    description: (characterName: string) => React.ReactNode;
    onCancel: () => void;
    onConfirm: (characterId: string) => void;
}> = ({ targetId, characters, title, description, onCancel, onConfirm }) => {
    if (!targetId) return null;
    const characterName = characters.find(c => c.id === targetId)?.name || '';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 animate-fade-in">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl">
                <div className="text-center mb-4">
                    <div className="text-3xl mb-2">🗑️</div>
                    <h3 className="font-bold text-slate-700 text-base">{title}</h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        {description(characterName)}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-2.5 bg-slate-100 text-slate-500 font-bold rounded-xl active:scale-95 transition-transform text-sm">取消</button>
                    <button onClick={() => onConfirm(targetId)} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl active:scale-95 transition-transform text-sm">确认删除</button>
                </div>
            </div>
        </div>
    );
};
