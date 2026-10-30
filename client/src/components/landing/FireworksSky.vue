<!-- A smaller fireworks canvas that can also be fired by hand (for example when a button is
     pressed). -->

<script setup>
// Draws sparks each frame, launches ambient fireworks on a timer and exposes launchAt so the parent
// can fire one at a point.

import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  ambient: { type: Boolean, default: true },
})

const emit = defineEmits(['burst'])

const canvas = ref(null)

const PALETTES = [
  ['#EF3340', '#FF8A94'],
  ['#FFFFFF', '#FFC857'],
  ['#EF3340', '#FFFFFF'],
  ['#FFC857', '#FFE3A3'],
]

let ctx = null
let frame = 0
let ambientTimer = 0
let introTimers = []
let rockets = []
let sparks = []
let burstCount = 0
let reduceMotion = false

// resize() - makes the canvas pixel size match its on-screen size (times the screen's pixel density,
// capped at 2 for speed) and scales the pen so drawing stays in CSS pixels.
function resize() {
  const c = canvas.value
  if (!c || !ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  c.width = Math.round(c.clientWidth * dpr)
  c.height = Math.round(c.clientHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// launch(x, y, shape) - sends a rocket from just below the bottom of the screen (up to 40px either
// side of x) to the target point. Flight time is shorter when the target is low. Does nothing when
// reduced motion is on. Starts the animation loop. Fire a rocket from the bottom of the screen to (x,
// y)
function launch(x, y, shape) {
  if (reduceMotion || !ctx) return
  const h = canvas.value.clientHeight
  const sx = x + (Math.random() - 0.5) * 80
  const sy = h + 8
  const dur = Math.max(18, Math.min(54, (sy - y) / 14))
  rockets.push({ x: sx, y: sy, sx, sy, tx: x, ty: y, t: 0, dur, shape })
  start()
}

// makeSpark(x, y, vx, vy, color, heart) - builds one spark: position, previous position (for the
// streak), speed, colour, life 1 (full) and a decay speed (hearts fade slower).
function makeSpark(x, y, vx, vy, color, heart) {
  return { x, y, px: x, py: y, vx, vy, color, heart, life: 1, decay: heart ? 0.0085 : 0.011 + Math.random() * 0.008 }
}

// burst(x, y, shape) - the explosion. 1) count bursts 2) decide heart or round (every 4th burst is a
// heart unless the shape is forced) 3) heart: 76 sparks placed on the classic heart curve, mostly red
// with some gold 4) round: pick a colour pair and 64-93 sparks flying in random directions 5) keep at
// most 900 sparks 6) emit "burst" so the page can react.
function burst(x, y, shape) {
  burstCount++
  const heart = shape === 'heart' || (shape !== 'round' && burstCount % 4 === 0)
  let main

  if (heart) {
    main = '#EF3340'
    const n = 76
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
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

// step() - draws one animation frame. 1) fade the previous frame a little (destination-out) to leave
// soft trails 2) 'lighter' mode so overlapping sparks glow 3) move each rocket along an ease-out path
// and draw its streak 4) when a rocket arrives remove it and call burst() 5) move each spark
// (friction, gravity, fade), draw a short line from its last position, remove dead ones 6) while
// anything is still moving ask for the next frame, otherwise clear the canvas and stop (saves
// battery).
function step() {
  frame = 0
  const c = canvas.value
  if (!c) return
  const w = c.clientWidth
  const h = c.clientHeight

  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'

  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]
    r.t++
    const k = Math.min(r.t / r.dur, 1)
    const e = 1 - (1 - k) ** 3
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

// start() - begins the animation loop if it is not already running.
function start() {
  if (!frame) frame = requestAnimationFrame(step)
}

// scheduleAmbient() - while ambient is on (and no reduced motion) waits 2.8-5.6 seconds, launches one
// firework in the upper part of the screen if the tab is visible, then schedules itself again.
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

// launchAt(clientX, clientY) - public method for the parent: convert a mouse/touch position to canvas
// coordinates and launch a rocket there.
function launchAt(clientX, clientY) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  launch(clientX - rect.left, clientY - rect.top)
}

// Makes launchAt callable from HomeView through a template ref.
defineExpose({ launchAt })

// the parent turns ambient fireworks on and off (e.g. only while the hero is on screen) When the
// parent turns ambient on or off, restart the ambient timer.
watch(
  () => props.ambient,
  () => scheduleAmbient(),
)

// onMounted - 1) read the reduced-motion setting 2) get the 2D pen 3) size the canvas and keep it
// sized on window resize 4) stop here for reduced motion 5) the opening salute: a round burst at 0.5s
// and a heart at 1.2s timed with the headline 6) start the ambient timer.
onMounted(() => {
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ctx = canvas.value.getContext('2d')
  resize()
  window.addEventListener('resize', resize)

  if (reduceMotion) return

  if (props.ambient) {
    const w = canvas.value.clientWidth
    const h = canvas.value.clientHeight
    introTimers.push(setTimeout(() => launch(w * 0.28, h * 0.2, 'round'), 500))
    introTimers.push(setTimeout(() => launch(w * 0.56, h * 0.16, 'heart'), 1200))
  }
  scheduleAmbient()
})

// onUnmounted - cancel the frame and all timers and remove the resize listener.
onUnmounted(() => {
  cancelAnimationFrame(frame)
  clearTimeout(ambientTimer)
  introTimers.forEach(clearTimeout)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <!-- One canvas. -->
  <canvas ref="canvas" class="sky" aria-hidden="true"></canvas>
</template>

<style scoped>
/* Styles that make the canvas fill its parent. */

.sky {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1020;
}
</style>
