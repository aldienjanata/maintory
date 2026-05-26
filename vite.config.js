import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['logo.png', 'favicon.ico'],
      manifest: {
        name: 'Maintory',
        short_name: 'Maintory',
        description: 'Aplikasi Manajemen Maintenance & Inventory',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
