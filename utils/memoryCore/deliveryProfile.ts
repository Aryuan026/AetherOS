import type { WorldlineDeliveryProfile, WorldlinePromptMode } from './types';

const DEFAULT_BUDGET = 1200;

const normalize = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

export const extractMemorySearchTerms = (value: unknown): string[] => {
  const text = normalize(value).toLowerCase();
  if (!text) return [];

  const terms = new Set<string>();
  const asciiWords = text.match(/[a-z0-9_]{2,}/gi) || [];
  asciiWords.forEach(word => terms.add(word.toLowerCase()));

  const chineseRuns = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  chineseRuns.forEach(run => {
    if (run.length <= 6) terms.add(run);
    for (let i = 0; i < run.length - 1; i += 1) {
      terms.add(run.slice(i, i + 2));
    }
    for (let i = 0; i < run.length - 2; i += 1) {
      terms.add(run.slice(i, i + 3));
    }
  });

  return [...terms].filter(term => term.length >= 2).slice(0, 48);
};

const baseProfile = (
  mode: WorldlinePromptMode,
  budgetChars: number,
): WorldlineDeliveryProfile => ({
  tier: mode === 'proactive_letter' ? 'heartbeat_lite' : 'affective_warm',
  reasons: [],
  budgetChars,
  candidateLimit: mode === 'proactive_letter' ? 3 : 4,
  openThreadLimit: mode === 'timebook' ? 1 : 2,
  includeHotState: mode !== 'timebook',
  includeVoiceFingerprint: true,
  includeRewriteSeeds: mode === 'meet_scene' || mode === 'date_scene' || mode === 'proactive_letter' || mode === 'call',
  includeDirectLines: mode === 'proactive_letter',
  includeStorySeeds: mode === 'meet_scene' || mode === 'date_scene',
});

export const classifyWorldlineDelivery = (params: {
  mode: WorldlinePromptMode;
  query?: string;
  budgetChars?: number;
}): WorldlineDeliveryProfile => {
  const text = normalize(params.query);
  const mode = params.mode;
  const profile = baseProfile(mode, params.budgetChars || DEFAULT_BUDGET);
  const lowInfo = text.length <= 4 || /^(嗯+|啊+|哈+|哈哈+|好+|宝宝|晚安|早安|在吗|想你|亲亲)$/i.test(text);

  if (mode === 'timebook') {
    profile.tier = 'focused_recall';
    profile.reasons.push('timebook_surface');
    profile.candidateLimit = 3;
    profile.openThreadLimit = 0;
    profile.includeHotState = false;
    profile.includeRewriteSeeds = false;
    profile.includeDirectLines = false;
  } else if (mode === 'proactive_letter') {
    profile.tier = 'heartbeat_lite';
    profile.reasons.push('proactive_letter');
    profile.candidateLimit = 3;
    profile.openThreadLimit = 2;
  } else if (mode === 'call') {
    profile.tier = lowInfo ? 'heartbeat_lite' : 'affective_warm';
    profile.reasons.push('call_surface');
    profile.candidateLimit = lowInfo ? 2 : 4;
    profile.openThreadLimit = 2;
  }

  if (has(text, /记得|还记|上次|那天|以前|之前|什么时候|第一次|初次|纪念|生日|约定|说好|忘了|回忆|想起来|想起/i)) {
    profile.tier = 'focused_recall';
    profile.reasons.push('explicit_recall');
    profile.candidateLimit = Math.max(profile.candidateLimit, 5);
    profile.openThreadLimit = Math.max(profile.openThreadLimit, 2);
  }

  if (has(text, /剧情|主线|支线|任务|世界线|原作|约会|见面|故事|线索|朋友圈|资讯站|咨询台|传闻|小道消息/i)) {
    profile.tier = 'story_branch';
    profile.reasons.push('story_or_branch');
    profile.candidateLimit = Math.max(profile.candidateLimit, 5);
    profile.includeStorySeeds = true;
    profile.includeRewriteSeeds = true;
  }

  if (has(text, /难过|委屈|害怕|焦虑|崩溃|失眠|想哭|生气|不安|累|撑不住|喜欢你|想你|抱抱|亲|撒娇/i)) {
    if (profile.tier !== 'focused_recall' && profile.tier !== 'story_branch') {
      profile.tier = 'affective_warm';
    }
    profile.reasons.push('affective_signal');
    profile.candidateLimit = Math.max(profile.candidateLimit, 4);
  }

  if (lowInfo && profile.tier === 'affective_warm') {
    profile.tier = 'heartbeat_lite';
    profile.reasons.push('low_context');
    profile.candidateLimit = Math.min(profile.candidateLimit, 3);
  }

  if (has(text, /调试|全部|完整|为什么|怎么回事|检查|复核|测试|记忆回声/i)) {
    profile.tier = 'full_diagnostic';
    profile.reasons.push('diagnostic');
    profile.candidateLimit = 6;
    profile.openThreadLimit = 3;
  }

  const tierBudget: Record<WorldlineDeliveryProfile['tier'], number> = {
    resident_only: 600,
    heartbeat_lite: 900,
    affective_warm: 1200,
    focused_recall: 1500,
    story_branch: 1600,
    full_diagnostic: 1800,
  };

  profile.budgetChars = Math.min(params.budgetChars || DEFAULT_BUDGET, tierBudget[profile.tier]);
  if (!profile.reasons.length) profile.reasons.push('default');
  return profile;
};
