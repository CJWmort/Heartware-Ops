<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '@/services/auth'
import { NAV_LINKS } from '@/router/nav-links'
import FireworksBackground from '@/components/landing/FireworksBackground.vue' // NEW: animated fireworks behind the landing page
import FeatureSpotlight from '@/components/landing/FeatureSpotlight.vue' // NEW: auto-rotating feature panel

const auth = useAuthStore()

// '??' logical operator that returns its right-hand side operand
// when its left-hand side operand is null or undefined
const links = computed(() => NAV_LINKS[auth.role] ?? [])

// NEW: list of video cards. To add one, copy a line and change the title/file.
// Files live in client/public/videos/, so the URL starts with /videos/
const videos = [
  { id: 'v1', title: 'Heartware Video 1', src: '/videos/Heartware3.mp4' },
  { id: 'v2', title: 'Heartware Video 2', src: '/videos/Heartware2.mp4' },
]

// NEW: stores WHICH card is flipped (null = none), so flipping a card flips the previous one back
const flippedId = ref(null)
const toggle = (id) => {
  flippedId.value = flippedId.value === id ? null : id // click again = flip back
}

// (The old `features` array moved into FeatureSpotlights.vue, which is the only place that uses it now)
</script>

<template>
  <!-- Logged in: quick links for your role (UNCHANGED) -->
  <section v-if="auth.isLoggedIn" data-testid="dashboard">
    <h1 class="h3 mb-1">Hi, {{ auth.user.name }}</h1>
    <p class="text-muted-hw mb-4">What would you like to do?</p>
    <div class="row g-3">
      <div v-for="link in links" :key="link.to" class="col-12 col-sm-6 col-lg-4">
        <RouterLink :to="link.to" class="card card-hw h-100 text-decoration-none text-reset">
          <div class="card-body d-flex align-items-center gap-3">
            <i :class="['bi', link.icon, 'fs-3 text-danger']" aria-hidden="true"></i>
            <span class="fw-semibold">{{ link.label }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- Guest: landing page (REDESIGNED). data-testid values are kept so the e2e tests still pass -->
  <section v-else class="landing" data-testid="landing">
    <FireworksBackground />

    <!-- z-index 1 keeps all the content above the fireworks -->
    <div class="container landing-content">
      <div class="row align-items-center g-5">
        <!-- Left: headline, call-to-action buttons and the flip-card demo -->
        <div class="col-lg-6 text-center text-lg-start">
          <h1 class="hero-title">
            NE Show<br />
            <span class="accent">Success and Safety Always</span>
          </h1>
          <p class="hero-sub">NDP Exco - MOE - Heartware National Education Show Management</p>

          <div
            class="d-flex flex-wrap gap-3 align-items-center justify-content-center justify-content-lg-start"
          >
            <RouterLink to="/register" class="btn btn-brand btn-lg px-4" data-testid="cta-register">
              Sign up to volunteer
            </RouterLink>
            <RouterLink to="/login" class="cta-ghost" data-testid="cta-login">Log in →</RouterLink>
          </div>

          <!-- NEW: row of flip cards, one per entry in `videos`. Click the front to flip and watch -->
          <div class="demo-row mt-4">
            <div
              v-for="v in videos"
              :key="v.id"
              class="demo-scene"
              :class="{ flipped: flippedId === v.id }"
            >
              <div class="demo-inner">
                <!-- Front: a real button, so keyboard users can flip it too -->
                <button
                  type="button"
                  class="demo-face demo-front"
                  :aria-label="`Watch ${v.title}`"
                  @click="toggle(v.id)"
                >
                  <small class="face-label">NDP VIDEO</small>
                  <strong>{{ v.title }}</strong>
                  <small class="flip-hint">tap to watch ▶</small>
                </button>

                <!-- Back: the player. A <button> cannot contain a <video>, so front and back are separate -->
                <div class="demo-face demo-back">
                  <!-- v-if: the <video> only exists while flipped, so flipping back stops playback.
                       preload="none": the file is not downloaded until the user presses play -->
                  <video
                    v-if="flippedId === v.id"
                    :src="v.src"
                    controls
                    preload="none"
                    playsinline
                  ></video>
                  <button
                    type="button"
                    class="back-btn"
                    aria-label="Flip back"
                    @click="toggle(v.id)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: rotating feature panel -->
        <div class="col-lg-6">
          <FeatureSpotlight />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Full-width dark "night sky". position: relative lets the fireworks fill it with position: absolute */
.landing {
  position: relative;
  overflow: hidden;
  min-height: calc(100vh - 56px); /* viewport height minus the navbar */
  display: flex;
  align-items: center;
  background: var(--hw-landing-bg);
  color: var(--hw-landing-text);
}
.landing-content {
  position: relative;
  z-index: 1; /* above the fireworks (z-index 0) */
  padding-top: 2.5rem;
  padding-bottom: 6rem; /* leaves room for the skyline at the bottom */
}

.hero-title {
  font-size: clamp(2.2rem, 5.2vw, 3.4rem); /* scales smoothly between phone and desktop */
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 1rem;
}
.accent {
  color: var(--hw-landing-accent);
}
.hero-sub {
  color: var(--hw-landing-muted);
  font-size: 1.1rem;
  max-width: 34rem;
  margin: 0 auto 1.5rem;
}
@media (min-width: 992px) {
  .hero-sub {
    margin-left: 0;
  } /* left-align on desktop */
}

.cta-ghost {
  color: var(--hw-landing-text);
  text-decoration: none;
  font-weight: 500;
}
.cta-ghost:hover {
  color: var(--hw-landing-accent);
}

/* ---- Flip cards (3D rotation with CSS) ---- */
/* NEW: lays the cards side by side, wrapping onto a new line on narrow screens */
.demo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}
@media (min-width: 992px) {
  .demo-row {
    justify-content: flex-start;
  } /* left-align on desktop */
}
.demo-scene {
  width: min(
    100%,
    15.5rem
  ); /* CHANGED: narrower than before (22rem) so two cards fit in the column */
  height: 9rem;
  perspective: 900px; /* gives the rotation depth */
}
.demo-inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d; /* keeps front and back as real 3D faces */
}
.demo-scene.flipped .demo-inner {
  transform: rotateY(180deg);
}
.demo-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 1rem 1.25rem;
  background: #fff;
  color: #1f2430;
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
  backface-visibility: hidden; /* hide whichever side is facing away */
}
.demo-back {
  transform: rotateY(180deg); /* pre-rotated so it reads correctly once the card flips */
  padding: 0; /* NEW: the video fills the whole back face */
  background: #000;
  overflow: hidden;
}
.demo-back video {
  width: 100%;
  height: 100%;
  object-fit: contain; /* shows the whole video without cropping */
}
/* NEW: the front is a <button>, so reset the browser's default button look */
.demo-front {
  border: 0;
  font: inherit;
  cursor: pointer;
}
/* NEW: small round button in the corner to flip the card back */
.back-btn {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.6);
  color: #fff;
  line-height: 1;
}
.face-label {
  letter-spacing: 0.08em;
  color: var(--hw-red);
  font-size: 0.7rem;
}
.flip-hint {
  color: var(--hw-muted);
  font-size: 0.72rem;
}

/* Users who prefer reduced motion get an instant swap instead of a spinning card */
@media (prefers-reduced-motion: reduce) {
  .demo-inner {
    transition: none;
  }
}
</style>
