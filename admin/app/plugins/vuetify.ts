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
            background: '#F4F5F7',
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
            background: '#0E0E10',
            surface: '#18181B',
          },
        },
      },
    },
    defaults: {
      VCard: { rounded: 'xl', elevation: 0 },
      VDataTable: { hover: true },
      VDataTableServer: { hover: true },
      VBtn: { rounded: 'lg' },
      VTextField: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
      VSelect: { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
      VChip: { rounded: 'lg' },
    },
  })
  app.vueApp.use(vuetify)
})
