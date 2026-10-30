<!-- The animated fireworks canvas behind the landing and login pages, with an optional Marina Bay
     skyline. -->

<script setup>
// Draws rockets, bursts and sparks on a canvas each frame, pauses when the tab is hidden and draws a
// still picture for people who prefer reduced motion.

import { onMounted, onBeforeUnmount, ref } from 'vue'

defineProps({
  skyline: { type: Boolean, default: true },
})

const canvas = ref(null)

const PALETTE = [
  [255, 45, 65],
  [255, 45, 65],
  [255, 255, 255],
  [255, 255, 255],
  [255, 205, 100],
  [255, 130, 200],
  [175, 120, 255],
]

const ROCKET_GRAVITY = 320
const MAX_SPARKS = 1200
const MIN_GAP_MS = 900
const MAX_GAP_MS = 2200

let ctx = null
let frameId = 0
let lastTime = 0
let nextLaunch = 0
let width = 0
let height = 0
let rockets = []
let sparks = []
let resizeObserver = null

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// rand(min, max) = random number in a range; pick(list) = random item of a list.
const rand = (min, max) => min + Math.random() * (max - min)
// pick(list) - a random item from a list.
const pick = (list) => list[Math.floor(Math.random() * list.length)]

// resize() - makes the canvas pixel size match its on-screen size (density capped at 2) so it stays
// sharp on retina screens.
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = canvas.value.clientWidth
  height = canvas.value.clientHeight
  canvas.value.width = width * dpr
  canvas.value.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// launchRocket() - adds a rocket at a random x on the bottom edge. It gets the exact upward speed (v =
// sqrt(2 x gravity x distance)) to stop at a random height in the upper half, a random colour, and a
// type: 30% "willow" (gold, drooping), 70% "peony" (round).
function launchRocket() {
  const targetY = height * rand(0.12, 0.42)
  const distance = height - targetY
  rockets.push({
    x: width * rand(0.1, 0.9),
    y: height,
    vy: -Math.sqrt(2 * ROCKET_GRAVITY * distance),
    color: pick(PALETTE),
    type: Math.random() < 0.3 ? 'willow' : 'peony',
  })
}

// burst(x, y, color, type) - the explosion. 1) skip if there are already too many sparks 2) scale the
// burst to the screen (smaller on phones, fewer sparks) 3) add one big soft "flash" circle 4) add 90
// (willow) or 130 (peony) sparks flying in random directions with their own speed, fade time, gravity,
// drag and tail length 5) 35% of peonies are two-tone.
function burst(x, y, color, type) {
  if (sparks.length > MAX_SPARKS) return
  const isWillow = type === 'willow'
  const phone = width < 576
  const scale = Math.min(width, 900) / 900 + 0.25
  const count = Math.round((isWillow ? 90 : 130) * (phone ? 0.6 : 1))
  const second = pick(PALETTE)
  const twoTone = !isWillow && Math.random() < 0.35

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
    const angle = rand(0, Math.PI * 2)
    const speed = (isWillow ? rand(0.3, 1) * 170 : rand(0.3, 1) * 230) * scale
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: isWillow ? rand(0.25, 0.4) : rand(0.5, 0.75),
      gravity: isWillow ? 110 : 60,
      drag: isWillow ? 0.975 : 0.985,
      size: rand(1.4, 2.8),
      tail: isWillow ? 0.14 : 0.07,
      color: isWillow ? [255, 205, 100] : twoTone && i % 2 ? second : color,
    })
  }
}

// update(dt) - moves everything forward by dt seconds. Rockets slow down with gravity and burst when
// they almost stop rising; sparks lose speed (drag), fall (gravity), fade (life) and are removed when
// life reaches 0. The drag is scaled by dt so 60 Hz and 120 Hz screens look the same.
function update(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]
    r.vy += ROCKET_GRAVITY * dt
    r.y += r.vy * dt
    if (r.vy >= -15) {
      burst(r.x, r.y, r.color, r.type)
      rockets.splice(i, 1)
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    const drag = Math.pow(s.drag, dt * 60)
    s.vx *= drag
    s.vy = s.vy * drag + s.gravity * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= s.decay * dt
    if (s.life <= 0) sparks.splice(i, 1)
  }
}

// draw() - paints one frame: 1) clear the whole canvas (no fading trails, which left ghost lines) 2)
// 'lighter' blending so overlapping sparks glow 3) draw each flash as a soft radial gradient 4) draw
// each spark as a short streak from where it just was 5) draw each rocket as a short warm-white
// streak.
function draw() {
  ctx.clearRect(0, 0, width, height)

  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const s of sparks) {
    const [r, g, b] = s.color
    if (s.flash) {
      const radius = s.size * (2 - s.life)
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius)
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${s.life * 0.45})`)
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.pow(s.life, 1.1)})`
    ctx.lineWidth = s.size
    ctx.beginPath()
    ctx.moveTo(s.x - s.vx * s.tail, s.y - s.vy * s.tail)
    ctx.lineTo(s.x, s.y)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255, 240, 210, 0.9)'
  ctx.lineWidth = 2
  for (const r of rockets) {
    ctx.beginPath()
    ctx.moveTo(r.x, r.y - r.vy * 0.12)
    ctx.lineTo(r.x, r.y)
    ctx.stroke()
  }
}

// loop(time) - one animation frame. 1) compute seconds since the last frame (capped at 0.05 so a
// paused tab does not jump) 2) when it is time launch a rocket (25% chance of two) and pick the next
// launch time 3) update 4) draw 5) ask the browser for the next frame.
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  if (time >= nextLaunch) {
    launchRocket()
    if (Math.random() < 0.25) launchRocket()
    nextLaunch = time + rand(MIN_GAP_MS, MAX_GAP_MS)
  }
  update(dt)
  draw()
  frameId = requestAnimationFrame(loop)
}

// start() - begin the loop; the first rocket goes up after 0.3 seconds.
function start() {
  lastTime = performance.now()
  nextLaunch = lastTime + 300
  frameId = requestAnimationFrame(loop)
}

// stop() - cancel the next frame.
function stop() {
  cancelAnimationFrame(frameId)
}

// onVisibilityChange() - pause the show while the browser tab is hidden and restart it when visible
// again (saves battery). Ignored for reduced motion.
function onVisibilityChange() {
  if (reduceMotion) return
  if (document.hidden) stop()
  else start()
}

// drawStill() - for reduced-motion visitors: add three bursts, let the sparks spread for 0.4 seconds
// and draw a single still frame.
function drawStill() {
  burst(width * 0.3, height * 0.3, PALETTE[0], 'peony')
  burst(width * 0.7, height * 0.25, PALETTE[2], 'peony')
  burst(width * 0.5, height * 0.2, PALETTE[4], 'willow')
  update(0.4)
  draw()
}

// onMounted - 1) get the pen 2) size the canvas 3) watch for size changes with a ResizeObserver 4)
// listen for tab visibility 5) draw a still frame (reduced motion) or start the animation.
onMounted(() => {
  ctx = canvas.value.getContext('2d')
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas.value)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (reduceMotion) drawStill()
  else start()
})

// onBeforeUnmount - stop the loop, the observer and the listener so nothing keeps running after
// leaving the page.
onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <!-- A full-size canvas and the skyline picture. -->
  <div class="fireworks" aria-hidden="true">
    <canvas ref="canvas" class="fireworks-canvas"></canvas>
    <div class="fireworks-glow"></div>
    <div class="fireworks-scrim"></div>

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
        <rect x="430" y="100" width="50" height="40" />
        <rect x="480" y="112" width="70" height="28" />
        <rect x="550" y="96" width="34" height="44" />
        <rect x="584" y="106" width="60" height="34" />
        <rect x="640" y="114" width="60" height="26" />
        <polygon points="710,140 714,54 732,54 736,140" />
        <polygon points="758,140 762,54 780,54 784,140" />
        <polygon points="806,140 810,54 828,54 832,140" />
        <path d="M694 52 L846 44 Q858 44 852 51 L832 56 L708 56 Z" />
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
/* Styles that place the canvas behind the content. */

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
