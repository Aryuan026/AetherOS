import { Capacitor } from '@capacitor/core';
import { KeepAlive } from './keepAlive';
import {
  isIOSDevice,
  isStandaloneDisplayMode,
  STANDALONE_DISPLAY_MODE_QUERIES,
} from './iosStandalone';

export type PwaRuntimeSnapshot = {
  platform: 'ios' | 'other';
  standalone: boolean;
  installedThisSession: boolean;
  installPromptAvailable: boolean;
  updateAvailable: boolean;
  isCapacitor: boolean;
};

type PwaRuntimeListener = (snapshot: PwaRuntimeSnapshot) => void;
type InstallOutcome = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform?: string }>;
}

type ReleaseDescriptor = {
  schemaVersion: 'aetheros_release_descriptor.v1';
  buildId: string;
  appVersion: string;
  shellMode: 'online-first';
  offlineShell: false;
};

export type PwaUpdateOutcome = 'reloading' | 'not-needed' | 'unavailable';

const CURRENT_BUILD_ID = import.meta.env.VITE_AETHEROS_BUILD_ID || 'aetheros-development';
const RELEASE_DESCRIPTOR_FILE = import.meta.env.VITE_AETHEROS_RELEASE_DESCRIPTOR || 'aetheros-release.json';
const listeners = new Set<PwaRuntimeListener>();

let initialized = false;
let installPrompt: BeforeInstallPromptEvent | null = null;
let releaseProbe: Promise<void> | null = null;

const readSnapshotEnvironment = (): Pick<PwaRuntimeSnapshot, 'platform' | 'standalone' | 'isCapacitor'> => ({
  platform: isIOSDevice() ? 'ios' : 'other',
  standalone: isStandaloneDisplayMode(),
  isCapacitor: Capacitor.isNativePlatform(),
});

let snapshot: PwaRuntimeSnapshot = {
  ...readSnapshotEnvironment(),
  installedThisSession: false,
  installPromptAvailable: false,
  updateAvailable: false,
};

const publishSnapshot = (patch: Partial<PwaRuntimeSnapshot>) => {
  const next = { ...snapshot, ...patch };
  const changed = (Object.keys(next) as Array<keyof PwaRuntimeSnapshot>)
    .some((key) => next[key] !== snapshot[key]);
  if (!changed) return;

  snapshot = next;
  listeners.forEach((listener) => listener(snapshot));
};

const normalizeReleaseDescriptor = (value: unknown): ReleaseDescriptor | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ReleaseDescriptor>;
  if (
    candidate.schemaVersion !== 'aetheros_release_descriptor.v1'
    || typeof candidate.buildId !== 'string'
    || !candidate.buildId.trim()
    || typeof candidate.appVersion !== 'string'
    || candidate.shellMode !== 'online-first'
    || candidate.offlineShell !== false
  ) return null;

  return candidate as ReleaseDescriptor;
};

const releaseDescriptorUrl = () => {
  const baseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
  return new URL(RELEASE_DESCRIPTOR_FILE, baseUrl).toString();
};

const fetchReleaseDescriptor = async (): Promise<ReleaseDescriptor | null> => {
  try {
    const response = await fetch(releaseDescriptorUrl(), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return normalizeReleaseDescriptor(await response.json());
  } catch {
    return null;
  }
};

const probeForRelease = async () => {
  // The release descriptor is a production-build artifact. Skipping the
  // probe in Vite dev avoids a meaningless 404 without changing production
  // update checks or adding a second development-only descriptor server.
  if (import.meta.env.DEV || Capacitor.isNativePlatform()) return;

  const [descriptor] = await Promise.all([
    fetchReleaseDescriptor(),
    KeepAlive.checkForUpdate(),
  ]);
  if (descriptor && descriptor.buildId !== CURRENT_BUILD_ID) {
    publishSnapshot({ updateAvailable: true });
  }
};

const requestReleaseProbe = () => {
  if (releaseProbe) return releaseProbe;
  releaseProbe = probeForRelease().finally(() => {
    releaseProbe = null;
  });
  return releaseProbe;
};

const handleBeforeInstallPrompt = (event: Event) => {
  const nextPrompt = event as BeforeInstallPromptEvent;
  nextPrompt.preventDefault();
  installPrompt = nextPrompt;
  publishSnapshot({ installPromptAvailable: true });
};

const handleInstalled = () => {
  installPrompt = null;
  publishSnapshot({
    ...readSnapshotEnvironment(),
    installedThisSession: true,
    installPromptAvailable: false,
  });
};

const handleDisplayModeChange = () => {
  publishSnapshot(readSnapshotEnvironment());
};

const handleControllerChange = () => {
  void requestReleaseProbe();
};

export const initializePwaRuntime = (): void => {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;
  snapshot = { ...snapshot, ...readSnapshotEnvironment() };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleInstalled);
  window.addEventListener('focus', () => {
    handleDisplayModeChange();
    void requestReleaseProbe();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    handleDisplayModeChange();
    void requestReleaseProbe();
  });
  navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

  STANDALONE_DISPLAY_MODE_QUERIES.forEach((query) => {
    window.matchMedia?.(query).addEventListener?.('change', handleDisplayModeChange);
  });
  void requestReleaseProbe();
};

export const getPwaRuntimeSnapshot = (): PwaRuntimeSnapshot => snapshot;

export const subscribePwaRuntime = (listener: PwaRuntimeListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const requestPwaInstall = async (): Promise<'accepted' | 'dismissed' | 'manual' | 'unavailable'> => {
  if (snapshot.isCapacitor || snapshot.standalone) return 'unavailable';
  if (!installPrompt) return snapshot.platform === 'ios' ? 'manual' : 'unavailable';

  const prompt = installPrompt;
  installPrompt = null;
  publishSnapshot({ installPromptAvailable: false });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      publishSnapshot({ installedThisSession: true, installPromptAvailable: false });
      return 'accepted';
    }
    return 'dismissed';
  } catch {
    return 'unavailable';
  }
};

export const applyPwaUpdate = async (): Promise<PwaUpdateOutcome> => {
  if (!snapshot.updateAvailable || snapshot.isCapacitor) return 'not-needed';

  const descriptor = await fetchReleaseDescriptor();
  if (!descriptor) return 'unavailable';
  if (descriptor.buildId === CURRENT_BUILD_ID) {
    publishSnapshot({ updateAvailable: false });
    return 'not-needed';
  }

  const baseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
  baseUrl.searchParams.set('__aetheros_release', descriptor.buildId);

  try {
    const shellResponse = await fetch(baseUrl.toString(), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!shellResponse.ok) return 'unavailable';
  } catch {
    return 'unavailable';
  }

  await Promise.race([
    KeepAlive.checkForUpdate(),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
  ]);
  publishSnapshot({ updateAvailable: false });
  window.location.replace(baseUrl.toString());
  return 'reloading';
};
