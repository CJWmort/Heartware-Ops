<script setup>
// Draws NDP-style fireworks on a <canvas> behind the landing page. No extra libraries needed.
import { onMounted, onBeforeUnmount, ref } from 'vue'

defineProps({
  skyline: { type: Boolean, default: true }, // true = show the Marina Bay silhouette along the bottom
})

const canvas = ref(null) // the <canvas> element (Vue fills this in once the page is mounted)

// ---- Colours as [R, G, B]. A colour listed twice is picked more often (red + white = NDP colours) ----
const PALETTE = [
  [255, 45, 65], // NDP red (brightened: dark red looks dull on a night sky)
  [255, 45, 65],
  [255, 255, 255], // white
  [255, 255, 255],
  [255, 205, 100], // gold
  [255, 130, 200], // pink
  [175, 120, 255], // purple
]

// ---- Tuning numbers (change these to adjust how the show looks) ----
const ROCKET_GRAVITY = 320 // how fast a rising rocket slows down (pixels per second squared)
const MAX_SPARKS = 1200 // hard limit so a slow phone never gets overloaded
const MIN_GAP_MS = 900 // shortest wait between launches
const MAX_GAP_MS = 2200 // longest wait between launches

// ---- Animation state (plain variables, not ref(): Vue does not need to watch these) ----
let ctx = null // the canvas "pen" we draw with
let frameId = 0 // id of the next scheduled frame, so we can cancel it
let lastTime = 0 // timestamp of the previous frame
let nextLaunch = 0 // when to launch the next rocket
let width = 0 // canvas size in CSS pixels
let height = 0
let rockets = [] // rising fireworks that have not burst yet
let sparks = [] // the glowing dots created by a burst
let resizeObserver = null

// Respect users who turned on "reduce motion" in their device settings
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const rand = (min, max) => min + Math.random() * (max - min) // random number between min and max
const pick = (list) => list[Math.floor(Math.random() * list.length)] // random item from a list

// Make the canvas match its on-screen size, and stay sharp on high-resolution (retina) screens
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) // cap at 2 so big phones stay fast
  width = canvas.value.clientWidth
  height = canvas.value.clientHeight
  canvas.value.width = width * dpr // real pixels
  canvas.value.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // so we can keep drawing in CSS pixels
}

// Send a rocket up from the bottom; it stops rising at a random height in the upper half
function launchRocket() {
  const targetY = height * rand(0.12, 0.42) // where it will burst
  const distance = height - targetY
  rockets.push({
    x: width * rand(0.1, 0.9),
    y: height,
    vy: -Math.sqrt(2 * ROCKET_GRAVITY * distance), // physics: v = sqrt(2·g·d) is just enough speed to reach that height
    color: pick(PALETTE),
    type: Math.random() < 0.3 ? 'willow' : 'peony', // 30% gold drooping "willow", 70% round "peony"
  })
}

// Explode into lots of sparks at (x, y)
function burst(x, y, color, type) {
  if (sparks.length > MAX_SPARKS) return // too busy already: skip this burst
  const isWillow = type === 'willow'
  const phone = width < 576
  const scale = Math.min(width, 900) / 900 + 0.25 // smaller bursts on small screens
  const count = Math.round((isWillow ? 90 : 130) * (phone ? 0.6 : 1)) // fewer sparks on phones
  const second = pick(PALETTE) // some bursts are two-tone like in the real NDP show
  const twoTone = !isWillow && Math.random() < 0.35

  // A quick soft flash at the moment of the explosion (drawn as a big fading circle, see draw())
  sparks.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 1,
    decay: 4.5,
    gravity: 0,
    drag: 1,
    size: 46,
    tail: 0,
    color: color,
    flash: true,
  })

  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2) // fly off in a random direction
    const speed = (isWillow ? rand(0.3, 1) * 170 : rand(0.3, 1) * 230) * scale // peony: a spread of speeds fills the ball, not just a thin ring
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1, // 1 = fully bright, 0 = gone
      decay: isWillow ? rand(0.25, 0.4) : rand(0.5, 0.75), // willow sparks last ~3s, peony ~1.6s
      gravity: isWillow ? 110 : 60, // how fast it droops downward
      drag: isWillow ? 0.975 : 0.985, // air resistance (closer to 1 = glides further)
      size: rand(1.4, 2.8), // thickness of the spark's streak
      tail: isWillow ? 0.14 : 0.07, // trail length in seconds of travel (willows leave longer trails)
      color: isWillow ? [255, 205, 100] : twoTone && i % 2 ? second : color, // willows are always gold
    })
  }
}

// Move everything forward by dt seconds
function update(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]
    r.vy += ROCKET_GRAVITY * dt // gravity slows the rocket down
    r.y += r.vy * dt
    if (r.vy >= -15) {
      // it has almost stopped rising: time to explode
      burst(r.x, r.y, r.color, r.type)
      rockets.splice(i, 1)
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    const drag = Math.pow(s.drag, dt * 60) // keeps the same feel on 60Hz and 120Hz screens
    s.vx *= drag
    s.vy = s.vy * drag + s.gravity * dt // slow down, then get pulled down
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= s.decay * dt // fade out
    if (s.life <= 0) sparks.splice(i, 1) // remove dead sparks
  }
}

function draw() {
  // Wipe the whole canvas every frame. Trails are drawn as short streaks below instead of by fading
  // the old frame, because fading leaves faint "ghost" lines that never fully disappear.
  ctx.clearRect(0, 0, width, height)

  // 'lighter' adds colours together, so overlapping sparks glow brighter
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const s of sparks) {
    const [r, g, b] = s.color
    if (s.flash) {
      const radius = s.size * (2 - s.life) // grows slightly as it fades
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius) // bright centre fading to nothing = soft edge
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${s.life * 0.45})`)
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.pow(s.life, 1.1)})` // alpha falls off smoothly
    ctx.lineWidth = s.size
    ctx.beginPath()
    ctx.moveTo(s.x - s.vx * s.tail, s.y - s.vy * s.tail) // tail = where the spark was a moment ago
    ctx.lineTo(s.x, s.y)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255, 240, 210, 0.9)' // rockets are warm-white streaks
  ctx.lineWidth = 2
  for (const r of rockets) {
    ctx.beginPath()
    ctx.moveTo(r.x, r.y - r.vy * 0.12) // vy is negative (moving up), so the tail points downward
    ctx.lineTo(r.x, r.y)
    ctx.stroke()
  }
}

// One animation frame; the browser calls this ~60 times a second
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05) // seconds since last frame, capped so a paused tab does not cause a jump
  lastTime = time

  if (time >= nextLaunch) {
    launchRocket()
    if (Math.random() < 0.25) launchRocket() // sometimes two at once
    nextLaunch = time + rand(MIN_GAP_MS, MAX_GAP_MS)
  }
  update(dt)
  draw()
  frameId = requestAnimationFrame(loop) // schedule the next frame
}

function start() {
  lastTime = performance.now()
  nextLaunch = lastTime + 300 // first rocket almost straight away
  frameId = requestAnimationFrame(loop)
}

function stop() {
  cancelAnimationFrame(frameId)
}

// Save battery: pause the show when the browser tab is hidden
function onVisibilityChange() {
  if (reduceMotion) return
  if (document.hidden) stop()
  else start()
}

// For "reduce motion" users: draw one frozen frame with a few bursts and do not animate
function drawStill() {
  burst(width * 0.3, height * 0.3, PALETTE[0], 'peony')
  burst(width * 0.7, height * 0.25, PALETTE[2], 'peony')
  burst(width * 0.5, height * 0.2, PALETTE[4], 'willow')
  update(0.4) // let the sparks spread out a little
  draw()
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  resize()
  // Re-fit the canvas whenever its size changes (window resize, phone rotation)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas.value)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (reduceMotion) drawStill()
  else start()
})

// Clean up when leaving the page, otherwise the animation would keep running in the background
onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <!-- aria-hidden: purely decorative, screen readers should skip it -->
  <div class="fireworks" aria-hidden="true">
    <canvas ref="canvas" class="fireworks-canvas"></canvas>
    <!-- soft red glow near the horizon, like the haze in the real show -->
    <div class="fireworks-glow"></div>
    <!-- dark gradient on the left so the headline stays easy to read -->
    <div class="fireworks-scrim"></div>

    <!-- Marina Bay silhouette: low city blocks, the dome, and the 3-tower hotel with its rooftop -->
    <svg
      v-if="skyline"
      class="fireworks-skyline"
      viewBox="0 0 1200 140"
      preserveAspectRatio="xMidYMax slice"
    >
      <g fill="#04070f">
        <rect x="0" y="104" width="60" height="36" />
        <rect x="60" y="92" width="40" height="48" />
        <rect x="100" y="110" width="70" height="30" />
        <rect x="170" y="98" width="36" height="42" />
        <rect x="206" y="108" width="60" height="32" />
        <path d="M290 140 Q360 62 430 140 Z" />
        <!-- dome -->
        <rect x="430" y="100" width="50" height="40" />
        <rect x="480" y="112" width="70" height="28" />
        <rect x="550" y="96" width="34" height="44" />
        <rect x="584" y="106" width="60" height="34" />
        <rect x="640" y="114" width="60" height="26" />
        <polygon points="710,140 714,54 732,54 736,140" />
        <!-- hotel tower 1 -->
        <polygon points="758,140 762,54 780,54 784,140" />
        <!-- hotel tower 2 -->
        <polygon points="806,140 810,54 828,54 832,140" />
        <!-- hotel tower 3 -->
        <path d="M694 52 L846 44 Q858 44 852 51 L832 56 L708 56 Z" />
        <!-- rooftop -->
        <rect x="860" y="112" width="100" height="28" />
        <rect x="960" y="104" width="50" height="36" />
        <rect x="1010" y="92" width="40" height="48" />
        <rect x="1050" y="108" width="70" height="32" />
        <rect x="1120" y="98" width="40" height="42" />
        <rect x="1160" y="110" width="40" height="30" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
/* Fills its parent (the parent must have position: relative) and ignores clicks so buttons on top still work */
.fireworks {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.fireworks-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.fireworks-glow {
  position: absolute;
  inset: auto 0 0 0;
  height: 45%;
  background: radial-gradient(ellipse at 60% 100%, rgb(214 0 28 / 0.3), transparent 65%);
}
.fireworks-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgb(7 12 24 / 0.8) 0%,
    rgb(7 12 24 / 0.35) 55%,
    transparent 100%
  );
}
.fireworks-skyline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: clamp(70px, 18vh, 150px);
}
</style>
