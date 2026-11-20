<script setup lang="ts">
defineProps<{ title: string; value: number | string; icon: string; color?: string; hint?: string }>()
</script>

<template>
  <v-card class="bordered h-100">
    <v-card-text class="d-flex align-center ga-4">
      <v-avatar :color="color || 'primary'" variant="tonal" rounded="lg" size="48">
        <v-icon :icon="icon" />
      </v-avatar>
      <div class="flex-grow-1">
        <div class="text-body-2 text-medium-emphasis">{{ title }}</div>
        <div class="text-h5 font-weight-bold">{{ typeof value === 'number' ? value.toLocaleString() : value }}</div>
        <div v-if="hint" class="text-caption text-medium-emphasis">{{ hint }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>
