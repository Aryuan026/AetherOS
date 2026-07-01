/**
 * Service Worker: Background Keep-Alive + Proactive Timers
 *
 * A) Keep-alive: prevent browser from suspending during long AI fetch requests
 * B) Proactive timers: periodically notify the main thread to trigger AI messages
 *    for any number of characters independently.
 */

const PING_INTERVAL = 15_000;
const MAX_MANUAL_ALIVE_MS = 5 * 60_000;

// --- Keep-Alive ---
let pingTimer = null;
let manualKeepAliveCount = 0;
let manualKeepAliveStartedAt = 0;

function hasActiveProactiveSchedules() {
  return proactiveTimers.size > 0;
}

function shouldKeepAlive() {
  return manualKeepAliveCount > 0 || hasActiveProactiveSchedules();
}

function stopPingLoop() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function ensurePingLoop() {
  if (pingTimer) return;

  pingTimer = setInterval(() => {
    if (manualKeepAliveCount > 0 && Date.now() - manualKeepAliveStartedAt > MAX_MANUAL_ALIVE_MS) {
      console.log('[SW] Manual keep-alive auto-stopped (max duration)');
      manualKeepAliveCount = 0;
      manualKeepAliveStartedAt = 0;
    }

    if (!shouldKeepAlive()) {
      stopPingLoop();
      return;
    }

    self.registration.active && self.registration.active.postMessage({ type: 'ping' });
  }, PING_INTERVAL);
}

function refreshKeepAlive() {
  if (shouldKeepAlive()) ensurePingLoop();
  else stopPingLoop();
}

function startKeepAlive() {
  manualKeepAliveCount += 1;
  if (!manualKeepAliveStartedAt) {
    manualKeepAliveStartedAt = Date.now();
  }
  refreshKeepAlive();
}

function stopKeepAlive() {
  if (manualKeepAliveCount > 0) {
    manualKeepAliveCount -= 1;
  }
  if (manualKeepAliveCount === 0) {
    manualKeepAliveStartedAt = 0;
  }
  refreshKeepAlive();
}

// --- Proactive Timers ---
const proactiveSchedules = new Map();
const proactiveTimers = new Map();

async function notifyClients(data) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(data);
  }
}

function fireProactiveTrigger(charId) {
  console.log('[SW] Proactive trigger fired for', charId);
  notifyClients({ type: 'proactive-trigger', charId });
}

function stopProactive(charId) {
  const timer = proactiveTimers.get(charId);
  if (timer) {
    clearInterval(timer);
    proactiveTimers.delete(charId);
  }
  proactiveSchedules.delete(charId);
}

function upsertProactive(config) {
  const prev = proactiveSchedules.get(config.charId);
  const unchanged = prev && prev.intervalMs === config.intervalMs;
  if (unchanged && proactiveTimers.has(config.charId)) {
    return;
  }

  stopProactive(config.charId);
  proactiveSchedules.set(config.charId, config);

  console.log(`[SW] Proactive timer started: ${config.charId}, every ${config.intervalMs / 60000}min`);
  const timer = setInterval(() => fireProactiveTrigger(config.charId), config.intervalMs);
  proactiveTimers.set(config.charId, timer);
}

function syncProactive(configs) {
  const nextIds = new Set((configs || []).map(config => config.charId));

  for (const charId of Array.from(proactiveSchedules.keys())) {
    if (!nextIds.has(charId)) {
      stopProactive(charId);
    }
  }

  for (const config of configs || []) {
    if (config && config.charId && config.intervalMs > 0) {
      upsertProactive(config);
    }
  }

  refreshKeepAlive();
}

// --- Message handler ---
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  switch (type) {
    case 'keepalive-start':
      startKeepAlive();
      break;
    case 'keepalive-stop':
      stopKeepAlive();
      break;
    case 'proactive-start':
      if (event.data.config) {
        syncProactive([...proactiveSchedules.values(), event.data.config]);
      }
      break;
    case 'proactive-stop':
      if (event.data.charId) {
        stopProactive(event.data.charId);
        refreshKeepAlive();
      } else {
        syncProactive([]);
      }
      break;
    case 'proactive-sync':
      syncProactive(event.data.configs || []);
      break;
  }
});

// --- Lifecycle ---
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
