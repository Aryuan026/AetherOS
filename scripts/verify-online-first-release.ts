import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const read = (relativePath: string): string => readFileSync(resolve(root, relativePath), 'utf8');
const readDist = (relativePath: string): string => readFileSync(resolve(dist, relativePath), 'utf8');

assert.equal(existsSync(resolve(dist, 'index.html')), true, 'run a production build before this release gate');

const manifest = JSON.parse(readDist('manifest.webmanifest')) as {
  start_url?: string;
  scope?: string;
  icons?: Array<{ src?: string }>;
};
assert.equal(manifest.start_url, './', 'online-first PWA start_url must stay relative to its hosting folder');
assert.equal(manifest.scope, './', 'online-first PWA scope must stay relative to its hosting folder');

const releaseBase = new URL('https://release.invalid/aetheros/');
const manifestUrl = new URL('manifest.webmanifest', releaseBase);
assert.equal(new URL(manifest.start_url!, manifestUrl).pathname, '/aetheros/');
assert.equal(new URL(manifest.scope!, manifestUrl).pathname, '/aetheros/');

const indexHtml = readDist('index.html');
const htmlRefs = Array.from(
  indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/g),
  match => match[1],
).filter(ref => !/^(?:data:|https?:|#)/i.test(ref));
assert.ok(htmlRefs.length >= 4, 'built index must expose its startup assets for verification');

const manifestRefs = (manifest.icons || [])
  .map(icon => icon.src || '')
  .filter(Boolean);
for (const ref of htmlRefs) {
  assert.equal(ref.startsWith('/'), false, `root-absolute startup URL would 404 under /aetheros/: ${ref}`);
  const resolvedUrl = new URL(ref, releaseBase);
  assert.ok(resolvedUrl.pathname.startsWith('/aetheros/'), `startup URL escaped /aetheros/: ${ref}`);
  const relativePath = resolvedUrl.pathname.slice('/aetheros/'.length);
  assert.equal(existsSync(resolve(dist, relativePath)), true, `built startup asset is missing: ${relativePath}`);
}
for (const ref of manifestRefs) {
  assert.equal(ref.startsWith('/'), false, `root-absolute manifest URL would escape /aetheros/: ${ref}`);
  const resolvedUrl = new URL(ref, manifestUrl);
  assert.ok(resolvedUrl.pathname.startsWith('/aetheros/'), `manifest URL escaped /aetheros/: ${ref}`);
  const relativePath = resolvedUrl.pathname.slice('/aetheros/'.length);
  assert.equal(existsSync(resolve(dist, relativePath)), true, `manifest asset is missing: ${relativePath}`);
}

const workerAssetNames = readdirSync(resolve(dist, 'assets')).filter(name => (
  /^sw-keep-alive-.*\.js$/.test(name)
));
assert.equal(workerAssetNames.length, 1, 'build must emit exactly one hashed keep-alive worker');
const rootWorker = readFileSync(resolve(dist, 'sw-keep-alive.js'));
const hashedWorker = readFileSync(resolve(dist, 'assets', workerAssetNames[0]));
assert.deepEqual(rootWorker, hashedWorker, 'root service worker must be the current bundled worker, not stale public fallback');

const startupPaths = [
  'index.tsx',
  'utils/keepAlive.ts',
  'worker/sw-keep-alive.ts',
  'public/sw-keep-alive.js',
] as const;
const forbiddenStartupPatterns = [
  { pattern: /\b(?:self\.)?caches\s*\./, label: 'CacheStorage access' },
  { pattern: /\bindexedDB\s*\.\s*deleteDatabase\s*\(/, label: 'IndexedDB deletion' },
  { pattern: /\blocalStorage\s*\.\s*clear\s*\(/, label: 'localStorage clearing' },
  { pattern: /\b(?:window\.)?location\s*\.\s*reload\s*\(/, label: 'automatic reload' },
] as const;
for (const relativePath of startupPaths) {
  const source = read(relativePath);
  for (const forbidden of forbiddenStartupPatterns) {
    assert.doesNotMatch(source, forbidden.pattern, `${relativePath} must not contain ${forbidden.label}`);
  }
}
const builtWorkerText = rootWorker.toString('utf8');
for (const forbidden of forbiddenStartupPatterns) {
  assert.doesNotMatch(builtWorkerText, forbidden.pattern, `built worker must not contain ${forbidden.label}`);
}

const keepAliveSource = read('utils/keepAlive.ts');
assert.equal(
  Array.from(keepAliveSource.matchAll(/navigator\.serviceWorker\.register\s*\(/g)).length,
  1,
  'startup must own exactly one service-worker registration path',
);
assert.doesNotMatch(
  keepAliveSource,
  /controllerchange[\s\S]{0,300}(?:window\.)?location\.reload/,
  'worker activation must not start a controllerchange reload loop',
);

const reservePort = async (): Promise<number> => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(error => error ? reject(error) : resolvePort(port));
  });
});

const port = await reservePort();
const child = spawn(process.execPath, [resolve(root, 'scripts/local-static-server.cjs'), dist], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const waitForServer = new Promise<void>((resolveReady, reject) => {
  const timeout = setTimeout(() => reject(new Error('local static server did not start')), 10_000);
  child.once('error', reject);
  child.stdout?.on('data', chunk => {
    if (String(chunk).includes('Listening on')) {
      clearTimeout(timeout);
      resolveReady();
    }
  });
  child.stderr?.on('data', chunk => {
    const message = String(chunk).trim();
    if (message) process.stderr.write(`${message}\n`);
  });
});

try {
  await waitForServer;
  const localBase = new URL(`http://127.0.0.1:${port}/`);
  const localManifestResponse = await fetch(new URL('manifest.webmanifest', localBase));
  assert.equal(localManifestResponse.status, 200);
  assert.match(
    localManifestResponse.headers.get('content-type') || '',
    /^application\/manifest\+json\b/i,
    'local verification server must serve .webmanifest with the manifest MIME',
  );
  const localWorkerResponse = await fetch(new URL('sw-keep-alive.js', localBase));
  assert.equal(localWorkerResponse.status, 200);
  assert.match(localWorkerResponse.headers.get('content-type') || '', /javascript/i);
  for (const ref of htmlRefs) {
    const response = await fetch(new URL(ref, localBase));
    assert.equal(response.status, 200, `local startup asset failed: ${ref}`);
  }
} finally {
  child.kill('SIGTERM');
}

console.log('online-first release OK: relocatable assets, manifest MIME, single non-caching SW, and no startup data-clear/reload path');
