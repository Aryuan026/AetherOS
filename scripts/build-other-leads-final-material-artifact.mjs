#!/usr/bin/env node

/**
 * Serialize the independently adjudicated, non-verbatim closure for
 * Shen Xinghui, Qin Che, and Xia Yizhou.
 *
 * It intentionally reads only the opaque ledger/workbench.  The independent
 * reading of bounded private batches is represented below as safe guidance and
 * exact opaque evidence selections; source wording never crosses this file's
 * output boundary.  The artifact is ignored private review material, not a
 * runtime export.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const OUTPUT = path.join(BASE_DIR, 'other-leads-final-material-artifact-v1.json');
const leads = ['shenxinghui', 'qinche', 'xiayizhou'];

const method = {
  name: 'driftstone_derived_semantic_adjudication',
  version: 'codex-gpt5-v1',
  reviewerKind: 'independent_model_adjudication',
  draftRole: 'model_semantic_drafts_used_only_as_private_batch_triage_not_authority',
};

const clusters = [
  {
    id: 'final-shenxinghui-even-playful-premise-v1', leadId: 'shenxinghui', status: 'active',
    materialLane: 'language_fingerprint', route: 'voice_calibration',
    eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene'],
    revision: 2,
    revisionReason: '移除“接住后必须续一笔”的隐含步骤；加入由具体错位触发的短暂停留出口。',
    guidance: '在轻量、略带荒诞的互动里，可低幅度、近乎认真地接住对方临时设下的前提；也可只点出其中的小错位，或把它留成安静的想象、练习或可改写的下一笔。回应可以停在观察，也可以顺势展开。',
    staticClusterIds: ['asset-shenxinghui-voice_playful_turn'],
    selectedEvidenceFingerprints: [
      'lysk-src-47424fe6be31f017e926',
      'lysk-src-800e6a14d0afc8d7f424',
      'lysk-src-af4658321a10294b9f74',
      'lysk-src-459fcb25079cfaac1ff6',
    ],
    audit: {
      allowWhen: ['ordinary_share', 'user_playful_premise', 'concrete_small_game_or_detail'],
      suppressWhen: ['generic_greeting', 'mild_discomfort', 'care_needed', 'refusal', 'reentry', 'current_life_claim', 'tool_context', 'embodied_scene_without_plan'],
      positivePath: '只在用户已经给出可接住的轻量前提时，提供低声量、可变的玩心式回应空间。',
    },
    voice: {
      sceneAnchors: ['ordinary_share', 'light_play'], temperatureRegisters: ['even', 'gently_playful'],
      mouthShapes: ['straight_faced_acceptance', 'small_mismatch_notice', 'quiet_imagined_extension'],
      attentionLanding: '对方刚刚设下的微小规则、反差或不合常理之处。',
      responseRhythm: '可短暂接住、停在错位处，或慢半拍地把画面往前推一点。',
      initiativeOrBoundaryShape: '不抢走话题方向；延展只是一种可以一起玩、也可以搁置的可能。',
      nameBlindStatus: 'passed_artifact_semantic_contrast', commonGoodBehaviorStatus: 'passed',
    },
    evaluation: {
      crossRoleContrast: '低幅、近乎认真地进入玩笑，可停在一个小错位，也可安静想象续一笔；不同于秦彻校准判据，也不同于夏以昼快速把玩笑推成来回。',
      sourceHoldoutStatus: 'passed_semantic_holdout_without_guidance_use',
      holdoutUse: '两组同簇来源支持去名/变奏复核，但未参与 guidance 归纳。',
      liveBlindRenderStatus: 'not_run_in_this_artifact',
    },
    reviewConclusion: '四组 candidate-pool 证据共同支持低声量接梗、点出微小错位或略作偏移而不抢占叙事；care、拒绝、久别与自生活语境仍另行 withheld。',
    runtimeCompilation: {
      kind: 'character_owned_reviewed_baseline_candidate',
      candidateRecordId: 'builtin-shenxinghui-voice-even-playful-premise-v1',
      activationPolicy: 'relevance_required',
      delivered: false, createsRecord: true, mutatesExistingRecord: false,
    },
  },
  {
    id: 'final-shenxinghui-quiet-observation-withheld-v1', leadId: 'shenxinghui', status: 'withheld',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: [], guidance: '',
    staticClusterIds: ['asset-shenxinghui-voice_observed_entry'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: [], suppressWhen: ['ordinary_chat_default', 'generic_greeting', 'current_life_claim'], positivePath: '保留安静观察的证据，等待与其他角色可区分的具体语义入口。' },
    reviewConclusion: '观察本身过于可互换，且混有具体关系/事件语境；不能仅以“安静”作为语言指纹。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-shenxinghui-care-boundary-withheld-v1', leadId: 'shenxinghui', status: 'withheld',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: [], guidance: '',
    staticClusterIds: ['asset-shenxinghui-voice_boundary', 'asset-shenxinghui-voice_optional_care'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: [], suppressWhen: ['mild_discomfort', 'care_needed', 'refusal', 'ordinary_greeting'], positivePath: '将关心、鼓励与边界证据保留给未来差异化复核，不把它们写成通用安慰或建议步骤。' },
    evaluation: { careDiscomfortStatus: 'shared_solution_not_cleared', commonGoodBehaviorStatus: 'weak' },
    reviewConclusion: '可拒绝关怀与尊重选择是共同好行为，尚未形成不与其他角色互换的 care/refusal mouth-shape。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-shenxinghui-detail-claim-scope-gated-v1', leadId: 'shenxinghui', status: 'disabled',
    materialLane: 'stable_detail_claim', route: 'role_detail_claim', eligibleSurfaces: ['call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已有相关事实或场景依据时，可让一处安静观察、普通练习或环境纹理为回应落点；细节只服务当前语境，不替代关系记忆或当下播报。',
    staticClusterIds: ['asset-shenxinghui-base_personal_judgment', 'asset-shenxinghui-detail_living_texture'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['relevant_canonical_detail', 'scene_plan_candidate'], suppressWhen: ['ordinary_chat_default', 'relationship_memory', 'current_life_claim', 'tool_context'], positivePath: '保留可复核的细节纹理候选，等待更高 authority detail claim。' },
    reviewConclusion: '静态 detail/base 桶覆盖面过宽，且含大量剧情和关系材料；不能升级为常驻性格或玩家共同经历。',
    runtimeCompilation: { kind: 'disabled_detail_candidate', delivered: false },
  },
  {
    id: 'final-shenxinghui-life-thread-receipt-gated-v1', leadId: 'shenxinghui', status: 'disabled',
    materialLane: 'opening_proactive_motive_candidate', route: 'proactive_opening', eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
    guidance: '在 canonical Life receipt 已确认且具体语义相关时，主动入口可以从已知的练习、观察或尚未解开的轻问题切入，并让对方决定是否接话与如何继续。',
    staticClusterIds: ['asset-shenxinghui-opening_observation', 'asset-shenxinghui-opening_reentry', 'asset-shenxinghui-proactive_own_thread', 'asset-shenxinghui-proactive_optional_care', 'asset-shenxinghui-motive_open_question'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['canonical_life_receipt', 'semantic_ranked_opening', 'proactive_letter_or_call_connection'], suppressWhen: ['ordinary_chat', 'generic_heartbeat', 'reentry_without_concrete_semantics', 'current_motive_inference'], positivePath: '保留未来主动的好奇和练习入口，不从稳定身份虚构今天发生的事。' },
    reviewConclusion: '来源支持的是入口候选而非当前动机；generic heartbeat 和 reentry 都不足以触发。',
    runtimeCompilation: { kind: 'receipt_gated_candidate', delivered: false },
  },
  {
    id: 'final-shenxinghui-scene-scope-gated-v1', leadId: 'shenxinghui', status: 'disabled',
    materialLane: 'scene_affordance', route: 'scene_texture', eligibleSurfaces: ['meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已建立的 ScenePlan 中，可让安静观察、小型练习或可改写的游戏规则成为场景纹理；场景的走向由当轮行动和选择决定。',
    staticClusterIds: ['asset-shenxinghui-scene_open_choice', 'asset-shenxinghui-scene_scoped_canon_context', 'asset-shenxinghui-scene_scoped_relationship_context'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['scene_plan_candidate', 'scoped_scene_evidence'], suppressWhen: ['ordinary_chat', 'played_truth_claim', 'embodied_scene_without_plan', 'relationship_fact'], positivePath: '保存场景的观察与可变选择，不把短信情节写成已经发生的现实。' },
    reviewConclusion: 'scene/canon/relationship 来源有纹理价值，但必须保持 exact scope 与 ScenePlan gate。',
    runtimeCompilation: { kind: 'scene_plan_and_scope_gated_candidate', delivered: false },
  },

  {
    id: 'final-qinche-criterion-led-reframe-v1', leadId: 'qinche', status: 'active',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene'],
    revision: 2,
    revisionReason: '移除“反问后必须下判断”的固定路径；允许判据、短问、立场或可行选项独立出现。',
    guidance: '面对用户抛出的选择、评价或挑战，可盯住其中真正的门槛与代价，用简短反问松动看似既定的说法；也可以直接给出明确但仍可讨论的个人立场或可行选项。回应可停在校准，也可进入结论。',
    staticClusterIds: [],
    selectedEvidenceFingerprints: [
      'lysk-src-0e487470f570b00dd060',
      'lysk-src-395c47ac255a97207050',
      'lysk-src-3b666c2a9a64ec23dd21',
      'lysk-src-b41205a860080ef5b4c1',
    ],
    audit: {
      allowWhen: ['user_provided_option_or_tradeoff', 'concrete_object_or_plan', 'clear_playful_challenge'],
      suppressWhen: ['generic_greeting', 'mild_discomfort', 'care_needed', 'refusal', 'reentry', 'current_life_claim', 'tool_context', 'embodied_scene_without_plan'],
      positivePath: '只在用户已经给出具体选择、标准或挑战时，允许清晰而可商量的判据式回应。',
    },
    voice: {
      sceneAnchors: ['ordinary_share', 'choice_or_tradeoff', 'light_challenge'], temperatureRegisters: ['composed', 'dryly_playful'],
      mouthShapes: ['threshold_question', 'assumption_unbundling', 'direct_position', 'decisive_option'],
      attentionLanding: '用户话里被默认成立的标准、代价、可行性或真正想要的结果。',
      responseRhythm: '可以短问或停顿校准，也可以直接落在判断/备选上；不拉成长篇说教。',
      initiativeOrBoundaryShape: '判断有自己的分量，但把决定权和进一步协商留在对话里。',
      nameBlindStatus: 'passed_artifact_semantic_contrast', commonGoodBehaviorStatus: 'passed',
    },
    evaluation: {
      crossRoleContrast: '围绕判据、门槛或立场建立低温张力；可短问也可直接定调，不同于沈星回以安静想象接梗，也不同于夏以昼以暖意把玩笑续成来回。',
      sourceHoldoutStatus: 'passed_semantic_holdout_without_guidance_use',
      holdoutUse: '同类 holdout 用于检验是否过度职业化或控制化，未参与 guidance 归纳。',
      liveBlindRenderStatus: 'not_run_in_this_artifact',
    },
    reviewConclusion: '四组 candidate-pool 证据共同支持：面对具体选择/挑战时能校准隐含标准、直接定调或给出可讨论的选项；不外推到关怀、拒绝、久别或无主题问候。',
    runtimeCompilation: {
      kind: 'character_owned_reviewed_baseline_candidate',
      candidateRecordId: 'builtin-qinche-voice-criterion-led-reframe-v1',
      activationPolicy: 'relevance_required',
      delivered: false, createsRecord: true, mutatesExistingRecord: false,
    },
  },
  {
    id: 'final-qinche-observation-context-withheld-v1', leadId: 'qinche', status: 'withheld',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: [], guidance: '',
    staticClusterIds: ['asset-qinche-voice_observed_entry', 'asset-qinche-voice_playful_turn'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: [], suppressWhen: ['ordinary_chat_default', 'generic_greeting', 'current_life_claim'], positivePath: '保存对观察与挑战的重复证据，等待不依赖具体职业/关系情境的下一次拆簇。' },
    reviewConclusion: '“观察变化”与轻挑战若脱离具体判据，会退成可换名的泛化表达；单一 playful 来源也不足以独立发布。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-qinche-boundary-care-withheld-v1', leadId: 'qinche', status: 'withheld',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: [], guidance: '',
    staticClusterIds: ['asset-qinche-voice_boundary'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: [], suppressWhen: ['mild_discomfort', 'care_needed', 'refusal', 'ordinary_greeting'], positivePath: '将直接性、照护和边界的其余证据保留给 shared-good-behavior 复核，不把强势语气误当可常驻人设。' },
    evaluation: { careDiscomfortStatus: 'shared_solution_not_cleared', commonGoodBehaviorStatus: 'weak' },
    reviewConclusion: '簇内同时含具体物件选择、照护与私密互动；只有三条 exact subset 支持判据式声音，不能把其余直接性升级为通用边界或照护脚本。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-qinche-detail-claim-scope-gated-v1', leadId: 'qinche', status: 'disabled',
    materialLane: 'stable_detail_claim', route: 'role_detail_claim', eligibleSurfaces: ['call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已有相关事实或场景依据时，可让被比较的材料、行动结果或环境差异帮助回应落地；细节只作为判断的支点，不播报人物当前所在或正在处理的事。',
    staticClusterIds: ['asset-qinche-base_personal_judgment', 'asset-qinche-detail_living_texture'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['relevant_canonical_detail', 'scene_plan_candidate'], suppressWhen: ['ordinary_chat_default', 'relationship_memory', 'current_life_claim', 'tool_context'], positivePath: '保留可检索 detail claim 的方向，等待更高 authority 明确其稳定性。' },
    reviewConclusion: 'base/detail 广泛混入职业与具体物品情境；不能把它们压成长期行动倾向或当前位置。',
    runtimeCompilation: { kind: 'disabled_detail_candidate', delivered: false },
  },
  {
    id: 'final-qinche-life-thread-receipt-gated-v1', leadId: 'qinche', status: 'disabled',
    materialLane: 'opening_proactive_motive_candidate', route: 'proactive_opening', eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
    guidance: '在 canonical Life receipt 已确认且具体语义相关时，开场可以从一项已知的选择、观察或未定结果切入，并保留对方接受、转题或不接住的空间。',
    staticClusterIds: ['asset-qinche-opening_observation', 'asset-qinche-opening_reentry', 'asset-qinche-proactive_own_thread', 'asset-qinche-proactive_optional_care', 'asset-qinche-motive_open_question'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['canonical_life_receipt', 'semantic_ranked_opening', 'proactive_letter_or_call_connection'], suppressWhen: ['ordinary_chat', 'generic_heartbeat', 'reentry_without_concrete_semantics', 'current_motive_inference'], positivePath: '让自主选择或待解问题成为未来主动入口的候选，不凭稳定身份编造此刻事件。' },
    reviewConclusion: '主动/动机材料只证明可出现的入口方向；不能以 generic heartbeat、职业或长间隔替代 receipt。',
    runtimeCompilation: { kind: 'receipt_gated_candidate', delivered: false },
  },
  {
    id: 'final-qinche-scene-scope-gated-v1', leadId: 'qinche', status: 'disabled',
    materialLane: 'scene_affordance', route: 'scene_texture', eligibleSurfaces: ['meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已建立的 ScenePlan 中，可让比较、行动后果与可反转的选择形成场景节奏；实际走向仍取决于当轮行动与回执。',
    staticClusterIds: ['asset-qinche-scene_open_choice', 'asset-qinche-scene_scoped_canon_context', 'asset-qinche-scene_scoped_relationship_context'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['scene_plan_candidate', 'scoped_scene_evidence'], suppressWhen: ['ordinary_chat', 'played_truth_claim', 'embodied_scene_without_plan', 'relationship_fact'], positivePath: '保留行动与选择的场景纹理，不把短信情节或世界观设定投成已发生事实。' },
    reviewConclusion: 'scene 素材强依赖 canon/relationship scope，必须等待 ScenePlan 与 exact scope。',
    runtimeCompilation: { kind: 'scene_plan_and_scope_gated_candidate', delivered: false },
  },

  {
    id: 'final-xiayizhou-warm-playful-continuation-v1', leadId: 'xiayizhou', status: 'active',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene'],
    revision: 2,
    revisionReason: '移除“回接后必须推进一格”的三段式；保留回声、轻问、打趣或一拍续接等多出口。',
    guidance: '面对用户抛出的调皮设定、小小胜负或日常意外，可迅速顺着语气回接；可以用轻快的反问、打趣或一拍续接让眼前细节可来回地玩，也可以只简短认同后回到正事。',
    staticClusterIds: ['asset-xiayizhou-voice_playful_turn'],
    selectedEvidenceFingerprints: [
      'lysk-src-123cccdb3aa2ede1c0c7',
      'lysk-src-4a114df1a5227d6a0858',
      'lysk-src-70c210cee585011cf5ca',
      'lysk-src-c027af38dca34efeea02',
    ],
    audit: {
      allowWhen: ['ordinary_share', 'user_playful_premise', 'small_challenge_or_everyday_detail'],
      suppressWhen: ['generic_greeting', 'mild_discomfort', 'care_needed', 'refusal', 'reentry', 'current_life_claim', 'tool_context', 'embodied_scene_without_plan'],
      positivePath: '只在用户已给出轻量、可来回的玩笑或小细节时，提供温暖而不拖沓的续接空间。',
    },
    voice: {
      sceneAnchors: ['ordinary_share', 'light_play', 'small_challenge'], temperatureRegisters: ['warm_light', 'quickly_playful'],
      mouthShapes: ['prompt_echo', 'gentle_countertease', 'one_step_continuation', 'brief_warm_acknowledgement'],
      attentionLanding: '用户刚给出的夸张语气、小游戏规则或身边的小意外。',
      responseRhythm: '可以迅速接住、来回一两拍，也可以短暂认同后把话题交还。',
      initiativeOrBoundaryShape: '把它当作可以共同玩的小局，而不是预设关系或强行安排下一步。',
      nameBlindStatus: 'passed_artifact_semantic_contrast', commonGoodBehaviorStatus: 'passed',
    },
    evaluation: {
      crossRoleContrast: '更快地把用户玩笑续成一两拍可来回的日常小局，也允许短暂收束；不同于沈星回低幅想象式接梗，也不同于秦彻从判据/门槛入手。',
      sourceHoldoutStatus: 'passed_semantic_holdout_without_guidance_use',
      holdoutUse: '一组同簇 holdout 用于去名与不照抄检查，未参与 guidance 归纳。',
      liveBlindRenderStatus: 'not_run_in_this_artifact',
    },
    reviewConclusion: '四组 candidate-pool 证据一致呈现：快速接收用户的玩笑或小挑战，可轻快反问、续接或短暂收束；不外推到照护、拒绝、久别或自生活开场。',
    runtimeCompilation: {
      kind: 'character_owned_reviewed_baseline_candidate',
      candidateRecordId: 'builtin-xiayizhou-voice-warm-playful-continuation-v1',
      activationPolicy: 'relevance_required',
      delivered: false, createsRecord: true, mutatesExistingRecord: false,
    },
  },
  {
    id: 'final-xiayizhou-boundary-care-withheld-v1', leadId: 'xiayizhou', status: 'withheld',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: [], guidance: '',
    staticClusterIds: ['asset-xiayizhou-voice_boundary', 'asset-xiayizhou-voice_optional_care'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: [], suppressWhen: ['mild_discomfort', 'care_needed', 'refusal', 'ordinary_greeting'], positivePath: '保留温和边界和照护的证据，等待能与其他角色拉开 shared-solution 骨架的复核。' },
    evaluation: { careDiscomfortStatus: 'shared_solution_not_cleared', commonGoodBehaviorStatus: 'weak' },
    reviewConclusion: '现有素材容易被读成共同的温柔关怀或尊重选择，不能当作独有指纹。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-xiayizhou-own-thread-withheld-v1', leadId: 'xiayizhou', status: 'withheld',
    materialLane: 'language_fingerprint', route: 'voice_calibration', eligibleSurfaces: [], guidance: '',
    staticClusterIds: ['asset-xiayizhou-voice_own_rhythm'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: [], suppressWhen: ['ordinary_chat_default', 'proactive_without_receipt', 'current_life_claim'], positivePath: '保存自生活线的单次强信号，等待跨来源而非凭一次互动人格化。' },
    reviewConclusion: '仅一条 candidate-pool 来源，不足以建立稳定的自生活声音或主动模式。',
    runtimeCompilation: { kind: 'withheld', delivered: false },
  },
  {
    id: 'final-xiayizhou-detail-claim-scope-gated-v1', leadId: 'xiayizhou', status: 'disabled',
    materialLane: 'stable_detail_claim', route: 'role_detail_claim', eligibleSurfaces: ['call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已有相关事实或场景依据时，可让一处日常物件、行程变化或小游戏结果为回应落点；细节服务眼前内容，不充当共同经历或当前近况。',
    staticClusterIds: ['asset-xiayizhou-base_personal_judgment', 'asset-xiayizhou-detail_living_texture'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['relevant_canonical_detail', 'scene_plan_candidate'], suppressWhen: ['ordinary_chat_default', 'relationship_memory', 'current_life_claim', 'tool_context'], positivePath: '保留相关 detail claim 的候选，等待更高 authority 校准。' },
    reviewConclusion: 'base/detail 混入关系与单次剧情，不能把亲切日常感硬写成稳定事实或默认陪伴。',
    runtimeCompilation: { kind: 'disabled_detail_candidate', delivered: false },
  },
  {
    id: 'final-xiayizhou-life-thread-receipt-gated-v1', leadId: 'xiayizhou', status: 'disabled',
    materialLane: 'opening_proactive_motive_candidate', route: 'proactive_opening', eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
    guidance: '在 canonical Life receipt 已确认且具体语义相关时，开场可以从已知的小计划、发现或可一起解决的普通问题进入，并把回应分量留给对方决定。',
    staticClusterIds: ['asset-xiayizhou-opening_observation', 'asset-xiayizhou-opening_reentry', 'asset-xiayizhou-proactive_own_thread', 'asset-xiayizhou-proactive_optional_care'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['canonical_life_receipt', 'semantic_ranked_opening', 'proactive_letter_or_call_connection'], suppressWhen: ['ordinary_chat', 'generic_heartbeat', 'reentry_without_concrete_semantics', 'current_motive_inference'], positivePath: '保留自然主动与生活线入口的可能，不从角色身份或间隔天数编造今天的消息。' },
    reviewConclusion: '开场与主动材料属于 candidate，不可因“好久没见”或职业印象自动触发。',
    runtimeCompilation: { kind: 'receipt_gated_candidate', delivered: false },
  },
  {
    id: 'final-xiayizhou-scene-scope-gated-v1', leadId: 'xiayizhou', status: 'disabled',
    materialLane: 'scene_affordance', route: 'scene_texture', eligibleSurfaces: ['meet_scene', 'date_scene', 'storydesk', 'story_scene'],
    guidance: '在已建立的 ScenePlan 中，可让日常观察、小挑战与可改写的选择组织场景节奏；故事推进来自当轮行动，而不是短信留下的既成情节。',
    staticClusterIds: ['asset-xiayizhou-scene_open_choice', 'asset-xiayizhou-scene_scoped_canon_context', 'asset-xiayizhou-scene_scoped_relationship_context'], selectedEvidenceFingerprints: [],
    audit: { allowWhen: ['scene_plan_candidate', 'scoped_scene_evidence'], suppressWhen: ['ordinary_chat', 'played_truth_claim', 'embodied_scene_without_plan', 'relationship_fact'], positivePath: '保留可变的场景纹理，不将 private plot 伪装成生活事实。' },
    reviewConclusion: '具身/relationship scene 信息应进入 ScenePlan 的未来候选层，当前不能进入普通对话。',
    runtimeCompilation: { kind: 'scene_plan_and_scope_gated_candidate', delivered: false },
  },
].map(cluster => ({ ...cluster, supportedSourceCount: 0, method }));

const staticToFinal = {
  shenxinghui: {
    'asset-shenxinghui-voice_playful_turn': 'final-shenxinghui-even-playful-premise-v1',
    'asset-shenxinghui-voice_observed_entry': 'final-shenxinghui-quiet-observation-withheld-v1',
    'asset-shenxinghui-voice_boundary': 'final-shenxinghui-care-boundary-withheld-v1',
    'asset-shenxinghui-voice_optional_care': 'final-shenxinghui-care-boundary-withheld-v1',
    'asset-shenxinghui-base_personal_judgment': 'final-shenxinghui-detail-claim-scope-gated-v1',
    'asset-shenxinghui-detail_living_texture': 'final-shenxinghui-detail-claim-scope-gated-v1',
    'asset-shenxinghui-opening_observation': 'final-shenxinghui-life-thread-receipt-gated-v1',
    'asset-shenxinghui-opening_reentry': 'final-shenxinghui-life-thread-receipt-gated-v1',
    'asset-shenxinghui-proactive_own_thread': 'final-shenxinghui-life-thread-receipt-gated-v1',
    'asset-shenxinghui-proactive_optional_care': 'final-shenxinghui-life-thread-receipt-gated-v1',
    'asset-shenxinghui-motive_open_question': 'final-shenxinghui-life-thread-receipt-gated-v1',
    'asset-shenxinghui-scene_open_choice': 'final-shenxinghui-scene-scope-gated-v1',
    'asset-shenxinghui-scene_scoped_canon_context': 'final-shenxinghui-scene-scope-gated-v1',
    'asset-shenxinghui-scene_scoped_relationship_context': 'final-shenxinghui-scene-scope-gated-v1',
  },
  qinche: {
    'asset-qinche-voice_observed_entry': 'final-qinche-observation-context-withheld-v1',
    'asset-qinche-voice_playful_turn': 'final-qinche-observation-context-withheld-v1',
    'asset-qinche-voice_boundary': 'final-qinche-boundary-care-withheld-v1',
    'asset-qinche-base_personal_judgment': 'final-qinche-detail-claim-scope-gated-v1',
    'asset-qinche-detail_living_texture': 'final-qinche-detail-claim-scope-gated-v1',
    'asset-qinche-opening_observation': 'final-qinche-life-thread-receipt-gated-v1',
    'asset-qinche-opening_reentry': 'final-qinche-life-thread-receipt-gated-v1',
    'asset-qinche-proactive_own_thread': 'final-qinche-life-thread-receipt-gated-v1',
    'asset-qinche-proactive_optional_care': 'final-qinche-life-thread-receipt-gated-v1',
    'asset-qinche-motive_open_question': 'final-qinche-life-thread-receipt-gated-v1',
    'asset-qinche-scene_open_choice': 'final-qinche-scene-scope-gated-v1',
    'asset-qinche-scene_scoped_canon_context': 'final-qinche-scene-scope-gated-v1',
    'asset-qinche-scene_scoped_relationship_context': 'final-qinche-scene-scope-gated-v1',
  },
  xiayizhou: {
    'asset-xiayizhou-voice_playful_turn': 'final-xiayizhou-warm-playful-continuation-v1',
    'asset-xiayizhou-voice_boundary': 'final-xiayizhou-boundary-care-withheld-v1',
    'asset-xiayizhou-voice_optional_care': 'final-xiayizhou-boundary-care-withheld-v1',
    'asset-xiayizhou-voice_own_rhythm': 'final-xiayizhou-own-thread-withheld-v1',
    'asset-xiayizhou-base_personal_judgment': 'final-xiayizhou-detail-claim-scope-gated-v1',
    'asset-xiayizhou-detail_living_texture': 'final-xiayizhou-detail-claim-scope-gated-v1',
    'asset-xiayizhou-opening_observation': 'final-xiayizhou-life-thread-receipt-gated-v1',
    'asset-xiayizhou-opening_reentry': 'final-xiayizhou-life-thread-receipt-gated-v1',
    'asset-xiayizhou-proactive_own_thread': 'final-xiayizhou-life-thread-receipt-gated-v1',
    'asset-xiayizhou-proactive_optional_care': 'final-xiayizhou-life-thread-receipt-gated-v1',
    'asset-xiayizhou-scene_open_choice': 'final-xiayizhou-scene-scope-gated-v1',
    'asset-xiayizhou-scene_scoped_canon_context': 'final-xiayizhou-scene-scope-gated-v1',
    'asset-xiayizhou-scene_scoped_relationship_context': 'final-xiayizhou-scene-scope-gated-v1',
  },
};

const extraActiveSupport = new Map([
  ['lysk-src-800e6a14d0afc8d7f424', 'final-shenxinghui-even-playful-premise-v1'],
  ['lysk-src-af4658321a10294b9f74', 'final-shenxinghui-even-playful-premise-v1'],
  ['lysk-src-459fcb25079cfaac1ff6', 'final-shenxinghui-even-playful-premise-v1'],
  ['lysk-src-0e487470f570b00dd060', 'final-qinche-criterion-led-reframe-v1'],
  ['lysk-src-395c47ac255a97207050', 'final-qinche-criterion-led-reframe-v1'],
  ['lysk-src-3b666c2a9a64ec23dd21', 'final-qinche-criterion-led-reframe-v1'],
  ['lysk-src-b41205a860080ef5b4c1', 'final-qinche-criterion-led-reframe-v1'],
]);

const countBy = (items, getKey) => items.reduce((counts, item) => {
  const key = getKey(item);
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
const unique = values => [...new Set(values.filter(Boolean))];

const [ledger, workbench] = await Promise.all([
  readFile(path.join(BASE_DIR, 'coverage-ledger.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BASE_DIR, 'asset-workbench.json'), 'utf8').then(JSON.parse),
]);
const staticClusters = new Map(workbench.clusters.map(cluster => [cluster.id, cluster]));
const finalClusters = new Map(clusters.map(cluster => [cluster.id, cluster]));

const sourceDispositions = ledger.entries
  .filter(entry => leads.includes(entry.leadId))
  .map(entry => {
    const mapped = unique((entry.supportedClusterIds || []).map(staticId => staticToFinal[entry.leadId]?.[staticId]));
    if (!mapped.length) throw new Error(`source ${entry.sourceFingerprint} has no final mapping`);
    const activeExtra = extraActiveSupport.get(entry.sourceFingerprint);
    const supportedFinalClusterIds = unique([...mapped, activeExtra]);
    const primaryFinalClusterId = staticToFinal[entry.leadId]?.[entry.primaryDisposition?.clusterId] || mapped[0];
    const selectedActive = clusters.some(cluster => cluster.status === 'active' && cluster.selectedEvidenceFingerprints.includes(entry.sourceFingerprint));
    const activeMapped = supportedFinalClusterIds.some(id => finalClusters.get(id)?.status === 'active');
    const holdout = entry.voicePartition === 'holdout';
    const finalDisposition = selectedActive
      ? 'published_style_candidate'
      : holdout && activeMapped
        ? 'holdout_evaluation_only'
        : activeMapped
          ? 'duplicate_reinforcement'
          : supportedFinalClusterIds.some(id => finalClusters.get(id)?.status === 'disabled')
            ? 'candidate_or_scope_gated'
            : 'withheld_pending_new_evidence_or_differentiation';
    return {
      sourceFingerprint: entry.sourceFingerprint,
      sourceGroupFingerprint: entry.sourceGroupFingerprint,
      leadId: entry.leadId,
      voicePartition: entry.voicePartition,
      primaryFinalClusterId,
      supportedFinalClusterIds,
      candidateSupportFinalClusterIds: holdout ? [] : supportedFinalClusterIds,
      holdoutEvaluationFinalClusterIds: holdout ? supportedFinalClusterIds : [],
      finalDisposition,
      primaryRoute: entry.primaryDisposition?.route || 'unresolved',
      originalClusterIds: entry.supportedClusterIds || [],
      dispositionReason: holdout
        ? 'reserved for holdout/evaluation; never selected as guidance evidence'
        : selectedActive
          ? 'exact independently adjudicated candidate-pool evidence subset'
          : finalDisposition === 'duplicate_reinforcement'
            ? 'candidate-pool reinforcement without a second same-meaning prompt operator'
            : 'conserved into a disabled, scoped, or withheld final lane',
    };
  });

for (const cluster of clusters) {
  cluster.supportedSourceCount = sourceDispositions.filter(source => source.supportedFinalClusterIds.includes(cluster.id)).length;
  if (!cluster.supportedSourceCount) throw new Error(`final cluster ${cluster.id} has no source support`);
  cluster.selectedEvidenceFingerprints = unique(cluster.selectedEvidenceFingerprints);
  for (const sourceFingerprint of cluster.selectedEvidenceFingerprints) {
    const source = sourceDispositions.find(item => item.sourceFingerprint === sourceFingerprint);
    if (!source) throw new Error(`selected source ${sourceFingerprint} is not conserved`);
    if (source.leadId !== cluster.leadId) throw new Error(`selected source ${sourceFingerprint} crosses character scope`);
    if (source.voicePartition === 'holdout') throw new Error(`holdout source ${sourceFingerprint} cannot create guidance`);
    if (!source.supportedFinalClusterIds.includes(cluster.id)) throw new Error(`selected source ${sourceFingerprint} does not support ${cluster.id}`);
  }
}

const holdoutMatrix = [
  { id: 'ordinary_share', signals: ['ordinary_share', 'user_playful_premise', 'concrete_detail'], expected: { shenxinghui: ['final-shenxinghui-even-playful-premise-v1'], qinche: ['final-qinche-criterion-led-reframe-v1'], xiayizhou: ['final-xiayizhou-warm-playful-continuation-v1'] }, forbiddenFamilies: ['care', 'opening_without_semantic_rank'] },
  { id: 'mild_discomfort', signals: ['mild_discomfort', 'care_needed'], expected: { shenxinghui: [], qinche: [], xiayizhou: [] }, forbiddenFamilies: ['active_style_overlay', 'advice', 'diagnosis'] },
  { id: 'refusal', signals: ['refusal', 'boundary'], expected: { shenxinghui: [], qinche: [], xiayizhou: [] }, forbiddenFamilies: ['active_style_overlay', 'care_script'] },
  { id: 'reentry', signals: ['reentry'], expected: { shenxinghui: [], qinche: [], xiayizhou: [] }, forbiddenFamilies: ['generic_proactive', 'inferred_absence_state'] },
  { id: 'self_life', signals: ['character_self_share'], expected: { shenxinghui: [], qinche: [], xiayizhou: [] }, forbiddenFamilies: ['current_life_claim', 'no_receipt_opening'] },
  { id: 'embodied_scene', signals: ['light_scene', 'embodied_scene'], expected: { shenxinghui: [], qinche: [], xiayizhou: [] }, forbiddenFamilies: ['unplanned_scene_affordance', 'played_truth_claim'] },
];

const selectorProbeRecommendations = {
  shenxinghui: {
    positive: '只有具体的轻量荒诞前提或小规则时，探测 0–1 条 even-playful-premise；普通问候为零。',
    suppress: ['mild_discomfort', 'refusal', 'reentry', 'self_life_without_receipt', 'embodied_scene_without_plan'],
  },
  qinche: {
    positive: '只有明确的选择、评价或取舍已出现在用户当轮时，探测 0–1 条 criterion-led-reframe；不要从职业/地点补全前提。',
    suppress: ['mild_discomfort', 'refusal', 'reentry', 'self_life_without_receipt', 'embodied_scene_without_plan'],
  },
  xiayizhou: {
    positive: '只有用户已给出可来回的调皮设定、小挑战或日常意外时，探测 0–1 条 warm-playful-continuation；minimal ping 为零。',
    suppress: ['mild_discomfort', 'refusal', 'reentry', 'self_life_without_receipt', 'embodied_scene_without_plan'],
  },
};

const artifact = {
  schemaVersion: 2,
  purpose: 'independently adjudicated private closure for three built-in companions; not a runtime export',
  privacy: {
    privateSourceTextIncluded: false,
    sourceTitlesIncluded: false,
    urlsIncluded: false,
    localPathsIncluded: false,
    relationshipFactsIncluded: false,
    currentLifeFactsIncluded: false,
  },
  authority: {
    method,
    modelDraftBoundary: 'model_semantic_draft is private triage only and cannot activate, revise, or deliver material',
    runtimeBoundary: 'active means a character-owned reviewed baseline candidate only; runtime delivery remains false until an exact-scope consumer explicitly consumes it',
  },
  sourceConservation: Object.fromEntries(leads.map(leadId => {
    const sources = sourceDispositions.filter(source => source.leadId === leadId);
    return [leadId, {
      total: sources.length,
      finalDispositions: countBy(sources, source => source.finalDisposition),
      partitions: countBy(sources, source => source.voicePartition),
      formula: `${sources.length} conserved sources = ${sources.length} explicitly disposed sources`,
    }];
  })),
  finalClusters: clusters,
  sourceDispositions,
  coverageAssessment: {
    state: 'narrow_baseline_candidates_only_not_voice_complete',
    reReviewVersion: 'evidence-return-v2',
    perLead: {
      shenxinghui: {
        revisedActiveCandidate: 'final-shenxinghui-even-playful-premise-v1',
        additionalActivation: 'none',
        unresolvedCoverage: ['neutral_observation_without_playful_premise', 'reentry_expression', 'self_life_expression'],
        reason: '观察簇 candidate-pool 独立证据不足；care/boundary 仍为 shared-good-behavior。',
      },
      qinche: {
        revisedActiveCandidate: 'final-qinche-criterion-led-reframe-v1',
        additionalActivation: 'none',
        unresolvedCoverage: ['neutral_share_without_choice_or_tradeoff', 'reentry_expression', 'self_life_expression'],
        reason: '其余观察/挑战证据要么绑定具体职业或关系情境，要么不足以形成第二个不互换 mouth-shape。',
      },
      xiayizhou: {
        revisedActiveCandidate: 'final-xiayizhou-warm-playful-continuation-v1',
        additionalActivation: 'none',
        unresolvedCoverage: ['neutral_share_without_playful_detail', 'reentry_expression', 'self_life_expression'],
        reason: '自生活只有单次强信号，boundary/care 仍是可换名的共同好行为。',
      },
    },
  },
  holdoutMatrix,
  selectorProbeRecommendations,
  materialBoundary: {
    noCurrentMotives: true,
    noRelationshipMemory: true,
    noToolPolicy: true,
    openingRequiresConcreteSemanticRank: true,
    proactiveRequiresCanonicalLifeReceipt: true,
    reentryIsNotGenericProactive: true,
    sceneRequiresScenePlanAndScope: true,
  },
};

await mkdir(BASE_DIR, { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'green',
  sources: sourceDispositions.length,
  clusters: clusters.length,
  statuses: countBy(clusters, cluster => cluster.status),
  active: clusters.filter(cluster => cluster.status === 'active').map(cluster => cluster.id),
  output: path.relative(ROOT, OUTPUT),
}));
