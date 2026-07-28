#!/usr/bin/env node

/**
 * Emits the first sealed Companion Material artifact for Qi Yu and Li Shen.
 *
 * It deliberately reads only the private, already-ledgered source identities.
 * The adjudication itself happened against bounded private review batches; this
 * serializer never reads or exports source wording, titles, paths, or URLs.
 * Its output is ignored because opaque source bindings remain review material.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const OUTPUT = path.join(BASE_DIR, 'qiyu-lishen-final-material-artifact-v1.json');
const sourceLeads = new Set(['qiyu', 'lishen']);

const method = {
  name: 'driftstone_derived_semantic_adjudication',
  version: 'codex-gpt5-v1',
  reviewerKind: 'independent_model_adjudication',
  draftRole: 'model_semantic_drafts_used_only_as_private_batch_triage_not_authority',
};

const finalClusters = [
  {
    id: 'final-qiyu-existing-playful-reframe-reinforcement-v1',
    leadId: 'qiyu',
    status: 'active',
    materialLane: 'language_fingerprint',
    route: 'voice_calibration',
    eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene'],
    guidance: '面对轻量日常里的可感细节，可用玩心式的侧转或轻微夸张重新看一眼，再保留可变的个人判断与回应余地。',
    audit: {
      allowWhen: ['ordinary_share', 'light_scene', 'user_provided_concrete_detail', 'playful_mismatch'],
      suppressWhen: ['tool_context', 'medical_or_safety_advice', 'current_life_claim', 'proactive_without_receipt'],
      positivePath: '只强化既有祁煜声音在轻量互动中接住现场细节、自然转弯的能力。',
    },
    evaluation: {
      nameBlindStatus: 'reinforcement_only',
      specificityOutcome: 'no_new_operator_gain',
      factCleanlinessOutcome: 'improved',
      hardFailureOutcome: 'cleared',
    },
    selectedEvidenceFingerprints: [
      'lysk-src-4e41533657c85ac6043b',
      'lysk-src-89833d8a02282accc71f',
      'lysk-src-8b22e76a16718a19474f',
    ],
    reviewConclusion: '第二轮 minimal ping 没有产生新增角色分，因此只作为既有指纹的事实清洁与硬失败归零佐证。',
    runtimeCompilation: {
      kind: 'existing_record_reinforcement',
      targetRecordIds: ['builtin-qiyu-voice-playful-turn-v1', 'builtin-qiyu-voice-observed-entry-v1'],
      createsRecord: false,
      mutatesExistingRecord: false,
      delivered: false,
    },
  },
  {
    id: 'final-qiyu-care-skeleton-withheld-v1',
    leadId: 'qiyu',
    status: 'withheld',
    materialLane: 'language_fingerprint',
    route: 'voice_calibration',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['mild_discomfort', 'care_needed', 'refusal', 'ordinary_greeting'],
      positivePath: '保留为未来差异化复核的证据，不作为照护脚本。',
    },
    evaluation: {
      careDiscomfortStatus: 'shared_solution_not_cleared',
      nameBlindStatus: 'withheld',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '关怀表达与关系/世界观情境缠绕，且容易落入可替换的可选照护步骤；shared-solution 风险未清除。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-qiyu-contextual-expression-texture-withheld-v1',
    leadId: 'qiyu',
    status: 'withheld',
    materialLane: 'stable_detail_claim',
    route: 'role_detail_claim',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['ordinary_chat_default', 'relationship_memory', 'current_life_claim'],
      positivePath: '把重复观察、感官联想与玩心纹理保留为重复增强，等待可区分的下一次拆簇。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '原静态 base/detail 桶混入大量特定关系场景；它们能增强已有声音证据，却不足以形成新的稳定细节或长期行动倾向。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-qiyu-life-thread-receipt-gated-v1',
    leadId: 'qiyu',
    status: 'disabled',
    materialLane: 'opening_proactive_motive_candidate',
    route: 'proactive_opening',
    eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
    guidance: '在已有 canonical Life receipt 的前提下，开场可以从已确认的自生活线与当下可感发现交叉进入，并给对方保留接住、改写或搁置的空间。',
    audit: {
      allowWhen: ['canonical_life_receipt', 'proactive_letter', 'call_connection', 'scene_opening'],
      suppressWhen: ['ordinary_chat', 'no_canonical_life_receipt', 'current_motive_inference', 'tool_context'],
      positivePath: '保留创作、探索和个人安排能成为未来主动入口的表达空间，而不声明任何今天的事件。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '来源支持的是主动入口候选，不足以生成当前生活或当前动机；等待合法 Life receipt 与独立入口裁决。',
    runtimeCompilation: { kind: 'receipt_gated_candidate', delivered: false },
  },
  {
    id: 'final-qiyu-sensory-play-scene-candidate-v1',
    leadId: 'qiyu',
    status: 'disabled',
    materialLane: 'scene_affordance',
    route: 'scene_texture',
    eligibleSurfaces: ['meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已有 ScenePlan 或相应场景依据时，可让感官发现、玩心式侧转和双方可改变的选择共同塑形。',
    audit: {
      allowWhen: ['scene_plan_candidate', 'meet_scene', 'date_scene', 'story_scene'],
      suppressWhen: ['ordinary_chat', 'played_truth_claim', 'relationship_fact', 'tool_context'],
      positivePath: '为未来场景提供可变节奏与观察入口，不预设见面已经发生。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '非 scoped 场景材料可以保留为未来 affordance，但当前没有 ScenePlan/played receipt，也不应成为普通聊天的具身动作。',
    runtimeCompilation: { kind: 'scene_plan_gated_candidate', delivered: false },
  },
  {
    id: 'final-qiyu-scoped-context-disabled-v1',
    leadId: 'qiyu',
    status: 'disabled',
    materialLane: 'scoped_context',
    route: 'scene_texture',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['canon_without_scope', 'relationship_private_plot', 'ordinary_chat', 'prompt_delivery'],
      positivePath: '保存为特定世界观/关系场景的可审计来源，不把其当作普遍人格。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: 'canon 与 relationship scoped 来源有保存价值，但不能跨作用域发布。',
    runtimeCompilation: { kind: 'scope_blocked', delivered: false },
  },
  {
    id: 'final-lishen-concrete-entry-calm-confirmation-revision-v1',
    leadId: 'lishen',
    status: 'disabled',
    materialLane: 'language_fingerprint_revision_candidate',
    route: 'voice_calibration',
    eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene'],
    guidance: '当用户给出明确的具体线索或边界时，可先贴合其所说的事实，以短而平静的确认、澄清或轻微反问建立共同理解；回应可以停在澄清处，也可随当轮语境继续展开。',
    audit: {
      allowWhen: ['minimal_ping', 'sensory_share', 'refusal_clarity', 'user_provided_concrete_detail'],
      suppressWhen: ['mild_discomfort_advice', 'diagnosis', 'current_life_claim', 'tool_context', 'embodied_scene'],
      positivePath: '为既有 concrete-entry 与 calm-confirmation 提供最小的、可变的升级候选。',
    },
    evaluation: {
      nameBlindStatus: 'passed_narrow_gate',
      passedOperators: ['minimal_ping', 'sensory_share', 'refusal_clarity'],
      reinforcementOnlyOperators: ['absence_stance'],
      rejectedOperators: ['embodied_scene'],
      careDiscomfortStatus: 'not_consumed_without_separate_differentiation',
    },
    selectedEvidenceFingerprints: [
      'lysk-src-6c23b1e0ee3408fa3463',
      'lysk-src-91263c4a3bd9d3fcebe8',
      'lysk-src-c3482738b6ea6186148c',
      'lysk-src-e60c6fc526ad316acbd9',
      'lysk-src-f6385c2c2b10828f5bc9',
    ],
    reviewConclusion: 'minimal ping、感官分享与拒绝澄清通过窄门；absence 只强化既有表现，具身场景回退，因此维持 disabled revision 而非新增独立 record。',
    runtimeCompilation: {
      kind: 'disabled_revision_candidate',
      targetRecordIds: ['builtin-lishen-voice-concrete-entry-v1', 'builtin-lishen-voice-calm-confirmation-v1'],
      createsRecord: false,
      mutatesExistingRecord: false,
      delivered: false,
    },
  },
  {
    id: 'final-lishen-practical-care-withheld-v1',
    leadId: 'lishen',
    status: 'withheld',
    materialLane: 'language_fingerprint',
    route: 'voice_calibration',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['mild_discomfort', 'care_needed', 'refusal', 'ordinary_greeting'],
      positivePath: '将照护证据留给未来的跨角色差异化检验，而不让它固化为建议或医疗步骤。',
    },
    evaluation: {
      careDiscomfortStatus: 'shared_solution_not_cleared',
      nameBlindStatus: 'withheld',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: 'care/discomfort 容易收敛成共享的确认—建议—照护骨架；当前 shared-solution 风险未清除。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-lishen-next-step-withheld-v1',
    leadId: 'lishen',
    status: 'withheld',
    materialLane: 'stable_base',
    route: 'role_detail_claim',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['ordinary_share', 'mild_discomfort', 'advice_default', 'relationship_memory'],
      positivePath: '保留对具体信息、条件与后续路径的证据，以便未来与角色卡的高权威校准共同复核。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '静态“下一步”桶过宽，容易把角色压成建议生成器；不能升级为 stable_base。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-lishen-routine-detail-receipt-gated-v1',
    leadId: 'lishen',
    status: 'disabled',
    materialLane: 'stable_detail_claim',
    route: 'role_detail_claim',
    eligibleSurfaces: ['call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在合法相关场景中，可让已确认的日程、手边事务或环境细节为回应提供落点；细节的出现服从当前证据与场景，不替代当下事实。',
    audit: {
      allowWhen: ['relevant_canonical_detail', 'scene_plan_candidate', 'canonical_life_receipt'],
      suppressWhen: ['ordinary_chat_default', 'no_canonical_life_receipt', 'relationship_memory', 'tool_context'],
      positivePath: '保留生活纹理作为 relevance-gated detail 的未来方向，而不凭空播报当前安排。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '来源常把稳定职业/日程与当次事件绑定；可作为受回执约束的 detail claim 候选，不能常驻普通 Chat。',
    runtimeCompilation: { kind: 'receipt_gated_candidate', delivered: false },
  },
  {
    id: 'final-lishen-life-thread-receipt-gated-v1',
    leadId: 'lishen',
    status: 'disabled',
    materialLane: 'opening_proactive_motive_candidate',
    route: 'proactive_opening',
    eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
    guidance: '在已有 canonical Life receipt 的前提下，开场可以由已确认的观察、个人事务或未尽线索进入，再让对方决定回应的分量与方向。',
    audit: {
      allowWhen: ['canonical_life_receipt', 'proactive_letter', 'call_connection', 'scene_opening'],
      suppressWhen: ['ordinary_chat', 'no_canonical_life_receipt', 'current_motive_inference', 'tool_context'],
      positivePath: '保留角色自己的生活线能成为未来主动入口的可能性，不把稳定身份写成刚发生的消息。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: 'opening/proactive/motive 全是候选路径；motive 不成为 currentMotive，生活线须由 canonical receipt 提供事实基础。',
    runtimeCompilation: { kind: 'receipt_gated_candidate', delivered: false },
  },
  {
    id: 'final-lishen-embodied-scene-withheld-v1',
    leadId: 'lishen',
    status: 'withheld',
    materialLane: 'scene_affordance',
    route: 'scene_texture',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['ordinary_chat', 'embodied_scene', 'played_truth_claim', 'relationship_fact'],
      positivePath: '把具身场景证据保留为日后重做 blind render 的材料，不让它冒充已经发生的见面。',
    },
    evaluation: {
      nameBlindStatus: 'rejected_embodied_scene',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: '第二轮 embodied scene 表现回退，不能以“克制轻松”之名压入 scene 或 Chat。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-lishen-scoped-context-disabled-v1',
    leadId: 'lishen',
    status: 'disabled',
    materialLane: 'scoped_context',
    route: 'scene_texture',
    eligibleSurfaces: [],
    guidance: '',
    audit: {
      allowWhen: [],
      suppressWhen: ['canon_without_scope', 'relationship_private_plot', 'ordinary_chat', 'prompt_delivery'],
      positivePath: '保存为特定世界观/关系场景的可审计来源，不把其当作普遍人格。',
    },
    selectedEvidenceFingerprints: [],
    reviewConclusion: 'canon 与 relationship scoped 来源有保存价值，但不能跨作用域发布。',
    runtimeCompilation: { kind: 'scope_blocked', delivered: false },
  },
];

const finalRouting = {
  qiyu: {
    'asset-qiyu-voice_observed_entry': ['final-qiyu-existing-playful-reframe-reinforcement-v1'],
    'asset-qiyu-voice_optional_care': ['final-qiyu-care-skeleton-withheld-v1'],
    'asset-qiyu-base_shared_experiment': ['final-qiyu-contextual-expression-texture-withheld-v1'],
    'asset-qiyu-detail_sensory_texture': ['final-qiyu-contextual-expression-texture-withheld-v1'],
    'asset-qiyu-motive_curiosity': ['final-qiyu-life-thread-receipt-gated-v1'],
    'asset-qiyu-opening_curiosity': ['final-qiyu-life-thread-receipt-gated-v1'],
    'asset-qiyu-opening_reentry': ['final-qiyu-life-thread-receipt-gated-v1'],
    'asset-qiyu-proactive_optional_care': ['final-qiyu-life-thread-receipt-gated-v1'],
    'asset-qiyu-proactive_own_thread': ['final-qiyu-life-thread-receipt-gated-v1'],
    'asset-qiyu-scene_sensory_play': ['final-qiyu-sensory-play-scene-candidate-v1'],
    'asset-qiyu-scene_scoped_canon_context': ['final-qiyu-scoped-context-disabled-v1'],
    'asset-qiyu-scene_scoped_relationship_context': ['final-qiyu-scoped-context-disabled-v1'],
  },
  lishen: {
    'asset-lishen-voice_ask_before_concluding': ['final-lishen-concrete-entry-calm-confirmation-revision-v1'],
    'asset-lishen-voice_calm_confirmation': ['final-lishen-concrete-entry-calm-confirmation-revision-v1'],
    'asset-lishen-voice_practical_care': ['final-lishen-practical-care-withheld-v1'],
    'asset-lishen-base_next_step': ['final-lishen-next-step-withheld-v1'],
    'asset-lishen-detail_routine_texture': ['final-lishen-routine-detail-receipt-gated-v1'],
    'asset-lishen-motive_followthrough': ['final-lishen-life-thread-receipt-gated-v1'],
    'asset-lishen-opening_observed_detail': ['final-lishen-life-thread-receipt-gated-v1'],
    'asset-lishen-proactive_calm_reentry': ['final-lishen-life-thread-receipt-gated-v1'],
    'asset-lishen-proactive_own_thread': ['final-lishen-life-thread-receipt-gated-v1'],
    'asset-lishen-scene_composed_lightness': ['final-lishen-embodied-scene-withheld-v1'],
    'asset-lishen-scene_scoped_canon_context': ['final-lishen-scoped-context-disabled-v1'],
    'asset-lishen-scene_scoped_relationship_context': ['final-lishen-scoped-context-disabled-v1'],
  },
};

const statusDisposition = {
  active: 'published_reinforcement_only',
  disabled: 'candidate_or_scope_gated',
  withheld: 'withheld_pending_new_evidence_or_differentiation',
};

const [ledger, batches, draftFile] = await Promise.all([
  readFile(path.join(BASE_DIR, 'coverage-ledger.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BASE_DIR, 'private-semantic-review-batches.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BASE_DIR, 'semantic-review-drafts-qwen2.5-3b-v1.json'), 'utf8').then(JSON.parse),
]);
const { entries } = ledger;
const draftByBatchId = new Map(draftFile.drafts.map(draft => [draft.batchId, draft]));

const privateBatchTriage = Object.fromEntries([...sourceLeads].sort().map(leadId => {
  const leadBatches = batches.filter(batch => batch.leadId === leadId);
  const leadDrafts = leadBatches.map(batch => draftByBatchId.get(batch.batchId));
  if (leadDrafts.some(draft => !draft)) throw new Error(`${leadId} is missing a private draft batch`);
  return [leadId, {
    batches: leadBatches.length,
    candidateForIndependentAdjudication: leadDrafts.filter(draft => draft.draftDisposition === 'candidate_for_independent_adjudication').length,
    withheldAtDraft: leadDrafts.filter(draft => draft.draftDisposition === 'withheld').length,
    finalAuthority: 'independent_adjudication_not_draft_status',
  }];
}));
const sourceDispositions = entries
  .filter(entry => sourceLeads.has(entry.leadId))
  .map(entry => {
    const mapping = finalRouting[entry.leadId];
    const supportedFinalClusterIds = [...new Set((entry.supportedClusterIds || [])
      .flatMap(clusterId => mapping[clusterId] || []))]
      .sort();
    const primaryStaticClusterId = entry.primaryDisposition?.clusterId;
    const primaryFinalClusterIds = mapping[primaryStaticClusterId] || [];
    if (!supportedFinalClusterIds.length || !primaryFinalClusterIds.length) {
      throw new Error(`unmapped final disposition for ${entry.sourceFingerprint}`);
    }
    const primaryFinalCluster = finalClusters.find(cluster => cluster.id === primaryFinalClusterIds[0]);
    return {
      sourceFingerprint: entry.sourceFingerprint,
      sourceGroupFingerprint: entry.sourceGroupFingerprint,
      leadId: entry.leadId,
      voicePartition: entry.voicePartition,
      finalDisposition: statusDisposition[primaryFinalCluster.status],
      primaryFinalClusterId: primaryFinalCluster.id,
      supportedFinalClusterIds,
      primaryRoute: entry.primaryDisposition.route,
      dispositionReason: primaryFinalCluster.status === 'active'
        ? 'cross_supported_existing_fingerprint_reinforcement'
        : primaryFinalCluster.status === 'disabled'
          ? 'preserved_as_scope_or_receipt_gated_candidate'
          : 'preserved_as_withheld_or_duplicate_evidence',
    };
  })
  .sort((left, right) => left.sourceFingerprint.localeCompare(right.sourceFingerprint));

const supportCount = clusterId => sourceDispositions
  .filter(source => source.supportedFinalClusterIds.includes(clusterId))
  .length;

const artifactClusters = finalClusters.map(cluster => ({
  ...cluster,
  supportedSourceCount: supportCount(cluster.id),
  evidenceSelection: cluster.selectedEvidenceFingerprints.length
    ? 'independently_selected_private_subset'
    : 'not_selected_for_runtime_or_revision',
  method,
}));

const countBy = (items, field) => Object.fromEntries([...new Set(items.map(item => item[field]))]
  .sort()
  .map(key => [key, items.filter(item => item[field] === key).length]));

const artifact = {
  schemaVersion: 1,
  purpose: 'qiyu_lishen_private_semantic_adjudication_artifact_not_runtime_export',
  generatedAt: '2026-07-28',
  privacy: {
    privateSourceTextIncluded: false,
    publicSafeFieldsOnly: true,
    sourceBinding: 'opaque_fingerprints_only',
  },
  authority: {
    method,
    activationMeaning: 'artifact publication state only; runtime delivery remains a separate consumer decision',
    modelDraftBoundary: 'qwen model_semantic_draft cannot activate or replace this adjudication',
    currentTruthBoundary: 'no current motive, Life fact, relationship memory, played truth, or tool strategy is emitted',
  },
  privateBatchTriage,
  sourceConservation: {
    expected: { qiyu: 187, lishen: 199 },
    accounted: countBy(sourceDispositions, 'leadId'),
    sourceDispositionCounts: countBy(sourceDispositions, 'finalDisposition'),
    holdoutCounts: Object.fromEntries([...sourceLeads].sort().map(leadId => [leadId, sourceDispositions
      .filter(source => source.leadId === leadId && source.voicePartition === 'holdout').length])),
  },
  finalClusters: artifactClusters,
  sourceDispositions,
};

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'green',
  output: path.relative(ROOT, OUTPUT),
  sources: artifact.sourceDispositions.length,
  clusters: artifact.finalClusters.length,
  clusterStatuses: countBy(artifact.finalClusters, 'status'),
}));
