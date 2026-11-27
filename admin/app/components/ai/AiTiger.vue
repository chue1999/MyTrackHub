<script setup lang="ts">
/**
 * The AI assistant's mascot: an original cartoon tiger face drawn in SVG.
 * mood: idle (blinks, twitches ears), think (looks around while the AI is answering),
 * happy (closed smiling eyes), wave (bounces to say hello).
 */
withDefaults(defineProps<{ size?: number; mood?: 'idle' | 'think' | 'happy' | 'wave' }>(), {
  size: 48,
  mood: 'idle',
})
</script>

<template>
  <svg
    class="tiger"
    :class="`m-${mood}`"
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    role="img"
    aria-label="Tiger AI"
  >
    <g class="head">
      <!-- ears -->
      <g class="ear l">
        <circle cx="22" cy="26" r="14" fill="#F08C1A" />
        <circle cx="22" cy="27" r="8" fill="#FFE2C2" />
        <path d="M13 17 L19 23" stroke="#2B1A10" stroke-width="3" stroke-linecap="round" />
      </g>
      <g class="ear r">
        <circle cx="78" cy="26" r="14" fill="#F08C1A" />
        <circle cx="78" cy="27" r="8" fill="#FFE2C2" />
        <path d="M87 17 L81 23" stroke="#2B1A10" stroke-width="3" stroke-linecap="round" />
      </g>

      <!-- face -->
      <ellipse cx="50" cy="56" rx="39" ry="35" fill="#F9A11B" />
      <ellipse cx="50" cy="60" rx="33" ry="28" fill="#FBB33A" opacity=".6" />

      <!-- stripes -->
      <g fill="#2B1A10">
        <path d="M50 21 C47 27 47 32 50 37 C53 32 53 27 50 21Z" />
        <path d="M39 24 C38 29 39 32 42 35 C43 31 42 27 39 24Z" />
        <path d="M61 24 C62 29 61 32 58 35 C57 31 58 27 61 24Z" />
        <path d="M11 52 C17 51 21 53 24 56 C19 57 15 56 11 52Z" />
        <path d="M12 63 C17 61 21 62 24 64 C19 66 15 66 12 63Z" />
        <path d="M89 52 C83 51 79 53 76 56 C81 57 85 56 89 52Z" />
        <path d="M88 63 C83 61 79 62 76 64 C81 66 85 66 88 63Z" />
      </g>

      <!-- muzzle -->
      <ellipse cx="40" cy="71" rx="14" ry="11" fill="#FFF6EA" />
      <ellipse cx="60" cy="71" rx="14" ry="11" fill="#FFF6EA" />
      <ellipse cx="50" cy="80" rx="9" ry="6" fill="#FFF6EA" />

      <!-- cheeks -->
      <ellipse cx="26" cy="66" rx="6" ry="3.5" fill="#FF7A6B" opacity=".45" />
      <ellipse cx="74" cy="66" rx="6" ry="3.5" fill="#FF7A6B" opacity=".45" />

      <!-- eyes -->
      <g class="eyes">
        <g class="eye-open">
          <ellipse cx="36" cy="51" rx="5.5" ry="6.5" fill="#2B1A10" />
          <ellipse cx="64" cy="51" rx="5.5" ry="6.5" fill="#2B1A10" />
          <circle class="glint" cx="38" cy="48.5" r="2" fill="#fff" />
          <circle class="glint" cx="66" cy="48.5" r="2" fill="#fff" />
        </g>
        <g class="eye-happy" fill="none" stroke="#2B1A10" stroke-width="3.2" stroke-linecap="round">
          <path d="M30 53 Q36 45 42 53" />
          <path d="M58 53 Q64 45 70 53" />
        </g>
      </g>

      <!-- nose + mouth -->
      <path d="M44.5 63 Q50 60 55.5 63 Q53 68.5 50 69 Q47 68.5 44.5 63Z" fill="#E2566B" />
      <path
        class="mouth"
        d="M50 69 L50 72 M50 72 Q45 77 41 73 M50 72 Q55 77 59 73"
        fill="none"
        stroke="#2B1A10"
        stroke-width="2.4"
        stroke-linecap="round"
      />
      <!-- whiskers -->
      <g stroke="#2B1A10" stroke-width="1.4" stroke-linecap="round" opacity=".55">
        <path d="M27 72 L15 70 M27 76 L16 78" />
        <path d="M73 72 L85 70 M73 76 L84 78" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.tiger {
  display: block;
  overflow: visible;
}
.head,
.ear,
.eyes,
.eye-open,
.glint {
  transform-box: fill-box;
}
.head {
  transform-origin: 50% 90%;
}
.ear.l {
  transform-origin: 80% 90%;
}
.ear.r {
  transform-origin: 20% 90%;
}
.eye-open {
  transform-origin: center;
  animation: tiger-blink 4.5s infinite;
}
.eye-happy {
  display: none;
}

/* idle: blink + an ear twitch now and then */
.m-idle .ear.l {
  animation: tiger-ear 6s infinite;
}
.m-idle .ear.r {
  animation: tiger-ear 6s 0.25s infinite;
}

/* thinking: eyes look left and right, head sways */
.m-think .head {
  animation: tiger-sway 1.8s ease-in-out infinite;
}
.m-think .eye-open {
  animation:
    tiger-look 1.8s ease-in-out infinite,
    tiger-blink 4.5s infinite;
}

/* happy: smiling closed eyes */
.m-happy .eye-open {
  display: none;
}
.m-happy .eye-happy {
  display: inline;
}

/* wave: bounce hello */
.m-wave .head {
  animation: tiger-hello 2.4s ease-in-out infinite;
}
.m-wave .ear.l,
.m-wave .ear.r {
  animation: tiger-ear 2.4s infinite;
}

@keyframes tiger-blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}
@keyframes tiger-ear {
  0%,
  86%,
  100% {
    transform: rotate(0);
  }
  89% {
    transform: rotate(-12deg);
  }
  92% {
    transform: rotate(6deg);
  }
}
@keyframes tiger-look {
  0%,
  100% {
    transform: translateX(0);
  }
  30% {
    transform: translateX(-2.5px) translateY(-1px);
  }
  70% {
    transform: translateX(2.5px) translateY(-1px);
  }
}
@keyframes tiger-sway {
  0%,
  100% {
    transform: rotate(0);
  }
  30% {
    transform: rotate(-5deg);
  }
  70% {
    transform: rotate(5deg);
  }
}
@keyframes tiger-hello {
  0%,
  60%,
  100% {
    transform: translateY(0) rotate(0);
  }
  10% {
    transform: translateY(-6%) rotate(-8deg);
  }
  20% {
    transform: translateY(0) rotate(6deg);
  }
  30% {
    transform: translateY(-4%) rotate(-4deg);
  }
  40% {
    transform: translateY(0) rotate(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tiger * {
    animation: none !important;
  }
}
</style>
