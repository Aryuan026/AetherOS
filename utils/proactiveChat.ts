/**
 * Proactive Chat - schedule characters to send messages at regular intervals.
 *
 * How it works:
 *  1. Each character can persist an independent proactive schedule.
 *  2. The SW keeps timers for all active schedules and posts 'proactive-trigger'
 *     with the relevant charId.
 *  3. The main thread receives the trigger and runs the normal AI flow.
 *  4. If the app was backgrounded, visibility-change catch-up fires any overdue roles.
 */

export interface ProactiveSchedule {
  charId: string;
  intervalMs: number; // must be multiple of 30 * 60 * 1000
}

type ProactiveScheduleMap = Record<string, ProactiveSchedule>;
type LastFireMap = Record<string, number>;

const STORAGE_KEY = 'proactive_schedules';
const LAST_FIRE_KEY = 'proactive_last_fire_map';
const LEGACY_STORAGE_KEY = 'proactive_schedule';
const LEGACY_LAST_FIRE_KEY = 'proactive_last_fire';

function loadSchedules(): ProactiveScheduleMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) return {};

      const legacySchedule = JSON.parse(legacyRaw) as ProactiveSchedule | null;
      if (!legacySchedule?.charId || !legacySchedule.intervalMs) return {};

      const migratedSchedules = { [legacySchedule.charId]: legacySchedule };
      saveSchedules(migratedSchedules);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migratedSchedules;
    }
    const parsed = JSON.parse(raw) as ProactiveScheduleMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveSchedules(schedules: ProactiveScheduleMap) {
  const entries = Object.entries(schedules);
  if (entries.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

function loadLastFireTimes(): LastFireMap {
  try {
    const raw = localStorage.getItem(LAST_FIRE_KEY);
    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_LAST_FIRE_KEY);
      const schedules = loadSchedules();
      const firstSchedule = Object.values(schedules)[0];
      const legacyTs = parseInt(legacyRaw || '0', 10);
      if (!firstSchedule || !legacyTs) return {};

      const migratedLastFire = { [firstSchedule.charId]: legacyTs };
      saveLastFireTimes(migratedLastFire);
      localStorage.removeItem(LEGACY_LAST_FIRE_KEY);
      return migratedLastFire;
    }
    const parsed = JSON.parse(raw) as LastFireMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLastFireTimes(lastFireMap: LastFireMap) {
  const entries = Object.entries(lastFireMap);
  if (entries.length === 0) {
    localStorage.removeItem(LAST_FIRE_KEY);
    return;
  }
  localStorage.setItem(LAST_FIRE_KEY, JSON.stringify(lastFireMap));
}

function getLastFireTime(charId: string): number {
  return loadLastFireTimes()[charId] || 0;
}

function setLastFireTime(charId: string, ts: number) {
  const lastFireMap = loadLastFireTimes();
  lastFireMap[charId] = ts;
  saveLastFireTimes(lastFireMap);
}

function removeLastFireTime(charId: string) {
  const lastFireMap = loadLastFireTimes();
  delete lastFireMap[charId];
  saveLastFireTimes(lastFireMap);
}

function postToSW(msg: any) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage(msg);
}

function syncSchedulesToSW() {
  const schedules = Object.values(loadSchedules());
  postToSW({ type: 'proactive-sync', configs: schedules });
}

// --- Trigger callback management ---
let triggerCallback: ((charId: string) => void | Promise<void>) | null = null;
let swListener: ((e: MessageEvent) => void) | null = null;
let visibilityListener: (() => void) | null = null;

function handleSWMessage(e: MessageEvent) {
  if (e.data?.type !== 'proactive-trigger' || !triggerCallback) return;
  const charId = e.data.charId;
  const schedule = loadSchedules()[charId];
  if (!schedule) return;

  setLastFireTime(charId, Date.now());
  void triggerCallback(charId);
}

function handleVisibility() {
  if (document.visibilityState !== 'visible' || !triggerCallback) return;

  const schedules = Object.values(loadSchedules());
  const now = Date.now();

  for (const schedule of schedules) {
    const lastFire = getLastFireTime(schedule.charId);
    const elapsed = now - lastFire;

    if (lastFire > 0 && elapsed >= schedule.intervalMs) {
      console.log(`[ProactiveChat] Catch-up: ${schedule.charId}, ${Math.round(elapsed / 60000)}min elapsed`);
      setLastFireTime(schedule.charId, now);
      syncSchedulesToSW();
      void triggerCallback(schedule.charId);
    }
  }
}

function attachListeners() {
  detachListeners();
  swListener = handleSWMessage;
  navigator.serviceWorker?.addEventListener('message', swListener);
  visibilityListener = handleVisibility;
  document.addEventListener('visibilitychange', visibilityListener);
}

function detachListeners() {
  if (swListener) {
    navigator.serviceWorker?.removeEventListener('message', swListener);
    swListener = null;
  }
  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
    visibilityListener = null;
  }
}

export const ProactiveChat = {
  /**
   * Register the callback that fires when it's time for a proactive message.
   * Call this once from app code. The callback should inject a system hint
   * and call the normal AI flow.
   */
  onTrigger(callback: (charId: string) => void | Promise<void>) {
    triggerCallback = callback;
    attachListeners();
  },

  /**
   * Start or update one character's proactive schedule.
   */
  start(charId: string, intervalMinutes: number) {
    const clamped = Math.max(30, Math.round(intervalMinutes / 30) * 30);
    const schedules = loadSchedules();
    schedules[charId] = {
      charId,
      intervalMs: clamped * 60 * 1000,
    };
    saveSchedules(schedules);
    setLastFireTime(charId, Date.now());
    syncSchedulesToSW();
    attachListeners();
    console.log(`[ProactiveChat] Started: ${charId}, every ${clamped}min`);
  },

  /**
   * Stop one character's proactive schedule.
   */
  stop(charId: string) {
    const schedules = loadSchedules();
    delete schedules[charId];
    saveSchedules(schedules);
    removeLastFireTime(charId);
    syncSchedulesToSW();

    if (Object.keys(schedules).length === 0) {
      detachListeners();
    }

    console.log(`[ProactiveChat] Stopped: ${charId}`);
  },

  /**
   * Resume all saved schedules after page reload.
   */
  resume() {
    const schedules = Object.values(loadSchedules());
    if (schedules.length === 0) return;

    console.log(`[ProactiveChat] Resuming ${schedules.length} proactive schedule(s)`);
    syncSchedulesToSW();
    attachListeners();
    handleVisibility();
  },

  /** Check if proactive is active for a given character */
  isActiveFor(charId: string): boolean {
    return !!loadSchedules()[charId];
  },

  /** Get current schedule interval in minutes for one character, or null */
  getIntervalMinutes(charId: string): number | null {
    const schedule = loadSchedules()[charId];
    return schedule ? schedule.intervalMs / 60000 : null;
  },

  /** Get current schedule for one character */
  getSchedule(charId: string): ProactiveSchedule | null {
    return loadSchedules()[charId] || null;
  },

  /** Get all active schedules */
  getSchedules(): ProactiveSchedule[] {
    return Object.values(loadSchedules());
  },
};
