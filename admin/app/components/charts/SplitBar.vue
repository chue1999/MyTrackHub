<script setup lang="ts">
/** One full-width horizontal bar split into coloured parts (100% stacked). */
export interface SplitPart {
  key: string
  label: string
  description?: string
  value: number
  color: string
  icon?: string
  extra?: string
}

const props = defineProps<{ parts: SplitPart[]; emptyText?: string; height?: number }>()

const total = computed(() => props.parts.reduce((s, p) => s + p.value, 0))
const pct = (v: number) => (total.value ? Math.round((v / total.value) * 100) : 0)
const hover = ref<string | null>(null)
</script>

<template>
  <div>
    <div
      class="split"
      :style="{ height: `${height ?? 48}px` }"
      role="img"
      :aria-label="parts.map((p) => `${p.label}: ${p.value} (${pct(p.value)}%)`).join(', ')"
    >
      <template v-if="total">
        <div
          v-for="p in parts.filter((x) => x.value > 0)"
          :key="p.key"
          class="seg"
          :class="{ dim: hover && hover !== p.key }"
          :style="{ flexGrow: p.value, background: p.color }"
          :title="`${p.label}: ${p.value} (${pct(p.value)}%)`"
          @mouseenter="hover = p.key"
          @mouseleave="hover = null"
        >
          <span v-if="pct(p.value) >= 12" class="seg-label">
            <v-icon v-if="p.icon" :icon="p.icon" size="18" class="mr-1" />
            {{ p.value.toLocaleString() }} · {{ pct(p.value) }}%
          </span>
        </div>
      </template>
      <div v-else class="seg empty">{{ emptyText || 'No data yet' }}</div>
    </div>

    <div class="split-legend">
      <div
        v-for="p in parts"
        :key="p.key"
        class="item"
        :class="{ dim: hover && hover !== p.key }"
        @mouseenter="hover = p.key"
        @mouseleave="hover = null"
      >
        <span class="swatch" :style="{ background: p.color }" />
        <div class="flex-grow-1" style="min-width: 0">
          <div class="text-body-2 font-weight-bold">
            <v-icon v-if="p.icon" :icon="p.icon" size="16" class="mr-1" style="color: var(--chart-text-2)" />{{
              p.label
            }}
          </div>
          <div v-if="p.description" class="text-caption" style="color: var(--chart-text-2)">{{ p.description }}</div>
        </div>
        <div class="text-right">
          <div class="text-h6 font-weight-black" style="font-variant-numeric: tabular-nums">
            {{ p.value.toLocaleString() }}
          </div>
          <div class="text-caption" style="color: var(--chart-text-2)">
            {{ pct(p.value) }}%<template v-if="p.extra"> · {{ p.extra }}</template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.split {
  display: flex;
  gap: 2px; /* surface gap between parts */
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
}
.seg {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 6px;
  transition:
    opacity 0.15s,
    flex-grow 0.4s ease;
  cursor: default;
}
.seg.empty {
  flex: 1;
  background: var(--chart-grid);
  color: var(--chart-text-2);
  font-size: 0.85rem;
}
.seg-label {
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  font-variant-numeric: tabular-nums;
}
.dim {
  opacity: 0.4;
}
.split-legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--chart-grid);
  color: var(--chart-text);
  transition: opacity 0.15s;
}
.swatch {
  width: 14px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
}
</style>
