export interface CompanionWakeupModelMessage {
  role: 'system' | 'user';
  content: string;
}

export const buildCompanionWakeupModelMessages = (input: {
  coreContext: string;
  worldlineContext?: string;
  realityContext?: string;
  companionMaterialContext?: string;
  characterBehaviorBoundaryContext?: string;
  interactionQualityContext?: string;
  timeText: string;
  userName?: string;
  ruleTitle: string;
  ruleValue?: string;
  visibleRecent: string;
}): CompanionWakeupModelMessage[] => {
  const baseContext = [
    input.coreContext,
    input.worldlineContext,
    input.realityContext,
    input.companionMaterialContext,
    input.characterBehaviorBoundaryContext,
    input.interactionQualityContext,
  ].filter(Boolean).join('\n\n');
  const systemPrompt = `${baseContext}

### 主动来信
现在是 ${input.timeText}。
你正在主动给 ${input.userName || '对方'} 发一条消息，不是回复刚刚的新消息。
触发意图：${input.ruleValue || input.ruleTitle}
规则标题：${input.ruleTitle}

输出要求：
- 只输出真正要发送的消息正文。
- 一到两句话，像手机聊天里自然发出的短消息；最多只用一次换行。
- 最近对话只用于判断语气，不要接续或回答用户刚刚说的话。
- 每次只发送这一条。是否提醒、表达担心、分享观察或保持简短，由角色卡、本轮意图和互动参考共同决定；照看类内容也保持一次发送的节奏。
- 从角色卡、本轮意图与可靠上下文中选择一个具体观察、偏好、生活小事或未完线索，让消息本身带着可回应的内容；也可以用一个真正有新角度的问题留出入口。
- 遵守现实同频规则。不要为了天气或时间强行越过世界边界。
- 不要解释规则，不要写时间戳，不要写“系统提示”。`;
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `最近对话片段：\n${input.visibleRecent}\n\n请按角色口吻写这次主动来信。`,
    },
  ];
};
