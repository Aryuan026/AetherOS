import type {
  WorldlineDeliveryProfile,
  WorldlineMemoryCandidate,
  WorldlineOpenThread,
} from './types';

const clip = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const formatCandidate = (candidate: WorldlineMemoryCandidate): string => {
  const date = candidate.happenedAt ? `${candidate.happenedAt} · ` : '';
  const scope = candidate.continuity === 'branch' ? '分支' : candidate.continuity === 'canon' ? '原作' : '关系';
  const temporal = candidate.temporalClass === 'historical' ? '旧日·' : '';
  return `- [${temporal}${scope}] ${date}${candidate.title}: ${clip(candidate.summary, 120)}`;
};

const formatThread = (thread: WorldlineOpenThread): string => (
  `- ${thread.title}: ${clip(thread.hint, 120)}`
);

export const formatWorldlinePromptBlock = (
  candidates: WorldlineMemoryCandidate[],
  openThreads: WorldlineOpenThread[],
  budgetChars: number,
  options?: {
    deliveryProfile?: WorldlineDeliveryProfile;
    hotStateMarkdown?: string;
    voiceCoreMarkdown?: string;
  },
): string => {
  const lines: string[] = [];

  if (options?.voiceCoreMarkdown?.trim()) {
    lines.push(options.voiceCoreMarkdown.trim());
  }

  if (options?.hotStateMarkdown?.trim()) {
    if (lines.length > 0) lines.push('');
    lines.push(options.hotStateMarkdown.trim());
  }

  const liveCandidates = candidates.filter(candidate => candidate.temporalClass !== 'historical');
  const historicalCandidates = candidates.filter(candidate => candidate.temporalClass === 'historical');

  if (liveCandidates.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('### 世界线交汇记忆');
    lines.push('以下是当前入口可自然参考的少量关系/剧情交汇点。不要逐条复述，只在对话需要时化成你的反应。');
    liveCandidates.forEach(candidate => lines.push(formatCandidate(candidate)));
  }

  if (historicalCandidates.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('### 旧日关系证据（不是当前状态）');
    lines.push('这些内容只帮助你接住已经形成的关系与旧剧情。旧伤、旧情绪、旧地点、当时说的“明天”和未完成约定都不代表现在仍成立；不得据此生成当前关怀、待办、生活状态或自动续演旧场景。');
    historicalCandidates.forEach(candidate => lines.push(formatCandidate(candidate)));
  }

  if (openThreads.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('### 未完成的回响');
    lines.push('这些是还可以继续接住的小线头。推进时要自然，不要像任务清单。');
    openThreads.forEach(thread => lines.push(formatThread(thread)));
  }

  const markdown = lines.join('\n').trim();
  if (!markdown) return '';
  return clip(markdown, budgetChars);
};
