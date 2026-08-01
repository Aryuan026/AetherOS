import { Capacitor } from '@capacitor/core';
import { KeepAlive } from './keepAlive';
import { isIOSDevice, isStandaloneDisplayMode } from './iosStandalone';

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

const CURRENT_BUILD_ID = import.meta.env.VITE_AETHEROS_BUILD_ID || 'aetheros-development';
const RELEASE_DESCRIPTOR_FILE = import.meta.env.VITE_AETHEROS_RELEASE_DESCRIPTOR || 'aetheros-release.json';
const listeners = new Set<PwaRuntimeListener>();

let initialized = false;
let installPrompt: BeforeInstallPromptEvent | null = null;
let releaseProbe: Promise<void> | null = null;
let serviceWorkerHadController = false;

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

const probeForRelease = async () => {
  // The release descriptor is a production-build artifact. Skipping the
  // probe in Vite dev avoids a meaningless 404 without changing production
  // update checks or adding a second development-only descriptor server.
  if (import.meta.env.DEV || Capacitor.isNativePlatform()) return;

  const descriptorRequest = fetch(releaseDescriptorUrl(), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    if (!response.ok) return null;
    return normalizeReleaseDescriptor(await response.json());
  }).catch(() => null);

  const [descriptor] = await Promise.all([
    descriptorRequest,
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
  const replacedExistingController = serviceWorkerHadController;
  serviceWorkerHadController = true;
  if (replacedExistingController) publishSnapshot({ updateAvailable: true });
};

export const initializePwaRuntime = (): void => {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;
  snapshot = { ...snapshot, ...readSnapshotEnvironment() };
  serviceWorkerHadController = Boolean(navigator.serviceWorker?.controller);

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

  const displayMode = window.matchMedia?.('(display-mode: standalone)');
  displayMode?.addEventListener?.('change', handleDisplayModeChange);
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

export const applyPwaUpdate = (): void => {
  if (!snapshot.updateAvailable || snapshot.isCapacitor) return;
  window.location.reload();
};
