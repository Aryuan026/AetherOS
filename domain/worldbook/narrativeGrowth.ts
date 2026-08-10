import type { HistoryScope } from '../historyImport/types.ts';
import {
  createNarrativeDirectorContext,
  type NarrativeDirectorCurrentTruth,
  type NarrativeDirectorReadOnly,
} from '../narrative/directorContext.ts';
import { createWorldGrowthCandidate } from './contract.ts';
import type {
  WorldbookKnowledgePolicy,
  WorldGrowthCandidate,
} from './types.ts';

export interface ProposedNarrativeWorldDraft {
  proposalId: string;
  title: string;
  content: string;
  category: string;
  aliases?: readonly string[];
  activationHint?: string;
  knowledgePolicy: WorldbookKnowledgePolicy;
  supplementsEntryIds?: readonly string[];
}

export interface CreateNarrativeWorldGrowthCandidatesInput {
  scope: HistoryScope;
  currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>;
  source: {
    receiptId: string;
    runId: string;
    sceneId: string;
  };
  proposedDrafts: readonly ProposedNarrativeWorldDraft[];
  createdAt: number;
}

const requireNonEmpty = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
};

/**
 * Adapts explicit, caller-authored drafts into review-only Worldbook growth
 * candidates. The confirmed receipt is provenance and eligibility evidence;
 * its accepted facts are never copied into a draft automatically.
 */
export const createNarrativeWorldGrowthCandidates = (
  input: CreateNarrativeWorldGrowthCandidatesInput,
): WorldGrowthCandidate[] => {
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) {
    throw new Error('Narrative Worldbook growth createdAt must be a finite timestamp');
  }
  if (!input.proposedDrafts.length) {
    throw new Error('Narrative Worldbook growth requires explicit proposed drafts');
  }

  const context = createNarrativeDirectorContext({
    scope: input.scope,
    currentTruth: input.currentTruth,
  });
  const receiptId = requireNonEmpty(input.source.receiptId, 'source.receiptId');
  const runId = requireNonEmpty(input.source.runId, 'source.runId');
  const sceneId = requireNonEmpty(input.source.sceneId, 'source.sceneId');
  const experience = context.currentTruth.confirmedExperiences.find(entry => (
    entry.receipt.id === receiptId
    && entry.run.id === runId
    && entry.scene.id === sceneId
  ));
  if (!experience) {
    throw new Error('Narrative Worldbook growth source is not a matching user-confirmed experience');
  }

  const proposalIds = input.proposedDrafts.map((draft, index) => (
    requireNonEmpty(draft.proposalId, `proposedDrafts[${index}].proposalId`)
  ));
  if (new Set(proposalIds).size !== proposalIds.length) {
    throw new Error('Narrative Worldbook growth proposal ids must be unique');
  }

  return input.proposedDrafts.map((draft, index) => {
    if ('targetEntryId' in draft || 'baseRevisionId' in draft) {
      throw new Error('Narrative Worldbook growth cannot update an existing entry before a typed target gate exists');
    }
    const proposalId = proposalIds[index];
    const candidateId = `world-growth:narrative:${receiptId}:${proposalId}`;
    const binding = experience.run.lane === 'mainline'
      ? {
          id: `${candidateId}:binding:mainline`,
          kind: 'mainline' as const,
          scope: { ...context.scope },
          routeId: experience.run.routeId,
        }
      : {
          id: `${candidateId}:binding:if`,
          kind: 'if_branch' as const,
          scope: { ...context.scope },
          routeId: experience.run.routeId,
          branchId: experience.run.branchId,
        };

    return createWorldGrowthCandidate({
      id: candidateId,
      scope: { ...context.scope },
      source: {
        kind: 'narrative',
        refId: receiptId,
        lane: experience.run.lane,
        routeId: experience.run.routeId,
        branchId: experience.run.branchId,
      },
      draft: {
        title: draft.title,
        content: draft.content,
        category: draft.category,
        aliases: draft.aliases,
        activationHint: draft.activationHint,
        publicationStatus: 'published',
        bindings: [binding],
        knowledgePolicy: draft.knowledgePolicy,
        supplementsEntryIds: draft.supplementsEntryIds,
        sourceRefs: [
          { kind: 'narrative_promotion', refId: receiptId },
          { kind: 'narrative_promotion', refId: runId },
          { kind: 'narrative_promotion', refId: sceneId },
        ],
      },
      createdAt: input.createdAt,
    });
  });
};
