<script setup lang="ts">
/**
 * A lightweight, dependency-free QR-style preview. It draws a deterministic
 * module grid (with the three finder squares) derived from the value, so each
 * IMSI gets a stable, QR-looking image. It is NOT a scannable code — the real
 * eSIM QR comes from the telecom API later; this is only a visual placeholder.
 */
const props = withDefaults(defineProps<{ value: string; size?: number; modules?: number }>(), {
  size: 190,
  modules: 25,
})

// A small string hash → 32-bit, expanded into a pseudo-random bit per cell.
function cells(value: string, n: number): boolean[][] {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const grid: boolean[][] = []
  for (let y = 0; y < n; y++) {
    const row: boolean[] = []
    for (let x = 0; x < n; x++) {
      h ^= (x * 73856093) ^ (y * 19349663)
      h = Math.imul(h, 2654435761)
      row.push(((h >>> 13) & 1) === 1)
    }
    grid.push(row)
  }
  return grid
}

// True inside one of the three 7×7 finder patterns (top-left, top-right, bottom-left).
function inFinder(x: number, y: number, n: number): boolean | null {
  const corners = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]
  for (const [cx, cy] of corners) {
    if (x >= cx && x < cx + 7 && y >= cy && y < cy + 7) {
      const lx = x - cx
      const ly = y - cy
      const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6
      const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4
      return ring || core
    }
  }
  return null
}

const grid = computed(() => cells(props.value || 'sample', props.modules))
const cell = computed(() => props.size / props.modules)
const rects = computed(() => {
  const out: { x: number; y: number }[] = []
  const n = props.modules
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const f = inFinder(x, y, n)
      const on = f === null ? grid.value[y]![x]! : f
      if (on) out.push({ x: x * cell.value, y: y * cell.value })
    }
  }
  return out
})
</script>

<template>
  <div class="qr-wrap">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" role="img" aria-label="QR preview">
      <rect :width="size" :height="size" fill="#fff" />
      <rect
        v-for="(r, i) in rects"
        :key="i"
        :x="r.x"
        :y="r.y"
        :width="cell"
        :height="cell"
        fill="#111"
      />
    </svg>
    <div class="qr-note">Sample QR (preview)</div>
  </div>
</template>

<style scoped>
.qr-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 12px;
  background: #fff;
}
.qr-note {
  font-size: 0.7rem;
  color: rgba(17, 24, 39, 0.5);
}
</style>
