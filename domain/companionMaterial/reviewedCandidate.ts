import type { CompanionMaterialSourceRef } from './types.ts';

export const REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION = 1 as const;

export type ReviewedCompanionMaterialCandidateCategory = 'A' | 'B' | 'C';

export type ReviewedCompanionMaterialCandidateLane =
  | 'stable_detail_claim'
  | 'opening_recipe'
  | 'proactive_seed'
  | 'motive_candidate'
  | 'scene_affordance';

export type ReviewedCompanionMaterialCandidateAuthority =
  | 'character_canon_review'
  | 'canonical_thread_or_artifact'
  | 'director_scene_plan'
  | 'director_motive';

/**
 * A reviewed, non-verbatim possibility that has not yet received the named
 * authority needed to become selectable runtime material.
 *
 * This is deliberately not a CompanionMaterialRecord. Merely shipping a
 * candidate in code cannot make it prompt-visible, current truth, relationship
 * memory, Character Life state, or a played ScenePlan.
 */
export interface ReviewedCompanionMaterialCandidate {
  schemaVersion: typeof REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION;
  id: string;
  charId: string;
  category: ReviewedCompanionMaterialCandidateCategory;
  materialLane: ReviewedCompanionMaterialCandidateLane;
  route: string;
  guidance: string;
  factStrength: string;
  renderPolicy: string;
  eligibleSurfaces: readonly string[];
  allowWhen: readonly string[];
  suppressWhen: readonly string[];
  truthBoundary: string;
  consumerPort: string;
  activationAuthority: ReviewedCompanionMaterialCandidateAuthority;
  sourceRefs: readonly CompanionMaterialSourceRef[];
  supportingSourceCount: number;
  status: 'reviewed_candidate';
  runtimeDelivery: 'forbidden_until_authorized_promotion';
  truthEffect: 'none';
  relationshipMemoryEffect: 'none';
  revision: number;
}

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

export const validateReviewedCompanionMaterialCandidate = (
  candidate: ReviewedCompanionMaterialCandidate,
): string[] => {
  const errors: string[] = [];
  if (
    candidate?.schemaVersion
    !== REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION
  ) {
    errors.push('schemaVersion is unsupported');
  }
  for (const key of [
    'id',
    'charId',
    'route',
    'guidance',
    'factStrength',
    'renderPolicy',
    'truthBoundary',
    'consumerPort',
  ] as const) {
    if (!nonEmpty(candidate?.[key])) errors.push(`${key} is required`);
  }
  if (!['A', 'B', 'C'].includes(candidate?.category)) {
    errors.push('category is invalid');
  }
  if (![
    'stable_detail_claim',
    'opening_recipe',
    'proactive_seed',
    'motive_candidate',
    'scene_affordance',
  ].includes(candidate?.materialLane)) {
    errors.push('materialLane is invalid');
  }
  if (![
    'character_canon_review',
    'canonical_thread_or_artifact',
    'director_scene_plan',
    'director_motive',
  ].includes(candidate?.activationAuthority)) {
    errors.push('activationAuthority is invalid');
  }
  const expectedCategoryAndAuthority: Record<
    ReviewedCompanionMaterialCandidateLane,
    {
      category: ReviewedCompanionMaterialCandidateCategory;
      authority: ReviewedCompanionMaterialCandidateAuthority;
    }
  > = {
    stable_detail_claim: {
      category: 'A',
      authority: 'character_canon_review',
    },
    opening_recipe: {
      category: 'B',
      authority: 'canonical_thread_or_artifact',
    },
    proactive_seed: {
      category: 'B',
      authority: 'canonical_thread_or_artifact',
    },
    motive_candidate: {
      category: 'B',
      authority: 'director_motive',
    },
    scene_affordance: {
      category: 'C',
      authority: 'director_scene_plan',
    },
  };
  const expected = expectedCategoryAndAuthority[candidate?.materialLane];
  if (
    expected
    && (
      candidate.category !== expected.category
      || candidate.activationAuthority !== expected.authority
    )
  ) {
    errors.push('category, materialLane, and activationAuthority are incompatible');
  }
  if (!candidate?.eligibleSurfaces?.length) errors.push('eligibleSurfaces are required');
  if (!candidate?.allowWhen?.length) errors.push('allowWhen is required');
  if (!candidate?.suppressWhen?.length) errors.push('suppressWhen is required');
  if (!candidate?.sourceRefs?.length) errors.push('sourceRefs are required');
  if (
    !Number.isInteger(candidate?.supportingSourceCount)
    || candidate.supportingSourceCount < candidate.sourceRefs.length
  ) {
    errors.push('supportingSourceCount must cover every representative source ref');
  }
  if (candidate?.status !== 'reviewed_candidate') errors.push('status is invalid');
  if (candidate?.runtimeDelivery !== 'forbidden_until_authorized_promotion') {
    errors.push('candidate cannot authorize runtime delivery');
  }
  if (candidate?.truthEffect !== 'none') errors.push('candidate cannot change truth');
  if (candidate?.relationshipMemoryEffect !== 'none') {
    errors.push('candidate cannot write relationship memory');
  }
  if (!Number.isInteger(candidate?.revision) || candidate.revision < 1) {
    errors.push('revision must be a positive integer');
  }
  if (new Set(candidate.sourceRefs.map(ref => ref.sourceFingerprint)).size
      !== candidate.sourceRefs.length) {
    errors.push('source fingerprints must be unique');
  }
  return errors;
};
