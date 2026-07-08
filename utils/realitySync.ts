import type { RealtimeConfig } from '../types';
import { RealtimeContextManager, type WeatherData, defaultRealtimeConfig } from './realtimeContext';

type RealitySyncMode = NonNullable<RealtimeConfig['realitySyncMode']>;
type WeatherScope = NonNullable<RealtimeConfig['weatherScope']>;
type CareBoundary = NonNullable<RealtimeConfig['careBoundary']>;

export type RealitySyncSurface = 'chat' | 'proactive_letter' | 'call' | 'scene';

interface WeatherState {
    city: string;
    kind: string;
    temp: number;
    description: string;
    observedAt: number;
    lastEventAt?: number;
}

const WEATHER_STATE_KEY = 'aetheros_reality_weather_state_v1';
const WEATHER_EVENT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const TEMP_DELTA_EVENT = 5;

const normalizeConfig = (config?: RealtimeConfig): Required<Pick<RealtimeConfig, 'weatherEnabled' | 'weatherApiKey' | 'weatherCity' | 'cacheMinutes'>> & {
    realitySyncMode: RealitySyncMode;
    weatherScope: WeatherScope;
    careBoundary: CareBoundary;
} => ({
    ...defaultRealtimeConfig,
    ...(config || {}),
    realitySyncMode: config?.realitySyncMode || defaultRealtimeConfig.realitySyncMode || 'real_anchor',
    weatherScope: config?.weatherScope || defaultRealtimeConfig.weatherScope || 'user_only',
    careBoundary: config?.careBoundary || defaultRealtimeConfig.careBoundary || 'soft',
});

const canUseLocalStorage = (): boolean => (
    typeof window !== 'undefined'
    && typeof window.localStorage !== 'undefined'
);

const readWeatherState = (): Record<string, WeatherState> => {
    if (!canUseLocalStorage()) return {};
    try {
        return JSON.parse(window.localStorage.getItem(WEATHER_STATE_KEY) || '{}') as Record<string, WeatherState>;
    } catch {
        return {};
    }
};

const writeWeatherState = (state: Record<string, WeatherState>): void => {
    if (!canUseLocalStorage()) return;
    try {
        window.localStorage.setItem(WEATHER_STATE_KEY, JSON.stringify(state));
    } catch {
        // Reality sync should never block prompt construction.
    }
};

const weatherKind = (weather: WeatherData): string => {
    const desc = `${weather.description} ${weather.icon}`.toLowerCase();
    if (/雷|thunder|storm|11/.test(desc)) return '雷雨';
    if (/雨|rain|drizzle|09|10/.test(desc)) return '雨';
    if (/雪|snow|13/.test(desc)) return '雪';
    if (/雾|霾|mist|fog|haze|50/.test(desc)) return '雾';
    if (weather.temp >= 32) return '高温';
    if (weather.temp <= 3) return '低温';
    if (/云|cloud|02|03|04/.test(desc)) return '多云';
    return '晴朗';
};

const describeTime = (includeDate: boolean): string => {
    const full = RealtimeContextManager.getTimeContext();
    if (includeDate) return full;
    const daypart = full.match(/(早晨|上午|中午|下午|傍晚|晚上|深夜)\d{1,2}:\d{2}/)?.[0];
    return daypart ? `当前现实昼夜节律：${daypart}` : full.replace(/^现在是\s*/, '当前现实昼夜节律：');
};

const buildRuleText = (mode: RealitySyncMode, weatherScope: WeatherScope, careBoundary: CareBoundary): string[] => {
    const lines: string[] = ['### 现实同频规则（高优先级边界）'];
    if (mode === 'real_anchor') {
        lines.push('- 模式：现实锚定 / 次元相隔。真实日期、昼夜和可用天气是用户所在现实世界的信号。');
        lines.push('- 你可以关心用户现实里的作息和天气，但你与用户隔着次元壁；不要说“我去接你”“我到你楼下了”等真实物理介入。');
        lines.push('- 开启剧情/见面体验时，默认是用户进入你的世界或临时交汇，不要把现实城市直接改写成剧情地点。');
    } else if (mode === 'rhythm_weather') {
        lines.push('- 模式：昼夜同频 / 同一世界的不同位置。不要把真实日期当成剧情日期；只使用昼夜节律和天气氛围。');
        lines.push('- 你和用户可以像在同一世界不同地点生活。天气可以有关联但不必完全一致。');
        lines.push('- 可以把天气变化当成稍后影响你那边的小回声，但不要每次回复都播报天气。');
    } else {
        lines.push('- 模式：剧情自由 / 不同频。不要使用真实日期、真实时间或真实天气来约束剧情。');
        lines.push('- 用户可能在任意现实时间游玩任意剧情；不要因为现实深夜就强迫睡觉，除非用户自己提到疲惫或打开了明确生活照看。');
    }

    if (weatherScope === 'user_only') {
        lines.push('- 天气边界：天气只代表用户所在地；你只能表达关心，不要声称自己正在经历同一场天气。');
    } else if (weatherScope === 'shared_echo') {
        lines.push('- 天气边界：天气可作为共享氛围或延迟回声；你那边可以稍后被同类天气影响，但要自然、克制。');
    } else {
        lines.push('- 天气边界：不要读取或提及现实天气。');
    }

    if (careBoundary === 'soft') {
        lines.push('- 生活照看：语气轻，像伴侣的关心；不要像任务管理器，也不要频繁催促。');
    } else if (careBoundary === 'direct') {
        lines.push('- 生活照看：可以更明确地提醒吃饭、睡觉、带伞，但仍须保持角色口吻。');
    } else {
        lines.push('- 生活照看：不要主动管理用户现实生活，除非用户直接求助。');
    }
    return lines;
};

const buildWeatherLines = (
    weather: WeatherData,
    mode: RealitySyncMode,
    weatherScope: WeatherScope,
): string[] => {
    if (weatherScope === 'off' || mode === 'fiction_free') return [];
    const advice = RealtimeContextManager.generateWeatherAdvice(weather);
    const prefix = weatherScope === 'shared_echo' ? '【用户天气/可回声】' : '【用户天气】';
    return [`${prefix}${weather.city}: ${weather.temp}°C，体感${weather.feelsLike}°C，${weather.description}，湿度${weather.humidity}%${advice ? `。${advice}` : ''}`];
};

const maybeBuildWeatherEvent = (
    weather: WeatherData,
    mode: RealitySyncMode,
    weatherScope: WeatherScope,
): string | null => {
    if (mode === 'fiction_free' || weatherScope === 'off') return null;
    const now = Date.now();
    const state = readWeatherState();
    const cityKey = weather.city || 'default';
    const previous = state[cityKey];
    const currentKind = weatherKind(weather);

    let event = '';
    if (previous) {
        const tempDelta = weather.temp - previous.temp;
        const kindChanged = previous.kind !== currentKind;
        const tempChanged = Math.abs(tempDelta) >= TEMP_DELTA_EVENT;
        const cooledDown = !previous.lastEventAt || now - previous.lastEventAt > WEATHER_EVENT_COOLDOWN_MS;
        if (cooledDown && (kindChanged || tempChanged)) {
            const pieces = [
                kindChanged ? `天气从${previous.kind}变成${currentKind}` : '',
                tempChanged ? `温度${tempDelta > 0 ? '升高' : '降低'}约${Math.abs(tempDelta)}°C` : '',
            ].filter(Boolean);
            event = `【天气悬挂】${pieces.join('，')}。这只是一次短期氛围线索；可以自然提一次，之后不要反复播报。`;
            if (weatherScope === 'shared_echo') {
                event += ' 在共享回声模式下，可以让这场天气稍后轻轻影响到你那边。';
            }
        }
    }

    state[cityKey] = {
        city: weather.city,
        kind: currentKind,
        temp: weather.temp,
        description: weather.description,
        observedAt: now,
        lastEventAt: event ? now : previous?.lastEventAt,
    };
    writeWeatherState(state);
    return event || null;
};

export const buildRealitySyncContext = async (
    config?: RealtimeConfig,
    surface: RealitySyncSurface = 'chat',
): Promise<string> => {
    const normalized = normalizeConfig(config);
    const mode = normalized.realitySyncMode;
    const weatherScope = normalized.weatherEnabled ? normalized.weatherScope : 'off';
    const lines = buildRuleText(mode, weatherScope, normalized.careBoundary);

    lines.push('');
    lines.push('### 现实信号快照');
    if (mode === 'fiction_free') {
        lines.push('【时间】现实时间不同频，不要把真实日期/昼夜写入剧情。');
    } else {
        lines.push(`【时间】${describeTime(mode === 'real_anchor')}`);
        const specialDate = mode === 'real_anchor' ? RealtimeContextManager.checkSpecialDates() : null;
        if (specialDate) lines.push(`【特殊日期】今天是${specialDate}`);
    }

    if (normalized.weatherEnabled && weatherScope !== 'off' && mode !== 'fiction_free') {
        const weather = await RealtimeContextManager.fetchWeather(normalized);
        if (weather) {
            lines.push(...buildWeatherLines(weather, mode, weatherScope));
            const event = maybeBuildWeatherEvent(weather, mode, weatherScope);
            if (event) lines.push(event);
        } else {
            lines.push('【天气】天气接口暂不可用；不要编造具体天气。');
        }
    }

    lines.push('');
    lines.push(`【入口】${surface}`);
    lines.push('使用方式：这些信号是边界和氛围，不是每轮都必须提到的话题；只有对当前回复有帮助时才自然使用。');
    return lines.join('\n');
};
