# 一幕剧情生命周期与小说耐久写入

这是一只底层合同盒，不新增虚拟 App，也不决定剧情内容。

## 一幕剧情的三个明确动作

1. `openAcceptedNarrativeScene` 只把玩家已经接受的 scene shell 放进当前 active run，并创建 `active` 的 `NarrativeScene`。
2. `finishActiveNarrativeScene` 只在这一幕已经产生至少一条 beat 后将它标记为 `played`，不会生成事实回执。
3. `confirmPlayedNarrativeScene` 只在玩家明确确认后生成 canonical `NarrativeExperienceReceipt`，线路、分支、角色和发生时间都从当前 run/scene 派生，不信任调用方重复填写的连续性字段。

小说编辑器中的 `chapter_summary` 仍然只是稿件内容，不是“这件事已经发生”的证明。这个盒子不调用模型，不写世界书，也不写记忆；后续世界生长只能消费真正的玩家确认回执。

## 小说保存的耐久边界

- `DB.saveNovel` 与 `DB.deleteNovel` 只在 IndexedDB transaction `complete` 后成功；`error` 或 `abort` 都会拒绝 Promise。
- `updateNovel` 的连续 patch 按同一本小说串行。后一笔以此前已经成功落库并发布的版本为基底，不会把前一笔静默覆盖。
- React state 只在 durable save 成功后改变。保存失败会原样保留页面状态，并把真实错误交给调用方；失败不会堵死下一次编辑。
- 新增和删除同样先完成持久化，再发布本地 state。

## 当前玩家链路

笔友会已经在真实页面接入这三个动作：

1. 玩家在“故事线”准备并接受下一幕；
2. 这一幕的正文只在“手稿”中形成，并按 `narrativeSceneId` 归属；
3. 玩家点“结束这一幕”后进入全屏经历复核，最后明确确认才生成回执。

系统主持可以协助整理开场与经历摘要，但模型输出始终只是可编辑草稿。`chapter_summary`、AI 草稿和未确认正文都不能绕过玩家确认。确认后的世界变化仍要作为待审候选进入世界书；它不会在这里自动成为世界事实或角色记忆。
