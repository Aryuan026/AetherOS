import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES,
} from '../domain/companionMaterial/builtInDeepspaceScopedCandidates.ts';
import {
  validateReviewedCompanionMaterialCandidate,
} from '../domain/companionMaterial/reviewedCandidate.ts';

const candidates = BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES;
assert.equal(candidates.length, 21);
assert.equal(new Set(candidates.map(candidate => candidate.id)).size, candidates.length);
assert.equal(candidates.every(candidate => (
  validateReviewedCompanionMaterialCandidate(candidate).length === 0
)), true);
assert.equal(candidates.every(candidate => candidate.truthEffect === 'none'), true);
assert.equal(
  candidates.every(candidate => candidate.relationshipMemoryEffect === 'none'),
  true,
);
assert.equal(
  candidates.every(candidate => (
    candidate.runtimeDelivery === 'forbidden_until_authorized_promotion'
  )),
  true,
);
assert.equal(
  candidates.some(candidate => (
    candidate.materialLane === 'scene_affordance'
    && candidate.activationAuthority === 'director_scene_plan'
  )),
  true,
);
assert.equal(
  candidates.some(candidate => (
    candidate.materialLane === 'opening_recipe'
    && candidate.activationAuthority === 'canonical_thread_or_artifact'
  )),
  true,
);
assert.equal(
  candidates.some(candidate => (
    candidate.materialLane === 'stable_detail_claim'
    && candidate.activationAuthority === 'character_canon_review'
  )),
  true,
);
assert.equal(
  candidates.some(candidate => (
    candidate.materialLane === 'motive_candidate'
    && candidate.activationAuthority === 'director_motive'
  )),
  true,
);
assert.equal(
  candidates.some(candidate => (
    'kind' in candidate
    || 'slot' in candidate
    || 'eligibleModes' in candidate
    || 'eligiblePurposes' in candidate
  )),
  false,
  'reviewed candidates cannot masquerade as selectable CompanionMaterialRecord values',
);

const sourceFingerprints = candidates.flatMap(candidate => (
  candidate.sourceRefs.map(ref => ref.sourceFingerprint)
));
assert.equal(sourceFingerprints.every(value => value.startsWith('lysk-src-')), true);
assert.equal(new Set(sourceFingerprints).size, sourceFingerprints.length);
assert.equal(
  candidates.reduce((sum, candidate) => sum + candidate.supportingSourceCount, 0),
  66,
);

console.log(
  `built-in scoped reviewed candidates: green candidates=${candidates.length} support=66 runtime=forbidden`,
);
