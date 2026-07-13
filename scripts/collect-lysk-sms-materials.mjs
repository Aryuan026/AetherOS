#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'research', 'lysk-sms-crawl');

const LEADS = [
  { id: 'shenxinghui', name: '沈星回', urls: ['https://wiki.biligame.com/lysk/短信/沈星回', 'https://wiki.biligame.com/lysk/沈星回:短信'] },
  { id: 'lishen', name: '黎深', urls: ['https://wiki.biligame.com/lysk/短信/黎深', 'https://wiki.biligame.com/lysk/黎深:短信'] },
  { id: 'qiyu', name: '祁煜', urls: ['https://wiki.biligame.com/lysk/短信/祁煜', 'https://wiki.biligame.com/lysk/祁煜:短信'] },
  { id: 'qinche', name: '秦彻', urls: ['https://wiki.biligame.com/lysk/短信/秦彻', 'https://wiki.biligame.com/lysk/秦彻:短信'] },
  { id: 'xiayizhou', name: '夏以昼', urls: ['https://wiki.biligame.com/lysk/短信/夏以昼', 'https://wiki.biligame.com/lysk/夏以昼:短信'] },
];

const HELP = `
Collect Love and Deepspace BWiki SMS indexes into a local ignored workspace.

Usage:
  node scripts/collect-lysk-sms-materials.mjs
  node scripts/collect-lysk-sms-materials.mjs --from-dir /path/to/saved-html
  node scripts/collect-lysk-sms-materials.mjs --out research/lysk-sms-crawl

Notes:
  - Raw HTML and crawl output are ignored by git.
  - If the site blocks scripted access, save pages from a browser and rerun with --from-dir.
  - This script creates indexes and review scaffolds; it does not promote canon text into runtime.
`.trim();

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const readArg = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const outDir = path.resolve(ROOT, readArg('--out', DEFAULT_OUT_DIR));
const fromDir = readArg('--from-dir');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const decodeHtml = (value = '') => value
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const stripTags = (value = '') => decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

const getAttr = (tag, name) => {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[2] || match?.[3] || match?.[4] || '');
};

const slugify = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'item';

const isBlocked = (html) => /statusCode>\s*567|请求已被站点的安全策略拦截|Restricted Access/i.test(html);

const inferLead = (sourceName, html) => {
  const haystack = `${sourceName}\n${html.slice(0, 5000)}`;
  return LEADS.find(lead => haystack.includes(lead.name)) || null;
};

const inferUse = (title, text) => {
  const sample = `${title} ${text}`;
  if (/生日|纪念|约会|剧情|主线|结局|任务/.test(sample)) return 'language_fingerprint';
  if (/提醒|吃饭|晚安|睡|早安|路过|看到|想起/.test(sample)) return 'topic_seed';
  return 'topic_seed';
};

const inferDirection = (text) => {
  if (/玩家|你：|我：|回复|选项/.test(text)) return 'branch_reply';
  if (/他说|她说|短信/.test(text)) return 'unknown';
  return 'unknown';
};

const findNearestCategory = (html, index) => {
  const before = html.slice(0, index);
  const matches = [...before.matchAll(/<div\b[^>]*class=(["'])[^"']*tab-pane[^"']*\1[^>]*id=(["'])-([^"']+)\2/gi)];
  return decodeHtml(matches.at(-1)?.[3] || '');
};

const buildSmsDetailUrl = (lead, title) => {
  if (!lead?.name || !title) return undefined;
  return `https://wiki.biligame.com/lysk/${encodeURIComponent(lead.name)}/短信/${encodeURIComponent(title)}`;
};

const parseSelectionItems = ({ html, sourceName, sourceUrl }) => {
  const lead = inferLead(sourceName, html);
  const items = [];
  const regex = /<li\b([^>]*)class=(["'])[^"']*selection-li[^"']*\2([^>]*)>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const attrs = `${match[1]} ${match[3]}`;
    const body = match[4];
    const title = getAttr(attrs, 'title') || stripTags(body);
    const dataParam = getAttr(attrs, 'data-param');
    if (!title) continue;
    const text = stripTags(body);
    const id = `${lead?.id || 'unknown'}-${slugify(dataParam || title)}`;
    const category = findNearestCategory(html, match.index);
    items.push({
      id,
      leadId: lead?.id || 'unknown',
      leadName: lead?.name || 'unknown',
      sourceTitle: title,
      sourceUrl: buildSmsDetailUrl(lead, dataParam || title) || sourceUrl,
      sourceCategory: category || undefined,
      unlockHint: undefined,
      conversationDirection: inferDirection(text),
      use: inferUse(title, text),
      sceneTags: [],
      relationshipGate: undefined,
      timeGate: undefined,
      topicSeed: undefined,
      voiceHints: [],
      directLine: undefined,
      rawTextRef: sourceName,
      sourceStatus: 'indexed',
      riskFlags: [],
      cooldownDays: 90,
      maxUses: 1,
      retireAfterUses: 1,
    });
  }
  return items;
};

const parseHtml = ({ html, sourceName, sourceUrl }) => {
  if (isBlocked(html)) {
    return {
      blocked: true,
      sourceName,
      sourceUrl,
      candidates: [],
    };
  }
  const candidates = parseSelectionItems({ html, sourceName, sourceUrl });
  return {
    blocked: false,
    sourceName,
    sourceUrl,
    candidates,
  };
};

const fetchHtml = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 AetherOS material indexer; local research; contact: private',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    },
  });
  const html = await response.text();
  return { status: response.status, html };
};

const collectFromWeb = async () => {
  const sources = [];
  for (const lead of LEADS) {
    for (const url of lead.urls) {
      await sleep(1600);
      try {
        const { status, html } = await fetchHtml(url);
        sources.push({ sourceName: `${lead.name}-${new URL(url).pathname}`, sourceUrl: url, status, html });
      } catch (error) {
        sources.push({ sourceName: `${lead.name}-${url}`, sourceUrl: url, status: 'error', error: String(error?.message || error), html: '' });
      }
    }
  }
  return sources;
};

const collectFromDir = async (dir) => {
  const root = path.resolve(dir);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const htmlFiles = entries
    .filter(entry => entry.isFile() && /\.(html?|txt)$/i.test(entry.name))
    .map(entry => path.join(entry.parentPath || root, entry.name));
  const sources = [];
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    sources.push({ sourceName: path.relative(root, file), sourceUrl: undefined, status: 'local_file', html });
  }
  return sources;
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  const sources = fromDir ? await collectFromDir(fromDir) : await collectFromWeb();
  const parsed = sources.map(source => ({
    ...source,
    html: undefined,
    ...parseHtml(source),
  }));
  const candidates = parsed.flatMap(item => item.candidates);
  const blockedSources = parsed.filter(item => item.blocked || item.status === 'error').map(item => ({
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    status: item.status,
    blocked: item.blocked,
    error: item.error,
  }));
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: fromDir ? { kind: 'local_dir', path: path.resolve(fromDir) } : { kind: 'web', leads: LEADS.map(({ id, name, urls }) => ({ id, name, urls })) },
    counts: {
      sources: parsed.length,
      blockedSources: blockedSources.length,
      candidates: candidates.length,
    },
    candidates,
    blockedSources,
  };

  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outDir, 'review-candidates.json'), `${JSON.stringify(candidates, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${candidates.length} candidates to ${path.relative(ROOT, outDir)}`);
  if (blockedSources.length) {
    console.log(`Blocked/error sources: ${blockedSources.length}. Save pages in a browser and rerun with --from-dir when needed.`);
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
