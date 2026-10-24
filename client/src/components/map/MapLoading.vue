<script setup>
defineProps({ text: { type: String, default: 'Loading...' } })
</script>

<template>
  <div class="map-loading" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
    <div class="mt-2 fw-semibold">{{ text }}</div>
  </div>
</template>

<style scoped>
.map-loading {
  position: absolute;
  inset: 0;
  z-index: 1100; /* above Leaflet panes and controls */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6);
  color: #1f2430; /* CHANGED: dark text on this light overlay so 'Loading...' stays readable in dark mode */
  backdrop-filter: grayscale(1);
}
</style>
