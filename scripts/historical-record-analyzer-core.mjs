/**
 * Source-agnostic, DriftStone-derived analysis helpers.
 *
 * These functions intentionally operate on annotations, not on a particular
 * game's wording.  An upstream private review pass may see source text; this
 * module only carries opaque evidence ids and semantic shape so its output is
 * safe to use in a reviewed workbench or fixture.
 */

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const uniq = values => [...new Set(values.filter(Boolean))];

const text = value => String(value || '').trim();

export const PUBLIC_VOICE_FIELDS = new Set([
  'candidateId',
  'evidenceIds',
  'supportCount',
  'sceneAnchors',
  'temperatures',
  'mouthShapes',
  'distinctiveness',
  'singleEventRisk',
  'genericSwapRisk',
  'guidance',
  'score',
  'reviewFlags',
]);

/**
 * A transparent counterpart to DriftStone's evidence scoring.  It retains the
 * useful idea that an expressive, scene-grounded, cross-supported fragment is
 * better calibration evidence than a broad statement.  It deliberately does
 * not infer personality from text here: scene, temperature, mouth-shape, and
 * risk annotations must come from the source-specific private analysis pass.
 */
export const scoreVoiceEvidence = candidate => {
  const support = clamp((Number(candidate.supportCount) || 0) / 4);
  const sceneBreadth = clamp(uniq(candidate.sceneAnchors || []).length / 3);
  const temperatureBreadth = clamp(uniq(candidate.temperatures || []).length / 3);
  const mouthShapeClarity = clamp(uniq(candidate.mouthShapes || []).length / 2);
  const distinctiveness = clamp(Number(candidate.distinctiveness) || 0);
  const genericPenalty = clamp(Number(candidate.genericSwapRisk) || 0);
  const eventPenalty = clamp(Number(candidate.singleEventRisk) || 0);

  return Number(clamp(
    support * 0.28
      + sceneBreadth * 0.16
      + temperatureBreadth * 0.12
      + mouthShapeClarity * 0.18
      + distinctiveness * 0.26
      - genericPenalty * 0.34
      - eventPenalty * 0.24,
  ).toFixed(4));
};

const reviewFlagsFor = candidate => {
  const flags = [];
  if ((candidate.supportCount || 0) < 3) flags.push('needs_cross_source_support');
  if ((candidate.genericSwapRisk || 0) >= 0.55) flags.push('name_swap_risk');
  if ((candidate.singleEventRisk || 0) >= 0.45) flags.push('single_event_risk');
  if (!uniq(candidate.mouthShapes || []).length) flags.push('mouth_shape_missing');
  if (!uniq(candidate.sceneAnchors || []).length) flags.push('scene_missing');
  if (!text(candidate.guidance)) flags.push('guidance_missing');
  return flags;
};

const publicCandidate = candidate => {
  const result = {
    candidateId: text(candidate.candidateId),
    evidenceIds: uniq(candidate.evidenceIds || []).sort(),
    supportCount: Number(candidate.supportCount) || 0,
    sceneAnchors: uniq(candidate.sceneAnchors || []).sort(),
    temperatures: uniq(candidate.temperatures || []).sort(),
    mouthShapes: uniq(candidate.mouthShapes || []).sort(),
    distinctiveness: clamp(Number(candidate.distinctiveness) || 0),
    singleEventRisk: clamp(Number(candidate.singleEventRisk) || 0),
    genericSwapRisk: clamp(Number(candidate.genericSwapRisk) || 0),
    guidance: text(candidate.guidance),
  };
  result.score = scoreVoiceEvidence(result);
  result.reviewFlags = reviewFlagsFor(result);
  return result;
};

const noveltyFor = (candidate, selected) => {
  if (!selected.length) return 1;
  const seenScenes = new Set(selected.flatMap(item => item.sceneAnchors));
  const seenTemperatures = new Set(selected.flatMap(item => item.temperatures));
  const seenMouthShapes = new Set(selected.flatMap(item => item.mouthShapes));
  const sceneNovelty = candidate.sceneAnchors.some(value => !seenScenes.has(value)) ? 0.45 : 0;
  const temperatureNovelty = candidate.temperatures.some(value => !seenTemperatures.has(value)) ? 0.25 : 0;
  const mouthNovelty = candidate.mouthShapes.some(value => !seenMouthShapes.has(value)) ? 0.3 : 0;
  return sceneNovelty + temperatureNovelty + mouthNovelty;
};

/**
 * Builds a small, varied review pool.  It is not a runtime selector: selected
 * here means "show this evidence family to the fingerprint reviewer".  The
 * baseline requires a legal low-signal path, so a healthy pool retains one
 * strong candidate even when there is no scene-specific query.
 */
export const buildVoiceCandidatePool = ({ scopeId, candidates, maxCandidates = 8 }) => {
  const normalized = (candidates || []).map(publicCandidate)
    .filter(candidate => candidate.candidateId && candidate.evidenceIds.length);
  const viable = normalized.filter(candidate => !candidate.reviewFlags.includes('guidance_missing'));
  const remaining = viable.slice();
  const selected = [];

  while (remaining.length && selected.length < maxCandidates) {
    remaining.sort((left, right) => {
      const leftScore = left.score + noveltyFor(left, selected) * 0.22;
      const rightScore = right.score + noveltyFor(right, selected) * 0.22;
      return rightScore - leftScore || left.candidateId.localeCompare(right.candidateId);
    });
    const next = remaining.shift();
    // A candidate that is both interchangeable and event-bound is useful as
    // evidence of a gap, but must not displace a genuine voice route.
    if (next.reviewFlags.includes('name_swap_risk') && next.reviewFlags.includes('single_event_risk')) continue;
    selected.push(next);
  }

  const selectedIds = new Set(selected.map(candidate => candidate.candidateId));
  return {
    schemaVersion: 1,
    method: 'driftstone-derived-scene-temperature-mouth-shape',
    scopeId: text(scopeId),
    candidateCount: normalized.length,
    selectedCandidateIds: selected.map(candidate => candidate.candidateId),
    candidates: normalized,
    omittedCandidateIds: normalized
      .filter(candidate => !selectedIds.has(candidate.candidateId))
      .map(candidate => candidate.candidateId)
      .sort(),
    reviewChecks: {
      hasPositiveLowSignalPath: selected.some(candidate => (
        !candidate.reviewFlags.includes('name_swap_risk')
        && !candidate.reviewFlags.includes('single_event_risk')
      )),
      sceneCount: uniq(selected.flatMap(candidate => candidate.sceneAnchors)).length,
      temperatureCount: uniq(selected.flatMap(candidate => candidate.temperatures)).length,
      mouthShapeCount: uniq(selected.flatMap(candidate => candidate.mouthShapes)).length,
    },
  };
};

/**
 * Prevents a source adapter from accidentally serializing analyst-only raw
 * excerpts.  Public material must carry guidance and opaque provenance only.
 */
export const assertPublicVoicePacket = packet => {
  const serialized = JSON.stringify(packet);
  for (const forbidden of [
    'privateExcerpt', 'verbatim', 'sourceTitle', 'sourceUrl', 'localPath',
    'characterLines', 'userLines', 'privateText', 'rawText',
  ]) {
    if (serialized.includes(`\"${forbidden}\"`)) {
      throw new Error(`public voice packet leaked private field: ${forbidden}`);
    }
  }
  for (const candidate of packet.candidates || []) {
    for (const field of Object.keys(candidate)) {
      if (!PUBLIC_VOICE_FIELDS.has(field)) {
        throw new Error(`public voice packet contains unexpected field: ${field}`);
      }
    }
  }
};
