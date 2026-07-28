import {
  REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION,
  type ReviewedCompanionMaterialCandidate,
} from './reviewedCandidate.ts';

/**
 * Generated from the private second-density adjudication.
 *
 * These non-verbatim candidates preserve reusable value that needs a named
 * canon, thread, artifact or Director authority. They are intentionally not
 * CompanionMaterialRecord values and cannot enter a model prompt merely by
 * existing in the public build.
 */
const SPECS = [
  {
    "id": "reviewed-qiyu-scoped-canon-small-object-imagining-v2",
    "charId": "builtin-daily-companion",
    "category": "A",
    "materialLane": "stable_detail_claim",
    "route": "stable_detail",
    "guidance": "可把既有的小物、材质或轻微异常看成有性格的观察对象；它们的用途、名字或画面可以保持可变。",
    "factStrength": "source_derived_canon_detail_candidate",
    "renderPolicy": "canon_detail_review_required",
    "eligibleSurfaces": [
      "role_card_review",
      "worldbook_review",
      "storydesk"
    ],
    "allowWhen": [
      "exact_canon_scope",
      "relevant_established_object_or_texture"
    ],
    "suppressWhen": [
      "ordinary_chat_default",
      "relationship_memory",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "A source-derived character detail candidate only; it does not assert a current object, shared possession, relationship history, or current motive.",
    "consumerPort": "character-canon-detail-review",
    "activationAuthority": "character_canon_review",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-canon-small-object-imagining-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-f2b8c40215f1f011dd5d",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-canon-small-object-imagining-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-ff85618c8744a15b15a5",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-canon-small-object-imagining-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-1221e0ff92e73c7cfc7a",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qiyu-scoped-canon-public-rule-turn-v2",
    "charId": "builtin-daily-companion",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可由公开活动、轻规则或可观察的小竞争起步，让重新命名、轻微夸张或规则反转决定下一步。",
    "factStrength": "scoped_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_world_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_world_scope",
      "scene_context_has_public_activity_or_rule"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A possible future ScenePlan texture, never proof that an activity, competition, or relationship event has already occurred.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-canon-public-rule-turn-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-1a02f7cf0a4c66f88120",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-canon-public-rule-turn-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-211dec6a14d02526c263",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-canon-public-rule-turn-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-2c1216d74840fcdfd9e5",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qiyu-scoped-relationship-external-artifact-reframe-v2",
    "charId": "builtin-daily-companion",
    "category": "B",
    "materialLane": "opening_recipe",
    "route": "proactive_opening",
    "guidance": "当一个已确认的外部物件、图像或手作线索本身带着可改写的反差时，可从它的另一种用途、名字或画面切入，留出共同续写的余地。",
    "factStrength": "scope_gated_opening_recipe_not_fact",
    "renderPolicy": "canonical_thread_or_external_artifact_anchor_required",
    "eligibleSurfaces": [
      "proactive_letter",
      "call",
      "meet_scene",
      "date_scene"
    ],
    "allowWhen": [
      "canonical_thread_receipt_or_external_artifact_anchor",
      "concrete_semantic_match"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "generic_heartbeat",
      "reentry_without_receipt",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "The recipe may use only an already established external artifact or canonical thread; it cannot invent a gift, shared project, or present relationship state.",
    "consumerPort": "proactive-opening-receipt-gate",
    "activationAuthority": "canonical_thread_or_artifact",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-relationship-external-artifact-reframe-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-3c0172c277df1b30d3bb",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-relationship-external-artifact-reframe-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-8339cc57972e0e6bc2c3",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-relationship-external-artifact-reframe-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-7ae4dae434fdbf57c62c",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qiyu-scoped-relationship-low-stakes-misread-turn-v2",
    "charId": "builtin-daily-companion",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让一处低风险误读、玩笑性规则或小选择先偏离预期，再由双方决定是顺着偏差玩下去还是把它轻轻翻回。",
    "factStrength": "scope_gated_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_relationship_or_thread_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_relationship_or_thread_scope",
      "scene_has_low_stakes_misread_or_choice"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A scene mechanism only. It cannot recover a private plot, relationship fact, or prior action as played truth.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-relationship-low-stakes-misread-turn-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-60fddf37ed8b2ce2e4a9",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-relationship-low-stakes-misread-turn-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-66db5eeda5a4594c777c",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qiyu-scoped-relationship-low-stakes-misread-turn-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-c1479cd5dd66c0b23631",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-lishen-scoped-canon-order-and-curiosity-v2",
    "charId": "builtin-zayne",
    "category": "A",
    "materialLane": "stable_detail_claim",
    "route": "stable_detail",
    "guidance": "面对已建立的规则、顺序、器物或小课题时，可先把关键差异看清，再让好奇以克制的试探、比较或共同研究出现。",
    "factStrength": "source_derived_canon_detail_candidate",
    "renderPolicy": "canon_detail_review_required",
    "eligibleSurfaces": [
      "role_card_review",
      "worldbook_review",
      "storydesk"
    ],
    "allowWhen": [
      "exact_canon_scope",
      "relevant_established_rule_object_or_problem"
    ],
    "suppressWhen": [
      "ordinary_chat_default",
      "relationship_memory",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "A source-derived attention/detail candidate, not a current professional act, diagnosis, schedule, or relationship memory.",
    "consumerPort": "character-canon-detail-review",
    "activationAuthority": "character_canon_review",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-canon-order-and-curiosity-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-1de02ac8294f99e8866d",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-canon-order-and-curiosity-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-4a57d4861ddf1fb1787e",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-canon-order-and-curiosity-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-538b15e3b38f26078937",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-lishen-scoped-canon-task-to-inquiry-scene-v2",
    "charId": "builtin-zayne",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可从一项明确的小任务、物件或规则开始，经过一次细节核对、选择分岔或轻微玩笑，把它推进为可共同研究的片段。",
    "factStrength": "scoped_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_world_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_world_scope",
      "scene_has_concrete_task_or_object"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A possible ScenePlan texture only; it does not infer a shared task, professional setting, or current event.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-canon-task-to-inquiry-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-4e0279c7f75841cd65e3",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-canon-task-to-inquiry-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-6c19cd668d579c852c09",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-canon-task-to-inquiry-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-6d14d9346207bda24f31",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-lishen-scoped-relationship-object-led-choice-opening-v2",
    "charId": "builtin-zayne",
    "category": "B",
    "materialLane": "opening_recipe",
    "route": "proactive_opening",
    "guidance": "当 canonical thread 已留下一个具体物件、邀约或待办线索时，可从其中最需要确认的一点切入，让一个小选择或共同判断自然展开。",
    "factStrength": "scope_gated_opening_recipe_not_fact",
    "renderPolicy": "canonical_thread_receipt_required",
    "eligibleSurfaces": [
      "proactive_letter",
      "call",
      "meet_scene",
      "date_scene"
    ],
    "allowWhen": [
      "canonical_thread_receipt",
      "concrete_semantic_match"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "generic_heartbeat",
      "reentry_without_receipt",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "Only a confirmed thread may supply the object or plan. The asset does not infer a prior invitation, relationship stage, or current self-life.",
    "consumerPort": "proactive-opening-receipt-gate",
    "activationAuthority": "canonical_thread_or_artifact",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-relationship-object-led-choice-opening-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-01b06caedba0931ec989",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-relationship-object-led-choice-opening-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-09e5e75f3ec63141f2c9",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-relationship-object-led-choice-opening-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-260886161cfded41a68b",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-lishen-scoped-relationship-coordination-lightness-scene-v2",
    "charId": "builtin-zayne",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让一项具体协调先经过暂停、核对或条件调整，再以不抢戏的轻松感把下一步留给双方决定。",
    "factStrength": "scope_gated_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_relationship_or_thread_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_relationship_or_thread_scope",
      "scene_has_concrete_coordination"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A future scene movement only; it never turns an old private coordination into current relationship truth.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-relationship-coordination-lightness-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-29b41cb75673b265b1cd",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-relationship-coordination-lightness-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-34064569208f3ab6d7d4",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-scoped-relationship-coordination-lightness-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-36afe711dc85578030f4",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-shenxinghui-scoped-canon-nearby-ecology-detail-v2",
    "charId": "builtin-xavier",
    "category": "A",
    "materialLane": "stable_detail_claim",
    "route": "stable_detail",
    "guidance": "在已建立的近处环境里，可留意微小生命、光线、天气或位置变化如何改写眼前的选择，并让观察保持安静而开放。",
    "factStrength": "source_derived_canon_detail_candidate",
    "renderPolicy": "canon_detail_review_required",
    "eligibleSurfaces": [
      "role_card_review",
      "worldbook_review",
      "storydesk"
    ],
    "allowWhen": [
      "exact_canon_scope",
      "relevant_established_environmental_cue"
    ],
    "suppressWhen": [
      "ordinary_chat_default",
      "relationship_memory",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "A possible canon/detail claim about attention; it does not claim a present animal, location, rescue, or shared experience.",
    "consumerPort": "character-canon-detail-review",
    "activationAuthority": "character_canon_review",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-canon-nearby-ecology-detail-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-002f2e2420e2079ce6ba",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-canon-nearby-ecology-detail-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-00f650683e0ef4b90189",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-canon-nearby-ecology-detail-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-02525ea7e194cd25eb5f",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-shenxinghui-scoped-canon-small-anomaly-scene-v2",
    "charId": "builtin-xavier",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让一个微小异常先改变注意力的方向，再由观察、照看、等待或开放选择决定画面怎样继续。",
    "factStrength": "scoped_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_world_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_world_scope",
      "scene_has_small_environmental_anomaly"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A future ScenePlan option only; it does not assert a rescue, event, or current circumstance.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-canon-small-anomaly-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-08aab633f64c636d3c48",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-canon-small-anomaly-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-09100dc6ba85553c5133",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-canon-small-anomaly-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-102975b5971396b35ea3",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-shenxinghui-scoped-relationship-odd-daily-choice-opening-v2",
    "charId": "builtin-xavier",
    "category": "B",
    "materialLane": "opening_recipe",
    "route": "proactive_opening",
    "guidance": "当 canonical thread 或外部日常线索带来一个微妙、意外却低风险的选择时，可近乎认真地接住它，再把选择如何继续留给对方。",
    "factStrength": "scope_gated_opening_recipe_not_fact",
    "renderPolicy": "canonical_thread_or_external_artifact_anchor_required",
    "eligibleSurfaces": [
      "proactive_letter",
      "call",
      "meet_scene",
      "date_scene"
    ],
    "allowWhen": [
      "canonical_thread_receipt_or_external_artifact_anchor",
      "concrete_semantic_match"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "generic_heartbeat",
      "reentry_without_receipt",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "The anchor must be established outside this asset. It does not invent an outing, domestic state, or relationship routine.",
    "consumerPort": "proactive-opening-receipt-gate",
    "activationAuthority": "canonical_thread_or_artifact",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-relationship-odd-daily-choice-opening-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0177242d7c0864e9b04a",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-relationship-odd-daily-choice-opening-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-07f840c6920a1fe92e05",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-relationship-odd-daily-choice-opening-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0b2aefc4ef3cd5c9ab79",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-shenxinghui-scoped-relationship-object-sets-pace-scene-v2",
    "charId": "builtin-xavier",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让一个物件、微小生物或日常卡顿改变原定节奏，双方以等待、协作或安静的玩心决定下一步。",
    "factStrength": "scope_gated_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_relationship_or_thread_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_relationship_or_thread_scope",
      "scene_has_object_or_small_setback"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A ScenePlan candidate only; it cannot replay a private domestic or outing event.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-relationship-object-sets-pace-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0bdbce3076aaceabf6c6",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-relationship-object-sets-pace-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0c7736ea9756ed3668ef",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-shenxinghui-scoped-relationship-object-sets-pace-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0e9db4570e734c1c9259",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qinche-scoped-canon-criteria-and-stakes-detail-v2",
    "charId": "builtin-sylus",
    "category": "A",
    "materialLane": "stable_detail_claim",
    "route": "stable_detail",
    "guidance": "面对已建立的选择、规则或代价时，可先辨认真正的门槛与筹码，再让判断以直截、可商量的方式出现。",
    "factStrength": "source_derived_canon_detail_candidate",
    "renderPolicy": "canon_detail_review_required",
    "eligibleSurfaces": [
      "role_card_review",
      "worldbook_review",
      "storydesk"
    ],
    "allowWhen": [
      "exact_canon_scope",
      "relevant_established_choice_rule_or_stake"
    ],
    "suppressWhen": [
      "ordinary_chat_default",
      "relationship_memory",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "A candidate attention/detail pattern only; it does not state an ongoing conflict, authority, objective, or current motive.",
    "consumerPort": "character-canon-detail-review",
    "activationAuthority": "character_canon_review",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-canon-criteria-and-stakes-detail-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-09937dbd81dabb161763",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-canon-criteria-and-stakes-detail-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0ba32cf6195ee4aa1e60",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-canon-criteria-and-stakes-detail-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-18ba193c9233cf4833f2",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qinche-scoped-canon-rule-consequence-scene-v2",
    "charId": "builtin-sylus",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可由一个清楚的规则、试探或代价启动，让选择的后果、临时反制或重新定价推进局面。",
    "factStrength": "scoped_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_world_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_world_scope",
      "scene_has_rule_choice_or_stake"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A future scene mechanism, not proof of a current conflict, challenge, or played outcome.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-canon-rule-consequence-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-1d9e512bb69ded187435",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-canon-rule-consequence-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-1e2bbb7bf7f10246854b",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-canon-rule-consequence-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-209b2df478716b1824e7",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qinche-scoped-relationship-disruption-recenter-opening-v2",
    "charId": "builtin-sylus",
    "category": "B",
    "materialLane": "opening_recipe",
    "route": "proactive_opening",
    "guidance": "当一个已确认的日常线索出现偏差、停顿或意外代价时，可从真正需要重新判断的一点切入，让对方决定是否继续拆开它。",
    "factStrength": "scope_gated_opening_recipe_not_fact",
    "renderPolicy": "canonical_thread_or_external_artifact_anchor_required",
    "eligibleSurfaces": [
      "proactive_letter",
      "call",
      "meet_scene",
      "date_scene"
    ],
    "allowWhen": [
      "canonical_thread_receipt_or_external_artifact_anchor",
      "concrete_semantic_match"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "generic_heartbeat",
      "reentry_without_receipt",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "The triggering disruption must already be established. This asset does not manufacture a shared setback, current life report, or relationship tension.",
    "consumerPort": "proactive-opening-receipt-gate",
    "activationAuthority": "canonical_thread_or_artifact",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-relationship-disruption-recenter-opening-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-09ddf798ad4708e9213b",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-relationship-disruption-recenter-opening-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-1797020d805299d14cb8",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-relationship-disruption-recenter-opening-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-28d7456522246c1dcc53",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-qinche-scoped-relationship-counterturn-scene-v2",
    "charId": "builtin-sylus",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让挑战、承诺或一项选择先建立预期，再由反问、反制或新的代价把局面推向下一轮判断。",
    "factStrength": "scope_gated_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_relationship_or_thread_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_relationship_or_thread_scope",
      "scene_has_challenge_or_counterturn"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A potential scene turn only; it does not restore a private challenge or imply its outcome.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-relationship-counterturn-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-327ba3ef3250a37d3779",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-relationship-counterturn-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-331fcb266d3d5d6b8af9",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-qinche-scoped-relationship-counterturn-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-4553a6eb210b5891302b",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-xiayizhou-scoped-canon-object-route-shift-detail-v2",
    "charId": "builtin-caleb",
    "category": "A",
    "materialLane": "stable_detail_claim",
    "route": "stable_detail",
    "guidance": "当已建立的物件、路线或环境细节意外改变原本用途时，可先接住这种变化，再让下一步保持快速、可调整的展开。",
    "factStrength": "source_derived_canon_detail_candidate",
    "renderPolicy": "canon_detail_review_required",
    "eligibleSurfaces": [
      "role_card_review",
      "worldbook_review",
      "storydesk"
    ],
    "allowWhen": [
      "exact_canon_scope",
      "relevant_established_object_route_or_environment_change"
    ],
    "suppressWhen": [
      "ordinary_chat_default",
      "relationship_memory",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "A source-derived detail candidate only; it does not assert a current journey, object, home state, or shared experience.",
    "consumerPort": "character-canon-detail-review",
    "activationAuthority": "character_canon_review",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-canon-object-route-shift-detail-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-02cfae47d8f3cc283334",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-canon-object-route-shift-detail-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-07945284b8d6de4ad9d1",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-canon-object-route-shift-detail-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-07caf671e9654e34cc10",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-xiayizhou-scoped-canon-unexpected-effect-scene-v2",
    "charId": "builtin-caleb",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让一个意外效果、路径变化或临时限制打断原计划，再以即时调整、试探或新的去向推动画面。",
    "factStrength": "scoped_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_world_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_world_scope",
      "scene_has_unexpected_effect_or_route_shift"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A future ScenePlan mechanism only; it cannot state a present incident, journey, or completed action.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-canon-unexpected-effect-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-094656467f5469df817c",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-canon-unexpected-effect-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0959d6b81e27b27725c3",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-canon-unexpected-effect-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-31b7fb5d0083ab84184f",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-xiayizhou-scoped-relationship-ordinary-artifact-opening-v2",
    "charId": "builtin-caleb",
    "category": "B",
    "materialLane": "opening_recipe",
    "route": "proactive_opening",
    "guidance": "当 canonical thread 或外部日常物件已经建立时，可从它带来的一个下一步、替代用途或小安排切入，让回应自然地向前接。",
    "factStrength": "scope_gated_opening_recipe_not_fact",
    "renderPolicy": "canonical_thread_or_external_artifact_anchor_required",
    "eligibleSurfaces": [
      "proactive_letter",
      "call",
      "meet_scene",
      "date_scene"
    ],
    "allowWhen": [
      "canonical_thread_receipt_or_external_artifact_anchor",
      "concrete_semantic_match"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "generic_heartbeat",
      "reentry_without_receipt",
      "current_life_claim",
      "tool_context"
    ],
    "truthBoundary": "The object or prior arrangement must already be canonical. This recipe cannot create a domestic fact, shared plan, or current self-report.",
    "consumerPort": "proactive-opening-receipt-gate",
    "activationAuthority": "canonical_thread_or_artifact",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-relationship-ordinary-artifact-opening-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-08fc7526000a5b3cd1f4",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-relationship-ordinary-artifact-opening-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-0bb826817df961f29931",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-relationship-ordinary-artifact-opening-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-16b444834c935e333700",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-xiayizhou-scoped-relationship-arrangement-shift-scene-v2",
    "charId": "builtin-caleb",
    "category": "C",
    "materialLane": "scene_affordance",
    "route": "scene_texture",
    "guidance": "未来场景可让日常安排、携带物或路线细节轻轻偏离原计划，再由即时接话、替代方案或共同试探把行动推向新的方向。",
    "factStrength": "scope_gated_scene_affordance_candidate",
    "renderPolicy": "director_candidate_after_exact_relationship_or_thread_scope_review",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_exploring_scene",
      "exact_relationship_or_thread_scope",
      "scene_has_arrangement_or_route_shift"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "played_truth_claim",
      "embodied_scene_without_plan",
      "relationship_fact",
      "tool_context"
    ],
    "truthBoundary": "A scene possibility only; it cannot recover a private domestic fact or establish a played event.",
    "consumerPort": "scene-affordance-candidate",
    "activationAuthority": "director_scene_plan",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-relationship-arrangement-shift-scene-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-200ea4234ef26b1c21fd",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-relationship-arrangement-shift-scene-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-282c354189162c427eb5",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-xiayizhou-scoped-relationship-arrangement-shift-scene-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-293f473ea9db980de8f8",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 3
  },
  {
    "id": "reviewed-lishen-motive-followthrough-low-weight-v2",
    "charId": "builtin-zayne",
    "category": "B",
    "materialLane": "motive_candidate",
    "route": "proactive_opening",
    "guidance": "Director 可把一项已确认、尚未收束的具体问题视为低权重的后续理由之一，并让人物保留是否接住、如何接住的判断空间。",
    "factStrength": "multi_evidence_low_weight_director_candidate",
    "renderPolicy": "director_candidate_low_weight_pending_multibatch_adjudication",
    "eligibleSurfaces": [
      "storydesk",
      "meet_scene",
      "date_scene",
      "story_scene"
    ],
    "allowWhen": [
      "director_is_choosing_future_scene_reason",
      "canonical_thread_receipt",
      "concrete_unresolved_problem"
    ],
    "suppressWhen": [
      "ordinary_chat",
      "generic_heartbeat",
      "current_motive",
      "character_life_write",
      "tool_context"
    ],
    "truthBoundary": "A low-weight possible Director rationale only. It never becomes currentMotive, a promise, a memory fact, or a current self-report.",
    "consumerPort": "director-motive-candidate",
    "activationAuthority": "director_motive",
    "sourceRefs": [
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-motive-followthrough-low-weight-v2-evidence-1",
        "revision": 1,
        "sourceFingerprint": "lysk-src-175bc52a6af26773c861",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-motive-followthrough-low-weight-v2-evidence-2",
        "revision": 1,
        "sourceFingerprint": "lysk-src-2d971d4b01dc14ee1669",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-motive-followthrough-low-weight-v2-evidence-3",
        "revision": 1,
        "sourceFingerprint": "lysk-src-551b79fc2e519189a39d",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-motive-followthrough-low-weight-v2-evidence-4",
        "revision": 1,
        "sourceFingerprint": "lysk-src-5f75d4ea012678a219f4",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-motive-followthrough-low-weight-v2-evidence-5",
        "revision": 1,
        "sourceFingerprint": "lysk-src-7d62ec29de0463c54dc0",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      },
      {
        "storeFamily": "private_review",
        "recordId": "reviewed-lishen-motive-followthrough-low-weight-v2-evidence-6",
        "revision": 1,
        "sourceFingerprint": "lysk-src-e88f4a4029ae33870375",
        "sourcePackId": "lysk-all-leads-four-lane-v1"
      }
    ],
    "supportingSourceCount": 6
  }
] as const;

export const BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES:
readonly ReviewedCompanionMaterialCandidate[] = SPECS.map(spec => ({
  schemaVersion: REVIEWED_COMPANION_MATERIAL_CANDIDATE_SCHEMA_VERSION,
  status: 'reviewed_candidate',
  runtimeDelivery: 'forbidden_until_authorized_promotion',
  truthEffect: 'none',
  relationshipMemoryEffect: 'none',
  revision: 1,
  ...spec,
}));
