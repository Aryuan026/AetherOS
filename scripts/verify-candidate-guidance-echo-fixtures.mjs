#!/usr/bin/env node

import assert from 'node:assert/strict';
import { measureCandidateGuidanceEchoRisk } from './semantic-review-draft-safety.mjs';

const echoed = measureCandidateGuidanceEchoRisk(
  '可先从可观察的细节、手边事务或已经完成的一步起念，再决定回应的分量。',
  '可先从可观察的细节、手边事务或已完成的一步起念，再决定回应的分量。',
);
assert.equal(echoed.risk, 'high');

const distinct = measureCandidateGuidanceEchoRisk(
  '先停一停信息的空白处，确认对方愿意继续后再给出自己的方向。',
  '可先从可观察的细节、手边事务或已完成的一步起念，再决定回应的分量。',
);
assert.equal(distinct.risk, 'low');

console.log(JSON.stringify({ status: 'green', fixtures: ['candidate_guidance_echo_withheld', 'distinct_evidence_first_draft_allowed'] }));
