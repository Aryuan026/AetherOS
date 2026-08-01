import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown>;
assert.equal(manifest.id, './');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');

const indexSource = read('index.tsx');
const runtimeSource = read('utils/pwaRuntime.ts');
const keepAliveSource = read('utils/keepAlive.ts');
const workerSource = read('worker/sw-keep-alive.ts');
const viteSource = read('vite.config.ts');

assert.ok(
  indexSource.indexOf('initializePwaRuntime();') < indexSource.indexOf('ReactDOM.createRoot'),
  'PWA runtime must initialize before React and lazy Settings mount',
);

for (const runtimeExport of [
  'PwaRuntimeSnapshot',
  'initializePwaRuntime',
  'getPwaRuntimeSnapshot',
  'subscribePwaRuntime',
  'requestPwaInstall',
  'applyPwaUpdate',
]) {
  assert.ok(runtimeSource.includes(runtimeExport), `missing stable PWA API: ${runtimeExport}`);
}

assert.match(runtimeSource, /addEventListener\('beforeinstallprompt'/);
assert.match(runtimeSource, /addEventListener\('appinstalled'/);
assert.match(runtimeSource, /addEventListener\('focus'/);
assert.match(runtimeSource, /addEventListener\('visibilitychange'/);
assert.match(runtimeSource, /import\.meta\.env\.DEV\s*\|\|\s*Capacitor\.isNativePlatform\(\)/);
assert.match(runtimeSource, /cache:\s*'no-store'/);
assert.match(runtimeSource, /updateAvailable:\s*true/);
assert.match(runtimeSource, /getPwaRuntimeSnapshot\s*=\s*\(\): PwaRuntimeSnapshot => snapshot/);
assert.match(runtimeSource, /installedThisSession:\s*true, installPromptAvailable:\s*false/);
assert.equal(
  runtimeSource.match(/window\.location\.reload\(\)/g)?.length,
  1,
  'only the explicit applyPwaUpdate action may reload the page',
);

assert.match(keepAliveSource, /updateViaCache:\s*'none'/);
assert.match(keepAliveSource, /registration\.update\(\)/);
assert.match(keepAliveSource, /searchParams\.set\('v', BUILD_ID\)/);
assert.match(workerSource, /skipWaiting\(\)/);
assert.match(workerSource, /clients\.claim\(\)/);
assert.match(workerSource, /AETHEROS_BUILD_ID/);
assert.doesNotMatch(workerSource, /addEventListener\(['"]fetch['"]/);

assert.match(viteSource, /aetheros-release\.json/);
assert.match(viteSource, /aetheros_release_descriptor\.v1/);
assert.match(viteSource, /offlineShell:\s*false/);
assert.match(viteSource, /VITE_AETHEROS_BUILD_ID/);

for (const [label, source] of [
  ['PWA runtime', runtimeSource],
  ['keep-alive registration', keepAliveSource],
  ['keep-alive worker', workerSource],
] as const) {
  for (const forbidden of [
    /caches\.(?:open|delete|keys|match)/,
    /indexedDB\.deleteDatabase/,
    /localStorage\.clear/,
    /cache\.addAll/,
  ]) {
    assert.doesNotMatch(source, forbidden, `${label} must not clear or create an offline shell`);
  }
}

const distRoot = resolve(root, 'dist');
assert.equal(existsSync(distRoot), true, 'run the production build before the PWA verifier');

const builtDescriptor = JSON.parse(read('dist/aetheros-release.json')) as {
  schemaVersion?: string;
  buildId?: string;
  appVersion?: string;
  shellMode?: string;
  offlineShell?: boolean;
  generatedAt?: unknown;
};
assert.equal(builtDescriptor.schemaVersion, 'aetheros_release_descriptor.v1');
assert.match(String(builtDescriptor.buildId || ''), /^aetheros-[A-Za-z0-9._+-]+-[a-f0-9]{16}$/);
assert.equal(builtDescriptor.shellMode, 'online-first');
assert.equal(builtDescriptor.offlineShell, false);
assert.equal(builtDescriptor.generatedAt, undefined, 'release identity must be reproducible for identical sources');

const builtManifest = JSON.parse(read('dist/manifest.webmanifest')) as Record<string, unknown>;
assert.equal(builtManifest.id, './');
assert.equal(builtManifest.start_url, './');
assert.equal(builtManifest.scope, './');

const builtWorker = read('dist/sw-keep-alive.js');
assert.ok(builtWorker.includes(String(builtDescriptor.buildId)), 'worker and descriptor must share one build id');
assert.doesNotMatch(builtWorker, /caches\.(?:open|delete|keys|match)/);
assert.doesNotMatch(builtWorker, /indexedDB\.deleteDatabase/);
assert.doesNotMatch(builtWorker, /addEventListener\(['"]fetch['"]/);

const builtJavaScript = readdirSync(resolve(distRoot, 'assets'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => read(`dist/assets/${file}`))
  .join('\n');
assert.ok(builtJavaScript.includes(String(builtDescriptor.buildId)), 'page runtime and descriptor must share one build id');

console.log(`PWA runtime contract OK: ${builtDescriptor.buildId}`);
