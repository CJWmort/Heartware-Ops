<script setup>
// Consistent page title block. Usage:
//   <PageHeader title="Allocation" subtitle="NE Show 1 · National Stadium" icon="bi-grid-3x3-gap" />
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
})
</script>

<template>
  <header class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
    <div>
      <h1 class="h3 mb-1" data-testid="page-title">
        <i v-if="icon" :class="['bi', icon, 'me-2']" aria-hidden="true"></i>{{ title }}
      </h1>
      <p v-if="subtitle" class="text-muted-hw mb-0">{{ subtitle }}</p>
    </div>
    <!-- Put page-level buttons in the "actions" slot -->
    <div class="d-flex gap-2"><slot name="actions" /></div>
  </header>
</template>
