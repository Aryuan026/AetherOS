import type { Anniversary, APIConfig, CharacterProfile, CompanionWakeupRule, MemoryFragment, Message, UserProfile } from '../../types';
import { loadCompanionWakeupSettings, parseClockMinutes, resolveCompanionWakeupMode, scheduleNextCompanionWakeup } from '../companionWakeups';
import { DB } from '../db';
import { safeResponseJson } from '../safeApi';
import { isHistoricalContextMessage } from '../messageContext';

export const MEMORY_DM_UPDATED_EVENT = 'worldline-memory-dm-updated';

const SETTINGS_STORAGE_KEY = 'aetheros_memory_dm_settings_v1';
const CURSOR_STORAGE_KEY = 'aetheros_memory_dm_cursor_v1';
const CANDIDATE_ASSET_ID = 'memory_dm_candidate_records_v1';
const MAX_RECORDS = 100;
export const MEMORY_DM_TURN_MIN = 20;
export const MEMORY_DM_TURN_MAX = 100;
export const MEMORY_DM_TURN_STEP = 20;
const DEFAULT_TURNS_PER_PASS = 60;
const DEFAULT_IDLE_HOURS = 6;

export type MemoryDMTrigger = 'auto' | 'idle' | 'manual';
export type MemoryDMCandidateKind =
  | 'character_memory'
  | 'timebook_node'
  | 'calendar_reminder'
  | 'relationship_impression'
  | 'story_seed'
  | 'discard';

export interface MemoryDMSettings {
  enabled: boolean;
  turnsPerPass: number;
  idleHoursBeforePass: number;
  idlePassEnabled: boolean;
  autoApplyCharacterMemories: boolean;
  autoApplyTimebookNodes: boolean;
  autoApplyCalendarReminders: boolean;
}

export interface MemoryDMCandidate {
  id: string;
  kind: MemoryDMCandidateKind;
  title: string;
  summary: string;
  date?: string;
  mood?: string;
  confidence?: number;
  sourceMessageIds?: number[];
  tags?: string[];
}

export interface MemoryDMRecord {
  id: string;
  at: number;
  charId: string;
  charName: string;
  trigger: MemoryDMTrigger;
  sourceMessageIds: number[];
  candidates: MemoryDMCandidate[];
  appliedMemoryIds: string[];
  appliedTimebookIds: string[];
  appliedCalendarRuleIds: string[];
  skippedReason?: string;
}

interface MemoryDMCursor {
  chars: Record<string, {
    lastMessageId?: number;
    lastRunAt?: number;
    lastUserTurnCount?: number;
  }>;
}

export interface RunMemoryDMPassInput {
  char: CharacterProfile;
  userProfile: UserProfile;
  apiConfig: Pick<APIConfig, 'baseUrl' | 'apiKey' | 'model'>;
  trigger: MemoryDMTrigger;
  settings?: MemoryDMSettings;
  onCharacterMemoriesApplied?: (charId: string, memories: MemoryFragment[]) => void;
}

export interface MemoryDMPassResult {
  ran: boolean;
  skippedReason?: string;
  newUserTurns: number;
  candidateCount: number;
  appliedMemoryCount: number;
  appliedTimebookCount: number;
  appliedCalendarCount: number;
  record?: MemoryDMRecord;
}

const defaultSettings: MemoryDMSettings = {
  enabled: false,
  turnsPerPass: DEFAULT_TURNS_PER_PASS,
  idleHoursBeforePass: DEFAULT_IDLE_HOURS,
  idlePassEnabled: true,
  autoApplyCharacterMemories: true,
  autoApplyTimebookNodes: true,
  autoApplyCalendarReminders: true,
};

const canUseLocalStorage = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

const emitMemoryDMUpdate = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MEMORY_DM_UPDATED_EVENT));
};

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
    // MemoryDM bookkeeping must never block chat.
  }
};

const normalizeComparableText = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[\s"'“”‘’.,，。！？!?、:：;；()[\]{}<>《》【】]/g, '')
    .slice(0, 80)
);

const hashText = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

const clampNumber = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
);

const toLocalDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isMeaningfulMessage = (message: Message): boolean => (
  message.role !== 'system'
  && !isHistoricalContextMessage(message)
  && message.metadata?.hidden !== true
  && !!String(message.content || '').trim()
  && !/^\[连接中断[:：]/.test(String(message.content || '').trim())
);

const messageText = (message: Message): string => {
  if (message.type === 'image') return '[图片]';
  if (message.type === 'emoji') return '[表情]';
  if ((message.type as string) === 'score_card') return '[共同完成了一张结算卡]';
  return String(message.content || '').replace(/\s+/g, ' ').trim();
};

const loadCursor = (): MemoryDMCursor => {
  const stored = readJson<Partial<MemoryDMCursor>>(CURSOR_STORAGE_KEY, {});
  return {
    ...stored,
    chars: stored.chars || {},
  };
};

const saveCursor = (cursor: MemoryDMCursor): void => {
  writeJson(CURSOR_STORAGE_KEY, cursor);
};

export const loadMemoryDMSettings = (): MemoryDMSettings => {
  const stored = readJson<Partial<MemoryDMSettings>>(SETTINGS_STORAGE_KEY, {});
  const storedTurns = Number(stored.turnsPerPass);
  const rawTurnsPerPass = Number.isFinite(storedTurns) && storedTurns >= MEMORY_DM_TURN_MIN
    ? storedTurns
    : defaultSettings.turnsPerPass;
  return {
    ...defaultSettings,
    ...stored,
    turnsPerPass: clampNumber(
      rawTurnsPerPass,
      MEMORY_DM_TURN_MIN,
      MEMORY_DM_TURN_MAX,
    ),
    idleHoursBeforePass: clampNumber(Number(stored.idleHoursBeforePass ?? defaultSettings.idleHoursBeforePass), 2, 24),
  };
};

export const saveMemoryDMSettings = (updates: Partial<MemoryDMSettings>): MemoryDMSettings => {
  const next = {
    ...loadMemoryDMSettings(),
    ...updates,
  };
  const normalized: MemoryDMSettings = {
    ...next,
    turnsPerPass: clampNumber(Number(next.turnsPerPass), MEMORY_DM_TURN_MIN, MEMORY_DM_TURN_MAX),
    idleHoursBeforePass: clampNumber(Number(next.idleHoursBeforePass), 2, 24),
  };
  writeJson(SETTINGS_STORAGE_KEY, normalized);
  emitMemoryDMUpdate();
  return normalized;
};

export const loadMemoryDMRecords = async (): Promise<MemoryDMRecord[]> => {
  const records = await DB.getAssetRaw(CANDIDATE_ASSET_ID);
  return Array.isArray(records) ? records : [];
};

const saveMemoryDMRecord = async (record: MemoryDMRecord): Promise<void> => {
  const records = await loadMemoryDMRecords();
  await DB.saveAssetRaw(CANDIDATE_ASSET_ID, [record, ...records].slice(0, MAX_RECORDS));
  emitMemoryDMUpdate();
};

const hasSimilarMemory = (memories: MemoryFragment[], candidate: MemoryDMCandidate): boolean => {
  const target = normalizeComparableText(candidate.summary);
  if (!target) return true;
  return memories.some(memory => {
    const existing = normalizeComparableText(memory.summary);
    if (!existing) return false;
    return memory.date === candidate.date && (
      existing.includes(target.slice(0, 24))
      || target.includes(existing.slice(0, 24))
      || existing === target
    );
  });
};

const hasSimilarAnniversary = (anniversaries: Anniversary[], charId: string, candidate: MemoryDMCandidate): boolean => {
  const title = normalizeComparableText(candidate.title || candidate.summary);
  return anniversaries.some(item => {
    if (item.charId !== charId) return false;
    const existing = normalizeComparableText(item.title);
    return item.date === candidate.date || (!!title && (existing.includes(title.slice(0, 18)) || title.includes(existing.slice(0, 18))));
  });
};

const parseDateKey = (raw?: string): string | undefined => {
  const text = String(raw || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const clock = (hour: string, minute?: string): string => (
  `${String(Math.max(0, Math.min(23, Number(hour)))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, Number(minute || 0)))).padStart(2, '0')}`
);

const extractWakeupWindow = (candidate: MemoryDMCandidate): { start: string; end: string } => {
  const text = [candidate.title, candidate.summary, ...(candidate.tags || [])].join(' ');
  const tagged = text.match(/(?:window|time_window)[:=](\d{1,2})(?::(\d{2}))?\s*[-~到至]\s*(\d{1,2})(?::(\d{2}))?/i);
  if (tagged) return { start: clock(tagged[1], tagged[2]), end: clock(tagged[3], tagged[4]) };

  const natural = text.match(/(\d{1,2})(?:[:：点](\d{2})?)?\s*(?:[-~—到至]|到)\s*(\d{1,2})(?:[:：点](\d{2})?)?/);
  if (natural) return { start: clock(natural[1], natural[2]), end: clock(natural[3], natural[4]) };

  if (/早饭|早餐/i.test(text)) return { start: '07:30', end: '09:00' };
  if (/午饭|午餐|中饭/i.test(text)) return { start: '11:00', end: '12:00' };
  if (/晚饭|晚餐/i.test(text)) return { start: '18:00', end: '19:30' };
  if (/睡觉|睡前|晚安|休息/i.test(text)) return { start: '23:00', end: '23:50' };
  return { start: '09:00', end: '21:00' };
};

const targetDateIsExpired = (targetDate: string | undefined, windowEnd: string): boolean => {
  if (!targetDate) return false;
  const [year, month, day] = targetDate.split('-').map(part => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return true;
  const endMinutes = parseClockMinutes(windowEnd);
  date.setHours(0, endMinutes, 0, 0);
  return date.getTime() <= Date.now();
};

const hasSimilarWakeupRule = (
  rules: CompanionWakeupRule[],
  charId: string,
  title: string,
  targetDate: string | undefined,
  windowStart: string,
  windowEnd: string,
): boolean => {
  const targetTitle = normalizeComparableText(title);
  return rules.some(rule => {
    if (rule.charId !== charId || rule.source !== 'ai_calendar') return false;
    const sameWindow = rule.windowStart === windowStart && rule.windowEnd === windowEnd;
    const sameDate = (rule.targetDate || '') === (targetDate || '');
    const existingTitle = normalizeComparableText(rule.title);
    return sameWindow && sameDate && !!targetTitle && (
      existingTitle.includes(targetTitle.slice(0, 18))
      || targetTitle.includes(existingTitle.slice(0, 18))
      || existingTitle === targetTitle
    );
  });
};

const buildCalendarWakeupRule = (charId: string, candidate: MemoryDMCandidate): CompanionWakeupRule | null => {
  const window = extractWakeupWindow(candidate);
  const targetDate = parseDateKey(candidate.date);
  if (targetDateIsExpired(targetDate, window.end)) return null;

  const now = Date.now();
  const mode = resolveCompanionWakeupMode(loadCompanionWakeupSettings(), { lines: [candidate.summary || candidate.title || '日历提醒'] });
  const title = candidate.title || candidate.summary.slice(0, 18) || '日历提醒';
  const summary = candidate.summary || title;
  const rule: CompanionWakeupRule = {
    id: `wake-calendar-${charId}-${targetDate || 'daily'}-${hashText(`${title}:${summary}:${now}`)}`,
    charId,
    title,
    enabled: true,
    kind: 'window',
    mode,
    repeat: targetDate ? 'once' : 'daily',
    targetDate,
    windowStart: window.start,
    windowEnd: window.end,
    value: summary,
    lines: mode === 'direct' ? [summary] : undefined,
    priority: 'calendar',
    source: 'ai_calendar',
    createdAt: now,
    updatedAt: now,
  };
  return { ...rule, nextTriggerAt: scheduleNextCompanionWakeup(rule, now) };
};

const buildMemoryDMPrompt = (
  char: CharacterProfile,
  user: UserProfile,
  messages: Message[],
): string => {
  const lines = messages.map(message => {
    const speaker = message.role === 'user' ? user.name : char.name;
    return `[${message.id}] ${speaker}: ${messageText(message).slice(0, 500)}`;
  }).join('\n');

  const recentMemories = (char.memories || []).slice(-12).map(memory => (
    `- [${memory.date}] (${memory.mood || 'rec'}) ${memory.summary}`
  )).join('\n') || '无';

  return `你是隐藏在后台的乙游记忆官和剧情场记，不是前台角色，也不要代替角色对用户说话。

你的任务：阅读最近一段对话，决定哪些内容应该成为候选记忆、时光簿节点、日历提醒、关系印象候选或剧情种子。

角色：${char.name}
用户：${user.name}

已有角色记忆（用于去重和口吻参考）：
${recentMemories}

最近对话：
${lines}

分流原则：
1. character_memory：细微但有关系价值的日常。比如用户可爱的反应、反复出现的偏好、小习惯、角色会在心里记住的瞬间。正文必须像角色自己的私密记忆，使用第一人称“我”，不要写成第三方分析。
2. timebook_node：关系节点。比如第一次、约定、礼物、见面、纪念日、重要情绪转折。不要把普通日常写成时光簿。
3. calendar_reminder：未来需要照看的时间窗口或纪念日前提醒。summary 必须写成角色可以直接发给用户的一句短消息，或者非常接近直接可发的口吻；如果有明确时间窗，在 tags 里写 "window:11:00-12:00" 这样的标记。
4. relationship_impression：对关系印象的候选更新。只做候选，不直接覆盖。
5. story_seed：可供未来剧情/见面/咨询台使用的支线素材、传闻、伏笔。只做候选，不当成事实。
6. discard：无需写入或重复的信息。

通话分流：
- 通话里的括号、背景声、水声、走路声等只代表当时通话气氛；不要因为它们单独生成 timebook_node。
- 如果通话里出现值得记住的暧昧反应、口头习惯或用户偏好，优先写入 character_memory。
- 只有通话本身成为明确关系节点（第一次通话、约定、告白、纪念日、重大转折）时，才允许生成 timebook_node。

去重原则：
- 已有记忆里明显相同的，不要重复生成。
- 没有真实关系价值的寒暄，不要写。
- 宁可少写，也不要把聊天流水复述成记忆。

输出必须是严格 JSON，不要 markdown，不要解释：
{
  "candidates": [
    {
      "kind": "character_memory | timebook_node | calendar_reminder | relationship_impression | story_seed | discard",
      "title": "12字以内标题",
      "summary": "候选正文。character_memory 必须是角色内位第一人称。",
      "date": "YYYY-MM-DD 或空",
      "mood": "可选短标签",
      "confidence": 0.0,
      "sourceMessageIds": [1, 2],
      "tags": ["可选"]
    }
  ]
}`;
};

const parseMemoryDMResponse = (raw: string, fallbackDate: string): MemoryDMCandidate[] => {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  const jsonText = first >= 0 && last >= first ? cleaned.slice(first, last + 1) : cleaned;
  const parsed = JSON.parse(jsonText);
  const rows = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  return rows.map((row: any, index: number) => {
    const kind = String(row.kind || 'discard') as MemoryDMCandidateKind;
    const summary = String(row.summary || '').trim();
    const title = String(row.title || summary.slice(0, 12) || '未命名').trim();
    return {
      id: `memdm-${Date.now()}-${index}-${hashText(`${kind}:${title}:${summary}`)}`,
      kind,
      title,
      summary,
      date: String(row.date || fallbackDate).trim(),
      mood: row.mood ? String(row.mood).trim() : undefined,
      confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
      sourceMessageIds: Array.isArray(row.sourceMessageIds)
        ? row.sourceMessageIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
        : undefined,
      tags: Array.isArray(row.tags) ? row.tags.map((tag: any) => String(tag)).filter(Boolean).slice(0, 8) : undefined,
    };
  }).filter((candidate: MemoryDMCandidate) => !!candidate.summary && [
    'character_memory',
    'timebook_node',
    'calendar_reminder',
    'relationship_impression',
    'story_seed',
    'discard',
  ].includes(candidate.kind));
};

export const runMemoryDMPass = async ({
  char,
  userProfile,
  apiConfig,
  trigger,
  settings = loadMemoryDMSettings(),
  onCharacterMemoriesApplied,
}: RunMemoryDMPassInput): Promise<MemoryDMPassResult> => {
  if (!settings.enabled && trigger !== 'manual') {
    return { ran: false, skippedReason: 'disabled', newUserTurns: 0, candidateCount: 0, appliedMemoryCount: 0, appliedTimebookCount: 0, appliedCalendarCount: 0 };
  }
  if (!apiConfig.baseUrl || !apiConfig.model) {
    return { ran: false, skippedReason: 'missing_api', newUserTurns: 0, candidateCount: 0, appliedMemoryCount: 0, appliedTimebookCount: 0, appliedCalendarCount: 0 };
  }

  const allMessages = (await DB.getMessagesByCharId(char.id)).filter(isMeaningfulMessage);
  const cursor = loadCursor();
  const charCursor = cursor.chars[char.id] || {};
  const latestMessage = allMessages[allMessages.length - 1];
  const latestMessageId = latestMessage?.id || 0;
  const newMessages = allMessages.filter(message => !charCursor.lastMessageId || message.id > charCursor.lastMessageId);
  const newUserTurns = newMessages.filter(message => message.role === 'user').length;
  const latestAgeHours = latestMessage ? (Date.now() - latestMessage.timestamp) / 3600000 : 0;
  const idleDue = settings.idlePassEnabled && latestAgeHours >= settings.idleHoursBeforePass && newMessages.length > 0;
  const turnDue = newUserTurns >= settings.turnsPerPass;

  if (trigger === 'auto' && !turnDue && !idleDue) {
    return { ran: false, skippedReason: 'not_due', newUserTurns, candidateCount: 0, appliedMemoryCount: 0, appliedTimebookCount: 0, appliedCalendarCount: 0 };
  }
  if (trigger === 'idle' && !idleDue) {
    return { ran: false, skippedReason: 'idle_not_due', newUserTurns, candidateCount: 0, appliedMemoryCount: 0, appliedTimebookCount: 0, appliedCalendarCount: 0 };
  }
  if (newMessages.length === 0) {
    return { ran: false, skippedReason: 'no_new_messages', newUserTurns, candidateCount: 0, appliedMemoryCount: 0, appliedTimebookCount: 0, appliedCalendarCount: 0 };
  }

  const sourceMessages = newMessages.slice(-48);
  const fallbackDate = latestMessage ? toLocalDate(latestMessage.timestamp) : toLocalDate(Date.now());
  const prompt = buildMemoryDMPrompt(char, userProfile, sourceMessages);
  const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });
  if (!response.ok) throw new Error(`MemoryDM API failed: ${response.status}`);
  const data = await safeResponseJson(response);
  const raw = data.choices?.[0]?.message?.content || '';
  const candidates = parseMemoryDMResponse(raw, fallbackDate);

  const appliedMemories: MemoryFragment[] = [];
  if (settings.autoApplyCharacterMemories) {
    const existing = [...(char.memories || [])];
    candidates
      .filter(candidate => candidate.kind === 'character_memory')
      .forEach(candidate => {
        if (hasSimilarMemory(existing, candidate)) return;
        const memory: MemoryFragment = {
          id: `mem-dm-${Date.now()}-${hashText(candidate.summary)}`,
          date: candidate.date || fallbackDate,
          summary: candidate.summary,
          mood: candidate.mood || 'memory_dm',
        };
        existing.push(memory);
        appliedMemories.push(memory);
      });

    if (appliedMemories.length > 0) {
      await DB.saveCharacter({ ...char, memories: existing });
      onCharacterMemoriesApplied?.(char.id, existing);
    }
  }

  const appliedTimebookIds: string[] = [];
  if (settings.autoApplyTimebookNodes) {
    const existingAnniversaries = await DB.getAllAnniversaries();
    for (const candidate of candidates.filter(item => item.kind === 'timebook_node')) {
      if (hasSimilarAnniversary(existingAnniversaries, char.id, candidate)) continue;
      const anniversary: Anniversary = {
        id: `memdm-timebook-${char.id}-${candidate.date || fallbackDate}-${hashText(candidate.title + candidate.summary)}`,
        title: candidate.title || candidate.summary.slice(0, 18),
        date: candidate.date || fallbackDate,
        charId: char.id,
      };
      await DB.saveAnniversary(anniversary);
      existingAnniversaries.push(anniversary);
      appliedTimebookIds.push(anniversary.id);
    }
  }

  const appliedCalendarRuleIds: string[] = [];
  if (settings.autoApplyCalendarReminders) {
    const existingRules = await DB.getAllCompanionWakeupRules();
    for (const candidate of candidates.filter(item => item.kind === 'calendar_reminder')) {
      const rule = buildCalendarWakeupRule(char.id, candidate);
      if (!rule) continue;
      if (hasSimilarWakeupRule(existingRules, char.id, rule.title, rule.targetDate, rule.windowStart, rule.windowEnd)) continue;
      await DB.saveCompanionWakeupRule(rule);
      existingRules.push(rule);
      appliedCalendarRuleIds.push(rule.id);
    }
  }

  const record: MemoryDMRecord = {
    id: `memdm-record-${Date.now()}-${hashText(`${char.id}:${latestMessageId}`)}`,
    at: Date.now(),
    charId: char.id,
    charName: char.name,
    trigger,
    sourceMessageIds: sourceMessages.map(message => message.id),
    candidates,
    appliedMemoryIds: appliedMemories.map(memory => memory.id),
    appliedTimebookIds,
    appliedCalendarRuleIds,
  };
  await saveMemoryDMRecord(record);

  cursor.chars[char.id] = {
    lastMessageId: latestMessageId,
    lastRunAt: Date.now(),
    lastUserTurnCount: newUserTurns,
  };
  saveCursor(cursor);

  return {
    ran: true,
    newUserTurns,
    candidateCount: candidates.length,
    appliedMemoryCount: appliedMemories.length,
    appliedTimebookCount: appliedTimebookIds.length,
    appliedCalendarCount: appliedCalendarRuleIds.length,
    record,
  };
};
