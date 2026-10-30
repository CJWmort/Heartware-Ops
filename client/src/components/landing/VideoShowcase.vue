<!-- The showcase video player on the home page. The videos are hosted on YouTube and shown through
     the YouTube iframe player. -->

<script setup>
// Controls one YouTube player per slide: loading, play and pause, sound, the progress bar, moving to
// the next video, retrying when autoplay is blocked and tilting the frame with the pointer.

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
  advanceAfter: { type: Number, default: 0 },
})

const root = ref(null)
const slideEl = ref(null)
const active = ref(0)
const direction = ref('next')
const muted = ref(true)
const paused = ref(false)
const progress = ref(0)
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

// current / hasMany / slideName / frameStyle (computed) - the current video, whether there is more
// than one, the transition name (slide-next, slide-prev or a plain fade for reduced motion), and the
// 3D tilt transform for the frame.
const current = computed(() => props.videos[active.value])
// hasMany (computed) - true when there is more than one video, so arrows and dots are shown.
const hasMany = computed(() => props.videos.length > 1)

// slide left/right depending on direction (a simple fade if reduce motion is on)
const slideName = computed(() => (reduceMotion.value ? 'fade' : 'slide-' + direction.value))

// frameStyle (computed) - the 3D tilt of the video frame, from the pointer position.
const frameStyle = computed(() => ({
  transform: `perspective(1100px) rotateX(${tilt.value.x}deg) rotateY(${tilt.value.y}deg)`,
}))

// go(index, dir) - 1) do nothing if there is only one video 2) cancel the skip timer 3) remember the
// slide direction 4) set active with wrap-around 5) reset the progress bar and the failed flag.
function go(index, dir) {
  if (!hasMany.value) return
  const n = props.videos.length
  clearTimeout(skipTimer)
  direction.value = dir
  active.value = (index + n) % n
  progress.value = 0
  failed.value = false
}

// next() / prev() - go forward or back one video.
function next() {
  go(active.value + 1, 'next')
}

// prev() - go to the previous video.
function prev() {
  go(active.value - 1, 'prev')
}

// currentEntry() - the player record (player, ready, dead) of the slide on screen, or undefined.
function currentEntry() {
  return slideEl.value ? players.get(slideEl.value) : undefined
}

// withPlayer(action) - run an action on the current YouTube player, but only if it is ready.
function withPlayer(action) {
  const entry = currentEntry()
  if (entry && entry.ready) action(entry.player)
}

// isActive(el) - true if this slide element is the one currently shown.
function isActive(el) {
  return el === slideEl.value
}

// createPlayer(el, id, label) - create a YouTube player inside a slide. 1) add a holder div and
// register a record, 2) load the YouTube script, 3) unless the slide was removed, create a
// controls-free player for the video id, 4) onReady and onError callbacks below.
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
          // onReady - the player is ready: mark it ready, hide the iframe from keyboard focus, give it
          // a title, and start playing if this slide is the one on screen.
          onReady: () => {
            if (entry.dead) return
            entry.ready = true
            const frame = entry.player.getIframe()
            frame.setAttribute('title', label)
            frame.setAttribute('tabindex', '-1')
            if (isActive(el)) playCurrent()
          },
          onStateChange: (event) => onPlayerState(el, entry, event.data),
          // onError - the video could not play; if this is the slide on screen, show the failure
          // message.
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

// mountCurrent() - create a player for the slide on screen if it does not have one yet.
function mountCurrent() {
  const el = slideEl.value
  if (!el || players.has(el) || !current.value) return
  createPlayer(el, current.value.id, `Heartware video ${active.value + 1}`)
}

// destroyEntry(el) - mark a slide's player dead, destroy it and forget it.
function destroyEntry(el) {
  const entry = players.get(el)
  if (!entry) return
  entry.dead = true
  if (entry.player && typeof entry.player.destroy === 'function') entry.player.destroy()
  players.delete(el)
}

// onBeforeLeave(el) - a slide is leaving: pause its video.
function onBeforeLeave(el) {
  const entry = players.get(el)
  if (entry && entry.ready) entry.player.pauseVideo()
}

// onAfterLeave(el) - a slide has left: destroy its player.
function onAfterLeave(el) {
  destroyEntry(el)
}

// watchStart(entry) - after asking a video to play, check 2 seconds later: if it is not playing, first
// retry muted; if that also fails the browser is blocking autoplay, so show it as paused with a Play
// button.
function watchStart(entry) {
  clearTimeout(startTimer)
  startTimer = setTimeout(() => {
    if (entry.dead || paused.value || !entry.ready) return
    const state = entry.player.getPlayerState()
    if (state === PLAYER_STATE.PLAYING || state === PLAYER_STATE.BUFFERING) return
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

// playCurrent() - play the current video unless it is paused, failed, still loading or scrolled off
// screen; applies the mute setting, then watches that it really started.
function playCurrent() {
  const entry = currentEntry()
  if (!entry || !entry.ready || paused.value || failed.value || !onScreen) return
  if (muted.value) entry.player.mute()
  else entry.player.unMute()
  entry.player.playVideo()
  watchStart(entry)
}

// togglePause() - the pause / play button: flips paused, pauses or plays the video; ignored if the
// video failed.
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

// toggleSound() - flips muted; turning sound on while paused also resumes playing.
function toggleSound() {
  muted.value = !muted.value
  withPlayer((player) => (muted.value ? player.mute() : player.unMute()))
  if (!muted.value && paused.value) {
    paused.value = false
    playCurrent()
  }
}

// onPlayerState(el, entry, state) - reacts to the player: when it starts playing clear the start
// check; when it ends go to the next video, or replay if there is only one.
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

// onFail() - mark the video as failed and, if there are more videos, skip to the next after 2.5
// seconds.
function onFail() {
  failed.value = true
  if (hasMany.value) skipTimer = setTimeout(next, 2500)
}

// tick() - runs every 250 ms: update the progress bar from the video's time and move on after
// advanceAfter seconds if that option is set.
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

// onTilt(event) - mouse hover tilts the frame in 3D by up to 5 and 6 degrees depending on where the
// pointer is (not for touch, not for reduced motion).
function onTilt(event) {
  if (reduceMotion.value || event.pointerType === 'touch') return
  const box = event.currentTarget.getBoundingClientRect()
  const px = (event.clientX - box.left) / box.width - 0.5
  const py = (event.clientY - box.top) / box.height - 0.5
  tilt.value = { x: -py * 5, y: px * 6 }
}

// resetTilt() - flatten the frame when the pointer leaves.
function resetTilt() {
  tilt.value = { x: 0, y: 0 }
}

// watch(current id) - when the slide changes, wait for the DOM and create the new slide's player.
watch(
  () => current.value && current.value.id,
  async () => {
    await nextTick()
    mountCurrent()
  },
)

// onMounted - read the reduced-motion setting (start paused if on), watch with an IntersectionObserver
// so it plays only when 20 percent is visible, start the 250 ms progress timer and create the first
// player.
onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion.value) paused.value = true

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

// onUnmounted - stop the observer and all timers and destroy every player.
onUnmounted(() => {
  observer?.disconnect()
  clearTimeout(skipTimer)
  clearTimeout(startTimer)
  clearInterval(pollTimer)
  for (const el of [...players.keys()]) destroyEntry(el)
})
</script>

<template>
  <!-- The video frame, the custom controls (pause, sound, arrows, dots) and the progress bar. -->
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

          <template v-if="hasMany">
            <button type="button" class="nav nav-prev" aria-label="Previous video" @click="prev">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" class="nav nav-next" aria-label="Next video" @click="next">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </template>

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
/* Styles for the 3D frame, the controls and the progress bar. */

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

.stage {
  overflow: hidden;
}

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

  .showcase.is-fill .screen::before {
    display: none;
  }
}

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

.frame:hover .nav,
.nav:focus-visible {
  opacity: 1;
  transform: none;
}

.nav:hover {
  background: #ef3340;
  border-color: #ef3340;
}

@media (hover: none) {
  .nav {
    opacity: 0.9;
    transform: none;
  }
}

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
