import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { bakeVoiceMiddleware } from './server/bake-voice-middleware';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function keepAliveWorkerAtRoot() {
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
