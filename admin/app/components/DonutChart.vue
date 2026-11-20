<script setup lang="ts">
export interface Slice {
  key: string
  label: string
  value: number
  color: string
  icon?: string
}

const props = withDefaults(
  defineProps<{ slices: Slice[]; centerLabel?: string; size?: number; formatValue?: (n: number) => string }>(),
  { size: 200, centerLabel: 'Total', formatValue: (n: number) => n.toLocaleString() },
)

const total = computed(() => props.slices.reduce((s, x) => s + x.value, 0))
const R = 90 // outer radius in a 200x200 viewBox
const r = 58 // inner radius (donut hole)

/** Arc path for one slice, from angle a0 to a1 (radians, 0 = 12 o'clock). */
function arc(a0: number, a1: number) {
  const pt = (rad: number, a: number) => [100 + rad * Math.sin(a), 100 - rad * Math.cos(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = pt(R, a0)
  const [x1, y1] = pt(R, a1)
  const [x2, y2] = pt(r, a1)
  const [x3, y3] = pt(r, a0)
  return `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`
}

const arcs = computed(() => {
  let a = 0
  return props.slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const span = (s.value / total.value) * Math.PI * 2
      // A single slice is a full ring: draw it as two halves so the arc closes.
      const d = span >= Math.PI * 2 - 1e-6 ? `${arc(0, Math.PI)} ${arc(Math.PI, Math.PI * 2 - 1e-4)}` : arc(a, a + span)
      a += span
      return { ...s, d }
    })
})

const pct = (v: number) => (total.value ? Math.round((v / total.value) * 100) : 0)
const hover = ref<Slice | null>(null)
</script>

<template>
  <div class="donut">
    <div class="donut-plot" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg viewBox="0 0 200 200" role="img" :aria-label="`${centerLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`">
        <circle v-if="!total" cx="100" cy="100" :r="(R + r) / 2" fill="none" stroke="var(--chart-grid)" :stroke-width="R - r" />
        <path
          v-for="s in arcs"
          :key="s.key"
          :d="s.d"
          :fill="s.color"
          stroke="var(--chart-surface)"
          stroke-width="2"
          stroke-linejoin="round"
          class="slice"
          :class="{ dim: hover && hover.key !== s.key }"
          @mouseenter="hover = s"
          @mouseleave="hover = null"
        />
      </svg>
      <div class="donut-center">
        <template v-if="hover">
          <div class="text-caption" style="color: var(--chart-text-2)">{{ hover.label }}</div>
          <div class="text-h5 font-weight-black" style="color: var(--chart-text)">{{ formatValue(hover.value) }}</div>
          <div class="text-caption" style="color: var(--chart-text-2)">{{ pct(hover.value) }}%</div>
        </template>
        <template v-else>
          <div class="text-caption" style="color: var(--chart-text-2)">{{ centerLabel }}</div>
          <div class="text-h5 font-weight-black" style="color: var(--chart-text)">{{ formatValue(total) }}</div>
        </template>
      </div>
    </div>

    <!-- legend doubles as the data table: label, value, share -->
    <ul class="legend">
      <li
        v-for="s in slices"
        :key="s.key"
        :class="{ dim: hover && hover.key !== s.key }"
        @mouseenter="hover = s"
        @mouseleave="hover = null"
      >
        <span class="swatch" :style="{ background: s.color }" />
        <v-icon v-if="s.icon" :icon="s.icon" size="16" class="mr-1" style="color: var(--chart-text-2)" />
        <span class="label">{{ s.label }}</span>
        <span class="value">{{ formatValue(s.value) }}</span>
        <span class="pct">{{ pct(s.value) }}%</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut {
  display: flex;
  align-items: center;
  gap: 28px;
  flex-wrap: wrap;
}
.donut-plot {
  position: relative;
  flex-shrink: 0;
}
.donut-plot svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.slice {
  transition: opacity 0.15s;
  cursor: pointer;
}
.dim {
  opacity: 0.35;
}
.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
}
.legend {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  min-width: 200px;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  font-size: 0.9rem;
  color: var(--chart-text);
  border-radius: 8px;
  transition: opacity 0.15s;
  cursor: default;
}
.legend li + li {
  border-top: 1px solid var(--chart-grid);
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex-shrink: 0;
}
.label {
  flex: 1;
}
.value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.pct {
  width: 42px;
  text-align: right;
  color: var(--chart-text-2);
  font-variant-numeric: tabular-nums;
}
</style>
