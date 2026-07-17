import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile } from '../types';
import { DB } from '../utils/db';
import {
  VirtualWorldClockConfigV1,
  VirtualWorldContext,
  createDefaultVirtualWorldClockConfig,
  getVirtualWorldClockStorageKey,
  normalizeVirtualWorldClockConfig,
  parseVirtualWorldClockConfig,
  resolveVirtualWorldContext,
  resolveVirtualWorldScope,
} from '../utils/virtualWorldClock';

const VIRTUAL_WORLD_EVENT = 'aetheros:virtual-world-clock-updated';

export interface UseVirtualWorldClockResult {
  scope: ReturnType<typeof resolveVirtualWorldScope>;
  config: VirtualWorldClockConfigV1 | null;
  context: VirtualWorldContext | null;
  loading: boolean;
  saveConfig: (next: Partial<VirtualWorldClockConfigV1>) => Promise<VirtualWorldClockConfigV1>;
  resetConfig: () => Promise<void>;
}

export const useVirtualWorldClock = (
  userProfile: UserProfile | null | undefined,
): UseVirtualWorldClockResult => {
  const scope = useMemo(() => resolveVirtualWorldScope(userProfile), [userProfile]);
  const storageKey = scope ? getVirtualWorldClockStorageKey(scope) : null;
  const [config, setConfig] = useState<VirtualWorldClockConfigV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!scope || !storageKey) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const raw = await DB.getAssetRaw(storageKey);
      setConfig(parseVirtualWorldClockConfig(raw, scope));
    } catch (error) {
      console.warn('Virtual world clock load failed closed', error);
      setConfig(null);
    } finally {
      setNow(Date.now());
      setLoading(false);
    }
  }, [scope?.progressBundleId, scope?.personaMaskId, storageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let timer = 0;
    const scheduleMinuteBoundary = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(() => {
        setNow(Date.now());
        scheduleMinuteBoundary();
      }, delay);
    };
    scheduleMinuteBoundary();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;
      if (!detail?.storageKey || detail.storageKey === storageKey) {
        setNow(Date.now());
        void load();
      }
    };
    window.addEventListener(VIRTUAL_WORLD_EVENT, onUpdate);
    return () => window.removeEventListener(VIRTUAL_WORLD_EVENT, onUpdate);
  }, [load, storageKey]);

  const saveConfig = useCallback(async (next: Partial<VirtualWorldClockConfigV1>) => {
    if (!scope || !storageKey) throw new Error('当前面具与进度套组未形成一致作用域，虚拟城区没有写入。');
    const normalized = normalizeVirtualWorldClockConfig({
      ...(config || createDefaultVirtualWorldClockConfig(scope)),
      ...next,
      weather: {
        ...(config?.weather || createDefaultVirtualWorldClockConfig(scope).weather),
        ...(next.weather || {}),
      },
      updatedAt: Date.now(),
    }, scope);
    await DB.saveAssetRaw(storageKey, normalized);
    setConfig(normalized);
    window.dispatchEvent(new CustomEvent(VIRTUAL_WORLD_EVENT, { detail: { storageKey } }));
    return normalized;
  }, [config, scope?.progressBundleId, scope?.personaMaskId, storageKey]);

  const resetConfig = useCallback(async () => {
    if (!storageKey) return;
    await DB.deleteAsset(storageKey);
    setConfig(null);
    window.dispatchEvent(new CustomEvent(VIRTUAL_WORLD_EVENT, { detail: { storageKey } }));
  }, [storageKey]);

  return {
    scope,
    config,
    context: config ? resolveVirtualWorldContext(config, now) : null,
    loading,
    saveConfig,
    resetConfig,
  };
};
