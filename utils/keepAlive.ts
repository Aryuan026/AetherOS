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

let registered = false;

function resolveServiceWorkerRegistration() {
  const baseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
  const scope = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;

  return {
    scope,
    scriptUrl: import.meta.env.PROD ? new URL('sw-keep-alive.js', baseUrl).toString() : serviceWorkerUrl,
  };
}

async function ensureRegistered(): Promise<void> {
  if (registered || !('serviceWorker' in navigator)) return;
  try {
    const { scriptUrl, scope } = resolveServiceWorkerRegistration();
    const reg = await navigator.serviceWorker.register(scriptUrl, { scope, type: 'module' });
    await navigator.serviceWorker.ready;
    registered = true;
    console.log('[KeepAlive] Service Worker registered', reg.scope);
  } catch (e) {
    console.warn('[KeepAlive] SW registration failed, keep-alive disabled:', e);
  }
}

function postToSW(msg: { type: string }) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage(msg);
}

export const KeepAlive = {
  /** Register the SW on app startup (idempotent, call early). */
  init: ensureRegistered,

  /** Signal that a long-running request is starting. */
  async start() {
    await ensureRegistered();
    postToSW({ type: 'keepalive-start' });
  },

  /** Signal that the request has finished. */
  stop() {
    postToSW({ type: 'keepalive-stop' });
  },
};
