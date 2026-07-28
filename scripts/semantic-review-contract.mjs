const forbiddenGuidancePattern = /currentMotives|allowlist|denylist|工具策略|关系事实|共同经历/;
const text = value => String(value || '').trim();
const uniq = values => [...new Set(values.filter(Boolean))];
const reviewerKinds = new Set([
  'human_semantic_review',
  'model_semantic_draft',
  'independent_model_adjudication',
  'human_model_adjudication',
]);
const methodNames = new Set([
  'driftstone_derived_semantic_draft',
  'driftstone_derived_semantic_review',
  'driftstone_derived_semantic_adjudication',
]);
const careDiscomfortAnchors = new Set(['mild_discomfort', 'care_needed', 'care_discomfort']);

const requireField = (value, label) => {
  if (!value) throw new Error(`semantic review requires ${label}`);
  return value;
};

/**
 * Validates a real private semantic-review backfill before the builder can
 * upgrade a candidate.  This does not assess whether prose is beautiful; it
 * makes the reviewer expose the evidence, method, uncertainty, and voice
 * diagnostics that a static bucket cannot honestly supply.
 */
export const validateSemanticReviewBackfill = ({ review, cluster, sourceGroupsByFingerprint }) => {
  for (const field of ['leadId', 'charId', 'family', 'route']) {
    if (review?.[field] !== cluster[field]) {
      throw new Error(`semantic review ${cluster.id} has a scope mismatch for ${field}`);
    }
  }
  if (!['active', 'unresolved', 'disabled'].includes(review?.status)) {
    throw new Error(`semantic review ${cluster.id} has an invalid status`);
  }
  const method = review.method;
  if (!method || !methodNames.has(method.name) || !text(method.version) || !reviewerKinds.has(method.reviewerKind)) {
    throw new Error(`semantic review ${cluster.id} needs a structured approved review method`);
  }
  const evidenceSourceFingerprints = uniq(review.evidenceSourceFingerprints || []);
  if (!evidenceSourceFingerprints.length) {
    throw new Error(`semantic review ${cluster.id} has no evidence source fingerprints`);
  }
  const clusterSources = new Set((cluster.safeSourceFingerprints || []).length
    ? cluster.safeSourceFingerprints
    : (cluster.sourceFingerprints || []));
  evidenceSourceFingerprints.forEach(sourceFingerprint => {
    if (!clusterSources.has(sourceFingerprint)) {
      throw new Error(`semantic review ${cluster.id} cites evidence outside its cluster: ${sourceFingerprint}`);
    }
  });
  const guidance = text(review.guidance);
  const active = review.status === 'active';
  if (active && method.reviewerKind === 'model_semantic_draft') {
    throw new Error(`model semantic draft ${cluster.id} cannot activate a cluster without independent adjudication`);
  }
  if (active && !guidance) throw new Error(`active semantic review ${cluster.id} needs non-verbatim guidance`);
  if (guidance && forbiddenGuidancePattern.test(guidance)) {
    throw new Error(`semantic review ${cluster.id} guidance crosses a forbidden boundary`);
  }
  requireField(text(review.reviewReason), `reviewReason for ${cluster.id}`);
  requireField(text(review.uncertaintyOrConflict), `uncertaintyOrConflict for ${cluster.id}`);

  const sourceGroups = uniq(evidenceSourceFingerprints.map(sourceFingerprint => sourceGroupsByFingerprint.get(sourceFingerprint)));
  const requiredEvidenceCount = ['stable_character_voice', 'stable_base', 'relevant_stable_detail'].includes(cluster.family)
    ? 3
    : 2;
  if (active && evidenceSourceFingerprints.length < requiredEvidenceCount) {
    throw new Error(`active semantic review ${cluster.id} needs ${requiredEvidenceCount} actual reviewed evidence sources`);
  }
  if (active && cluster.family === 'stable_character_voice') {
    const voice = review.voice;
    if (!voice || !Array.isArray(voice.sceneAnchors) || !voice.sceneAnchors.length) {
      throw new Error(`active voice review ${cluster.id} needs sceneAnchors`);
    }
    if (!Array.isArray(voice.temperatureRegisters) || !voice.temperatureRegisters.length) {
      throw new Error(`active voice review ${cluster.id} needs temperatureRegisters`);
    }
    if (!Array.isArray(voice.mouthShapes) || !voice.mouthShapes.length) {
      throw new Error(`active voice review ${cluster.id} needs mouthShapes`);
    }
    requireField(text(voice.attentionLanding), `voice.attentionLanding for ${cluster.id}`);
    requireField(text(voice.responseRhythm), `voice.responseRhythm for ${cluster.id}`);
    requireField(text(voice.initiativeOrBoundaryShape), `voice.initiativeOrBoundaryShape for ${cluster.id}`);
    if (!['passed', 'weak', 'pending'].includes(voice.nameBlindStatus)) {
      throw new Error(`active voice review ${cluster.id} needs nameBlindStatus`);
    }
    if (voice.nameBlindStatus !== 'passed') {
      throw new Error(`voice review ${cluster.id} cannot be active before name-blind status passes`);
    }
    if (voice.commonGoodBehaviorStatus !== 'passed') {
      throw new Error(`active voice review ${cluster.id} needs a passed common-good-behavior check`);
    }
    const touchesCareDiscomfort = voice.sceneAnchors.some(anchor => careDiscomfortAnchors.has(anchor));
    if (touchesCareDiscomfort) {
      const care = voice.careDiscomfortDifferentiation;
      if (!care || care.status !== 'passed') {
        throw new Error(`active care/discomfort voice review ${cluster.id} needs a passed differentiation check`);
      }
      for (const field of ['attentionLanding', 'responseRhythm', 'independentLifePosture', 'nonSharedSolutionShape']) {
        requireField(text(care[field]), `careDiscomfortDifferentiation.${field} for ${cluster.id}`);
      }
      if (care.sharedSolutionRisk !== 'cleared') {
        throw new Error(`active care/discomfort voice review ${cluster.id} still has a shared-solution risk`);
      }
    }
    if (sourceGroups.length < 2) {
      throw new Error(`active voice review ${cluster.id} needs multiple source groups`);
    }
  }

  return {
    status: review.status,
    method,
    guidance,
    evidenceSourceFingerprints,
    sourceGroupCount: sourceGroups.length,
    reviewReason: text(review.reviewReason),
    uncertaintyOrConflict: text(review.uncertaintyOrConflict),
    ...(review.voice ? { voice: review.voice } : {}),
  };
};
