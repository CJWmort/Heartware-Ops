<!-- A card on the home page that flips between two faces to show a feature. -->

<script setup>
// Tracks which face is on top and flips it on a click and on a timer.

import { ref, computed, onUnmounted } from 'vue'

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

const FLIP_MS = 600

const faceIdx = ref([0, 1])
const turns = ref(0)
// 0 = front side is facing you, 1 = back side is facing you
const up = computed(() => turns.value % 2)
// current (computed) - the face that is currently on top.
const current = computed(() => faceIdx.value[up.value])

let busy = false
let timer = 0

// flip() - 1) ignore the click if a flip is in progress 2) mark busy 3) add a half turn (the CSS
// rotates the card 180 degrees) 4) after FLIP_MS, give the side that is now hidden the feature after
// the visible one (the % wraps the last feature back to the first) 5) clear busy.
function flip() {
  if (busy) return
  busy = true
  turns.value++
  timer = setTimeout(() => {
    const hidden = 1 - up.value
    faceIdx.value[hidden] = (current.value + 1) % features.length
    busy = false
  }, FLIP_MS)
}

// Clear the timer if the page is left mid-flip.
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <!-- The two faces of the card inside a 3D flip container. -->
  <button
    type="button"
    class="flip"
    :aria-label="`Feature: ${features[current].title}. Click for the next feature.`"
    @click="flip"
  >
    <span class="flip-inner" :style="{ transform: `rotateY(${turns * 180}deg)` }">
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
/* Styles for the 3D flip and the two faces. */

.flip {
  display: block;
  width: 100%;
  height: clamp(
    270px,
    40vh,
    330px
  );
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
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-radius: 18px;
  border: 1px solid rgba(244, 246, 251, 0.1);
  background: #0f1730;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
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
  color: var(--hw-red);
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
  color: var(--hw-red);
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
}
</style>
