# Companion Material 最终素材 artifact schema

这份 schema 是给总控编译器准备的交接边界，不是运行时 export。它把经过独立
语义裁决的素材结果与原始证据隔开：总控可以读取非逐字 guidance、surface、
审计提示和 opaque ref；原始短信仍只留在 ignored 的私有复核区。

```ts
type FinalMaterialStatus = 'active' | 'disabled' | 'withheld';

type FinalMaterialCluster = {
  id: string;
  leadId: string;
  status: FinalMaterialStatus;
  materialLane:
    | 'language_fingerprint'
    | 'language_fingerprint_revision_candidate'
    | 'stable_base'
    | 'stable_detail_claim'
    | 'opening_proactive_motive_candidate'
    | 'scene_affordance'
    | 'scoped_context';
  route: 'voice_calibration' | 'role_detail_claim' | 'proactive_opening' | 'scene_texture';
  eligibleSurfaces: string[];
  guidance: string; // non-verbatim; empty when withheld
  selectedEvidenceFingerprints: string[]; // opaque, exact character scope
  supportedSourceCount: number;
  audit: {
    allowWhen: string[];
    suppressWhen: string[];
    positivePath: string;
  };
  runtimeCompilation: {
    kind: string;
    delivered: false;
    // `character_owned_reviewed_baseline_candidate` is appropriate for
    // official, multi-source character evidence. A relationship-scoped style
    // overlay is reserved for a particular relationship's imported history.
    candidateRecordId?: string;
    activationPolicy?: 'voice_fallback' | 'relevance_required';
    createsRecord?: boolean;
    mutatesExistingRecord?: boolean;
    targetRecordIds?: string[];
  };
};

type FinalSourceDisposition = {
  sourceFingerprint: string;
  sourceGroupFingerprint: string;
  leadId: string;
  voicePartition: 'candidate_pool' | 'holdout' | string;
  finalDisposition:
    | 'published_reinforcement_only'
    | 'candidate_or_scope_gated'
    | 'withheld_pending_new_evidence_or_differentiation';
  primaryFinalClusterId: string;
  supportedFinalClusterIds: string[];
  primaryRoute: string;
  dispositionReason: string;
  // Candidate-pool sources can support a possible future compiler input;
  // holdout sources are reserved for evaluation and can never generate
  // guidance or be selected as evidence.
  candidateSupportFinalClusterIds?: string[];
  holdoutEvaluationFinalClusterIds?: string[];
};
```

## 编译规则

- `active` 只表示该 artifact 的裁决状态；它不等同于 runtime 已选中、API 已
  请求、回执已生成或角色已表现。编译器仍需执行 scope、surface、预算和
  receipt 规则。
- `existing_record_reinforcement` 只能给一个既有 record 提供 revision evidence；
  它不能自动生成第二条同义 prompt record，也不能静默改写既有 guidance。
- `disabled_revision_candidate` 需要显式批准后才能替换目标 record；这次不能
  写入运行时。
- `opening_proactive_motive_candidate` 必须在对应入口和 canonical Life receipt
  已存在时才可考虑。它永远不是 ordinary Chat 的默认文字，也不是
  `currentMotive`。
- `stable_detail_claim` 只在相关场景按需取用；它不是 relationship memory、
  共同经历或当前生活事实。`scene_affordance` 只是未来 ScenePlan 的候选纹理，
  不是 played truth。
- `withheld` 保留来源和复核理由，不应被 selector、prompt projection 或任何
  runtime consumer 导出。care/discomfort 必须先单独通过 shared-solution
  differentiation，才能从 withheld 移动。
- 官方角色短信中通过多 source-group、去名与 holdout 门禁的窄语言指纹，应当
  以 `character_owned_reviewed_baseline_candidate` 交给未来内置角色编译；它仍须
  relevance gate、surface/scope 和 delivery receipt，不能因为 character-owned
  就变成常驻 lore。`relationship_scoped_style_overlay` 只描述某一关系的历史导入
  偏移，不能代替官方角色基线。
- `voicePartition: holdout` 的来源只能出现在 holdout/evaluation 绑定中，不能
  进入 `selectedEvidenceFingerprints` 或候选 guidance 的归纳。candidate-pool 中
  未被选中的重复来源可以增强未来复核，但不能因为数量而自动升级状态。

## 隐私与 authority

artifact 不可带入原句、标题、URL、文件路径、关系真相、当下动机、工具策略或
固定台词。每个 selected ref 必须是实际审过的 opaque evidence subset；重复来源
只增强 `supportedSourceCount`，不制造同义 fragment。高 authority 人设卡若与
素材冲突，必须通过显式 supersession/revision 替换，而不能叠加冲突 guidance。
