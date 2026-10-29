<!--
  VideoShowcase.vue — autoplaying video carousel
  - Plays muted on its own (browsers only allow muted autoplay)
  - When a video ends, slides to the next one, then loops back to the first
  - Arrows on the video, pause and sound buttons in the corner, click the video to pause
  - Always shows the whole picture (no cropping)
  - Pauses while scrolled off screen; respects "reduce motion"

  The videos are YouTube videos. Change the IDs in utils/youtube.js
  (or pass your own list:  <VideoShowcase :videos="[{ id: 'pSg-DubiZK0' }]" /> ).

  <VideoShowcase fill />  stretches the player to the full height of its parent
  on laptops (instead of a fixed 16:9 box).
  <VideoShowcase :advance-after="15" />  moves on every 15 seconds instead of
  waiting for each video to end.
-->
<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  HEARTWARE_VIDEO_ID,
  HEARTWARE_SHORT_ID,
  PLAYER_STATE,
  loadYouTubeApi,
} from '@/utils/youtube'

const props = defineProps({
  videos: {
    type: Array,
    default: () => [{ id: HEARTWARE_VIDEO_ID }, { id: HEARTWARE_SHORT_ID }],
  },
  fill: { type: Boolean, default: false },
  // 0 = move on when each video ends; any other number = move on after that many seconds
  advanceAfter: { type: Number, default: 0 },
})

const root = ref(null)
const slideEl = ref(null)
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
let startTimer = 0
let pollTimer = 0
let autoBlocked = false

const players = new Map()

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

// ---- Players ----
function currentEntry() {
  return slideEl.value ? players.get(slideEl.value) : undefined
}

function withPlayer(action) {
  const entry = currentEntry()
  if (entry && entry.ready) action(entry.player)
}

function isActive(el) {
  return el === slideEl.value
}

function createPlayer(el, id, label) {
  const holder = document.createElement('div')
  el.appendChild(holder)
  const entry = { player: null, ready: false, dead: false }
  players.set(el, entry)
  loadYouTubeApi()
    .then((YT) => {
      if (entry.dead) return
      entry.player = new YT.Player(holder, {
        videoId: id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (entry.dead) return
            entry.ready = true
            const frame = entry.player.getIframe()
            frame.setAttribute('title', label)
            frame.setAttribute('tabindex', '-1')
            if (isActive(el)) playCurrent()
          },
          onStateChange: (event) => onPlayerState(el, entry, event.data),
          onError: () => {
            if (!entry.dead && isActive(el)) onFail()
          },
        },
      })
    })
    .catch(() => {
      if (!entry.dead && isActive(el)) onFail()
    })
}

function mountCurrent() {
  const el = slideEl.value
  if (!el || players.has(el) || !current.value) return
  createPlayer(el, current.value.id, `Heartware video ${active.value + 1}`)
}

function destroyEntry(el) {
  const entry = players.get(el)
  if (!entry) return
  entry.dead = true
  if (entry.player && typeof entry.player.destroy === 'function') entry.player.destroy()
  players.delete(el)
}

function onBeforeLeave(el) {
  const entry = players.get(el)
  if (entry && entry.ready) entry.player.pauseVideo()
}

function onAfterLeave(el) {
  destroyEntry(el)
}

// ---- Playing ----
function watchStart(entry) {
  clearTimeout(startTimer)
  startTimer = setTimeout(() => {
    if (entry.dead || paused.value || !entry.ready) return
    const state = entry.player.getPlayerState()
    if (state === PLAYER_STATE.PLAYING || state === PLAYER_STATE.BUFFERING) return
    // browsers block autoplay with sound: try again muted, otherwise show the play button
    if (!muted.value) {
      muted.value = true
      entry.player.mute()
      entry.player.playVideo()
      watchStart(entry)
      return
    }
    autoBlocked = true
    paused.value = true
  }, 2000)
}

function playCurrent() {
  const entry = currentEntry()
  if (!entry || !entry.ready || paused.value || failed.value || !onScreen) return
  if (muted.value) entry.player.mute()
  else entry.player.unMute()
  entry.player.playVideo()
  watchStart(entry)
}

function togglePause() {
  if (failed.value) return
  paused.value = !paused.value
  autoBlocked = false
  if (paused.value) {
    clearTimeout(startTimer)
    withPlayer((player) => player.pauseVideo())
  } else {
    playCurrent()
  }
}

function toggleSound() {
  muted.value = !muted.value
  withPlayer((player) => (muted.value ? player.mute() : player.unMute()))
  if (!muted.value && paused.value) {
    paused.value = false
    playCurrent()
  }
}

// ---- Player events (ignore any from the video that's sliding out) ----
function onPlayerState(el, entry, state) {
  if (entry.dead || !isActive(el)) return
  if (state === PLAYER_STATE.PLAYING) {
    clearTimeout(startTimer)
    if (autoBlocked) {
      autoBlocked = false
      paused.value = false
    }
  } else if (state === PLAYER_STATE.ENDED) {
    if (hasMany.value) {
      next()
    } else {
      entry.player.seekTo(0)
      entry.player.playVideo()
    }
  }
}

function onFail() {
  failed.value = true
  // skip a video that can't load
  if (hasMany.value) skipTimer = setTimeout(next, 2500)
}

function tick() {
  const entry = currentEntry()
  if (!entry || !entry.ready || paused.value || failed.value) return
  const time = entry.player.getCurrentTime()
  const duration = entry.player.getDuration()
  const length =
    props.advanceAfter > 0 ? Math.min(props.advanceAfter, duration || Infinity) : duration
  progress.value = length ? Math.min(time / length, 1) : 0
  if (props.advanceAfter > 0 && time >= props.advanceAfter) next()
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

watch(
  () => current.value && current.value.id,
  async () => {
    await nextTick()
    mountCurrent()
  },
)

onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // with reduce motion on, wait for the viewer to press play
  if (reduceMotion.value) paused.value = true

  // pause while the player is scrolled off screen
  observer = new IntersectionObserver(
    (entries) => {
      onScreen = entries[entries.length - 1].intersectionRatio >= 0.2
      if (onScreen) playCurrent()
      else withPlayer((player) => player.pauseVideo())
    },
    { threshold: [0, 0.2] },
  )
  observer.observe(root.value)

  pollTimer = setInterval(tick, 250)
  mountCurrent()
})

onUnmounted(() => {
  observer?.disconnect()
  clearTimeout(skipTimer)
  clearTimeout(startTimer)
  clearInterval(pollTimer)
  for (const el of [...players.keys()]) destroyEntry(el)
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
          <Transition :name="slideName" @before-leave="onBeforeLeave" @after-leave="onAfterLeave">
            <div
              :key="current.id"
              ref="slideEl"
              class="slide"
              role="group"
              :aria-label="`Heartware video ${active + 1}`"
            ></div>
          </Transition>

          <div class="shield" @click="togglePause"></div>

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
  background: transparent;
}

.slide :deep(iframe) {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.shield {
  position: absolute;
  inset: 0;
  z-index: 2;
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
