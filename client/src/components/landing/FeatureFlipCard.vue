<!--
  FeatureFlipCard.vue
  One card showing ONE feature at a time. Click it and it flips over to the next feature;
  after the last feature it flips back to the first, so it loops forever.
-->
<script setup>
import { ref, computed, onUnmounted } from 'vue'

// The features shown on the card. Edit the wording here and the card updates by itself.
const features = [
  {
    icon: 'bi-person-plus',
    title: 'Smart Registration',
    text: 'Volunteers sign up with their postal code and available dates.',
    bullets: [
      'Postal code turned into a map location automatically',
      'Availability updates dynamically',
      'Schools loaded from MOE data',
    ],
  },
  {
    icon: 'bi-diagram-3',
    title: 'Automated Allocation',
    text: 'Volunteers are matched to schools automatically.',
    bullets: [
      'Allocate by NE Shows',
      'Remote schools filled first',
      'Admin reviews, then publishes',
    ],
  },
  {
    icon: 'bi-clipboard-check',
    title: 'Automated Assignment',
    text: 'Each volunteer sees their assignments, direction to the school.',
    bullets: [
      'Confirm or decline in the app',
      'Pending status has a time limit of 24 hours',
      'Reserves are automatically added in event of withdrawal or decline',
    ],
  },
  {
    icon: 'bi-megaphone',
    title: 'Automated Replacement',
    text: 'When a volunteer drops out, only that slot is re-filled.',
    bullets: ['Reserves will be activated automatically', 'No one else is reshuffled'],
  },
  {
    icon: 'bi-broadcast',
    title: 'Live Monitoring',
    text: 'HQ sees every P5 class on one live map.',
    bullets: ['Checkpoint check-ins', 'Geofencing to track movement towards venue'],
  },
  {
    icon: 'bi-bell',
    title: 'Incident Reports',
    text: 'Problems are triaged and sent to HQ immediately.',
    bullets: [
      'Report an incident from map',
      'Incidents are triaged into categories',
      'Acknowledged, then resolved by HQ',
    ],
  },
  {
    icon: 'bi-chat-dots',
    title: 'Dedicated Chat',
    text: 'A private one-to-one chat between a volunteer and HQ.',
    bullets: ['Full chat history kept as a record', 'Latest message sent will be at the top'],
  },
  {
    icon: 'bi-award',
    title: 'Badges & Badge Studio',
    text: 'Earn badges for different categories, then design your own.',
    bullets: ['Complete all checkpoints', 'Early Bird', 'Super-Sub', 'Design a physical badge'],
  },
]

const FLIP_MS = 600 // must match the CSS transition time below

// faceIdx = which feature each side of the card holds: [front, back]
const faceIdx = ref([0, 1])
// turns = how many half-turns so far. It only ever goes up, so the card
// always spins the same way and never "rewinds" at the end of the loop.
const turns = ref(0)
// 0 = front side is facing you, 1 = back side is facing you
const up = computed(() => turns.value % 2)
const current = computed(() => faceIdx.value[up.value]) // feature on screen now

let busy = false // blocks extra clicks while the card is still turning
let timer = 0

function flip() {
  if (busy) return
  busy = true
  turns.value++ // the CSS turns the card 180° more
  // once the flip has finished, the side now hidden gets the feature after the visible one.
  // "% features.length" wraps the last feature back to the first, which makes the loop.
  timer = setTimeout(() => {
    const hidden = 1 - up.value
    faceIdx.value[hidden] = (current.value + 1) % features.length
    busy = false
  }, FLIP_MS)
}

onUnmounted(() => clearTimeout(timer)) // don't leave a timer running if the page is left mid-flip
</script>

<template>
  <button
    type="button"
    class="flip"
    :aria-label="`Feature: ${features[current].title}. Click for the next feature.`"
    @click="flip"
  >
    <!-- the inner box is what rotates; 180° per click -->
    <span class="flip-inner" :style="{ transform: `rotateY(${turns * 180}deg)` }">
      <!-- front side, then back side (turned round by 180° in CSS so it reads correctly) -->
      <span
        v-for="side in [0, 1]"
        :key="side"
        class="face"
        :class="side ? 'face-back' : 'face-front'"
      >
        <span class="face-count">Feature {{ faceIdx[side] + 1 }} of {{ features.length }}</span>
        <i class="face-icon bi" :class="features[faceIdx[side]].icon" aria-hidden="true"></i>
        <strong class="face-title">{{ features[faceIdx[side]].title }}</strong>
        <span class="face-text">{{ features[faceIdx[side]].text }}</span>
        <span v-for="b in features[faceIdx[side]].bullets" :key="b" class="face-bullet">{{
          b
        }}</span>
        <span class="face-hint">Click to flip →</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.flip {
  display: block;
  width: 100%;
  height: clamp(
    270px,
    40vh,
    330px
  ); /* taller than before so features with 3-4 bullets fit: at least 270px, at most 330px, about 40% of the screen height in between */
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  perspective: 1200px;
  cursor: pointer;
}
.flip-inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d; /* lets the two sides sit back to back in 3D */
  transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* tighter space between lines on a card face, so more text fits */
  padding: 1rem 1.25rem;
  border-radius: 18px;
  border: 1px solid rgba(244, 246, 251, 0.1);
  background: #0f1730;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden; /* hide a side when it faces away */
}
.face-back {
  transform: rotateY(180deg);
}
.flip:hover .face {
  border-color: rgba(239, 51, 64, 0.6);
}
.flip:focus-visible {
  outline: 2px solid #ffc857;
  outline-offset: 3px;
  border-radius: 18px;
}
.face-count {
  font-size: 0.78rem;
  color: #ffc857;
  font-weight: 600;
}
.face-icon {
  font-size: 1.8rem;
  color: #ef3340;
  line-height: 1;
}
.face-title {
  font-family: var(--hw-display, sans-serif);
  font-size: 1.5rem;
  text-transform: uppercase;
  line-height: 1;
}
.face-text {
  color: #c9cfe2;
  font-size: 0.92rem;
}
.face-bullet {
  color: #a3adc8;
  font-size: 0.85rem;
}
.face-bullet::before {
  content: '• ';
  color: #ef3340;
}
.face-hint {
  margin-top: auto;
  font-size: 0.78rem;
  color: rgba(244, 246, 251, 0.5);
}
@media (prefers-reduced-motion: reduce) {
  .flip-inner {
    transition: none;
  }
} /* no spin if the viewer asked for less motion */
</style>
