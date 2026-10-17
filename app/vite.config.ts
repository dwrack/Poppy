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
        name: 'Poppyseed Clothes',
        short_name: 'Poppyseed',
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
        // Leave the version 2 preview alone; it lives under /Poppy/v2/.
        navigateFallbackDenylist: [/\/v2\//],
      },
    }),
  ],
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
})
