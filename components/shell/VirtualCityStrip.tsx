import React from 'react';
import { VirtualWorldContext } from '../../utils/virtualWorldClock';
import { SHELL_SAFE_AREA_TOP, SHELL_WORLD_STRIP_HEIGHT } from './shellLayout';

interface VirtualCityStripProps {
  context: VirtualWorldContext;
  tone?: 'launcher' | 'app' | 'dark';
}

const VirtualCityStrip: React.FC<VirtualCityStripProps> = ({ context, tone = 'app' }) => {
  const dark = tone === 'dark';
  const weather = `${context.weather.icon || ''}${context.weather.condition}${context.weather.temperatureLabel ? ` ${context.weather.temperatureLabel}` : ''}`;

  return (
    <div
      data-virtual-city-strip
      data-world-source={context.source}
      data-progress-bundle-id={context.scope.progressBundleId}
      data-persona-mask-id={context.scope.personaMaskId}
      className={`pointer-events-none absolute inset-x-0 top-0 z-[55] border-b backdrop-blur-xl ${
        dark
          ? 'border-white/10 bg-slate-950/54 text-white'
          : 'border-white/45 bg-white/64 text-slate-700'
      }`}
      style={{ height: `calc(${SHELL_SAFE_AREA_TOP} + ${SHELL_WORLD_STRIP_HEIGHT})`, paddingTop: SHELL_SAFE_AREA_TOP }}
      aria-label={`${context.locationLabel}，${context.clock.timeLabel}，${weather}`}
    >
      <div className="flex h-[34px] items-center gap-2 px-3 text-[10px] font-semibold tracking-wide">
        <div className="min-w-0 flex-1 truncate">
          <span className="font-bold">{context.locationLabel}</span>
          {context.eraLabel && <span className="ml-1 opacity-60">· {context.eraLabel}</span>}
        </div>
        <div className="shrink-0 font-mono text-[12px] font-bold tracking-[0.08em]">{context.clock.timeLabel}</div>
        <div className="max-w-[42%] shrink-0 truncate opacity-80">{weather}</div>
      </div>
    </div>
  );
};

export default VirtualCityStrip;
