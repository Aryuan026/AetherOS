#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  assertPublicVoicePacket,
  buildVoiceCandidatePool,
  scoreVoiceEvidence,
} from './historical-record-analyzer-core.mjs';

// The privateExcerpt fields model analyst-only source material.  The pool must
// retain only opaque evidence ids and non-verbatim guidance.
const candidates = [
  {
    candidateId: 'ordinary-notice',
    evidenceIds: ['ev-01', 'ev-02', 'ev-03', 'ev-04'],
    supportCount: 4,
    sceneAnchors: ['ordinary_share'],
    temperatures: ['quiet', 'warm'],
    mouthShapes: ['concrete_notice', 'leave_space'],
    distinctiveness: 0.86,
    genericSwapRisk: 0.08,
    singleEventRisk: 0.05,
    guidance: '可先接住眼前具体变化，再留出对方决定是否展开的空间。',
    privateExcerpt: 'do-not-export ordinary wording',
  },
  {
    candidateId: 'light-scene-turn',
    evidenceIds: ['ev-05', 'ev-06', 'ev-07'],
    supportCount: 3,
    sceneAnchors: ['light_scene'],
    temperatures: ['playful'],
    mouthShapes: ['small_side_step', 'shared_choice'],
    distinctiveness: 0.8,
    genericSwapRisk: 0.12,
    singleEventRisk: 0.12,
    guidance: '轻剧情里可用小转向或共同选择组织互动，不预设固定亲密动作。',
    privateExcerpt: 'do-not-export playful wording',
  },
  {
    candidateId: 'boundary-acknowledgement',
    evidenceIds: ['ev-08', 'ev-09', 'ev-10'],
    supportCount: 3,
    sceneAnchors: ['refusal'],
    temperatures: ['calm_firm'],
    mouthShapes: ['acknowledge_then_release'],
    distinctiveness: 0.74,
    genericSwapRisk: 0.17,
    singleEventRisk: 0.1,
    guidance: '面对拒绝时可先承认边界，再让下一步仍由双方选择。',
    privateExcerpt: 'do-not-export boundary wording',
  },
  {
    candidateId: 'generic-event-only',
    evidenceIds: ['ev-11'],
    supportCount: 1,
    sceneAnchors: ['special_event'],
    temperatures: ['intense'],
    mouthShapes: ['declarative'],
    distinctiveness: 0.1,
    genericSwapRisk: 0.9,
    singleEventRisk: 0.92,
    guidance: '只作事件核对，不将单次高强度表达外推为稳定声音。',
    privateExcerpt: 'do-not-export event wording',
  },
];

assert.ok(
  scoreVoiceEvidence(candidates[0]) > scoreVoiceEvidence(candidates[3]),
  'cross-supported, scene-grounded evidence must outrank a generic single event',
);

const pool = buildVoiceCandidatePool({
  scopeId: 'fixture-character',
  candidates,
  maxCandidates: 3,
});

assert.deepEqual(pool.selectedCandidateIds, [
  'ordinary-notice',
  'light-scene-turn',
  'boundary-acknowledgement',
], 'candidate review pool should keep distinct scene/temperature/mouth-shape paths');
assert.equal(pool.reviewChecks.hasPositiveLowSignalPath, true, 'low-signal chat needs one legal positive voice path');
assert.ok(pool.reviewChecks.temperatureCount >= 3, 'review pool must not collapse into a single register');
assert.ok(pool.reviewChecks.mouthShapeCount >= 3, 'review pool must preserve distinct response structures');
assert.equal(pool.omittedCandidateIds.includes('generic-event-only'), true, 'single-event interchangeable evidence stays visible but is not selected');
assertPublicVoicePacket(pool);
assert.equal(JSON.stringify(pool).includes('do-not-export'), false, 'private wording must never cross into the public review packet');

console.log(JSON.stringify({
  status: 'green',
  selected: pool.selectedCandidateIds,
  temperatures: pool.reviewChecks.temperatureCount,
  mouthShapes: pool.reviewChecks.mouthShapeCount,
}));
