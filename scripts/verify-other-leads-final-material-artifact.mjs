#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const [artifact, ledger] = await Promise.all([
  readFile(path.join(BASE_DIR, 'other-leads-final-material-artifact-v1.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BASE_DIR, 'coverage-ledger.json'), 'utf8').then(JSON.parse),
]);

const leads = { shenxinghui: 221, qinche: 166, xiayizhou: 136 };
const allowedStatuses = new Set(['active', 'disabled', 'withheld']);
const allowedDispositions = new Set([
  'published_style_candidate', 'duplicate_reinforcement', 'holdout_evaluation_only',
  'candidate_or_scope_gated', 'withheld_pending_new_evidence_or_differentiation',
]);
const knownSources = new Map(ledger.entries.filter(entry => entry.leadId in leads).map(entry => [entry.sourceFingerprint, entry]));
const clusters = new Map(artifact.finalClusters.map(cluster => [cluster.id, cluster]));

assert.equal(artifact.schemaVersion, 2);
assert.equal(artifact.privacy.privateSourceTextIncluded, false);
assert.equal(artifact.privacy.sourceTitlesIncluded, false);
assert.equal(artifact.privacy.urlsIncluded, false);
assert.equal(artifact.privacy.localPathsIncluded, false);
assert.equal(artifact.privacy.relationshipFactsIncluded, false);
assert.equal(artifact.privacy.currentLifeFactsIncluded, false);
assert.equal(artifact.authority.method.reviewerKind, 'independent_model_adjudication');
assert.equal(artifact.authority.modelDraftBoundary.includes('cannot activate'), true);
assert.equal(artifact.authority.runtimeBoundary.includes('delivery remains false'), true);
assert.equal(artifact.authority.runtimeBoundary.includes('character-owned reviewed baseline candidate'), true);
assert.equal(artifact.sourceDispositions.length, 523);
assert.equal(new Set(artifact.sourceDispositions.map(source => source.sourceFingerprint)).size, 523);

for (const [leadId, count] of Object.entries(leads)) {
  const sources = artifact.sourceDispositions.filter(source => source.leadId === leadId);
  assert.equal(sources.length, count, `${leadId} conservation mismatch`);
  assert.equal(artifact.sourceConservation[leadId].total, count);
  assert.equal(artifact.sourceConservation[leadId].formula, `${count} conserved sources = ${count} explicitly disposed sources`);
}

for (const source of artifact.sourceDispositions) {
  const known = knownSources.get(source.sourceFingerprint);
  assert.ok(known, `unknown source ${source.sourceFingerprint}`);
  assert.equal(source.leadId, known.leadId, `wrong scope for ${source.sourceFingerprint}`);
  assert.equal(source.sourceGroupFingerprint, known.sourceGroupFingerprint, `wrong group for ${source.sourceFingerprint}`);
  assert.ok(allowedDispositions.has(source.finalDisposition));
  assert.ok(clusters.has(source.primaryFinalClusterId), `unknown primary ${source.primaryFinalClusterId}`);
  assert.ok(source.supportedFinalClusterIds.length > 0, `no final destination ${source.sourceFingerprint}`);
  for (const id of source.supportedFinalClusterIds) assert.ok(clusters.has(id), `unknown final support ${id}`);
  if (source.voicePartition === 'holdout') {
    assert.equal(source.candidateSupportFinalClusterIds.length, 0, `holdout leaked into candidate support ${source.sourceFingerprint}`);
    assert.ok(source.holdoutEvaluationFinalClusterIds.length > 0, `holdout lost evaluation binding ${source.sourceFingerprint}`);
  }
}

for (const cluster of artifact.finalClusters) {
  assert.ok(allowedStatuses.has(cluster.status), `invalid status ${cluster.id}`);
  assert.ok(cluster.materialLane && cluster.route);
  assert.ok(cluster.supportedSourceCount > 0, `${cluster.id} has no support`);
  assert.equal(cluster.method.reviewerKind, 'independent_model_adjudication');
  assert.ok(Array.isArray(cluster.audit.allowWhen));
  assert.ok(Array.isArray(cluster.audit.suppressWhen));
  assert.ok(cluster.audit.positivePath);
  assert.ok(cluster.reviewConclusion);
  assert.equal(cluster.runtimeCompilation.delivered, false, `${cluster.id} is not runtime delivered`);
  const supported = artifact.sourceDispositions.filter(source => source.supportedFinalClusterIds.includes(cluster.id));
  assert.equal(cluster.supportedSourceCount, supported.length, `${cluster.id} support count drift`);
  for (const evidence of cluster.selectedEvidenceFingerprints) {
    const source = artifact.sourceDispositions.find(item => item.sourceFingerprint === evidence);
    assert.ok(source, `missing selected evidence ${evidence}`);
    assert.equal(source.leadId, cluster.leadId, `cross-lead selected evidence ${evidence}`);
    assert.equal(source.voicePartition, 'candidate_pool', `holdout selected as evidence ${evidence}`);
    assert.ok(source.supportedFinalClusterIds.includes(cluster.id), `evidence outside final cluster ${evidence}`);
  }
  if (cluster.status === 'active') {
    assert.equal(cluster.materialLane, 'language_fingerprint');
    assert.ok(cluster.selectedEvidenceFingerprints.length >= 3, `${cluster.id} lacks exact evidence`);
    assert.equal(cluster.runtimeCompilation.kind, 'character_owned_reviewed_baseline_candidate');
    assert.equal(cluster.runtimeCompilation.activationPolicy, 'relevance_required');
    assert.ok(cluster.runtimeCompilation.candidateRecordId?.startsWith(`builtin-${cluster.leadId}-voice-`));
    assert.equal(cluster.runtimeCompilation.createsRecord, true);
    assert.equal(cluster.runtimeCompilation.mutatesExistingRecord, false);
    assert.equal(cluster.revision, 2, `${cluster.id} should carry the evidence-return revision`);
    assert.ok(cluster.revisionReason, `${cluster.id} needs a non-template revision reason`);
    assert.equal(cluster.voice.nameBlindStatus, 'passed_artifact_semantic_contrast');
    assert.equal(cluster.voice.commonGoodBehaviorStatus, 'passed');
    assert.equal(cluster.evaluation.sourceHoldoutStatus, 'passed_semantic_holdout_without_guidance_use');
    assert.ok(cluster.audit.suppressWhen.includes('mild_discomfort'));
    assert.ok(cluster.audit.suppressWhen.includes('refusal'));
    assert.ok(cluster.audit.suppressWhen.includes('reentry'));
    assert.ok(cluster.audit.suppressWhen.includes('current_life_claim'));
  }
  if (cluster.materialLane === 'opening_proactive_motive_candidate') {
    assert.ok(cluster.audit.suppressWhen.includes('ordinary_chat'));
    assert.ok(cluster.audit.suppressWhen.includes('generic_heartbeat'));
    assert.ok(cluster.audit.suppressWhen.includes('reentry_without_concrete_semantics'));
  }
  if (cluster.materialLane === 'scene_affordance') {
    assert.ok(cluster.audit.suppressWhen.includes('played_truth_claim'));
    assert.ok(cluster.audit.suppressWhen.includes('embodied_scene_without_plan'));
  }
}

const active = artifact.finalClusters.filter(cluster => cluster.status === 'active');
assert.deepEqual(active.map(cluster => cluster.leadId).sort(), ['qinche', 'shenxinghui', 'xiayizhou']);
assert.equal(new Set(active.map(cluster => cluster.guidance)).size, 3, 'active guidance became interchangeable');
assert.equal(new Set(active.map(cluster => cluster.voice.attentionLanding)).size, 3, 'active attention landing became interchangeable');
assert.equal(new Set(active.map(cluster => cluster.voice.responseRhythm)).size, 3, 'active response rhythm became interchangeable');
assert.equal(artifact.coverageAssessment.state, 'narrow_baseline_candidates_only_not_voice_complete');
for (const [leadId, review] of Object.entries(artifact.coverageAssessment.perLead)) {
  assert.ok(leads[leadId], `unknown coverage lead ${leadId}`);
  assert.equal(review.additionalActivation, 'none');
  assert.ok(review.revisedActiveCandidate);
  assert.ok(review.unresolvedCoverage.includes('reentry_expression'));
  assert.ok(review.unresolvedCoverage.includes('self_life_expression'));
}

assert.equal(artifact.holdoutMatrix.length, 6);
for (const row of artifact.holdoutMatrix) {
  assert.ok(['ordinary_share', 'mild_discomfort', 'refusal', 'reentry', 'self_life', 'embodied_scene'].includes(row.id));
  assert.deepEqual(Object.keys(row.expected).sort(), Object.keys(leads).sort());
}
for (const rowId of ['mild_discomfort', 'refusal', 'reentry', 'self_life', 'embodied_scene']) {
  const row = artifact.holdoutMatrix.find(item => item.id === rowId);
  for (const leadId of Object.keys(leads)) assert.deepEqual(row.expected[leadId], [], `${rowId} must not auto-select ${leadId}`);
}
for (const leadId of Object.keys(leads)) {
  const probe = artifact.selectorProbeRecommendations[leadId];
  assert.ok(probe.positive && probe.suppress.length >= 5);
  assert.ok(probe.suppress.includes('mild_discomfort'));
  assert.ok(probe.suppress.includes('refusal'));
}

const serialized = JSON.stringify(artifact).toLowerCase();
for (const forbidden of ['characterlines', 'userlines', '"sourcetitle"', '"localpath"', 'http://', 'https://', '/users/', '"currentmotives"', 'allowlist', 'denylist', '工具策略']) {
  assert.equal(serialized.includes(forbidden), false, `artifact leaks forbidden field ${forbidden}`);
}

console.log(JSON.stringify({
  status: 'green',
  sources: artifact.sourceDispositions.length,
  clusters: artifact.finalClusters.length,
  active: active.length,
  disabled: artifact.finalClusters.filter(cluster => cluster.status === 'disabled').length,
  withheld: artifact.finalClusters.filter(cluster => cluster.status === 'withheld').length,
  runtimeDelivery: false,
}));
