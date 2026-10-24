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

// NEW: true when the demo card on the landing page is showing its back (the "answer")
const flipped = ref(false)

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
          <p class="hero-sub">NDP Exco - MOE - Heartware National Education Show Management App</p>

          <div
            class="d-flex flex-wrap gap-3 align-items-center justify-content-center justify-content-lg-start"
          >
            <RouterLink to="/register" class="btn btn-brand btn-lg px-4" data-testid="cta-register">
              Sign up to volunteer
            </RouterLink>
            <RouterLink to="/login" class="cta-ghost" data-testid="cta-login">Log in →</RouterLink>
          </div>

          <!-- Flip card: hover (on desktop) or tap (on phones) to reveal the answer -->
          <button
            type="button"
            class="demo-scene mt-4"
            :class="{ flipped }"
            :aria-pressed="flipped"
            aria-label="Demo card: tap to see what happens when a group misses a checkpoint"
            @click="flipped = !flipped"
          >
            <span class="demo-inner">
              <span class="demo-face demo-front">
                <small class="face-label">INCIDENT ALERT</small>
                <strong>Group 3B just missed a checkpoint. What happens?</strong>
                <small class="flip-hint">hover or tap to reveal…</small>
              </span>
              <span class="demo-face demo-back">
                <small class="face-label">WHAT HAPPENS</small>
                <strong
                  >HQ is alerted automatically and can message the volunteer straight away.</strong
                >
              </span>
            </span>
          </button>
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

/* ---- Flip card (3D rotation with CSS) ---- */
.demo-scene {
  display: block;
  width: min(100%, 22rem);
  height: 9rem;
  padding: 0;
  border: 0;
  background: none;
  perspective: 900px; /* gives the rotation depth */
  cursor: pointer;
  margin-left: auto;
  margin-right: auto;
}
@media (min-width: 992px) {
  .demo-scene {
    margin-left: 0;
  }
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
/* On devices with a mouse, hovering also flips the card */
@media (hover: hover) {
  .demo-scene:hover .demo-inner {
    transform: rotateY(180deg);
  }
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
