#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const args = process.argv.slice(2);
const readArg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const outDir = path.resolve(ROOT, readArg('--dir') || DEFAULT_DIR);
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const [plan, request] = await Promise.all([
  readJson(path.join(outDir, 'voice-blind-test-plan.json')),
  readJson(path.join(outDir, 'voice-blind-render-request.json')),
]);

assert.equal(plan.status, 'ready_for_blind_render');
assert.equal(request.status, 'ready_for_blind_render');
assert.equal(plan.inputs.length, 3, 'blind test needs the same three neutral inputs for every subject');
assert.equal(plan.subjects.length, 5, 'blind test needs all five built-in characters');
assert.equal(request.subjects.length, plan.subjects.length, 'render request must cover every planned subject');
assert.equal(new Set(plan.subjects.map(subject => subject.blindSubjectId)).size, 5, 'blind identities must be unique');
assert.equal(
  request.subjects.some(subject => Object.hasOwn(subject, 'leadId')),
  false,
  'the generation/rater-facing request cannot expose a character identity',
);
for (const subject of plan.subjects) {
  assert.ok(
    ['ready_for_blind_render', 'requires_name_blind_calibration'].includes(subject.holdout.status),
    'subject has an invalid holdout status',
  );
  assert.ok(subject.holdout.voiceHoldoutGroups > 0, 'each blind subject needs a source-group voice holdout');
  const renderSubject = request.subjects.find(item => item.blindSubjectId === subject.blindSubjectId);
  assert.ok(renderSubject, 'planned blind subject is missing from render request');
  assert.ok(renderSubject.voiceGuidance.length > 0, 'blind subject needs non-verbatim voice guidance');
}

const responsesPath = readArg('--responses');
const privateInputPath = readArg('--in');
if (!responsesPath && !privateInputPath) {
  console.log(JSON.stringify({
    status: 'ready_for_blind_render',
    subjects: plan.subjects.length,
    inputs: plan.inputs.length,
    note: 'No generated blind responses were supplied, so live distinctness/variation/no-replay has not been claimed.',
  }));
  process.exit(0);
}
if (!responsesPath || !privateInputPath) {
  throw new Error('Live holdout verification requires both --responses <private JSON> and --in <private detail-signals.json>');
}

const responses = await readJson(path.resolve(ROOT, responsesPath));
const source = await readJson(path.resolve(ROOT, privateInputPath));
const expectedCount = plan.subjects.length * plan.inputs.length * plan.renderProtocol.variantsPerSubjectAndInput;
assert.equal(responses.responses?.length, expectedCount, 'live response file must contain every blind subject/input/variant combination');

const subjectById = new Map(plan.subjects.map(subject => [subject.blindSubjectId, subject]));
const inputIds = new Set(plan.inputs.map(input => input.id));
const seen = new Set();
const normalize = value => String(value || '').replace(/\s+/g, '').trim();
const bigrams = value => new Set(Array.from(value).slice(0, -1).map((char, index) => `${char}${value[index + 1]}`));
const similarity = (left, right) => {
  const a = bigrams(left);
  const b = bigrams(right);
  const shared = [...a].filter(value => b.has(value)).length;
  return shared / Math.max(1, a.size + b.size - shared);
};
const holdoutLinesByLead = new Map();
for (const signal of source.signals || []) {
  const subject = plan.subjects.find(item => item.leadId === signal.leadId);
  if (!subject) continue;
  const groupSeed = `${plan.sourcePackId}\0${signal.leadId}\0${signal.sourceTitle}`;
  // Mirrors the builder's opaque group partition without exposing a title.
  const opaqueGroup = `lysk-group-${createHash('sha256').update(groupSeed).digest('hex').slice(0, 20)}`;
  if (subject.holdoutGroupFingerprints.includes(opaqueGroup)) {
    const lines = signal.privateText?.characterLines || [];
    holdoutLinesByLead.set(signal.leadId, [...(holdoutLinesByLead.get(signal.leadId) || []), ...lines]);
  }
}

const responsesByCell = new Map();
for (const response of responses.responses) {
  assert.ok(subjectById.has(response.blindSubjectId), 'response has unknown blind subject');
  assert.ok(inputIds.has(response.inputId), 'response has unknown input id');
  assert.ok([1, 2].includes(response.variant), 'response variant must be 1 or 2');
  const key = `${response.blindSubjectId}:${response.inputId}:${response.variant}`;
  assert.equal(seen.has(key), false, 'response cell must be unique');
  seen.add(key);
  const normalized = normalize(response.text);
  assert.ok(normalized.length > 0, 'response text cannot be empty');
  const leadId = subjectById.get(response.blindSubjectId).leadId;
  const replay = (holdoutLinesByLead.get(leadId) || []).some(line => {
    const clean = normalize(line);
    return clean.length >= 12 && normalized.includes(clean.slice(0, 12));
  });
  assert.equal(replay, false, 'response appears to replay a held-out source fragment');
  responsesByCell.set(key, normalized);
}
for (const subject of plan.subjects) {
  for (const input of plan.inputs) {
    const first = responsesByCell.get(`${subject.blindSubjectId}:${input.id}:1`);
    const second = responsesByCell.get(`${subject.blindSubjectId}:${input.id}:2`);
    assert.ok(first && second, 'each subject/input needs two variants');
    assert.ok(similarity(first, second) < 0.9, 'two variants cannot be near-identical');
  }
}

console.log(JSON.stringify({
  status: 'green_live_holdout_structure',
  checkedResponses: expectedCount,
  note: 'Identity distinctness still requires an independently recorded blind-rater assignment; this script verifies coverage, variation, and no direct held-out replay.',
}));
