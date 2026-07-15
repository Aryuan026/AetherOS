export type SpecialGameId = 'heart' | 'guess' | 'night' | 'order';

export type SpecialGameState = 'playable' | 'placeholder' | 'shape_hold';

export interface SpecialGameDoor {
    id: SpecialGameId;
    label: string;
    state: SpecialGameState;
    accent: string;
    selectedAccent: string;
}

export const SPECIAL_GAME_DOORS: SpecialGameDoor[] = [
    {
        id: 'heart',
        label: '心契',
        state: 'playable',
        accent: 'border-rose-100 bg-rose-50/70 text-rose-500',
        selectedAccent: 'border-rose-300 bg-gradient-to-br from-rose-500 to-orange-400 text-white shadow-lg shadow-rose-200/70',
    },
    {
        id: 'guess',
        label: '猜猜',
        state: 'placeholder',
        accent: 'border-sky-100 bg-sky-50/70 text-sky-500',
        selectedAccent: 'border-sky-300 bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-200/70',
    },
    {
        id: 'night',
        label: '夜色',
        state: 'placeholder',
        accent: 'border-violet-100 bg-violet-50/70 text-violet-500',
        selectedAccent: 'border-violet-300 bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-200/70',
    },
    {
        id: 'order',
        label: '点单',
        state: 'shape_hold',
        accent: 'border-amber-100 bg-amber-50/70 text-amber-600',
        selectedAccent: 'border-amber-300 bg-gradient-to-br from-amber-500 to-yellow-400 text-white shadow-lg shadow-amber-200/70',
    },
];
