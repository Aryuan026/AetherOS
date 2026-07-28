#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureCandidateGuidanceEchoRisk } from './semantic-review-draft-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const args = process.argv.slice(2);

const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const uniq = values => [...new Set(values.filter(Boolean))];

const baseDir = path.resolve(ROOT, readArg('--dir', DEFAULT_DIR));
const batchesFile = path.resolve(baseDir, readArg('--batches', 'private-semantic-review-batches.json'));
const workbenchFile = path.resolve(baseDir, readArg('--workbench', 'asset-workbench.json'));
const outputFile = path.resolve(baseDir, readArg('--out', 'semantic-review-drafts-qwen2.5-3b-v1.json'));
const model = readArg('--model', 'qwen2.5:3b');
const limit = asPositiveInt(readArg('--limit'), Number.POSITIVE_INFINITY);
const resume = args.includes('--resume');
const retryFailed = args.includes('--retry-failed');

const [batches, workbench, existing] = await Promise.all([
  readFile(batchesFile, 'utf8').then(JSON.parse),
  readFile(workbenchFile, 'utf8').then(JSON.parse),
  (resume || retryFailed)
    ? readFile(outputFile, 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return { schemaVersion: 1, drafts: [] };
      throw error;
    })
    : Promise.resolve({ schemaVersion: 1, drafts: [] }),
]);

const clusters = new Map((workbench.clusters || []).map(cluster => [cluster.id, cluster]));
const completed = new Map((existing.drafts || []).map(draft => [draft.batchId, draft]));
const failedDraft = draft => draft?.modelResponseShape?.selectedEvidenceBinding === 'model_request_failed';
const pending = batches.filter(batch => !completed.has(batch.batchId) || (retryFailed && failedDraft(completed.get(batch.batchId)))).slice(0, limit);

const linesForOverlapCheck = evidence => [
  ...(evidence.characterLines || []),
  ...(evidence.userLines || []),
].map(text).filter(line => line.length >= 12);

const hasLongSourceOverlap = (candidate, batch) => {
  const normalized = text(candidate).replace(/[，。！？、；：“”‘’（）()【】\-—]/g, '');
  if (normalized.length < 12) return false;
  return batch.privateEvidence.some(evidence => linesForOverlapCheck(evidence).some(line => {
    const normalizedLine = line.replace(/[，。！？、；：“”‘’（）()【】\-—]/g, '');
    for (let index = 0; index <= normalized.length - 12; index += 1) {
      if (normalizedLine.includes(normalized.slice(index, index + 12))) return true;
    }
    return false;
  }));
};

const forbidden = /currentMotives|current_motive|allowlist|denylist|工具策略|关系事实|共同经历|固定回复|原句|逐字/;

const promptFor = (batch, cluster) => JSON.stringify({
  role: 'private_semantic_draft_reviewer',
  task: 'Read the bounded private dialogue evidence and produce a cautious, non-verbatim semantic draft for exactly this cluster. This is evidence organization only, not a runtime decision.',
  exactScope: {
    batchId: batch.batchId,
    clusterId: batch.clusterId,
    leadId: batch.leadId,
    charId: cluster.charId,
    family: cluster.family,
    route: batch.route,
  },
  constraints: [
    'Do not quote, closely paraphrase, title, URL, or identify any source text.',
    'Do not create a current motive, relationship fact, shared experience, tool policy, or reply template.',
    'Treat a single event as insufficient for a stable trait.',
    'Describe a positive and variable possibility, not an instruction for every turn.',
    'If the evidence is weak, contradictory, or name-swappable, say so instead of forcing a persona claim.',
    'This is a model draft. Never label it active or ready for runtime.',
  ],
  candidateGuidanceIsOnlyAnIntakeHypothesis: batch.candidateGuidance,
  requiredJsonOnly: {
    selectedEvidenceIndexes: ['one-based positions from the bounded privateEvidence array; choose only evidence that truly supports the draft'],
    guidance: 'one or two Chinese sentences of non-verbatim, character-owned guidance; empty if not supported',
    reviewReason: 'short evidence-based rationale without source wording',
    uncertaintyOrConflict: 'short caution, including name-swap or single-event risk where relevant',
    voice: {
      sceneAnchors: ['only when family is stable_character_voice'],
      temperatureRegisters: ['only when family is stable_character_voice'],
      mouthShapes: ['only when family is stable_character_voice; generateable rather than catchphrases'],
      attentionLanding: 'only when family is stable_character_voice',
      responseRhythm: 'only when family is stable_character_voice',
      initiativeOrBoundaryShape: 'only when family is stable_character_voice',
      nameBlindStatus: 'pending',
      genericNameSwapRisk: 'low | medium | high',
    },
  },
  privateEvidence: batch.privateEvidence,
});

const extractJson = response => {
  const body = text(response).replace(/^```(?:json)?\s*|\s*```$/g, '');
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('model did not return a JSON object');
  return JSON.parse(body.slice(first, last + 1));
};

const requestDraft = async (batch, cluster) => {
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: promptFor(batch, cluster),
      format: 'json',
      stream: false,
      options: { temperature: 0.15, num_predict: 650, num_ctx: 8192 },
    }),
  });
  if (!response.ok) throw new Error(`ollama returned ${response.status}`);
  const payload = await response.json();
  return extractJson(payload.response);
};

const normalize = (draft, batch, cluster) => {
  const outerResponseFields = Object.keys(draft || {}).sort();
  let candidate = draft;
  if (draft?.draft && typeof draft.draft === 'object' && !Array.isArray(draft.draft)) {
    candidate = { ...draft.draft, voice: draft.voice || draft.draft.voice };
  } else if (typeof draft?.draft === 'string') {
    try {
      const embedded = extractJson(draft.draft);
      candidate = { ...embedded, voice: draft.voice || embedded.voice };
    } catch {
      candidate = { ...draft, guidance: draft.draft };
    }
  }
  const allowedEvidence = new Set(batch.privateEvidence.map(evidence => evidence.sourceFingerprint));
  const selectedByIndex = uniq((candidate.selectedEvidenceIndexes || [])
    .map(Number)
    .filter(index => Number.isInteger(index) && index >= 1 && index <= batch.privateEvidence.length)
    .map(index => batch.privateEvidence[index - 1].sourceFingerprint));
  const selectedByFingerprint = uniq([
    ...(draft.selectedEvidenceIds || []),
    ...(candidate.selectedEvidenceIds || []),
    ...(candidate.evidenceIds || []),
  ].filter(id => allowedEvidence.has(id)));
  const modelSelectedEvidence = selectedByIndex.length ? selectedByIndex : selectedByFingerprint;
  // A draft is tied to the exact bounded batch it read.  If the small local
  // model omits a ranking, retain that input set honestly as *unranked*;
  // a later adjudicator must still choose a narrower actual-support subset
  // before any active record can be considered.
  const evidenceSourceFingerprints = modelSelectedEvidence.length
    ? modelSelectedEvidence
    : batch.privateEvidence.map(evidence => evidence.sourceFingerprint);
  const guidance = text(candidate.guidance);
  const serializedModelFields = JSON.stringify({
    guidance,
    reviewReason: candidate.reviewReason,
    uncertaintyOrConflict: candidate.uncertaintyOrConflict,
    voice: candidate.voice,
  });
  const quoteRisk = hasLongSourceOverlap(serializedModelFields, batch);
  const forbiddenBoundary = forbidden.test(serializedModelFields);
  const candidateGuidanceEcho = measureCandidateGuidanceEchoRisk(guidance, batch.candidateGuidance);
  const voice = cluster.family === 'stable_character_voice' && candidate.voice && typeof candidate.voice === 'object'
    ? {
      sceneAnchors: uniq(candidate.voice.sceneAnchors || []).map(text).filter(Boolean),
      temperatureRegisters: uniq(candidate.voice.temperatureRegisters || []).map(text).filter(Boolean),
      mouthShapes: uniq(candidate.voice.mouthShapes || []).map(text).filter(Boolean),
      attentionLanding: text(candidate.voice.attentionLanding),
      responseRhythm: text(candidate.voice.responseRhythm),
      initiativeOrBoundaryShape: text(candidate.voice.initiativeOrBoundaryShape),
      nameBlindStatus: 'pending',
      genericNameSwapRisk: ['low', 'medium', 'high'].includes(candidate.voice.genericNameSwapRisk)
        ? candidate.voice.genericNameSwapRisk
        : 'high',
    }
    : undefined;

  return {
    batchId: batch.batchId,
    clusterId: cluster.id,
    leadId: cluster.leadId,
    charId: cluster.charId,
    family: cluster.family,
    route: cluster.route,
    status: 'unresolved',
    method: {
      name: 'driftstone_derived_semantic_draft',
      version: 'qwen2.5-3b-v1',
      reviewerKind: 'model_semantic_draft',
      model,
    },
    evidenceSourceFingerprints,
    guidance: quoteRisk || forbiddenBoundary || candidateGuidanceEcho.risk === 'high' ? '' : guidance,
    reviewReason: quoteRisk || forbiddenBoundary || candidateGuidanceEcho.risk === 'high'
      ? 'draft withheld pending human-safe regeneration'
      : text(candidate.reviewReason),
    uncertaintyOrConflict: quoteRisk
      ? 'possible source-phrase overlap; this draft is unusable until regenerated'
      : forbiddenBoundary
        ? 'crossed a product boundary; this draft is unusable until regenerated'
        : candidateGuidanceEcho.risk === 'high'
          ? 'high candidate-guidance echo risk; this draft is unusable until evidence-first regeneration'
          : text(candidate.uncertaintyOrConflict),
    ...(voice ? { voice } : {}),
    modelResponseShape: {
      outerResponseFields,
      returnedFields: Object.keys(candidate || {}).sort(),
      selectedEvidenceBinding: modelSelectedEvidence.length
        ? 'model_selected_batch_subset'
        : 'bounded_batch_input_unranked',
      candidateGuidanceEchoRisk: candidateGuidanceEcho.risk,
      candidateGuidanceEchoMetrics: {
        longestSharedRun: candidateGuidanceEcho.longestSharedRun,
        bigramDice: candidateGuidanceEcho.bigramDice,
      },
    },
    draftDisposition: quoteRisk || forbiddenBoundary || candidateGuidanceEcho.risk === 'high' || !guidance || !evidenceSourceFingerprints.length
      ? 'withheld'
      : 'candidate_for_independent_adjudication',
  };
};

await mkdir(path.dirname(outputFile), { recursive: true });
for (const batch of pending) {
  const cluster = clusters.get(batch.clusterId);
  if (!cluster) throw new Error(`batch ${batch.batchId} references unknown cluster ${batch.clusterId}`);
  const prior = completed.get(batch.batchId);
  let normalized;
  try {
    normalized = normalize(await requestDraft(batch, cluster), batch, cluster);
  } catch (error) {
    normalized = {
      batchId: batch.batchId,
      clusterId: cluster.id,
      leadId: cluster.leadId,
      charId: cluster.charId,
      family: cluster.family,
      route: cluster.route,
      status: 'unresolved',
      method: {
        name: 'driftstone_derived_semantic_draft',
        version: 'qwen2.5-3b-v1',
        reviewerKind: 'model_semantic_draft',
        model,
      },
      evidenceSourceFingerprints: [],
      guidance: '',
      reviewReason: 'model draft unavailable for this bounded batch',
      uncertaintyOrConflict: text(error.message).slice(0, 180),
      modelResponseShape: { returnedFields: [], selectedEvidenceBinding: 'model_request_failed' },
      draftDisposition: 'withheld',
    };
  }
  if (retryFailed && prior) normalized.retryAttempt = (prior.retryAttempt || 0) + 1;
  completed.set(batch.batchId, normalized);
  await writeFile(outputFile, `${JSON.stringify({
    schemaVersion: 1,
    purpose: 'private model semantic drafts only; never runtime approval',
    model,
    drafts: [...completed.values()],
  }, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  model,
  retryFailed,
  requested: pending.length,
  completed: completed.size,
  output: path.relative(ROOT, outputFile),
  status: 'drafts_unresolved_pending_independent_adjudication',
}));
