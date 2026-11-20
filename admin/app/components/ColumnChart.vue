<script setup lang="ts">
const props = withDefaults(
  defineProps<{ points: { label: string; value: number; title?: string }[]; color?: string; unit?: string; height?: number }>(),
  { color: 'var(--series-1)', unit: '', height: 220 },
)

// Even, whole-number steps for the y axis (counts can't be fractions):
// about 4 steps of 1, 2, 5, 10, 20, 50… covering the biggest value.
const step = computed(() => {
  const m = Math.max(1, ...props.points.map((p) => p.value))
  const raw = m / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const nice = [1, 2, 5, 10].map((s) => s * pow).find((s) => s >= raw) ?? raw
  return Math.max(1, nice)
})
const top = computed(() => {
  const m = Math.max(1, ...props.points.map((p) => p.value))
  return Math.ceil(m / step.value) * step.value
})
const ticks = computed(() => Array.from({ length: top.value / step.value + 1 }, (_, i) => i * step.value))

const W = 1000
const H = 100
const n = computed(() => Math.max(1, props.points.length))
const slot = computed(() => W / n.value)
const barW = computed(() => Math.max(2, Math.min(48, slot.value * 0.62)))
const hover = ref<number | null>(null)
// Show every label when there's room, otherwise every other one.
const labelEvery = computed(() => (n.value > 16 ? Math.ceil(n.value / 10) : 1))
</script>

<template>
  <div class="col-chart">
    <div class="y-axis">
      <span v-for="t in [...ticks].reverse()" :key="t">{{ t.toLocaleString() }}</span>
    </div>
    <div class="plot" :style="{ height: `${height}px` }">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="grid">
        <line v-for="(t, i) in ticks" :key="i" x1="0" :x2="W" :y1="H - (t / top) * H" :y2="H - (t / top) * H" />
      </svg>
      <div class="bars">
        <div
          v-for="(p, i) in points"
          :key="p.label"
          class="bar-slot"
          @mouseenter="hover = i"
          @mouseleave="hover = null"
        >
          <div
            class="bar"
            :class="{ dim: hover !== null && hover !== i }"
            :style="{ height: `${(p.value / top) * 100}%`, width: `${(barW / slot) * 100}%`, background: color }"
          />
          <div v-if="hover === i" class="tip">
            <div class="text-caption" style="color: var(--chart-text-2)">{{ p.title || p.label }}</div>
            <div class="font-weight-black">{{ p.value.toLocaleString() }} {{ unit }}</div>
          </div>
        </div>
      </div>
      <div class="x-axis">
        <span v-for="(p, i) in points" :key="p.label" :style="{ visibility: i % labelEvery === 0 || i === points.length - 1 ? 'visible' : 'hidden' }">
          {{ p.label }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.col-chart {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  padding-bottom: 24px;
}
.y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--chart-text-2);
  text-align: right;
  font-variant-numeric: tabular-nums;
  transform: translateY(-0.5em);
}
.plot {
  position: relative;
}
.grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.grid line {
  stroke: var(--chart-grid);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.bars {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
}
.bar-slot {
  position: relative;
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  cursor: pointer;
}
.bar {
  border-radius: 4px 4px 0 0;
  min-height: 0;
  transition: opacity 0.15s, height 0.4s ease;
}
.bar.dim {
  opacity: 0.4;
}
.tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 3;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 0.85rem;
  color: var(--chart-text);
  background: var(--chart-surface);
  border: 1px solid var(--chart-grid);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}
.bar-slot .tip {
  bottom: auto;
  top: -8px;
  transform: translate(-50%, -100%);
}
.x-axis {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -22px;
  display: flex;
}
.x-axis span {
  flex: 1;
  text-align: center;
  font-size: 0.72rem;
  color: var(--chart-text-2);
  font-variant-numeric: tabular-nums;
}
</style>
