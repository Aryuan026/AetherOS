#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseDir = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const [workbench, drafts] = await Promise.all([
  readFile(path.join(baseDir, 'asset-workbench.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'semantic-review-drafts-qwen2.5-3b-v1.json'), 'utf8').then(JSON.parse),
]);

const sum = values => values.reduce((total, value) => total + value, 0);
const countBy = (items, getKey) => items.reduce((counts, item) => {
  const key = getKey(item);
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
const clusterDrafts = new Map();
for (const draft of drafts.drafts) {
  const list = clusterDrafts.get(draft.clusterId) || [];
  list.push(draft);
  clusterDrafts.set(draft.clusterId, list);
}

const clusters = (workbench.clusters || []).map(cluster => {
  const related = clusterDrafts.get(cluster.id) || [];
  const disposition = countBy(related, draft => draft.draftDisposition);
  const echoRisk = countBy(related, draft => draft.modelResponseShape?.candidateGuidanceEchoRisk || 'not_scored');
  const binding = countBy(related, draft => draft.modelResponseShape?.selectedEvidenceBinding || 'unknown');
  return {
    clusterId: cluster.id,
    leadId: cluster.leadId,
    charId: cluster.charId,
    family: cluster.family,
    route: cluster.route,
    surface: cluster.eligibleSurfaces,
    batchCount: related.length,
    boundedEvidenceSourceCount: new Set(related.flatMap(draft => draft.evidenceSourceFingerprints || [])).size,
    dispositions: disposition,
    candidateForIndependentAdjudication: disposition.candidate_for_independent_adjudication || 0,
    withheld: disposition.withheld || 0,
    modelRequestFailed: binding.model_request_failed || 0,
    candidateGuidanceEchoRisk: echoRisk,
    evidenceBinding: binding,
    status: 'unresolved_pending_independent_adjudication',
  };
});

const byLead = Object.fromEntries([...new Set(clusters.map(cluster => cluster.leadId))].map(leadId => {
  const related = clusters.filter(cluster => cluster.leadId === leadId);
  return [leadId, {
    clusterCount: related.length,
    batchCount: sum(related.map(cluster => cluster.batchCount)),
    candidateForIndependentAdjudication: sum(related.map(cluster => cluster.candidateForIndependentAdjudication)),
    withheld: sum(related.map(cluster => cluster.withheld)),
    modelRequestFailed: sum(related.map(cluster => cluster.modelRequestFailed)),
  }];
}));

const output = {
  schemaVersion: 1,
  purpose: 'private cluster aggregation for independent adjudication; not runtime material',
  sourceDraftContract: 'model_semantic_draft + unresolved',
  totals: {
    clusterCount: clusters.length,
    batchCount: drafts.drafts.length,
    active: 0,
    candidateForIndependentAdjudication: sum(clusters.map(cluster => cluster.candidateForIndependentAdjudication)),
    withheld: sum(clusters.map(cluster => cluster.withheld)),
    modelRequestFailed: sum(clusters.map(cluster => cluster.modelRequestFailed)),
  },
  byLead,
  clusters,
};

await mkdir(baseDir, { recursive: true });
await writeFile(path.join(baseDir, 'semantic-review-draft-cluster-summary.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'green', ...output.totals }));
