<script setup lang="ts">
export interface BarSegment {
  key: string
  label: string
  value: number
  color: string
}
export interface BarRow {
  id: string
  label: string
  sublabel?: string
  segments: BarSegment[]
}

const props = defineProps<{ rows: BarRow[]; legend?: { label: string; color: string }[]; emptyText?: string }>()

const totalOf = (row: BarRow) => row.segments.reduce((s, x) => s + x.value, 0)
const max = computed(() => Math.max(1, ...props.rows.map(totalOf)))

const tip = ref<{ row: BarRow; x: number; y: number } | null>(null)
function move(row: BarRow, ev: MouseEvent) {
  const box = (ev.currentTarget as HTMLElement).closest('.hbar')!.getBoundingClientRect()
  tip.value = { row, x: ev.clientX - box.left, y: ev.clientY - box.top }
}
</script>

<template>
  <div class="hbar">
    <div v-if="legend && legend.length > 1" class="hbar-legend">
      <span v-for="l in legend" :key="l.label"><i :style="{ background: l.color }" />{{ l.label }}</span>
    </div>

    <div v-for="row in rows" :key="row.id" class="hbar-row" @mousemove="move(row, $event)" @mouseleave="tip = null">
      <div class="hbar-label">
        <div class="text-body-2 font-weight-medium text-truncate">{{ row.label }}</div>
        <div v-if="row.sublabel" class="text-caption text-truncate" style="color: var(--chart-text-2)">
          {{ row.sublabel }}
        </div>
      </div>
      <div class="hbar-track">
        <div class="hbar-fill" :style="{ width: `${(totalOf(row) / max) * 100}%` }">
          <div
            v-for="seg in row.segments.filter((s) => s.value > 0)"
            :key="seg.key"
            class="hbar-seg"
            :style="{ flexGrow: seg.value, background: seg.color }"
          />
        </div>
        <span class="hbar-value">{{ totalOf(row).toLocaleString() }}</span>
      </div>
    </div>

    <div v-if="!rows.length" class="text-center py-6" style="color: var(--chart-text-2)">
      {{ emptyText || 'No data yet' }}
    </div>

    <div v-if="tip" class="hbar-tip" :style="{ left: `${tip.x + 14}px`, top: `${tip.y + 10}px` }">
      <div class="font-weight-bold mb-1">{{ tip.row.label }}</div>
      <div v-for="seg in tip.row.segments" :key="seg.key" class="d-flex align-center ga-2">
        <i :style="{ background: seg.color }" />
        <span class="flex-grow-1">{{ seg.label }}</span>
        <strong>{{ seg.value.toLocaleString() }}</strong>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hbar {
  position: relative;
}
.hbar-legend {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
  font-size: 0.8rem;
  color: var(--chart-text-2);
}
.hbar-legend span,
.hbar-tip .d-flex {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hbar-legend i,
.hbar-tip i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
.hbar-row {
  display: grid;
  grid-template-columns: minmax(120px, 38%) 1fr;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-radius: 8px;
}
.hbar-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.hbar-label {
  min-width: 0;
  color: var(--chart-text);
}
.hbar-track {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.hbar-fill {
  display: flex;
  gap: 2px; /* surface gap between stacked segments */
  height: 14px;
  min-width: 4px;
  border-radius: 0 4px 4px 0;
  overflow: hidden;
  transition: width 0.4s ease;
}
.hbar-seg {
  height: 100%;
  min-width: 2px;
}
.hbar-value {
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--chart-text);
  white-space: nowrap;
}
.hbar-tip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  min-width: 170px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.8rem;
  color: var(--chart-text);
  background: var(--chart-surface);
  border: 1px solid var(--chart-grid);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
</style>
