<!--
  HomeView.vue — Heartware Ops landing page
  Vue 3 (Composition API) + Bootstrap 5.3
  No navbar in this file: the page sits under your app's own navbar.

  On laptops, the headline, video and live drill all fit on the first screen:
  headline and drill on the left, the video filling the right side.
  If your navbar is taller or shorter than 72px, change --hw-nav-h below.

  Needs, in main.js (as in the Week 5 slides):
    import 'bootstrap/dist/css/bootstrap.min.css'
    import 'bootstrap/dist/js/bootstrap.bundle.min.js'
  Fonts (Barlow Condensed + Instrument Sans): see the note at the top of the <style> block.
-->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import FireworksSky from '@/components/FireworksSky.vue'
import VideoShowcase from '@/components/VideoShowcase.vue'
import CheckpointDrill from '@/components/CheckpointDrill.vue'

// ---- Where the "Sign up to volunteer" and "Log in" buttons go ----
// Looks through the routes in src/router/index.js for your log-in and sign-up pages
// (by path or route name), so the buttons work even if your routes are called
// something like /register or /signin. If it picks the wrong page, replace the
// line with the path yourself, e.g.  const signupPath = '/volunteer-signup'
const router = useRouter()

function findRoute(words, fallback) {
  const match = router.getRoutes().find((route) => {
    const text = `${route.path} ${String(route.name ?? '')}`.toLowerCase()
    return !route.path.includes(':') && words.some((word) => text.includes(word))
  })
  return match ? match.path : fallback
}

const loginPath = findRoute(['login', 'log-in', 'signin', 'sign-in'], '/login')
const signupPath = findRoute(['signup', 'sign-up', 'register', 'registration'], '/signup')

const titleWords = ['NE', 'Show']
const mottoWords = ['Success', 'and', 'Safety', 'Always']

// template refs
const sky = ref(null)
const topSection = ref(null)

// click or tap anywhere on the page to launch a firework
// (uses "click", not "pointerdown", so scrolling on a phone doesn't set one off)
function onPageTap(event) {
  if (event.target.closest('video, input, textarea, select')) return
  sky.value?.launchAt(event.clientX, event.clientY)
}

// ---- Headline pulses in time with the fireworks ----
const wordEls = [] // the headline words, filled by function refs in the template
const topInView = ref(true)
const titleRevealed = ref(false)
let reduceMotion = false

// when a firework explodes, each word expands, glows in the firework's colour and
// shrinks back; words closer to the burst react first, like a shockwave
function onBurst({ x, y, color }) {
  if (!topInView.value || reduceMotion) return
  wordEls.forEach((el) => {
    if (!el) return
    const box = el.getBoundingClientRect()
    const distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y)
    el.getAnimations().forEach((a) => a.cancel())
    el.animate(
      [
        { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 transparent)' },
        { transform: 'scale(1.08)', filter: `drop-shadow(0 0 20px ${color})`, offset: 0.28 },
        { transform: 'scale(0.98)', offset: 0.62 },
        { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 transparent)' },
      ],
      {
        duration: 900,
        delay: Math.min(distance * 0.45, 450),
        easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
      },
    )
  })
}

let topObserver = null

onMounted(() => {
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // once the words have risen in, drop their mask so the pulse and glow aren't clipped
  setTimeout(() => (titleRevealed.value = true), 2000)

  // ambient fireworks and the headline pulse only run while the top section is on screen
  // (use the latest entry: the browser can deliver several at once while the page is loading)
  topObserver = new IntersectionObserver(
    (entries) => {
      topInView.value = entries[entries.length - 1].intersectionRatio >= 0.25
    },
    { threshold: [0, 0.25] },
  )
  topObserver.observe(topSection.value)
})

onUnmounted(() => {
  topObserver?.disconnect()
})
</script>

<template>
  <div class="hw-page" data-bs-theme="dark" @click="onPageTap">
    <!-- Top screen (your own navbar sits above this page) -->
    <section id="top" ref="topSection" class="hw-top">
      <div class="hw-horizon" aria-hidden="true"></div>

      <!--
        Laptops: headline and drill on the left, video filling the right side.
        Phones: headline, then video, then drill.
      -->
      <div class="container hw-top-inner hw-top-grid">
        <div class="hw-intro">
          <h1 class="hw-title">
            <span class="hw-title-show d-block">
              <span v-for="(word, i) in titleWords" :key="word" class="w" :class="{ revealed: titleRevealed }">
                <span :ref="(el) => (wordEls[i] = el)" class="w-pulse">
                  <span class="w-in" :style="{ '--d': 150 + i * 120 + 'ms' }">{{ word }}</span>
                </span>
              </span>
            </span>
            <span class="hw-title-motto d-block">
              <span v-for="(word, i) in mottoWords" :key="word" class="w" :class="{ revealed: titleRevealed }">
                <span :ref="(el) => (wordEls[titleWords.length + i] = el)" class="w-pulse">
                  <span class="w-in" :style="{ '--d': 420 + i * 110 + 'ms' }">{{ word }}</span>
                </span>
              </span>
            </span>
          </h1>

          <p class="hw-sub hw-fade" style="--d: 950ms">
            National Education Show management by NDP Exco, MOE and Heartware.
          </p>

          <div class="d-flex flex-wrap align-items-center gap-3 hw-fade" style="--d: 1050ms">
            <RouterLink :to="signupPath" class="btn btn-hw btn-lg btn-shine px-4">Sign up to volunteer</RouterLink>
            <RouterLink :to="loginPath" class="btn btn-ghost btn-lg px-4">Log in</RouterLink>
          </div>
        </div>

        <div class="hw-video hw-fade" style="--d: 650ms">
          <VideoShowcase fill />
        </div>

        <!-- Live drill -->
        <div id="drill" class="hw-drill">
          <h2 class="hw-drill-title">What happens when a group misses a checkpoint</h2>
          <CheckpointDrill />
        </div>
      </div>

      <!-- bottom centre of the screen ("Tap" on phones and tablets) -->
      <p class="hw-sky-hint">
        <span class="hint-click">Click</span><span class="hint-tap">Tap</span> anywhere to launch a firework
      </p>
    </section>

    <!-- Fireworks layer: covers the whole screen, clicks pass through it -->
    <FireworksSky ref="sky" :ambient="topInView" @burst="onBurst" />
  </div>
</template>

<!--
  Shared styles for this page and its components (not scoped, but every
  selector starts with .hw-page so nothing leaks into the rest of the app).

  Fonts: add ONE of these
    a) pnpm add @fontsource/barlow-condensed @fontsource/instrument-sans
       then in main.js:
         import '@fontsource/barlow-condensed/700.css'
         import '@fontsource/barlow-condensed/800.css'
         import '@fontsource/instrument-sans/400.css'
         import '@fontsource/instrument-sans/600.css'
    b) or in index.html <head>:
       <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Instrument+Sans:wght@400;600&display=swap" rel="stylesheet">
-->
<style>
.hw-page {
  /* height of your app's navbar, so the top screen fits exactly below it */
  --hw-nav-h: 72px;

  /* design tokens */
  --hw-night: #070b1a;
  --hw-navy: #0f1730;
  --hw-line: rgba(244, 246, 251, 0.1);
  --hw-red: #ef3340;
  --hw-red-hot: #ff4d5a;
  --hw-white: #f4f6fb;
  --hw-muted: #a3adc8;
  --hw-gold: #ffc857;
  --hw-display: 'Barlow Condensed', 'Arial Narrow', sans-serif;
  --hw-body: 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* Bootstrap overrides via its CSS variables */
  --bs-body-bg: var(--hw-night);
  --bs-body-color: var(--hw-white);
  --bs-body-font-family: var(--hw-body);
  --bs-link-color-rgb: 255, 77, 90;
  --bs-link-hover-color-rgb: 255, 138, 148;

  background: var(--hw-night);
  color: var(--hw-white);
  font-family: var(--hw-body);
  overflow-x: clip;
}

/* Custom Bootstrap button variants */
.hw-page .btn-hw {
  --bs-btn-color: #fff;
  --bs-btn-bg: var(--hw-red);
  --bs-btn-border-color: var(--hw-red);
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: var(--hw-red-hot);
  --bs-btn-hover-border-color: var(--hw-red-hot);
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: #d42a36;
  --bs-btn-active-border-color: #d42a36;
  --bs-btn-focus-shadow-rgb: 239, 51, 64;
  --bs-btn-disabled-color: #fff;
  --bs-btn-disabled-bg: var(--hw-red);
  --bs-btn-disabled-border-color: var(--hw-red);
  font-weight: 600;
}

.hw-page .btn-ghost {
  --bs-btn-color: var(--hw-white);
  --bs-btn-bg: transparent;
  --bs-btn-border-color: rgba(244, 246, 251, 0.35);
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: rgba(244, 246, 251, 0.1);
  --bs-btn-hover-border-color: rgba(244, 246, 251, 0.6);
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: rgba(244, 246, 251, 0.16);
  --bs-btn-active-border-color: rgba(244, 246, 251, 0.6);
  --bs-btn-focus-shadow-rgb: 244, 246, 251;
  --bs-btn-disabled-color: var(--hw-muted);
  --bs-btn-disabled-border-color: rgba(244, 246, 251, 0.15);
  font-weight: 600;
}

/* a beam of light sweeps across on hover */
.hw-page .btn-shine {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.hw-page .btn-shine::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.45) 50%, transparent 65%);
  transform: translateX(-120%);
  transition: transform 0.7s ease;
}

.hw-page .btn-shine:hover::after,
.hw-page .btn-shine:focus-visible::after {
  transform: translateX(120%);
}

.hw-page .btn:active {
  transform: scale(0.97);
}

.hw-page .hw-muted {
  color: var(--hw-muted);
}

@media (prefers-reduced-motion: reduce) {
  .hw-page .btn-shine::after {
    transition: none;
  }
}
</style>

<style scoped>
/* ---------- Top screen ---------- */
.hw-top {
  /* the space left under your navbar */
  --hw-avail: calc(100vh - var(--hw-nav-h));
  position: relative;
  padding: 2rem 0 2.5rem;
  background:
    radial-gradient(60% 45% at 85% 0%, rgba(42, 58, 120, 0.55), transparent 70%),
    linear-gradient(180deg, #050816 0%, var(--hw-night) 55%);
  isolation: isolate;
}

/* everything sits above the background glow */
.hw-top-inner {
  position: relative;
  z-index: 1;
}

/* warm parade glow behind the lower half */
.hw-horizon {
  position: absolute;
  inset: auto 0 0 0;
  height: 55%;
  background: radial-gradient(60% 80% at 50% 100%, rgba(239, 51, 64, 0.16), transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ---------- Headline ---------- */
.hw-title {
  font-family: var(--hw-display);
  font-weight: 800;
  text-transform: uppercase;
  line-height: 0.88;
  letter-spacing: 0.005em;
  margin: 0 0 1rem;
}

.hw-title-show {
  font-size: clamp(3.6rem, 16vw, 5rem);
  color: var(--hw-white);
}

.hw-title-motto {
  font-size: clamp(2.1rem, 9vw, 3rem);
  margin-top: 0.25rem;
}

/* each word rises up out of a mask */
.w {
  display: inline-block;
  margin-right: 0.24em;
  clip-path: inset(-30% -20% -4% -20%);
}

/* after the rise-in, the mask comes off so the firework pulse and glow can spill out */
.w.revealed {
  clip-path: none;
}

/* the part that expands and shrinks with each firework (animated from the script) */
.w-pulse {
  display: inline-block;
  transform-origin: 50% 70%;
}

.w-in {
  display: inline-block;
  animation: hw-rise 0.95s cubic-bezier(0.2, 0.8, 0.2, 1) var(--d, 0ms) both;
}

/* motto words: red, with a gold light sweep that repeats */
.hw-title-motto .w-in {
  color: var(--hw-red);
  background: linear-gradient(100deg, var(--hw-red) 40%, #ffe3a3 50%, var(--hw-red) 60%) 100% 0 / 260% 100% no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation:
    hw-rise 0.95s cubic-bezier(0.2, 0.8, 0.2, 1) var(--d, 0ms) both,
    hw-sweep 7s ease-in-out calc(var(--d, 0ms) + 1.3s) infinite;
}

@keyframes hw-rise {
  from {
    transform: translateY(105%) rotate(4deg);
  }
  to {
    transform: none;
  }
}

@keyframes hw-sweep {
  0% {
    background-position: 100% 0;
  }
  18%,
  100% {
    background-position: 0% 0;
  }
}

.hw-sub {
  color: #c9cfe2;
  font-size: 1.1rem;
  max-width: 44ch;
  margin-bottom: 1.25rem;
}

.hw-fade {
  animation: hw-fade-up 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) var(--d, 0ms) both;
}

@keyframes hw-fade-up {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}

/* phones: centred under the drill; laptops: pinned to the bottom centre (see the media query) */
.hw-sky-hint {
  position: relative;
  z-index: 1;
  margin: 1.75rem 0 0;
  text-align: center;
  font-size: 0.85rem;
  color: rgba(244, 246, 251, 0.5);
  pointer-events: none;
  animation: hw-fade-up 0.8s ease 2.2s both;
}

.hint-tap {
  display: none;
}

/* touch screens say "Tap" instead of "Click" */
@media (hover: none) {
  .hint-click {
    display: none;
  }
  .hint-tap {
    display: inline;
  }
}

/* ---------- Layout ---------- */
/* phones: one column (headline, video, drill); laptops: see the media query below */
.hw-top-grid {
  display: grid;
  gap: 2rem;
}

/* ---------- Video ---------- */
/* make the video's switcher a bit slimmer */
.hw-video :deep(.switcher) {
  margin-top: 0.6rem;
}

.hw-video :deep(.switcher button) {
  padding: 0.45rem 0.75rem;
  font-size: 0.92rem;
}

/* ---------- Live drill ---------- */
.hw-drill {
  scroll-margin-top: 1rem;
}

.hw-drill-title {
  font-family: var(--hw-display);
  font-weight: 800;
  text-transform: uppercase;
  font-size: clamp(1.4rem, 5vw, 1.75rem);
  line-height: 1;
  letter-spacing: 0.01em;
  margin-bottom: 0.85rem;
}

/* ---------- Laptops: fit everything into one screen ---------- */
@media (min-width: 992px) {
  .hw-top {
    min-height: var(--hw-avail);
    display: flex;
    align-items: center;
    /* extra room at the bottom for the firework hint */
    padding: clamp(1rem, 2.5vh, 2rem) 0 calc(clamp(1rem, 2.5vh, 2rem) + 1.6rem);
  }

  .hw-sky-hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: clamp(0.6rem, 1.8vh, 1.1rem);
    margin: 0;
  }

  /* sizes follow the screen height as well as the width */
  .hw-title-show {
    font-size: clamp(3.4rem, min(5.6vw, calc(var(--hw-avail) * 0.12)), 5.8rem);
  }

  .hw-title-motto {
    font-size: clamp(2.1rem, min(3.4vw, calc(var(--hw-avail) * 0.07)), 3.6rem);
  }

  .hw-title {
    margin-bottom: clamp(0.6rem, 1.5vh, 1rem);
  }

  /* one line on laptops, which leaves room for a bigger headline */
  .hw-sub {
    max-width: none;
    font-size: 1rem;
    margin-bottom: clamp(0.75rem, 2vh, 1.25rem);
  }

  /*
    headline top-left, drill bottom-left, video filling the whole right side:
      [ intro ] [       ]
      [ drill ] [ video ]
  */
  .hw-top-grid {
    grid-template-columns: minmax(0, 11fr) minmax(0, 9fr);
    grid-template-areas:
      'intro video'
      'drill video';
    column-gap: clamp(2rem, 3.5vw, 3.5rem);
    row-gap: clamp(1rem, 3vh, 2rem);
  }

  .hw-intro {
    grid-area: intro;
  }

  .hw-video {
    grid-area: video;
  }

  .hw-drill {
    grid-area: drill;
  }

  .hw-drill-title {
    font-size: clamp(1.3rem, min(1.9vw, calc(var(--hw-avail) * 0.03)), 1.75rem);
    margin-bottom: clamp(0.5rem, 1.2vh, 0.85rem);
  }
}

/* ---------- Motion preferences ---------- */
@media (prefers-reduced-motion: reduce) {
  .w-in,
  .hw-title-motto .w-in,
  .hw-fade,
  .hw-sky-hint {
    animation: none !important;
  }
}
</style>