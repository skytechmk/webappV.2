import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
    VitePWA({
      registerType: 'autoUpdate', 
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      devOptions: {
        enabled: true 
      },
      manifest: {
        name: 'SnapifY - Event Sharing',
        short_name: 'SnapifY',
        description: 'Seamlessly capture, share, and manage event memories.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'https://img.icons8.com/fluency/192/camera.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://img.icons8.com/fluency/512/camera.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'https://img.icons8.com/fluency/512/camera.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        share_target: {
          action: "/",
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: {
            title: "title",
            text: "text",
            url: "url"
          }
        }
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true, // FORCE CLEANUP
        runtimeCaching: [
          {
            // Cache API responses (event lists, user data) but NOT media URLs
            // Media URLs are presigned and expire in 1 hour, so caching them would cause broken images
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') &&
              !url.pathname.includes('/api/proxy-media') &&
              !url.pathname.includes('/api/media'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'snapify-api-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours for API responses
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              backgroundSync: {
                name: 'snapify-upload-queue',
                options: {
                  maxRetentionTime: 24 * 60
                }
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
        output: {
            manualChunks: {
                vendor: ['react', 'react-dom'],
                libs: ['socket.io-client', 'lucide-react', 'recharts', 'qrcode.react']
            }
        }
    }
  }
});