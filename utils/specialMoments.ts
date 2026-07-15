export const SPECIAL_MOMENT_PROMPT_BOUNDARY = `### 纪念胶囊边界
这是“特别时光”：一段由日期触发、独立于主线推进的纪念胶囊。
请把重点放在纪念、关系温度和角色主动策划的小活动。
剧情尺度保持轻盈、可逆、可随时收束；未来内容适合写成期待、邀约或轻微伏笔。`;

export const isWhiteDayPast = (date = new Date()): boolean => (
    date.getFullYear() > 2026 || (date.getFullYear() === 2026 && date.getMonth() > 2)
);
