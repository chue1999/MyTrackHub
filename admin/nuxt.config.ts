import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Admin dashboard behind a login: a single-page app is simplest to host.
  ssr: false,
  devtools: { enabled: false },

  app: {
    head: {
      title: 'MyTPlus Activity',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          // Inter for Latin text, Noto Sans Lao so Lao customer names render well.
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+Lao:wght@400;500;600;700;800&display=swap',
        },
      ],
    },
  },

  css: ['@mdi/font/css/materialdesignicons.css', '~/assets/main.css'],

  build: { transpile: ['vuetify'] },

  runtimeConfig: {
    public: {
      // Override with NUXT_PUBLIC_API_BASE=https://your-api.example.com
      apiBase: 'http://localhost:4000',
    },
  },

  modules: [
    (_options, nuxt) => {
      nuxt.hooks.hook('vite:extendConfig', (config) => {
        config.plugins ||= []
        config.plugins.push(vuetify({ autoImport: true }))
      })
    },
  ],

  vite: {
    vue: { template: { transformAssetUrls } },
  },
})
