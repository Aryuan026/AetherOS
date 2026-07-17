import React, { useEffect, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { SHELL_SAFE_AREA_TOP, SHELL_TOP_STRIP_HEIGHT } from '../shell/shellLayout';

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void;
  removeEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

interface SimulatedPhoneStatusBarProps {
  tone?: 'launcher' | 'app' | 'dark';
}

const readableLauncherColor = (color?: string) => {
  const normalized = (color || '').trim().toLowerCase();
  if (!normalized || normalized === '#fff' || normalized === '#ffffff' || normalized === 'white') return '#334155';
  return color || '#334155';
};

const SimulatedPhoneStatusBar: React.FC<SimulatedPhoneStatusBarProps> = ({ tone = 'app' }) => {
  const { virtualTime, theme } = useOS();
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isCharging, setIsCharging] = useState(false);

  useEffect(() => {
    let battery: BatteryManager | null = null;
    let disposed = false;

    const updateBattery = () => {
      if (!battery || disposed) return;
      setBatteryLevel(Math.round(battery.level * 100));
      setIsCharging(battery.charging);
    };

    const loadBattery = async () => {
      try {
        battery = await (navigator as NavigatorWithBattery).getBattery?.() || null;
        if (!battery || disposed) return;
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
      } catch {
        // Unsupported/private browser modes keep the familiar 100% simulation.
      }
    };

    void loadBattery();
    return () => {
      disposed = true;
      battery?.removeEventListener('levelchange', updateBattery);
      battery?.removeEventListener('chargingchange', updateBattery);
    };
  }, []);

  const textColor = tone === 'launcher'
    ? readableLauncherColor(theme.contentColor)
    : tone === 'dark'
      ? '#f8fafc'
      : '#334155';
  const format = (value: number) => value.toString().padStart(2, '0');

  return (
    <div
      data-simulated-phone-status-bar
      aria-label={`经典手机状态栏，${format(virtualTime.hours)}:${format(virtualTime.minutes)}，电量 ${batteryLevel}%`}
      className="pointer-events-none absolute inset-x-0 top-0 z-[55] flex select-none items-end px-6 text-[11px] font-bold transition-colors duration-500"
      style={{
        color: textColor,
        height: SHELL_TOP_STRIP_HEIGHT,
        paddingTop: `max(12px, ${SHELL_SAFE_AREA_TOP})`,
      }}
    >
      <div className="flex h-5 w-full items-center justify-between">
        <div className="w-1/3 pl-2 font-mono tracking-wide">
          {format(virtualTime.hours)}:{format(virtualTime.minutes)}
        </div>
        <div className="w-1/3" aria-hidden="true" />
        <div className="flex w-1/3 items-center justify-end gap-1.5 pr-2">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M1.371 8.143c5.858-5.857 15.356-5.857 21.213 0a.75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.06 0c-4.98-4.979-13.053-4.979-18.032 0a.75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.182 3.182c4.1-4.1 10.749-4.1 14.85 0a.75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.062 0 8.25 8.25 0 0 0-11.667 0 .75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.204 3.182a6 6 0 0 1 8.486 0 .75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.061 0 3.75 3.75 0 0 0-5.304 0 .75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.182 3.182a1.5 1.5 0 0 1 2.122 0 .75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.061 0l-.53-.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
          <span>{batteryLevel}%</span>
          <div className="relative flex h-2.5 w-5 items-center rounded-[3px] border border-current p-[1px] opacity-80">
            <div className={`h-full rounded-[1px] ${isCharging ? 'bg-green-400' : 'bg-current'}`} style={{ width: `${batteryLevel}%` }} />
            {isCharging && <span className="absolute inset-0 flex items-center justify-center text-[8px] text-black">ϟ</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulatedPhoneStatusBar;
