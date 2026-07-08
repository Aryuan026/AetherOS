/**
 * Realtime context for AetherOS.
 *
 * This module intentionally stays local-first: system time and special dates
 * are always available, while weather is optional through OpenWeatherMap.
 */

import type { RealtimeConfig } from '../types';
import { safeResponseJson } from './safeApi';

export interface WeatherData {
    temp: number;
    feelsLike: number;
    humidity: number;
    description: string;
    icon: string;
    city: string;
}

export const defaultRealtimeConfig: RealtimeConfig = {
    realitySyncMode: 'real_anchor',
    weatherScope: 'user_only',
    careBoundary: 'soft',
    weatherEnabled: false,
    weatherApiKey: '',
    weatherCity: 'Beijing',
    cacheMinutes: 30,
};

let weatherCache: { data: WeatherData | null; timestamp: number } = { data: null, timestamp: 0 };

const SPECIAL_DATES: Record<string, string> = {
    '01-01': '元旦',
    '02-14': '情人节',
    '03-08': '妇女节',
    '03-12': '植树节',
    '03-14': '白色情人节',
    '04-01': '愚人节',
    '05-01': '劳动节',
    '05-04': '青年节',
    '06-01': '儿童节',
    '09-10': '教师节',
    '10-01': '国庆节',
    '10-31': '万圣节',
    '11-11': '光棍节',
    '12-24': '平安夜',
    '12-25': '圣诞节',
};

export const RealtimeContextManager = {
    fetchWeather: async (config: RealtimeConfig): Promise<WeatherData | null> => {
        if (!config.weatherEnabled || !config.weatherApiKey) {
            return null;
        }

        const now = Date.now();
        const cacheMs = Math.max(1, config.cacheMinutes || 30) * 60 * 1000;

        if (weatherCache.data && (now - weatherCache.timestamp) < cacheMs) {
            return weatherCache.data;
        }

        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(config.weatherCity)}&appid=${config.weatherApiKey}&units=metric&lang=zh_cn`;
            const response = await fetch(url);
            if (!response.ok) {
                console.error('Weather API error:', response.status);
                return null;
            }

            const data = await safeResponseJson(response);
            const weather: WeatherData = {
                temp: Math.round(data.main.temp),
                feelsLike: Math.round(data.main.feels_like),
                humidity: data.main.humidity,
                description: data.weather[0]?.description || '未知',
                icon: data.weather[0]?.icon || '01d',
                city: data.name || config.weatherCity,
            };

            weatherCache = { data: weather, timestamp: now };
            return weather;
        } catch (e) {
            console.error('Failed to fetch weather:', e);
            return null;
        }
    },

    getTimeContext: (): string => {
        const now = new Date();
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const hour = now.getHours();

        let timeOfDay = '晚上';
        if (hour >= 5 && hour < 9) timeOfDay = '早晨';
        else if (hour >= 9 && hour < 12) timeOfDay = '上午';
        else if (hour >= 12 && hour < 14) timeOfDay = '中午';
        else if (hour >= 14 && hour < 18) timeOfDay = '下午';
        else if (hour >= 18 && hour < 22) timeOfDay = '傍晚';
        else timeOfDay = '深夜';

        return `现在是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]} ${timeOfDay}${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    },

    checkSpecialDates: (): string | null => {
        const now = new Date();
        const key = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        return SPECIAL_DATES[key] || null;
    },

    generateWeatherAdvice: (weather: WeatherData): string => {
        const advices: string[] = [];

        if (weather.temp < 5) advices.push('天气很冷，记得多穿点');
        else if (weather.temp < 15) advices.push('天气有点凉，出门带件外套');
        else if (weather.temp > 30) advices.push('天气很热，要注意防暑和补水');
        else if (weather.temp > 25) advices.push('天气挺暖和的');

        if (weather.description.includes('雨')) advices.push('外面在下雨，记得带伞');
        if (weather.description.includes('雪')) advices.push('下雪了，路上小心');
        if (weather.humidity > 80) advices.push('湿度比较高，可能会有点闷');

        return advices.join('，');
    },

    buildFullContext: async (config: RealtimeConfig): Promise<string> => {
        const parts: string[] = [];

        parts.push(`【时间】${RealtimeContextManager.getTimeContext()}`);

        const specialDate = RealtimeContextManager.checkSpecialDates();
        if (specialDate) {
            parts.push(`【特殊日期】今天是${specialDate}`);
        }

        if (config.weatherEnabled) {
            const weather = await RealtimeContextManager.fetchWeather(config);
            if (weather) {
                const advice = RealtimeContextManager.generateWeatherAdvice(weather);
                parts.push(`【天气】${weather.city}: ${weather.temp}°C，体感${weather.feelsLike}°C，${weather.description}，湿度${weather.humidity}%${advice ? `。${advice}` : ''}`);
            }
        }

        return parts.join('\n');
    },

    clearCache: () => {
        weatherCache = { data: null, timestamp: 0 };
    },
};
