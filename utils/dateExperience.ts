import { CharacterProfile } from '../types';
import { publicAsset } from './publicAssets';

export const DATE_EXPERIENCE_BOUNDARY = `### 见面边界：日常陪伴 / 轻剧情
“见面”默认是一段低烈度的面对面日常：吃饭、散步、探望、陪伴、短场景角色扮演，重点是关系温度和此刻的生活质感。
- 不要主动制造主线级危机、NPC死亡、世界毁灭、强制任务或不可逆剧情转折。
- 如果用户明确要求推进剧情，可以把它写成局部体验或温和伏笔，但不要擅自认定为主线事实。
- 重大剧情应交给未来的“世界旅行 / 剧情推演”入口，并在结束后由用户确认是否归档。`;

export const DATE_SELECT_TAGS = ['轻剧情', '可保存进度', '关系回声'] as const;

export const DATE_REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'] as const;

export const resolveDateSpriteMap = (char: CharacterProfile): Record<string, string> => {
    if (char.activeSkinSetId && char.dateSkinSets) {
        const activeSkin = char.dateSkinSets.find(skin => skin.id === char.activeSkinSetId);
        if (activeSkin?.sprites && Object.keys(activeSkin.sprites).length > 0) {
            return activeSkin.sprites;
        }
    }
    return char.sprites || {};
};

export const resolveDateDefaultPortrait = (char: CharacterProfile): {
    portrait?: string;
    hasDedicatedPortrait: boolean;
} => {
    const sprites = resolveDateSpriteMap(char);
    const preferredKeys = [
        'normal',
        'default',
        ...DATE_REQUIRED_EMOTIONS,
        ...(char.customDateSprites || []),
    ];
    const portrait = preferredKeys.map(key => sprites[key]).find(Boolean)
        || Object.values(sprites).find(Boolean);

    return {
        portrait,
        hasDedicatedPortrait: Boolean(portrait),
    };
};

export type DateTimePhase = 'dawn' | 'day' | 'dusk' | 'night';

export const getDateTimePhase = (hour = 20): DateTimePhase => {
    if (hour >= 5 && hour < 10) return 'dawn';
    if (hour >= 10 && hour < 17) return 'day';
    if (hour >= 17 && hour < 21) return 'dusk';
    return 'night';
};

export const BUILT_IN_DATE_BACKGROUNDS: Array<{
    id: string;
    label: string;
    phase: DateTimePhase;
    src: string;
}> = [
    {
        id: 'cafe-dawn',
        label: '晨光咖啡厅',
        phase: 'dawn',
        src: publicAsset('assets/aetheros/date-backgrounds/cafe-dawn.png'),
    },
    {
        id: 'cafe-day',
        label: '晴日咖啡厅',
        phase: 'day',
        src: publicAsset('assets/aetheros/date-backgrounds/cafe-day.png'),
    },
    {
        id: 'cafe-dusk',
        label: '黄昏咖啡厅',
        phase: 'dusk',
        src: publicAsset('assets/aetheros/date-backgrounds/cafe-dusk.png'),
    },
    {
        id: 'lounge-night',
        label: '夜间休息室',
        phase: 'night',
        src: publicAsset('assets/aetheros/date-backgrounds/lounge-night.png'),
    },
];

export const getBuiltInDateBackgroundForHour = (hour = 20) => {
    const phase = getDateTimePhase(hour);
    return BUILT_IN_DATE_BACKGROUNDS.find(bg => bg.phase === phase) || BUILT_IN_DATE_BACKGROUNDS[0];
};

export const getDateFallbackMood = (name: string, hour = 20): {
    from: string;
    via: string;
    to: string;
    glow: string;
    phase: DateTimePhase;
} => {
    const phase = getDateTimePhase(hour);
    const palettes: Record<ReturnType<typeof getDateTimePhase>, Array<{
        from: string;
        via: string;
        to: string;
        glow: string;
    }>> = {
        dawn: [
            { from: '#26324a', via: '#79666d', to: '#ffd6a5', glow: 'rgba(255, 214, 165, 0.38)' },
            { from: '#203449', via: '#6d7d8d', to: '#fbcfe8', glow: 'rgba(251, 207, 232, 0.34)' },
            { from: '#1f2937', via: '#55718a', to: '#fde68a', glow: 'rgba(253, 230, 138, 0.32)' },
        ],
        day: [
            { from: '#dbeafe', via: '#f8fafc', to: '#fde68a', glow: 'rgba(255, 255, 255, 0.46)' },
            { from: '#c7d2fe', via: '#f5f3ff', to: '#bae6fd', glow: 'rgba(186, 230, 253, 0.42)' },
            { from: '#e0f2fe', via: '#fff7ed', to: '#fed7aa', glow: 'rgba(254, 215, 170, 0.38)' },
        ],
        dusk: [
            { from: '#111827', via: '#3b2f4a', to: '#f5b5c8', glow: 'rgba(245, 181, 200, 0.42)' },
            { from: '#1f1b14', via: '#4a341c', to: '#f6d365', glow: 'rgba(246, 211, 101, 0.34)' },
            { from: '#191724', via: '#43345d', to: '#c4b5fd', glow: 'rgba(196, 181, 253, 0.36)' },
        ],
        night: [
            { from: '#020617', via: '#111827', to: '#312e81', glow: 'rgba(129, 140, 248, 0.28)' },
            { from: '#030712', via: '#172033', to: '#0f766e', glow: 'rgba(45, 212, 191, 0.24)' },
            { from: '#0f0a19', via: '#1f1533', to: '#7c2d12', glow: 'rgba(251, 146, 60, 0.22)' },
        ],
    };
    const phasePalettes = palettes[phase];
    const index = Array.from(name || 'AetherOS').reduce((sum, char) => sum + char.charCodeAt(0), 0) % phasePalettes.length;
    return { ...phasePalettes[index % phasePalettes.length], phase };
};
