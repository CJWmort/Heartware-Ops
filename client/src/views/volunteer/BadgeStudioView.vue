<script setup>
// Feature 5 – Badge Studio — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Hanafi): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Live SVG preview that updates instantly as options change',
  'Controls: shape (BADGE_SHAPES), primary + secondary colour pickers, emblem picker, ribbon text (max 20, live counter)',
  'Save draft (saveMyDesign); "Lock in & order" → address form → placeOrder() → design becomes read-only',
  'data-testids: studio-preview, studio-shape-<shape>, studio-primary-color, studio-secondary-color, studio-emblem-<key>, studio-ribbon, studio-ribbon-count, studio-save, studio-lock, order-address, order-submit',
]
</script>

<template>
  <section>
    <PageHeader title="Badge Studio" icon="bi-palette" />
    <FeaturePlaceholder feature="Feature 5 – Badge Studio" owner="Hanafi" :todos="todos" />
    <!-- Suggested layout: preview on the left (sticky on desktop), controls on the right; stacked on mobile -->
  </section>
</template>
