import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'favicon.ico'],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 // 6 MiB
      },
      manifest: {
        name: 'Maintory',
        short_name: 'Maintory',
        description: 'Aplikasi Manajemen Maintenance & Inventory',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        icons: [
          { src: '/icon_tiang.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon_tiang.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
