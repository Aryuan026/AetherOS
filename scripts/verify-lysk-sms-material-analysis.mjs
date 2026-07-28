#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPublicVoicePacket } from './historical-record-analyzer-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const args = process.argv.slice(2);
const directoryArg = args.indexOf('--dir');
const outDir = path.resolve(ROOT, directoryArg >= 0 ? args[directoryArg + 1] : DEFAULT_DIR);

const readJson = async name => JSON.parse(await readFile(path.join(outDir, name), 'utf8'));
const [ledger, workbench, summary, voicePackets, privateReviewBatches] = await Promise.all([
  readJson('coverage-ledger.json'),
  readJson('asset-workbench.json'),
  readJson('numeric-summary.json'),
  readJson('voice-review-packets.json'),
  readJson('private-semantic-review-batches.json'),
]);

const privateFieldPattern = /"(?:sourceTitle|sourceUrl|localPath|privateText|characterLines|userLines|optionTexts|privateExcerpt|verbatim|rawText)"/;
const forbiddenGuidancePattern = /currentMotives|allowlist|denylist|工具策略|关系事实|共同经历/;
const routes = new Set(['voice_calibration', 'role_detail_claim', 'proactive_opening', 'scene_texture']);
const runtimeFamilies = new Set([
  'stable_character_voice',
  'stable_base',
  'relevant_stable_detail',
  'opening_recipe',
  'proactive_seed',
  'motive_candidate',
  'scene_affordance',
]);
const leadIds = ['qiyu', 'lishen', 'shenxinghui', 'qinche', 'xiayizhou'];

for (const artifact of [ledger, workbench, summary, voicePackets]) {
  assert.equal(privateFieldPattern.test(JSON.stringify(artifact)), false, 'analysis artifact leaked private source content');
}

assert.equal(ledger.schemaVersion, 2);
assert.equal(workbench.schemaVersion, 2);
assert.equal(summary.schemaVersion, 2);
assert.equal(ledger.sourceManifest.sourceCount, ledger.entries.length, 'ledger needs one entry per source unit');
assert.equal(workbench.sourceCount, ledger.entries.length, 'workbench and ledger source totals must agree');
assert.equal(summary.sourceCount, ledger.entries.length, 'summary and ledger source totals must agree');
assert.equal(new Set(ledger.entries.map(entry => entry.sourceFingerprint)).size, ledger.entries.length, 'source fingerprint must be unique');
assert.ok(privateReviewBatches.length > 0, 'private semantic review batches are required before semantic approval');
assert.equal(summary.privateSemanticReviewBatchCount, privateReviewBatches.length, 'summary needs the real private review batch count');

const clusterIds = new Set(workbench.clusters.map(cluster => cluster.id));
let accounted = 0;
let quarantined = 0;
for (const entry of ledger.entries) {
  assert.ok(entry.sourceGroupFingerprint, 'every source must retain an opaque source-group key for holdout');
  assert.ok(['candidate_pool', 'holdout'].includes(entry.voicePartition), 'source needs an explicit voice partition');
  assert.ok(['accounted', 'quarantined'].includes(entry.disposition), 'source needs one conservation disposition');
  if (entry.disposition === 'accounted') {
    accounted += 1;
    assert.ok(entry.primaryDisposition, 'accounted source needs a primary disposition');
    assert.ok(entry.supportedClusterIds.length > 0, 'accounted source must support at least one asset cluster');
    entry.supportedClusterIds.forEach(id => assert.ok(clusterIds.has(id), `ledger references missing cluster ${id}`));
    entry.contributedRoutes.forEach(route => assert.ok(routes.has(route), `unknown route ${route}`));
  } else {
    quarantined += 1;
    assert.ok(entry.quarantineReason, 'quarantined source needs a concrete reason');
  }
}
assert.equal(accounted, ledger.sourceConservation.accountedSourceCount);
assert.equal(quarantined, ledger.sourceConservation.quarantinedSourceCount);
assert.equal(accounted + quarantined, ledger.entries.length, 'source conservation formula must close');
const batchEvidence = new Set(privateReviewBatches.flatMap(batch => (
  batch.privateEvidence.map(evidence => evidence.sourceFingerprint)
)));
ledger.entries.forEach(entry => {
  assert.ok(batchEvidence.has(entry.sourceFingerprint), `source ${entry.sourceFingerprint} was not placed in a semantic review batch`);
});
privateReviewBatches.forEach(batch => {
  assert.ok(batch.clusterId && batch.reviewPromptContract, 'semantic review batch needs a cluster and prompt contract');
  assert.ok(batch.privateEvidence.length > 0 && batch.privateEvidence.length <= 12, 'semantic review batch must be bounded');
});

for (const cluster of workbench.clusters) {
  assert.ok(runtimeFamilies.has(cluster.family), `unknown family ${cluster.family}`);
  assert.ok(routes.has(cluster.route), `unknown route ${cluster.route}`);
  assert.equal(forbiddenGuidancePattern.test(cluster.guidance), false, `forbidden guidance in ${cluster.id}`);
  assert.ok(['active', 'disabled', 'unresolved'].includes(cluster.status), `invalid status for ${cluster.id}`);
  assert.ok(cluster.semanticReview, `cluster ${cluster.id} must state whether semantic review happened`);
  if (cluster.status === 'active') {
    const stable = ['stable_character_voice', 'stable_base', 'relevant_stable_detail'].includes(cluster.family);
    assert.ok(cluster.safeSourceCount >= (stable ? 3 : 2), `active ${cluster.id} lacks safe evidence`);
    assert.equal(cluster.semanticReview.status, 'active', `active ${cluster.id} requires an active private semantic review`);
    assert.ok(typeof cluster.semanticReview.method === 'object', `active ${cluster.id} needs structured review method metadata`);
    assert.notEqual(cluster.semanticReview.method.name, 'static_intake_only', `active ${cluster.id} cannot come from static intake only`);
  }
  if (cluster.family === 'stable_character_voice') {
    assert.ok(cluster.voiceReview, `voice cluster ${cluster.id} needs a DriftStone-derived review record`);
    assert.ok(cluster.voiceReview.candidateEvidenceCount >= 0, 'voice review must state candidate evidence count');
    assert.ok(cluster.voiceReview.holdoutEvidenceCount >= 0, 'voice review must state holdout evidence count');
    if (cluster.status === 'active') {
      assert.ok(cluster.voiceReview.candidateEvidenceCount >= 3, `active voice cluster ${cluster.id} used too little candidate evidence`);
    }
  }
}

for (const route of routes) {
  assert.ok(summary.routeSummary[route], `missing route summary ${route}`);
  assert.ok(summary.routeSummary[route].sourceContributions > 0, `route ${route} has no source contributions`);
}

for (const leadId of leadIds) {
  const lead = summary.byLead[leadId];
  assert.ok(lead && lead.sources > 0, `missing accounted lead ${leadId}`);
  const packet = voicePackets[leadId];
  assert.ok(packet, `missing voice candidate packet for ${leadId}`);
  assertPublicVoicePacket(packet);
  assert.ok(packet.selectedCandidateIds.length >= 1, `${leadId} needs a legal low-signal voice path`);
  const holdout = summary.voiceHoldout[leadId];
  assert.ok(holdout.voiceHoldoutGroups > 0, `${leadId} needs a source-group voice holdout`);
  assert.ok(holdout.voiceCandidateEvidenceSources > 0, `${leadId} needs candidate-pool voice evidence`);
  if (['qiyu', 'lishen'].includes(leadId)) {
    assert.equal(packet.reviewChecks.hasPositiveLowSignalPath, true, `${leadId} low-signal path cannot be empty`);
    assert.equal(holdout.status, 'ready_for_blind_render', `${leadId} holdout needs a renderable positive path`);
  } else {
    assert.equal(holdout.status, 'requires_name_blind_calibration', `${leadId} generic candidate must remain a calibration hold`);
    assert.equal(
      packet.candidates.some(candidate => candidate.reviewFlags.includes('name_swap_risk')),
      true,
      `${leadId} weak voice candidate must disclose its name-swap risk`,
    );
  }
}

console.log(JSON.stringify({
  status: 'green',
  sources: ledger.entries.length,
  assets: summary.assetCount,
  active: summary.activeAssetCount,
  holdoutLeads: Object.keys(summary.voiceHoldout).length,
}));
