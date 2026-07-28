import type {
  CompanionMaterialRecord,
  CompanionMaterialSelectionRequest,
} from './types.ts';

const normalizeText = (value: unknown): string => (
  String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
);

export const normalizeCompanionMaterialSignal = (value: unknown): string => (
  normalizeText(value).replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
);

const PHATIC_PATTERNS = [
  /^(?:嗨|你好|在吗|在不在|早|早安|晚安|哈喽|hello|hi|嗯+|哦+|啊+|好+|okk?)[呀啊嘛吗呢～~！!。.\s]*$/i,
];

const TECHNICAL_META_PATTERNS = [
  /(?:代码|编程|bug|报错|服务器|部署|github|仓库|浏览器|api|token|模型|prompt|向量|embedding)/i,
];

const NO_ADVICE_CHAT_PATTERNS = [
  /(?:不想|不要|不用|别).{0,8}(?:建议|分析|解决|办法|指导)/i,
  /(?:只想|就想).{0,6}(?:聊聊|聊天|说说话|听你说)/i,
];

const TOOL_REQUEST_PATTERNS = [
  /(?:提醒我|到时叫我|帮我.{0,24}(?:提醒|日程|备忘|闹钟)|(?:设(?:置)?|定).{0,18}(?:闹钟|提醒)|(?:加到|放进|记到)(?:日程|备忘))/i,
];

const UNDERSPECIFIED_PATTERNS = [
  /^(?:这个|那个|这事|那事|这样|那样|然后呢|后来呢|还行|也行|继续|接着|算了|不了)[呀啊嘛吗呢～~！!。.\s]*$/i,
];

const SIGNAL_PATTERNS: ReadonlyArray<{
  signal: string;
  patterns: readonly RegExp[];
}> = [
  {
    signal: 'mild_discomfort',
    patterns: [/(?:有点|稍微|今天|最近)?.{0,6}(?:不舒服|难受|头疼|头痛|胃疼|胃痛|腰疼|腰痛|困|累|失眠|睡不好|发烧|受伤|崩了)/i],
  },
  {
    signal: 'care_needed',
    patterns: [/(?:不舒服|难受|疼|痛|发烧|受伤|失眠|睡不好|没吃|忘了吃|累坏|崩了)/i],
  },
  {
    signal: 'refusal',
    patterns: [
      /(?:不去了|不去啦|不去吧|不想去|去不了|不了吧|下次吧|改天吧|算了吧|没空|不方便|先不约|拒绝)/i,
      /(?:^|[，,。\s])不了(?:[，,。\s]|$)|(?:想|要).{0,4}(?:一个人|独处|自己待)/i,
    ],
  },
  {
    signal: 'reentry',
    patterns: [/(?:好久不见|我回来了|回来啦|刚回来|消失了几天|几天没来|很久没聊|最近没出现|前阵子没来)/i],
  },
  {
    signal: 'light_scene',
    patterns: [/[（(][^）)]{1,120}[）)]|(?:转过头|拉住|抬眼|靠近|走到|看向|抱住|松开)/i],
  },
  {
    signal: 'character_self_share',
    patterns: [/(?:你在干嘛|你在做什么|你今天(?:在)?忙什么|你今天(?:都|自己)?做了什么|说说你今天|你最近怎么样|你那边|你今天过得|讲讲你的|你有没有什么想说|你也说说)/i],
  },
  {
    signal: 'independent_life',
    patterns: [/(?:你在干嘛|你在做什么|你今天(?:在)?忙什么|你今天(?:都|自己)?做了什么|说说你今天|你最近怎么样|你那边|你的生活|你的工作|你的安排)/i],
  },
  {
    signal: 'observation',
    patterns: [/(?:我看到|刚看到|发现|碰见|路过|照片|云|雨|天气|颜色|光|味道|声音|猫|狗|花|小东西)/i],
  },
  {
    signal: 'sensory_detail',
    patterns: [/(?:颜色|光|味道|声音|触感|天气|云|雨|风|香|亮|暗)/i],
  },
  {
    signal: 'humor',
    patterns: [/(?:哈哈|笑死|好笑|搞笑|离谱|绷不住|hhh|lol)/i],
  },
  {
    signal: 'practical_next_step',
    patterns: [/(?:怎么办|怎么弄|怎么处理|下一步|帮我(?:想想|看看)|先做哪个|给个办法|如何|理清(?:条件|顺序|安排)|梳理(?:条件|顺序|安排)|安排(?:冲突|撞在一起))/i],
  },
  {
    signal: 'playful_premise',
    patterns: [/(?:假装|设定一个|定个规则|小游戏|比赛一下|打个赌|谁赢|输赢|挑战一下|来挑战|角色扮演)/i],
  },
  {
    signal: 'choice_tradeoff',
    patterns: [/(?:二选一|选哪个|哪个更好|哪种更好|两个方案|方案\s*[a-z甲乙一二]|取舍|代价|值不值|划不划算)/i],
  },
  {
    signal: 'emotional_weight',
    patterns: [/(?:难过|委屈|害怕|焦虑|不安|生气|失望|想哭|烦死|很烦|撑不住)/i],
  },
];

const TOKEN_STOP = new Set([
  '这个', '那个', '这些', '那些', '今天', '现在', '然后', '已经', '可以', '还是',
  '什么', '怎么', '为什么', '一个', '一点', '有点', '就是', '觉得', '感觉',
  '我在', '我的', '你在', '你的', '我们', '你们', '他们', '她们',
]);

const cjkTerms = (text: string): string[] => {
  const terms = new Set<string>();
  for (const run of text.match(/[\u3400-\u9fff]{2,}/g) || []) {
    if (run.length <= 5 && !TOKEN_STOP.has(run)) terms.add(run);
    for (let width = 2; width <= 3; width += 1) {
      for (let index = 0; index <= run.length - width; index += 1) {
        const token = run.slice(index, index + width);
        if (!TOKEN_STOP.has(token)) terms.add(token);
      }
    }
  }
  return [...terms];
};

export const tokenizeCompanionMaterialText = (value: unknown): string[] => {
  const text = normalizeText(value);
  const terms = new Set<string>();
  (text.match(/[a-z0-9_:-]{2,}/gi) || []).forEach(term => terms.add(term.toLowerCase()));
  cjkTerms(text).forEach(term => terms.add(term));
  return [...terms].slice(0, 96);
};

const shouldUsePreviousQuery = (query: string): boolean => (
  query.length > 0
  && query.length <= 28
  && UNDERSPECIFIED_PATTERNS.some(pattern => pattern.test(query))
);

export interface CompanionMaterialQueryFeatures {
  normalizedQuery: string;
  recallQuery: string;
  signals: readonly string[];
  terms: readonly string[];
  phatic: boolean;
  technicalMeta: boolean;
  usedPreviousQuery: boolean;
}

export const analyzeCompanionMaterialQuery = (params: {
  query?: string;
  previousQuery?: string;
  semanticTags?: readonly string[];
  surface?: string;
  mode?: string;
  purpose?: string;
}): CompanionMaterialQueryFeatures => {
  const normalizedQuery = normalizeText(params.query);
  const previousQuery = normalizeText(params.previousQuery);
  const phatic = !normalizedQuery || PHATIC_PATTERNS.some(pattern => pattern.test(normalizedQuery));
  const technicalMeta = TECHNICAL_META_PATTERNS.some(pattern => pattern.test(normalizedQuery));
  const noAdviceChat = NO_ADVICE_CHAT_PATTERNS.some(pattern => pattern.test(normalizedQuery));
  const toolRequest = TOOL_REQUEST_PATTERNS.some(pattern => pattern.test(normalizedQuery));
  const usedPreviousQuery = Boolean(previousQuery && shouldUsePreviousQuery(normalizedQuery));
  const recallQuery = usedPreviousQuery
    ? `${normalizedQuery} ${previousQuery}`.trim()
    : normalizedQuery;
  const signals = new Set<string>();

  for (const raw of params.semanticTags || []) {
    const signal = normalizeCompanionMaterialSignal(raw);
    if (signal) signals.add(signal);
  }
  for (const raw of [params.surface, params.mode, params.purpose]) {
    const signal = normalizeCompanionMaterialSignal(raw);
    if (signal) signals.add(signal);
  }
  for (const group of SIGNAL_PATTERNS) {
    if (group.patterns.some(pattern => pattern.test(recallQuery))) signals.add(group.signal);
  }
  if (phatic) signals.add('low_signal');
  else signals.add('ordinary_share');
  if (technicalMeta) signals.add('technical_meta');
  if (noAdviceChat) signals.add('no_advice_chat');
  if (toolRequest) signals.add('tool_request');

  return {
    normalizedQuery,
    recallQuery,
    signals: [...signals],
    terms: tokenizeCompanionMaterialText(recallQuery),
    phatic,
    technicalMeta,
    usedPreviousQuery,
  };
};

const intersectionSize = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  let hits = 0;
  left.forEach(item => {
    if (right.has(item)) hits += 1;
  });
  return hits;
};

export const companionMaterialLexicalSimilarity = (
  features: Pick<CompanionMaterialQueryFeatures, 'terms'>,
  record: Pick<CompanionMaterialRecord, 'guidance' | 'tags'>,
): number => {
  if (!features.terms.length) return 0;
  const query = new Set(features.terms);
  const material = new Set(tokenizeCompanionMaterialText(`${record.guidance} ${record.tags.join(' ')}`));
  if (!material.size) return 0;
  const hits = intersectionSize(query, material);
  return hits <= 0 ? 0 : (2 * hits) / (query.size + material.size);
};

export const queryFeaturesForCompanionMaterialRequest = (
  request: CompanionMaterialSelectionRequest,
): CompanionMaterialQueryFeatures => analyzeCompanionMaterialQuery({
  query: request.query,
  previousQuery: request.previousQuery,
  semanticTags: request.semanticTags || request.contextTags,
  surface: request.surface,
  mode: request.mode,
  purpose: request.purpose,
});
