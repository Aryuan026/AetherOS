import {
  COMPANION_MATERIAL_SLOT_POLICY,
} from '../../companionMaterial/contract.ts';
import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../contract.ts';
import type { HistorySourceSpan } from '../analysis/types.ts';
import {
  HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
  type HistoryCompanionMaterialCandidate,
  type HistoryCompanionMaterialPass,
  type HistoryCompanionMaterialTag,
} from './types.ts';

export const HISTORY_COMPANION_MATERIAL_HOLD = {
  currentStateWrite: 'forbidden',
  currentMotiveWrite: 'forbidden',
  memoryPromotion: 'separate_gate',
  characterLifeWrite: 'forbidden',
  toolPolicyWrite: 'forbidden',
  rawTranscriptPromptRead: 'forbidden',
} as const;

const PASS_STATUSES = new Set(['active', 'superseded', 'archived']);
const CANDIDATE_STATUSES = new Set(['active', 'disabled', 'stale', 'discarded']);
const AUTHORITIES = new Set(['source_explicit', 'source_inferred', 'model_reconstructed', 'user_confirmed']);
const TAGS = new Set<HistoryCompanionMaterialTag>([
  'speech_rhythm',
  'care_style',
  'humor_style',
  'conflict_style',
  'repair_style',
  'initiative_style',
  'boundary_style',
  'affection_style',
  'stable_habit',
  'world_detail',
  'relationship_detail',
  'opening_shape',
  'scene_permission',
  'proactive_intent',
]);

const FORBIDDEN_FIELDS = new Set([
  'activeBuffs',
  'activeThreads',
  'allowedTools',
  'currentCondition',
  'currentLocation',
  'currentMood',
  'currentMotives',
  'currentWhereabouts',
  'disabledTools',
  'experienceReceipt',
  'lifeState',
  'rawText',
  'sourceText',
  'systemPrompt',
  'toolAllowlist',
  'toolDenylist',
  'transcript',
]);

const isNonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const sameScope = (
  left: HistoryCompanionMaterialCandidate['scope'],
  right: HistoryCompanionMaterialPass['scope'],
): boolean => createHistoryScopeKey(left) === createHistoryScopeKey(right);

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const findForbiddenFields = (value: unknown, path = 'pass'): string[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenFields(item, `${path}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(FORBIDDEN_FIELDS.has(key) ? [`${path}.${key} is forbidden in historical companion material`] : []),
    ...findForbiddenFields(child, `${path}.${key}`),
  ]);
};

const validateSourceRef = (sourceRef: HistorySourceSpan, label: string): string[] => {
  const errors: string[] = [];
  if (!isNonEmpty(sourceRef.documentId)) errors.push(`${label}.documentId is required`);
  if (!Number.isInteger(sourceRef.documentRevision) || sourceRef.documentRevision < 1) {
    errors.push(`${label}.documentRevision must be a positive integer`);
  }
  if (!Number.isInteger(sourceRef.startMessageOffset) || sourceRef.startMessageOffset < 0) {
    errors.push(`${label}.startMessageOffset must be a non-negative integer`);
  }
  if (!Number.isInteger(sourceRef.endMessageOffset) || sourceRef.endMessageOffset <= sourceRef.startMessageOffset) {
    errors.push(`${label}.endMessageOffset must be greater than startMessageOffset`);
  }
  if (sourceRef.messageIds && !unique(sourceRef.messageIds)) {
    errors.push(`${label}.messageIds must be unique`);
  }
  return errors;
};

const validateCandidate = (
  candidate: HistoryCompanionMaterialCandidate,
  pass: HistoryCompanionMaterialPass,
  index: number,
): string[] => {
  const label = `candidates[${index}]`;
  const errors = validateHistoryScope(candidate.scope).map(error => `${label}: ${error}`);
  if (candidate.schemaVersion !== HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION) {
    errors.push(`${label}.schemaVersion is unsupported`);
  }
  if (!isNonEmpty(candidate.id)) errors.push(`${label}.id is required`);
  if (!sameScope(candidate.scope, pass.scope)) errors.push(`${label} crosses pass scope`);
  if (candidate.temporalClass !== 'historical') errors.push(`${label} must remain historical`);
  if (candidate.analysisRunId !== pass.analysisRunId) errors.push(`${label} crosses analysisRunId`);
  if (candidate.extractorVersion !== pass.extractorVersion) errors.push(`${label} crosses extractorVersion`);
  if (!AUTHORITIES.has(candidate.authority)) errors.push(`${label}.authority is invalid`);
  if (!CANDIDATE_STATUSES.has(candidate.status)) errors.push(`${label}.status is invalid`);
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
    errors.push(`${label}.confidence must be between 0 and 1`);
  }
  if (!isNonEmpty(candidate.guidance)) errors.push(`${label}.guidance is required`);
  if (candidate.guidance.length > 360) errors.push(`${label}.guidance exceeds 360 characters`);
  if (!candidate.sourceRefs.length) errors.push(`${label} requires source evidence`);
  candidate.sourceRefs.forEach((sourceRef, sourceIndex) => {
    errors.push(...validateSourceRef(sourceRef, `${label}.sourceRefs[${sourceIndex}]`));
  });
  if (!candidate.eligibleModes.length || !unique(candidate.eligibleModes)) {
    errors.push(`${label}.eligibleModes must be a non-empty unique list`);
  }
  if (!candidate.eligiblePurposes.length || !unique(candidate.eligiblePurposes)) {
    errors.push(`${label}.eligiblePurposes must be a non-empty unique list`);
  }
  if (candidate.tags.length > 6 || !unique(candidate.tags) || candidate.tags.some(tag => !TAGS.has(tag))) {
    errors.push(`${label}.tags must use at most six controlled unique values`);
  }
  if (!Number.isInteger(candidate.revision) || candidate.revision < 1) {
    errors.push(`${label}.revision must be a positive integer`);
  }
  if (
    !Number.isFinite(candidate.createdAt)
    || !Number.isFinite(candidate.updatedAt)
    || candidate.updatedAt < candidate.createdAt
  ) {
    errors.push(`${label}.timestamps are invalid`);
  }

  const permitted = COMPANION_MATERIAL_SLOT_POLICY[candidate.kind] || [];
  if (!permitted.some(item => item.slot === candidate.slot && item.renderPolicy === candidate.renderPolicy)) {
    errors.push(`${label} kind, slot, and renderPolicy are incompatible`);
  }

  const strongAuthority = candidate.authority === 'source_explicit' || candidate.authority === 'user_confirmed';
  if (candidate.slot === 'stable_base' && !strongAuthority) {
    errors.push(`${label} inferred or reconstructed material cannot become stable_base`);
  }
  if (candidate.kind === 'initiative_motive' && candidate.slot === 'stable_base' && candidate.confidence < 0.8) {
    errors.push(`${label} stable agency drive requires confidence >= 0.8`);
  }
  if (
    candidate.kind === 'language_fingerprint'
    && candidate.authority !== 'user_confirmed'
    && candidate.sourceRefs.length < 2
  ) {
    errors.push(`${label} language fingerprint needs at least two evidence spans`);
  }
  if (candidate.continuity === 'canon' && !strongAuthority) {
    errors.push(`${label} inferred or reconstructed history cannot declare canon`);
  }
  if (candidate.continuity === 'branch' && !isNonEmpty(candidate.branchId)) {
    errors.push(`${label} branch material requires branchId`);
  }
  if (
    candidate.continuity === 'scene_only'
    && (!isNonEmpty(candidate.branchId) || !isNonEmpty(candidate.sceneId))
  ) {
    errors.push(`${label} scene-only material requires branchId and sceneId`);
  }
  if (candidate.cooldownMs !== undefined && (!Number.isFinite(candidate.cooldownMs) || candidate.cooldownMs < 0)) {
    errors.push(`${label}.cooldownMs must be non-negative and finite`);
  }
  if (
    candidate.maxDeliveries !== undefined
    && (!Number.isInteger(candidate.maxDeliveries) || candidate.maxDeliveries < 1)
  ) {
    errors.push(`${label}.maxDeliveries must be a positive integer`);
  }
  return errors;
};

export const validateHistoryCompanionMaterialPass = (
  pass: HistoryCompanionMaterialPass,
): string[] => {
  const errors = validateHistoryScope(pass.scope);
  if (pass.schemaVersion !== HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION) {
    errors.push('unsupported history companion material schemaVersion');
  }
  if (!isNonEmpty(pass.id)) errors.push('history companion material pass id is required');
  if (!isNonEmpty(pass.sourceRevisionFingerprint)) errors.push('sourceRevisionFingerprint is required');
  if (!isNonEmpty(pass.analysisRunId)) errors.push('analysisRunId is required');
  if (!isNonEmpty(pass.extractorVersion)) errors.push('extractorVersion is required');
  if (!PASS_STATUSES.has(pass.status)) errors.push('history companion material pass status is invalid');
  if (!Number.isInteger(pass.revision) || pass.revision < 1) {
    errors.push('history companion material pass revision must be a positive integer');
  }
  if (!Number.isFinite(pass.createdAt) || !Number.isFinite(pass.updatedAt) || pass.updatedAt < pass.createdAt) {
    errors.push('history companion material pass timestamps are invalid');
  }
  const ids = pass.candidates.map(candidate => candidate.id);
  if (!unique(ids)) errors.push('history companion material candidate ids must be unique inside one pass');
  pass.candidates.forEach((candidate, index) => {
    errors.push(...validateCandidate(candidate, pass, index));
  });
  errors.push(...findForbiddenFields(pass));
  return errors;
};

export const assertValidHistoryCompanionMaterialPass = (
  pass: HistoryCompanionMaterialPass,
): void => {
  const errors = validateHistoryCompanionMaterialPass(pass);
  if (errors.length) {
    throw new Error(`Invalid history companion material pass ${pass.id || '(unknown)'}: ${errors.join('; ')}`);
  }
};
