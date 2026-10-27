<!--
  FireworksSky.vue
  A see-through <canvas> that covers the whole screen and draws fireworks.
  - The parent calls launchAt(clientX, clientY) to fire one where the user clicked
  - With :ambient="true" it also launches a few on its own
  - Every few bursts is heart-shaped (it's Heartware, after all)
  - Emits "burst" with { x, y, color } at the moment each firework explodes,
    so the page can react (the headline pulses in time with it)
  - Does nothing if the visitor has "reduce motion" switched on
-->
<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  ambient: { type: Boolean, default: true },
})

const emit = defineEmits(['burst'])

const canvas = ref(null)

const PALETTES = [
  ['#EF3340', '#FF8A94'], // Singapore red
  ['#FFFFFF', '#FFC857'], // white + gold
  ['#EF3340', '#FFFFFF'], // red + white
  ['#FFC857', '#FFE3A3'], // gold
]

let ctx = null
let frame = 0
let ambientTimer = 0
let introTimers = []
let rockets = []
let sparks = []
let burstCount = 0
let reduceMotion = false

function resize() {
  const c = canvas.value
  if (!c || !ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  c.width = Math.round(c.clientWidth * dpr)
  c.height = Math.round(c.clientHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// Fire a rocket from the bottom of the screen to (x, y)
function launch(x, y, shape) {
  if (reduceMotion || !ctx) return
  const h = canvas.value.clientHeight
  const sx = x + (Math.random() - 0.5) * 80
  const sy = h + 8
  // shorter flight when the target is near the bottom
  const dur = Math.max(18, Math.min(54, (sy - y) / 14))
  rockets.push({ x: sx, y: sy, sx, sy, tx: x, ty: y, t: 0, dur, shape })
  start()
}

function makeSpark(x, y, vx, vy, color, heart) {
  return { x, y, px: x, py: y, vx, vy, color, heart, life: 1, decay: heart ? 0.0085 : 0.011 + Math.random() * 0.008 }
}

function burst(x, y, shape) {
  burstCount++
  const heart = shape === 'heart' || (shape !== 'round' && burstCount % 4 === 0)
  let main

  if (heart) {
    main = '#EF3340'
    const n = 76
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      // classic heart curve
      const hx = 16 * Math.sin(t) ** 3
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
      sparks.push(makeSpark(x, y, hx * 0.21, hy * 0.21, i % 5 ? '#EF3340' : '#FFC857', true))
    }
  } else {
    const [c1, c2] = PALETTES[Math.floor(Math.random() * PALETTES.length)]
    main = c1
    const n = 64 + Math.floor(Math.random() * 30)
    const power = 2.3 + Math.random() * 1.6
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = power * (0.35 + Math.random() * 0.65)
      sparks.push(makeSpark(x, y, Math.cos(a) * v, Math.sin(a) * v, Math.random() < 0.7 ? c1 : c2, false))
    }
  }
  if (sparks.length > 900) sparks.splice(0, sparks.length - 900)

  emit('burst', { x, y, color: main })
}

function step() {
  frame = 0
  const c = canvas.value
  if (!c) return
  const w = c.clientWidth
  const h = c.clientHeight

  // fade the last frame out a little, which leaves soft trails
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'

  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]
    r.t++
    const k = Math.min(r.t / r.dur, 1)
    const e = 1 - (1 - k) ** 3 // ease out: slows as it reaches the top
    const nx = r.sx + (r.tx - r.sx) * e
    const ny = r.sy + (r.ty - r.sy) * e
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(255, 222, 170, 0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(r.x, r.y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    r.x = nx
    r.y = ny
    if (k >= 1) {
      rockets.splice(i, 1)
      burst(r.tx, r.ty, r.shape)
    }
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    s.px = s.x
    s.py = s.y
    const friction = s.heart ? 0.955 : 0.972
    s.vx *= friction
    s.vy = s.vy * friction + (s.heart ? 0.016 : 0.035)
    s.x += s.vx
    s.y += s.vy
    s.life -= s.decay
    if (s.life <= 0) {
      sparks.splice(i, 1)
      continue
    }
    const flicker = s.life < 0.4 ? 0.6 + Math.random() * 0.4 : 1
    ctx.globalAlpha = s.life * flicker
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(s.px, s.py)
    ctx.lineTo(s.x, s.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  if (rockets.length || sparks.length) {
    frame = requestAnimationFrame(step)
  } else {
    ctx.clearRect(0, 0, w, h)
  }
}

function start() {
  if (!frame) frame = requestAnimationFrame(step)
}

// launches one now and then, in the upper part of the screen
function scheduleAmbient() {
  clearTimeout(ambientTimer)
  if (!props.ambient || reduceMotion) return
  ambientTimer = setTimeout(() => {
    if (!document.hidden && canvas.value) {
      const w = canvas.value.clientWidth
      const h = canvas.value.clientHeight
      launch(w * (0.08 + Math.random() * 0.84), h * (0.1 + Math.random() * 0.26))
    }
    scheduleAmbient()
  }, 2800 + Math.random() * 2800)
}

// Called by the parent with mouse/touch coordinates
function launchAt(clientX, clientY) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  launch(clientX - rect.left, clientY - rect.top)
}

defineExpose({ launchAt })

// the parent turns ambient fireworks on and off (e.g. only while the hero is on screen)
watch(
  () => props.ambient,
  () => scheduleAmbient(),
)

onMounted(() => {
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ctx = canvas.value.getContext('2d')
  resize()
  window.addEventListener('resize', resize)

  if (reduceMotion) return

  // opening salute, timed with the headline
  if (props.ambient) {
    const w = canvas.value.clientWidth
    const h = canvas.value.clientHeight
    introTimers.push(setTimeout(() => launch(w * 0.28, h * 0.2, 'round'), 500))
    introTimers.push(setTimeout(() => launch(w * 0.56, h * 0.16, 'heart'), 1200))
  }
  scheduleAmbient()
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  clearTimeout(ambientTimer)
  introTimers.forEach(clearTimeout)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas ref="canvas" class="sky" aria-hidden="true"></canvas>
</template>

<style scoped>
/* covers the whole screen, above the page but below the navbar; clicks pass straight through */
.sky {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1020;
}
</style>