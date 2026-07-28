#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ARTIFACT = path.resolve(
  ROOT,
  '..',
  'aetheros-material-analysis',
  'research',
  'lysk-reviewed-private',
  'material-analysis-v3',
  'all-leads-four-lane-material-artifact-v1.json',
);
const artifactPath = process.env.AETHEROS_PRIVATE_MATERIAL_ARTIFACT || DEFAULT_ARTIFACT;
const outputPath = path.join(
  ROOT,
  'domain',
  'companionMaterial',
  'builtInDeepspaceFourLaneReviewed.ts',
);
const sourceAuditOutputPath = path.join(
  ROOT,
  'scripts',
  'fixtures',
  'built-in-deepspace-four-lane-source-audit.ts',
);
const candidateOutputPath = path.join(
  ROOT,
  'domain',
  'companionMaterial',
  'builtInDeepspaceScopedCandidates.ts',
);

const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
const active = artifact.reviewedAssets.filter(asset => asset.status === 'active');
const reviewedCandidates = artifact.reviewedAssets.filter(asset => (
  asset.status === 'disabled'
  && asset.sourceClusterPart === 'scoped_second_density_split'
));
const activeIds = new Set(active.map(asset => asset.id));
const reviewedCandidateIds = new Set(reviewedCandidates.map(asset => asset.id));

const modeMap = {
  chat: 'remote_chat',
  call: 'call',
  meet_scene: 'meet_scene',
  date_scene: 'date_scene',
  proactive_letter: 'proactive_letter',
  storydesk: 'story_planning',
  story_scene: 'story_scene',
};

const unique = values => [...new Set(values.filter(Boolean))];
const signal = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
const roleSignal = asset => {
  if (asset.charId === 'builtin-zayne') return ['practical_next_step', 'observation'];
  if (asset.charId === 'builtin-sylus') return ['choice_tradeoff', 'observation'];
  if (asset.charId === 'builtin-daily-companion') return ['observation', 'sensory_detail', 'humor'];
  if (asset.charId === 'builtin-xavier') return ['observation', 'playful_premise', 'light_scene'];
  return ['ordinary_share', 'playful_premise', 'humor'];
};

const shapeFor = asset => {
  if (asset.materialLane === 'language_fingerprint') {
    return {
      kind: 'language_fingerprint',
      slot: 'stable_character_voice',
      renderPolicy: 'style_only',
      purposes: ['stable_context'],
      positiveSignals: roleSignal(asset),
      suppressSignals: ['low_signal', 'mild_discomfort', 'care_needed', 'refusal', 'reentry', 'no_advice_chat'],
      variationGroup: signal(`${asset.charId}_voice`),
      groundingPolicy: {
        anyOf: roleSignal(asset).map(claimKey => ({ kind: 'live_user_turn', claimKey })),
      },
    };
  }
  if (asset.materialLane === 'stable_base' || asset.materialLane === 'stable_detail_claim') {
    const positiveSignals = roleSignal(asset);
    return {
      kind: 'stable_detail',
      slot: asset.materialLane === 'stable_base' ? 'stable_base' : 'relevant_stable_details',
      renderPolicy: 'fact_reference',
      purposes: ['stable_context'],
      positiveSignals,
      suppressSignals: ['low_signal', 'mild_discomfort', 'care_needed', 'technical_meta', 'tool_request'],
      variationGroup: signal(`${asset.charId}_${asset.materialLane}`),
      groundingPolicy: {
        anyOf: positiveSignals.map(claimKey => ({ kind: 'live_user_turn', claimKey })),
      },
    };
  }
  if (asset.materialLane === 'opening_recipe') {
    const positiveSignals = unique(['opening', ...roleSignal(asset)]);
    const liveClaims = positiveSignals.filter(signal => signal !== 'opening');
    const reentry = asset.id.includes('reentry');
    return {
      kind: 'opening_recipe',
      slot: 'opening_recipes',
      renderPolicy: 'transform_required',
      purposes: ['opening'],
      positiveSignals: reentry ? ['reentry'] : positiveSignals,
      suppressSignals: ['low_signal', 'mild_discomfort', 'care_needed', 'technical_meta', 'tool_request'],
      variationGroup: signal(`${asset.charId}_${reentry ? 'reentry' : 'opening'}`),
      groundingPolicy: reentry
        ? {
            allOf: [{ kind: 'canonical_thread_receipt', claimKey: 'reentry_thread' }],
          }
        : {
            anyOf: liveClaims.map(claimKey => ({ kind: 'live_user_turn', claimKey })),
          },
    };
  }
  if (asset.materialLane === 'proactive_seed') {
    const care = asset.id.includes('optional_care');
    const positiveSignals = care
      ? ['proactive_intent', 'care_needed', 'mild_discomfort']
      : ['proactive_intent', 'character_self_share', 'independent_life'];
    return {
      kind: 'proactive_seed',
      slot: 'proactive_seeds',
      renderPolicy: 'transform_required',
      purposes: ['proactive_intent'],
      positiveSignals,
      suppressSignals: care
        ? ['low_signal', 'refusal', 'no_advice_chat']
        : ['mild_discomfort', 'care_needed'],
      variationGroup: signal(`${asset.charId}_${care ? 'optional_care' : 'own_thread'}`),
      groundingPolicy: care
        ? {
            allOf: [{ kind: 'confirmed_user_state', claimKey: 'care_relevant_state' }],
          }
        : {
            allOf: [{ kind: 'character_life_receipt', claimKey: 'self_life_thread' }],
          },
    };
  }
  if (asset.materialLane === 'motive_candidate') {
    return {
      kind: 'initiative_motive',
      slot: 'motive_candidates',
      renderPolicy: 'decision_context',
      purposes: ['scene_planning'],
      positiveSignals: ['scene_planning', 'choice_tradeoff'],
      suppressSignals: ['low_signal', 'technical_meta', 'tool_request'],
      variationGroup: signal(`${asset.charId}_motive_candidate`),
      groundingPolicy: {
        anyOf: [
          { kind: 'scene_context', claimKey: 'scene_planning' },
          { kind: 'scene_context', claimKey: 'choice_tradeoff' },
        ],
      },
    };
  }
  if (asset.materialLane === 'scene_affordance') {
    return {
      kind: 'scene_affordance',
      slot: 'scene_affordances',
      renderPolicy: 'decision_context',
      purposes: ['scene_planning'],
      positiveSignals: ['scene_planning', 'light_scene'],
      suppressSignals: ['low_signal', 'technical_meta', 'tool_request'],
      variationGroup: signal(`${asset.charId}_scene_affordance`),
      groundingPolicy: {
        anyOf: [
          { kind: 'scene_context', claimKey: 'scene_planning' },
          { kind: 'scene_context', claimKey: 'light_scene' },
        ],
      },
    };
  }
  throw new Error(`Unsupported active material lane: ${asset.materialLane}`);
};

const specs = active.map(asset => {
  const shape = shapeFor(asset);
  return {
    id: asset.id,
    charId: asset.charId,
    kind: shape.kind,
    slot: shape.slot,
    guidance: asset.guidance,
    renderPolicy: shape.renderPolicy,
    knowledge: 'char_private',
    continuity: 'canon',
    eligibleModes: unique(asset.eligibleSurfaces.map(surface => modeMap[surface])),
    eligiblePurposes: shape.purposes,
    tags: unique(shape.positiveSignals),
    retrievalHints: {
      activationPolicy: 'relevance_required',
      positiveSignals: shape.positiveSignals,
      suppressSignals: shape.suppressSignals,
      variationGroup: shape.variationGroup,
      fallbackPriority: 0,
    },
    groundingPolicy: shape.groundingPolicy,
    cooldownMs: asset.materialLane === 'language_fingerprint'
      ? 21_600_000
      : asset.materialLane === 'opening_recipe' || asset.materialLane === 'proactive_seed'
        ? 172_800_000
        : undefined,
    sourceRefs: asset.selectedEvidenceFingerprints.map((sourceFingerprint, index) => ({
      storeFamily: 'private_review',
      recordId: `${asset.id}-evidence-${index + 1}`,
      revision: 1,
      sourceFingerprint,
      sourcePackId: 'lysk-all-leads-four-lane-v1',
    })),
  };
});

const sourceAudit = active.map(asset => {
  const supporting = artifact.sourceDispositions.filter(source => (
    source.supportedReviewedAssetIds.includes(asset.id)
  ));
  return {
    materialId: asset.id,
    charId: asset.charId,
    directSupportSourceFingerprints: unique(
      supporting
        .filter(source => source.sourceRole === 'active_library_support')
        .map(source => source.sourceFingerprint),
    ),
    holdoutEvaluationSourceFingerprints: unique(
      supporting
        .filter(source => source.sourceRole === 'holdout_evaluation_only')
        .map(source => source.sourceFingerprint),
    ),
  };
});

const sourcesSupportingActive = artifact.sourceDispositions.filter(source => (
  source.supportedReviewedAssetIds.some(assetId => activeIds.has(assetId))
));
const retainedGroups = new Map();
artifact.sourceDispositions
  .filter(source => !source.supportedReviewedAssetIds.some(assetId => activeIds.has(assetId)))
  .forEach(source => {
    const supportedReviewedAssetIds = unique(source.supportedReviewedAssetIds).sort();
    const sourceReviewedCandidateIds = unique(
      source.sourceLevelDisposition?.assetIds
        ?.filter(assetId => reviewedCandidateIds.has(assetId))
        || supportedReviewedAssetIds.filter(assetId => reviewedCandidateIds.has(assetId)),
    ).sort();
    const residualReviewedAssetIds = supportedReviewedAssetIds.filter(assetId => (
      !activeIds.has(assetId)
      && !reviewedCandidateIds.has(assetId)
    ));
    const residualDisposition = sourceReviewedCandidateIds.length
      ? 'exact_scope_evidence'
      : source.sourceLevelDisposition?.kind || 'retained_unclassified';
    const groupKey = JSON.stringify([
      source.leadId,
      source.sourceRole,
      source.primaryRoute,
      supportedReviewedAssetIds,
      sourceReviewedCandidateIds,
      residualDisposition,
      residualReviewedAssetIds,
    ]);
    const current = retainedGroups.get(groupKey) || {
      leadId: source.leadId,
      sourceRole: source.sourceRole,
      primaryRoute: source.primaryRoute,
      supportedReviewedAssetIds,
      reviewedCandidateIds: sourceReviewedCandidateIds,
      residualDisposition,
      residualReviewedAssetIds,
      sourceFingerprints: [],
    };
    current.sourceFingerprints.push(source.sourceFingerprint);
    retainedGroups.set(groupKey, current);
  });
const retainedOutsideActive = [...retainedGroups.values()]
  .map(group => ({
    ...group,
    sourceFingerprints: unique(group.sourceFingerprints).sort(),
  }))
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
const activeSupportByLead = Object.fromEntries(
  Object.entries(artifact.sourceConservation.byLead).map(([leadId, counts]) => [
    leadId,
    counts.sourcesSupportingActiveLibrary,
  ]),
);
const sourceConservationSummary = {
  totalReviewedSources: artifact.sourceConservation.total,
  sourcesSupportingActiveLibrary: artifact.sourceConservation.sourcesSupportingActiveLibrary,
  directLibrarySupportSources: unique(
    sourcesSupportingActive
      .filter(source => source.sourceRole === 'active_library_support')
      .map(source => source.sourceFingerprint),
  ).length,
  holdoutEvaluationSourcesSupportingActiveLibrary: unique(
    sourcesSupportingActive
      .filter(source => source.sourceRole === 'holdout_evaluation_only')
      .map(source => source.sourceFingerprint),
  ).length,
  sourcesRetainedOutsideActiveLibrary:
    artifact.sourceConservation.sourcesOnlySupportingDisabledWithheldOrHoldout,
  retainedManifestGroups: retainedOutsideActive.length,
  activeSupportByLead,
};

const generatedAt = 'Date.UTC(2026, 6, 28)';
const body = `import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
} from './types.ts';

/**
 * Generated from the private 909-source adjudication artifact.
 *
 * This public file contains only non-verbatim creative guidance and opaque
 * evidence fingerprints. Source dialogue, titles, URLs and paths are absent.
 * Sparse delivery remains selector-owned; this is the rich material library,
 * not a request to inject every item.
 */
const REVIEWED_AT = ${generatedAt};

type FourLaneSpec = Omit<
  CompanionMaterialRecord,
  'schemaVersion' | 'ownerScope' | 'createdAt' | 'updatedAt' | 'revision' | 'status'
>;

const SPECS = ${JSON.stringify(specs, null, 2)} as const satisfies readonly FourLaneSpec[];

export const BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL:
readonly CompanionMaterialRecord[] = SPECS.map(spec => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  ownerScope: { kind: 'character', charId: spec.charId },
  status: 'active',
  createdAt: REVIEWED_AT,
  updatedAt: REVIEWED_AT,
  revision: 1,
  ...spec,
}));
`;

await writeFile(outputPath, body);

const candidateAuthorityFor = candidate => {
  if (candidate.category === 'A') return 'character_canon_review';
  if (candidate.materialLane === 'motive_candidate') return 'director_motive';
  if (candidate.materialLane === 'scene_affordance') return 'director_scene_plan';
  return 'canonical_thread_or_artifact';
};

const candidateSpecs = reviewedCandidates.map(candidate => {
  const supportingSourceCount = artifact.sourceDispositions.filter(source => (
    source.supportedReviewedAssetIds.includes(candidate.id)
  )).length;
  return {
    id: candidate.id,
    charId: candidate.charId,
    category: candidate.category,
    materialLane: candidate.materialLane,
    route: candidate.route,
    guidance: candidate.guidance,
    factStrength: candidate.factStrength,
    renderPolicy: candidate.renderPolicy,
    eligibleSurfaces: unique(candidate.eligibleSurfaces),
    allowWhen: unique(candidate.allowWhen),
    suppressWhen: unique(candidate.suppressWhen),
    truthBoundary: candidate.truthBoundary,
    consumerPort: candidate.consumerPort,
    activationAuthority: candidateAuthorityFor(candidate),
    sourceRefs: candidate.selectedEvidenceFingerprints.map((sourceFingerprint, index) => ({
      storeFamily: 'private_review',
      recordId: `${candidate.id}-evidence-${index + 1}`,
      revision: 1,
      sourceFingerprint,
      sourcePackId: 'lysk-all-leads-four-lane-v1',
    })),
    supportingSourceCount,
  };
});

const candidateBody = `import {
  REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION,
  type ReviewedCompanionMaterialCandidate,
} from './reviewedCandidate.ts';

/**
 * Generated from the private second-density adjudication.
 *
 * These non-verbatim candidates preserve reusable value that needs a named
 * canon, thread, artifact or Director authority. They are intentionally not
 * CompanionMaterialRecord values and cannot enter a model prompt merely by
 * existing in the public build.
 */
const SPECS = ${JSON.stringify(candidateSpecs, null, 2)} as const;

export const BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES:
readonly ReviewedCompanionMaterialCandidate[] = SPECS.map(spec => ({
  schemaVersion: REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION,
  status: 'reviewed_candidate',
  runtimeDelivery: 'forbidden_until_authorized_promotion',
  truthEffect: 'none',
  relationshipMemoryEffect: 'none',
  revision: 1,
  ...spec,
}));
`;

await writeFile(candidateOutputPath, candidateBody);

const sourceAuditBody = `/**
 * Generated source-conservation fixture for the reviewed four-lane library.
 *
 * It is deliberately kept outside the runtime material graph: prompt
 * deliveries retain only a small representative proof set, while this fixture
 * proves that the full adjudicated support network and the blind holdout set
 * were not mistaken for "unused" sources. It contains opaque fingerprints
 * only, never source dialogue, titles, URLs or local paths.
 */
export const BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT = ${JSON.stringify(sourceAudit, null, 2)} as const;

export const BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_CONSERVATION = ${JSON.stringify(sourceConservationSummary, null, 2)} as const;

/**
 * Opaque manifest for the 493 sources that do not support an active runtime
 * asset yet. Candidate ids are explicit rather than inferred from naming, and
 * each candidate-supporting source keeps its residual exact-scope evidence
 * destination. This makes "retained" independently auditable in public CI
 * without exposing source text, titles, URLs or private paths.
 */
export const BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST = ${JSON.stringify(retainedOutsideActive, null, 2)} as const;
`;

await writeFile(sourceAuditOutputPath, sourceAuditBody);
console.log(JSON.stringify({
  outputPath,
  candidateOutputPath,
  sourceAuditOutputPath,
  sources: artifact.sourceConservation.total,
  sourcesSupportingActiveLibrary: artifact.sourceConservation.sourcesSupportingActiveLibrary,
  directLibrarySupportSources: sourceConservationSummary.directLibrarySupportSources,
  holdoutEvaluationSourcesSupportingActiveLibrary:
    sourceConservationSummary.holdoutEvaluationSourcesSupportingActiveLibrary,
  activeMaterials: specs.length,
  reviewedCandidates: candidateSpecs.length,
}, null, 2));
