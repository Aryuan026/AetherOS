import type { HistoryScope } from '../historyImport/types.ts';

export const WORLDBOOK_LIVE_SCHEMA_VERSION = 1 as const;
export const WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const WORLDBOOK_PROJECTION_SCHEMA_VERSION = 1 as const;

export type WorldbookRevisionSourceKind =
  | 'built_in'
  | 'player'
  | 'import'
  | 'narrative_promotion'
  | 'revision_restore'
  | 'legacy_normalization';

export interface WorldbookRevisionSourceRef {
  kind: WorldbookRevisionSourceKind;
  refId: string;
  revision?: number;
}

export type WorldbookGroupOwner =
  | {
      kind: 'character';
      charId: string;
    }
  | {
      kind: 'universal';
    };

/**
 * Player-authored Worldbooks are governed as groups. The assignment is stable
 * for one entry; reusing content in another group creates an independent copy.
 */
export interface WorldbookGroupAssignment {
  id: string;
  name: string;
  owner: WorldbookGroupOwner;
  /** Player-controlled library order. Missing values keep the legacy name order. */
  sortOrder?: number;
  /** Pinned groups are shown before the ordinary library order. */
  pinned?: boolean;
}

export type WorldbookBinding =
  | {
      id: string;
      kind: 'global';
    }
  | {
      id: string;
      kind: 'relationship';
      scope: HistoryScope;
    }
  | {
      id: string;
      kind: 'mainline';
      scope: HistoryScope;
      routeId?: string;
    }
  | {
      id: string;
      kind: 'if_branch';
      scope: HistoryScope;
      routeId: string;
      branchId: string;
    }
  | {
      id: string;
      kind: 'route';
      scope: HistoryScope;
      lane: 'mainline' | 'if_line';
      routeId: string;
      branchId?: string;
    };

export type WorldbookKnowledgeSubjectKind =
  | 'user'
  | 'character'
  | 'npc'
  | 'organization'
  | 'narrator';

export interface WorldbookKnowledgeSubjectRef {
  kind: WorldbookKnowledgeSubjectKind;
  id: string;
}

export type WorldbookKnowledgePolicy =
  | {
      kind: 'public';
    }
  | {
      kind: 'entities';
      subjects: readonly WorldbookKnowledgeSubjectRef[];
    }
  | {
      kind: 'director_only';
    };

export interface WorldbookRevisionSnapshot {
  schemaVersion: typeof WORLDBOOK_LIVE_SCHEMA_VERSION;
  id: string;
  entryId: string;
  revision: number;
  title: string;
  content: string;
  category: string;
  aliases: readonly string[];
  activationHint?: string;
  /** Library lifecycle only. Character eligibility is owned exclusively by mounts. */
  publicationStatus: 'published' | 'archived';
  bindings: readonly WorldbookBinding[];
  knowledgePolicy: WorldbookKnowledgePolicy;
  supplementsEntryIds: readonly string[];
  sourceRefs: readonly WorldbookRevisionSourceRef[];
  contentHash: string;
  createdAt: number;
}

/** Optional lifecycle fields carried by the existing Worldbook record. */
export interface WorldbookLiveFields {
  worldbookSchemaVersion?: typeof WORLDBOOK_LIVE_SCHEMA_VERSION;
  activeRevisionId?: string;
  revisionSnapshots?: WorldbookRevisionSnapshot[];
}

export interface WorldGrowthCandidateDraft {
  title: string;
  content: string;
  category: string;
  aliases?: readonly string[];
  activationHint?: string;
  publicationStatus?: 'published' | 'archived';
  bindings: readonly WorldbookBinding[];
  knowledgePolicy: WorldbookKnowledgePolicy;
  supplementsEntryIds?: readonly string[];
  sourceRefs: readonly WorldbookRevisionSourceRef[];
}

/** Player-visible review fields. Scope, knowledge, bindings, and provenance stay immutable. */
export interface WorldGrowthCandidatePlayerReview {
  title: string;
  content: string;
  group: WorldbookGroupAssignment;
}

export interface WorldGrowthCandidate {
  schemaVersion: typeof WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION;
  id: string;
  targetEntryId?: string;
  baseRevisionId?: string;
  scope?: HistoryScope;
  source:
    | { kind: 'manual'; refId: string }
    | { kind: 'import'; refId: string; revision: number }
    | {
        kind: 'narrative';
        refId: string;
        lane: 'mainline' | 'if_line';
        routeId: string;
        branchId?: string;
      };
  draft: WorldGrowthCandidateDraft;
  status: 'pending' | 'deferred' | 'ignored' | 'accepted';
  truthEffect: 'none';
  createdAt: number;
  updatedAt: number;
  acceptedRevisionId?: string;
}

export interface WorldbookContinuityRef {
  lane: 'mainline' | 'if_line';
  routeId?: string;
  branchId?: string;
}

export type WorldbookProjectionConsumerKind =
  | 'chat'
  | 'call'
  | 'date'
  | 'story_mainline'
  | 'story_if'
  | 'world_director'
  | 'worldbook_preview'
  | 'other';

export interface WorldbookProjectionConsumerRef {
  kind: WorldbookProjectionConsumerKind;
  id: string;
  revision: string;
}

export interface WorldbookProjectionExplicitRef {
  entryId: string;
  revisionId?: string;
}

/**
 * Selection request only. The library is injected separately by the owner of
 * the Worldbook repository so callers cannot smuggle candidate drafts into it.
 */
export interface WorldbookProjectionRequest {
  schemaVersion: typeof WORLDBOOK_PROJECTION_SCHEMA_VERSION;
  requestId: string;
  scope: HistoryScope;
  consumer: WorldbookProjectionConsumerRef;
  continuity?: WorldbookContinuityRef;
  /** Resolved entry eligibility after group ownership/mount checks. */
  mountedEntryIds: readonly string[];
  /** Explicit in-world knowledge viewpoint; never inferred from consumer.id. */
  knowledgeSubjects: readonly WorldbookKnowledgeSubjectRef[];
  query: string;
  explicitRefs?: readonly WorldbookProjectionExplicitRef[];
  budgetChars: number;
  maxEntries: number;
  maxCharsPerEntry?: number;
}

export type WorldbookProjectionDropReason =
  | 'not_mounted'
  | 'character_visibility'
  | 'archived'
  | 'scope'
  | 'knowledge'
  | 'stale_revision'
  | 'not_relevant'
  | 'budget';

export interface WorldbookProjectionItem {
  entryId: string;
  revisionId: string;
  revision: number;
  title: string;
  category: string;
  aliases: readonly string[];
  activationHint?: string;
  excerpt: string;
  contentHash: string;
  matchedBindingIds: readonly string[];
  selectedBy: 'explicit_ref' | 'relevance';
  score: number;
  charCount: number;
}

export interface WorldbookProjectionDrop {
  entryId: string;
  reason: WorldbookProjectionDropReason;
}

export interface WorldbookProjectionResult {
  schemaVersion: typeof WORLDBOOK_PROJECTION_SCHEMA_VERSION;
  selectionId: string;
  requestId: string;
  scope: HistoryScope;
  consumer: WorldbookProjectionConsumerRef;
  continuity?: WorldbookContinuityRef;
  knowledgeSubjects: readonly WorldbookKnowledgeSubjectRef[];
  queryHash: string;
  budgetChars: number;
  usedChars: number;
  items: readonly WorldbookProjectionItem[];
  dropped: readonly WorldbookProjectionDrop[];
  truthEffect: 'none';
}

export interface WorldbookProjectionDeliveryReceipt {
  schemaVersion: typeof WORLDBOOK_PROJECTION_SCHEMA_VERSION;
  id: string;
  selectionId: string;
  requestId: string;
  scope: HistoryScope;
  scopeKey: string;
  consumer: WorldbookProjectionConsumerRef;
  knowledgeSubjects: readonly WorldbookKnowledgeSubjectRef[];
  delivered: readonly {
    entryId: string;
    revisionId: string;
    contentHash: string;
    charCount: number;
  }[];
  budgetChars: number;
  usedChars: number;
  status: 'delivered';
  truthEffect: 'none';
  deliveredAt: number;
}
