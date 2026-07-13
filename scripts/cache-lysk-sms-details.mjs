#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INDEX_FILE = path.join(ROOT, 'research', 'lysk-sms-crawl', 'review-candidates.json');
const DEFAULT_OUT_DIR = path.join(ROOT, 'research', 'lysk-raw', 'sms-detail-pages');
const DEFAULT_REPORT_FILE = path.join(ROOT, 'research', 'lysk-raw', 'sms-detail-cache-report.json');

const HELP = `
Cache Love and Deepspace BWiki SMS detail pages via MediaWiki parse API.

Usage:
  node scripts/cache-lysk-sms-details.mjs
  node scripts/cache-lysk-sms-details.mjs --limit 40
  node scripts/cache-lysk-sms-details.mjs --lead qiyu --force
  node scripts/cache-lysk-sms-details.mjs --lead qiyu --limit 10 --initial-delay-ms 60000 --delay-ms 8000

Notes:
  - Raw output stays under research/lysk-raw/, which is ignored by git.
  - The script is resumable and skips existing files unless --force is used.
  - It stops on an EdgeOne block response by default. Pass --no-stop-on-block only for debugging.
  - It intentionally writes raw HTML only to the ignored research cache, never into runtime assets.
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

const indexFile = path.resolve(ROOT, readArg('--index', DEFAULT_INDEX_FILE));
const outDir = path.resolve(ROOT, readArg('--out', DEFAULT_OUT_DIR));
const reportFile = path.resolve(ROOT, readArg('--report', DEFAULT_REPORT_FILE));
const limit = Number(readArg('--limit', '0')) || Infinity;
const leadFilter = readArg('--lead', '');
const force = args.includes('--force');
const delayMs = Number(readArg('--delay-ms', '450')) || 450;
const initialDelayMs = Number(readArg('--initial-delay-ms', '0')) || 0;
const fetchTimeoutMs = Number(readArg('--fetch-timeout-ms', '8000')) || 8000;
const curlMaxTimeSeconds = Number(readArg('--curl-max-time', '20')) || 20;
const stopAfterFailures = Number(readArg('--stop-after-failures', '8')) || 8;
const stopOnBlock = !args.includes('--no-stop-on-block');
const transport = readArg('--transport', 'curl');
const execFileAsync = promisify(execFile);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const safeFileName = (value) => String(value || 'untitled')
  .replace(/[\\/:*?"<>|]/g, '_')
  .replace(/\s+/g, ' ')
  .trim() || 'untitled';

const exists = async (file) => {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
};

const pageTitleFor = (item) => `${item.leadName}/短信/${item.sourceTitle}`;

const isBlockedResponse = (text = '') => /statusCode>\s*567|请求已被站点的安全策略拦截|Restricted Access|Tencent Cloud EdgeOne|EdgeOne/i.test(text);

const apiUrlFor = (item) => {
  const url = new URL('https://wiki.biligame.com/lysk/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'text');
  url.searchParams.set('page', pageTitleFor(item));
  return url;
};

const wrapFragment = (item, fragment) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${pageTitleFor(item)} - BWiki parse cache</title>
</head>
<body>
${fragment}
</body>
</html>
`;

const requestApiText = async (url) => {
  if (transport === 'curl') {
    const { stdout } = await execFileAsync('curl', [
      '-sS',
      '-L',
      '--compressed',
      '--max-time',
      String(curlMaxTimeSeconds),
      '--retry',
      '1',
      '--retry-delay',
      '2',
      '-A',
      'Mozilla/5.0 AetherOS material cache; local private research',
      '-H',
      'accept-language: zh-CN,zh;q=0.9,en;q=0.6',
      url.href,
    ], { maxBuffer: 8 * 1024 * 1024 });
    return { status: 200, ok: true, text: stdout, transport: 'curl' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 AetherOS material cache; local private research',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
      },
    });
    return { status: response.status, ok: response.ok, text: await response.text(), transport: 'fetch' };
  } catch (fetchError) {
    const { stdout } = await execFileAsync('curl', [
      '-sS',
      '-L',
      '--compressed',
      '--max-time',
      String(curlMaxTimeSeconds),
      '--retry',
      '1',
      '--retry-delay',
      '2',
      '-A',
      'Mozilla/5.0 AetherOS material cache; local private research',
      '-H',
      'accept-language: zh-CN,zh;q=0.9,en;q=0.6',
      url.href,
    ], { maxBuffer: 8 * 1024 * 1024 });
    return { status: 200, ok: true, text: stdout, transport: `curl_after_fetch:${String(fetchError?.message || fetchError).slice(0, 80)}` };
  } finally {
    clearTimeout(timer);
  }
};

const fetchDetail = async (item) => {
  const response = await requestApiText(apiUrlFor(item));
  const text = response.text;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const blocked = isBlockedResponse(text);
    const error = new Error(`${blocked ? 'Blocked' : 'Non-JSON'} response ${response.status}: ${text.slice(0, 120)}`);
    error.blocked = blocked;
    throw error;
  }
  if (!response.ok || json.error) {
    throw new Error(json.error?.info || `HTTP ${response.status}`);
  }
  const fragment = json.parse?.text?.['*'];
  if (!fragment || fragment.length < 500) {
    throw new Error('Missing or short parse text');
  }
  return wrapFragment(item, fragment);
};

const main = async () => {
  const candidates = JSON.parse(await readFile(indexFile, 'utf8'));
  const scoped = candidates.filter(item => item.sourceTitle && item.leadName && (!leadFilter || item.leadId === leadFilter || item.leadName === leadFilter));
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, indexFile),
    outDir: path.relative(ROOT, outDir),
    force,
    limit: Number.isFinite(limit) ? limit : null,
    counts: {
      scoped: scoped.length,
      attempted: 0,
      cached: 0,
      skipped: 0,
      failed: 0,
    },
    failures: [],
    stoppedEarly: false,
  };

  let attemptedNow = 0;
  let consecutiveFailures = 0;
  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
  }

  for (const item of scoped) {
    const dir = path.join(outDir, item.leadId);
    const file = path.join(dir, `${safeFileName(item.sourceTitle)}.html`);
    if (!force && await exists(file)) {
      report.counts.skipped += 1;
      continue;
    }
    if (attemptedNow >= limit) break;
    attemptedNow += 1;
    report.counts.attempted += 1;
    try {
      await mkdir(dir, { recursive: true });
      const html = await fetchDetail(item);
      await writeFile(file, html, 'utf8');
      report.counts.cached += 1;
      consecutiveFailures = 0;
    } catch (error) {
      report.counts.failed += 1;
      consecutiveFailures += 1;
      const blocked = Boolean(error?.blocked) || /Blocked response|EdgeOne|安全策略拦截|Restricted Access/i.test(String(error?.message || error));
      report.failures.push({
        leadId: item.leadId,
        leadName: item.leadName,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl,
        reason: String(error?.message || error),
        blocked,
      });
      if (blocked && stopOnBlock) {
        report.stoppedEarly = true;
        report.stopReason = 'Stopped after a blocked response. Wait for the site rate-limit window to cool down before retrying.';
        break;
      }
      if (consecutiveFailures >= stopAfterFailures) {
        report.stoppedEarly = true;
        report.stopReason = `Stopped after ${consecutiveFailures} consecutive failures. The site may be rate-limiting API requests.`;
        break;
      }
    }
    await sleep(delayMs);
  }

  await mkdir(path.dirname(reportFile), { recursive: true });
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Cached ${report.counts.cached} detail pages, skipped ${report.counts.skipped}, failed ${report.counts.failed}.`);
  console.log(`Report: ${path.relative(ROOT, reportFile)}`);
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
