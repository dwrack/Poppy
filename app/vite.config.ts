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
    rollupOptions: {
      output: {
        // three, react-three and three-vrm in one chunk that only the avatar views import
        manualChunks(id) {
          if (/node_modules\/(three|@react-three|@pixiv|three-stdlib|maath|zustand|suspend-react|its-fine|react-reconciler|camera-controls|detect-gpu|react-use-measure|tunnel-rat)\//.test(id)) return 'avatar-vendor'
        },
      },
    },
  },
})
