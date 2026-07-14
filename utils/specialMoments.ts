export const SPECIAL_MOMENT_PROMPT_BOUNDARY = `### 纪念胶囊边界
这是“特别时光”：一段由日期触发的纪念胶囊，而不是主线剧情推进。
请把重点放在纪念、关系温度和角色主动策划的小活动。
不要主动制造主线级危机、不可逆转折、NPC死亡或强制任务；如果提到未来，也只作为温柔期待或轻微伏笔。`;

export const isWhiteDayPast = (date = new Date()): boolean => (
    date.getFullYear() > 2026 || (date.getFullYear() === 2026 && date.getMonth() > 2)
);
