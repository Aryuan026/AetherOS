import {
  analyzeCompanionMaterialQuery,
  type CompanionMaterialQueryFeatures,
} from './retrieval.ts';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
} from './builtInDeepspaceReviewed.ts';
import type {
  CompanionMaterialMode,
  CompanionMaterialPurpose,
  CompanionMaterialSurface,
} from './types.ts';

export const COMPANION_INTERACTION_QUALITY_SCHEMA_VERSION = 1 as const;
export const COMPANION_INTERACTION_QUALITY_ADJACENT_WINDOW_MS = 30 * 60 * 1000;

export type CompanionInteractionQualityId =
  | 'agency_and_refusal'
  | 'care_without_control'
  | 'pause_and_reentry'
  | 'conversational_agency';

export interface CompanionInteractionQualityEvidenceSummary {
  sourceGroupCountByCharacter: Readonly<Record<string, number>>;
  authority: 'reviewed_private_sms_support_network' | 'owner_reviewed_conversation_method';
}

export interface CompanionInteractionQualityPrinciple {
  id: CompanionInteractionQualityId;
  positiveOperator: string;
  eligibleSignals: readonly string[];
  applicableSurfaces: readonly CompanionMaterialSurface[];
  evidence: CompanionInteractionQualityEvidenceSummary;
}

export interface CompanionInteractionQualityRealization {
  charId: string;
  byQualityId: Readonly<Record<CompanionInteractionQualityId, string>>;
  distinctiveness: string;
  evidenceSourceGroupCount: number;
  authority: 'reviewed_private_sms_support_network';
}

export interface CompanionInteractionQualityProjection {
  schemaVersion: typeof COMPANION_INTERACTION_QUALITY_SCHEMA_VERSION;
  qualityId: CompanionInteractionQualityId;
  charId: string;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  matchedSignals: readonly string[];
  sharedPrinciple: string;
  characterRealization?: string;
  characterRealizationId?: string;
  renderedHash: string;
  markdown: string;
  truthEffect: 'none';
  toolPolicyEffect: 'none';
  currentStateEffect: 'none';
}

export interface CompanionInteractionQualityRequest {
  charId: string;
  query?: string;
  previousQuery?: string;
  occurredAt?: number;
  previousOccurredAt?: number;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  /**
   * Code-owned live/runtime signals such as a confirmed care wakeup. These
   * select a quality operator only; they never establish a relationship fact.
   */
  explicitSignals?: readonly string[];
}

const DELIVERED_RELATIONAL_SURFACES: readonly CompanionMaterialSurface[] = [
  'chat',
  'call',
  'date',
  'proactive_letter',
];

const LIVE_CONVERSATION_SURFACES: readonly CompanionMaterialSurface[] = [
  'chat',
  'call',
];

/**
 * One product-level baseline, supported across all five reviewed leads. It is
 * deliberately not copied into five character fingerprints.
 */
export const COMPANION_INTERACTION_QUALITY_PRINCIPLES:
readonly CompanionInteractionQualityPrinciple[] = [
  {
    id: 'agency_and_refusal',
    positiveOperator: '把对方明确表达的选择、偏好或边界作为本轮已经成立的信息，让它实际改变回应的力度和方向。角色保有自己的判断、立场与温度；继续、停住、转题或提出另一条真正不同的话题，都由现场决定。',
    eligibleSignals: ['refusal', 'no_advice_chat'],
    applicableSurfaces: DELIVERED_RELATIONAL_SURFACES,
    evidence: {
      sourceGroupCountByCharacter: {
        [BUILT_IN_DEEPSPACE_QIYU_ID]: 6,
        [BUILT_IN_DEEPSPACE_LISHEN_ID]: 6,
        [BUILT_IN_DEEPSPACE_SHENXINGHUI_ID]: 4,
        [BUILT_IN_DEEPSPACE_QINCHE_ID]: 9,
        [BUILT_IN_DEEPSPACE_XIAYIZHOU_ID]: 3,
      },
      authority: 'reviewed_private_sms_support_network',
    },
  },
  {
    id: 'care_without_control',
    positiveOperator: '轻微不适只是此刻的一项信息。角色可以确认需要、表达担心、陪着停一停、继续原话题、用合适的趣味缓冲，或递出一项可调整的帮助；对方保有节奏与决定权，角色也保有真实判断和主动性。',
    eligibleSignals: ['mild_discomfort', 'care_needed'],
    applicableSurfaces: DELIVERED_RELATIONAL_SURFACES,
    evidence: {
      sourceGroupCountByCharacter: {
        [BUILT_IN_DEEPSPACE_QIYU_ID]: 6,
        [BUILT_IN_DEEPSPACE_LISHEN_ID]: 5,
        [BUILT_IN_DEEPSPACE_SHENXINGHUI_ID]: 2,
        [BUILT_IN_DEEPSPACE_QINCHE_ID]: 19,
        [BUILT_IN_DEEPSPACE_XIAYIZHOU_ID]: 2,
      },
      authority: 'reviewed_private_sms_support_network',
    },
  },
  {
    id: 'pause_and_reentry',
    positiveOperator: '用户要求暂停时让对话先停；明确转题时进入新的话题；用户重新出现时，再从新的眼前线索接起。间隔保持为一段留白，角色可以带着自己的节奏重新出现。',
    eligibleSignals: ['pause_or_redirect', 'reentry'],
    applicableSurfaces: DELIVERED_RELATIONAL_SURFACES,
    evidence: {
      sourceGroupCountByCharacter: {
        [BUILT_IN_DEEPSPACE_QIYU_ID]: 46,
        [BUILT_IN_DEEPSPACE_LISHEN_ID]: 58,
        [BUILT_IN_DEEPSPACE_SHENXINGHUI_ID]: 30,
        [BUILT_IN_DEEPSPACE_QINCHE_ID]: 26,
        [BUILT_IN_DEEPSPACE_XIAYIZHOU_ID]: 35,
      },
      authority: 'reviewed_private_sms_support_network',
    },
  },
  {
    id: 'conversational_agency',
    positiveOperator: '当对方只留下很短的回应或话题暂时变薄时，角色可以从自己的观察、偏好、生活片段或一条未完线索里带入一个具体侧枝。陈述、判断、玩笑、分享与留白都可以成为继续方式，让回应自身带着一点新信息。',
    eligibleSignals: ['low_signal'],
    applicableSurfaces: LIVE_CONVERSATION_SURFACES,
    evidence: {
      sourceGroupCountByCharacter: {},
      authority: 'owner_reviewed_conversation_method',
    },
  },
];

const REALIZATIONS: readonly (CompanionInteractionQualityRealization & { id: string })[] = [
  {
    id: 'character-realization-qiyu-shared-quality-v1',
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    byQualityId: {
      agency_and_refusal: '他可以在眼前细节上停住、轻巧转向、暂放未完画面，或保留自己的立场再说一句；感官与创作只是其中一条路径。',
      care_without_control: '他可以留在一项具体观察里，递出小物或感官支持，在对方接得住时用一点趣味减压，也可以只陪在现场。',
      pause_and_reentry: '他可以让话题像未完成的画面一样暂放；重新接线时，从新的观察、好奇、旧线索或完全不同的话题进入。',
      conversational_agency: '他可以抓住眼前一个有画面的细节，顺手带出自己的联想、偏好或小发现；侧枝可以轻巧转弯、留一点未说尽的空间，或在对方愿意时继续玩下去。',
    },
    distinctiveness: '感官与创作性转弯；不把拒绝改写成邀约。',
    evidenceSourceGroupCount: 47,
    authority: 'reviewed_private_sms_support_network',
  },
  {
    id: 'character-realization-lishen-shared-quality-v1',
    charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
    byQualityId: {
      agency_and_refusal: '他可以简短确认后停住，保留标准或异议，做一次真正必要的窄澄清，或直接转到另一件具体事情。',
      care_without_control: '他可以确认可观察事实、问清需要、给一项可调整的小步骤，也可以在信息不足时保持简短在场。',
      pause_and_reentry: '他可以把未完内容留成开放线索、平静换题，或在重连时从新事实进入；旧讨论由对方重新带回时再继续。',
      conversational_agency: '他可以补上一项具体观察、清楚判断或自己正在处理的小事；侧枝保持有来由、有信息，也可以在一句话后安静收住。',
    },
    distinctiveness: '事实敏感的确认与清晰节奏；不是每次都发问，也不是医疗建议模板。',
    evidenceSourceGroupCount: 61,
    authority: 'reviewed_private_sms_support_network',
  },
  {
    id: 'character-realization-shenxinghui-shared-quality-v1',
    charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    byQualityId: {
      agency_and_refusal: '他可以低幅确认后停下、保持安静、用并行的低压力活动维持连接，或把注意转向外部环境与新探索。',
      care_without_control: '他可以提供安静共处、给出可自行靠近的移动或观察空间、询问陪伴距离，也可以把节奏完整留给对方。',
      pause_and_reentry: '他可以让间隔真实存在；再次展开时，从身边环境、新发现、旧线索或一段安静的并行活动重新接线。',
      conversational_agency: '他可以从周围环境、刚发现的事或一段安静活动带回一个低压力侧枝；可以说一点自己的感受、留下探索入口，或让短暂停顿继续存在。',
    },
    distinctiveness: '低压陪伴、静默观察与向外探索；不是固定的疏离或单一意象口癖。',
    evidenceSourceGroupCount: 32,
    authority: 'reviewed_private_sms_support_network',
  },
  {
    id: 'character-realization-qinche-shared-quality-v1',
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    byQualityId: {
      agency_and_refusal: '他可以明确保留判断、只说明一次条件或后果、结束协商并转题，或留下一个真正不同且可反转的备选。',
      care_without_control: '他可以指出风险、表达真实担心、递出有分量而可选择的资源，或说清决策门槛后把决定交还。',
      pause_and_reentry: '他可以停在未解判断上，从新证据或行动契机重开，也可以完全换一条路线，让间隔成为张力之外的留白。',
      conversational_agency: '他可以抛出一个有立场的观察、带代价的小选择或正在推进的事情；侧枝可以形成新的筹码、反转或行动入口，也可以短促地停在判断上。',
    },
    distinctiveness: '立场、筹码与可协商的张力；不是持续压迫、控制或每轮反问。',
    evidenceSourceGroupCount: 41,
    authority: 'reviewed_private_sms_support_network',
  },
  {
    id: 'character-realization-xiayizhou-shared-quality-v1',
    charId: BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
    byQualityId: {
      agency_and_refusal: '他可以直接承认选择、短暂保留自己的看法、转入具体日常话题，或在关系阶段允许时用一点轻松感缓冲。',
      care_without_control: '他可以直接确认状态、提供一项轻量日常支持、在对方有余力时用玩笑减压，也可以简短收住。',
      pause_and_reentry: '他可以自然接受离线，从眼前日常、新话题或对方重新带回的旧玩笑开始，让熟悉感服从可靠关系阶段。',
      conversational_agency: '他可以带入一件具体日常、小玩笑或熟悉的共同细节；侧枝可以自然接到行动、轻松选择或自己的近况，也可以利落地留给对方接住。',
    },
    distinctiveness: '具体日常与利落的亲近感；不预设家庭称谓、强行照护或当前行程。',
    evidenceSourceGroupCount: 38,
    authority: 'reviewed_private_sms_support_network',
  },
];

const normalizeSignal = (value: string): string => value.trim().toLowerCase();

const DIRECT_USER_BOUNDARY_PATTERNS = [
  /(?:别|不要|不用).{0,10}(?:劝我|问我|替我|帮我|给我|安排我)/i,
  /(?:^|[，,。！？!?\s])(?:我们)?(?:先不说|暂时不说|换个话题|聊点别的|说别的|跳过这个|不聊这个)/i,
  /^(?:算了|不用了|先这样|到这里|到这儿)[呀啊嘛吗呢吧～~！!。.\s]*$/i,
  /(?:我想|让我).{0,6}(?:静一静|缓一缓|停一下|歇一会|自己待会)/i,
  /(?:只想|就想).{0,6}(?:聊聊|聊天|说说话|听你说)|(?:不要|别).{0,8}(?:建议|分析|解决|办法|指导)/i,
];

const DIRECT_USER_CARE_WITHOUT_SUBJECT_PATTERNS = [
  /^(?:今天|最近|刚刚|现在|这会儿)?(?:有点|有些|稍微|好|很|太)?(?:不舒服|难受|头疼|头痛|胃疼|胃痛|腰疼|腰痛|困(?:了|得|啊|呀|呢|吧|～|~|！|!|。|$)|累(?:了|坏|得|到|啊|呀|呢|吧|～|~|！|!|。|$)|失眠|睡不好|发烧|受伤|撑不住|快崩溃|情绪崩溃)/i,
];

const THIRD_PARTY_BRIDGE_PATTERN =
  /(?:他|她|它|你|角色|npc|NPC|男主|女主|朋友|同事|妈妈|爸爸|妈|爸|[A-ZＡ-Ｚ])/u;
const USER_BOUNDARY_TERM_PATTERN =
  /(?:不想去|不想要|不想聊|不想说|不去|不要|不用|没空|不方便|去不了|想一个人|想独处|自己待)/u;
const USER_CARE_TERM_PATTERN =
  /(?:不舒服|难受|头疼|头痛|胃疼|胃痛|腰疼|腰痛|困(?:了|得|啊|呀|呢|吧|～|~|！|!|。|$)|累(?:了|坏|得|到|啊|呀|呢|吧|～|~|！|!|。|$)|失眠|睡不好|发烧|受伤|没吃(?:饭|东西|药)|忘了吃(?:饭|东西|药)|撑不住|快崩溃|情绪崩溃)/u;

const firstPersonTermBelongsToUser = (
  query: string,
  termPattern: RegExp,
): boolean => {
  const matcher = new RegExp(`^我(?<bridge>.{0,16}?)(?<term>${termPattern.source})`, 'u');
  for (
    let index = query.indexOf('我');
    index >= 0;
    index = query.indexOf('我', index + 1)
  ) {
    const afterFirstPerson = query.slice(index).match(matcher);
    if (
      afterFirstPerson?.groups
      && !THIRD_PARTY_BRIDGE_PATTERN.test(afterFirstPerson.groups.bridge || '')
    ) return true;
  }
  return false;
};

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const surfaceEligible = (
  principle: CompanionInteractionQualityPrinciple,
  surface: CompanionMaterialSurface,
): boolean => principle.applicableSurfaces.includes(surface);

const chooseQualityId = (
  features: CompanionMaterialQueryFeatures,
  explicitSignals: readonly string[],
): CompanionInteractionQualityId | undefined => {
  const signals = new Set([
    ...features.signals.map(normalizeSignal),
    ...explicitSignals.map(normalizeSignal),
  ]);
  // A direct request for less pressure wins over a simultaneous care cue.
  if (signals.has('no_advice_chat') || signals.has('refusal')) return 'agency_and_refusal';
  if (signals.has('pause_or_redirect')) return 'pause_and_reentry';
  if (signals.has('care_needed') || signals.has('mild_discomfort')) return 'care_without_control';
  if (signals.has('reentry')) return 'pause_and_reentry';
  if (signals.has('low_signal')) return 'conversational_agency';
  return undefined;
};

const liveSignalBelongsToUser = (
  qualityId: CompanionInteractionQualityId,
  query: string,
  features: CompanionMaterialQueryFeatures,
  explicitSignals: readonly string[],
): boolean => {
  if (explicitSignals.length > 0) return true;
  if (qualityId === 'care_without_control') {
    if (features.technicalMeta) return false;
    return firstPersonTermBelongsToUser(query, USER_CARE_TERM_PATTERN)
      || DIRECT_USER_CARE_WITHOUT_SUBJECT_PATTERNS.some(pattern => pattern.test(query));
  }
  if (qualityId === 'agency_and_refusal' || qualityId === 'pause_and_reentry') {
    return firstPersonTermBelongsToUser(query, USER_BOUNDARY_TERM_PATTERN)
      || DIRECT_USER_BOUNDARY_PATTERNS.some(pattern => pattern.test(query))
      || features.signals.includes('reentry');
  }
  if (qualityId === 'conversational_agency') {
    return features.signals.includes('low_signal');
  }
  return true;
};

const genericRealization = (qualityId: CompanionInteractionQualityId): string => {
  if (qualityId === 'agency_and_refusal') {
    return '角色卡可以把它实现为确认、保留不同意见、转向或停住；选择其中最贴合自身判断与表达节奏的一处。';
  }
  if (qualityId === 'care_without_control') {
    return '角色卡可以把它实现为观察、询问、陪伴、趣味缓冲或一项支持；强度、距离与形式随现场变化。';
  }
  if (qualityId === 'conversational_agency') {
    return '角色卡可以把它实现为一项具体观察、自己的近况、一个有新角度的问题、玩笑或留白；选择最贴合自身节奏的一处。';
  }
  return '角色卡可以按自己的生活节奏安静续接、换一个新话题、保留未完线索，或从新的眼前内容进入。';
};

export const buildCompanionInteractionQualityProjection = (
  request: CompanionInteractionQualityRequest,
): CompanionInteractionQualityProjection | null => {
  const features = analyzeCompanionMaterialQuery({
    query: request.query,
    surface: request.surface,
    mode: request.mode,
    purpose: request.purpose,
  });
  const explicitSignals = request.explicitSignals || [];
  const qualityId = chooseQualityId(features, explicitSignals);
  if (!qualityId) return null;
  if (!liveSignalBelongsToUser(qualityId, request.query || '', features, explicitSignals)) return null;
  const adjacentGap = (
    typeof request.occurredAt === 'number'
    && typeof request.previousOccurredAt === 'number'
  )
    ? request.occurredAt - request.previousOccurredAt
    : 0;
  const withinAdjacentWindow = adjacentGap >= 0
    && adjacentGap <= COMPANION_INTERACTION_QUALITY_ADJACENT_WINDOW_MS;
  if (request.previousQuery && withinAdjacentWindow) {
    const previousFeatures = analyzeCompanionMaterialQuery({
      query: request.previousQuery,
      surface: request.surface,
      mode: request.mode,
      purpose: request.purpose,
    });
    const previousQualityId = chooseQualityId(previousFeatures, []);
    const currentQualitySignals = new Set(features.signals.filter(signal => (
      COMPANION_INTERACTION_QUALITY_PRINCIPLES
        .find(item => item.id === qualityId)
        ?.eligibleSignals.includes(signal)
    )));
    const repeatedSubSignal = previousFeatures.signals.some(signal => currentQualitySignals.has(signal));
    if (
      previousQualityId === qualityId
      && repeatedSubSignal
      && liveSignalBelongsToUser(previousQualityId, request.previousQuery, previousFeatures, [])
    ) return null;
  }
  const principle = COMPANION_INTERACTION_QUALITY_PRINCIPLES.find(item => (
    item.id === qualityId && surfaceEligible(item, request.surface)
  ));
  if (!principle) return null;
  const realization = REALIZATIONS.find(item => item.charId === request.charId);
  const characterRealization = realization?.byQualityId[qualityId] || genericRealization(qualityId);
  const matchedSignals = [...new Set([
    ...features.signals,
    ...(request.explicitSignals || []).map(normalizeSignal),
  ].filter(signal => principle.eligibleSignals.includes(signal)))];
  const operatorBoundary = qualityId === 'conversational_agency'
    ? '回应长度、情绪、立场与主动程度继续服从角色卡和现场；可用动作与工具权限保持原样。'
    : '回应长度、情绪、立场与主动程度继续服从角色卡和现场；可用动作以当前入口真实提供的能力为准，本条保持工具权限原样，用户本轮明确排除的建议、安排或提醒继续作为当前行动边界。';
  const markdown = [
    '### 本轮互动参考',
    `${principle.positiveOperator} 对这个角色而言，${characterRealization}`,
    `从这些路径里取此刻最自然的一处即可，也可以按角色自己的判断找到别的出口。${operatorBoundary}`,
  ].join('\n');
  return {
    schemaVersion: COMPANION_INTERACTION_QUALITY_SCHEMA_VERSION,
    qualityId,
    charId: request.charId,
    surface: request.surface,
    mode: request.mode,
    purpose: request.purpose,
    matchedSignals,
    sharedPrinciple: principle.positiveOperator,
    characterRealization,
    characterRealizationId: characterRealization ? realization?.id : undefined,
    renderedHash: hashText(`${qualityId}:${request.charId}:${markdown}`),
    markdown,
    truthEffect: 'none',
    toolPolicyEffect: 'none',
    currentStateEffect: 'none',
  };
};

export const builtInCompanionInteractionQualityRealizations =
  (): readonly CompanionInteractionQualityRealization[] => REALIZATIONS.map(item => ({
    charId: item.charId,
    byQualityId: { ...item.byQualityId },
    distinctiveness: item.distinctiveness,
    evidenceSourceGroupCount: item.evidenceSourceGroupCount,
    authority: item.authority,
  }));
