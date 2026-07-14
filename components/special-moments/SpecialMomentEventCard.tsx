import React from 'react';
import type { CharacterProfile } from '../../types';

export const SpecialMomentEventCard: React.FC<{
    emoji: string;
    title: string;
    description: string;
    actionHint: string;
    isPast: boolean;
    gradientClassName: string;
    pastGradientClassName: string;
    recordKey: string;
    recordDotClassName: string;
    characters: CharacterProfile[];
    onSelectCharacter: (characterId: string) => void;
    onLongPressStart: (characterId: string) => void;
    onLongPressEnd: () => void;
    onContextDelete: (characterId: string) => void;
}> = ({
    emoji,
    title,
    description,
    actionHint,
    isPast,
    gradientClassName,
    pastGradientClassName,
    recordKey,
    recordDotClassName,
    characters,
    onSelectCharacter,
    onLongPressStart,
    onLongPressEnd,
    onContextDelete,
}) => (
    <div className="mb-6">
        <div className={`rounded-3xl p-6 text-white relative overflow-hidden ${isPast ? pastGradientClassName : gradientClassName}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-tr-full pointer-events-none" />

            {isPast && (
                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm text-white/80 text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/20">
                    往期活动
                </div>
            )}

            <div className="relative">
                <div className="text-3xl mb-2">{emoji}</div>
                <h2 className="text-xl font-bold mb-1">{title}</h2>
                <p className="text-white/75 text-xs mb-4">{description}</p>
                <div className="text-[10px] text-white/55 mb-4">{actionHint}</div>
                <div className="max-h-64 overflow-y-auto -mx-1 px-1">
                    <div className="grid grid-cols-3 gap-3">
                        {characters.map(character => {
                            const hasRecord = Boolean(character.specialMomentRecords?.[recordKey]);
                            return (
                                <button
                                    key={character.id}
                                    onClick={() => onSelectCharacter(character.id)}
                                    onTouchStart={() => onLongPressStart(character.id)}
                                    onTouchEnd={onLongPressEnd}
                                    onTouchCancel={onLongPressEnd}
                                    onContextMenu={(e) => { e.preventDefault(); onContextDelete(character.id); }}
                                    className="flex flex-col items-center gap-2 p-3 bg-white/15 backdrop-blur-sm rounded-2xl border border-white/20 active:scale-95 transition-transform hover:bg-white/25 relative"
                                >
                                    <img src={character.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-white/30" alt={character.name} />
                                    <span className="text-[11px] font-bold truncate w-full text-center">{character.name}</span>
                                    {hasRecord && <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${recordDotClassName}`} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <p className="text-[10px] text-white/40 mt-3 text-center">长按角色可删除记录</p>
            </div>
        </div>
    </div>
);
