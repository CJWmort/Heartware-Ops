<!--
  VideoShowcase.vue — autoplaying video carousel
  - Plays muted on its own (browsers only allow muted autoplay)
  - When a video ends, slides to the next one, then loops back to the first
  - Arrows on the video, pause and sound buttons in the corner, click the video to pause
  - Always shows the whole picture (no cropping)
  - Pauses while scrolled off screen; respects "reduce motion"

  Put your video files in  public/videos/  and update the paths below
  (or pass your own list:  <VideoShowcase :videos="myVideos" /> ).

  <VideoShowcase fill />  stretches the player to the full height of its parent
  on laptops (instead of a fixed 16:9 box).
  <VideoShowcase :advance-after="15" />  moves on every 15 seconds instead of
  waiting for each video to end.
-->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  videos: {
    type: Array,
    default: () => [
      { src: '/videos/Heartware.mp4' },
      { src: '/videos/Heartware2.mp4' },
      { src: '/videos/Heartware3.mp4' },
      { src: '/videos/Heartware4.mp4' },
    ],
  },
  fill: { type: Boolean, default: false },
  // 0 = move on when each video ends; any other number = move on after that many seconds
  advanceAfter: { type: Number, default: 0 },
})

const root = ref(null)
const videoEl = ref(null)
const active = ref(0)
const direction = ref('next')
const muted = ref(true)
const paused = ref(false) // the viewer pressed pause, or the browser blocked autoplay
const progress = ref(0) // 0 to 1, how far the current video has played
const failed = ref(false)
const reduceMotion = ref(false)
const tilt = ref({ x: 0, y: 0 })

let onScreen = true
let observer = null
let skipTimer = 0

const current = computed(() => props.videos[active.value])
const hasMany = computed(() => props.videos.length > 1)

// slide left/right depending on direction (a simple fade if reduce motion is on)
const slideName = computed(() => (reduceMotion.value ? 'fade' : 'slide-' + direction.value))

const frameStyle = computed(() => ({
  transform: `perspective(1100px) rotateX(${tilt.value.x}deg) rotateY(${tilt.value.y}deg)`,
}))

// ---- Moving between videos ----
function go(index, dir) {
  if (!hasMany.value) return
  const n = props.videos.length
  clearTimeout(skipTimer)
  direction.value = dir
  active.value = (index + n) % n
  progress.value = 0
  failed.value = false
}

function next() {
  go(active.value + 1, 'next')
}

function prev() {
  go(active.value - 1, 'prev')
}

// ---- Playing ----
function playCurrent() {
  const v = videoEl.value
  if (!v || paused.value || failed.value || !onScreen) return
  v.play().catch(() => {
    // browsers block autoplay with sound: try again muted, otherwise show the play button
    if (!v.muted) {
      muted.value = true
      v.muted = true
      v.play().catch(() => (paused.value = true))
    } else {
      paused.value = true
    }
  })
}

function togglePause() {
  if (failed.value) return
  paused.value = !paused.value
  if (paused.value) videoEl.value?.pause()
  else playCurrent()
}

function toggleSound() {
  muted.value = !muted.value
  if (!muted.value && paused.value) {
    paused.value = false
    playCurrent()
  }
}

// ---- Video events (ignore any from the video that's sliding out) ----
function isCurrent(event) {
  return event.target === videoEl.value
}

function onCanPlay(event) {
  if (isCurrent(event)) playCurrent()
}

function onTime(event) {
  if (!isCurrent(event)) return
  const v = event.target
  const length =
    props.advanceAfter > 0 ? Math.min(props.advanceAfter, v.duration || Infinity) : v.duration
  progress.value = length ? Math.min(v.currentTime / length, 1) : 0
  if (props.advanceAfter > 0 && v.currentTime >= props.advanceAfter) next()
}

function onEnded(event) {
  if (isCurrent(event)) next()
}

function onError(event) {
  if (!isCurrent(event)) return
  failed.value = true
  // skip a video that can't load
  if (hasMany.value) skipTimer = setTimeout(next, 2500)
}

// ---- 3D tilt on hover ----
function onTilt(event) {
  if (reduceMotion.value || event.pointerType === 'touch') return
  const box = event.currentTarget.getBoundingClientRect()
  const px = (event.clientX - box.left) / box.width - 0.5
  const py = (event.clientY - box.top) / box.height - 0.5
  tilt.value = { x: -py * 5, y: px * 6 }
}

function resetTilt() {
  tilt.value = { x: 0, y: 0 }
}

onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // with reduce motion on, wait for the viewer to press play
  if (reduceMotion.value) paused.value = true

  // pause while the player is scrolled off screen
  observer = new IntersectionObserver(
    (entries) => {
      onScreen = entries[entries.length - 1].intersectionRatio >= 0.2
      if (onScreen) playCurrent()
      else videoEl.value?.pause()
    },
    { threshold: [0, 0.2] },
  )
  observer.observe(root.value)
})

onUnmounted(() => {
  observer?.disconnect()
  clearTimeout(skipTimer)
})
</script>

<template>
  <div ref="root" class="showcase" :class="{ 'is-fill': fill }">
    <div
      class="frame"
      :class="{ 'is-paused': paused }"
      :style="frameStyle"
      @pointermove="onTilt"
      @pointerleave="resetTilt"
    >
      <div
        class="ratio ratio-16x9 screen"
        role="region"
        aria-roledescription="carousel"
        aria-label="Heartware videos"
      >
        <div class="stage">
          <Transition :name="slideName" @before-leave="(el) => el.pause()">
            <video
              :key="current.src"
              ref="videoEl"
              class="slide"
              :src="current.src"
              :muted="muted"
              :autoplay="!paused"
              :loop="!hasMany"
              :aria-label="`Heartware video ${active + 1}`"
              playsinline
              preload="auto"
              @canplay="onCanPlay"
              @timeupdate="onTime"
              @ended="onEnded"
              @error="onError"
              @click="togglePause"
            ></video>
          </Transition>

          <!-- previous / next -->
          <template v-if="hasMany">
            <button type="button" class="nav nav-prev" aria-label="Previous video" @click="prev">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" class="nav nav-next" aria-label="Next video" @click="next">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </template>

          <!-- shown when paused, when autoplay is blocked, or when a video can't load -->
          <!-- FIX: no visible video title any more; the screen-reader names use the video number (active + 1) instead of a label -->
          <Transition name="cover">
            <button
              v-if="paused || failed"
              type="button"
              class="cover"
              :disabled="failed"
              :aria-label="`Play Heartware video ${active + 1}`"
              @click="togglePause"
            >
              <span v-if="!failed" class="play">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
                </svg>
              </span>
              <span v-if="failed" class="cover-meta">This video can't play right now.</span>
            </button>
          </Transition>

          <!-- pause and sound -->
          <div class="corner">
            <button
              type="button"
              class="icon-btn"
              :aria-label="paused ? 'Play video' : 'Pause video'"
              @click="togglePause"
            >
              <svg v-if="paused" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <rect
                  x="6.5"
                  y="5"
                  width="4"
                  height="14"
                  rx="1"
                  fill="currentColor"
                  stroke="none"
                />
                <rect
                  x="13.5"
                  y="5"
                  width="4"
                  height="14"
                  rx="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </button>
            <button
              type="button"
              class="icon-btn"
              :class="{ 'is-on': !muted }"
              :aria-label="muted ? 'Turn sound on' : 'Turn sound off'"
              @click="toggleSound"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
                <template v-if="muted">
                  <path d="M16 9.5l5 5M21 9.5l-5 5" />
                </template>
                <template v-else>
                  <path d="M15.5 9a4 4 0 0 1 0 6" />
                  <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
                </template>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@property --hw-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.showcase {
  position: relative;
  z-index: 1;
  cursor: auto;
}

/* Gradient border that slowly rotates */
.frame {
  --hw-angle: 0deg;
  position: relative;
  padding: 2px;
  border-radius: 22px;
  background: conic-gradient(
    from var(--hw-angle),
    rgba(239, 51, 64, 0.9),
    rgba(255, 200, 87, 0.7),
    rgba(244, 246, 251, 0.08) 40%,
    rgba(244, 246, 251, 0.08) 70%,
    rgba(239, 51, 64, 0.9)
  );
  box-shadow:
    0 40px 100px -30px rgba(239, 51, 64, 0.6),
    0 10px 30px -10px rgba(0, 0, 0, 0.6);
  transition:
    transform 0.25s ease-out,
    box-shadow 0.4s ease;
  animation: hw-spin 6s linear infinite;
  will-change: transform;
}

.frame.is-paused {
  animation-duration: 14s;
  box-shadow:
    0 30px 80px -30px rgba(239, 51, 64, 0.4),
    0 10px 30px -10px rgba(0, 0, 0, 0.6);
}

@keyframes hw-spin {
  to {
    --hw-angle: 360deg;
  }
}

.screen {
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 80% 0%, rgba(239, 51, 64, 0.35), transparent 60%),
    radial-gradient(90% 80% at 0% 100%, rgba(255, 200, 87, 0.16), transparent 60%), #0b1126;
}

/* everything inside the screen sits on this layer */
.stage {
  overflow: hidden;
}

/* fill mode (laptops): stretch to the parent's full height instead of 16:9 */
@media (min-width: 992px) {
  .showcase.is-fill {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .showcase.is-fill .frame {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .showcase.is-fill .screen {
    flex: 1 1 auto;
    min-height: 240px;
  }

  /* Bootstrap's .ratio sets its height with this; fill mode doesn't need it */
  .showcase.is-fill .screen::before {
    display: none;
  }
}

/* ---------- Slides ---------- */
.slide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* always show the whole picture; change to "cover" to fill the frame edge to edge (crops the sides) */
  object-fit: contain;
  background: transparent;
  cursor: pointer;
}

/* the new video slides in over the old one, which drifts back and dims */
.slide-next-enter-active,
.slide-prev-enter-active {
  z-index: 2;
  transition: transform 0.75s cubic-bezier(0.65, 0, 0.35, 1);
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.55);
}

.slide-next-leave-active,
.slide-prev-leave-active {
  z-index: 1;
  transition:
    transform 0.75s cubic-bezier(0.65, 0, 0.35, 1),
    filter 0.75s ease;
}

.slide-next-enter-from {
  transform: translateX(100%);
}

.slide-next-leave-to {
  transform: translateX(-30%);
  filter: brightness(0.35);
}

.slide-prev-enter-from {
  transform: translateX(-100%);
}

.slide-prev-leave-to {
  transform: translateX(30%);
  filter: brightness(0.35);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---------- Arrows ---------- */
.nav {
  position: absolute;
  top: 50%;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-top: -23px;
  border-radius: 50%;
  border: 1px solid rgba(244, 246, 251, 0.25);
  background: rgba(7, 11, 26, 0.55);
  color: #f4f6fb;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: 0;
  transition:
    opacity 0.25s ease,
    transform 0.25s ease,
    background-color 0.25s ease;
}

.nav-prev {
  left: 14px;
  transform: translateX(-8px);
}

.nav-next {
  right: 14px;
  transform: translateX(8px);
}

.nav svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* arrows slide in when you hover the video */
.frame:hover .nav,
.nav:focus-visible {
  opacity: 1;
  transform: none;
}

.nav:hover {
  background: #ef3340;
  border-color: #ef3340;
}

/* touch screens have no hover, so keep the arrows visible */
@media (hover: none) {
  .nav {
    opacity: 0.9;
    transform: none;
  }
}

/* ---------- Corner buttons ---------- */
.corner {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 3;
  display: flex;
  gap: 0.5rem;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(244, 246, 251, 0.25);
  background: rgba(7, 11, 26, 0.55);
  color: #f4f6fb;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    transform 0.2s ease;
}

.icon-btn:hover {
  background: rgba(244, 246, 251, 0.16);
}

.icon-btn:active {
  transform: scale(0.92);
}

.icon-btn.is-on {
  background: #ef3340;
  border-color: #ef3340;
}

.icon-btn svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav:focus-visible,
.icon-btn:focus-visible {
  outline: 2px solid #ffc857;
  outline-offset: 2px;
}

/* ---------- Paused / error cover ---------- */
.cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 0;
  color: #f4f6fb;
  background: linear-gradient(180deg, rgba(7, 11, 26, 0.25), rgba(7, 11, 26, 0.75));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  cursor: pointer;
}

.cover:disabled {
  cursor: default;
}

.play {
  position: relative;
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: #ef3340;
  color: #fff;
  transition: transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1);
}

.play svg {
  width: 34px;
  height: 34px;
  margin-left: 4px;
}

/* two rings ripple out from the play button */
.play::before,
.play::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(239, 51, 64, 0.8);
  animation: hw-ripple 2.4s ease-out infinite;
}

.play::after {
  animation-delay: 1.2s;
}

@keyframes hw-ripple {
  from {
    transform: scale(1);
    opacity: 0.9;
  }
  to {
    transform: scale(1.9);
    opacity: 0;
  }
}

.cover:hover .play,
.cover:focus-visible .play {
  transform: scale(1.1);
}

.cover:focus-visible {
  outline: 3px solid #ffc857;
  outline-offset: -6px;
}

.cover-title {
  font-family: var(--hw-display, 'Barlow Condensed', sans-serif);
  font-weight: 800;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  line-height: 1;
}

.cover-meta {
  font-size: 0.95rem;
  color: #ffc857;
}

.cover-enter-active,
.cover-leave-active {
  transition: opacity 0.3s ease;
}

.cover-enter-from,
.cover-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .frame,
  .play::before,
  .play::after {
    animation: none;
  }
  .nav {
    transition: none;
  }
}
</style>
