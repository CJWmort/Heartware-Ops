<script setup>
// TEMPORARY: shows what still needs building on a page. Delete it from your page when done.
defineProps({
  feature: { type: String, required: true }, // e.g. "Feature 2 – Open Slot Replacement"
  owner: { type: String, required: true },
  todos: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="card card-hw border-start border-4 border-warning mb-4" data-testid="feature-placeholder">
    <div class="card-body">
      <p class="small text-uppercase fw-semibold text-warning mb-1">
        <i class="bi bi-cone-striped me-1" aria-hidden="true"></i>To build
      </p>
      <h2 class="h6 mb-2">{{ feature }} <span class="text-muted-hw fw-normal">· {{ owner }}</span></h2>
      <ul class="mb-0 small">
        <li v-for="todo in todos" :key="todo">{{ todo }}</li>
      </ul>
    </div>
  </div>
</template>
