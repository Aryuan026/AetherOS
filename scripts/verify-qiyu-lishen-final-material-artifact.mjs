#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const [artifact, ledger] = await Promise.all([
  readFile(path.join(BASE_DIR, 'qiyu-lishen-final-material-artifact-v1.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BASE_DIR, 'coverage-ledger.json'), 'utf8').then(JSON.parse),
]);

const allowedStatuses = new Set(['active', 'disabled', 'withheld']);
const expectedLeadCounts = { qiyu: 187, lishen: 199 };
const sourceLeads = new Set(Object.keys(expectedLeadCounts));
const knownSources = new Map(ledger.entries
  .filter(entry => sourceLeads.has(entry.leadId))
  .map(entry => [entry.sourceFingerprint, entry]));
const clusters = new Map(artifact.finalClusters.map(cluster => [cluster.id, cluster]));

assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.privacy.privateSourceTextIncluded, false);
assert.equal(artifact.authority.method.reviewerKind, 'independent_model_adjudication');
assert.equal(artifact.authority.method.name, 'driftstone_derived_semantic_adjudication');
assert.equal(artifact.authority.modelDraftBoundary.includes('cannot activate'), true);
assert.equal(artifact.sourceDispositions.length, 386);
assert.equal(new Set(artifact.sourceDispositions.map(source => source.sourceFingerprint)).size, 386);
assert.deepEqual(artifact.privateBatchTriage, {
  lishen: {
    batches: 41,
    candidateForIndependentAdjudication: 26,
    withheldAtDraft: 15,
    finalAuthority: 'independent_adjudication_not_draft_status',
  },
  qiyu: {
    batches: 43,
    candidateForIndependentAdjudication: 33,
    withheldAtDraft: 10,
    finalAuthority: 'independent_adjudication_not_draft_status',
  },
});

for (const [leadId, expected] of Object.entries(expectedLeadCounts)) {
  const sources = artifact.sourceDispositions.filter(source => source.leadId === leadId);
  assert.equal(sources.length, expected, `${leadId} source conservation mismatch`);
}

for (const source of artifact.sourceDispositions) {
  const known = knownSources.get(source.sourceFingerprint);
  assert.ok(known, `unknown source ${source.sourceFingerprint}`);
  assert.equal(source.leadId, known.leadId, `wrong source scope ${source.sourceFingerprint}`);
  assert.ok(source.primaryFinalClusterId);
  assert.ok(clusters.has(source.primaryFinalClusterId), `unknown primary cluster ${source.primaryFinalClusterId}`);
  assert.ok(source.supportedFinalClusterIds.length > 0, `source ${source.sourceFingerprint} has no final support`);
  for (const clusterId of source.supportedFinalClusterIds) {
    assert.ok(clusters.has(clusterId), `unknown final support ${clusterId}`);
  }
  assert.ok(['published_reinforcement_only', 'candidate_or_scope_gated', 'withheld_pending_new_evidence_or_differentiation'].includes(source.finalDisposition));
}

for (const cluster of artifact.finalClusters) {
  assert.ok(allowedStatuses.has(cluster.status), `invalid final status ${cluster.id}`);
  assert.ok(cluster.materialLane);
  assert.ok(cluster.route);
  assert.ok(Array.isArray(cluster.eligibleSurfaces));
  assert.ok(Array.isArray(cluster.audit.allowWhen));
  assert.ok(Array.isArray(cluster.audit.suppressWhen));
  assert.ok(cluster.audit.positivePath);
  assert.ok(cluster.reviewConclusion);
  assert.ok(cluster.supportedSourceCount > 0, `${cluster.id} lost all source support`);
  assert.equal(cluster.method.reviewerKind, 'independent_model_adjudication');
  for (const evidence of cluster.selectedEvidenceFingerprints) {
    const source = artifact.sourceDispositions.find(item => item.sourceFingerprint === evidence);
    assert.ok(source, `selected evidence ${evidence} is not conserved`);
    assert.equal(source.leadId, cluster.leadId, `selected evidence ${evidence} crosses character scope`);
    assert.ok(source.supportedFinalClusterIds.includes(cluster.id), `selected evidence ${evidence} does not support ${cluster.id}`);
  }
  if (cluster.status === 'active') {
    assert.ok(cluster.selectedEvidenceFingerprints.length >= 3, `${cluster.id} lacks selected independent evidence`);
    assert.equal(cluster.runtimeCompilation.kind, 'existing_record_reinforcement');
    assert.equal(cluster.runtimeCompilation.createsRecord, false);
    assert.equal(cluster.runtimeCompilation.mutatesExistingRecord, false);
    assert.equal(cluster.runtimeCompilation.delivered, false);
  }
  if (cluster.materialLane.includes('motive') || cluster.route === 'proactive_opening') {
    assert.equal(cluster.audit.suppressWhen.includes('ordinary_chat'), true, `${cluster.id} must not enter ordinary chat`);
  }
  if (cluster.materialLane === 'scene_affordance') {
    assert.equal(cluster.audit.suppressWhen.includes('played_truth_claim'), true, `${cluster.id} could claim a played scene`);
  }
}

const lishenRevision = clusters.get('final-lishen-concrete-entry-calm-confirmation-revision-v1');
assert.equal(lishenRevision.status, 'disabled');
assert.equal(lishenRevision.runtimeCompilation.kind, 'disabled_revision_candidate');
assert.deepEqual(lishenRevision.runtimeCompilation.targetRecordIds, [
  'builtin-lishen-voice-concrete-entry-v1',
  'builtin-lishen-voice-calm-confirmation-v1',
]);
assert.equal(lishenRevision.runtimeCompilation.createsRecord, false);
assert.equal(lishenRevision.runtimeCompilation.mutatesExistingRecord, false);

const qiyuReinforcement = clusters.get('final-qiyu-existing-playful-reframe-reinforcement-v1');
assert.equal(qiyuReinforcement.status, 'active');
assert.equal(qiyuReinforcement.runtimeCompilation.createsRecord, false);
assert.equal(qiyuReinforcement.evaluation.nameBlindStatus, 'reinforcement_only');
assert.equal(qiyuReinforcement.evaluation.hardFailureOutcome, 'cleared');

assert.equal(lishenRevision.evaluation.nameBlindStatus, 'passed_narrow_gate');
assert.deepEqual(lishenRevision.evaluation.passedOperators, ['minimal_ping', 'sensory_share', 'refusal_clarity']);
assert.equal(lishenRevision.evaluation.rejectedOperators.includes('embodied_scene'), true);

for (const cluster of artifact.finalClusters.filter(cluster => cluster.id.includes('care'))) {
  assert.equal(cluster.status, 'withheld', `${cluster.id} must remain withheld until care differentiation passes`);
  assert.equal(cluster.audit.suppressWhen.includes('mild_discomfort'), true, `${cluster.id} lacks care suppression`);
  assert.equal(cluster.evaluation.careDiscomfortStatus, 'shared_solution_not_cleared');
}

const serialized = JSON.stringify(artifact).toLowerCase();
for (const forbidden of ['characterlines', 'userlines', 'sourcetitle', 'localpath', 'http://', 'https://', '/users/']) {
  assert.equal(serialized.includes(forbidden), false, `artifact leaks forbidden field ${forbidden}`);
}

console.log(JSON.stringify({
  status: 'green',
  sources: artifact.sourceDispositions.length,
  clusters: artifact.finalClusters.length,
  active: artifact.finalClusters.filter(cluster => cluster.status === 'active').length,
  disabled: artifact.finalClusters.filter(cluster => cluster.status === 'disabled').length,
  withheld: artifact.finalClusters.filter(cluster => cluster.status === 'withheld').length,
  runtimeNewRecords: 0,
}));
