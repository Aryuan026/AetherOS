# Companion Material 向量召回与关系个性偏移

日期：2026-07-28

## 当前结论

现在不启用生产向量。

祁煜与黎深当前运行包各 10 条；沈星回、秦彻、夏以昼各有 1 条经过最终来源复核的
窄声音候选，共 23 条。经过 scope、surface、purpose、route、knowledge 与 cooldown
硬门后，一个入口实际只面对 0–7 条合法候选；信号、词面相关性和回执轮换已经足够。
此时增加 embedding 主要会引入模型文件、阈值、设备资源和版本漂移，收益很小。

386 条祁煜 / 黎深来源处置是 provenance 账，不是 386 条运行时材料。它们应先聚类成
少量非逐字 guidance；向量可以在私有工位辅助离线聚类与覆盖检查，但不能把来源账逐条
变成 Prompt 器官。

真正可能需要向量的是长期关系素材：同一
`progressBundleId + personaMaskId + charId` 下积累了大量不同说法、相似情境和模糊的
关系变化后，纯词面会漏掉“意思相近、字面不同”的召回。

## 何时进入 shadow

数量只是开门条件，不单独决定上线：

- exact relationship scope 的 active runtime material 达到约 80 条；
- 或每轮硬门后的 eligible 候选 p95 达到约 40 条；
- 或至少 20% 已标注正例没有 signal / lexical 命中；
- 或同一 variation group 超过 6–8 条并出现明显 top-1 错位与轮换抖动。

真正开启前至少需要：

- 100 个关系级标注 query、20 个独立 material clusters；
- hybrid recall@3 至少 90%，并比无向量提升至少 10 个百分点；
- known-positive miss 不高于 5%；
- low-signal / tool / no-advice false activation 为 0；
- scope、surface、knowledge、continuity、cooldown、truth gate 违规为 0；
- 索引失败或延迟超预算时自动回到 lexical。

建议性能基线不是产品真相，只是设备验收参考：桌面 query p95 小于 100ms，手机小于
250ms。第一次开启前必须展示本地模型下载、建索引时间、存储与电量成本。

## 索引不是真相

canonical source 是当前 active `CompanionMaterialRecord`。索引只包含这些记录的
`guidance + controlled retrieval tags` 投影，不包含 Word、TXT、日档原句、source URL
或私有短信原文。

最小 manifest：

```ts
interface CompanionMaterialVectorIndexManifest {
  schemaVersion: number;
  indexId: string;
  indexRevision: string;
  status: 'building' | 'ready' | 'invalid';
  scopeKey: string;
  ownerScope: 'character' | 'relationship';
  materialSetFingerprint: string;
  projectionVersion: string;
  model: {
    modelId: string;
    artifactDigest: string;
    dimensions: number;
    metric: 'cosine' | 'dot_product';
    normalized: boolean;
    preprocessVersion: string;
  };
  calibration: {
    revision: string;
    strongThreshold: number;
    topK: number;
  };
  entryCount: number;
  builtAt: number;
}
```

每个 entry 还须绑定 `materialId + recordRevision + contentHash`。模型文件、维度、metric、
projectionVersion 或 material set 改变时，一律建立新 revision；完成自检后原子切换
active pointer。中途失败保留旧 ready index 或回到 lexical，不迁移旧向量，也不要求
永远使用同一个 embedding 模型。

当前 `CompanionMaterialSemanticRank` 已要求：

- `manifestId + manifestDigest`；
- exact `scopeKey`；
- 当前 `materialSetFingerprint`；
- `modelId + modelArtifactDigest + dimensions + metric + normalized`；
- `projectionVersion + calibrationRevision + strongThreshold + indexRevision`。

请求中的全部绑定字段还必须逐项匹配 selector 另行接收的
`trusted_local_index_manifest` authority。任一不匹配或没有 authority，selector 都忽略
semantic rank。向量高分不能越过硬门；纯寒暄、工具请求和 no-advice 输入也不能靠高分
唤醒重素材。

未来 producer 必须从本机 active manifest 读取这些字段，同时向 selector 交付 rank 与
独立的 authority；导入文件、页面参数、模型回复或普通 UI 不能直接提交 `scores` 或伪造
authority。在可信 producer / manifest store 尚未实现前，运行时 adapter 不传 authority，
手写 `semanticRank` 会 fail closed，不能被当作已启用向量能力。

当前能力应写成：

```text
vector contract seam: available
local index producer/store/query: not implemented
runtime vector selection: disabled
lexical fallback: available
```

## 持续对话中的可接受个性偏移

角色本体与关系中的变化要分开：

```text
character-owned reviewed baseline
  + relationship-scoped historical overlay
  + relationship-scoped live candidate observations
  -> sparse current-turn selection
```

历史导入给出这段关系已经形成的表达范围；新对话只产生 candidate observation，不能一轮
就改 Prompt。未来第一阶段仅允许 `relationship-local style overlay`：

- 至少 3 个不同日期 / 会话；
- 至少 6–8 条明确由主角色说出的证据；
- 时间跨度至少约 7 天；
- confidence 至少 0.8；
- 通过去名、共同好行为、候选模板回声和表达变奏检查；
- 只描述“在这段关系里更常采用的表达范围”。

它可以形成 relationship-owned `stable_character_voice` revision；不能升为 character-owned
canon，也不能写 `stable_base`、current mood、current motive、Life state 或工具策略。
新 overlay 默认 `relevance_required`，普通 Chat 与 character baseline 合计仍最多递送
一条声音参考；同一 variation group 受 cooldown 与轮换约束。只有跨多类日常场景都成立、
而不是只在一次争执或一次撒娇里成立的高覆盖表达，才可另行复核是否成为这段关系的
voice fallback。这样“熟了以后更会这样说”能够出现，但不会把每轮都压成同一种亲密套路。

同一 cluster 的新证据形成新 revision；不同情境可以并存并带条件。同一情境出现直接冲突
时先 withheld，不把两条相反 guidance 同轮塞进 Prompt。玩家纠正、来源编辑或删除会使
旧 revision 失效，系统回退到上一版 overlay 或角色 baseline。另一面具完全隔离。

向量只帮助找到可能支持或反驳某个 cluster 的 evidence / material；它不能决定 promotion。
关闭向量不会丢失 canonical material，也不会撤销人工确认，只改变当轮候选排序方式。

## 正负验收

- 单日一次行为不会形成个性偏移；
- 跨 3 天、8 条一致且角色归属明确的证据可形成 relationship overlay；
- 两个面具各自形成不同 overlay，互不泄漏；
- 同情境矛盾证据 withheld 或显式分情境；
- source revision 变化使 material 与 index 同时 stale；
- 模型 v1 -> v2 构建中断时，v1 仍可用或 lexical 接管；
- “在吗”即使拿到 0.99 semantic score，也只允许合法 voice fallback；
- 无论置信度多高，都不能生成 canon、current state、current motive 或 allowed tools。
