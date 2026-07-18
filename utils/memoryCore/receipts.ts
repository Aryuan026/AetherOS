import type {
  MemoryOrigin,
  WorldlineMemoryReceipt,
  WorldlineMemoryReceiptSettings,
  WorldlinePromptContext,
  WorldlinePromptMode,
  WorldlineSelectorInput,
} from './types';

const RECEIPTS_STORAGE_KEY = 'aetheros_worldline_memory_receipts_v2';
const RECEIPT_SETTINGS_STORAGE_KEY = 'aetheros_worldline_memory_receipt_settings_v1';
const MAX_RECEIPTS = 80;

export const WORLDLINE_MEMORY_RECEIPTS_UPDATED_EVENT = 'worldline-memory-receipts-updated';

const defaultSettings: WorldlineMemoryReceiptSettings = {
  enabled: true,
};

const modeOrigin: Record<WorldlinePromptMode, MemoryOrigin> = {
  remote_chat: 'daily_chat',
  meet_scene: 'meet_scene',
  date_scene: 'date_scene',
  proactive_letter: 'proactive_letter',
  timebook: 'timebook',
  call: 'daily_chat',
};

const canUseLocalStorage = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

const readJson = <T>(key: string, fallback: T): T => {
  if (!canUseLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Receipts are for local visibility only; never block a prompt because of them.
  }
};

const emitReceiptUpdate = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORLDLINE_MEMORY_RECEIPTS_UPDATED_EVENT));
};

export const loadWorldlineMemoryReceiptSettings = (): WorldlineMemoryReceiptSettings => ({
  ...defaultSettings,
  ...readJson<Partial<WorldlineMemoryReceiptSettings>>(RECEIPT_SETTINGS_STORAGE_KEY, {}),
});

export const saveWorldlineMemoryReceiptSettings = (
  updates: Partial<WorldlineMemoryReceiptSettings>,
): WorldlineMemoryReceiptSettings => {
  const next = {
    ...loadWorldlineMemoryReceiptSettings(),
    ...updates,
  };
  writeJson(RECEIPT_SETTINGS_STORAGE_KEY, next);
  emitReceiptUpdate();
  return next;
};

export const loadWorldlineMemoryReceipts = (): WorldlineMemoryReceipt[] => (
  readJson<WorldlineMemoryReceipt[]>(RECEIPTS_STORAGE_KEY, [])
);

export const clearWorldlineMemoryReceipts = (): void => {
  writeJson(RECEIPTS_STORAGE_KEY, []);
  emitReceiptUpdate();
};

export const buildWorldlineMemoryReceipt = (
  input: WorldlineSelectorInput,
  context: WorldlinePromptContext,
  at = Date.now(),
): WorldlineMemoryReceipt => {
  const personaMask = input.user.personaMasks?.find(item => item.id === input.relationshipScope.personaMaskId);
  const progressBundle = input.user.progressBundles?.find(item => item.id === input.relationshipScope.progressBundleId);
  return {
    id: `${input.char.id}-${input.mode}-${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    charId: input.char.id,
    charName: input.char.name,
    mode: input.mode,
    surface: input.surface,
    relationshipScope: { ...input.relationshipScope },
    personaMaskLabel: personaMask?.label || '当前面具',
    progressBundleLabel: progressBundle?.label || '当前关系进度',
    origin: input.origin || modeOrigin[input.mode],
    delivered: context.markdown.trim().length > 0,
    candidateCount: context.candidates.length,
    openThreadCount: context.openThreads.length,
    candidateTitles: context.candidates.map(item => item.title).slice(0, 4),
    openThreadTitles: context.openThreads.map(item => item.title).slice(0, 3),
    budgetChars: context.budgetChars,
    warnings: context.warnings,
    deliveryTier: context.deliveryProfile?.tier,
    hotStateDelivered: Boolean(context.hotState),
    voiceFingerprintCount: context.voiceLineTitles?.length || 0,
    historicalCandidateCount: context.historicalDelivery.candidateCount,
    historicalCandidateTitles: context.historicalDelivery.candidateTitles,
    historicalSourceKinds: context.historicalDelivery.sourceKinds,
    historicalAuthorities: context.historicalDelivery.authorities,
    historicalDisposition: context.historicalDelivery.disposition,
  };
};

export const recordWorldlineMemoryReceipt = (
  input: WorldlineSelectorInput,
  context: WorldlinePromptContext,
): void => {
  if (!loadWorldlineMemoryReceiptSettings().enabled) return;

  const receipt = buildWorldlineMemoryReceipt(input, context);

  const next = [receipt, ...loadWorldlineMemoryReceipts()].slice(0, MAX_RECEIPTS);
  writeJson(RECEIPTS_STORAGE_KEY, next);
  emitReceiptUpdate();
};
