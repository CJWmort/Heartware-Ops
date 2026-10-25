<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import FireworksBackground from '@/components/landing/FireworksBackground.vue'
import MapNotice from '@/components/map/MapNotice.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const notice = ref(null) // the error popup's content, or null while hidden
let noticeTimer = null

// Shows a problem in the popup card (same MapNotice as the tracking page), then hides it after 5 seconds
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
// The X button
function dismissNotice() {
  clearTimeout(noticeTimer)
  notice.value = null
}
onBeforeUnmount(() => clearTimeout(noticeTimer))
const loading = ref(false)

async function submit() {
  if (!email.value || !password.value) {
    showError('Enter your email and password.')
    return
  }
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(route.query.redirect || '/')
  } catch (err) {
    console.error(err)
    showError(err.response?.data?.message || 'Could not reach the server. Try again.')
  } finally {
    loading.value = false
  }
}

// UI only (no login logic): which side the red panel is on.
// 'login' = form visible, panel on the right.  'join' = panel sweeps left, sign-up info + video show.
const mode = ref('login')

// UI only: show / hide the password (eye button in the password box)
const showPassword = ref(false)

// UI only: muted background video on the sign-up side.
// The file lives in client/public/videos/ (anything in /public is served from the site root).
const VIDEO_SRC = '/videos/Heartware.mp4'
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-card card-hw" :class="{ 'is-join': mode === 'join' }">
      <!-- ===== Base layer (Bootstrap grid): left = login form, right = show-night scene ===== -->
      <div class="row g-0 auth-base">
        <!-- col-md-6 = half the card; must match --split: 50% in the CSS so the red panel and the columns line up -->
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
                <!-- eye button: shows or hides the password -->
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

        <!-- Decorative: muted looping video. It only loads while this side is showing -->
        <!-- col-md-6 (was col-md-5): a wider video column means less of the video is cropped -->
        <div class="col-12 col-md-6 order-first order-md-last auth-scene" aria-hidden="true">
          <FireworksBackground v-if="mode === 'join'" :skyline="false" />
          <Transition name="scene-fade">
            <video
              v-if="mode === 'join'"
              class="scene-video"
              :src="VIDEO_SRC"
              autoplay
              muted
              loop
              playsinline
              disablepictureinpicture
              disableremoteplayback
              tabindex="-1"
            ></video>
          </Transition>
          <div class="scene-shade"></div>
        </div>
      </div>

      <!-- ===== The red panel that sweeps across. Shape only; its words sit in the layer above ===== -->
      <div class="auth-panel" aria-hidden="true">
        <div class="auth-panel-deco"></div>

        <!-- Wavy edges. Desktop uses the side waves (.wave-x), phones use the top/bottom waves (.wave-y).
             Each SVG holds two copies of the wave and slides by half its length, so the loop is seamless. -->
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

      <!-- ===== Words on the panel. They stay in place while the panel slides under them, then cross-fade ===== -->
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

    <!-- error popup: appears at the top, closes itself after 5 seconds or with its X -->
    <div class="notice-host">
      <MapNotice :notice="notice" @close="dismissNotice" />
    </div>
  </div>
</template>

<style scoped>
/* ---------------------------------------------------------------------------------------------
   Login card with a sliding red panel.
   Phones: the panel sits in a banner along the top and slides DOWN over the form.
   Tablet/desktop (>= 768px, Bootstrap "md"): the panel sits on the right and slides LEFT.
   Every move happens in two steps (grow over the other side, then shrink off the old side),
   done with one CSS transition per edge and a delay on the second edge. No JavaScript timers.
   --------------------------------------------------------------------------------------------- */
.auth-wrap {
  min-height: calc(100dvh - 7.5rem); /* fills the space under the navbar so the card sits centred */
  display: flex;
  align-items: center;
}

.auth-card {
  --split: 50%; /* where the form column ends (= Bootstrap col-md-6, half the card) */
  --scene-h: 400px; /* phones: height of the top banner / video strip */
  --wave: 34px; /* how far the wavy edge sticks out of the panel */
  --panel: var(--hw-red); /* panel colour; the waves use the same value so the edge is seamless */
  --panel-soft: rgb(255 45 65 / 0.5); /* lighter second wave behind the main one */
  --ease: cubic-bezier(0.76, 0, 0.24, 1); /* slow start, fast middle, soft landing */
  position: relative;
  isolation: isolate;
  overflow: hidden; /* clips the waves at the card edges */
  width: 100%;
  max-width: 980px;
  margin-inline: auto;
  border-radius: 1.25rem;
  box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.75);
}

/* ---- Base layer ---- */
.auth-base {
  position: relative;
  z-index: 0; /* own stacking layer, so the input icons and labels stay underneath the panel */
}
.auth-form-pane {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 460px; /* tall enough for the sign-up info when the panel covers this side */
  padding: calc(2rem + var(--wave)) 1.5rem 2.5rem;
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

/* Pill inputs with an icon and a Bootstrap floating label */
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
  background-color: transparent !important; /* Bootstrap paints a box behind the floated label; not wanted on a tinted pill */
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
/* Eye button inside the password pill */
.auth-field-pw > .form-control {
  padding-right: 3.25rem; /* room for the eye so long passwords don't run under it */
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
/* Chrome's autofill paints its own pale box; keep the pill dark */
.auth-field > .form-control:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 100px var(--hw-surface) inset;
  -webkit-text-fill-color: var(--hw-text);
  caret-color: var(--hw-text);
}

.auth-submit {
  /* keep the button red (just dimmed) while it shows the spinner; Bootstrap would make it see-through */
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

/* The right-hand (desktop) / top (phone) scene. The night sky shows until the video's first frame */
.auth-scene {
  position: relative;
  height: var(--scene-h);
  overflow: hidden;
  background:
    radial-gradient(1.5px 1.5px at 14% 22%, rgb(255 255 255 / 0.9) 50%, transparent 52%),
    radial-gradient(1px 1px at 32% 12%, rgb(255 255 255 / 0.7) 50%, transparent 52%),
    radial-gradient(1.5px 1.5px at 58% 30%, rgb(255 255 255 / 0.8) 50%, transparent 52%),
    radial-gradient(1px 1px at 76% 16%, rgb(255 255 255 / 0.7) 50%, transparent 52%),
    radial-gradient(1px 1px at 88% 40%, rgb(255 255 255 / 0.6) 50%, transparent 52%),
    radial-gradient(1.5px 1.5px at 44% 48%, rgb(255 255 255 / 0.5) 50%, transparent 52%),
    linear-gradient(180deg, #050913 0%, var(--hw-landing-bg) 55%, #160c1d 100%);
}

/* Video fills the box and is cropped to fit (like background-size: cover). No controls, clicks pass through */
.scene-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* contain = the WHOLE video frame is shown, never cropped, so the burned-in subtitles can't be cut off.
     The column is taller than a 16:9 video, so there are empty bands above and below it */
  object-fit: contain;
  pointer-events: none;
}
/* soft dark edge so the red wave stands out against bright footage */
.scene-shade {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 90px rgb(7 12 24 / 0.55);
  pointer-events: none;
}
/* fade in as the panel moves away; stay visible while the panel covers it again */
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

/* ---- The sliding panel ---- */
.auth-panel {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  top: 0;
  bottom: calc(100% - var(--scene-h));
  background: var(--panel);
  /* going back to the form: top edge grows up over the sky first, then the bottom edge slides off the form */
  transition:
    top 0.5s var(--ease),
    bottom 0.7s var(--ease) 0.36s;
  /* on page load the panel starts over the whole card and pulls back like a curtain */
  animation: curtain 0.95s var(--ease) 0.15s backwards;
}
.is-join .auth-panel {
  top: var(--scene-h);
  bottom: 0;
  /* going to sign-up info: bottom edge grows down over the form first, then the top edge pulls back to reveal the sky */
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

/* faint rings for texture, like the shapes on the reference panel */
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

/* ---- Wavy edges ---- */
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

/* phones: waves on the top and bottom edges, flowing sideways */
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
  transform: scaleY(-1); /* point up */
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

/* ---- Words on the panel ---- */
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
  /* leaving: fade out quickly while the panel starts moving */
  transition:
    opacity 0.22s ease,
    transform 0.3s ease,
    visibility 0s linear 0.3s;
}
.ov-block.is-active {
  opacity: 1;
  visibility: visible;
  transform: none;
  /* arriving: wait until the panel has covered this side, then fade in */
  transition:
    opacity 0.45s ease 0.6s,
    transform 0.6s var(--ease) 0.52s,
    visibility 0s linear 0.52s;
}
.ov-hello {
  left: 0;
  right: 0;
  top: 0;
  height: var(--scene-h);
  padding-block: 1rem;
}
.ov-join {
  left: 0;
  right: 0;
  top: var(--scene-h);
  bottom: 0;
  padding-top: 1.75rem;
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

/* =========================== Tablet / desktop: side by side =========================== */
@media (min-width: 768px) {
  .auth-card {
    --wave: 44px;
  }
  .auth-base {
    /* was 560px. A shorter card makes the video column less tall and narrow, so less of the video is cropped.
     Check that the "Show day, sorted" text still fits; raise this number if it looks cramped */
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
    /* going back to the form: right edge grows over the scene first, then the left edge slides off the form */
    transition:
      right 0.5s var(--ease),
      left 0.7s var(--ease) 0.36s;
  }
  .is-join .auth-panel {
    top: 0;
    bottom: 0;
    left: 0;
    right: calc(100% - var(--split));
    /* going to sign-up info: left edge grows over the form first, then the right edge pulls back */
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
    transform: scaleX(-1); /* point left */
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

/* Respect "reduce motion": no sweeping or flowing, just a quick fade between the two states */
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
  .scene-video {
    display: none; /* no moving background for reduce-motion users; the night sky shows instead */
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

/* Error popup (MapNotice, same card as the tracking page). Pinned under the navbar and centred on every screen size,
   overriding MapNotice's map-page positioning (desktop shift to the right). */
.notice-host {
  --notice-top: 72px;
  position: fixed;
  inset: 0;
  z-index: 1150;
  pointer-events: none; /* only the card itself is clickable */
}
.notice-host :deep(.notice-wrap) {
  left: 12px;
  right: 12px;
  justify-content: center;
}
</style>