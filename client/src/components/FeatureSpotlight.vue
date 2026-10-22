<script setup>
// Right-hand panel on the landing page: shows one feature at a time and rotates through them automatically.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Draft copy: edit the wording to match your final features
const features = [
  {
    icon: 'bi-person-plus',
    title: 'Smart allocation',
    text: 'Volunteers are matched to schools automatically, with remote schools filled first.',
    bullets: [
      'Remote schools matched first',
      'Admin reviews the plan, then publishes',
      'Volunteers confirm or decline in the app',
    ],
  },
  {
    icon: 'bi-megaphone',
    title: 'Open slots',
    text: 'When someone drops out, their place becomes a slot that nearby volunteers can claim.',
    bullets: [
      'Drop-outs become open slots',
      'Nearby volunteers can claim them',
      'No more last-minute phone calls',
    ],
  },
  {
    icon: 'bi-broadcast',
    title: 'Live tracking',
    text: 'HQ sees every P5 group on one map, checkpoint by checkpoint, on the day itself.',
    bullets: [
      'Every group on one live map',
      'Checkpoint-by-checkpoint progress',
      'From school to the Padang and back',
    ],
  },
  {
    icon: 'bi-bell',
    title: 'Incidents & alerts',
    text: 'One-tap reports and automatic alerts mean HQ hears about problems straight away.',
    bullets: [
      'One-tap incident reports',
      'Automatic missed-checkpoint alerts',
      'Private chat between volunteer and HQ',
    ],
  },
  {
    icon: 'bi-award',
    title: 'Badge Studio',
    text: 'Earn badges for showing up, then design your own physical badge as a keepsake.',
    bullets: ['Earn badges for volunteering', 'Design your own physical badge'],
  },
]

const SLIDE_MS = 6000 // how long each feature stays on screen
const TICK_MS = 50 // how often the progress bar updates

const index = ref(0) // which feature is showing
const elapsed = ref(0) // milliseconds spent on the current feature
const paused = ref(false) // true while the user hovers or focuses the panel
let timer = null

const current = computed(() => features[index.value])
const progress = computed(() => (elapsed.value / SLIDE_MS) * 100) // 0 to 100, drives the progress bar width

function go(i) {
  index.value = i
  elapsed.value = 0 // restart the progress bar
}

function tick() {
  if (paused.value) return // freeze while the user is reading
  elapsed.value += TICK_MS
  if (elapsed.value >= SLIDE_MS) go((index.value + 1) % features.length) // wrap back to the first feature
}

onMounted(() => {
  // Users who prefer reduced motion get no auto-rotation, they can still click the dots
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(tick, TICK_MS)
})

onBeforeUnmount(() => clearInterval(timer)) // stop the timer when leaving the page
</script>

<template>
  <div
    class="spotlight"
    aria-live="off"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <!-- :key makes Vue replay the fade-in animation each time the feature changes -->
    <div :key="index" class="spotlight-body">
      <div class="glow-ring">
        <div class="glow-icon"><i :class="['bi', current.icon]" aria-hidden="true"></i></div>
      </div>
      <h2 class="spotlight-title">{{ current.title }}</h2>
      <p class="spotlight-text">{{ current.text }}</p>
      <ul class="bullet-card">
        <li v-for="b in current.bullets" :key="b">
          <i class="bi bi-check2" aria-hidden="true"></i>{{ b }}
        </li>
      </ul>
    </div>

    <!-- thin bar showing how long until the next feature -->
    <div class="timer-track"><div class="timer-fill" :style="{ width: progress + '%' }"></div></div>

    <!-- one dot per feature; they are real buttons so keyboard and screen-reader users can use them -->
    <div class="dots">
      <button
        v-for="(f, i) in features"
        :key="f.title"
        type="button"
        class="dot"
        :class="{ active: i === index }"
        :aria-label="`Show ${f.title}`"
        :aria-current="i === index"
        @click="go(i)"
      ></button>
    </div>
  </div>
</template>

<style scoped>
.spotlight-body {
  animation: fade-up 0.5s ease both; /* replays whenever :key changes */
}
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Icon with a glowing ring around it */
.glow-ring {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 2px solid var(--hw-landing-accent);
  box-shadow: 0 0 24px rgb(255 77 94 / 0.45);
}
.glow-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.75rem;
  color: #fff;
  background: rgb(214 0 28 / 0.55);
}

.spotlight-title {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 1.1rem 0 0.5rem;
}
.spotlight-text {
  color: var(--hw-landing-muted);
  max-width: 34rem;
}

/* Frosted-glass card with a coloured left edge */
.bullet-card {
  list-style: none;
  margin: 1.25rem 0 0;
  padding: 1rem 1.25rem;
  background: var(--hw-landing-glass);
  border: 1px solid var(--hw-landing-glass-border);
  border-left: 3px solid var(--hw-landing-accent);
  border-radius: 0.6rem;
  backdrop-filter: blur(6px); /* blurs the fireworks behind the card */
}
.bullet-card li {
  padding: 0.2rem 0;
}
.bullet-card .bi {
  color: var(--hw-landing-accent);
  margin-right: 0.75rem;
}

.timer-track {
  height: 3px;
  margin-top: 1.5rem;
  background: var(--hw-landing-glass-border);
  border-radius: 2px;
}
.timer-fill {
  height: 100%;
  background: var(--hw-landing-accent);
  border-radius: 2px;
}

.dots {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.dot {
  width: 10px;
  height: 10px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--hw-landing-glass-border);
}
.dot.active {
  background: var(--hw-landing-accent);
}
.dot:focus-visible {
  outline: 2px solid #fff; /* visible keyboard focus */
  outline-offset: 3px;
}
</style>
