import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { bakeVoiceMiddleware } from './server/bake-voice-middleware';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RELEASE_DESCRIPTOR_FILE = 'aetheros-release.json';
const RELEASE_SCHEMA_VERSION = 'aetheros_release_descriptor.v1';
const RELEASE_INPUTS = [
  'App.tsx',
  'index.html',
  'index.tsx',
  'styles.css',
  'constants.tsx',
  'types.ts',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'apps',
  'components',
  'context',
  'domain',
  'hooks',
  'public',
  'utils',
  'worker',
] as const;

function releaseInputFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];

  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.name !== '.DS_Store')
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => releaseInputFiles(join(path, entry.name)));
}

function createReleaseDescriptor() {
  const packageManifest = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')) as {
    version?: string;
  };
  const sourceHash = createHash('sha256');

  RELEASE_INPUTS
    .flatMap((input) => releaseInputFiles(join(__dirname, input)))
    .sort()
    .forEach((file) => {
      sourceHash.update(relative(__dirname, file));
      sourceHash.update('\0');
      sourceHash.update(readFileSync(file));
      sourceHash.update('\0');
    });

  const appVersion = String(packageManifest.version || '0.0.0');
  const generatedBuildId = `aetheros-${appVersion}-${sourceHash.digest('hex').slice(0, 16)}`;
  const requestedBuildId = String(process.env.AETHEROS_BUILD_ID || '').trim();
  const buildId = requestedBuildId || generatedBuildId;
  if (!/^[A-Za-z0-9._+-]{8,128}$/.test(buildId)) {
    throw new Error('AETHEROS_BUILD_ID must be 8-128 URL-safe characters');
  }

  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    buildId,
    appVersion,
    shellMode: 'online-first',
    offlineShell: false,
  } as const;
}

const releaseDescriptor = createReleaseDescriptor();

function emitReleaseDescriptor(): Plugin {
  return {
    name: 'aetheros-release-descriptor',
    apply: 'build' as const,
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: RELEASE_DESCRIPTOR_FILE,
        source: `${JSON.stringify(releaseDescriptor, null, 2)}\n`,
      });
    },
  };
}

function keepAliveWorkerAtRoot(): Plugin {
  return {
    name: 'keep-alive-worker-at-root',
    writeBundle() {
      const assetsDir = join(__dirname, 'dist', 'assets');
      if (!existsSync(assetsDir)) return;

      const workerFile = readdirSync(assetsDir).find((file) => (
        file.startsWith('sw-keep-alive-') && file.endsWith('.js')
      ));

      if (workerFile) {
        copyFileSync(join(assetsDir, workerFile), join(__dirname, 'dist', 'sw-keep-alive.js'));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    emitReleaseDescriptor(),
    keepAliveWorkerAtRoot(),
    {
      name: 'bake-voice-middleware',
      configureServer(server) {
        server.middlewares.use('/api/minimax/bake-voice', bakeVoiceMiddleware);
      },
    },
  ],
  // Every production artifact is relocatable. The same build must work at the
  // domain root, GitHub Pages, /aetheros/, Capacitor, or another static folder.
  base: './',
  define: {
    'import.meta.env.VITE_AETHEROS_BUILD_ID': JSON.stringify(releaseDescriptor.buildId),
    'import.meta.env.VITE_AETHEROS_RELEASE_DESCRIPTOR': JSON.stringify(RELEASE_DESCRIPTOR_FILE),
  },
  server: {
    // Vite serves the module worker from /worker/ during development. Explicitly
    // allow the app-root scope so the keep-alive worker can control the page just
    // like the production copy at /sw-keep-alive.js.
    headers: {
      'Service-Worker-Allowed': '/',
    },
    proxy: {
      '/api/minimax/t2a': {
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/t2a_v2',
      },
      '/api/minimax/get-voice': {
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/get_voice',
      },
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
