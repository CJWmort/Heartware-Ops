<script setup>
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 2rem 1rem;
  color: var(--hw-text, #1f2430);
}
.page-loading.is-contained {
  position: absolute;
  inset: 0;
  min-height: 0;
  padding: 0;
}
</style>