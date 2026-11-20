import 'vuetify/styles'
import { createVuetify } from 'vuetify'

export default defineNuxtPlugin((app) => {
  const vuetify = createVuetify({
    theme: {
      defaultTheme: 'light',
      themes: {
        light: {
          colors: {
            primary: '#F5B800',
            secondary: '#1F1F1F',
            background: '#F5F5F5',
            surface: '#FFFFFF',
            success: '#2E9E5B',
            warning: '#E09A00',
            error: '#D9443A',
            info: '#2F80ED',
          },
        },
        dark: {
          dark: true,
          colors: {
            primary: '#FCD021',
            secondary: '#EEEEEE',
            background: '#121212',
            surface: '#1E1E1E',
          },
        },
      },
    },
    defaults: {
      VCard: { rounded: 'xl', elevation: 0 },
      VBtn: { rounded: 'lg' },
      VTextField: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
      VSelect: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
      VChip: { rounded: 'lg' },
    },
  })
  app.vueApp.use(vuetify)
})
