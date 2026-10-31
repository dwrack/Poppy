import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Poppyseed Clothes 2.0',
        short_name: 'Poppyseed 2',
        description: 'What do I wear today?',
        theme_color: '#f4a261',
        background_color: '#fff8f0',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
  build: {
    rolldownOptions: {
      output: {
        // Explicit groups with priorities: react first, then the three stack. With the old
        // `manualChunks` callback rolldown folded react into avatar-vendor, so the main bundle
        // imported it statically and index.html modulepreloaded the whole 1.1 MB three stack
        // on first paint (found in step 2). Now the avatar chunk only loads with the avatar.
        codeSplitting: {
          groups: [
            { name: 'react-vendor', priority: 2, test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|@babel[\\/]runtime)[\\/]/ },
            { name: 'avatar-vendor', priority: 1, test: /node_modules[\\/](three|@react-three|@pixiv|three-stdlib|maath|zustand|suspend-react|its-fine|react-reconciler|camera-controls|detect-gpu|react-use-measure|tunnel-rat)[\\/]/ },
          ],
        },
      },
    },
  },
})
