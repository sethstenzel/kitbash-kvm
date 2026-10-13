import {fileURLToPath, URL} from 'node:url'
import process from 'node:process'

import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {VitePWA} from 'vite-plugin-pwa'

// Tauri CLI (v1) sets TAURI_PLATFORM / TAURI_ARCH for beforeDevCommand / beforeBuildCommand
const isTauriBuild = !!(process.env.TAURI_PLATFORM || process.env.TAURI_ARCH)

// Browser builds use a stub for the Tauri shell API (falls back to window.open);
// Tauri builds use the real module so links open in the system browser.
const tauriShellStubAlias = isTauriBuild
  ? {}
  : {
      '@tauri-apps/api/shell': fileURLToPath(
        new URL('./src/utils/tauri-shell-stub.ts', import.meta.url),
      ),
    }

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    BUILD_TIMESTAMP: Date.now(),
  },
  base: '',
  plugins: [
    VitePWA({
      // The Tauri app ships its assets locally; a service worker there would only risk stale builds
      disable: isTauriBuild,
      registerType: 'autoUpdate',
      // public/ icons and logo are matched by workbox.globPatterns below
      includeManifestIcons: false,
      manifest: {
        name: 'KitBash KVM Controller',
        short_name: 'KitBash KVM',
        description:
          'Web Application for KitBash KVM and other CH9329 based KVMs',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'favicon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          // favicon-*.png are full-bleed (letters reach the edges), so maskable variants are
          // padded to keep the artwork inside the 80% safe zone
          {
            src: 'maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // manifest.webmanifest is added to the precache by vite-plugin-pwa itself
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        // tesseract / jsQR chunks can exceed the 2 MiB default
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Activate a new service worker immediately so an update is never stuck behind an open tab
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // tesseract.js worker/core (wasm) and tessdata language files, fetched on first OCR use
            urlPattern: ({url}) =>
              url.hostname === 'cdn.jsdelivr.net' &&
              /\/(tesseract|@tesseract\.js-data)/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-cdn',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    vue(),
  ],
  server: {
    port: 8087,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      ...tauriShellStubAlias,
    },
  },
})
