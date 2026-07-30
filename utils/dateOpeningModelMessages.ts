export interface DateOpeningModelMessage {
  role: 'system' | 'user';
  content: string;
}

export const buildDateOpeningModelMessages = (input: {
  characterName: string;
  coreContext: string;
  worldlineContext?: string;
  companionMaterialContext?: string;
  characterBehaviorBoundaryContext?: string;
  recentContext: string;
  timeText: string;
  gapHint?: string;
  experienceBoundary: string;
}): DateOpeningModelMessage[] => {
  const systemPrompt = [
    input.coreContext,
    input.worldlineContext,
    input.companionMaterialContext,
    input.characterBehaviorBoundaryContext,
  ].filter(Boolean).join('\n');
  const contextSeparator = input.gapHint
    ? `\n\n--- [TIME SKIP: ${input.gapHint}] ---\n\n`
    : '\n\n--- [NEW SCENE START] ---\n\n';
  const instructions = `
### 场景：感知 (Sense Presence)
当前时间: ${input.timeText}
时间上下文: ${input.gapHint || ''}

${input.experienceBoundary}

### 任务
你现在并不在和用户直接对话。请为用户设计一段可以进入的见面开场提案，并用**第三人称**描写一段话。
从可靠当前状态或最近 live 对话已经确认的线索起笔；如果没有这样的线索，就选一个不暗示具体工作、任务、伤病或等待经历的日常空间，让 ${input.characterName} 的动作与周围环境保持开放。

### 逻辑检查
1. **上下文连贯性**: 参考 [最近记录]，但**必须**注意 [TIME SKIP]。如果是很久没见，不要接着上一次的话题聊，而是开启新场景。
2. **状态一致性**: 时间间隔只表示镜头换场；角色的忙碌、落寞、等待或具体日程，需要来自可靠上文，而不是从“很久没见”自动推断。
3. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `[最近记录 (Previous Context)]:${input.recentContext}${contextSeparator}${instructions}\n\n(Start sensing...)`,
    },
  ];
};
