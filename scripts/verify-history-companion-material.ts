import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
} from '../domain/companionMaterial/types.ts';
import {
  HISTORY_COMPANION_MATERIAL_HOLD,
  HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
  projectHistoryCompanionMaterialPass,
  validateHistoryCompanionMaterialPass,
  type HistoryCompanionMaterialCandidate,
  type HistoryCompanionMaterialPass,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  getHistoryCompanionMaterialPass,
  listHistoryCompanionMaterialPasses,
  saveHistoryCompanionMaterialPass,
} from '../utils/historyImport/companionMaterial/index.ts';
import {
  loadCompanionMaterialLibrary,
  loadCompanionMaterialRecords,
  saveCompanionMaterialLibrary,
} from '../utils/companionMaterial/store.ts';

const T0 = 1_768_700_000_000;
const SCOPE_A: HistoryScope = {
  progressBundleId: 'bundle-history-material',
  personaMaskId: 'mask-history-material-a',
  charId: 'char-history-material',
};
const SCOPE_B: HistoryScope = {
  ...SCOPE_A,
  personaMaskId: 'mask-history-material-b',
};

/**
 * This fixture tests pass projection/storage in isolation. Canonical
 * finalization + current-source authority is exercised separately by
 * verify-history-companion-publish-freshness.ts.
 */
const persistPassProjectionFixture = async (input: {
  pass: HistoryCompanionMaterialPass;
  expectedPassRevision?: number;
  publishedAt: number;
}) => {
  await saveHistoryCompanionMaterialPass({
    pass: input.pass,
    expectedRevision: input.expectedPassRevision,
  });
  const ownerScope = {
    kind: 'relationship' as const,
    scope: { ...input.pass.scope },
  };
  const existing = (
    await loadCompanionMaterialLibrary(ownerScope)
  )?.records || [];
  const preserved = existing.filter(record => !record.sourceRefs.some(sourceRef => (
    sourceRef.storeFamily === 'history_companion_material'
    && sourceRef.sourcePackId === input.pass.id
  )));
  const projected = projectHistoryCompanionMaterialPass(input.pass);
  await saveCompanionMaterialLibrary({
    ownerScope,
    records: [...preserved, ...projected],
    revision: 1,
    updatedAt: input.publishedAt,
  });
  return {
    materialIds: projected.map(record => record.id),
    activeCount: projected.length,
    disabledCount: input.pass.candidates.filter(candidate => candidate.status !== 'active').length,
  };
};

const sourceSpan = (
  documentId: string,
  startMessageOffset: number,
  endMessageOffset: number,
) => ({
  documentId,
  documentRevision: 3,
  dateKey: documentId.replace('daily:', ''),
  startMessageOffset,
  endMessageOffset,
  messageIds: [`${documentId}:${startMessageOffset}`, `${documentId}:${endMessageOffset - 1}`],
});

const candidate = (
  input: Partial<HistoryCompanionMaterialCandidate> & Pick<
    HistoryCompanionMaterialCandidate,
    'id' | 'kind' | 'slot' | 'guidance' | 'renderPolicy'
  >,
): HistoryCompanionMaterialCandidate => ({
  schemaVersion: HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
  scope: { ...SCOPE_A },
  temporalClass: 'historical',
  analysisRunId: 'history-material-run-a',
  extractorVersion: 'history-material-fixture-v1',
  authority: 'source_inferred',
  confidence: 0.82,
  sourceRefs: [sourceSpan('daily:2025-07-16', 10, 24)],
  knowledge: 'relationship_private',
  continuity: 'relationship',
  eligibleModes: ['remote_chat'],
  eligiblePurposes: ['stable_context'],
  tags: ['relationship_detail'],
  status: 'active',
  createdAt: T0,
  updatedAt: T0,
  revision: 1,
  ...input,
});

const passA: HistoryCompanionMaterialPass = {
  schemaVersion: HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
  id: 'history-material-pass-a',
  scope: { ...SCOPE_A },
  sourceRevisionFingerprint: 'sha256:calendar-history-material-a',
  analysisSnapshotId: 'history-analysis-snapshot-a',
  analysisRunId: 'history-material-run-a',
  extractorVersion: 'history-material-fixture-v1',
  status: 'active',
  candidates: [
    candidate({
      id: 'history-voice-care',
      kind: 'language_fingerprint',
      slot: 'stable_character_voice',
      guidance: '回应关心时先确认对方的具体处境，再用克制而有余地的方式表达自己的在意。',
      renderPolicy: 'style_only',
      sourceRefs: [
        sourceSpan('daily:2025-07-16', 10, 24),
        sourceSpan('daily:2025-07-18', 4, 16),
      ],
      tags: ['care_style', 'speech_rhythm'],
      eligibleModes: ['remote_chat', 'call', 'meet_scene'],
    }),
    candidate({
      id: 'history-stable-detail-window',
      kind: 'stable_detail',
      slot: 'relevant_stable_details',
      guidance: '旧日记录多次把安静的室内环境当作双方放松交流的背景；仅在当前话题相关时参考。',
      renderPolicy: 'fact_reference',
      tags: ['relationship_detail'],
      eligibleModes: ['remote_chat', 'meet_scene', 'date_scene'],
    }),
    candidate({
      id: 'history-motive-candidate-repair',
      kind: 'initiative_motive',
      slot: 'motive_candidates',
      guidance: '当现场出现轻微误解时，可以把主动澄清或留出重新靠近的空间作为候选反应。',
      renderPolicy: 'decision_context',
      authority: 'model_reconstructed',
      tags: ['repair_style', 'initiative_style'],
      eligibleModes: ['remote_chat', 'meet_scene', 'story_scene'],
      eligiblePurposes: ['scene_planning'],
    }),
    candidate({
      id: 'history-opening-observation',
      kind: 'opening_recipe',
      slot: 'opening_recipes',
      guidance: '开场可先落在一个当前可见的小观察，再自然问起对方此刻的状态；每次重新生成。',
      renderPolicy: 'transform_required',
      tags: ['opening_shape'],
      eligibleModes: ['proactive_letter'],
      eligiblePurposes: ['opening'],
    }),
    candidate({
      id: 'history-scene-affordance-letter',
      kind: 'scene_affordance',
      slot: 'scene_affordances',
      guidance: '旧路线留下过一封尚未确认是否拆开的信，可作为玩家主动续写时的场景可能性。',
      renderPolicy: 'decision_context',
      continuity: 'branch',
      routeId: 'route-history-main',
      branchId: 'branch-history-main',
      tags: ['scene_permission'],
      eligibleModes: ['story_planning', 'story_scene'],
      eligiblePurposes: ['scene_planning'],
    }),
    candidate({
      id: 'history-disabled-detail',
      kind: 'stable_detail',
      slot: 'relevant_stable_details',
      guidance: '这条已由纠正流程停用，不应进入素材仓。',
      renderPolicy: 'fact_reference',
      status: 'disabled',
    }),
  ],
  createdAt: T0,
  updatedAt: T0,
  revision: 1,
};

assert.deepEqual(validateHistoryCompanionMaterialPass(passA), []);
assert.deepEqual(HISTORY_COMPANION_MATERIAL_HOLD, {
  currentStateWrite: 'forbidden',
  currentMotiveWrite: 'forbidden',
  memoryPromotion: 'separate_gate',
  characterLifeWrite: 'forbidden',
  toolPolicyWrite: 'forbidden',
  privateAnalysisRawTranscriptRead: 'bounded_ephemeral_only',
  runtimePromptRawTranscriptRead: 'forbidden',
});

assert.match(
  validateHistoryCompanionMaterialPass({
    ...passA,
    currentMotives: ['现在必须去拆信'],
  } as unknown as HistoryCompanionMaterialPass).join('\n'),
  /currentMotives is forbidden/,
);
assert.match(
  validateHistoryCompanionMaterialPass({
    ...passA,
    toolAllowlist: ['send_message'],
  } as unknown as HistoryCompanionMaterialPass).join('\n'),
  /toolAllowlist is forbidden/,
);
assert.match(
  validateHistoryCompanionMaterialPass({
    ...passA,
    candidates: [{
      ...passA.candidates[1],
      slot: 'stable_base',
    }],
  }).join('\n'),
  /inferred or reconstructed material cannot become stable_base/,
);
assert.match(
  validateHistoryCompanionMaterialPass({
    ...passA,
    candidates: [{
      ...passA.candidates[2],
      id: 'history-motive-must-not-become-stable-agency',
      authority: 'source_explicit',
      confidence: 0.99,
      slot: 'stable_base',
    }],
  }).join('\n'),
  /historical initiative motive must remain a motive_candidate/,
  'even high-confidence historical motives stay situational until a separate character-authority review promotes them',
);
assert.match(
  validateHistoryCompanionMaterialPass({
    ...passA,
    candidates: [{
      ...passA.candidates[0],
      sourceRefs: [sourceSpan('daily:2025-07-16', 10, 24)],
    }],
  }).join('\n'),
  /language fingerprint needs at least two evidence spans/,
);
assert.match(
  validateHistoryCompanionMaterialPass({
    ...passA,
    candidates: [{
      ...passA.candidates[0],
      scope: SCOPE_B,
    }],
  }).join('\n'),
  /crosses pass scope/,
);

const projectedA = projectHistoryCompanionMaterialPass(passA);
assert.equal(projectedA.length, 5);
assert.equal(projectedA.every(record => record.ownerScope.kind === 'relationship'), true);
assert.equal(projectedA.every(record => (
  record.ownerScope.kind === 'relationship'
  && record.ownerScope.scope.personaMaskId === SCOPE_A.personaMaskId
)), true);
assert.equal(projectedA.some(record => record.slot === 'motive_candidates'), true);
assert.equal(projectedA.some(record => record.slot === 'opening_recipes'), true);
assert.equal(projectedA.some(record => record.slot === 'scene_affordances'), true);
assert.equal(projectedA.some(record => 'currentMotives' in record || 'rawText' in record), false);
const projectedCareVoice = projectedA.find(record => (
  record.sourceRefs.some(sourceRef => sourceRef.recordId === 'history-voice-care')
));
assert.equal(projectedCareVoice?.retrievalHints?.activationPolicy, 'relevance_required');
assert.equal(projectedCareVoice?.retrievalHints?.positiveSignals.includes('care_needed'), true);
assert.equal(projectedCareVoice?.retrievalHints?.suppressSignals?.includes('low_signal'), true);
assert.equal(projectedCareVoice?.retrievalHints?.suppressSignals?.includes('refusal'), true);
const projectedRelationshipDetail = projectedA.find(record => (
  record.sourceRefs.some(sourceRef => sourceRef.recordId === 'history-stable-detail-window')
));
assert.equal(projectedRelationshipDetail?.retrievalHints?.activationPolicy, 'relevance_required');
assert.equal(
  projectedA
    .filter(record => record.retrievalHints?.activationPolicy === 'voice_fallback')
    .length,
  0,
  'care/style-specific historical material cannot become a generic low-signal fallback',
);
const rhythmOnlyProjection = projectHistoryCompanionMaterialPass({
  ...passA,
  id: 'history-material-pass-rhythm-only',
  sourceRevisionFingerprint: 'sha256:calendar-history-material-rhythm-only',
  candidates: [candidate({
    id: 'history-voice-rhythm-only',
    kind: 'language_fingerprint',
    slot: 'stable_character_voice',
    guidance: '表达节奏通常从一处具体观察展开，再自然保留下一步转向空间。',
    renderPolicy: 'style_only',
    tags: ['speech_rhythm'],
    sourceRefs: [
      sourceSpan('daily:2025-07-16', 10, 24),
      sourceSpan('daily:2025-07-18', 4, 16),
    ],
  })],
});
assert.equal(rhythmOnlyProjection[0]?.retrievalHints?.activationPolicy, 'voice_fallback');
assert.equal(rhythmOnlyProjection[0]?.retrievalHints?.suppressSignals?.includes('low_signal'), false);
assert.equal(
  projectedA.every(record => record.sourceRefs.every(sourceRef => (
    sourceRef.storeFamily === 'history_companion_material'
    && sourceRef.sourcePackId === passA.id
    && !sourceRef.sourceLocator?.includes('回应关心')
  ))),
  true,
);

const manualRecord: CompanionMaterialRecord = {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id: 'manual-relationship-voice',
  ownerScope: { kind: 'relationship', scope: SCOPE_A },
  charId: SCOPE_A.charId,
  kind: 'language_fingerprint',
  slot: 'stable_character_voice',
  guidance: '这是玩家自己维护的素材，历史分析发布时必须保留。',
  renderPolicy: 'style_only',
  knowledge: 'relationship_private',
  continuity: 'relationship',
  eligibleModes: ['remote_chat'],
  eligiblePurposes: ['stable_context'],
  tags: ['manual'],
  sourceRefs: [{
    storeFamily: 'manual_material',
    recordId: 'manual-record-a',
    revision: 1,
    sourceFingerprint: 'manual-source-a',
  }],
  status: 'active',
  createdAt: T0,
  updatedAt: T0,
  revision: 1,
};
await saveCompanionMaterialLibrary({
  ownerScope: manualRecord.ownerScope,
  records: [manualRecord],
  revision: 1,
  updatedAt: T0,
});

const publicationA1 = await persistPassProjectionFixture({
  pass: passA,
  publishedAt: T0 + 10,
});
const publicationA2 = await persistPassProjectionFixture({
  pass: passA,
  expectedPassRevision: 1,
  publishedAt: T0 + 11,
});
assert.deepEqual(publicationA1.materialIds, publicationA2.materialIds);
assert.equal(publicationA1.activeCount, 5);
assert.equal(publicationA1.disabledCount, 1);
const loadedA = (
  await loadCompanionMaterialLibrary({ kind: 'relationship', scope: SCOPE_A })
)?.records || [];
assert.equal(loadedA.length, 6, 'repeat publication replaces one pass without deleting manual material');
assert.equal(loadedA.some(record => record.id === manualRecord.id), true);
assert.equal(loadedA.filter(record => (
  record.sourceRefs.some(sourceRef => sourceRef.sourcePackId === passA.id)
)).length, 5);
assert.deepEqual(await getHistoryCompanionMaterialPass({ passId: passA.id }), passA);
assert.deepEqual(
  (await listHistoryCompanionMaterialPasses({ scope: SCOPE_A })).map(item => item.id),
  [passA.id],
);
assert.deepEqual(
  (await loadCompanionMaterialRecords(SCOPE_A)).map(record => record.id),
  [manualRecord.id],
  'projection-only fixtures stay stored for inspection but cannot enter runtime without canonical activation',
);

const passAlternate: HistoryCompanionMaterialPass = {
  ...passA,
  id: 'history-material-pass-alternate',
  analysisRunId: 'history-material-run-alternate',
  candidates: passA.candidates.map(item => ({
    ...item,
    analysisRunId: 'history-material-run-alternate',
  })),
  createdAt: T0 + 1,
  updatedAt: T0 + 1,
};
const alternateProjected = projectHistoryCompanionMaterialPass(passAlternate);
assert.equal(
  alternateProjected.some(record => projectedA.some(first => first.id === record.id)),
  false,
  'the same candidate id from another analysis pass must coexist',
);
await persistPassProjectionFixture({
  pass: passAlternate,
  publishedAt: T0 + 22,
});
assert.equal(
  ((
    await loadCompanionMaterialLibrary({ kind: 'relationship', scope: SCOPE_A })
  )?.records || []).length,
  11,
  'manual material plus two independent five-record history passes coexist',
);
assert.deepEqual(
  new Set((await listHistoryCompanionMaterialPasses({ scope: SCOPE_A })).map(item => item.id)),
  new Set([passA.id, passAlternate.id]),
);

const correctedPassA: HistoryCompanionMaterialPass = {
  ...passA,
  candidates: passA.candidates.map((item, index) => (
    index === 0
      ? {
          ...item,
          status: 'disabled',
          updatedAt: T0 + 23,
          revision: item.revision + 1,
        }
      : item
  )),
  updatedAt: T0 + 23,
  revision: 2,
};
await persistPassProjectionFixture({
  pass: correctedPassA,
  expectedPassRevision: 1,
  publishedAt: T0 + 23,
});
assert.equal(
  ((
    await loadCompanionMaterialLibrary({ kind: 'relationship', scope: SCOPE_A })
  )?.records || []).length,
  10,
  'correcting one pass replaces only that pass and preserves the alternate interpretation',
);
assert.equal((await getHistoryCompanionMaterialPass({ passId: passA.id }))?.revision, 2);
await assert.rejects(
  () => persistPassProjectionFixture({
    pass: {
      ...correctedPassA,
      revision: 3,
      updatedAt: T0 + 24,
    },
    expectedPassRevision: 1,
    publishedAt: T0 + 24,
  }),
  /changed before save/,
);

const passB: HistoryCompanionMaterialPass = {
  ...passA,
  id: 'history-material-pass-b',
  scope: { ...SCOPE_B },
  sourceRevisionFingerprint: 'sha256:calendar-history-material-b',
  analysisRunId: 'history-material-run-b',
  candidates: passA.candidates.map(item => ({
    ...item,
    id: `${item.id}-b`,
    scope: { ...SCOPE_B },
    analysisRunId: 'history-material-run-b',
  })),
};
await persistPassProjectionFixture({
  pass: passB,
  publishedAt: T0 + 12,
});
const loadedB = (
  await loadCompanionMaterialLibrary({ kind: 'relationship', scope: SCOPE_B })
)?.records || [];
assert.equal(loadedB.length, 5);
assert.equal(loadedB.every(record => (
  record.ownerScope.kind === 'relationship'
  && record.ownerScope.scope.personaMaskId === SCOPE_B.personaMaskId
)), true);
assert.equal(
  ((
    await loadCompanionMaterialLibrary({ kind: 'relationship', scope: SCOPE_A })
  )?.records || []).length,
  10,
);

assert.deepEqual(
  projectHistoryCompanionMaterialPass({
    ...passA,
    id: 'history-material-pass-archived',
    status: 'archived',
  }),
  [],
);

console.log('history companion material bridge: green');
