<script setup lang="ts">
// The logo inside a brand tile: the uploaded image, or the default icon.
defineProps<{ size?: number | string; color?: string }>()
const { branding } = useBranding()
</script>

<template>
  <img v-if="branding.logo" :src="branding.logo" alt="Logo" class="brand-mark-img" />
  <v-icon v-else icon="mdi-chart-timeline-variant" :size="size ?? 24" :color="color ?? 'black'" />
</template>

<style scoped>
.brand-mark-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  display: block;
}
</style>
