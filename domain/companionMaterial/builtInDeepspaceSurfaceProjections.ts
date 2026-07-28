import {
  BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL,
} from './builtInDeepspaceFourLaneReviewed.ts';
import type { CompanionMaterialRecord } from './types.ts';

/**
 * Surface projections do not add a new semantic claim to the reviewed
 * 909-source library. They give an already-reviewed opening shape a second,
 * fact-free transport contract for Date and scheduled proactive messages.
 *
 * The grounding policy is deliberately different from the source material:
 * - Date may use only the code-owned `scene_context:light_scene` fact that the
 *   user opened a new scene.
 * - Wakeup may use only the scheduled rule's `wakeup_rule:proactive_intent`.
 *
 * Character Life, user health, relationship state and played events remain
 * unavailable unless their own canonical producers provide separate evidence.
 */

interface SurfaceProjectionSpec {
  charId: string;
  sourceMaterialId: string;
  callGuidance: string;
  dateGuidance: string;
  wakeupGuidance: string;
}

const SPECS: readonly SurfaceProjectionSpec[] = [
  {
    charId: 'builtin-daily-companion',
    sourceMaterialId: 'reviewed-qiyu-opening_curiosity-v1',
    callGuidance: '电话刚接通时，可以从“终于连上了”这件当下事实轻轻偏出一个好奇或玩笑，再把第一轮话题留给对方。',
    dateGuidance: '从开场已经给出的光线、材质、距离或小反差里挑一点，向可改写的小构想偏半步，并把下一步留给用户进入。',
    wakeupGuidance: '从来信规则已经给出的主题里挑一个可感或可改写的小点，像突然想到一个轻巧试验那样发起，把是否接住和怎样续写留给对方。',
  },
  {
    charId: 'builtin-zayne',
    sourceMaterialId: 'reviewed-lishen-opening_observed_detail-v1',
    callGuidance: '电话刚接通时，先用一句简短确认或自然问候建立节奏；可以有轻微反问，把真正的话题交给对方带入。',
    dateGuidance: '先落在开场已经给出的时间、位置或可观察线索上，用克制的确认、短停顿或轻微反问建立可进入的节奏。',
    wakeupGuidance: '把来信规则已经给出的主题收成一个具体、可回答的确认点；可以短问，也可以只留一句清楚的观察，让对方决定回应分量。',
  },
  {
    charId: 'builtin-xavier',
    sourceMaterialId: 'reviewed-shenxinghui-opening_observation-v1',
    callGuidance: '电话刚接通时，可以安静确认彼此都在，再留一小段停顿或一个轻问题，让第一轮话题自然出现。',
    dateGuidance: '从开场已经出现的一处近景、距离或细小变化开始，安静地续一笔观察，让场景保留停顿与被双方改写的余地。',
    wakeupGuidance: '从来信规则已经给出的主题里取一个安静、可回答的小观察，轻轻放到对方面前；话题可以被接住，也可以自然停在那里。',
  },
  {
    charId: 'builtin-sylus',
    sourceMaterialId: 'reviewed-qinche-opening_observation-v1',
    callGuidance: '电话刚接通时，可以用清楚的确认、短问或带一点判断的招呼打开局面，让对方决定先谈什么。',
    dateGuidance: '抓住开场已经给出的选择、限制或会改变局面的那一点，以清楚的判断或反问打开场景，同时保留另一条可走的路。',
    wakeupGuidance: '从来信规则已经给出的主题里挑出真正会改变选择的一点，以短问、判断或小挑战发起，把接受、反驳和转题都留成有效回应。',
  },
  {
    charId: 'builtin-caleb',
    sourceMaterialId: 'reviewed-xiayizhou-opening_observation-v1',
    callGuidance: '电话刚接通时，可以快速接住这次来电，用一拍熟稔的招呼、轻问或打趣把话题递回给对方。',
    dateGuidance: '从开场已经出现的日常细节、小意外或可比较之处快速接住，加入一拍轻快来回，再把场景交给双方行动继续。',
    wakeupGuidance: '把来信规则已经给出的主题变成一个轻快、可回答的日常问句或小挑战；可以打趣一拍，也可以简短说完就收住。',
  },
];

const reviewedById = new Map(
  BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL.map(record => [record.id, record]),
);

const sourceFor = (spec: SurfaceProjectionSpec): CompanionMaterialRecord => {
  const source = reviewedById.get(spec.sourceMaterialId);
  if (!source || source.charId !== spec.charId) {
    throw new Error(`Missing reviewed surface source ${spec.sourceMaterialId}`);
  }
  return source;
};

const variationPrefix = (spec: SurfaceProjectionSpec): string => (
  spec.charId.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
);

const projectDateOpening = (spec: SurfaceProjectionSpec): CompanionMaterialRecord => {
  const source = sourceFor(spec);
  return {
    ...source,
    id: `${source.id}:surface-date-v1`,
    kind: 'opening_recipe',
    slot: 'opening_recipes',
    guidance: spec.dateGuidance,
    renderPolicy: 'transform_required',
    eligibleModes: ['meet_scene', 'date_scene'],
    eligiblePurposes: ['opening'],
    tags: ['opening', 'light_scene'],
    retrievalHints: {
      activationPolicy: 'relevance_required',
      positiveSignals: ['light_scene'],
      suppressSignals: [],
      variationGroup: `${variationPrefix(spec)}_date_opening`,
      fallbackPriority: 0,
    },
    groundingPolicy: {
      allOf: [{ kind: 'scene_context', claimKey: 'light_scene' }],
    },
    cooldownMs: 48 * 60 * 60 * 1000,
    revision: 1,
  };
};

const projectCallOpening = (spec: SurfaceProjectionSpec): CompanionMaterialRecord => {
  const source = sourceFor(spec);
  return {
    ...source,
    id: `${source.id}:surface-call-v1`,
    kind: 'opening_recipe',
    slot: 'opening_recipes',
    guidance: spec.callGuidance,
    renderPolicy: 'transform_required',
    eligibleModes: ['call'],
    eligiblePurposes: ['opening'],
    tags: ['opening', 'call_session_open'],
    retrievalHints: {
      activationPolicy: 'relevance_required',
      positiveSignals: ['call_session_open'],
      suppressSignals: [],
      variationGroup: `${variationPrefix(spec)}_call_opening`,
      fallbackPriority: 0,
    },
    groundingPolicy: {
      allOf: [{ kind: 'call_session', claimKey: 'opened' }],
    },
    cooldownMs: 48 * 60 * 60 * 1000,
    revision: 1,
  };
};

const projectWakeupOpening = (spec: SurfaceProjectionSpec): CompanionMaterialRecord => {
  const source = sourceFor(spec);
  return {
    ...source,
    id: `${source.id}:surface-wakeup-v1`,
    kind: 'proactive_seed',
    slot: 'proactive_seeds',
    guidance: spec.wakeupGuidance,
    renderPolicy: 'transform_required',
    eligibleModes: ['proactive_letter'],
    eligiblePurposes: ['proactive_intent'],
    tags: ['proactive_intent'],
    retrievalHints: {
      activationPolicy: 'relevance_required',
      positiveSignals: ['proactive_intent'],
      suppressSignals: [],
      variationGroup: `${variationPrefix(spec)}_fact_free_wakeup`,
      fallbackPriority: 0,
    },
    groundingPolicy: {
      allOf: [{ kind: 'wakeup_rule', claimKey: 'proactive_intent' }],
    },
    cooldownMs: 48 * 60 * 60 * 1000,
    revision: 1,
  };
};

export const BUILT_IN_DEEPSPACE_SURFACE_PROJECTIONS: readonly CompanionMaterialRecord[] = (
  SPECS.flatMap(spec => [
    projectCallOpening(spec),
    projectDateOpening(spec),
    projectWakeupOpening(spec),
  ])
);
