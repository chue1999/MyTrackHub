<script setup lang="ts">
/**
 * Tilted 3D-style pie with the percentage written on each slice.
 * The legend next to it lists the exact numbers, because tilting makes the
 * front slices look a little larger than they are.
 */
export interface Slice {
  key: string
  label: string
  value: number
  color: string
  icon?: string
}

const props = withDefaults(
  defineProps<{ slices: Slice[]; width?: number; formatValue?: (n: number) => string; totalLabel?: string }>(),
  { width: 240, formatValue: (n: number) => n.toLocaleString(), totalLabel: 'Total' },
)

// Geometry in a 240 x 170 viewBox.
const cx = 120
const cy = 74
const rx = 108
const ry = 62
const depth = 22

const total = computed(() => props.slices.reduce((s, x) => s + x.value, 0))
const pct = (v: number) => (total.value ? Math.round((v / total.value) * 100) : 0)
const hover = ref<string | null>(null)

/** Point on the top ellipse; angle 0 = 12 o'clock, clockwise. */
const pt = (a: number, dy = 0, k = 1): [number, number] => [cx + rx * k * Math.sin(a), cy - ry * k * Math.cos(a) + dy]
const f = (n: number) => n.toFixed(2)

const parts = computed(() => {
  const list = props.slices.filter((s) => s.value > 0)
  let a = 0
  return list.map((s) => {
    const span = total.value ? (s.value / total.value) * Math.PI * 2 : 0
    const a0 = a
    const a1 = a + span
    a = a1
    const mid = (a0 + a1) / 2
    // Hovered slice slides out a little along its middle.
    const off = hover.value === s.key ? 8 : 0
    const dx = off * Math.sin(mid)
    const dy = -off * Math.cos(mid) * (ry / rx)
    const full = span >= Math.PI * 2 - 1e-6

    const top = full
      ? `M${f(cx - rx)},${f(cy)} A${rx},${ry} 0 1 1 ${f(cx + rx)},${f(cy)} A${rx},${ry} 0 1 1 ${f(cx - rx)},${f(cy)} Z`
      : (() => {
          const [x0, y0] = pt(a0)
          const [x1, y1] = pt(a1)
          return `M${cx},${cy} L${f(x0)},${f(y0)} A${rx},${ry} 0 ${span > Math.PI ? 1 : 0} 1 ${f(x1)},${f(y1)} Z`
        })()

    // Side wall: only the front half of the rim (angles between 90° and 270°) is visible.
    const b0 = Math.max(a0, Math.PI / 2)
    const b1 = Math.min(a1, (Math.PI * 3) / 2)
    let side = ''
    if (b1 > b0) {
      const [x0, y0] = pt(b0)
      const [x1, y1] = pt(b1)
      const large = b1 - b0 > Math.PI ? 1 : 0
      side = `M${f(x0)},${f(y0)} A${rx},${ry} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x1)},${f(y1 + depth)} A${rx},${ry} 0 ${large} 0 ${f(x0)},${f(y0 + depth)} Z`
    }

    const [lx, ly] = pt(mid, 0, 0.6)
    return { ...s, top, side, dx, dy, lx, ly, p: pct(s.value) }
  })
})
</script>

<template>
  <div class="pie3d">
    <div class="plot" :style="{ width: `${width}px` }">
      <svg viewBox="0 0 240 170" role="img" :aria-label="slices.map((s) => `${s.label} ${pct(s.value)}%`).join(', ')">
        <defs>
          <radialGradient id="pie-shine" cx="35%" cy="25%" r="75%">
            <stop offset="0%" stop-color="#fff" stop-opacity="0.28" />
            <stop offset="60%" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <!-- soft shadow under the pie -->
        <ellipse :cx="cx" :cy="cy + depth + 14" :rx="rx * 0.92" :ry="ry * 0.32" class="shadow" />
        <template v-if="total">
          <!-- side walls first, then the top -->
          <g v-for="s in parts" :key="`side-${s.key}`" :transform="`translate(${s.dx} ${s.dy})`">
            <path v-if="s.side" :d="s.side" :fill="s.color" class="side" />
          </g>
          <g
            v-for="s in parts"
            :key="`top-${s.key}`"
            :transform="`translate(${s.dx} ${s.dy})`"
            class="slice"
            :class="{ dim: hover && hover !== s.key }"
            @mouseenter="hover = s.key"
            @mouseleave="hover = null"
          >
            <path :d="s.top" :fill="s.color" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-linejoin="round" />
          </g>
          <ellipse :cx="cx" :cy="cy" :rx="rx" :ry="ry" fill="url(#pie-shine)" pointer-events="none" />
          <!-- percentages on the slices -->
          <g pointer-events="none">
            <text
              v-for="s in parts.filter((x) => x.p >= 6)"
              :key="`lbl-${s.key}`"
              :x="s.lx + s.dx"
              :y="s.ly + s.dy"
              class="lbl"
              text-anchor="middle"
              dominant-baseline="central"
            >
              {{ s.p }}%
            </text>
          </g>
        </template>
        <template v-else>
          <ellipse :cx="cx" :cy="cy + depth" :rx="rx" :ry="ry" class="empty-side" />
          <ellipse :cx="cx" :cy="cy" :rx="rx" :ry="ry" class="empty-top" />
          <text :x="cx" :y="cy" class="empty-lbl" text-anchor="middle" dominant-baseline="central">No data yet</text>
        </template>
      </svg>
      <div class="total">
        <span class="text-caption">{{ totalLabel }}</span>
        <strong>{{ formatValue(total) }}</strong>
      </div>
    </div>

    <!-- legend = exact numbers -->
    <ul class="legend">
      <li
        v-for="s in slices"
        :key="s.key"
        :class="{ dim: hover && hover !== s.key }"
        @mouseenter="hover = s.key"
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
.pie3d {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.plot {
  flex-shrink: 0;
}
.plot svg {
  width: 100%;
  height: auto;
  overflow: visible;
}
.shadow {
  fill: rgba(0, 0, 0, 0.18);
  filter: blur(6px);
}
.side {
  filter: brightness(0.7);
}
.slice {
  cursor: pointer;
  transition: opacity 0.15s;
}
.slice,
g {
  transition: transform 0.2s ease;
}
.dim {
  opacity: 0.45;
}
.lbl {
  fill: #fff;
  font-size: 13px;
  font-weight: 800;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 2.5px;
}
.empty-side {
  fill: var(--chart-grid);
  filter: brightness(0.9);
}
.empty-top {
  fill: var(--chart-grid);
}
.empty-lbl {
  fill: var(--chart-text-2);
  font-size: 12px;
}
.total {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
  color: var(--chart-text-2);
}
.total strong {
  color: var(--chart-text);
  font-size: 1.1rem;
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
  transition: opacity 0.15s;
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
