<script setup lang="ts">
const props = defineProps<{
  title: string
  value: number | string
  icon: string
  color?: string
  hint?: string
  /** Today minus yesterday; shows ↑/↓ with this number. */
  delta?: number | null
}>()

const tone = computed(() => props.color || 'primary')
const deltaText = computed(() => {
  if (props.delta == null) return null
  if (props.delta === 0) return 'same as yesterday'
  return `${Math.abs(props.delta).toLocaleString()} vs yesterday`
})
</script>

<template>
  <v-card class="bordered stat h-100">
    <div class="stat-body">
      <div class="d-flex align-center justify-space-between">
        <span class="stat-title">{{ title }}</span>
        <v-avatar :color="tone" variant="tonal" rounded="lg" size="40">
          <v-icon :icon="icon" size="22" />
        </v-avatar>
      </div>
      <div class="stat-value">{{ typeof value === 'number' ? value.toLocaleString() : value }}</div>
      <div class="d-flex align-center flex-wrap ga-2">
        <span
          v-if="deltaText"
          class="delta"
          :class="delta! > 0 ? 'up' : delta! < 0 ? 'down' : 'flat'"
        >
          <v-icon :icon="delta! > 0 ? 'mdi-arrow-up' : delta! < 0 ? 'mdi-arrow-down' : 'mdi-minus'" size="14" />
          {{ deltaText }}
        </span>
        <span v-if="hint" class="stat-hint">{{ hint }}</span>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.stat {
  transition: transform 0.15s, box-shadow 0.15s;
}
.stat:hover {
  transform: translateY(-2px);
}
.stat-body {
  padding: 18px 20px;
}
.stat-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.stat-value {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 8px 0 8px;
  font-variant-numeric: tabular-nums;
}
.stat-hint {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}
.delta.up {
  color: #1d8a4a;
  background: rgba(46, 158, 91, 0.12);
}
.delta.down {
  color: #c0392b;
  background: rgba(217, 68, 58, 0.12);
}
.delta.flat {
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.06);
}
</style>
