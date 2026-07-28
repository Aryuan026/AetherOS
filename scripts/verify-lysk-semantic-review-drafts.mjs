#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseDir = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const [batches, workbench, draftFile] = await Promise.all([
  readFile(path.join(baseDir, 'private-semantic-review-batches.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'asset-workbench.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'semantic-review-drafts-qwen2.5-3b-v1.json'), 'utf8').then(JSON.parse),
]);

const clusters = new Map((workbench.clusters || []).map(cluster => [cluster.id, cluster]));
const batchesById = new Map(batches.map(batch => [batch.batchId, batch]));
assert.equal(draftFile.purpose, 'private model semantic drafts only; never runtime approval');
assert.equal(draftFile.drafts.length, batches.length, 'every private semantic-review batch needs a model draft');

for (const draft of draftFile.drafts) {
  const batch = batchesById.get(draft.batchId);
  assert.ok(batch, `unknown draft batch ${draft.batchId}`);
  const cluster = clusters.get(draft.clusterId);
  assert.ok(cluster, `unknown draft cluster ${draft.clusterId}`);
  for (const field of ['leadId', 'charId', 'family', 'route']) {
    assert.equal(draft[field], cluster[field], `draft ${draft.batchId} mismatched ${field}`);
  }
  assert.equal(draft.status, 'unresolved', `model draft ${draft.batchId} must never be active`);
  assert.equal(draft.method?.reviewerKind, 'model_semantic_draft');
  assert.equal(draft.method?.name, 'driftstone_derived_semantic_draft');
  const batchSources = new Set(batch.privateEvidence.map(evidence => evidence.sourceFingerprint));
  for (const evidence of draft.evidenceSourceFingerprints || []) {
    assert.ok(batchSources.has(evidence), `draft ${draft.batchId} cites out-of-batch evidence`);
  }
  const echoRisk = draft.modelResponseShape?.candidateGuidanceEchoRisk;
  if (echoRisk) {
    assert.ok(['low', 'medium', 'high'].includes(echoRisk), `draft ${draft.batchId} has an invalid echo risk`);
    assert.ok(draft.modelResponseShape?.candidateGuidanceEchoMetrics, `draft ${draft.batchId} needs echo metrics`);
    if (echoRisk === 'high') {
      assert.equal(draft.draftDisposition, 'withheld', `high candidate-guidance echo ${draft.batchId} must be withheld`);
      assert.equal(draft.guidance, '', `high candidate-guidance echo ${draft.batchId} cannot retain guidance`);
    }
  }
  if (draft.modelResponseShape?.selectedEvidenceBinding === 'model_request_failed') {
    assert.equal(draft.draftDisposition, 'withheld', `failed model draft ${draft.batchId} must be withheld`);
  }
}

console.log(JSON.stringify({
  status: 'green',
  batchDrafts: draftFile.drafts.length,
  activeDrafts: 0,
  contract: 'model_semantic_draft_cannot_activate',
}));
