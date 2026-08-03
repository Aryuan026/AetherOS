import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePwaInstallRowPresentation } from '../utils/pwaInstallPresentation.ts';
import { buildChunkRecoveryUrl, isStaleDynamicImportError } from '../utils/pwaChunkRecovery.ts';
import type { PwaRuntimeSnapshot } from '../utils/pwaRuntime.ts';

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
const installRowSource = read('components/settings/PwaInstallRow.tsx');
const standaloneSource = read('utils/iosStandalone.ts');
const chunkRecoverySource = read('utils/pwaChunkRecovery.ts');
const appErrorBoundarySource = read('components/os/AppErrorBoundary.tsx');

assert.equal(
  isStaleDynamicImportError(new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/Chat-old.js')),
  true,
);
assert.equal(isStaleDynamicImportError('ChunkLoadError: Loading chunk Chat failed'), true);
assert.equal(isStaleDynamicImportError({ reason: 'Importing a module script failed' }), true);
assert.equal(isStaleDynamicImportError(new TypeError('Failed to fetch')), false);
assert.equal(isStaleDynamicImportError(new Error('API request returned 503')), false);
assert.equal(
  buildChunkRecoveryUrl(
    'https://lab.asherie.cloud/aetheros/?old=1',
    './',
    'aetheros-2.0.0-new',
  ),
  'https://lab.asherie.cloud/aetheros/?__aetheros_release=aetheros-2.0.0-new',
);

const runtimeSnapshot = (patch: Partial<PwaRuntimeSnapshot> = {}): PwaRuntimeSnapshot => ({
  platform: 'other',
  standalone: false,
  installedThisSession: false,
  installPromptAvailable: false,
  updateAvailable: false,
  isCapacitor: false,
  ...patch,
});

assert.equal(resolvePwaInstallRowPresentation(runtimeSnapshot()), null);
assert.equal(resolvePwaInstallRowPresentation(runtimeSnapshot({ standalone: true })), null);
assert.equal(resolvePwaInstallRowPresentation(runtimeSnapshot({ installedThisSession: true })), null);
assert.equal(resolvePwaInstallRowPresentation(runtimeSnapshot({ isCapacitor: true })), null);
assert.equal(resolvePwaInstallRowPresentation(runtimeSnapshot({ installPromptAvailable: true }))?.key, 'prompt');
assert.equal(resolvePwaInstallRowPresentation(runtimeSnapshot({ platform: 'ios' }))?.key, 'ios-manual');
assert.equal(
  resolvePwaInstallRowPresentation(runtimeSnapshot({ standalone: true, updateAvailable: true }))?.key,
  'update',
  'an installed desktop app must still expose a real release action',
);
assert.doesNotMatch(installRowSource, /已从手机桌面打开|已添加到手机桌面|browser-menu/);

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
  'recoverFromStaleAppChunk',
  'PwaUpdateOutcome',
]) {
  assert.ok(runtimeSource.includes(runtimeExport), `missing stable PWA API: ${runtimeExport}`);
}

assert.match(runtimeSource, /addEventListener\('beforeinstallprompt'/);
assert.match(runtimeSource, /addEventListener\('appinstalled'/);
assert.match(runtimeSource, /addEventListener\('vite:preloadError'/);
assert.match(runtimeSource, /addEventListener\('focus'/);
assert.match(runtimeSource, /addEventListener\('visibilitychange'/);
assert.match(runtimeSource, /import\.meta\.env\.DEV\s*\|\|\s*Capacitor\.isNativePlatform\(\)/);
assert.match(runtimeSource, /cache:\s*'no-store'/);
assert.match(runtimeSource, /updateAvailable:\s*true/);
assert.match(runtimeSource, /getPwaRuntimeSnapshot\s*=\s*\(\): PwaRuntimeSnapshot => snapshot/);
assert.match(runtimeSource, /installedThisSession:\s*true, installPromptAvailable:\s*false/);
assert.doesNotMatch(runtimeSource, /window\.location\.reload\(\)/);
assert.match(runtimeSource, /window\.location\.replace\(targetUrl\)/);
assert.match(chunkRecoverySource, /__aetheros_release/);
assert.match(runtimeSource, /headers:\s*\{ Accept:\s*'text\/html' \}/);
assert.match(runtimeSource, /return 'unavailable'/);
assert.match(installRowSource, /当前页面已保留/);
assert.match(standaloneSource, /display-mode: standalone/);
assert.match(standaloneSource, /display-mode: fullscreen/);
assert.match(standaloneSource, /display-mode: minimal-ui/);
assert.match(standaloneSource, /android-app:\/\//);
assert.match(runtimeSource, /STANDALONE_DISPLAY_MODE_QUERIES\.forEach/);
assert.match(runtimeSource, /descriptor\.buildId === CURRENT_BUILD_ID/);
assert.match(runtimeSource, /CHUNK_RECOVERY_SESSION_KEY/);
assert.match(appErrorBoundarySource, /recoverFromStaleAppChunk\(error\)/);
assert.match(chunkRecoverySource, /failed to fetch dynamically imported module/i);

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
  ['stale chunk matcher', chunkRecoverySource],
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
