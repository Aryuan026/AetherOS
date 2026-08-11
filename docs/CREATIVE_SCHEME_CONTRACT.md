# CreativeScheme Contract

## Player Mental Model

`创作方案`回答的是“这一次怎样写”，不是“这个世界发生过什么”。玩家可以：

- 直接使用只读的内置 `梦世界`；
- 把内置方案中的某一条复制到自己的方案再修改；
- 新建自己的方案；
- 导入只含文本提示模块的外部 JSON，并在本机继续整理；
- 为所有角色设置一个明确可见的通用方案，也可让单个角色整组改用不同方案。角色
  取消单独选择后回到通用方案；两套完整方案不叠加。

一个方案本身就是一组，方案里的模块就是组内条目；不在方案外再套一层空文件夹。
导入一个文件会新增一组。整组可以归档、恢复或在归档中彻底删除。

方案库沿用世界书已经验证过的纵向抽屉管理：每组占一行，展开后再查看、启停或编辑
组内条目；导入入口也使用同一枚低调的本机导入图标。玩家可以置顶方案组，并通过
拖动手柄调整组间顺序；顺序和置顶状态写入本机设置，刷新后仍然保留。这里不使用
适合少量内容的双列卡片，因为导入和自建方案都可能持续增长。

长方案的条目默认折叠，只显示紧凑标题、实际递送次序、启用状态与管理按钮，展开
单条后才渲染正文。分类栏只帮助玩家整理和查找，不参与模型编译；编译始终按
`module.order` 的全局次序。玩家可以拖动同一分类内的条目，系统会在保留其他分类
相对位置的同时写入一版新的真实递送顺序。

第一次使用、没有保存设置或角色没有单独指定时，统一使用 `梦世界`。删除正在使用的自建方案时，受影响的默认选择和角色选择会明确回到 `梦世界`。
归档会在同一笔本机事务里解除该组的默认与角色绑定；恢复只把组放回方案库，不会
擅自恢复旧绑定。

## Ownership Boundaries

CreativeScheme 只拥有创作方法、叙事姿态、文体、演绎原则、输出规范和模型参数提示。它不拥有也不能改写：

- 角色卡、人物事实、关系事实与历史记忆；
- Worldbook 的世界事实、知情范围、挂载关系与故事生长结果；
- Narrative 当前路线、当前场景、已确认经历与当前动机；
- 系统安全边界、本机数据权限、工具权限与供应商策略。

模型可见的方案头会明确说明这一边界。系统边界在玩家页面单独展示，不能由导入方案覆盖，也不是隐藏的方案条目。

## Stored Records

IndexedDB store: `creative_schemes`

```ts
type CreativeSchemeStoreRecord = CreativeScheme | CreativeSchemeSettings;

interface CreativeScheme {
  kind: 'scheme';
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  source: 'player' | 'imported';
  lifecycle?: 'active' | 'archived';
  archivedAt?: number;
  activeRevisionId: string;
  revisions: CreativeSchemeRevision[];
  createdAt: number;
  updatedAt: number;
  importedFrom?: string;
}

interface CreativeSchemeSettings {
  kind: 'settings';
  schemaVersion: 1;
  id: 'creative-scheme-settings';
  defaultSchemeId: string;
  characterSchemeIds: Record<string, string>;
  schemeOrderIds?: string[];
  pinnedSchemeIds?: string[];
  updatedAt: number;
}
```

方案修改会追加不可变 revision；角色绑定只保存 scheme ID。排序和置顶只影响玩家
看到的方案库布局，不改变运行时启用关系。当前 revision 才参与下一次生成，旧 revision
继续为已经生成的作品提供可追溯依据。归档组不能参与编译，彻底删除只能发生在归档中。
store 已进入整机备份与恢复清单。

## Built-in Dreamworld

`梦世界`是代码拥有的只读基线，不复制整包正文给玩家。内置版已经从早期 6 条摘要
补齐为 20 个职责清楚的模块，覆盖共同创作、人物内核、独立生活、空白补完、因果与
时间连续、主动破局、冲突停留、关系演进、主观记忆、日常质感、惊喜、善意坚持、
物理与亲密动作连续、自然语言、反模板，以及聊天 / 见面 / 故事 / 纯小说的交付形态。
旧文件里已经由 AetherOS 代码拥有的记忆写入、时间注入与隐藏思考格式不重复塞回
方案；关闭的外置格式插件和越界指令也不冒充默认创作方法。

这套基线不预设玩家与角色必须相爱，也不把冲突写成关系失败。它提供的是更宽的可行动空间，不是禁令列表。

## Import Boundary

第一版导入只读取 JSON 中的文本 `prompts` 与 `prompt_order`：

- 只导入确实有文本内容的提示模块；
- 按启用状态和顺序生成可编辑 revision；
- 可读取有界的 `temperature` / `top_p` 作为模型提示；
- 不执行脚本、正则、快捷回复、命令、工具调用或其他自动化；
- 文件不是文本提示方案时明确失败并保持零写入。

导入只是把外部文本变成本机可审阅的新方案组，不赋予其中内容更高的事实权威。

## First Runtime Consumer

第一位真实消费者是 `笔友会 -> 纯小说`。每轮生成的稳定顺序是：

1. CreativeScheme 创作方法；
2. 当前书稿与角色资料；
3. 本轮写作要求与场景；
4. typed Worldbook projection；
5. 已确认故事状态；
6. 最近正文和本轮请求。

方案不与 Worldbook 双写，也不把角色性格当成小说温度。纯小说使用方案的模型提示；角色共创仍使用原有角色协作逻辑。

模型返回可用正文并且正文成功持久化后，同一 `NovelSegment.meta` 才记录：

```ts
interface CreativeSchemeDeliveryRef {
  schemeId: string;
  revisionId: string;
  moduleIds: string[];
  renderedHash: string;
}
```

失败、空输出或正文没有落库时，不伪造递送回执。

## Held Consumers

Chat、Date、主线、IF、小阁楼、系统主持的方案分析、成人或敏感内容的专项字段、供应商缓存优化都仍是后续独立盒。类型里预留 surface 不等于这些入口已经接入；每个入口必须另行确认 owner、上下文顺序、预算与回执时机。
