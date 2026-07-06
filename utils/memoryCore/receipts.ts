import type {
  MemoryOrigin,
  WorldlineMemoryReceipt,
  WorldlineMemoryReceiptSettings,
  WorldlinePromptContext,
  WorldlinePromptMode,
  WorldlineSelectorInput,
} from './types';

const RECEIPTS_STORAGE_KEY = 'aetheros_worldline_memory_receipts_v1';
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

const stripMarkdown = (markdown: string): string => markdown
  .replace(/[#>*`-]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 260);

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

export const recordWorldlineMemoryReceipt = (
  input: WorldlineSelectorInput,
  context: WorldlinePromptContext,
): void => {
  if (!loadWorldlineMemoryReceiptSettings().enabled) return;

  const receipt: WorldlineMemoryReceipt = {
    id: `${input.char.id}-${input.mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    charId: input.char.id,
    charName: input.char.name,
    mode: input.mode,
    origin: input.origin || modeOrigin[input.mode],
    delivered: context.markdown.trim().length > 0,
    candidateCount: context.candidates.length,
    openThreadCount: context.openThreads.length,
    candidateTitles: context.candidates.map(item => item.title).slice(0, 4),
    openThreadTitles: context.openThreads.map(item => item.title).slice(0, 3),
    markdownPreview: stripMarkdown(context.markdown),
    budgetChars: context.budgetChars,
    warnings: context.warnings,
  };

  const next = [receipt, ...loadWorldlineMemoryReceipts()].slice(0, MAX_RECEIPTS);
  writeJson(RECEIPTS_STORAGE_KEY, next);
  emitReceiptUpdate();
};
