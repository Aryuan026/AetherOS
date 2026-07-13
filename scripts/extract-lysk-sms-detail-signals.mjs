#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_IN_DIR = path.join(ROOT, 'research', 'lysk-raw', 'sms-detail-pages');
const DEFAULT_INDEX_FILE = path.join(ROOT, 'research', 'lysk-sms-crawl', 'review-candidates.json');
const DEFAULT_OUT_DIR = path.join(ROOT, 'research', 'lysk-reviewed-private');

const LEADS = [
  { id: 'shenxinghui', name: '沈星回' },
  { id: 'lishen', name: '黎深' },
  { id: 'qiyu', name: '祁煜' },
  { id: 'qinche', name: '秦彻' },
  { id: 'xiayizhou', name: '夏以昼' },
];

const HELP = `
Extract structural signals from locally cached Love and Deepspace BWiki SMS detail pages.

Usage:
  node scripts/extract-lysk-sms-detail-signals.mjs
  node scripts/extract-lysk-sms-detail-signals.mjs --in research/lysk-raw/sms-detail-pages --out research/lysk-reviewed-private

Notes:
  - Output stays in research/lysk-reviewed-private, which is ignored by git.
  - This script is for private review only; it does not promote canon dialogue into runtime.
`.trim();

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const inDir = path.resolve(ROOT, readArg('--in', DEFAULT_IN_DIR));
const outDir = path.resolve(ROOT, readArg('--out', DEFAULT_OUT_DIR));
const indexFile = path.resolve(ROOT, readArg('--index', DEFAULT_INDEX_FILE));

const decodeHtml = (value = '') => value
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const stripTags = (value = '') => decodeHtml(value
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

const slugify = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'item';

const isBlocked = (html) => /statusCode>\s*567|请求已被站点的安全策略拦截|Restricted Access/i.test(html);

const listFiles = async (root) => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && /\.(html?|txt)$/i.test(entry.name))
    .map(entry => path.join(entry.parentPath || root, entry.name))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
};

const inferLeadFromPath = (file) => {
  const relative = path.relative(inDir, file);
  const [leadPart] = relative.split(path.sep);
  return LEADS.find(lead => lead.id === leadPart || lead.name === leadPart) || null;
};

const inferLeadFromHtml = (html) => {
  const plain = stripTags(html.slice(0, 250000));
  return LEADS.find(lead => plain.includes(lead.name)) || null;
};

const parseMessageName = (html) => {
  const match = html.match(/<div\b[^>]*class=(["'])[^"']*\bMessageName\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/i);
  const text = stripTags(match?.[2] || '');
  const [leadAndRest, maybeMeta] = text.split('：');
  const lead = LEADS.find(item => leadAndRest?.includes(item.name));
  const title = leadAndRest?.replace(lead?.name || '', '').trim();
  return {
    lead,
    title: title || undefined,
    unlockHint: maybeMeta?.trim() || undefined,
    raw: text || undefined,
  };
};

const extractClassDivs = (html, className) => {
  const regex = new RegExp(`<div\\b([^>]*)class=(["'])[^"']*\\b${className}\\b[^"']*\\2([^>]*)>([\\s\\S]*?)<\\/div>`, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(html))) {
    matches.push({
      index: match.index,
      text: stripTags(match[4]),
    });
  }
  return matches.filter(item => item.text);
};

const extractMessages = (html) => {
  const left = extractClassDivs(html, 'MessageLeft').map(item => ({ ...item, role: 'character' }));
  const right = extractClassDivs(html, 'MessageRight').map(item => ({ ...item, role: 'user' }));
  return [...left, ...right].sort((a, b) => a.index - b.index);
};

const extractButtons = (html) => {
  const regex = /<div\b([^>]*)class=(["'])[^"']*\bbtn\b[^"']*\2([^>]*)>([\s\S]*?)<\/div>/gi;
  const matches = [];
  let match;
  while ((match = regex.exec(html))) {
    const text = stripTags(match[4]);
    if (text) matches.push({ index: match.index, text });
  }
  return matches;
};

const classifyDirection = (messages, switchCount) => {
  const firstRole = messages[0]?.role;
  if (firstRole === 'character') return 'character_opens';
  if (firstRole === 'user') return 'user_opens';
  if (switchCount > 0) return 'branch_reply';
  return 'unknown';
};

const keywordTags = (title, text) => {
  const sample = `${title} ${text}`;
  const tags = [];
  const rules = [
    ['care', /吃饭|睡|晚安|早安|休息|生病|药|冷|热|天气|回家|到家/],
    ['work', /工作|任务|业务|值班|会议|训练|猎人|上班|加班/],
    ['outing', /出门|路过|海|散步|电影|影院|约会|见面|回来|船|风景/],
    ['gift', /礼物|送|花|包裹|快递|纪念/],
    ['tease', /拒绝|不许|不会|当然|聪明|笨|逗|骗|夸/],
    ['food', /吃|饭|早餐|午餐|晚餐|甜|咖啡|茶|果汁|烤肉/],
    ['combat', /战斗|流浪体|芯核|训练|猎人/],
    ['photo', /照片|拍照|相片|镜头|自拍/],
    ['festival', /生日|节日|新年|纪念日|圣诞|七夕/],
  ];
  for (const [tag, regex] of rules) {
    if (regex.test(sample)) tags.push(tag);
  }
  return tags;
};

const riskFlagsFor = ({ title, unlockHint, messages, buttons, switchCount, totalTextLength }) => {
  const text = messages.map(item => item.text).join(' ');
  const flags = ['private_raw_review_only'];
  if (messages[0]?.role === 'user') flags.push('user_opens');
  if (switchCount > 0 || buttons.length > 0) flags.push('branch_dependent');
  if (messages.length > 12 || totalTextLength > 650) flags.push('long_dialogue');
  if (/生日|节日|活动|卡面|剧情|主线|约会/.test(`${title} ${unlockHint} ${text}`)) flags.push('event_specific');
  if (/心动\d+级|羁绊|牵绊/.test(unlockHint || '')) flags.push('relationship_gate');
  if (/战斗|流浪体|芯核|猎人/.test(`${title} ${text}`)) flags.push('worldview_specific');
  if (/照片|表情|贴纸|图片|语音|视频/.test(text)) flags.push('media_context');
  return [...new Set(flags)];
};

const decideUse = ({ direction, charLineCount, userLineCount, switchCount, totalTextLength, sceneTags, riskFlags }) => {
  if (direction === 'user_opens') return 'language_fingerprint';
  if (charLineCount === 0) return 'discard';
  if (riskFlags.includes('event_specific') && totalTextLength > 400) return 'language_fingerprint';
  if (direction === 'character_opens' && charLineCount <= 4 && totalTextLength <= 360) return 'topic_seed';
  if (direction === 'character_opens' && sceneTags.some(tag => ['care', 'work', 'outing', 'food', 'gift', 'tease'].includes(tag))) return 'topic_seed';
  if (userLineCount > 0 || switchCount > 0) return 'language_fingerprint';
  return 'topic_seed';
};

const reviewNoteFor = ({ use, direction, riskFlags, charLineCount }) => {
  if (use === 'discard') return '结构缺失或无法稳定转成主动来信。';
  if (direction === 'user_opens') return '玩家先开口，不适合直接来信；可只抽男主回应习惯。';
  if (riskFlags.includes('branch_dependent') || riskFlags.includes('long_dialogue')) return '含玩家选项或长分支，只能提炼主题和语气，禁止逐字作为主动来信。';
  if (use === 'topic_seed' && charLineCount <= 4) return '男主先开口且短，适合人工复核后转成主动话题种子。';
  return '适合抽取语气、节奏和小坚持，暂不建议直接发送原句。';
};

const screeningTierFor = ({ use, direction, riskFlags, charLineCount, userLineCount, totalTextLength }) => {
  if (use === 'discard') return 'discard';
  if (use === 'language_fingerprint') return 'voice_only';
  if (direction !== 'character_opens') return 'voice_only';
  const cleanShape = !riskFlags.includes('branch_dependent')
    && !riskFlags.includes('long_dialogue')
    && userLineCount === 0
    && charLineCount <= 3
    && totalTextLength <= 260;
  return cleanShape ? 'ready_seed' : 'rewrite_seed';
};

const runtimeShapeFor = ({ use, screeningTier }) => {
  if (screeningTier === 'ready_seed') return 'topic_seed';
  if (screeningTier === 'rewrite_seed') return 'topic_seed_rewrite';
  if (use === 'language_fingerprint') return 'language_fingerprint';
  return 'discard';
};

const readIndex = async () => {
  try {
    const items = JSON.parse(await readFile(indexFile, 'utf8'));
    const map = new Map();
    for (const item of items) {
      map.set(`${item.leadId}/${slugify(item.sourceTitle)}`, item);
      map.set(`${item.leadName}/${item.sourceTitle}`, item);
    }
    return map;
  } catch {
    return new Map();
  }
};

const sourceKeyFor = (file, lead, title) => {
  const relative = path.relative(inDir, file);
  const noExt = relative.replace(/\.[^.]+$/, '');
  return `${lead?.id || path.dirname(relative)}/${slugify(title || path.basename(noExt))}`;
};

const parseDetailFile = async (file, indexMap) => {
  const html = await readFile(file, 'utf8');
  const blocked = isBlocked(html);
  const messageName = parseMessageName(html);
  const pathLead = inferLeadFromPath(file);
  const htmlLead = messageName.lead || inferLeadFromHtml(html);
  const lead = pathLead || htmlLead;
  const sourceTitle = messageName.title || decodeHtml(path.basename(file, path.extname(file)));
  const sourceKey = sourceKeyFor(file, lead, sourceTitle);
  const indexed = indexMap.get(sourceKey) || indexMap.get(`${lead?.name}/${sourceTitle}`) || {};

  if (blocked) {
    return {
      id: `${lead?.id || 'unknown'}-${slugify(sourceTitle)}`,
      leadId: lead?.id || 'unknown',
      leadName: lead?.name || 'unknown',
      sourceTitle,
      sourceUrl: indexed.sourceUrl,
      localPath: path.relative(ROOT, file),
      sourceStatus: 'blocked',
      use: 'discard',
      riskFlags: ['blocked'],
    };
  }

  const messages = extractMessages(html);
  const buttons = extractButtons(html);
  const switchCount = (html.match(/<div\b[^>]*class=(["'])[^"']*\bSwitchContainer\b[^"']*\1/gi) || []).length;
  const characterLines = messages.filter(item => item.role === 'character').map(item => item.text);
  const userLines = messages.filter(item => item.role === 'user').map(item => item.text);
  const totalTextLength = messages.reduce((sum, item) => sum + item.text.length, 0);
  const direction = classifyDirection(messages, switchCount);
  const sceneTags = keywordTags(sourceTitle, messages.map(item => item.text).join(' '));
  const riskFlags = riskFlagsFor({
    title: sourceTitle,
    unlockHint: messageName.unlockHint || indexed.unlockHint,
    messages,
    buttons,
    switchCount,
    totalTextLength,
  });
  const use = decideUse({
    direction,
    charLineCount: characterLines.length,
    userLineCount: userLines.length,
    switchCount,
    totalTextLength,
    sceneTags,
    riskFlags,
  });
  const screeningTier = screeningTierFor({
    use,
    direction,
    riskFlags,
    charLineCount: characterLines.length,
    userLineCount: userLines.length,
    totalTextLength,
  });
  const suggestedRuntimeShape = runtimeShapeFor({ use, screeningTier });

  return {
    id: `${lead?.id || 'unknown'}-${slugify(sourceTitle)}`,
    leadId: lead?.id || 'unknown',
    leadName: lead?.name || 'unknown',
    sourceTitle,
    sourceUrl: indexed.sourceUrl,
    sourceCategory: indexed.sourceCategory,
    unlockHint: messageName.unlockHint || indexed.unlockHint,
    localPath: path.relative(ROOT, file),
    sourceStatus: 'cached_raw',
    conversationDirection: direction,
    use,
    screeningTier,
    sceneTags,
    riskFlags,
    stats: {
      turnCount: messages.length,
      characterLineCount: characterLines.length,
      userLineCount: userLines.length,
      optionCount: buttons.length,
      switchCount,
      totalTextLength,
    },
    review: {
      note: reviewNoteFor({ use, direction, riskFlags, charLineCount: characterLines.length }),
      directMessageAllowedByDefault: false,
      suggestedRuntimeShape,
    },
    privateText: {
      // Ignored private output only. Kept so later screening can preserve tiny voice features without rereading HTML.
      firstCharacterLine: characterLines[0],
      characterLines,
      userLines,
      optionTexts: buttons.map(item => item.text),
    },
    cooldownDays: use === 'topic_seed' ? 45 : 0,
    maxUses: use === 'topic_seed' ? 3 : 0,
  };
};

const groupBy = (items, keyFn) => {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFn(item);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  return grouped;
};

const countBy = (items, keyFn) => {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};

const writeSummary = async (signals) => {
  const byLead = [...groupBy(signals, item => item.leadName).entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'));
  const lines = [
    '# BWiki 短信详情结构抽取摘要',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '说明：本文件只统计结构和筛选方向，不收录原文台词。含原文的私有表在同目录 JSON 中，且该目录已被 git 忽略。',
    '',
    '## 总览',
    '',
    `- 已解析详情页：${signals.length}`,
    `- 用途分布：${JSON.stringify(countBy(signals, item => item.use))}`,
    `- 筛选层级：${JSON.stringify(countBy(signals, item => item.screeningTier || 'unknown'))}`,
    `- 运行形态：${JSON.stringify(countBy(signals, item => item.review?.suggestedRuntimeShape || 'unknown'))}`,
    `- 对话方向：${JSON.stringify(countBy(signals, item => item.conversationDirection || 'unknown'))}`,
    '',
    '## 分角色',
    '',
  ];

  for (const [leadName, items] of byLead) {
    const topicSeeds = items.filter(item => item.use === 'topic_seed').slice(0, 12).map(item => item.sourceTitle).join('、') || '暂无';
    const fingerprints = items.filter(item => item.use === 'language_fingerprint').slice(0, 12).map(item => item.sourceTitle).join('、') || '暂无';
    lines.push(`### ${leadName}`);
    lines.push('');
    lines.push(`- 数量：${items.length}`);
    lines.push(`- 用途：${JSON.stringify(countBy(items, item => item.use))}`);
    lines.push(`- 筛选层级：${JSON.stringify(countBy(items, item => item.screeningTier || 'unknown'))}`);
    lines.push(`- 运行形态：${JSON.stringify(countBy(items, item => item.review?.suggestedRuntimeShape || 'unknown'))}`);
    lines.push(`- 方向：${JSON.stringify(countBy(items, item => item.conversationDirection || 'unknown'))}`);
    lines.push(`- 话题种子候选标题：${topicSeeds}`);
    lines.push(`- 语气指纹候选标题：${fingerprints}`);
    lines.push('');
  }

  await writeFile(path.join(outDir, 'detail-signal-summary.md'), `${lines.join('\n')}\n`, 'utf8');
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  const indexMap = await readIndex();
  const files = await listFiles(inDir);
  const signals = [];
  for (const file of files) {
    signals.push(await parseDetailFile(file, indexMap));
  }
  signals.sort((a, b) => `${a.leadName}/${a.sourceTitle}`.localeCompare(`${b.leadName}/${b.sourceTitle}`, 'zh-Hans-CN'));

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      detailDir: path.relative(ROOT, inDir),
      indexFile: path.relative(ROOT, indexFile),
    },
    counts: {
      pages: signals.length,
      byLead: countBy(signals, item => item.leadName),
      byUse: countBy(signals, item => item.use),
      byDirection: countBy(signals, item => item.conversationDirection || 'unknown'),
    },
    signals,
  };

  await writeFile(path.join(outDir, 'detail-signals.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeSummary(signals);
  console.log(`Extracted ${signals.length} detail pages to ${path.relative(ROOT, outDir)}`);
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
