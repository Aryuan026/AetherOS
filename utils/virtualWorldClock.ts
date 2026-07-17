import type { UserProfile } from '../types';

export const VIRTUAL_WORLD_CLOCK_VERSION = 1 as const;
export const VIRTUAL_WORLD_CLOCK_KEY_PREFIX = 'virtual_world_clock_v1';

export interface VirtualWorldScope {
  progressBundleId: string;
  personaMaskId: string;
}

export type VirtualWorldTimeZoneMode = 'iana' | 'fixed_offset';
export type VirtualWorldWeatherMode = 'manual' | 'seasonal_sim';

export interface VirtualWorldWeatherConfig {
  condition: string;
  temperatureLabel?: string;
  icon?: string;
}

export interface VirtualWorldClockConfigV1 extends VirtualWorldScope {
  version: typeof VIRTUAL_WORLD_CLOCK_VERSION;
  locationLabel: string;
  eraLabel?: string;
  timeZoneMode: VirtualWorldTimeZoneMode;
  timeZoneId?: string;
  utcOffsetMinutes?: number;
  yearOffset: number;
  weatherMode: VirtualWorldWeatherMode;
  weather: VirtualWorldWeatherConfig;
  updatedAt: number;
}

export interface VirtualWorldClockParts {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  dateLabel: string;
  timeLabel: string;
}

export interface VirtualWorldWeatherState extends VirtualWorldWeatherConfig {
  source: VirtualWorldWeatherMode;
}

/**
 * A display/context projection only. It is deliberately read-only and carries
 * an explicit source + relationship scope so consumers cannot mistake it for
 * message time, imported history, current story state, or memory evidence.
 */
export interface VirtualWorldContext {
  source: 'virtual_world_clock_v1';
  readOnly: true;
  scope: VirtualWorldScope;
  storageKey: string;
  locationLabel: string;
  eraLabel?: string;
  clock: VirtualWorldClockParts;
  weather: VirtualWorldWeatherState;
}

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

/** Fail closed when the active mask and progress bundle do not agree. */
export const resolveVirtualWorldScope = (
  profile: UserProfile | null | undefined,
): VirtualWorldScope | null => {
  if (!profile || !nonEmpty(profile.activeProgressBundleId) || !nonEmpty(profile.activePersonaMaskId)) {
    return null;
  }

  const progressBundleId = profile.activeProgressBundleId.trim();
  const personaMaskId = profile.activePersonaMaskId.trim();
  const mask = profile.personaMasks?.find(item => item.id === personaMaskId);
  const bundle = profile.progressBundles?.find(item => item.id === progressBundleId);

  if (!mask || !bundle) return null;
  if (mask.progressBundleId !== progressBundleId || bundle.maskId !== personaMaskId) return null;

  return { progressBundleId, personaMaskId };
};

export const getVirtualWorldClockStorageKey = (scope: VirtualWorldScope): string => (
  `${VIRTUAL_WORLD_CLOCK_KEY_PREFIX}:${scope.progressBundleId}:${scope.personaMaskId}`
);

export const createDefaultVirtualWorldClockConfig = (
  scope: VirtualWorldScope,
  now = Date.now(),
): VirtualWorldClockConfigV1 => ({
  version: VIRTUAL_WORLD_CLOCK_VERSION,
  ...scope,
  locationLabel: '未命名城区',
  eraLabel: '',
  timeZoneMode: 'iana',
  timeZoneId: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  yearOffset: 0,
  weatherMode: 'manual',
  weather: {
    condition: '晴',
    temperatureLabel: '18°C',
    icon: '☀️',
  },
  updatedAt: now,
});

const isValidIanaTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
};

export const normalizeVirtualWorldClockConfig = (
  raw: Partial<VirtualWorldClockConfigV1> | null | undefined,
  scope: VirtualWorldScope,
  now = Date.now(),
): VirtualWorldClockConfigV1 => {
  const fallback = createDefaultVirtualWorldClockConfig(scope, now);
  const requestedMode: VirtualWorldTimeZoneMode = raw?.timeZoneMode === 'fixed_offset'
    ? 'fixed_offset'
    : 'iana';
  const requestedTimeZone = nonEmpty(raw?.timeZoneId) ? raw.timeZoneId.trim() : fallback.timeZoneId!;
  const timeZoneId = isValidIanaTimeZone(requestedTimeZone)
    ? requestedTimeZone
    : fallback.timeZoneId;
  const locationLabel = nonEmpty(raw?.locationLabel)
    ? raw.locationLabel.trim().slice(0, 32)
    : fallback.locationLabel;
  const eraLabel = nonEmpty(raw?.eraLabel) ? raw.eraLabel.trim().slice(0, 24) : '';
  const weatherMode: VirtualWorldWeatherMode = raw?.weatherMode === 'seasonal_sim'
    ? 'seasonal_sim'
    : 'manual';
  const condition = nonEmpty(raw?.weather?.condition)
    ? raw.weather.condition.trim().slice(0, 16)
    : fallback.weather.condition;
  const temperatureLabel = nonEmpty(raw?.weather?.temperatureLabel)
    ? raw.weather.temperatureLabel.trim().slice(0, 12)
    : fallback.weather.temperatureLabel;
  const icon = nonEmpty(raw?.weather?.icon)
    ? raw.weather.icon.trim().slice(0, 8)
    : fallback.weather.icon;

  return {
    version: VIRTUAL_WORLD_CLOCK_VERSION,
    ...scope,
    locationLabel,
    eraLabel,
    timeZoneMode: requestedMode,
    timeZoneId,
    utcOffsetMinutes: clampInteger(raw?.utcOffsetMinutes, -14 * 60, 14 * 60, fallback.utcOffsetMinutes!),
    yearOffset: clampInteger(raw?.yearOffset, -3000, 3000, 0),
    weatherMode,
    weather: { condition, temperatureLabel, icon },
    updatedAt: typeof raw?.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : now,
  };
};

export const parseVirtualWorldClockConfig = (
  raw: unknown,
  scope: VirtualWorldScope,
): VirtualWorldClockConfigV1 | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<VirtualWorldClockConfigV1>;
  if (candidate.version !== VIRTUAL_WORLD_CLOCK_VERSION) return null;
  if (candidate.progressBundleId !== scope.progressBundleId || candidate.personaMaskId !== scope.personaMaskId) {
    return null;
  }
  return normalizeVirtualWorldClockConfig(candidate, scope, candidate.updatedAt);
};

const numericPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number => (
  Number(parts.find(part => part.type === type)?.value || 0)
);

const resolveClockParts = (
  config: VirtualWorldClockConfigV1,
  now: number,
): Omit<VirtualWorldClockParts, 'dateLabel' | 'timeLabel'> => {
  if (config.timeZoneMode === 'fixed_offset') {
    const shifted = new Date(now + (config.utcOffsetMinutes || 0) * 60_000);
    return {
      year: shifted.getUTCFullYear() + config.yearOffset,
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][shifted.getUTCDay()],
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
  }

  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: config.timeZoneId || 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(now));
  return {
    year: numericPart(parts, 'year') + config.yearOffset,
    month: numericPart(parts, 'month'),
    day: numericPart(parts, 'day'),
    weekday: parts.find(part => part.type === 'weekday')?.value || '',
    hour: numericPart(parts, 'hour'),
    minute: numericPart(parts, 'minute'),
  };
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getSeasonalWeather = (
  config: VirtualWorldClockConfigV1,
  clock: Pick<VirtualWorldClockParts, 'month' | 'day'>,
): VirtualWorldWeatherState => {
  const seasonal: Array<Array<VirtualWorldWeatherConfig>> = [
    [
      { condition: '薄雪', temperatureLabel: '2°C', icon: '❄️' },
      { condition: '晴冷', temperatureLabel: '6°C', icon: '☀️' },
      { condition: '雾', temperatureLabel: '4°C', icon: '🌫️' },
    ],
    [
      { condition: '微雨', temperatureLabel: '16°C', icon: '🌦️' },
      { condition: '多云', temperatureLabel: '19°C', icon: '☁️' },
      { condition: '晴', temperatureLabel: '22°C', icon: '☀️' },
    ],
    [
      { condition: '晴热', temperatureLabel: '29°C', icon: '☀️' },
      { condition: '阵雨', temperatureLabel: '26°C', icon: '🌧️' },
      { condition: '闷云', temperatureLabel: '28°C', icon: '☁️' },
    ],
    [
      { condition: '清晴', temperatureLabel: '18°C', icon: '🍂' },
      { condition: '风起', temperatureLabel: '15°C', icon: '🌬️' },
      { condition: '细雨', temperatureLabel: '13°C', icon: '🌧️' },
    ],
  ];
  const seasonIndex = config.timeZoneMode === 'fixed_offset'
    ? (clock.month === 12 || clock.month <= 2 ? 0 : clock.month <= 5 ? 1 : clock.month <= 8 ? 2 : 3)
    : (clock.month === 12 || clock.month <= 2 ? 0 : clock.month <= 5 ? 1 : clock.month <= 8 ? 2 : 3);
  const options = seasonal[seasonIndex];
  const index = hashSeed(`${getVirtualWorldClockStorageKey(config)}:${clock.month}-${clock.day}`) % options.length;
  return { ...options[index], source: 'seasonal_sim' };
};

export const resolveVirtualWorldContext = (
  config: VirtualWorldClockConfigV1,
  now = Date.now(),
): VirtualWorldContext => {
  const resolved = resolveClockParts(config, now);
  const clock: VirtualWorldClockParts = {
    ...resolved,
    dateLabel: `${resolved.year}年${resolved.month}月${resolved.day}日`,
    timeLabel: `${String(resolved.hour).padStart(2, '0')}:${String(resolved.minute).padStart(2, '0')}`,
  };
  const weather: VirtualWorldWeatherState = config.weatherMode === 'seasonal_sim'
    ? getSeasonalWeather(config, clock)
    : { ...config.weather, source: 'manual' };

  return {
    source: 'virtual_world_clock_v1',
    readOnly: true,
    scope: {
      progressBundleId: config.progressBundleId,
      personaMaskId: config.personaMaskId,
    },
    storageKey: getVirtualWorldClockStorageKey(config),
    locationLabel: config.locationLabel,
    eraLabel: config.eraLabel || undefined,
    clock,
    weather,
  };
};

export const formatVirtualWorldContextForPrompt = (context: VirtualWorldContext): string => (
  [
    `[只读世界环境｜source=${context.source}]`,
    `scope.progressBundleId=${context.scope.progressBundleId}`,
    `scope.personaMaskId=${context.scope.personaMaskId}`,
    `地点=${context.locationLabel}`,
    context.eraLabel ? `年代=${context.eraLabel}` : '',
    `当地时间=${context.clock.dateLabel} ${context.clock.weekday} ${context.clock.timeLabel}`,
    `当地天气=${context.weather.icon || ''}${context.weather.condition}${context.weather.temperatureLabel ? ` ${context.weather.temperatureLabel}` : ''}`,
    '用途=环境参考；禁止据此改写消息时间、导入时间、日档日期、当前剧情、任务或记忆。',
  ].filter(Boolean).join('\n')
);
