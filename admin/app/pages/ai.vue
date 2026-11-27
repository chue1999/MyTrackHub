<script setup lang="ts">
/**
 * AI assistants — opens the real, free ChatGPT / Gemini / Claude websites.
 * They cannot be embedded inside this site (their pages refuse to load in a
 * frame), so each opens in a new tab or in a side window next to this one.
 * Each person signs in with their own free account.
 */
useHead({ title: 'AI assistants' })

interface Assistant {
  key: string
  name: string
  maker: string
  url: string
  icon: string
  accent: string
  good: string[]
}
const ASSISTANTS: Assistant[] = [
  {
    key: 'chatgpt',
    name: 'ChatGPT',
    maker: 'OpenAI',
    url: 'https://chatgpt.com/',
    icon: 'mdi-chat-processing-outline',
    accent: '#10a37f',
    good: ['Writing and translating', 'Explaining and summarising', 'Files and images'],
  },
  {
    key: 'gemini',
    name: 'Gemini',
    maker: 'Google',
    url: 'https://gemini.google.com/app',
    icon: 'mdi-star-four-points-outline',
    accent: '#4285f4',
    good: ['Google search answers', 'Gmail / Docs / Drive', 'Images and photos'],
  },
  {
    key: 'claude',
    name: 'Claude',
    maker: 'Anthropic',
    url: 'https://claude.ai/new',
    icon: 'mdi-message-text-outline',
    accent: '#d97757',
    good: ['Long documents', 'Careful writing and code', 'Files and PDFs'],
  },
]

/** A window on the right half of the screen, so this site stays visible on the left. */
function openSide(a: Assistant) {
  const w = Math.max(420, Math.round(window.screen.availWidth / 2))
  const h = window.screen.availHeight
  const left = window.screen.availWidth - w
  const win = window.open(a.url, `ai-${a.key}`, `popup=yes,width=${w},height=${h},left=${left},top=0`)
  // Pop-ups blocked: fall back to a normal tab.
  if (!win) window.open(a.url, '_blank', 'noopener')
}
function openTab(a: Assistant) {
  window.open(a.url, '_blank', 'noopener')
}
</script>

<template>
  <div>
    <div class="mb-5">
      <h1 class="page-title">AI assistants</h1>
      <div class="text-body-2 text-medium-emphasis">
        The real ChatGPT, Gemini and Claude — free versions, with everything they offer
      </div>
    </div>

    <v-alert
      type="info"
      variant="tonal"
      rounded="lg"
      class="mb-5"
      icon="mdi-information-outline"
      text="Each one opens its own official website. Sign in once with your own free account (Google / email). Do not paste customer personal data, passwords or SMS codes into an AI."
    />

    <div class="ai-grid">
      <section v-for="a in ASSISTANTS" :key="a.key" class="ai-card" :style="{ '--accent': a.accent }">
        <div class="d-flex align-center ga-3 mb-4">
          <div class="ai-ico"><v-icon :icon="a.icon" size="28" /></div>
          <div>
            <div class="ai-name">{{ a.name }}</div>
            <div class="text-caption text-medium-emphasis">by {{ a.maker }} · free</div>
          </div>
        </div>
        <ul class="ai-good">
          <li v-for="g in a.good" :key="g"><v-icon icon="mdi-check" size="16" />{{ g }}</li>
        </ul>
        <div class="ai-actions">
          <v-btn
            color="primary"
            variant="flat"
            height="44"
            class="text-none text-black font-weight-bold"
            prepend-icon="mdi-dock-right"
            @click="openSide(a)"
            >Side window</v-btn
          >
          <v-btn variant="outlined" height="44" class="text-none" prepend-icon="mdi-open-in-new" @click="openTab(a)"
            >New tab</v-btn
          >
        </div>
        <div class="text-caption text-medium-emphasis mt-2 text-mono">{{ a.url.replace('https://', '') }}</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ai-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 1000px) {
  .ai-grid {
    grid-template-columns: 1fr;
  }
}
.ai-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 22px;
  border-radius: 20px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.ai-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--accent);
}
.ai-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(16, 24, 40, 0.08);
}
.ai-ico {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.ai-name {
  font-size: 1.2rem;
  font-weight: 800;
}
.ai-good {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
}
.ai-good li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-good .v-icon {
  color: var(--accent);
}
.ai-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ai-actions :deep(.v-btn) {
  border-radius: 12px;
}
</style>
