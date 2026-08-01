#!/usr/bin/env node

/**
 * Compile the raw-free private idle-opener artifact into the public runtime
 * library. The output deliberately omits source dispositions, source refs,
 * review notes, titles, URLs and local paths.
 *
 * Usage:
 *   node scripts/generate-built-in-idle-opener-runtime.mjs --in /private/artifact.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const inputArg = arg('--in');
if (!inputArg) throw new Error('--in private raw-free artifact is required');

const inputFile = path.resolve(inputArg);
const outputFile = path.resolve(arg('--out') || path.join(
  ROOT,
  'domain',
  'companionMaterial',
  'builtInDeepspaceIdleOpeners.ts',
));
const artifact = JSON.parse(await readFile(inputFile, 'utf8'));

if (
  artifact?.schemaVersion !== 2
  || artifact?.artifactKind !== 'private_direct_idle_opener_library'
  || artifact?.sourceConservation?.totalSources !== 909
  || artifact?.sourceConservation?.touchedSources !== 909
  || Number(artifact?.sourceConservation?.readyDirectSources || 0)
    + Number(artifact?.sourceConservation?.rewriteToDirectSources || 0)
    + Number(artifact?.sourceConservation?.rejectedSources || 0) !== 909
  || artifact?.privacy?.rawTextIncluded !== false
  || artifact?.privacy?.titlesIncluded !== false
  || artifact?.privacy?.urlsIncluded !== false
  || artifact?.privacy?.localPathsIncluded !== false
  || artifact?.productContentCheck?.result !== 'pass'
  || artifact?.compilationContract?.runtimeStatus !== 'not_connected'
) throw new Error('input is not the closed 909-source idle-opener artifact');

const CHAR_IDS = {
  qiyu: 'builtin-daily-companion',
  lishen: 'builtin-zayne',
  qinche: 'builtin-sylus',
  shenxinghui: 'builtin-xavier',
  xiayizhou: 'builtin-caleb',
};
const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const forbidden = /(https?:\/\/|\/Users\/|sourceTitle|sourceUrl|localPath|PRIVATE EVIDENCE|角色：|对方：|用户：|选项：|\b(?:user|assistant|char)\s*:)/i;
const directReviewLeak = /(?:静置.{0,6}(?:六|6)小时|中文开场|单独发出|无需逐字|逐字翻译|非实时决策|测试结果|审读|候选|来源|模型生成|工具调用|调用工具|运行时|编译|API|接口|private[_ -]?(?:raw|dialogue|review)|non[- ]?verbatim)/i;
const rewritePlaceholder = /(?:private[_ -]?(?:raw|dialogue|review)|short\s+non[- ]?verbatim|semantic[_ -]?cluster|私有短信单页审读|短非(?:语句|verbatim)|仅\s*rewrite(?:_to_direct)?|无当前事实的改写方向|工具调用|调用工具|运行时|编译|API|接口)/i;
const productPromptLeak = /(?:\d+\s*(?:到|[-—~～])\s*\d+\s*字|字的消息|原创具体互动意图|^(?:直接|直发|改写|重写)\s*[：:])/i;
const directSystemAction = /(?:尝试联系(?:朋友|对方|用户)|确认(?:信息|情况)(?:是否|有无)|向(?:朋友|对方|用户)发起|系统(?:发送|生成|提醒))/i;
const inventedCurrentFact = /(?:下周末有|在(?:拍卖会|会场|现场|医院|画室|公司)(?:现场)?|你最近是不是(?:在|有)|你最近在|刚刚(?:结束|完成|到达)|昨晚(?:发生|去了|做了))/i;
const rewriteFirstPersonFact = /(?:^|[，。；：:])\s*我(?:正在|刚刚|已经|会在|下周|今天|昨晚|最近)/;
const rewriteUserDirective = /(?:让|要求|催促|命令)用户(?:去|做|回答|回复|选择|确认)/;
const genericRewriteWrapper = /^从「[^」]+」出发，?轻松地抛出一个可接可停的小互动/;
const unresolvedProductPlaceholder = /(?:自然完整中文消息|具体创作方向\s*[：:]?)/i;
const truncatedRewrite = /(?:和你|以及你|关于你|比如你|顺便你)$/;
const rewriteAssumedFact = /(?:你(?:发现|注意到|最近(?:参与|尝试|买|做|去了|开始)|给自己|给新创造的)|我们共同经历|丢失的.{0,18}找到了|分享那只.{0,12}的新生活)/;
const rewriteLooksLikeUserFacingLine = /^(?:你|我|我们|下次|回去|带上你的|找个时间|试试|提前准备|在家躺着时|挑选几个|给魔镜|去临空市)/;
const genericGuidanceStyleShell = /(?:^轻柔分享\s*[：:]|轻松互动|抛出一个可接可停的小互动|多聊聊这些.{0,32}比如你最近喜欢哪种|用户|玩家)/;
const rewriteSecondPersonPromptObject = /(?:想听你|聊聊你|分享一下你的|回忆一下.{0,24}你的)/;
const rewriteLooksLikeDialogue = /[？！?!“”‘’"']/;
const exactPlaceholder = /^(?:无|rewrite|other|其他|unknown|n\/?a)$/i;
const allowedOpenerClasses = new Set([
  'light_question',
  'small_choice',
  'low_pressure_share',
  'playful_prompt',
  'gentle_care',
  'reentry',
  'other',
]);
const candidates = Array.isArray(artifact.candidates) ? artifact.candidates : [];
const expectedCandidateCount = Number(artifact?.compilationContract?.directMessage?.sourceCandidates || 0)
  + Number(artifact?.compilationContract?.rewriteSeed?.sourceCandidates || 0);
if (!candidates.length || candidates.length !== expectedCandidateCount) {
  throw new Error(`candidate count mismatch: expected ${expectedCandidateCount}, got ${candidates.length}`);
}

const direct = [];
const rewrite = [];
for (const candidate of candidates) {
  const charId = CHAR_IDS[candidate.leadId];
  if (!charId || !/^lysk-idle-[a-f0-9]{20}$/.test(candidate.candidateId || '')) {
    throw new Error('candidate identity is not public-runtime safe');
  }
  const semanticCluster = text(candidate.semanticCluster);
  const cooldownDays = Number(candidate.cooldownDays);
  if (
    !allowedOpenerClasses.has(candidate.openerClass)
    || !semanticCluster
    || semanticCluster.length > 48
    || directReviewLeak.test(semanticCluster)
    || rewritePlaceholder.test(semanticCluster)
    || exactPlaceholder.test(semanticCluster)
    || !Number.isFinite(cooldownDays)
    || cooldownDays < 60
  ) throw new Error(`unsafe retrieval labels on ${candidate.candidateId}`);
  const common = {
    id: candidate.candidateId,
    charId,
    openerClass: candidate.openerClass,
    semanticCluster,
    cooldownMs: cooldownDays * 24 * 60 * 60 * 1000,
  };
  if (candidate.candidateKind === 'direct_message') {
    const line = text(candidate.nonVerbatimDirectLine);
    if (
      !line
      || line.length > 56
      || candidate.maxUses !== 1
      || candidate.contextIndependence !== 'independent'
      || candidate.currentFactRisk !== 'none'
      || candidate.branchDependency !== 'none'
      || forbidden.test(line)
      || directReviewLeak.test(line)
      || productPromptLeak.test(line)
      || unresolvedProductPlaceholder.test(line)
      || directSystemAction.test(line)
      || inventedCurrentFact.test(line)
    ) throw new Error(`unsafe direct candidate ${candidate.candidateId}`);
    direct.push({ ...common, text: line, maxDeliveries: 1 });
    continue;
  }
  if (candidate.candidateKind === 'rewrite_seed') {
    const guidance = text(candidate.rewriteBrief);
    if (
      !guidance
      || guidance.length > 220
      || candidate.maxUses !== null
      || candidate.contextIndependence !== 'rewritten_independent'
      || candidate.currentFactRisk !== 'rewritten_away'
      || candidate.branchDependency !== 'rewritten_away'
      || cooldownDays < 120
      || forbidden.test(guidance)
      || rewritePlaceholder.test(guidance)
      || exactPlaceholder.test(guidance)
      || productPromptLeak.test(guidance)
      || unresolvedProductPlaceholder.test(guidance)
      || inventedCurrentFact.test(guidance)
      || rewriteFirstPersonFact.test(guidance)
      || rewriteUserDirective.test(guidance)
      || genericRewriteWrapper.test(guidance)
      || truncatedRewrite.test(guidance)
      || rewriteAssumedFact.test(guidance)
      || rewriteLooksLikeUserFacingLine.test(guidance)
      || genericGuidanceStyleShell.test(guidance)
      || rewriteSecondPersonPromptObject.test(guidance)
      || rewriteLooksLikeDialogue.test(guidance)
    ) throw new Error(`unsafe rewrite candidate ${candidate.candidateId}`);
    rewrite.push({ ...common, guidance });
    continue;
  }
  throw new Error(`unsupported candidate kind ${candidate.candidateKind}`);
}

const parts = [
  "import {",
  "  COMPANION_MATERIAL_SCHEMA_VERSION,",
  "  type CompanionMaterialRecord,",
  "} from './types.ts';",
  '',
  '/**',
  ' * Generated from a private, raw-free 909-source review artifact.',
  ' *',
  ' * This public runtime file contains only non-verbatim direct lines and',
  ' * rewrite guidance. It intentionally contains no source dialogue, title, URL,',
  ' * local path, source disposition or private evidence pointer.',
  ' */',
  'const REVIEWED_AT = Date.UTC(2026, 7, 1);',
  "const RUNTIME_PACK_ID = 'lysk-idle-opener-runtime-v1';",
  '',
  'export interface BuiltInIdleDirectLine {',
  '  id: string;',
  '  charId: string;',
  '  text: string;',
  '  openerClass: string;',
  '  semanticCluster: string;',
  '  cooldownMs: number;',
  '  maxDeliveries: 1;',
  '}',
  '',
  `const DIRECT_SPECS = ${JSON.stringify(direct, null, 2)} as const satisfies readonly BuiltInIdleDirectLine[];`,
  '',
  `const REWRITE_SPECS = ${JSON.stringify(rewrite, null, 2)} as const;`,
  '',
  'export const BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES: readonly BuiltInIdleDirectLine[] = DIRECT_SPECS;',
  '',
  'export const BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL: readonly CompanionMaterialRecord[] = REWRITE_SPECS.map(spec => ({',
  '  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,',
  '  id: spec.id,',
  "  ownerScope: { kind: 'character', charId: spec.charId },",
  '  charId: spec.charId,',
  "  kind: 'proactive_seed',",
  "  slot: 'proactive_seeds',",
  '  guidance: spec.guidance,',
  "  renderPolicy: 'transform_required',",
  "  knowledge: 'char_private',",
  "  continuity: 'canon',",
  "  eligibleModes: ['proactive_letter'],",
  "  eligiblePurposes: ['proactive_intent'],",
  "  tags: [...new Set(['proactive_intent', 'opening', spec.openerClass, spec.semanticCluster].filter(Boolean))],",
  '  retrievalHints: {',
  "    activationPolicy: 'relevance_required',",
  "    positiveSignals: ['proactive_intent', 'opening'],",
  "    suppressSignals: ['care_needed'],",
  "    variationGroup: 'idle_' + spec.id.slice(-20),",
  '    fallbackPriority: 0,',
  '  },',
  '  groundingPolicy: {',
  "    allOf: [",
  "      { kind: 'wakeup_rule', claimKey: 'proactive_intent' },",
  "      { kind: 'wakeup_rule', claimKey: 'hidden_words_enabled' },",
  "    ],",
  '  },',
  '  cooldownMs: spec.cooldownMs,',
  '  sourceRefs: [{',
  "    storeFamily: 'built_in_runtime',",
  '    recordId: spec.id,',
  '    revision: 1,',
  "    sourceFingerprint: 'compiled-' + spec.id,",
  '    sourcePackId: RUNTIME_PACK_ID,',
  '  }],',
  "  status: 'active',",
  '  createdAt: REVIEWED_AT,',
  '  updatedAt: REVIEWED_AT,',
  '  revision: 1,',
  '}));',
  '',
  'export const builtInDeepspaceIdleDirectLinesForCharacter = (',
  '  charId: string,',
  '): readonly BuiltInIdleDirectLine[] => (',
  '  BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES.filter(line => line.charId === charId)',
  ');',
  '',
  'export const builtInDeepspaceIdleRewriteMaterialForCharacter = (',
  '  charId: string,',
  '): readonly CompanionMaterialRecord[] => (',
  '  BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL.filter(record => record.charId === charId)',
  ');',
  '',
];

await writeFile(outputFile, parts.join('\n'), 'utf8');
console.log(JSON.stringify({
  output: path.relative(ROOT, outputFile),
  sourceCount: 909,
  directMessageCount: direct.length,
  rewriteSeedCount: rewrite.length,
}, null, 2));
