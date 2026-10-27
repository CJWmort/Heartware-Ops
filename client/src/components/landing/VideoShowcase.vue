<script setup>
// Right-hand hero panel on the landing page: one video player with buttons to switch between videos.
import { computed, ref } from 'vue'

// To add a video, copy a line and change the title/file.
// Files live in client/public/videos/, so the URL starts with /videos/
const videos = [
  { title: 'Heartware Video 1', src: '/videos/Heartware.mp4' },
  { title: 'Heartware Video 2', src: '/videos/Heartware2.mp4' },
]

const index = ref(0) // which video is selected
const current = computed(() => videos[index.value]) // the selected video object
</script>

<template>
  <div class="showcase">
    <!-- :key makes Vue build a fresh <video> when the source changes, so the old one stops playing.
         preload="metadata" loads only the length and first frame, not the whole file -->
    <video
      :key="current.src"
      class="showcase-video"
      :src="current.src"
      controls
      preload="metadata"
      playsinline
    ></video>

    <!-- One real button per video, so keyboard and screen-reader users can switch too -->
    <div class="showcase-tabs">
      <button
        v-for="(v, i) in videos"
        :key="v.src"
        type="button"
        class="showcase-tab"
        :class="{ active: i === index }"
        :aria-pressed="i === index"
        @click="index = i"
      >
        {{ v.title }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.showcase-video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9; /* keeps the player the same shape before the video loads */
  background: #000;
  border: 1px solid var(--hw-landing-glass-border);
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
}

.showcase-tabs {
  display: flex;
  flex-wrap: wrap; /* buttons drop to a new line on narrow screens */
  gap: 0.5rem;
  margin-top: 0.9rem;
}
/* Pill-shaped switch buttons using the landing page's frosted-glass look */
.showcase-tab {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--hw-landing-glass-border);
  border-radius: 999px;
  background: var(--hw-landing-glass);
  color: var(--hw-landing-text);
  font-size: 0.9rem;
}
.showcase-tab.active {
  background: var(--hw-landing-accent); /* highlights the video that is selected */
  border-color: var(--hw-landing-accent);
  color: #fff;
}
.showcase-tab:focus-visible {
  outline: 2px solid #fff; /* visible keyboard focus */
  outline-offset: 3px;
}
</style>
