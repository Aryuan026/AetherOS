import type { CharacterProfile, UserProfile } from '../../types.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  assertMemoryExtractionRequest,
  assertMemoryExtractionReceipt,
  assertMemoryInterpretationPass,
  createMemoryCandidateId,
  createMemoryExtractionReceiptId,
  createMemoryExtractionRequestId,
  createMemoryInterpretationPassId,
  type MemoryDMEvidenceReadPort,
  type MemoryInterpretationStorePort,
} from '../../domain/memoryInterpretation/index.ts';
import { createEvidenceSpan } from '../../domain/interactionEvidence/index.ts';
import { strictRelationshipScopeForProfile } from '../messageContext.ts';
import { resolvePersonaRouteScope } from '../personaRouteScope.ts';
import { dailyArchiveEvidenceReadPort } from './evidencePort.ts';
import { memoryInterpretationStore } from './interpretationStore.ts';

export const AUTO_MEMORY_UPDATED_EVENT = 'worldline-auto-memory-updated';

const SETTINGS_STORAGE_KEY = 'aetheros_auto_memory_settings_v2';
const LEDGER_STORAGE_KEY = 'aetheros_auto_memory_ledger_v2';
const MAX_LEDGER_ROWS = 80;
const DEFAULT_MIN_MESSAGES = 3;
const DEFAULT_QUIET_MINUTES = 90;
const PROMPT_VERSION = 'timebook-heuristic-v1';
const OUTPUT_SCHEMA_VERSION = 'memory-candidates-v1';

export type AutoMemoryDailyMode = 'off' | 'auto' | 'manual';
export type AutoTimebookCandidateMode = 'silent' | 'off';
export type AutoMemoryTrigger = 'auto' | 'manual';

export interface AutoMemorySettings {
  dailyChatMode: AutoMemoryDailyMode;
  timebookCandidateMode: AutoTimebookCandidateMode;
  keepTrivialMoments: boolean;
  minMessagesPerDailyMemory: number;
  quietMinutesBeforeTodayArchive: number;
}

export interface AutoMemoryLedgerEntry {
  id: string;
  at: number;
  charId: string;
  charName: string;
  kind: 'daily_chat' | 'timebook_candidate';
  status: 'proposed' | 'skipped' | 'failed';
  title: string;
  summary?: string;
  sourceDate?: string;
  messageCount?: number;
  targetId?: string;
  reason?: string;
  trigger: AutoMemoryTrigger;
}

export interface AutoMemoryPassResult {
  candidateCount: number;
  /** Extraction-only invariants retained for existing callers. */
  appendedMemoryCount: 0;
  savedTimebookCount: 0;
  skippedCount: number;
  failedCount: number;
  ledgerEntries: AutoMemoryLedgerEntry[];
}

export interface RunAutoMemoryPassInput {
  characters: CharacterProfile[];
  userProfile: UserProfile;
  trigger: AutoMemoryTrigger;
  includeToday?: boolean;
  settings?: AutoMemorySettings;
  evidencePort?: MemoryDMEvidenceReadPort;
  interpretationStore?: MemoryInterpretationStorePort;
  now?: number;
}

const defaultSettings: AutoMemorySettings = {
  dailyChatMode: 'off',
  timebookCandidateMode: 'silent',
  keepTrivialMoments: false,
  minMessagesPerDailyMemory: DEFAULT_MIN_MESSAGES,
  quietMinutesBeforeTodayArchive: DEFAULT_QUIET_MINUTES,
};

const canUseLocalStorage = (): boolean => (
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
);

const emitAutoMemoryUpdate = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUTO_MEMORY_UPDATED_EVENT));
};

const readJson = <T>(key: string, fallback: T): T => {
  if (!canUseLocalStorage()) return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Bookkeeping failure must not block the foreground interaction.
  }
};

export const loadAutoMemorySettings = (): AutoMemorySettings => ({
  ...defaultSettings,
  ...readJson<Partial<AutoMemorySettings>>(SETTINGS_STORAGE_KEY, {}),
  dailyChatMode: 'off',
  keepTrivialMoments: false,
});

export const saveAutoMemorySettings = (
  updates: Partial<AutoMemorySettings>,
): AutoMemorySettings => {
  const next: AutoMemorySettings = {
    ...loadAutoMemorySettings(),
    ...updates,
    dailyChatMode: 'off',
    keepTrivialMoments: false,
  };
  writeJson(SETTINGS_STORAGE_KEY, next);
  emitAutoMemoryUpdate();
  return next;
};

export const loadAutoMemoryLedger = (): AutoMemoryLedgerEntry[] => (
  readJson<AutoMemoryLedgerEntry[]>(LEDGER_STORAGE_KEY, [])
);

export const clearAutoMemoryLedger = (): void => {
  writeJson(LEDGER_STORAGE_KEY, []);
  emitAutoMemoryUpdate();
};

const pushLedger = (entries: AutoMemoryLedgerEntry[]): void => {
  if (!entries.length) return;
  writeJson(LEDGER_STORAGE_KEY, [...entries, ...loadAutoMemoryLedger()].slice(0, MAX_LEDGER_ROWS));
  emitAutoMemoryUpdate();
};

const toLocalDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const clip = (value: string, max: number): string => {
  const text = value.replace(/\s+/gu, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
};

const timebookSignal = /第一次|初次|初见|初识|相识|纪念|生日|周年|约定|说好|想见|见面|礼物|照片|蛋糕|旅行|出发|回家|生病|住院|考试|面试|毕业|搬家|告白|和好|重逢/iu;

export const runAutoMemoryPass = async ({
  characters,
  userProfile,
  trigger,
  includeToday = false,
  settings = loadAutoMemorySettings(),
  evidencePort = dailyArchiveEvidenceReadPort,
  interpretationStore = memoryInterpretationStore,
  now = Date.now(),
}: RunAutoMemoryPassInput): Promise<AutoMemoryPassResult> => {
  if (settings.timebookCandidateMode === 'off') {
    return { candidateCount: 0, appendedMemoryCount: 0, savedTimebookCount: 0, skippedCount: 0, failedCount: 0, ledgerEntries: [] };
  }
  const ledgerEntries: AutoMemoryLedgerEntry[] = [];
  let candidateCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const personaScope = resolvePersonaRouteScope(userProfile, characters);
  for (const char of personaScope.linkedCharacters) {
    const scope = strictRelationshipScopeForProfile(char.id, userProfile);
    if (!scope) continue;
    try {
      const [records, priorPasses] = await Promise.all([
        evidencePort.listActiveEvidence({ scope, temporalClass: 'live' }),
        interpretationStore.listPasses(scope),
      ]);
      const interpretedFingerprints = new Set(
        priorPasses
          .filter(pass => pass.extractor === 'deterministic_heuristic')
          .map(pass => pass.evidenceSpan.sourceRevisionFingerprint),
      );
      const grouped = new Map<string, typeof records>();
      records.forEach(record => {
        const rawTime = record.evidence.time.occurredAt || record.evidence.time.recordedAt;
        const parsed = Date.parse(rawTime);
        if (!Number.isFinite(parsed)) return;
        const dateKey = toLocalDate(parsed);
        grouped.set(dateKey, [...(grouped.get(dateKey) || []), record]);
      });

      for (const [dateKey, dayRecords] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const latestAt = Math.max(...dayRecords.map(record => Date.parse(record.evidence.time.occurredAt || record.evidence.time.recordedAt)));
        const isToday = dateKey === toLocalDate(now);
        const isQuiet = (now - latestAt) / 60000 >= settings.quietMinutesBeforeTodayArchive;
        if (isToday && !includeToday && !isQuiet) continue;
        const picked = [...dayRecords].reverse().find(record => timebookSignal.test(record.content));
        if (!picked) continue;
        const evidenceSpan = await createEvidenceSpan({
          scope,
          evidence: dayRecords.map(record => record.evidence),
        });
        if (interpretedFingerprints.has(evidenceSpan.sourceRevisionFingerprint)) {
          skippedCount += 1;
          continue;
        }
        const analysisRunId = `timebook-${dateKey}-${evidenceSpan.sourceRevisionFingerprint.slice(-16)}`;
        const requestId = createMemoryExtractionRequestId({ scope, analysisRunId });
        const request = assertMemoryExtractionRequest({
          schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
          id: requestId,
          analysisRunId,
          scope: { ...scope },
          trigger,
          evidenceSpan,
          extractor: 'deterministic_heuristic' as const,
          promptVersion: PROMPT_VERSION,
          outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
          requestedAt: now,
        });
        const passId = createMemoryInterpretationPassId(request);
        const summary = clip(picked.content, 120);
        const candidate = {
          schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
          id: createMemoryCandidateId(passId, 0),
          passId,
          scope: { ...scope },
          sourceEvidenceIds: [picked.evidence.evidenceId],
          target: 'timebook' as const,
          knowledge: 'relationship_private' as const,
          temporalClass: 'live' as const,
          authority: 'deterministic_heuristic' as const,
          status: 'proposed' as const,
          title: clip(summary.replace(/[“”"']/gu, ''), 18) || `${dateKey.slice(5).replace('-', '月')}日的片刻`,
          summary,
          happenedAt: dateKey,
          tags: ['timebook_candidate'],
        };
        const pass = assertMemoryInterpretationPass({
          schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
          id: passId,
          requestId,
          analysisRunId,
          scope: { ...scope },
          evidenceSpan,
          extractor: 'deterministic_heuristic',
          promptVersion: PROMPT_VERSION,
          outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
          status: 'completed',
          truthEffect: 'none',
          candidates: [candidate],
          startedAt: now,
          completedAt: now,
        });
        const receipt = assertMemoryExtractionReceipt({
          schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
          id: createMemoryExtractionReceiptId(requestId),
          requestId,
          passId,
          scope: { ...scope },
          evidenceSpan,
          status: 'completed',
          truthEffect: 'none',
          candidateIds: [candidate.id],
          rejectedCandidateCount: 0,
          extractor: 'deterministic_heuristic',
          promptVersion: PROMPT_VERSION,
          outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
          usage: {
            evidenceCount: dayRecords.length,
            inputCharCount: dayRecords.reduce((sum, record) => sum + record.content.length, 0),
          },
          createdAt: now,
        });
        await interpretationStore.appendCompleted(pass, receipt);
        interpretedFingerprints.add(evidenceSpan.sourceRevisionFingerprint);
        candidateCount += 1;
        ledgerEntries.push({
          id: `ledger-${candidate.id}`,
          at: now,
          charId: char.id,
          charName: char.name,
          kind: 'timebook_candidate',
          status: 'proposed',
          title: candidate.title,
          summary: candidate.summary,
          sourceDate: dateKey,
          messageCount: dayRecords.length,
          targetId: candidate.id,
          reason: 'awaiting_promotion',
          trigger,
        });
      }
    } catch (error) {
      failedCount += 1;
      ledgerEntries.push({
        id: `ledger-auto-failed-${char.id}-${now}`,
        at: now,
        charId: char.id,
        charName: char.name,
        kind: 'timebook_candidate',
        status: 'failed',
        title: '候选整理失败',
        reason: error instanceof Error ? error.message : 'unknown',
        trigger,
      });
    }
  }

  pushLedger(ledgerEntries);
  return {
    candidateCount,
    appendedMemoryCount: 0,
    savedTimebookCount: 0,
    skippedCount,
    failedCount,
    ledgerEntries,
  };
};
