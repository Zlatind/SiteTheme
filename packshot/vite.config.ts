import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// onnxruntime-web emits its 24 MB wasm, but @imgly/background-removal loads its own
// copy from the model CDN, so the bundled one is dead weight in the deploy.
const dropUnusedOrtWasm = () => ({
  name: 'drop-unused-ort-wasm',
  apply: 'build' as const,
  closeBundle() {
    const dir = join(__dirname, 'dist/assets');
    for (const f of readdirSync(dir)) if (/^ort-wasm.*\.wasm$/.test(f)) rmSync(join(dir, f));
  },
});

// Cross-origin isolation lets onnxruntime use multi-threaded WASM (2–3x faster
// background removal). "credentialless" keeps the IMG.LY model CDN loadable.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [
    react(),
    dropUnusedOrtWasm(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'PackShot',
        short_name: 'PackShot',
        description: 'Product photo editor for marketplaces',
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // onnxruntime + app chunks are large; the model itself is runtime-cached below.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'staticimgly.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'bg-model',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@imgly/background-removal', 'onnxruntime-web'] },
  server: { headers: isolationHeaders, host: true },
  preview: { headers: isolationHeaders },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
