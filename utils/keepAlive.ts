/**
 * Keep-Alive utility — signals the Service Worker to prevent background suspension
 * during long-running AI API calls (especially on mobile / Capacitor).
 *
 * Usage:
 *   import { KeepAlive } from '../utils/keepAlive';
 *
 *   KeepAlive.start();   // before API call
 *   await fetch(...);
 *   KeepAlive.stop();    // after API call completes
 */

import serviceWorkerUrl from '../worker/sw-keep-alive.ts?worker&url';

const BUILD_ID = import.meta.env.VITE_AETHEROS_BUILD_ID || 'aetheros-development';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function resolveServiceWorkerRegistration() {
  const baseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
  const scope = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;

  const unversionedScriptUrl = import.meta.env.PROD
    ? new URL('sw-keep-alive.js', baseUrl)
    : new URL(serviceWorkerUrl, window.location.href);
  unversionedScriptUrl.searchParams.set('v', BUILD_ID);

  return {
    scope,
    scriptUrl: unversionedScriptUrl.toString(),
  };
}

async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  if (!registrationPromise) {
    const { scriptUrl, scope } = resolveServiceWorkerRegistration();
    registrationPromise = navigator.serviceWorker.register(scriptUrl, {
      scope,
      type: 'module',
      updateViaCache: 'none',
    }).then(async (registration) => {
      await navigator.serviceWorker.ready;
      console.log('[KeepAlive] Service Worker registered', registration.scope);
      return registration;
    }).catch((error) => {
      registrationPromise = null;
      console.warn('[KeepAlive] SW registration failed, keep-alive disabled:', error);
      return null;
    });
  }

  return registrationPromise;
}

async function ensureRegistered({ checkForUpdate = true } = {}): Promise<ServiceWorkerRegistration | null> {
  const registration = await registerWorker();
  if (!registration || !checkForUpdate) return registration;

  try {
    await registration.update();
  } catch {
    // The loaded page remains usable. A later foreground probe will retry and
    // never clears local data just because the release server is unavailable.
  }
  return registration;
}

function postToSW(msg: { type: string }) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage(msg);
}

export const KeepAlive = {
  /** Register the SW on app startup (idempotent, call early). */
  init: ensureRegistered,

  /** Ask the existing online-first worker to check its version explicitly. */
  checkForUpdate() {
    return ensureRegistered({ checkForUpdate: true });
  },

  /** Signal that a long-running request is starting. */
  async start() {
    await ensureRegistered({ checkForUpdate: false });
    postToSW({ type: 'keepalive-start' });
  },

  /** Signal that the request has finished. */
  stop() {
    postToSW({ type: 'keepalive-stop' });
  },
};
