import type { Message } from '../../types';
import { DB } from '../db';
import type { SourceRef, WorldlineHotState, WorldlinePromptMode } from './types';

export const HOT_STATE_ASSET_PREFIX = 'aetheros_worldline_hot_state_';
const LEGACY_HOT_STATE_ASSET_PREFIX = 'worldline_hot_state_';

const normalize = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const clip = (value: string, max: number): string => {
  const text = normalize(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const normalizeStringList = (value: unknown, max = 5): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalize(item)).filter(Boolean).slice(0, max);
};

const isVisibleMessage = (message: Message): boolean => (
  !!message.content
  && message.type !== 'system'
  && message.metadata?.hidden !== true
);

const messageSourceLabel = (message: Message): string => {
  const source = message.metadata?.source;
  if (source === 'date') return '见面';
  if (source === 'call') return '电话';
  if (source === 'companion_wakeup') return '主动来信';
  return '聊天';
};

const normalizeStoredState = (charId: string, raw: unknown): WorldlineHotState | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<WorldlineHotState>;
  const expiresAt = Number(data.expiresAt) || undefined;
  if (expiresAt && expiresAt < Date.now()) return null;

  const state: WorldlineHotState = {
    charId,
    currentWhereabouts: normalize(data.currentWhereabouts) || undefined,
    currentMood: normalize(data.currentMood) || undefined,
    currentPressure: normalize(data.currentPressure) || undefined,
    activeThreads: normalizeStringList(data.activeThreads, 6),
    storySignals: normalizeStringList(data.storySignals, 5),
    pendingCare: normalizeStringList(data.pendingCare, 5),
    recentlyMentionedPeople: normalizeStringList(data.recentlyMentionedPeople, 6),
    sourceRefs: Array.isArray(data.sourceRefs) ? data.sourceRefs as SourceRef[] : undefined,
    updatedAt: Number(data.updatedAt) || Date.now(),
    expiresAt,
  };

  const hasContent = Boolean(
    state.currentWhereabouts
    || state.currentMood
    || state.currentPressure
    || state.activeThreads.length
    || state.storySignals.length
    || state.pendingCare.length
  );
  return hasContent ? state : null;
};

const findRecent = (messages: Message[], pattern: RegExp): Message | undefined => (
  [...messages].reverse().find(message => pattern.test(normalize(message.content)))
);

const deriveHotState = (
  charId: string,
  mode: WorldlinePromptMode,
  messages: Message[],
): WorldlineHotState | null => {
  const visible = messages.filter(isVisibleMessage).slice(-24);
  const activeThreads: string[] = [];
  const storySignals: string[] = [];
  const pendingCare: string[] = [];
  const sourceRefs: SourceRef[] = [];

  const promise = findRecent(visible, /明天|下次|等我|记得|约好|说好|一起|别忘|见面|打给|电话|等你/i);
  if (promise) {
    activeThreads.push(`${messageSourceLabel(promise)}里有一个还没完全落下的小约定：${clip(String(promise.content), 70)}`);
    sourceRefs.push({ kind: 'message', id: promise.id || `${promise.timestamp}`, label: 'open_thread' });
  }

  const care = findRecent(visible, /没吃|忘记吃|午饭|晚饭|睡不着|失眠|熬夜|胃疼|头疼|发烧|生病|累死|焦虑|撑不住/i);
  if (care) {
    pendingCare.push(`最近有一个可以轻轻照看的生活线索：${clip(String(care.content), 70)}`);
    sourceRefs.push({ kind: 'message', id: care.id || `${care.timestamp}`, label: 'care_signal' });
  }

  const date = [...visible].reverse().find(message => message.metadata?.source === 'date');
  if (date && mode !== 'timebook') {
    storySignals.push(`最近有一次见面/约会留下余温：${clip(String(date.content), 70)}`);
    sourceRefs.push({ kind: 'message', id: date.id || `${date.timestamp}`, label: 'date_echo' });
  }

  const call = [...visible].reverse().find(message => message.metadata?.source === 'call');
  if (call && (mode === 'remote_chat' || mode === 'call')) {
    activeThreads.push(`最近电话里有一段语气可以接住：${clip(String(call.content), 70)}`);
    sourceRefs.push({ kind: 'message', id: call.id || `${call.timestamp}`, label: 'call_echo' });
  }

  const hasContent = activeThreads.length || storySignals.length || pendingCare.length;
  if (!hasContent) return null;

  return {
    charId,
    activeThreads: activeThreads.slice(0, 3),
    storySignals: storySignals.slice(0, 2),
    pendingCare: pendingCare.slice(0, 2),
    sourceRefs,
    updatedAt: Date.now(),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  };
};

export const resolveWorldlineHotState = async (params: {
  charId: string;
  mode: WorldlinePromptMode;
  messages: Message[];
}): Promise<WorldlineHotState | null> => {
  try {
    const raw = await DB.getAssetRaw(`${HOT_STATE_ASSET_PREFIX}${params.charId}`);
    const stored = normalizeStoredState(params.charId, raw);
    if (stored) return stored;
  } catch {
    // Optional local state; ignore read errors.
  }

  try {
    const raw = await DB.getAssetRaw(`${LEGACY_HOT_STATE_ASSET_PREFIX}${params.charId}`);
    const stored = normalizeStoredState(params.charId, raw);
    if (stored) return stored;
  } catch {
    // Optional local state; ignore read errors.
  }

  return deriveHotState(params.charId, params.mode, params.messages);
};

export const formatHotStatePrompt = (state: WorldlineHotState | null, budgetChars = 520): string => {
  if (!state) return '';
  const lines: string[] = ['### 近况热层'];
  lines.push('这是角色近期生活状态和未完线头，只用于让回复像从他的世界里发来；不要逐条汇报。');
  if (state.currentWhereabouts) lines.push(`- 所在/手头事：${clip(state.currentWhereabouts, 90)}`);
  if (state.currentMood) lines.push(`- 心绪：${clip(state.currentMood, 90)}`);
  if (state.currentPressure) lines.push(`- 压力源：${clip(state.currentPressure, 90)}`);
  state.activeThreads.slice(0, 3).forEach(item => lines.push(`- 未完线头：${clip(item, 95)}`));
  state.storySignals.slice(0, 2).forEach(item => lines.push(`- 剧情线索：${clip(item, 95)}`));
  state.pendingCare.slice(0, 2).forEach(item => lines.push(`- 照看线索：${clip(item, 95)}`));

  const markdown = lines.join('\n').trim();
  return clip(markdown, budgetChars);
};
