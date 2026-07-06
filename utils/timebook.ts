import { Anniversary } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfLocalDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export const getDaysUntilTimebookDate = (dateStr: string): number => {
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(new Date(dateStr));
  return Math.ceil((target.getTime() - today.getTime()) / DAY_MS);
};

export const formatTimebookDistance = (dateStr: string): string => {
  const daysDiff = getDaysUntilTimebookDate(dateStr);
  if (daysDiff > 0) return `还有 ${daysDiff} 天`;
  if (daysDiff === 0) return '就是今天';
  return `已经过去 ${Math.abs(daysDiff)} 天了`;
};

export const sortTimebookAnniversaries = (anniversaries: Anniversary[]): Anniversary[] =>
  [...anniversaries].sort((a, b) => a.date.localeCompare(b.date));

export const getUpcomingAnniversary = (anniversaries: Anniversary[]): Anniversary | undefined =>
  sortTimebookAnniversaries(anniversaries).find(a => getDaysUntilTimebookDate(a.date) >= 0);

export const buildAnniversaryThoughtPrompt = (anniversary: Anniversary): string => `
### 场景：时光簿纪念日
事件: "${anniversary.title}"
时间状态: ${formatTimebookDistance(anniversary.date)}

### 任务
请根据你的人设，替这一天留下一小段像私下写进时光簿的回顾。它可以琐碎、亲密、带一点生活感，不要写成任务总结或系统说明。
**输出要求**:
- 仅输出一小段正文，不要标题。
- 2 到 4 个短句，120 字以内。
- **必须使用用户常用语言**。`;
