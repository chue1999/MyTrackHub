import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Admin dashboard behind a login: a single-page app is simplest to host.
  ssr: false,
  devtools: { enabled: false },

  app: {
    head: {
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          // Phetsarath for Lao text on computers without Phetsarath OT installed
          // (English uses Times New Roman, which every computer has).
          href: 'https://fonts.googleapis.com/css2?family=Phetsarath:wght@400;700&display=swap',
        },
      ],
    },
  },

  css: ['@mdi/font/css/materialdesignicons.css', '~/assets/main.css'],

  // Components live in folders (charts/, data/, common/, layout/) but keep
  // their plain names: <Pie3D>, <DataView>…
  components: [{ path: '~/components', pathPrefix: false }],

  build: { transpile: ['vuetify'] },

  runtimeConfig: {
    public: {
      // Empty = the API is on the same site as this website (/api/v1/…):
      // nginx forwards /api/ to the API in production, the dev proxy below in development.
      // Only set NUXT_PUBLIC_API_BASE=https://api.example.com when the API is on another site.
      apiBase: '',
    },
  },

  // `npm run dev`: /api/… → the API on port 4000 (same as nginx in production).
  nitro: {
    devProxy: {
      '/api': { target: 'http://localhost:4000/api', changeOrigin: true },
    },
  },

  modules: [
    '@nuxt/eslint',
    (_options, nuxt) => {
      nuxt.hooks.hook('vite:extendConfig', (config) => {
        // Vuetify components and directives are imported on demand.
        config.plugins?.push(vuetify({ autoImport: true }))
      })
    },
  ],

  eslint: { config: { stylistic: false } },

  typescript: { strict: true },

  vite: {
    vue: { template: { transformAssetUrls } },
  },
})
