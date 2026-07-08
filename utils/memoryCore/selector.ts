import type { Anniversary, MemoryFragment, Message } from '../../types';
import { DB } from '../db';
import { classifyWorldlineDelivery, extractMemorySearchTerms } from './deliveryProfile';
import { formatHotStatePrompt, resolveWorldlineHotState } from './hotState';
import { formatWorldlinePromptBlock } from './promptFormatter';
import { recordWorldlineMemoryReceipt } from './receipts';
import { formatVoiceCorePrompt, loadCharacterVoiceCore } from './voiceCore';
import type {
  ContinuityScope,
  KnowledgeScope,
  MemoryOrigin,
  MemoryStatus,
  WorldlineMemoryCandidate,
  WorldlineOpenThread,
  WorldlinePromptContext,
  WorldlinePromptMode,
  WorldlineSelectorInput,
} from './types';

const DEFAULT_BUDGET = 1200;
const FIRST_CONTACT_PREFIX = 'timebook_first_contact_';

const modeOrigin: Record<WorldlinePromptMode, MemoryOrigin> = {
  remote_chat: 'daily_chat',
  meet_scene: 'meet_scene',
  date_scene: 'date_scene',
  proactive_letter: 'proactive_letter',
  timebook: 'timebook',
  call: 'daily_chat',
};

const modeContinuity: Record<WorldlinePromptMode, ContinuityScope> = {
  remote_chat: 'relationship',
  meet_scene: 'relationship',
  date_scene: 'branch',
  proactive_letter: 'relationship',
  timebook: 'relationship',
  call: 'relationship',
};

const normalize = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const isoDay = (timestamp: number): string => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const isRealMessage = (message: Message): boolean => (
  !!message.content
  && message.type !== 'system'
  && !message.metadata?.proactiveHint
  && message.metadata?.hidden !== true
);

const messageSourceLabel = (message: Message): string => {
  const source = message.metadata?.source;
  if (source === 'date') return '见面';
  if (source === 'call') return '通话';
  if (source === 'companion_wakeup') return '主动来信';
  return '聊天';
};

const candidateFromAnniversary = (anniversary: Anniversary): WorldlineMemoryCandidate => ({
  id: `anniversary:${anniversary.id}`,
  charId: anniversary.charId,
  origin: 'timebook',
  continuity: 'relationship',
  knowledge: 'shared',
  status: 'confirmed',
  title: anniversary.title,
  summary: anniversary.aiThought || '这是你们保存下来的共同日期。只有在自然相关时提起。',
  happenedAt: anniversary.date,
  sourceRefs: [{ kind: 'anniversary', id: anniversary.id, label: anniversary.title }],
  tags: ['timebook'],
  weight: anniversary.aiThought ? 0.82 : 0.68,
});

const candidateFromFirstContact = (
  charId: string,
  raw: any,
): WorldlineMemoryCandidate | null => {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalize(raw.title);
  const date = normalize(raw.date);
  const note = normalize(raw.note);
  if (!title && !date && !note) return null;

  return {
    id: `first-contact:${charId}`,
    charId,
    origin: 'timebook',
    continuity: 'relationship',
    knowledge: 'shared',
    status: raw.source === 'manual' || raw.source === 'ai_assisted' ? 'confirmed' : 'soft_canon',
    title: title || '初识',
    summary: note || '这是你们关系时间线的第一天锚点。',
    happenedAt: date || undefined,
    sourceRefs: [{ kind: 'asset', id: `${FIRST_CONTACT_PREFIX}${charId}`, label: 'first contact' }],
    tags: ['first_contact', 'timebook'],
    weight: 0.95,
  };
};

const buildCharacterMemoryCandidates = (
  charId: string,
  memories: MemoryFragment[] = [],
): WorldlineMemoryCandidate[] => (
  [...memories]
    .filter(memory => !!normalize(memory.summary))
    .sort((a, b) => normalize(b.date).localeCompare(normalize(a.date)))
    .slice(0, 40)
    .map((memory, index) => ({
      id: `character-memory:${memory.id}`,
      charId,
      origin: 'daily_chat' as MemoryOrigin,
      continuity: 'relationship' as ContinuityScope,
      knowledge: 'char_private' as KnowledgeScope,
      status: 'archived' as MemoryStatus,
      title: memory.mood === 'memory_dm' ? '记在心里的片刻' : '角色记忆',
      summary: normalize(memory.summary),
      happenedAt: normalize(memory.date) || undefined,
      sourceRefs: [{ kind: 'character_memory', id: memory.id, label: memory.mood || 'memory' }],
      tags: ['character_memory', memory.mood || 'memory'],
      weight: 0.78 - Math.min(index, 20) * 0.015,
    }))
);

const buildRecentIntersectionCandidates = (
  charId: string,
  messages: Message[],
  mode: WorldlinePromptMode,
): WorldlineMemoryCandidate[] => {
  const origin = modeOrigin[mode];
  const continuity = modeContinuity[mode];
  const recent = messages.filter(isRealMessage).slice(-10);

  if (recent.length === 0) return [];

  const sourceGroups = new Map<string, Message[]>();
  recent.forEach(message => {
    const key = message.metadata?.source || 'chat';
    sourceGroups.set(key, [...(sourceGroups.get(key) || []), message]);
  });

  return [...sourceGroups.entries()].slice(-2).map(([source, group], index) => {
    const last = group[group.length - 1];
    const speaker = last.role === 'assistant' ? '他' : '用户';
    const sourceLabel = messageSourceLabel(last);
    return {
      id: `recent:${source}:${last.id}`,
      charId,
      origin,
      continuity,
      knowledge: 'shared' as KnowledgeScope,
      status: 'draft' as MemoryStatus,
      title: `${sourceLabel}里的近况`,
      summary: `${speaker}最近提到：${normalize(last.content).slice(0, 140)}`,
      happenedAt: isoDay(last.timestamp),
      sourceRefs: [{ kind: 'message', id: last.id, label: sourceLabel }],
      tags: ['recent', source || 'chat'],
      weight: 0.45 + index * 0.05,
    };
  });
};

const buildOpenThreads = (
  messages: Message[],
  mode: WorldlinePromptMode,
): WorldlineOpenThread[] => {
  const recent = messages.filter(isRealMessage).slice(-18);
  const threads: WorldlineOpenThread[] = [];

  const promiseMsg = [...recent].reverse().find(message => (
    /明天|下次|等我|记得|约好|说好|见面|路过|一起|别忘/i.test(message.content)
  ));
  if (promiseMsg) {
    threads.push({
      id: `open-thread:${promiseMsg.id}`,
      title: '还没完全落下的话',
      hint: `${messageSourceLabel(promiseMsg)}里留下了一个可以自然接续的约定或念头：${normalize(promiseMsg.content).slice(0, 140)}`,
      origin: modeOrigin[mode],
      continuity: modeContinuity[mode],
      sourceRefs: [{ kind: 'message', id: promiseMsg.id }],
      weight: 0.7,
    });
  }

  const dateMsg = [...recent].reverse().find(message => message.metadata?.source === 'date');
  if (mode === 'remote_chat' && dateMsg) {
    threads.push({
      id: `date-echo:${dateMsg.id}`,
      title: '见面后的余温',
      hint: `最近一次面对面场景可以在远程聊天里轻轻回响，但不要当作仍在同一现场：${normalize(dateMsg.content).slice(0, 140)}`,
      origin: 'meet_scene',
      continuity: 'relationship',
      sourceRefs: [{ kind: 'message', id: dateMsg.id }],
      weight: 0.65,
    });
  }

  return threads.slice(0, 2);
};

const dateRecencyBoost = (date?: string): number => {
  if (!date) return 0;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return 0;
  const days = Math.abs(Date.now() - timestamp) / 86_400_000;
  if (days <= 3) return 0.18;
  if (days <= 14) return 0.12;
  if (days <= 45) return 0.06;
  return 0;
};

const candidateSearchText = (candidate: WorldlineMemoryCandidate): string => (
  `${candidate.title} ${candidate.summary} ${candidate.happenedAt || ''} ${(candidate.tags || []).join(' ')}`
).toLowerCase();

const modeBoost = (candidate: WorldlineMemoryCandidate, mode: WorldlinePromptMode): number => {
  if (mode === 'proactive_letter') {
    if (candidate.knowledge === 'char_private') return 0.2;
    if (candidate.origin === 'calendar') return 0.18;
    if (candidate.tags?.includes('recent')) return 0.08;
    return 0;
  }
  if (mode === 'meet_scene' || mode === 'date_scene') {
    if (candidate.continuity === 'branch') return 0.18;
    if (candidate.origin === 'timebook') return 0.14;
    if (candidate.tags?.includes('character_memory')) return 0.08;
    return 0;
  }
  if (mode === 'timebook') {
    if (candidate.origin === 'timebook') return 0.24;
    if (candidate.status === 'confirmed') return 0.12;
    return -0.08;
  }
  if (mode === 'call') {
    if (candidate.knowledge === 'char_private') return 0.16;
    if (candidate.tags?.includes('recent')) return 0.12;
    return 0;
  }
  return candidate.knowledge === 'char_private' ? 0.1 : 0;
};

const scoreCandidate = (
  candidate: WorldlineMemoryCandidate,
  queryTerms: string[],
  query: string,
  mode: WorldlinePromptMode,
): WorldlineMemoryCandidate => {
  const haystack = candidateSearchText(candidate);
  const exactQuery = normalize(query).toLowerCase();
  const termScore = queryTerms.reduce((sum, term) => {
    if (!haystack.includes(term)) return sum;
    return sum + (term.length >= 4 ? 0.18 : 0.09);
  }, 0);
  const exactBoost = exactQuery.length >= 4 && haystack.includes(exactQuery) ? 0.35 : 0;
  const statusBoost = candidate.status === 'confirmed' ? 0.08 : candidate.status === 'soft_canon' ? 0.04 : 0;
  return {
    ...candidate,
    weight: candidate.weight
      + termScore
      + exactBoost
      + dateRecencyBoost(candidate.happenedAt)
      + statusBoost
      + modeBoost(candidate, mode),
  };
};

const dedupeCandidates = (candidates: WorldlineMemoryCandidate[]): WorldlineMemoryCandidate[] => {
  const seen = new Set<string>();
  const result: WorldlineMemoryCandidate[] = [];
  candidates.forEach(candidate => {
    const semanticKey = `${normalize(candidate.title).toLowerCase()}::${normalize(candidate.summary).slice(0, 48).toLowerCase()}`;
    const key = candidate.id || semanticKey;
    if (seen.has(key) || seen.has(semanticKey)) return;
    seen.add(key);
    seen.add(semanticKey);
    result.push(candidate);
  });
  return result;
};

export const selectWorldlineMemoryContext = async (
  input: WorldlineSelectorInput,
): Promise<WorldlinePromptContext> => {
  const deliveryProfile = classifyWorldlineDelivery({
    mode: input.mode,
    query: input.query,
    budgetChars: input.budgetChars ?? DEFAULT_BUDGET,
  });
  const budgetChars = deliveryProfile.budgetChars;
  const warnings: string[] = [];
  let messages = input.currentMessages || [];

  try {
    if (messages.length === 0) {
      messages = await DB.getRecentMessagesByCharId(input.char.id, 80);
    }
  } catch (error) {
    warnings.push(`recent_messages_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
  }

  const candidates: WorldlineMemoryCandidate[] = [];

  try {
    const firstContact = await DB.getAssetRaw(`${FIRST_CONTACT_PREFIX}${input.char.id}`);
    const firstContactCandidate = candidateFromFirstContact(input.char.id, firstContact);
    if (firstContactCandidate) candidates.push(firstContactCandidate);
  } catch (error) {
    warnings.push(`first_contact_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
  }

  try {
    const anniversaries = await DB.getAllAnniversaries();
    const charAnniversaries = anniversaries
      .filter(item => item.charId === input.char.id)
      .map(candidateFromAnniversary)
      .sort((a, b) => (b.happenedAt || '').localeCompare(a.happenedAt || ''))
      .slice(0, 24);
    candidates.push(...charAnniversaries);
  } catch (error) {
    warnings.push(`anniversaries_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
  }

  candidates.push(...buildCharacterMemoryCandidates(input.char.id, input.char.memories));
  candidates.push(...buildRecentIntersectionCandidates(input.char.id, messages, input.mode));

  const queryTerms = extractMemorySearchTerms(input.query);
  const openThreads = buildOpenThreads(messages, input.mode)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, deliveryProfile.openThreadLimit);
  const uniqueCandidates = dedupeCandidates(
    candidates
      .filter(item => item.status !== 'discarded')
      .map(item => scoreCandidate(item, queryTerms, input.query || '', input.mode))
      .sort((a, b) => b.weight - a.weight),
  ).slice(0, deliveryProfile.candidateLimit);

  const [hotState, voiceCore] = await Promise.all([
    deliveryProfile.includeHotState
      ? resolveWorldlineHotState({
        charId: input.char.id,
        mode: input.mode,
        messages,
      })
      : Promise.resolve(null),
    loadCharacterVoiceCore(input.char.id),
  ]);

  const voiceCorePrompt = formatVoiceCorePrompt(voiceCore, {
    mode: input.mode,
    query: input.query,
    profile: deliveryProfile,
    budgetChars: Math.min(700, Math.max(240, Math.floor(budgetChars * 0.38))),
  });
  const hotStateMarkdown = formatHotStatePrompt(
    hotState,
    Math.min(520, Math.max(220, Math.floor(budgetChars * 0.3))),
  );

  const markdown = formatWorldlinePromptBlock(uniqueCandidates, openThreads, budgetChars, {
    deliveryProfile,
    hotStateMarkdown,
    voiceCoreMarkdown: voiceCorePrompt.markdown,
  });

  const context: WorldlinePromptContext = {
    markdown,
    candidates: uniqueCandidates,
    openThreads,
    budgetChars,
    warnings,
    deliveryProfile,
    hotState,
    voiceLineTitles: voiceCorePrompt.usedLines.map(line => line.tags?.[0] || line.kind).slice(0, 8),
  };

  recordWorldlineMemoryReceipt(input, context);

  return context;
};
