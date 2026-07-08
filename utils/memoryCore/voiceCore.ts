import type {
  CharacterProfile,
  CompanionWakeupRule,
  UserProfile,
} from '../../types';
import { renderTemplateLine } from '../companionWakeups';
import { DB } from '../db';
import { extractMemorySearchTerms } from './deliveryProfile';
import type {
  CharacterVoiceCore,
  CharacterVoiceLine,
  VoiceLineKind,
  WorldlineDeliveryProfile,
  WorldlinePromptMode,
} from './types';

export const VOICE_CORE_ASSET_PREFIX = 'aetheros_voice_core_';
const LEGACY_VOICE_CORE_ASSET_PREFIX = 'character_voice_core_';

const normalize = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const hashText = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag => normalize(tag)).filter(Boolean).slice(0, 12);
};

const normalizeLine = (
  charId: string,
  item: unknown,
  kind: VoiceLineKind,
  index: number,
): CharacterVoiceLine | null => {
  const raw = typeof item === 'string' ? { text: item } : item;
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<CharacterVoiceLine> & { content?: string; value?: string };
  const text = normalize(data.text || data.content || data.value);
  if (!text) return null;
  const now = Date.now();
  return {
    id: normalize(data.id) || `${kind}-${index}-${hashText(text).toString(36)}`,
    charId,
    kind,
    text,
    tags: normalizeTags(data.tags),
    source: data.source === 'built_in' || data.source === 'manual' ? data.source : 'user_import',
    createdAt: Number(data.createdAt) || now,
    updatedAt: Number(data.updatedAt) || now,
  };
};

const readLineGroup = (
  raw: Record<string, unknown>,
  keys: string[],
): unknown[] => {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const normalizeVoiceCore = (charId: string, raw: unknown): CharacterVoiceCore | null => {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const lines = raw
      .map((item, index) => normalizeLine(charId, item, (item as any)?.kind || 'language_fingerprint', index))
      .filter(Boolean) as CharacterVoiceLine[];
    return lines.length ? { charId, lines } : null;
  }

  if (typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const direct = readLineGroup(data, ['directMessages', 'direct_messages', 'direct', 'readyToSend', '可直接发']);
  const seeds = readLineGroup(data, ['rewriteSeeds', 'rewrite_seeds', 'seeds', 'expandableSeeds', '可扩写种子']);
  const fingerprints = readLineGroup(data, ['languageFingerprints', 'language_fingerprints', 'fingerprints', 'voiceFingerprints', '语言指纹']);
  const rawLines = Array.isArray(data.lines) ? data.lines : [];

  const lines = [
    ...direct.map((item, index) => normalizeLine(charId, item, 'direct_message', index)),
    ...seeds.map((item, index) => normalizeLine(charId, item, 'rewrite_seed', index)),
    ...fingerprints.map((item, index) => normalizeLine(charId, item, 'language_fingerprint', index)),
    ...rawLines.map((item, index) => {
      const requested = (item as any)?.kind;
      const kind: VoiceLineKind = requested === 'direct_message' || requested === 'rewrite_seed' || requested === 'language_fingerprint'
        ? requested
        : 'language_fingerprint';
      return normalizeLine(charId, item, kind, index);
    }),
  ].filter(Boolean) as CharacterVoiceLine[];

  if (!lines.length) return null;
  return {
    charId,
    lines,
    updatedAt: Number(data.updatedAt) || undefined,
  };
};

export const loadCharacterVoiceCore = async (charId: string): Promise<CharacterVoiceCore | null> => {
  try {
    const raw = await DB.getAssetRaw(`${VOICE_CORE_ASSET_PREFIX}${charId}`);
    const normalized = normalizeVoiceCore(charId, raw);
    if (normalized) return normalized;
  } catch {
    // Voice packs are optional. Missing/corrupt imports should never block chat.
  }

  try {
    const raw = await DB.getAssetRaw(`${LEGACY_VOICE_CORE_ASSET_PREFIX}${charId}`);
    return normalizeVoiceCore(charId, raw);
  } catch {
    return null;
  }
};

const lineScore = (line: CharacterVoiceLine, queryTerms: string[], mode: WorldlinePromptMode): number => {
  const haystack = `${line.text} ${(line.tags || []).join(' ')}`.toLowerCase();
  const termHits = queryTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  const modeBoost = (() => {
    if (line.kind === 'direct_message' && mode === 'proactive_letter') return 1.2;
    if (line.kind === 'rewrite_seed' && (mode === 'meet_scene' || mode === 'date_scene' || mode === 'call')) return 0.7;
    if (line.kind === 'language_fingerprint') return 0.5;
    return 0;
  })();
  return termHits * 0.4 + modeBoost + (line.updatedAt || 0) / 10 ** 14;
};

const pickLines = (
  lines: CharacterVoiceLine[],
  kind: VoiceLineKind,
  queryTerms: string[],
  mode: WorldlinePromptMode,
  limit: number,
): CharacterVoiceLine[] => (
  lines
    .filter(line => line.kind === kind)
    .sort((a, b) => lineScore(b, queryTerms, mode) - lineScore(a, queryTerms, mode))
    .slice(0, limit)
);

const clip = (value: string, max: number): string => {
  const text = normalize(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
};

export const formatVoiceCorePrompt = (
  core: CharacterVoiceCore | null,
  params: {
    mode: WorldlinePromptMode;
    query?: string;
    profile: WorldlineDeliveryProfile;
    budgetChars?: number;
  },
): { markdown: string; usedLines: CharacterVoiceLine[] } => {
  if (!core?.lines.length) return { markdown: '', usedLines: [] };

  const terms = extractMemorySearchTerms(params.query);
  const fingerprints = params.profile.includeVoiceFingerprint
    ? pickLines(core.lines, 'language_fingerprint', terms, params.mode, 5)
    : [];
  const directLines = params.profile.includeDirectLines
    ? pickLines(core.lines, 'direct_message', terms, params.mode, 3)
    : [];
  const rewriteSeeds = params.profile.includeRewriteSeeds
    ? pickLines(core.lines, 'rewrite_seed', terms, params.mode, 3)
    : [];

  const lines: string[] = [];
  if (fingerprints.length > 0) {
    lines.push('### 角色语言指纹');
    lines.push('这些不是台词，不能照抄；只用来校准口吻、边界、习惯和在意的方式。');
    fingerprints.forEach(item => lines.push(`- ${clip(item.text, 90)}`));
  }
  if (directLines.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('### 藏好的话');
    lines.push('这些短句只适合主动来信；可直接发或轻微替换称呼，不要当成普通聊天回复模板。');
    directLines.forEach(item => lines.push(`- ${clip(item.text, 80)}`));
  }
  if (rewriteSeeds.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('### 可顺着口吻现写的种子');
    lines.push('这些只提供语气和人物倾向，需要结合当前关系、时间和热层近况重新写。');
    rewriteSeeds.forEach(item => lines.push(`- ${clip(item.text, 90)}`));
  }

  const markdown = clip(lines.join('\n').trim(), params.budgetChars || 700);
  return { markdown, usedLines: [...fingerprints, ...directLines, ...rewriteSeeds] };
};

export const pickVoiceDirectWakeupLine = async (
  rule: CompanionWakeupRule,
  char: CharacterProfile,
  userProfile: UserProfile,
  seed = Date.now(),
  usedComparables?: Set<string>,
): Promise<string> => {
  const core = await loadCharacterVoiceCore(char.id);
  const normalizeComparable = (value: string) => (
    renderTemplateLine(value, char, userProfile)
      .replace(/[，。！？、,.!?；;：:\s"'“”‘’]/g, '')
      .toLowerCase()
      .trim()
  );
  const directLines = (core?.lines.filter(line => line.kind === 'direct_message') || [])
    .filter(line => !usedComparables?.has(normalizeComparable(line.text)));
  if (directLines.length === 0) return '';

  const queryTerms = extractMemorySearchTerms(`${rule.title} ${rule.value}`);
  const ranked = [...directLines].sort((a, b) => (
    lineScore(b, queryTerms, 'proactive_letter') - lineScore(a, queryTerms, 'proactive_letter')
  ));
  const pool = ranked.slice(0, Math.min(8, ranked.length));
  const picked = pool[hashText(`${rule.id}:${seed}:${rule.title}`) % Math.max(1, pool.length)];
  return picked ? renderTemplateLine(picked.text, char, userProfile) : '';
};
