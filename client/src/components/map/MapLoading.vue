<!-- The "Fetching data" cover shown over a map while it loads. -->

<script setup>
// Accepts the text to show.

defineProps({ text: { type: String, default: 'Loading...' } })
</script>

<template>
  <!-- A spinner and the text. -->
  <div class="map-loading" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
    <div class="mt-2 fw-semibold">{{ text }}</div>
  </div>
</template>

<style scoped>
/* Styles for the cover, placed above the map panels. */

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6);
  color: #1f2430;
  backdrop-filter: grayscale(1);
}
</style>
