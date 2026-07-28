#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateSemanticReviewBackfill } from './semantic-review-contract.mjs';

const groups = new Map([
  ['fp-a', 'group-a'],
  ['fp-b', 'group-b'],
  ['fp-c', 'group-c'],
]);
const voiceCluster = {
  id: 'asset-fixture-voice',
  leadId: 'fixture-lead',
  charId: 'fixture-char',
  family: 'stable_character_voice',
  route: 'voice_calibration',
  sourceFingerprints: ['fp-a', 'fp-b', 'fp-c'],
  safeSourceFingerprints: ['fp-a', 'fp-b', 'fp-c'],
};
const baseVoiceReview = {
  clusterId: voiceCluster.id,
  status: 'active',
  leadId: voiceCluster.leadId,
  charId: voiceCluster.charId,
  family: voiceCluster.family,
  route: voiceCluster.route,
  method: {
    name: 'driftstone_derived_semantic_review',
    version: 'v1',
    reviewerKind: 'human_semantic_review',
  },
  evidenceSourceFingerprints: ['fp-a', 'fp-b', 'fp-c'],
  guidance: '可从经复核的注意力落点进入，并按不同场景调整回应节奏。',
  reviewReason: 'two independent records support the same response tendency',
  uncertaintyOrConflict: 'narrow evidence; keep this as one register rather than a whole persona',
  voice: {
    sceneAnchors: ['ordinary_share', 'reentry'],
    temperatureRegisters: ['even', 'light'],
    mouthShapes: ['concrete_notice', 'short_turn_then_space'],
    attentionLanding: 'situated change before broad judgment',
    responseRhythm: 'brief notice followed by room for continuation',
    initiativeOrBoundaryShape: 'offers a thread without deciding for the other person',
    nameBlindStatus: 'passed',
    commonGoodBehaviorStatus: 'passed',
  },
};

const accepted = validateSemanticReviewBackfill({
  review: baseVoiceReview,
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
});
assert.equal(accepted.status, 'active');
assert.equal(accepted.sourceGroupCount, 3);

assert.throws(() => validateSemanticReviewBackfill({
  review: { ...baseVoiceReview, method: { name: 'static_intake_only', version: 'v1', reviewerKind: 'human_semantic_review' } },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /structured approved review method/);
assert.throws(() => validateSemanticReviewBackfill({
  review: {
    ...baseVoiceReview,
    method: {
      name: 'driftstone_derived_semantic_draft',
      version: 'qwen2.5-3b-v1',
      reviewerKind: 'model_semantic_draft',
    },
  },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /cannot activate a cluster without independent adjudication/);
assert.throws(() => validateSemanticReviewBackfill({
  review: { ...baseVoiceReview, evidenceSourceFingerprints: ['fp-outside'] },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /outside its cluster/);
assert.throws(() => validateSemanticReviewBackfill({
  review: { ...baseVoiceReview, route: 'scene_texture' },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /scope mismatch for route/);
assert.throws(() => validateSemanticReviewBackfill({
  review: { ...baseVoiceReview, evidenceSourceFingerprints: ['fp-a'] },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /needs 3 actual reviewed evidence sources/);
assert.throws(() => validateSemanticReviewBackfill({
  review: { ...baseVoiceReview, voice: { ...baseVoiceReview.voice, mouthShapes: [], nameBlindStatus: 'pending' } },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /mouthShapes/);
assert.throws(() => validateSemanticReviewBackfill({
  review: { ...baseVoiceReview, voice: { ...baseVoiceReview.voice, nameBlindStatus: 'weak' } },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /name-blind status passes/);
assert.throws(() => validateSemanticReviewBackfill({
  review: {
    ...baseVoiceReview,
    voice: { ...baseVoiceReview.voice, commonGoodBehaviorStatus: 'pending' },
  },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /common-good-behavior check/);
assert.throws(() => validateSemanticReviewBackfill({
  review: {
    ...baseVoiceReview,
    voice: { ...baseVoiceReview.voice, sceneAnchors: ['mild_discomfort'] },
  },
  cluster: voiceCluster,
  sourceGroupsByFingerprint: groups,
}), /care\/discomfort voice review/);

console.log(JSON.stringify({ status: 'green', fixtures: ['positive_backfill', 'static_rejected', 'model_draft_cannot_activate', 'foreign_evidence_rejected', 'scope_mismatch_rejected', 'single_evidence_rejected', 'incomplete_voice_rejected', 'weak_name_blind_rejected', 'common_good_behavior_rejected', 'shared_care_skeleton_rejected'] }));
