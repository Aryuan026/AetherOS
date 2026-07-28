#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPublicVoicePacket,
  buildVoiceCandidatePool,
} from './historical-record-analyzer-core.mjs';
import { validateSemanticReviewBackfill } from './semantic-review-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private', 'material-analysis-v3');
const args = process.argv.slice(2);

const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const inputFile = readArg('--in');
if (!inputFile) {
  throw new Error('Usage: node scripts/build-lysk-sms-material-analysis.mjs --in /private/detail-signals.json [--out research/lysk-reviewed-private/material-analysis-v3]');
}

const outDir = path.resolve(ROOT, readArg('--out', DEFAULT_OUT_DIR));
const semanticReviewFile = readArg('--semantic-review');
const sourcePackId = 'lysk-sms-material-analysis-v3';
const reviewedAt = Date.UTC(2026, 6, 28);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const opaque = (value, prefix) => `${prefix}-${hash(value).slice(0, 20)}`;
const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const signalRules = {
  care: /吃饭|早餐|午饭|晚饭|睡|休息|生病|不舒服|药|冷|热|到家|受伤|疲惫|熬夜|喝水/,
  observation: /看到|发现|路过|天气|光|颜色|味道|声音|照片|影子|窗外|云|雨|风|海|花|动物|小物/,
  playful: /好笑|玩笑|逗|骗|笨|聪明|比赛|挑战|赌|夸张|调侃|恶作剧|表情/,
  independent: /工作|任务|会议|训练|安排|项目|研究|创作|画|作品|练习|值班|出差|计划|忙|日程/,
  reentry: /回来|重逢|好久|几天|很久|再次|重新|久等/,
  practical: /怎么|办法|准备|处理|检查|确认|提醒|整理|下一步|计划|报告|数据/,
  scene: /走|看向|抬眼|靠近|拉住|转身|坐下|出门|相见|散步|旅行|船|车|影院|夜市|花园/,
  creative: /画|颜色|作品|灵感|创作|展览|设计|影像|镜头|音乐|故事/,
  boundary: /不用|不必|拒绝|算了|下次|自己|别|不想|不去|不方便/,
  world: /流浪体|芯核|猎人|战斗|主线|剧情|约会|卡面|活动|节日|生日|纪念日/,
};

const leadCharId = {
  qiyu: 'builtin-daily-companion',
  lishen: 'builtin-zayne',
  shenxinghui: 'builtin-xavier',
  qinche: 'builtin-sylus',
  xiayizhou: 'builtin-caleb',
};

const assetMeta = {
  stable_character_voice: {
    route: 'voice_calibration', kind: 'language_fingerprint',
    eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene'],
  },
  stable_base: {
    route: 'role_detail_claim', kind: 'stable_detail_claim',
    eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
  },
  relevant_stable_detail: {
    route: 'role_detail_claim', kind: 'stable_detail_claim',
    eligibleSurfaces: ['chat', 'call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
  },
  opening_recipe: {
    route: 'proactive_opening', kind: 'opening_recipe',
    eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
  },
  proactive_seed: {
    route: 'proactive_opening', kind: 'proactive_seed',
    eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene'],
  },
  motive_candidate: {
    route: 'proactive_opening', kind: 'motive_candidate',
    eligibleSurfaces: ['proactive_letter', 'call', 'meet_scene', 'date_scene', 'storydesk', 'story_scene'],
  },
  scene_affordance: {
    route: 'scene_texture', kind: 'scene_affordance',
    eligibleSurfaces: ['meet_scene', 'date_scene', 'storydesk', 'story_scene'],
  },
};

const runtimeFamilies = new Set(Object.keys(assetMeta));

const clusterGuidance = {
  qiyu: {
    voice_observed_entry: '可从当下可感的发现或反差起念，让注意力顺着现场变化，再决定是否展开。',
    voice_playful_turn: '可用轻微夸张、岔开一笔或自我调侃松动气氛，玩笑随话题轻重变化。',
    voice_optional_care: '关心可包装成轻量且可拒绝的共同办法，不把照看变成要求。',
    voice_own_rhythm: '保留对创作、好奇和个人安排的兴趣，回应不必围着对方打转。',
    base_shared_experiment: '可把观察转成一起试试的小提议，并给对方保留接受、改写或拒绝的空间。',
    detail_sensory_texture: '只在相关时借一处感官或生活细节落地，不把细节变成固定装饰。',
    opening_curiosity: '开场可由意外发现、正在进行的小念头或轻微反差引出，并允许对方转题。',
    opening_reentry: '重现时可先带来自己的一点变化，再自然确认对方是否愿意接话。',
    proactive_own_thread: '可从自己的进行中事务、创作或小实验主动分享，联系可被搁置或拒绝。',
    proactive_optional_care: '需要表达关心时，可发起一个可选的小安排，而不是预设对方的回应。',
    motive_curiosity: '可作为未来场景的候选理由：被新发现或未解的小问题牵动，但不声明此刻目标。',
    scene_sensory_play: '轻剧情可让可感细节、玩心和双方选择共同塑形，不预设亲密姿态。',
  },
  lishen: {
    voice_concrete_entry: '可先从可观察的细节、手边事务或已完成的一步起念，再决定回应的分量。',
    voice_calm_confirmation: '可用平静确认、简短反问或克制玩笑保留余地，语气随话题轻重调整。',
    voice_practical_care: '照看可落成可实行且可拒绝的小动作，让对方保持判断和选择。',
    voice_own_perspective: '保留对日常安排和未尽问题的个人视角，不必总从关怀开始。',
    voice_ask_before_concluding: '信息不足时可先问清、暂缓判断，把准确性和人的节奏一起放在心上。',
    base_next_step: '可把判断拆成可执行的下一步，并依据对方意愿调整，而非下达当轮指令。',
    detail_routine_texture: '只在相关时从时间、行程或手边物件的一点变化切入，让生活感服务于当下。',
    opening_observed_detail: '开场可由刚观察到的细节或自己的安排进入，并给对方留出拒绝或转题空间。',
    proactive_own_thread: '可偶尔分享自己正在处理的普通事务或小发现，让联系自然来去。',
    proactive_calm_reentry: '分别后重新出现时，可平静承认时间过去，再从眼前能接住的话题继续。',
    motive_followthrough: '可作为未来场景的候选理由：对未完成的小事保持跟进倾向，但不声明此刻目标。',
    scene_composed_lightness: '轻剧情可让具体观察、克制的玩笑和双方选择共同组织，不写成照护脚本。',
  },
  shenxinghui: {
    voice_observed_entry: '可从近处变化、安静观察或正在发生的小事起念，再决定是否把注意力交给对方。',
    voice_playful_turn: '可让轻松玩笑或一点好胜心松开气氛，但不把玩笑当作惯性反应。',
    voice_boundary: '面对拒绝或不便时，可保留自己的意愿与节奏，也把对方的选择当作有效信息。',
    voice_optional_care: '若表达关心，可提出轻量且可拒绝的方式，不把对方状态解释成义务。',
    voice_own_rhythm: '可从自己的日常发现或正在做的事出发，分享不要求对方必须承接。',
    base_personal_judgment: '可先形成自己的判断，再把它作为可讨论的一种方向，而非替对方安排答案。',
    detail_living_texture: '只在相关时带入一处近身生活纹理或环境观察，让细节回应眼前话题。',
    opening_observation: '开场可由安静观察或刚发生的小变化进入，让对方决定是否接住话题。',
    opening_reentry: '重现时可带来自己视线里的一点变化，再给对方选择继续、转题或慢一点回应的余地。',
    proactive_own_thread: '可从自己的日常发现或正在做的事发起联系，让分享有来有去，不要求对方承接。',
    proactive_optional_care: '若想表达关心，可提出轻量且可拒绝的照看方式，不把对方状态解释成义务。',
    motive_open_question: '可作为未来场景的候选理由：对尚未明朗的问题保持观察空间，但不声明此刻目标。',
    scene_open_choice: '轻剧情可从近处观察、短暂停顿和可改变的选择自然展开，不预设关系结论。',
  },
  qinche: {
    voice_observed_entry: '可从眼前变化、行动结果或值得留意的反差起念，再决定是否继续追问。',
    voice_playful_turn: '轻松转向可在合适时松开气氛，但不覆盖清楚的判断或对方的选择。',
    voice_boundary: '面对拒绝或分歧时，可把边界与自己的判断说清，不用关心或玩笑覆盖对方选择。',
    voice_optional_care: '若表达关心，可给出轻量、可执行且可拒绝的选项，不把照看变成控制。',
    voice_own_rhythm: '可从自己的安排、观察或未完之事发起分享，允许联系被搁置或拒绝。',
    base_personal_judgment: '可先形成独立判断，提出一种可被拒绝的方向，并允许结果不按预期落下。',
    detail_living_texture: '只在相关时用一处环境、行动或手边变化落地，让细节帮助判断而非成为摆设。',
    opening_observation: '开场可从值得留意的变化或自己的判断切入，但不给对方规定回答方式。',
    opening_reentry: '重现时可先承认间隔和自己一侧的变化，再让下一句话由双方决定。',
    proactive_own_thread: '可从自己的安排、观察或未完的事发起分享，允许联系被搁置或被拒绝。',
    proactive_optional_care: '需要表达关心时，可给出轻量、可执行且可拒绝的选项，不把照看变成控制。',
    motive_open_question: '可作为未来场景的候选理由：遇到尚未明朗的问题时，保留观察或验证空间，但不声明当前目标。',
    scene_open_choice: '轻剧情可让判断、行动与可拒绝的选择交替推进，不把直接写成单一结论。',
  },
  xiayizhou: {
    voice_observed_entry: '可从眼前日常变化或轻松发现进入，再决定是否把它展开为对话。',
    voice_playful_turn: '可用轻微打趣、意外转折或自然轻松感接住对话，但不用它掩盖话题重量。',
    voice_boundary: '面对拒绝或不便时，可温和而明确地维持边界，也承认对方可以另作安排。',
    voice_optional_care: '若想照看对方，可提出轻量且可拒绝的办法，不把关心写成必须接受的安排。',
    voice_own_rhythm: '可保留自己的行动节奏与近况，让分享来自生活而非固定的人际任务。',
    base_personal_judgment: '可把自己的判断与行动倾向说成可协商的方向，不代替对方做决定。',
    detail_living_texture: '只在相关时借一处日常变化、环境感受或行动细节落地，不重复同一种装饰。',
    opening_observation: '开场可从日常变化或轻松发现进入，给对方接话、转题或稍后再说的空间。',
    opening_reentry: '重现时可先带出自己的小变化或近况，再让对方决定回应节奏。',
    proactive_own_thread: '可从自己的近况或一件正在发生的小事发起分享，让联系有自然来去。',
    proactive_optional_care: '若想照看对方，可提出轻量且可拒绝的办法，不把关心写成必须接受的安排。',
    motive_open_question: '可作为未来场景候选理由：对眼前尚未展开的变化保留探索空间，不声明当前目标。',
    scene_open_choice: '轻剧情可让日常观察、轻松转折和双方选择共同决定走向，不预设关系状态。',
  },
};

const fallbackGuidance = {
  shenxinghui: '以当下相关的观察、个人节奏或可拒绝的回应进入，表达方向随现场调整。',
  qinche: '以当下相关的判断、边界或个人安排进入，表达方向随现场调整。',
  xiayizhou: '以当下相关的日常观察、个人节奏或可拒绝的回应进入，表达方向随现场调整。',
};

// The pre-existing public-facing guidance for these three roles is useful as
// a humane interaction boundary, but a name-blind read found its wording too
// interchangeable to certify as a language fingerprint.  Keep it visible as
// a candidate for the holdout exercise; do not silently promote it to voice
// evidence merely because it is well-behaved.
const requiresNameBlindCalibration = new Set(['shenxinghui', 'qinche', 'xiayizhou']);

const sourceContent = (source) => text([
  source.sourceTitle,
  ...(source.privateText?.characterLines || []),
  ...(source.privateText?.userLines || []),
].join(' '));

const featuresFor = (source) => {
  const content = sourceContent(source);
  const active = Object.entries(signalRules)
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name);
  return new Set([...active, ...(source.sceneTags || []), ...(source.riskFlags || [])]);
};

const has = (features, name) => features.has(name);

/**
 * This adapter is deliberately small and private.  It converts short SMS
 * units into the same semantic axes used by the source-agnostic historical
 * record analyzer: scene, temperature, and response "mouth shape".  The
 * analyzer ranks those annotations; it never serializes the SMS wording.
 */
const voiceShapeFor = (source, features) => {
  const sceneAnchor = has(features, 'reentry') ? 'reentry'
    : has(features, 'care') ? 'care_checkin'
      : has(features, 'scene') ? 'light_scene'
        : has(features, 'independent') || has(features, 'creative') ? 'own_life'
          : has(features, 'observation') ? 'ordinary_share'
            : 'low_signal_chat';
  const temperature = has(features, 'boundary') ? 'calm_firm'
    : has(features, 'playful') ? 'playfully_light'
      : has(features, 'care') ? 'attentive_soft'
        : has(features, 'practical') ? 'focused_composed'
          : 'everyday_even';
  const mouthShapes = [
    has(features, 'observation') ? 'concrete_notice' : null,
    has(features, 'playful') ? 'side_step_or_tease' : null,
    has(features, 'care') ? 'offer_not_impose' : null,
    has(features, 'boundary') ? 'acknowledge_boundary' : null,
    has(features, 'practical') ? 'clarify_then_step' : null,
    has(features, 'independent') || has(features, 'creative') ? 'own_thread' : null,
  ].filter(Boolean);
  if (!mouthShapes.length) mouthShapes.push('open_observation');
  const riskFlags = new Set(source.riskFlags || []);
  return {
    sceneAnchor,
    temperature,
    mouthShapes,
    // A relationship/event source may still support a scoped texture, but it
    // cannot establish an always-on voice default on its own.
    singleEventRisk: riskFlags.has('event_specific') || riskFlags.has('relationship_gate') ? 0.7 : 0.08,
    // This is a conservative adapter-side flag.  The reviewer must still run
    // the stronger name-swap check described in the analyzer specification.
    genericSwapRisk: mouthShapes.length === 1 && sceneAnchor === 'low_signal_chat' ? 0.45 : 0.12,
  };
};

const clusterFor = (leadId, family, features) => {
  if (leadId === 'qiyu') {
    if (family === 'stable_character_voice') {
      if (has(features, 'care')) return 'voice_optional_care';
      if (has(features, 'playful')) return 'voice_playful_turn';
      if (has(features, 'independent') || has(features, 'creative')) return 'voice_own_rhythm';
      return 'voice_observed_entry';
    }
    if (family === 'stable_base') return 'base_shared_experiment';
    if (family === 'relevant_stable_detail') return 'detail_sensory_texture';
    if (family === 'opening_recipe') return has(features, 'reentry') ? 'opening_reentry' : 'opening_curiosity';
    if (family === 'proactive_seed') return has(features, 'care') ? 'proactive_optional_care' : 'proactive_own_thread';
    if (family === 'motive_candidate') return 'motive_curiosity';
    if (family === 'scene_affordance') return 'scene_sensory_play';
  }
  if (leadId === 'lishen') {
    if (family === 'stable_character_voice') {
      if (has(features, 'care')) return 'voice_practical_care';
      if (has(features, 'practical')) return 'voice_ask_before_concluding';
      if (has(features, 'independent')) return 'voice_own_perspective';
      if (has(features, 'playful') || has(features, 'boundary') || has(features, 'reentry')) return 'voice_calm_confirmation';
      return 'voice_concrete_entry';
    }
    if (family === 'stable_base') return 'base_next_step';
    if (family === 'relevant_stable_detail') return 'detail_routine_texture';
    if (family === 'opening_recipe') return 'opening_observed_detail';
    if (family === 'proactive_seed') return has(features, 'reentry') ? 'proactive_calm_reentry' : 'proactive_own_thread';
    if (family === 'motive_candidate') return 'motive_followthrough';
    if (family === 'scene_affordance') return 'scene_composed_lightness';
  }
  if (family === 'stable_character_voice') {
    if (has(features, 'care')) return 'voice_optional_care';
    if (has(features, 'playful')) return 'voice_playful_turn';
    if (has(features, 'boundary')) return 'voice_boundary';
    if (has(features, 'independent')) return 'voice_own_rhythm';
    return 'voice_observed_entry';
  }
  if (family === 'stable_base') return 'base_personal_judgment';
  if (family === 'relevant_stable_detail') return 'detail_living_texture';
  if (family === 'opening_recipe') return has(features, 'reentry') ? 'opening_reentry' : 'opening_observation';
  if (family === 'proactive_seed') return has(features, 'care') ? 'proactive_optional_care' : 'proactive_own_thread';
  if (family === 'motive_candidate') return 'motive_open_question';
  return 'scene_open_choice';
};

const guidanceFor = (leadId, clusterId, restricted) => {
  if (restricted) return '仅作为未来场景候选的受限证据，须经 scoped review 抽象后使用；不声明已发生事件或关系状态。';
  return clusterGuidance[leadId]?.[clusterId]
    || fallbackGuidance[leadId]
    || '仅供归档分类；不生成运行时 guidance。';
};

const sourceFingerprintFor = (source) => opaque([
  sourcePackId,
  source.leadId,
  source.id,
  source.sourceTitle,
  source.localPath,
].join('\0'), 'lysk-src');

// The reviewed SMS export has no public thread id.  A title-derived opaque
// group keeps near-duplicate/detail siblings together for holdout purposes
// without ever serializing that title into an analysis artifact.
const sourceGroupFingerprintFor = source => opaque([
  sourcePackId,
  source.leadId,
  source.sourceTitle,
].join('\0'), 'lysk-group');

const isHoldoutGroup = sourceGroupFingerprint => (
  Number.parseInt(hash(sourceGroupFingerprint).slice(0, 8), 16) % 5 === 0
);

const primaryContributionFor = (source, features) => {
  const hasCharacterLines = Number(source.stats?.characterLineCount || 0) > 0;
  if (!hasCharacterLines) return { quarantined: true, reason: 'no_character_expression' };
  const risks = new Set(source.riskFlags || []);
  const restricted = risks.has('relationship_gate') || risks.has('event_specific') || risks.has('worldview_specific');
  if (restricted) {
    return {
      family: 'scene_affordance',
      clusterId: risks.has('relationship_gate') ? 'scene_scoped_relationship_context' : 'scene_scoped_canon_context',
      restricted: true,
    };
  }
  if (source.use === 'language_fingerprint' || source.screeningTier === 'voice_only') {
    return { family: 'stable_character_voice', clusterId: clusterFor(source.leadId, 'stable_character_voice', features) };
  }
  if (has(features, 'scene') || has(features, 'media_context')) {
    return { family: 'scene_affordance', clusterId: clusterFor(source.leadId, 'scene_affordance', features) };
  }
  if (source.conversationDirection === 'character_opens') {
    if (has(features, 'reentry')) return { family: 'opening_recipe', clusterId: clusterFor(source.leadId, 'opening_recipe', features) };
    if (has(features, 'independent') || has(features, 'creative')) return { family: 'proactive_seed', clusterId: clusterFor(source.leadId, 'proactive_seed', features) };
    if (has(features, 'observation') || has(features, 'care') || has(features, 'playful')) return { family: 'opening_recipe', clusterId: clusterFor(source.leadId, 'opening_recipe', features) };
    return { family: 'motive_candidate', clusterId: clusterFor(source.leadId, 'motive_candidate', features) };
  }
  if (has(features, 'observation') || has(features, 'practical') || has(features, 'independent')) {
    return { family: 'relevant_stable_detail', clusterId: clusterFor(source.leadId, 'relevant_stable_detail', features) };
  }
  return { family: 'stable_character_voice', clusterId: clusterFor(source.leadId, 'stable_character_voice', features) };
};

const secondaryContributionsFor = (source, features, primary) => {
  if (primary.quarantined || primary.restricted) return [];
  const contributions = [];
  const add = (family) => {
    if (family === primary.family) return;
    contributions.push({ family, clusterId: clusterFor(source.leadId, family, features) });
  };
  if (has(features, 'observation')) add('relevant_stable_detail');
  if (has(features, 'independent') || has(features, 'creative') || has(features, 'practical')) add('stable_base');
  if (has(features, 'care') || has(features, 'independent') || has(features, 'creative')) add('proactive_seed');
  if (has(features, 'scene') || has(features, 'media_context')) add('scene_affordance');
  if (has(features, 'reentry')) add('opening_recipe');
  if (source.use === 'language_fingerprint' && primary.family !== 'stable_character_voice') add('stable_character_voice');
  const unique = new Map();
  contributions.forEach(item => unique.set(`${item.family}:${item.clusterId}`, item));
  return [...unique.values()];
};

const input = JSON.parse(await readFile(path.resolve(inputFile), 'utf8'));
if (!Array.isArray(input.signals)) throw new Error('Input must contain a signals array');
const semanticReviewInput = semanticReviewFile
  ? JSON.parse(await readFile(path.resolve(ROOT, semanticReviewFile), 'utf8'))
  : { reviews: [] };
if (!Array.isArray(semanticReviewInput.reviews)) {
  throw new Error('Semantic review input must contain a reviews array');
}
const semanticReviewByClusterId = new Map(semanticReviewInput.reviews.map(review => [review.clusterId, review]));
const sourceByFingerprint = new Map(input.signals.map(source => [sourceFingerprintFor(source), source]));
const sourceGroupsByFingerprint = new Map(input.signals.map(source => [
  sourceFingerprintFor(source),
  sourceGroupFingerprintFor(source),
]));

const pendingEntries = input.signals.map(source => {
  const features = featuresFor(source);
  const voiceShape = voiceShapeFor(source, features);
  const sourceGroupFingerprint = sourceGroupFingerprintFor(source);
  const primary = primaryContributionFor(source, features);
  const secondary = secondaryContributionsFor(source, features, primary);
  const contributions = primary.quarantined ? [] : [
    { family: primary.family, clusterId: primary.clusterId, primary: true, restricted: Boolean(primary.restricted) },
    ...secondary.map(item => ({ ...item, primary: false, restricted: false })),
  ];
  return {
    sourceFingerprint: sourceFingerprintFor(source),
    sourceGroupFingerprint,
    isVoiceHoldout: isHoldoutGroup(sourceGroupFingerprint),
    leadId: source.leadId,
    primary,
    contributions,
    sourceShape: {
      use: source.use,
      screeningTier: source.screeningTier,
      conversationDirection: source.conversationDirection,
      characterLineCount: Number(source.stats?.characterLineCount || 0),
      userLineCount: Number(source.stats?.userLineCount || 0),
      optionCount: Number(source.stats?.optionCount || 0),
      riskFlags: [...(source.riskFlags || [])].sort(),
      featureSignals: [...features].filter(item => /^[a-z_]+$/.test(item)).sort(),
      voiceShape,
    },
  };
});

// Keep the initial deterministic split, then repair the edge case that a
// small voice-evidence set happens to place no language evidence in holdout.
// The unit of reservation stays an opaque source group, never a single quoted
// line, and each character retains at least one non-holdout voice route.
for (const leadId of [...new Set(pendingEntries.map(entry => entry.leadId))]) {
  const leadEntries = pendingEntries.filter(entry => entry.leadId === leadId);
  const voiceGroups = [...new Set(leadEntries
    .filter(entry => entry.contributions.some(item => item.family === 'stable_character_voice'))
    .map(entry => entry.sourceGroupFingerprint))]
    .sort();
  if (voiceGroups.length < 2) continue;
  const selectedGroups = new Set(leadEntries
    .filter(entry => entry.isVoiceHoldout)
    .map(entry => entry.sourceGroupFingerprint));
  const selectedVoiceGroups = voiceGroups.filter(groupId => selectedGroups.has(groupId));
  if (!selectedVoiceGroups.length) selectedGroups.add(voiceGroups[0]);
  if (voiceGroups.every(groupId => selectedGroups.has(groupId))) selectedGroups.delete(voiceGroups.at(-1));
  leadEntries.forEach(entry => {
    entry.isVoiceHoldout = selectedGroups.has(entry.sourceGroupFingerprint);
  });
}

const clustersByKey = new Map();
for (const entry of pendingEntries) {
  for (const contribution of entry.contributions) {
    const key = `${entry.leadId}:${contribution.family}:${contribution.clusterId}`;
    const cluster = clustersByKey.get(key) || {
      id: `asset-${entry.leadId}-${contribution.clusterId}`,
      leadId: entry.leadId,
      family: contribution.family,
      clusterId: contribution.clusterId,
      sourceFingerprints: new Set(),
      safeSourceFingerprints: new Set(),
      restricted: false,
    };
    cluster.sourceFingerprints.add(entry.sourceFingerprint);
    if (contribution.restricted) cluster.restricted = true;
    else cluster.safeSourceFingerprints.add(entry.sourceFingerprint);
    clustersByKey.set(key, cluster);
  }
}

const clusters = [...clustersByKey.values()]
  .map(cluster => {
    const sourceFingerprints = [...cluster.sourceFingerprints].sort();
    const safeSourceFingerprints = [...cluster.safeSourceFingerprints].sort();
    const stable = ['stable_character_voice', 'stable_base', 'relevant_stable_detail'].includes(cluster.family);
    const supportThreshold = stable ? 3 : 2;
    const semanticReview = semanticReviewByClusterId.get(cluster.id);
    const validatedReview = semanticReview
      ? validateSemanticReviewBackfill({
        review: semanticReview,
        cluster: {
          id: cluster.id,
          leadId: cluster.leadId,
          charId: leadCharId[cluster.leadId],
          family: cluster.family,
          route: assetMeta[cluster.family].route,
          sourceFingerprints,
          safeSourceFingerprints,
        },
        sourceGroupsByFingerprint,
      })
      : undefined;
    const reviewHasGuidance = Boolean(validatedReview?.guidance);
    const reviewIsActive = validatedReview?.status === 'active'
      && reviewHasGuidance
      && safeSourceFingerprints.length >= supportThreshold;
    // Regex/feature bucketing is deliberately intake-only.  It provides a
    // candidate family and source conservation, never an automatic semantic
    // approval.  Only a separate private DriftStone-derived review can make a
    // non-restricted cluster active.
    const status = cluster.restricted
      ? 'disabled'
      : reviewIsActive
        ? 'active'
        : 'unresolved';
    const statusReason = cluster.restricted
      ? 'scoped_context_requires_separate_review'
      : reviewIsActive
        ? 'private_semantic_review_cross_supported'
        : semanticReview
          ? 'private_semantic_review_not_active'
          : 'awaiting_private_semantic_review';
    const meta = assetMeta[cluster.family];
    return {
      id: cluster.id,
      leadId: cluster.leadId,
      charId: leadCharId[cluster.leadId],
      family: cluster.family,
      clusterId: cluster.clusterId,
      route: meta.route,
      kind: meta.kind,
      eligibleSurfaces: meta.eligibleSurfaces,
      candidateGuidance: guidanceFor(cluster.leadId, cluster.clusterId, cluster.restricted),
      guidance: reviewHasGuidance
        ? validatedReview.guidance
        : guidanceFor(cluster.leadId, cluster.clusterId, cluster.restricted),
      sourceFingerprints,
      safeSourceFingerprints,
      supportedSourceCount: sourceFingerprints.length,
      safeSourceCount: safeSourceFingerprints.length,
      status,
      statusReason,
      authority: 'reviewed_sms_cluster',
      semanticReview: validatedReview ? {
        status: validatedReview.status,
        method: validatedReview.method,
        evidenceSourceFingerprints: validatedReview.evidenceSourceFingerprints,
        sourceGroupCount: validatedReview.sourceGroupCount,
        reviewReason: validatedReview.reviewReason,
        uncertaintyOrConflict: validatedReview.uncertaintyOrConflict,
        ...(validatedReview.voice ? { voice: validatedReview.voice } : {}),
        ...(reviewHasGuidance ? {} : { reason: 'guidance_missing' }),
      } : {
        status: 'pending',
        method: 'static_intake_only',
        reason: 'requires_private_driftstone_derived_review',
      },
      conflictKey: `${cluster.leadId}-${meta.route}-${cluster.clusterId}`,
      revision: 1,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

const clusterIdSet = new Set(clusters.map(cluster => cluster.id));
for (const clusterId of semanticReviewByClusterId.keys()) {
  if (!clusterIdSet.has(clusterId)) {
    throw new Error(`semantic review references unknown cluster: ${clusterId}`);
  }
}

const pendingByFingerprint = new Map(pendingEntries.map(entry => [entry.sourceFingerprint, entry]));
const chunksOf = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => (
  items.slice(index * size, (index + 1) * size)
));
// This artifact is intentionally private and ignored.  It is the actual
// review input: static routing only supplies the candidate family; a reviewer
// receives the bounded source excerpts and returns non-verbatim guidance via
// --semantic-review.  It must never be copied into product assets or git.
const privateSemanticReviewBatches = clusters.flatMap(cluster => (
  chunksOf(cluster.sourceFingerprints, 12).map((sourceFingerprints, index) => ({
    batchId: `review-${cluster.id}-${index + 1}`,
    leadId: cluster.leadId,
    route: cluster.route,
    clusterId: cluster.id,
    candidateGuidance: cluster.candidateGuidance,
    reviewPromptContract: {
      task: 'Infer only cross-supported, non-verbatim character-owned guidance from this bounded evidence batch.',
      require: ['scene_temperature_mouth_shape', 'name_swap_self_check', 'single_event_check', 'surface_boundary'],
      prohibit: ['quoted_source_text', 'current_motive', 'relationship_fact', 'tool_policy', 'fixed_reply_template'],
      returnShape: '{ clusterId, status, guidance, method, evidenceIds, reviewNotes }',
    },
    privateEvidence: sourceFingerprints.map(sourceFingerprint => {
      const source = sourceByFingerprint.get(sourceFingerprint);
      return {
        sourceFingerprint,
        conversationDirection: source.conversationDirection,
        sceneTags: source.sceneTags || [],
        riskFlags: source.riskFlags || [],
        characterLines: source.privateText?.characterLines || [],
        userLines: source.privateText?.userLines || [],
      };
    }),
  }))
));
const voiceReviewPackets = Object.fromEntries(
  [...new Set(clusters.map(cluster => cluster.leadId))].sort().map(leadId => {
    const voiceClusters = clusters.filter(cluster => (
      cluster.leadId === leadId && cluster.family === 'stable_character_voice'
    ));
    const candidateClusters = voiceClusters.map(cluster => {
      const allEvidence = cluster.safeSourceFingerprints
        .map(sourceFingerprint => pendingByFingerprint.get(sourceFingerprint))
        .filter(Boolean);
      const evidence = allEvidence.filter(entry => !entry.isVoiceHoldout);
      const holdoutEvidence = allEvidence.filter(entry => entry.isVoiceHoldout);
      const shapes = evidence.map(entry => entry.sourceShape.voiceShape);
      const sceneAnchors = [...new Set(shapes.map(shape => shape.sceneAnchor))];
      const temperatures = [...new Set(shapes.map(shape => shape.temperature))];
      const mouthShapes = [...new Set(shapes.flatMap(shape => shape.mouthShapes))];
      const average = field => shapes.length
        ? shapes.reduce((sum, shape) => sum + Number(shape[field] || 0), 0) / shapes.length
        : 1;
      const hasReviewedCharacterGuidance = Boolean(clusterGuidance[leadId]?.[cluster.clusterId]);
      return {
        cluster,
        candidate: {
          candidateId: cluster.id,
          // Holdout groups cannot enter the candidate pool.  They remain in
          // the ledger and are compared later through shape-only checks.
          evidenceIds: evidence.map(entry => entry.sourceFingerprint),
          supportCount: evidence.length,
          sceneAnchors,
          temperatures,
          mouthShapes,
          // This is not an assertion about a character.  It merely tells the
          // reviewer whether the current non-verbatim cluster has enough
          // source-owned shape to survive the stronger name-swap check.
          distinctiveness: requiresNameBlindCalibration.has(leadId)
            ? 0.35
            : (hasReviewedCharacterGuidance ? 0.82 : 0.62),
          genericSwapRisk: Math.min(1, average('genericSwapRisk') + (
            requiresNameBlindCalibration.has(leadId) ? 0.58 : (hasReviewedCharacterGuidance ? 0 : 0.16)
          )),
          singleEventRisk: average('singleEventRisk'),
          guidance: cluster.guidance,
        },
        holdoutEvidence,
      };
    });
    const packet = buildVoiceCandidatePool({
      scopeId: leadId,
      candidates: candidateClusters.map(item => item.candidate),
      maxCandidates: 6,
    });
    assertPublicVoicePacket(packet);
    const byCandidateId = new Map(packet.candidates.map(candidate => [candidate.candidateId, candidate]));
    const selected = new Set(packet.selectedCandidateIds);
    candidateClusters.forEach(({ cluster, holdoutEvidence }) => {
      const candidate = byCandidateId.get(cluster.id);
      const selectedCandidate = candidate && selected.has(candidate.candidateId);
      const selectedShapes = candidate ? {
        scenes: new Set(candidate.sceneAnchors),
        temperatures: new Set(candidate.temperatures),
        mouthShapes: new Set(candidate.mouthShapes),
      } : null;
      const holdoutShapeMatches = holdoutEvidence.filter(entry => {
        if (!selectedShapes) return false;
        const shape = entry.sourceShape.voiceShape;
        return selectedShapes.scenes.has(shape.sceneAnchor)
          || selectedShapes.temperatures.has(shape.temperature)
          || shape.mouthShapes.some(value => selectedShapes.mouthShapes.has(value));
      });
      cluster.voiceReview = candidate ? {
        method: packet.method,
        candidateId: candidate.candidateId,
        score: candidate.score,
        reviewFlags: candidate.reviewFlags,
        selectedForReview: selectedCandidate,
        candidateEvidenceCount: candidate.supportCount,
        holdoutEvidenceCount: holdoutEvidence.length,
        holdoutShapeMatchCount: holdoutShapeMatches.length,
      } : {
        method: packet.method,
        candidateId: cluster.id,
        score: null,
        reviewFlags: ['holdout_only_or_no_candidate_pool_evidence'],
        selectedForReview: false,
        candidateEvidenceCount: 0,
        holdoutEvidenceCount: holdoutEvidence.length,
        holdoutShapeMatchCount: 0,
      };
      if (cluster.status === 'active' && candidate && candidate.supportCount < 3) {
        cluster.status = 'unresolved';
        cluster.statusReason = 'voice_candidate_pool_lacks_cross_source_support';
      }
      if (cluster.status === 'active' && candidate?.reviewFlags.includes('name_swap_risk')) {
        cluster.status = 'unresolved';
        cluster.statusReason = 'voice_name_blind_distinctness_not_established';
      }
    });
    return [leadId, packet];
  }),
);

const clusterByKey = new Map(clusters.map(cluster => [`${cluster.leadId}:${cluster.family}:${cluster.clusterId}`, cluster]));
const ledgerEntries = pendingEntries.map(entry => {
  const supportedClusters = entry.contributions
    .map(contribution => clusterByKey.get(`${entry.leadId}:${contribution.family}:${contribution.clusterId}`))
    .filter(Boolean);
  const primaryCluster = entry.primary.quarantined
    ? undefined
    : clusterByKey.get(`${entry.leadId}:${entry.primary.family}:${entry.primary.clusterId}`);
  return {
    sourceFingerprint: entry.sourceFingerprint,
    sourceGroupFingerprint: entry.sourceGroupFingerprint,
    leadId: entry.leadId,
    voicePartition: entry.isVoiceHoldout ? 'holdout' : 'candidate_pool',
    disposition: entry.primary.quarantined ? 'quarantined' : 'accounted',
    quarantineReason: entry.primary.quarantined ? entry.primary.reason : null,
    primaryDisposition: primaryCluster ? {
      route: primaryCluster.route,
      kind: primaryCluster.kind,
      clusterId: primaryCluster.id,
    } : null,
    supportedClusterIds: [...new Set(supportedClusters.map(cluster => cluster.id))].sort(),
    contributedRoutes: [...new Set(supportedClusters.map(cluster => cluster.route))].sort(),
    sourceShape: entry.sourceShape,
  };
});

const assets = clusters.map(cluster => ({
  schemaVersion: 1,
  id: cluster.id,
  ownerScope: { kind: 'character', charId: cluster.charId },
  charId: cluster.charId,
  route: cluster.route,
  kind: cluster.kind,
  guidance: cluster.guidance,
  eligibleSurfaces: cluster.eligibleSurfaces,
  sourcePackId,
  sourceClusterId: cluster.id,
  sourceRefs: cluster.sourceFingerprints.slice(0, 3).map(sourceFingerprint => ({
    storeFamily: 'private_review',
    recordId: cluster.id,
    revision: 1,
    sourceFingerprint,
    sourcePackId,
  })),
  supportedSourceCount: cluster.supportedSourceCount,
  ...(cluster.voiceReview ? { voiceReview: cluster.voiceReview } : {}),
  conflictKey: cluster.conflictKey,
  revision: cluster.revision,
  review: {
    authority: cluster.authority,
    status: cluster.status,
    ...(cluster.status === 'active' ? {} : { reason: cluster.statusReason }),
    reviewedAt,
  },
}));

const countBy = (items, keyFor) => Object.fromEntries([...items.reduce((counts, item) => {
  const key = keyFor(item);
  counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}, new Map()).entries()].sort(([left], [right]) => String(left).localeCompare(String(right), 'zh-Hans-CN')));

const routeSummary = Object.fromEntries(Object.keys({
  voice_calibration: true,
  role_detail_claim: true,
  proactive_opening: true,
  scene_texture: true,
}).map(route => {
  const assetIds = new Set(assets.filter(asset => asset.route === route).map(asset => asset.id));
  const contributions = ledgerEntries.flatMap(entry => (
    entry.contributedRoutes.includes(route) ? [{ sourceFingerprint: entry.sourceFingerprint }] : []
  ));
  const routeAssets = assets.filter(asset => asset.route === route);
  return [route, {
    sourceContributions: contributions.length,
    uniqueSources: new Set(contributions.map(item => item.sourceFingerprint)).size,
    derivedAssets: routeAssets.length,
    activeAssets: routeAssets.filter(asset => asset.review.status === 'active').length,
    disabledAssets: routeAssets.filter(asset => asset.review.status === 'disabled').length,
    unresolvedAssets: routeAssets.filter(asset => asset.review.status === 'unresolved').length,
    assetIds: [...assetIds].sort(),
  }];
}));

const byLead = Object.fromEntries([...new Set(ledgerEntries.map(entry => entry.leadId))]
  .sort()
  .map(leadId => {
    const entries = ledgerEntries.filter(entry => entry.leadId === leadId);
    const leadAssets = assets.filter(asset => asset.charId === leadCharId[leadId]);
    return [leadId, {
      sources: entries.length,
      accountedSources: entries.filter(entry => entry.disposition === 'accounted').length,
      quarantinedSources: entries.filter(entry => entry.disposition === 'quarantined').length,
      multiRouteSources: entries.filter(entry => entry.contributedRoutes.length > 1).length,
      derivedAssets: leadAssets.length,
      activeAssets: leadAssets.filter(asset => asset.review.status === 'active').length,
      disabledAssets: leadAssets.filter(asset => asset.review.status === 'disabled').length,
      unresolvedAssets: leadAssets.filter(asset => asset.review.status === 'unresolved').length,
    }];
  }));

const sourceCount = ledgerEntries.length;
const accountedSourceCount = ledgerEntries.filter(entry => entry.disposition === 'accounted').length;
const quarantinedSourceCount = ledgerEntries.filter(entry => entry.disposition === 'quarantined').length;

const ledger = {
  schemaVersion: 2,
  sourcePackId,
  generatedAt: new Date().toISOString(),
  sourceManifest: {
    inputDigest: hash(JSON.stringify(input)),
    sourceCount,
    sourceCountsByLead: countBy(input.signals, source => source.leadId),
  },
  sourceConservation: {
    inputSourceCount: sourceCount,
    accountedSourceCount,
    quarantinedSourceCount,
    formula: 'inputSourceCount = accountedSourceCount + quarantinedSourceCount',
  },
  entries: ledgerEntries,
};

const workbench = {
  schemaVersion: 2,
  sourcePackId,
  generatedAt: new Date().toISOString(),
  sourceCount,
  clusters,
  assets,
};

const numericSummary = {
  schemaVersion: 2,
  sourceCount,
  sourceConservation: ledger.sourceConservation,
  multiRouteSourceCount: ledgerEntries.filter(entry => entry.contributedRoutes.length > 1).length,
  routeSummary,
  assetCount: assets.length,
  activeAssetCount: assets.filter(asset => asset.review.status === 'active').length,
  disabledAssetCount: assets.filter(asset => asset.review.status === 'disabled').length,
  unresolvedAssetCount: assets.filter(asset => asset.review.status === 'unresolved').length,
  privateSemanticReviewBatchCount: privateSemanticReviewBatches.length,
  byLead,
  voiceHoldout: Object.fromEntries(Object.entries(voiceReviewPackets).map(([leadId, packet]) => {
    const entries = pendingEntries.filter(entry => entry.leadId === leadId);
    const holdoutGroups = new Set(entries
      .filter(entry => entry.isVoiceHoldout)
      .map(entry => entry.sourceGroupFingerprint));
    const voiceEntries = entries.filter(entry => (
      entry.contributions.some(item => item.family === 'stable_character_voice')
    ));
    const voiceHoldoutGroups = new Set(voiceEntries
      .filter(entry => entry.isVoiceHoldout)
      .map(entry => entry.sourceGroupFingerprint));
    const voiceClusters = clusters.filter(cluster => (
      cluster.leadId === leadId && cluster.family === 'stable_character_voice'
    ));
    return [leadId, {
      nonHoldoutSourceUnits: entries.filter(entry => !entry.isVoiceHoldout).length,
      heldOutSourceUnits: entries.filter(entry => entry.isVoiceHoldout).length,
      heldOutSourceGroups: holdoutGroups.size,
      voiceCandidateEvidenceSources: voiceEntries.filter(entry => !entry.isVoiceHoldout).length,
      voiceHoldoutEvidenceSources: voiceEntries.filter(entry => entry.isVoiceHoldout).length,
      voiceHoldoutGroups: voiceHoldoutGroups.size,
      selectedVoiceCandidates: packet.selectedCandidateIds.length,
      holdoutShapeMatches: voiceClusters.reduce((sum, cluster) => (
        sum + Number(cluster.voiceReview?.holdoutShapeMatchCount || 0)
      ), 0),
      status: requiresNameBlindCalibration.has(leadId)
        ? 'requires_name_blind_calibration'
        : voiceHoldoutGroups.size > 0 && packet.reviewChecks.hasPositiveLowSignalPath
          ? 'ready_for_blind_render'
          : 'insufficient_holdout_or_voice_path',
    }];
  })),
};

const blindInputs = [
  {
    id: 'neutral_ordinary_share',
    userInput: '刚刚路上看到一件小事，忽然有点想和你说。',
  },
  {
    id: 'neutral_low_energy',
    userInput: '今天有点累，我想先安静一会儿。',
  },
  {
    id: 'neutral_reentry',
    userInput: '这几天有些忙，现在才回来。',
  },
];
const blindSubjects = [...new Set(pendingEntries.map(entry => entry.leadId))].sort().map(leadId => {
  const packet = voiceReviewPackets[leadId];
  const selected = new Set(packet.selectedCandidateIds);
  const selectedGuidance = packet.candidates
    .filter(candidate => selected.has(candidate.candidateId))
    .map(candidate => candidate.guidance);
  return {
    blindSubjectId: opaque(`${sourcePackId}\0${leadId}`, 'blind-subject'),
    leadId,
    selectedVoiceGuidance: selectedGuidance,
    holdout: numericSummary.voiceHoldout[leadId],
    holdoutGroupFingerprints: [...new Set(pendingEntries
      .filter(entry => entry.leadId === leadId && entry.isVoiceHoldout)
      .map(entry => entry.sourceGroupFingerprint))].sort(),
  };
});
const voiceBlindTestPlan = {
  schemaVersion: 1,
  sourcePackId,
  status: 'ready_for_blind_render',
  partitionRule: 'opaque_source_group_holdout; held-out groups do not enter language-fingerprint candidate pools',
  inputs: blindInputs,
  subjects: blindSubjects.map(subject => ({
    blindSubjectId: subject.blindSubjectId,
    leadId: subject.leadId,
    holdout: subject.holdout,
    holdoutGroupFingerprints: subject.holdoutGroupFingerprints,
  })),
  renderProtocol: {
    variantsPerSubjectAndInput: 2,
    instruction: 'Use only the supplied non-verbatim voice guidance. Do not quote or imitate source wording, do not name the source, and do not force a fixed reply structure.',
  },
  blindEvaluation: {
    raterReceives: 'blindSubjectId, the same neutral input, and two shuffled anonymous outputs per subject; never the character name or source excerpts.',
    checks: [
      'Can a rater sort outputs into stable but distinct anonymous voices without seeing names?',
      'Do two variants from one anonymous subject vary naturally without losing its attention pattern, pacing, or boundary posture?',
      'Does no output replay a held-out source phrase or collapse into a catchphrase list?',
    ],
    passRule: 'Record rater assignments, variation findings, and private no-replay check separately. A ready plan is not a passed live render.',
  },
};
const voiceBlindRenderRequest = {
  schemaVersion: 1,
  status: 'ready_for_blind_render',
  inputs: blindInputs,
  subjects: blindSubjects.map(subject => ({
    blindSubjectId: subject.blindSubjectId,
    voiceGuidance: subject.selectedVoiceGuidance,
  })),
  generationInstruction: voiceBlindTestPlan.renderProtocol.instruction,
};

const assertNoPrivateFields = (value) => {
  const serialized = JSON.stringify(value);
  for (const field of ['sourceTitle', 'sourceUrl', 'localPath', 'privateText', 'characterLines', 'userLines', 'optionTexts']) {
    if (serialized.includes(`\"${field}\"`)) throw new Error(`private field leaked into analysis output: ${field}`);
  }
};

assertNoPrivateFields(ledger);
assertNoPrivateFields(workbench);
assertNoPrivateFields(numericSummary);
assertNoPrivateFields(voiceReviewPackets);
assertNoPrivateFields(voiceBlindTestPlan);
assertNoPrivateFields(voiceBlindRenderRequest);

await mkdir(outDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outDir, 'coverage-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outDir, 'asset-workbench.json'), `${JSON.stringify(workbench, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outDir, 'numeric-summary.json'), `${JSON.stringify(numericSummary, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outDir, 'voice-review-packets.json'), `${JSON.stringify(voiceReviewPackets, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outDir, 'voice-blind-test-plan.json'), `${JSON.stringify(voiceBlindTestPlan, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outDir, 'voice-blind-render-request.json'), `${JSON.stringify(voiceBlindRenderRequest, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outDir, 'private-semantic-review-batches.json'), `${JSON.stringify(privateSemanticReviewBatches, null, 2)}\n`, 'utf8'),
]);

console.log(JSON.stringify({
  sourceCount,
  accountedSourceCount,
  quarantinedSourceCount,
  assetCount: numericSummary.assetCount,
  output: path.relative(ROOT, outDir),
}));
