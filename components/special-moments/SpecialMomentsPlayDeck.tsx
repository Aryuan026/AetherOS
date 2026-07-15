import React from 'react';
import type { CharacterProfile } from '../../types';
import { SPECIAL_GAME_DOORS, SpecialGameId } from './specialMomentGames';

export type { SpecialGameId } from './specialMomentGames';

interface KeepsakeEntry {
    id: string;
    kind: 'heart' | 'valentine';
    character: CharacterProfile;
    timestamp: number;
}

const recordTimestamp = (character: CharacterProfile, recordKey: string): number => (
    character.specialMomentRecords?.[recordKey]?.timestamp || 0
);

export const SpecialMomentsPlayDeck: React.FC<{
    selectedGame: SpecialGameId;
    onSelectGame: (game: SpecialGameId) => void;
    characters: CharacterProfile[];
    selectedCharacterId: string;
    onSelectCharacter: (characterId: string) => void;
    heartRecordKey: string;
    onOpenHeart: (characterId: string) => void;
    onDeleteHeartRecord: (characterId: string) => void;
    valentineRecordKey: string;
    onOpenValentine: (characterId: string) => void;
    onDeleteValentineRecord: (characterId: string) => void;
    onClearKeepsakes: () => void;
}> = ({
    selectedGame,
    onSelectGame,
    characters,
    selectedCharacterId,
    onSelectCharacter,
    heartRecordKey,
    onOpenHeart,
    onDeleteHeartRecord,
    valentineRecordKey,
    onOpenValentine,
    onDeleteValentineRecord,
    onClearKeepsakes,
}) => {
    const selectedDoor = SPECIAL_GAME_DOORS.find(item => item.id === selectedGame) || SPECIAL_GAME_DOORS[0];
    const selectedCharacter = characters.find(character => character.id === selectedCharacterId) || characters[0];
    const hasHeartRecord = Boolean(selectedCharacter?.specialMomentRecords?.[heartRecordKey]);
    const keepsakeEntries: KeepsakeEntry[] = characters
        .flatMap(character => {
            const entries: KeepsakeEntry[] = [];
            if (character.specialMomentRecords?.[heartRecordKey]) {
                entries.push({
                    id: `heart-${character.id}`,
                    kind: 'heart',
                    character,
                    timestamp: recordTimestamp(character, heartRecordKey),
                });
            }
            if (character.specialMomentRecords?.[valentineRecordKey]) {
                entries.push({
                    id: `valentine-${character.id}`,
                    kind: 'valentine',
                    character,
                    timestamp: recordTimestamp(character, valentineRecordKey),
                });
            }
            return entries;
        })
        .sort((left, right) => right.timestamp - left.timestamp);

    return (
        <>
            <section aria-label="玩法门牌" className="rounded-[28px] border border-white/80 bg-white/75 p-3 shadow-[0_18px_50px_rgba(190,90,120,0.10)] backdrop-blur-xl">
                <div className="mb-3 px-1">
                    <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.24em] text-rose-300">PLAY DECK</div>
                        <h2 className="mt-0.5 text-lg font-black tracking-tight text-slate-800">想玩什么？</h2>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    {SPECIAL_GAME_DOORS.map(door => {
                        const selected = door.id === selectedGame;
                        return (
                            <button
                                key={door.id}
                                type="button"
                                data-testid={`special-game-${door.id}`}
                                aria-pressed={selected}
                                onClick={() => onSelectGame(door.id)}
                                className={`flex min-h-[58px] items-center justify-center overflow-hidden rounded-[18px] border px-2 py-2 text-center transition-all active:scale-95 ${selected ? door.selectedAccent : door.accent}`}
                            >
                                <span className="block text-[15px] font-black tracking-[0.14em]">{door.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-3 rounded-[24px] border border-slate-100 bg-white/90 p-3.5 shadow-inner shadow-slate-100/70">
                    {selectedGame === 'heart' ? (
                        <div data-testid="heart-panel">
                            <div className="flex items-center justify-between px-0.5">
                                <div className="text-xs font-black text-slate-700">选一个人</div>
                                {selectedCharacter && hasHeartRecord && (
                                    <button
                                        type="button"
                                        onClick={() => onDeleteHeartRecord(selectedCharacter.id)}
                                        className="rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-bold text-rose-400 active:scale-95"
                                    >
                                        清除旧信
                                    </button>
                                )}
                            </div>

                            {characters.length > 0 ? (
                                <div className="mt-2.5 grid max-h-40 grid-cols-4 gap-2 overflow-y-auto pr-0.5">
                                    {characters.map(character => {
                                        const selected = selectedCharacter?.id === character.id;
                                        const hasRecord = Boolean(character.specialMomentRecords?.[heartRecordKey]);
                                        return (
                                            <button
                                                key={character.id}
                                                type="button"
                                                data-testid={`heart-participant-${character.id}`}
                                                aria-pressed={selected}
                                                onClick={() => onSelectCharacter(character.id)}
                                                className={`relative flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-1 py-2 transition-all active:scale-95 ${selected ? 'border-rose-300 bg-rose-50 shadow-sm' : 'border-slate-100 bg-slate-50/70'}`}
                                            >
                                                <img src={character.avatar} className="h-9 w-9 rounded-[14px] object-cover" alt={character.name} />
                                                <span className={`w-full truncate text-center text-[10px] font-bold ${selected ? 'text-rose-600' : 'text-slate-500'}`}>{character.name}</span>
                                                <span className="w-full truncate text-center text-[8px] text-slate-400">
                                                    {hasRecord ? '有一封旧信' : '开始七次选择'}
                                                </span>
                                                {hasRecord && (
                                                    <span
                                                        aria-label={`${character.name} 有一封旧信`}
                                                        title="有一封旧信"
                                                        className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] leading-none text-rose-400 shadow-sm"
                                                    >
                                                        ✉
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 px-3 py-5 text-center">
                                    <div className="text-xs font-bold text-slate-500">当前面具还没有绑定角色</div>
                                    <div className="mt-1 text-[10px] text-slate-400">先到个人档案，把想一起玩的角色加入这个面具。</div>
                                </div>
                            )}

                            <button
                                type="button"
                                data-testid="heart-start"
                                disabled={!selectedCharacter}
                                onClick={() => selectedCharacter && onOpenHeart(selectedCharacter.id)}
                                className="mt-3 w-full rounded-[18px] bg-gradient-to-r from-rose-500 to-orange-400 py-3 text-sm font-black text-white shadow-lg shadow-rose-200/70 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {hasHeartRecord ? '回看心契' : '开始心契'}
                            </button>
                        </div>
                    ) : (
                        <div data-testid={`placeholder-${selectedGame}`} className="flex min-h-[150px] items-center justify-center">
                            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 px-8 py-5 text-center">
                                <div className="text-sm font-black text-slate-600">{selectedDoor.label}</div>
                                <div className="mt-1 text-[10px] text-slate-400">暂未开放</div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {keepsakeEntries.length > 0 && (
                <section className="mt-4 rounded-[24px] border border-white/80 bg-white/65 p-3 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-1">
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-pink-300">KEEPSAKES</div>
                            <h3 className="mt-0.5 text-sm font-black text-slate-700">往日留声</h3>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-pink-50 px-2 py-1 text-[9px] font-bold text-pink-400">{keepsakeEntries.length} 份</span>
                            <button
                                type="button"
                                data-testid="clear-keepsakes"
                                onClick={onClearKeepsakes}
                                className="rounded-full border border-pink-100 bg-white px-2.5 py-1 text-[9px] font-bold text-pink-400 active:scale-95"
                            >
                                清空
                            </button>
                        </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                        {keepsakeEntries.map(entry => {
                            const { character } = entry;
                            const isHeart = entry.kind === 'heart';
                            return (
                                <div key={entry.id} className={`flex items-center gap-2 rounded-[18px] border p-2 ${isHeart ? 'border-amber-100 bg-amber-50/65' : 'border-pink-100 bg-pink-50/65'}`}>
                                    <button
                                        type="button"
                                        onClick={() => isHeart ? onOpenHeart(character.id) : onOpenValentine(character.id)}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
                                    >
                                        <img src={character.avatar} className="h-8 w-8 rounded-xl object-cover" alt="" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[10px] font-bold text-slate-600">{character.name}</div>
                                            <div className={`mt-0.5 truncate text-[9px] ${isHeart ? 'text-amber-500' : 'text-pink-400'}`}>
                                                {isHeart ? '心契 · 点开重温' : '情人节 · 点开重温'}
                                            </div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`清除 ${character.name} 的${isHeart ? '心契' : '情人节'}记录`}
                                        onClick={() => isHeart ? onDeleteHeartRecord(character.id) : onDeleteValentineRecord(character.id)}
                                        className={`px-1 text-[10px] ${isHeart ? 'text-amber-300' : 'text-pink-300'}`}
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
        </>
    );
};
