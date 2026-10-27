<script setup>
// NEW: "Fetching..." overlay for pages that are NOT maps (MapLoading is the map version, same look).
// Use it together with <Transition name="loading-fade"> so it fades in and out instead of popping:
//   <Transition name="loading-fade"><PageLoading v-if="loading" text="Fetching Orders..." /></Transition>
//   contained = false (default): covers the whole page under the navbar.
//   contained = true           : covers only its parent box (the parent needs position: relative, e.g. class="loading-area").
defineProps({
  text: { type: String, default: 'Loading...' },
  contained: { type: Boolean, default: false },
})
</script>

<template>
  <div class="page-loading" :class="{ 'is-contained': contained }" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
    <div class="mt-2 fw-semibold">{{ text }}</div>
  </div>
</template>

<style scoped>
.page-loading {
  position: fixed;
  top: 56px; /* the navbar height (same value as --nav-h in map-ui.css) */
  left: 0;
  right: 0;
  bottom: 0; /* stretch to the bottom of the screen */
  z-index: 1100; /* same level as MapLoading: above page content */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6); /* same see-through white as MapLoading */
  color: #1f2430; /* dark text so it stays readable in dark mode */
}
/* contained: sit inside the parent box instead of the whole screen */
.page-loading.is-contained {
  position: absolute;
  inset: 0;
  z-index: 5;
}
</style>
