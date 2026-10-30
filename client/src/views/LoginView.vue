<!-- The login and sign-up entrance page with the video background on the sign-up side and a short
     clip on phones. -->

<script setup>
// Handles the login form, error notices, the switch between login and sign-up sides, and the YouTube
// background video (build, mute toggle, loop, destroy).

import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import { landingFor } from '@/router/landing'
import FireworksBackground from '@/components/landing/FireworksBackground.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import { loadYouTubeApi, PLAYER_STATE, HEARTWARE_VIDEO_ID, HEARTWARE_SHORT_ID } from '@/utils/youtube'
import axios from 'axios'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const notice = ref(null)
let noticeTimer = null

// showError(text) - fills the notice with an error card titled "Unable to log in", cancels any older
// timer and sets a new 5 second timer that hides the popup again.
function showError(text) {
  notice.value = {
    type: 'error',
    icon: 'bi-exclamation-triangle-fill',
    title: 'Unable to log in',
    text,
  }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = null), 5000)
}
// dismissNotice() - the popup's X button: cancel the timer and hide the popup. onBeforeUnmount below
// also clears the timer so it cannot fire after leaving the page.
function dismissNotice() {
  clearTimeout(noticeTimer)
  notice.value = null
}
// onBeforeUnmount - cancel the notice timer when leaving the page.
onBeforeUnmount(() => clearTimeout(noticeTimer))
const loading = ref(false)

// submit() - 1) if the email or password is empty show "Enter your email and password." and stop 2)
// show the spinner on the button 3) ask the auth store to log in (server call) 4) on success go to the
// page in ?redirect= if there is one, otherwise to the role's own page (volunteer: Assignment, admin:
// Allocation) via landingFor 5) on failure log it and show the server's message or "Could not reach
// the server. Try again." 6) always stop the spinner.
async function submit() {
  if (!email.value || !password.value) {
    showError('Enter your email and password.')
    return
  }
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(route.query.redirect || landingFor(auth.role))
  } catch (err) {
    console.error(err)
    showError(err.response?.data?.message || 'Could not reach the server. Try again.')
  } finally {
    loading.value = false
  }
}

// Wake-up ping (runs once when the page opens): Render's free server sleeps when idle and needs up to
// a minute to start. Calling the cheap /api/health route now starts the wake-up while the person
// types. Any failure is ignored on purpose.
onMounted(async () => {
  try {
    await axios.get('/api/health')
  } catch (err) {
  }
})

const mode = ref('login')

const showPassword = ref(false)

const phoneQuery = window.matchMedia('(max-width: 767.98px)')
const isPhone = ref(phoneQuery.matches)
// onBreakpointChange(e) - the screen crossed the phone breakpoint: update isPhone so the phone video
// (short clip) or the wide video is used.
const onBreakpointChange = (e) => (isPhone.value = e.matches)
// onMounted - start listening for the phone-size media query changing.
onMounted(() => phoneQuery.addEventListener('change', onBreakpointChange))
// onBeforeUnmount - stop listening for the media query.
onBeforeUnmount(() => phoneQuery.removeEventListener('change', onBreakpointChange))

const sceneEl = ref(null)
const muted = ref(true)
const soundReady = ref(false)
let scene = null

// sceneVideoId() - the YouTube id to play behind the sign-up side: the short clip on phones, the full
// video otherwise.
const sceneVideoId = () => (isPhone.value ? HEARTWARE_SHORT_ID : HEARTWARE_VIDEO_ID)

// destroyScene(el) - remove the background YouTube player. Ignored if it belongs to a different
// element; marks the scene dead so late callbacks do nothing, destroys the player and resets the sound
// flags.
function destroyScene(el) {
  if (!scene || (el && scene.el !== el)) return
  scene.dead = true
  if (scene.player && typeof scene.player.destroy === 'function') scene.player.destroy()
  scene = null
  soundReady.value = false
  muted.value = true
}

// buildScene() - create the muted looping YouTube background video. 1) wait for the DOM, 2) only while
// the sign-up side is showing and its element exists, 3) skip if a scene already exists for this
// element, otherwise remove the old one, 4) add a holder div and load the YouTube script, 5) create
// the player with autoplay, muted, no controls, 6) callbacks below start it and loop it.
async function buildScene() {
  await nextTick()
  const el = sceneEl.value
  if (mode.value !== 'join' || !el) return
  if (scene && scene.el === el) return
  destroyScene()
  const holder = document.createElement('div')
  el.appendChild(holder)
  const current = { el, player: null, ready: false, dead: false }
  scene = current
  try {
    const YT = await loadYouTubeApi()
    if (current.dead) return
    current.player = new YT.Player(holder, {
      videoId: sceneVideoId(),
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        playsinline: 1,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        origin: window.location.origin,
      },
      events: {
        // onReady - the player is ready: mute it, start playing, hide the iframe from keyboard focus,
        // give it a title, and allow the sound button.
        onReady: (event) => {
          if (current.dead) return
          current.ready = true
          event.target.mute()
          event.target.playVideo()
          const frame = event.target.getIframe()
          frame.setAttribute('title', 'Heartware video')
          frame.setAttribute('tabindex', '-1')
          soundReady.value = true
        },
        // onStateChange - when the video ends, jump back to the start and play again (a loop).
        onStateChange: (event) => {
          if (!current.dead && event.data === PLAYER_STATE.ENDED) {
            event.target.seekTo(0)
            event.target.playVideo()
          }
        },
      },
    })
  } catch {
    soundReady.value = false
  }
}

// toggleSound() - the sound button: ignored until the player is ready; unmutes (and plays) or mutes,
// then flips the muted flag.
function toggleSound() {
  if (!scene || !scene.ready) return
  if (muted.value) {
    scene.player.unMute()
    scene.player.playVideo()
  } else {
    scene.player.mute()
  }
  muted.value = !muted.value
}

// watch(mode) - build or remove the video when switching between the login and sign-up sides.
watch(mode, buildScene)
// watch(isPhone) - when the screen changes between phone and wide, load the matching video into the
// existing player.
watch(isPhone, () => {
  if (scene && scene.ready) scene.player.loadVideoById(sceneVideoId())
})
// onMounted - build the video scene when the page opens.
onMounted(buildScene)
// onBeforeUnmount - destroy the video player when leaving the page.
onBeforeUnmount(() => destroyScene())
</script>

<template>
  <!-- The two-sided layout: the login form, the sign-up call to action and the video panel with
       its sound button. -->
  <div class="auth-wrap">
    <div class="auth-card card-hw" :class="{ 'is-join': mode === 'join' }">
      <div class="row g-0 auth-base">
        <div class="col-12 col-md-6 auth-form-pane" :inert="mode === 'join'">
          <div class="auth-form-inner">
            <h1 class="auth-title">Welcome back</h1>
            <p class="auth-sub">Log in to see your assignment and show-day updates.</p>

            <form novalidate @submit.prevent="submit">
              <div class="form-floating auth-field mb-3">
                <input
                  id="email"
                  v-model.trim="email"
                  type="email"
                  class="form-control"
                  placeholder="name@example.com"
                  autocomplete="email"
                  required
                  data-testid="login-email"
                />
                <label for="email">Email</label>
                <i class="bi bi-envelope auth-field-icon" aria-hidden="true"></i>
              </div>
              <div class="form-floating auth-field auth-field-pw mb-4">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-control"
                  placeholder="Password"
                  autocomplete="current-password"
                  required
                  data-testid="login-password"
                />
                <label for="password">Password</label>
                <i class="bi bi-lock auth-field-icon" aria-hidden="true"></i>
                <button
                  type="button"
                  class="auth-eye"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  <i
                    class="bi"
                    :class="showPassword ? 'bi-eye' : 'bi-eye-slash'"
                    aria-hidden="true"
                  ></i>
                </button>
              </div>
              <button
                type="submit"
                class="btn btn-brand w-100 auth-submit"
                :disabled="loading"
                data-testid="login-submit"
              >
                <span
                  v-if="loading"
                  class="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                ></span>
                Log in
              </button>
            </form>

            <p class="small text-center text-muted-hw mt-4 mb-0">
              New volunteer? <RouterLink to="/register" class="auth-link">Sign up here</RouterLink>
            </p>
          </div>
        </div>

        <div class="col-12 col-md-6 auth-scene">
          <FireworksBackground v-if="mode === 'join' && !isPhone" :skyline="false" />
          <Transition name="scene-fade" @after-leave="destroyScene">
            <div v-if="mode === 'join'" ref="sceneEl" class="scene-video" aria-hidden="true"></div>
          </Transition>
          <div class="scene-shade" aria-hidden="true"></div>
          <button
            v-if="mode === 'join' && soundReady"
            type="button"
            class="scene-sound"
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

      <div class="auth-panel" aria-hidden="true">
        <div class="auth-panel-deco"></div>

        <div class="wave wave-x wave-start">
          <svg class="wave-back" viewBox="0 0 60 800" preserveAspectRatio="none">
            <path
              d="M0,0 L34,0 C34,40.5 58,49.5 58,90 C58,139.5 22,150.5 22,200 C22,245 52,255 52,300 C52,345 34,355 34,400 C34,440.5 58,449.5 58,490 C58,539.5 22,550.5 22,600 C22,645 52,655 52,700 C52,745 34,755 34,800 L0,800 Z"
            />
          </svg>
          <svg class="wave-front" viewBox="0 0 60 800" preserveAspectRatio="none">
            <path
              d="M0,0 L18,0 C18,49.5 50,60.5 50,110 C50,159.5 8,170.5 8,220 C8,260.5 36,269.5 36,310 C36,350.5 18,359.5 18,400 C18,449.5 50,460.5 50,510 C50,559.5 8,570.5 8,620 C8,660.5 36,669.5 36,710 C36,750.5 18,759.5 18,800 L0,800 Z"
            />
          </svg>
        </div>
        <div class="wave wave-x wave-end">
          <svg class="wave-back" viewBox="0 0 60 800" preserveAspectRatio="none">
            <path
              d="M0,0 L34,0 C34,40.5 58,49.5 58,90 C58,139.5 22,150.5 22,200 C22,245 52,255 52,300 C52,345 34,355 34,400 C34,440.5 58,449.5 58,490 C58,539.5 22,550.5 22,600 C22,645 52,655 52,700 C52,745 34,755 34,800 L0,800 Z"
            />
          </svg>
          <svg class="wave-front" viewBox="0 0 60 800" preserveAspectRatio="none">
            <path
              d="M0,0 L18,0 C18,49.5 50,60.5 50,110 C50,159.5 8,170.5 8,220 C8,260.5 36,269.5 36,310 C36,350.5 18,359.5 18,400 C18,449.5 50,460.5 50,510 C50,559.5 8,570.5 8,620 C8,660.5 36,669.5 36,710 C36,750.5 18,759.5 18,800 L0,800 Z"
            />
          </svg>
        </div>
        <div class="wave wave-y wave-start">
          <svg class="wave-back" viewBox="0 0 800 60" preserveAspectRatio="none">
            <path
              d="M0,0 L0,34 C40.5,34 49.5,58 90,58 C139.5,58 150.5,22 200,22 C245,22 255,52 300,52 C345,52 355,34 400,34 C440.5,34 449.5,58 490,58 C539.5,58 550.5,22 600,22 C645,22 655,52 700,52 C745,52 755,34 800,34 L800,0 Z"
            />
          </svg>
          <svg class="wave-front" viewBox="0 0 800 60" preserveAspectRatio="none">
            <path
              d="M0,0 L0,18 C49.5,18 60.5,50 110,50 C159.5,50 170.5,8 220,8 C260.5,8 269.5,36 310,36 C350.5,36 359.5,18 400,18 C449.5,18 460.5,50 510,50 C559.5,50 570.5,8 620,8 C660.5,8 669.5,36 710,36 C750.5,36 759.5,18 800,18 L800,0 Z"
            />
          </svg>
        </div>
        <div class="wave wave-y wave-end">
          <svg class="wave-back" viewBox="0 0 800 60" preserveAspectRatio="none">
            <path
              d="M0,0 L0,34 C40.5,34 49.5,58 90,58 C139.5,58 150.5,22 200,22 C245,22 255,52 300,52 C345,52 355,34 400,34 C440.5,34 449.5,58 490,58 C539.5,58 550.5,22 600,22 C645,22 655,52 700,52 C745,52 755,34 800,34 L800,0 Z"
            />
          </svg>
          <svg class="wave-front" viewBox="0 0 800 60" preserveAspectRatio="none">
            <path
              d="M0,0 L0,18 C49.5,18 60.5,50 110,50 C159.5,50 170.5,8 220,8 C260.5,8 269.5,36 310,36 C350.5,36 359.5,18 400,18 C449.5,18 460.5,50 510,50 C559.5,50 570.5,8 620,8 C660.5,8 669.5,36 710,36 C750.5,36 759.5,18 800,18 L800,0 Z"
            />
          </svg>
        </div>
      </div>

      <section
        class="ov-block ov-hello"
        :class="{ 'is-active': mode === 'login' }"
        :inert="mode !== 'login'"
      >
        <h2 class="ov-title">New to the crew?</h2>
        <p class="ov-text">Find out what volunteers do on show day, then create your account.</p>
        <button
          type="button"
          class="btn btn-outline-light rounded-pill px-4 ov-btn"
          @click="mode = 'join'"
        >
          See how it works
        </button>
      </section>

      <section
        class="ov-block ov-join"
        :class="{ 'is-active': mode === 'join' }"
        :inert="mode !== 'join'"
      >
        <h2 class="ov-title">Show day, sorted</h2>
        <p class="ov-text">One account gets you:</p>
        <ul class="list-unstyled text-start ov-list">
          <li>
            <i class="bi bi-geo-alt-fill" aria-hidden="true"></i>A school near home, matched for you
          </li>
          <li>
            <i class="bi bi-signpost-split-fill" aria-hidden="true"></i>Live directions on show day
          </li>
          <li>
            <i class="bi bi-award-fill" aria-hidden="true"></i>Badges you earn as you help out
          </li>
        </ul>
        <RouterLink to="/register" class="btn btn-light rounded-pill px-4 ov-btn ov-cta"
          >Create my account</RouterLink
        >
        <button type="button" class="btn btn-link link-light ov-back" @click="mode = 'login'">
          <i class="bi bi-arrow-left me-1" aria-hidden="true"></i>Back to log in
        </button>
      </section>
    </div>

    <div class="notice-host">
      <MapNotice :notice="notice" @close="dismissNotice" />
    </div>
  </div>
</template>

<style scoped>
/* Styles for the split layout, the form, the notice and the video panel. */

.auth-wrap {
  min-height: calc(100dvh - 7.5rem);
  display: flex;
  align-items: center;
}

.auth-card {
  --split: 50%;
  --hello-h: 190px;
  --join-h: 380px;
  --wave: 34px;
  --panel: var(--hw-red);
  --panel-soft: rgb(255 45 65 / 0.5);
  --ease: cubic-bezier(0.76, 0, 0.24, 1);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  width: 100%;
  max-width: var(--hw-content-w);
  margin-inline: auto;
  border-radius: 1.25rem;
  box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.75);
}

.auth-base {
  position: relative;
  z-index: 0;
}
.auth-form-pane {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 460px;
  padding: calc(var(--hello-h) + var(--wave) + 2rem) 1.5rem 2.5rem;
}
.auth-form-inner {
  width: 100%;
  max-width: 360px;
}
.auth-title {
  font-size: clamp(1.9rem, 4vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.1;
  text-align: center;
  color: var(--hw-heading);
  margin-bottom: 0.5rem;
}
.auth-sub {
  text-align: center;
  color: var(--hw-muted);
  margin: 0 auto 1.75rem;
  max-width: 30ch;
}

.auth-field > .form-control {
  height: 3.5rem;
  min-height: 3.5rem;
  padding-left: 3.1rem;
  border-radius: 50rem;
  background-color: rgb(140 155 190 / 0.1);
  border-color: rgb(140 155 190 / 0.22);
  color: var(--hw-text);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}
.auth-field > .form-control:focus {
  background-color: rgb(140 155 190 / 0.14);
  border-color: var(--hw-red);
  box-shadow: 0 0 0 0.25rem rgb(214 0 28 / 0.22);
}
.auth-field > label {
  padding-left: 3.1rem;
  color: var(--hw-muted);
}
.auth-field > label::after {
  background-color: transparent !important;
}
.auth-field-icon {
  position: absolute;
  top: 50%;
  left: 1.25rem;
  transform: translateY(-50%);
  z-index: 3;
  font-size: 1.05rem;
  color: var(--hw-muted);
  pointer-events: none;
  transition: color 0.2s ease;
}
.auth-field-pw > .form-control {
  padding-right: 3.25rem;
}
.auth-eye {
  position: absolute;
  top: 50%;
  right: 0.6rem;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  transform: translateY(-50%);
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--hw-muted);
  font-size: 1.1rem;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}
.auth-eye:hover,
.auth-eye:focus-visible {
  color: var(--hw-text);
  background-color: rgb(140 155 190 / 0.16);
}
.auth-eye:focus-visible {
  outline: 2px solid var(--hw-landing-accent);
  outline-offset: 1px;
}
.auth-field:focus-within .auth-field-icon {
  color: var(--hw-landing-accent);
}
.auth-field > .form-control:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 100px var(--hw-surface) inset;
  -webkit-text-fill-color: var(--hw-text);
  caret-color: var(--hw-text);
}

.auth-submit {
  --bs-btn-disabled-bg: var(--hw-red);
  --bs-btn-disabled-border-color: var(--hw-red);
  --bs-btn-disabled-color: #fff;
  border-radius: 50rem;
  padding: 0.85rem 1rem;
  font-weight: 600;
  box-shadow: 0 12px 26px -12px rgb(214 0 28 / 0.8);
}
.auth-submit:disabled {
  box-shadow: none;
}
.auth-form-inner .alert {
  border-radius: 1rem;
  text-align: center;
}
.auth-link {
  color: var(--hw-landing-accent);
  font-weight: 600;
  text-decoration: none;
}
.auth-link:hover,
.auth-link:focus-visible {
  text-decoration: underline;
}

.auth-scene {
  position: relative;
  overflow: hidden;
  container-type: size;
  background:
    radial-gradient(1.5px 1.5px at 14% 22%, rgb(255 255 255 / 0.9) 50%, transparent 52%),
    radial-gradient(1px 1px at 32% 12%, rgb(255 255 255 / 0.7) 50%, transparent 52%),
    radial-gradient(1.5px 1.5px at 58% 30%, rgb(255 255 255 / 0.8) 50%, transparent 52%),
    radial-gradient(1px 1px at 76% 16%, rgb(255 255 255 / 0.7) 50%, transparent 52%),
    radial-gradient(1px 1px at 88% 40%, rgb(255 255 255 / 0.6) 50%, transparent 52%),
    radial-gradient(1.5px 1.5px at 44% 48%, rgb(255 255 255 / 0.5) 50%, transparent 52%),
    linear-gradient(180deg, #050913 0%, var(--hw-landing-bg) 55%, #160c1d 100%);
}

.scene-video {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: auto;
  border: 0;
  aspect-ratio: 16 / 9;
  width: min(100cqw, calc(100cqh * 16 / 9));
  pointer-events: none;
}
.scene-video :deep(iframe) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.scene-sound {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgb(244 246 251 / 0.25);
  background: rgb(7 11 26 / 0.55);
  color: #f4f6fb;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    transform 0.2s ease;
}
.scene-sound:hover {
  background: rgb(244 246 251 / 0.16);
}
.scene-sound:active {
  transform: scale(0.92);
}
.scene-sound.is-on {
  background: #ef3340;
  border-color: #ef3340;
}
.scene-sound:focus-visible {
  outline: 2px solid #ffc857;
  outline-offset: 2px;
}
.scene-sound svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.scene-shade {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 90px rgb(7 12 24 / 0.55);
  pointer-events: none;
}
.scene-fade-enter-from {
  opacity: 0;
}
.scene-fade-enter-active {
  transition: opacity 0.5s ease 0.35s;
}
.scene-fade-leave-active {
  transition: opacity 0.01s linear 0.6s;
}
.scene-fade-leave-to {
  opacity: 0;
}

.auth-panel {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  top: 0;
  bottom: calc(100% - var(--hello-h));
  background: var(--panel);
  transition:
    top 0.5s var(--ease),
    bottom 0.7s var(--ease) 0.36s;
  animation: curtain 0.95s var(--ease) 0.15s backwards;
}
.is-join .auth-panel {
  top: calc(100% - var(--join-h));
  bottom: 0;
  transition:
    bottom 0.5s var(--ease),
    top 0.7s var(--ease) 0.36s;
}
@keyframes curtain {
  from {
    bottom: 0;
    left: 0;
  }
}

.auth-panel-deco {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.auth-panel-deco::before {
  content: '';
  position: absolute;
  width: 300px;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 0 0 36px rgb(255 255 255 / 0.03);
  top: 50%;
  left: 0;
  transform: translate(-62%, -50%);
}

.wave {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
.wave svg {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}
.wave .wave-front {
  fill: var(--panel);
}
.wave .wave-back {
  fill: var(--panel-soft);
}

.wave-x {
  display: none;
}
.wave-y {
  left: 0;
  right: 0;
  height: var(--wave);
}
.wave-y.wave-start {
  bottom: 100%;
  transform: scaleY(-1);
}
.wave-y.wave-end {
  top: 100%;
}
.wave-y svg {
  width: 200%;
  height: 100%;
  animation: flow-x 9s linear infinite;
}
.wave-y .wave-back {
  animation-duration: 14s;
  animation-direction: reverse;
}
@keyframes flow-x {
  to {
    transform: translateX(-50%);
  }
}
@keyframes flow-y {
  to {
    transform: translateY(-50%);
  }
}

.ov-block {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #fff;
  padding: 1.5rem;
  opacity: 0;
  visibility: hidden;
  transform: translateY(14px);
  transition:
    opacity 0.22s ease,
    transform 0.3s ease,
    visibility 0s linear 0.3s;
}
.ov-block.is-active {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition:
    opacity 0.45s ease 0.6s,
    transform 0.6s var(--ease) 0.52s,
    visibility 0s linear 0.52s;
}
.ov-hello {
  left: 0;
  right: 0;
  top: 0;
  height: var(--hello-h);
  padding-block: 1rem;
}
.ov-join {
  left: 0;
  right: 0;
  top: calc(100% - var(--join-h));
  bottom: 0;
  padding: 1.25rem 1.5rem 1rem;
}
.ov-title {
  font-size: clamp(1.6rem, 3.4vw, 2.2rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.1;
  margin-bottom: 0.6rem;
}
.ov-text {
  color: rgb(255 255 255 / 0.86);
  max-width: 32ch;
  margin-bottom: 0.9rem;
}
.ov-list {
  display: grid;
  gap: 0.7rem;
  margin: 0 0 1.6rem;
  max-width: 330px;
}
.ov-list li {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  line-height: 1.35;
}
.ov-list i {
  flex: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin-top: -0.25rem;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.16);
  font-size: 0.95rem;
}
.ov-btn {
  font-weight: 600;
  padding-block: 0.6rem;
  border-width: 2px;
}
.ov-cta {
  color: var(--hw-red-dark);
  min-width: 220px;
}
.ov-cta:hover,
.ov-cta:focus-visible {
  color: var(--hw-red-dark);
  background: #ffe9ec;
}
.ov-back {
  margin-top: 0.5rem;
  font-weight: 600;
  text-decoration: none;
}
.ov-back:hover,
.ov-back:focus-visible {
  text-decoration: underline;
}

@media (max-width: 767.98px) {
  .auth-base {
    min-height: 0;
    transition: min-height 0.7s var(--ease) 0.36s;
  }
  .is-join .auth-base {
    min-height: calc(100dvh - 7.5rem);
    transition: min-height 0.5s var(--ease);
  }
  .auth-form-pane {
    align-items: flex-start;
  }

  .auth-scene {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: calc(var(--join-h) - 4px);
    z-index: 5;
    visibility: hidden;
    transition: visibility 0s linear 0.5s;
  }
  .is-join .auth-scene {
    visibility: visible;
    transition: visibility 0s linear 0.36s;
  }
  .scene-video {
    aspect-ratio: 9 / 16;
    width: max(100cqw, calc(100cqh * 9 / 16));
  }

  .ov-join .ov-text {
    margin-bottom: 0.9rem;
  }
  .ov-join .ov-list {
    gap: 0.6rem;
    margin-bottom: 1.2rem;
    font-size: 0.95rem;
  }

  .ov-hello .ov-title {
    font-size: 1.45rem;
    margin-bottom: 0.35rem;
  }
  .ov-hello .ov-text {
    font-size: 0.92rem;
    max-width: 36ch;
    margin-bottom: 0.8rem;
  }
  .ov-hello .ov-btn {
    font-size: 0.9rem;
    padding-block: 0.4rem;
  }
  .auth-panel-deco::before {
    width: 180px;
    box-shadow: 0 0 0 24px rgb(255 255 255 / 0.03);
    top: 0;
    left: auto;
    right: 0;
    transform: translate(45%, -45%);
  }
}

@media (min-width: 768px) {
  .auth-card {
    --wave: 44px;
  }
  .auth-base {
    min-height: 460px;
  }
  .auth-form-pane {
    min-height: 0;
    padding: 3rem calc(var(--wave) + 1.5rem) 3rem 2rem;
  }
  .ov-text {
    margin-bottom: 1.25rem;
  }
  .auth-scene {
    height: auto;
  }

  .auth-panel {
    top: 0;
    bottom: 0;
    left: var(--split);
    right: 0;
    transition:
      right 0.5s var(--ease),
      left 0.7s var(--ease) 0.36s;
  }
  .is-join .auth-panel {
    top: 0;
    bottom: 0;
    left: 0;
    right: calc(100% - var(--split));
    transition:
      left 0.5s var(--ease),
      right 0.7s var(--ease) 0.36s;
  }

  .auth-panel-deco::before {
    top: auto;
    bottom: 0;
    left: 50%;
    transform: translate(-50%, 62%);
  }

  .wave-y {
    display: none;
  }
  .wave-x {
    display: block;
    top: 0;
    bottom: 0;
    width: var(--wave);
  }
  .wave-x.wave-start {
    right: 100%;
    transform: scaleX(-1);
  }
  .wave-x.wave-end {
    left: 100%;
  }
  .wave-x svg {
    width: 100%;
    height: 200%;
    animation: flow-y 10s linear infinite;
  }
  .wave-x .wave-back {
    animation-duration: 15s;
    animation-direction: reverse;
  }

  .ov-hello {
    top: 0;
    bottom: 0;
    left: var(--split);
    right: 0;
    height: auto;
    padding: 3rem 2rem;
  }
  .ov-join {
    top: 0;
    bottom: 0;
    left: 0;
    right: calc(100% - var(--split));
    padding: 3rem 2.5rem;
  }
  .ov-hello .ov-text {
    margin-bottom: 1.5rem;
  }
  .ov-block {
    transform: translateX(18px);
  }
  .ov-join:not(.is-active) {
    transform: translateX(-18px);
  }
  .ov-block.is-active {
    transform: none;
  }
}

@media (min-width: 992px) {
  .auth-form-pane {
    padding-left: 3rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-panel,
  .is-join .auth-panel {
    animation: none;
    transition-duration: 0s;
    transition-delay: 0s;
  }
  .wave svg {
    animation: none !important;
  }
  .auth-scene,
  .is-join .auth-scene,
  .auth-base,
  .is-join .auth-base {
    transition: none;
  }
  .scene-video,
  .scene-sound {
    display: none;
  }
  .ov-block,
  .ov-block.is-active,
  .ov-join:not(.is-active) {
    transform: none;
    transition:
      opacity 0.2s ease,
      visibility 0s linear 0.2s;
  }
  .ov-block.is-active {
    transition: opacity 0.2s ease;
  }
}

.notice-host {
  --notice-top: 72px;
  position: fixed;
  inset: 0;
  z-index: 1150;
  pointer-events: none;
}
.notice-host :deep(.notice-wrap) {
  left: 12px;
  right: 12px;
  justify-content: center;
}
</style>
