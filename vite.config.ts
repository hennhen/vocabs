import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // Precache the app shell and the autocomplete word list so everything works offline.
        globPatterns: ['**/*.{js,css,html,png,svg,txt}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      manifest: {
        name: 'Vocabs',
        short_name: 'Vocabs',
        description: 'Spaced-repetition vocabulary flashcards with Traditional Chinese',
        display: 'standalone',
        start_url: '.',
        background_color: '#f6f5f2',
        theme_color: '#f6f5f2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  // In `npm run dev`, send /api to a local `wrangler dev` (npm run dev:worker) on port 8787.
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'node',
    alias: { 'cloudflare:workers': new URL('./worker/cloudflare-workers.stub.ts', import.meta.url).pathname },
  },
})
