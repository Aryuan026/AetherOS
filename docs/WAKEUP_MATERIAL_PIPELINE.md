# 主动来信素材管线

这份文档约束 `藏好的话`、`此刻的话`、`生活照看` 后续的素材采集和运行时接入。它先解决仓位、筛选、退场和公开分发边界，不急着把原文塞进主动来信。

## 目标

- 先全量抓取/整理公开短信目录，再筛选适合 AetherOS 的素材。
- 保留微小语言特征：小坚持、玩笑方式、照看习惯、拒绝边界、暧昧节奏。
- 不把公开原文台词整包提交到仓库或随静态网页分发。
- `藏好的话`、`此刻的话`、`生活照看` 是并行层，不是二选一。
- 台词必须有冷却和退场，避免被短期高频使用磨损。

## 三层保存

### 1. 原文缓存层

本地路径：

```text
research/lysk-raw/
research/lysk-sms-crawl/
```

用途：

- 保存网页 HTML、抓取状态、目录索引、未筛选原文。
- 仅供本地整理，不提交 git。
- 可以来自联网慢抓，也可以来自浏览器保存的 HTML。

### 2. 私有筛选层

本地路径：

```text
research/lysk-reviewed-private/
```

用途：

- 存放筛选中的候选项、简评、使用建议、风险标记。
- 可以包含短原文摘录或人工备注，所以默认也不提交 git。

### 3. 运行时种子层

未来公开仓只保存结构、安全摘要和用户自行导入入口。可发布内容应该是：

- 非逐字复刻的 `topic_seed`
- 归纳后的 `language_fingerprint`
- 用户私有导入的 `direct_message`
- 极少量合规的合成示例

## 素材单元

```ts
type WakeupMaterialUse =
  | 'direct_message'
  | 'topic_seed'
  | 'language_fingerprint'
  | 'discard';

type ConversationDirection =
  | 'character_opens'
  | 'user_opens'
  | 'branch_reply'
  | 'unknown';

interface WakeupMaterialCandidate {
  id: string;
  leadId: string;
  leadName: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourceCategory?: string;
  unlockHint?: string;
  conversationDirection: ConversationDirection;
  use: WakeupMaterialUse;
  screeningTier?: 'ready_seed' | 'rewrite_seed' | 'voice_only' | 'discard';
  sceneTags: string[];
  relationshipGate?: string;
  timeGate?: string;
  topicSeed?: string;
  voiceHints: string[];
  directLine?: string;
  rawTextRef?: string;
  sourceStatus: 'indexed' | 'cached_raw' | 'reviewed' | 'promoted' | 'blocked';
  riskFlags: string[];
  cooldownDays: number;
  maxUses: number;
  retireAfterUses?: number;
  retireAfterDays?: number;
}
```

字段含义：

- `direct_message`：能直接发出的短句，要求不依赖玩家上一句，不破坏关系阶段。默认只允许用户私有导入或合成句。
- `topic_seed`：可以变成主动话题的种子，不直接照搬原文。
- `language_fingerprint`：长期语气指纹，只进入角色声音核心，不作为消息发出。
- `discard`：太依赖原剧情分支、玩家先开口、过长、过官方剧情、容易误伤角色边界的内容。

筛选层级：

- `ready_seed`：男主先开口、短、无明显分支依赖，可以人工复核后作为主动话题。
- `rewrite_seed`：主题有价值，但原短信太长或含分支，只能重写成主动话题。
- `voice_only`：玩家先开口或更适合观察语气，只进入语言指纹。
- `discard`：不适合当前目标。

## 筛选规则

先筛掉：

- 玩家第一句才能成立的对话。
- 缺少上下文会显得突兀的剧情对白。
- 只服务某个限时活动、卡面剧情或强分支的台词。
- 过长、信息密度太大、像剧情讲解而不是来信的文本。
- 单独发出来会越界、太快推进关系或错置亲密度的文本。

优先保留：

- 男主自己的开场、主动关心、日常打岔、轻微调侃。
- 很短但能体现性格的小坚持。
- 能变成生活场景的钩子：天气、吃饭、睡眠、工作、训练、路过、看到某物。
- 能校正语气的句式：反问、停顿、称呼、绕弯、嘴硬、克制或直球方式。

## 退场和容量

20-40 条只作为第一轮烟测，不是仓库上限。主动来信会消耗很快，长期仓位应该按“可筛选的大池子 + 小密度递送”来设计。

建议初始容量：

- 每位男主目录索引：尽量全量。
- 每位男主第一轮可用候选：80-150 条。
- 每位男主第一轮直接来信：少量，优先 10-30 条以内。
- 每位男主语气指纹：20-50 条归纳项，长期可复用。

退场规则：

- `direct_message` 默认 `maxUses = 1`，至少冷却 60-120 天；被发出后记录 hash，避免原句反复出现。
- `topic_seed` 可多次使用，但同一主题需间隔更久，并生成不同表达。
- `language_fingerprint` 不退场，但每次递送只取少量，避免 prompt 变厚。
- 使用日志必须记录 `candidateId`、`sourceTitle`、`use`、`renderedHash`、`triggeredAt`。

## 并行运行目标

现状缺陷：运行时有一个全局 `defaultMode`，导致 `藏好的话` 和 `此刻的话` 实际上是二选一。

目标设置：

```ts
interface CompanionWakeupSettingsV2 {
  hiddenWordsEnabled: boolean;
  momentWordsEnabled: boolean;
  aiCareWindowsEnabled: boolean;
}
```

目标流程：

1. 规则触发后先判断安静时间、用户冷却、关系阶段和重复风险。
2. `生活照看` 独立判断，不被自然惦念模式影响。
3. `藏好的话` 可用时，从素材池选候选；候选可能是直接短句，也可能是重写种子。
4. `此刻的话` 可用时，在素材不足、关系状态更适合即兴、或用户刚经历特殊事件时补位。
5. 两者都开时，不是固定优先级，而是由素材可用性、冷却和场景密度决定。

## 采集顺序

1. 抓 BWiki 短信总目录和五位男主短信目录。
2. 缓存详情页或浏览器保存 HTML。
3. 只从详情页抽取结构和短候选，不在公开仓保存整段原文。
4. 输出候选表，先人工/AI筛选 `use`、方向、标签和风险。
5. 只把筛选后的非原文种子接入运行时。

## 本地脚本

目录索引：

```bash
node scripts/collect-lysk-sms-materials.mjs --from-dir research/lysk-raw/sms-index-pages
```

详情缓存：

```bash
node scripts/cache-lysk-sms-details.mjs --lead qiyu --limit 20 --delay-ms 3000
```

结构抽取：

```bash
node scripts/extract-lysk-sms-detail-signals.mjs
```

注意：

- `cache-lysk-sms-details.mjs` 默认通过 MediaWiki parse API 缓存详情页，并写入 `research/lysk-raw/sms-detail-pages/`。
- BWiki/EdgeOne 可能在短时间请求过多时返回安全拦截 HTML，而不是 JSON。脚本遇到拦截页会立即停止，避免把拦截页误当素材，也避免继续触发限流。
- 遇到连续失败时，不要硬重试；等待限流窗口过去后续跑即可。脚本会跳过已有缓存。
- 刚恢复时可以加 `--initial-delay-ms 60000 --delay-ms 8000`，先用小批量探针确认放行。
- 如果 API 通道受限，也可以用浏览器手动保存少量详情页，再运行结构抽取脚本。

## 当前相关代码

- `utils/companionWakeups.ts`：默认来信规则、设置、排程、直接短句选择。
- `hooks/useCompanionWakeupRuntime.ts`：触发、冷却、AI 生成、日志写入。
- `apps/Settings.tsx`：主动来信设置，已按并行开关理解 `藏好的话`、`此刻的话`、`生活照看`。
- `utils/chatParser.ts`：角色在聊天中写入照看窗口的后台指令。
- `utils/memoryCore/selector.ts`：未来主动来信需要共享的世界线记忆入口。
