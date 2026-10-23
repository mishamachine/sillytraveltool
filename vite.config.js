import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// `vite build --mode native` = Capacitor build: no PWA plugin, so no service
// worker and no registerSW script (HANDOFF: "Disable the service worker in the native build").
export default defineConfig(({ mode }) => {
  const isNative = mode === 'native'
  return {
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_NATIVE': JSON.stringify(isNative),
  },
  // Production + native builds: strip console.log/info/debug (marked pure, so the
  // minifier drops unused calls). console.warn/console.error stay for diagnostics.
  esbuild: mode === 'production' || isNative
    ? { pure: ['console.log', 'console.info', 'console.debug'] }
    : {},
  plugins: [
    react(),
    // Native: drop viewport-fit=cover so Capacitor's SystemBars pads the WebView
    // below the status bar / above the nav bar (screens don't all honour safe-area-inset-top yet).
    isNative && {
      name: 'stt-native-viewport',
      transformIndexHtml: (html) => html.replace(', viewport-fit=cover', ''),
    },
    !isNative && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Silly Travel Tool',
        short_name: 'STT',
        description: 'Your silly but genuinely useful travel companion',
        theme_color: '#F4EEE6',
        background_color: '#F4EEE6',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Cache-first for static assets, network-first for API calls
        runtimeCaching: [
          {
            // Supabase API — network first, fall back to cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10
            }
          },
          {
            // Gemini API direct calls — network only (key is now server-side but keep as fallback)
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            // Supabase Edge Functions (AI proxy calls) — network only
            urlPattern: /^https:\/\/.*\.supabase\.co\/functions\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            // Exchange rate — cache for 1 hour
            urlPattern: /^https:\/\/(api\.exchangerate-api\.com|open\.er-api\.com)\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'exchange-rate-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 }
            }
          },
          {
            // Open-Meteo weather — cache for 30 mins
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'weather-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 30 }
            }
          },
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            // Photon city autocomplete — cache for 1 hour
            urlPattern: /^https:\/\/photon\.komoot\.io\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'photon-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5
            }
          },
          {
            // Nominatim reverse geocode (HONK)
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nominatim-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 5
            }
          }
        ],
        // The owner cockpit (/admin/) is its own page; travellers' service workers never precache it
        globIgnores: ['**/admin/**', '**/assets/admin-*'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/offline\.html$/, /^\/(privacy|terms|legal|help|admin|redeem|unsubscribe)(\/|$)/]
      }
    })
  ].filter(Boolean),
  // Web build: the app plus the owner cockpit (admin/index.html → /admin/) and the code redeem page (/redeem/).
  // The native build ships the app only.
  build: isNative ? {} : {
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        admin: new URL('./admin/index.html', import.meta.url).pathname,
        redeem: new URL('./redeem/index.html', import.meta.url).pathname,
        unsubscribe: new URL('./unsubscribe/index.html', import.meta.url).pathname,
      },
    },
  },
  // Several edits land at once during the Clay rebuild; errors still show in the console
  server: { hmr: { overlay: false } },
  resolve: {
    alias: { '@': '/src' }
  }
  }
})
