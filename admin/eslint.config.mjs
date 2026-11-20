// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      'vue/multi-word-component-names': 'off', // page files are single words (index.vue, login.vue)
      'vue/no-v-html': 'error',
      // Vuetify data-table slots are named like #item.user
      'vue/valid-v-slot': ['error', { allowModifiers: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  prettier,
)
