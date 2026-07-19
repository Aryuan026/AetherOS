import type {
  HistoricalAuthority,
  HistoricalDerivedBase,
  HistoricalEventProfile,
  HistoricalKnowledgeScope,
  HistoricalNarrativeProfile,
  HistoricalRelationshipMemory,
  HistoricalResultStatus,
  HistoricalTimebookNode,
  ResolvedHistoricalInterpretation,
} from '../../domain/historyImport/analysis/types';
import { createHistoryScopeKey, validateHistoryScope } from '../../domain/historyImport/contract';
import type { HistoryScope, HistorySourceTime } from '../../domain/historyImport/types';
import type { UserProfile } from '../../types';
import { readResolvedHistoricalInterpretation } from '../historyImport/analysis/readAdapters';
import { strictRelationshipScopeForProfile } from '../messageContext';
import type {
  ContinuityScope,
  HistoricalConsumerSurface,
  HistoricalDeliveryMetadata,
  HistoricalSurfaceDisposition,
  MemoryStatus,
  WorldlineMemoryCandidate,
} from './types';

type HistoricalFamily =
  | 'relationship_memory'
  | 'timebook_node'
  | 'event'
  | 'route'
  | 'npc'
  | 'relationship_stage'
  | 'open_thread';

interface HistoricalSurfacePolicy {
  disposition: HistoricalSurfaceDisposition;
  families: readonly HistoricalFamily[];
  knowledge: readonly HistoricalKnowledgeScope[];
  confirmedOnly?: boolean;
  requiresQuery?: boolean;
  limit: number;
}

const PRIVATE_RELATIONSHIP_KNOWLEDGE: readonly HistoricalKnowledgeScope[] = [
  'relationship_private',
  'char_private',
  'shared',
  'public_safe',
];
const PUBLIC_KNOWLEDGE: readonly HistoricalKnowledgeScope[] = ['shared', 'public_safe'];

/**
 * Exhaustive, fail-closed map for the whole phone. Adding a new consumer
 * surface is a type error until its historical-data policy is declared here.
 */
export const HISTORICAL_SURFACE_POLICIES: Record<HistoricalConsumerSurface, HistoricalSurfacePolicy> = {
  chat: { disposition: 'required', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, limit: 10 },
  proactive_letter: { disposition: 'required', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, confirmedOnly: true, limit: 5 },
  group_chat: { disposition: 'required', families: ['relationship_memory', 'timebook_node'], knowledge: PUBLIC_KNOWLEDGE, confirmedOnly: true, limit: 5 },
  call: { disposition: 'required', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, limit: 7 },
  date: { disposition: 'required', families: ['relationship_memory', 'timebook_node', 'route'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, limit: 9 },
  special_moments: { disposition: 'required', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, confirmedOnly: true, limit: 8 },
  contact_impression: { disposition: 'required', families: ['relationship_memory', 'timebook_node', 'relationship_stage'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, requiresQuery: true, limit: 10 },
  exchange_diary: { disposition: 'required', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, requiresQuery: true, limit: 8 },
  storydesk: { disposition: 'required', families: ['relationship_memory', 'timebook_node', 'event', 'route', 'npc', 'relationship_stage', 'open_thread'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, limit: 16 },
  guidebook: { disposition: 'required', families: ['relationship_memory', 'timebook_node', 'relationship_stage'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, requiresQuery: true, limit: 8 },
  social: { disposition: 'filtered', families: ['relationship_memory', 'timebook_node'], knowledge: PUBLIC_KNOWLEDGE, confirmedOnly: true, requiresQuery: true, limit: 4 },
  check_phone: { disposition: 'filtered', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, requiresQuery: true, limit: 5 },
  songwriting: { disposition: 'filtered', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, requiresQuery: true, limit: 6 },
  companion_plan: { disposition: 'filtered', families: ['relationship_memory', 'timebook_node'], knowledge: PRIVATE_RELATIONSHIP_KNOWLEDGE, confirmedOnly: true, requiresQuery: true, limit: 5 },
  study: { disposition: 'shared', families: [], knowledge: [], limit: 0 },
  worldbook: { disposition: 'shared', families: [], knowledge: [], limit: 0 },
  room: { disposition: 'hold', families: [], knowledge: [], limit: 0 },
  trpg: { disposition: 'hold', families: [], knowledge: [], limit: 0 },
  lifesim: { disposition: 'hold', families: [], knowledge: [], limit: 0 },
  bank: { disposition: 'no_history', families: [], knowledge: [], limit: 0 },
  timebook: { disposition: 'no_history', families: [], knowledge: [], limit: 0 },
  settings: { disposition: 'no_history', families: [], knowledge: [], limit: 0 },
};

export type HistoricalInterpretationReader = (scope: HistoryScope) => Promise<ResolvedHistoricalInterpretation | null>;

export interface HistoricalSelectionResult {
  candidates: WorldlineMemoryCandidate[];
  metadata: HistoricalDeliveryMetadata;
  warnings: string[];
}

const emptySelection = (
  surface: HistoricalConsumerSurface,
  disposition: HistoricalSurfaceDisposition,
  warnings: string[] = [],
): HistoricalSelectionResult => ({
  candidates: [],
  metadata: {
    surface,
    disposition,
    candidateCount: 0,
    candidateTitles: [],
    sourceKinds: [],
    authorities: [],
  },
  warnings,
});

const assertExactRelationshipScope = (
  scope: HistoryScope,
  user: UserProfile,
  charId: string,
): void => {
  const errors = validateHistoryScope(scope);
  if (errors.length > 0) throw new Error(`invalid historical relationship scope: ${errors.join(', ')}`);
  const active = strictRelationshipScopeForProfile(charId, user);
  if (!active || createHistoryScopeKey(active) !== createHistoryScopeKey(scope)) {
    throw new Error('historical relationship scope does not match the active mask, bundle, and character');
  }
};

const sourceTime = (time?: HistorySourceTime): string | undefined => {
  if (!time) return undefined;
  if (time.iso?.trim()) return time.iso.trim();
  if (Number.isFinite(time.epochMs)) return new Date(time.epochMs!).toISOString();
  return time.originalText?.trim() || undefined;
};

const continuity = (value?: string): ContinuityScope => {
  if (value === 'mainline') return 'canon';
  if (value === 'if_line') return 'branch';
  if (value === 'scene_only') return 'scene_only';
  return 'relationship';
};

const status = (value: HistoricalResultStatus): MemoryStatus => (
  value === 'confirmed' ? 'confirmed' : value === 'soft_canon' ? 'soft_canon' : 'archived'
);

const authorityWeight = (value: HistoricalAuthority): number => {
  if (value === 'user_confirmed') return 0.98;
  if (value === 'source_explicit') return 0.9;
  if (value === 'source_inferred') return 0.74;
  return 0.58;
};

const sourceRefs = (base: HistoricalDerivedBase) => base.sourceRefs.map((ref, index) => ({
  kind: 'history_span',
  id: `${ref.documentId}:${ref.documentRevision}:${ref.startMessageOffset}:${ref.endMessageOffset}:${index}`,
  label: ref.dateKey || ref.documentId,
}));

const baseCandidate = (
  base: HistoricalDerivedBase,
  charId: string,
  title: string,
  summary: string,
  family: HistoricalFamily,
  happenedAt?: string,
  candidateContinuity: ContinuityScope = 'relationship',
): WorldlineMemoryCandidate => ({
  id: `historical:${family}:${base.id}`,
  charId,
  origin: 'system_import',
  continuity: candidateContinuity,
  knowledge: base.knowledge,
  status: status(base.status),
  title,
  summary,
  happenedAt,
  sourceRefs: sourceRefs(base),
  tags: ['history_analysis', family, base.authority],
  weight: authorityWeight(base.authority) + (base.status === 'confirmed' ? 0.08 : 0),
  temporalClass: 'historical',
  sourceKind: 'history_analysis',
  historicalAuthority: base.authority,
  historicalKnowledge: base.knowledge,
});

const relationshipCandidate = (
  item: HistoricalRelationshipMemory,
  charId: string,
): WorldlineMemoryCandidate => baseCandidate(
  item,
  charId,
  item.title,
  item.summary,
  'relationship_memory',
  sourceTime(item.occurredAt),
);

const timebookCandidate = (
  item: HistoricalTimebookNode,
  charId: string,
): WorldlineMemoryCandidate => baseCandidate(
  item,
  charId,
  item.title,
  item.summary,
  'timebook_node',
  sourceTime(item.occurredAt),
  continuity(item.continuity),
);

const narrativeCandidates = (
  profile: HistoricalNarrativeProfile | null,
  charId: string,
): Array<{ family: HistoricalFamily; candidate: WorldlineMemoryCandidate }> => {
  if (!profile) return [];
  return [
    ...profile.events.map((item: HistoricalEventProfile) => ({
      family: 'event' as const,
      candidate: baseCandidate(
        item,
        charId,
        item.title,
        item.summary,
        'event',
        sourceTime(item.startedAt),
      ),
    })),
    ...profile.routes.map(item => ({
      family: 'route' as const,
      candidate: baseCandidate(item, charId, item.title, item.summary, 'route', sourceTime(item.startedAt), continuity(item.continuity)),
    })),
    ...profile.npcs.map(item => ({
      family: 'npc' as const,
      candidate: baseCandidate(item, charId, `历史人物：${item.name}`, item.knownHistoricalFacts.join('；') || item.lastHistoricalState || item.relationshipRole || '历史人物资料', 'npc', sourceTime(item.asOf)),
    })),
    ...profile.relationshipStages.map(item => ({
      family: 'relationship_stage' as const,
      candidate: baseCandidate(item, charId, item.label, item.summary, 'relationship_stage', sourceTime(item.effectiveFrom)),
    })),
    ...profile.openThreads.map(item => ({
      family: 'open_thread' as const,
      candidate: baseCandidate(item, charId, item.title, item.summary, 'open_thread', sourceTime(item.lastEvidenceAt), item.branchId ? 'branch' : 'relationship'),
    })),
  ];
};

const queryScore = (candidate: WorldlineMemoryCandidate, query: string): number => {
  const terms = query.toLowerCase().split(/\s+/).map(item => item.trim()).filter(item => item.length >= 2);
  if (terms.length === 0) return 0;
  const haystack = `${candidate.title} ${candidate.summary} ${(candidate.tags || []).join(' ')}`.toLowerCase();
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 0.15 : 0), 0);
};

export const selectHistoricalRelationshipCandidates = async (input: {
  scope: HistoryScope;
  user: UserProfile;
  charId: string;
  surface: HistoricalConsumerSurface;
  query?: string;
  reader?: HistoricalInterpretationReader;
}): Promise<HistoricalSelectionResult> => {
  const policy = HISTORICAL_SURFACE_POLICIES[input.surface];
  if (!policy) throw new Error(`unclassified historical consumer surface: ${String(input.surface)}`);
  assertExactRelationshipScope(input.scope, input.user, input.charId);

  if (policy.disposition === 'shared' || policy.disposition === 'hold' || policy.disposition === 'no_history') {
    return emptySelection(input.surface, policy.disposition);
  }
  if (policy.requiresQuery && !input.query?.trim()) {
    return emptySelection(input.surface, policy.disposition, ['historical_query_required']);
  }

  const reader = input.reader ?? (scope => readResolvedHistoricalInterpretation({ scope }));
  const resolved = await reader(input.scope);
  if (!resolved) return emptySelection(input.surface, policy.disposition);
  if (createHistoryScopeKey(resolved.scope) !== createHistoryScopeKey(input.scope)) {
    throw new Error('historical reader returned a cross-scope interpretation');
  }

  const families = new Set(policy.families);
  const allowedKnowledge = new Set(policy.knowledge);
  const source: Array<{ family: HistoricalFamily; candidate: WorldlineMemoryCandidate }> = [
    ...resolved.relationshipMemories
      .filter(item => item.memoryPolicy !== 'source_only' || input.surface === 'storydesk')
      .filter(item => item.memoryPolicy !== 'dream_material' || input.surface === 'storydesk' || input.surface === 'songwriting')
      .map(item => ({ family: 'relationship_memory' as const, candidate: relationshipCandidate(item, input.charId) })),
    ...resolved.timebookNodes.map(item => ({ family: 'timebook_node' as const, candidate: timebookCandidate(item, input.charId) })),
    ...narrativeCandidates(resolved.narrativeProfile, input.charId),
  ];

  const candidates = source
    .filter(item => families.has(item.family))
    .map(item => item.candidate)
    .filter(item => allowedKnowledge.has(item.historicalKnowledge!))
    .filter(item => !policy.confirmedOnly || item.status === 'confirmed')
    .map(item => ({ ...item, weight: item.weight + queryScore(item, input.query || '') }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, policy.limit);

  return {
    candidates,
    metadata: {
      surface: input.surface,
      disposition: policy.disposition,
      candidateCount: candidates.length,
      candidateTitles: candidates.map(item => item.title).slice(0, 6),
      sourceKinds: candidates.length > 0 ? ['history_analysis'] : [],
      authorities: [...new Set(candidates.flatMap(item => item.historicalAuthority ? [item.historicalAuthority] : []))],
    },
    warnings: [],
  };
};
