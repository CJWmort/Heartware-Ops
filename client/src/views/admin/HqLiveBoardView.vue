<script setup>
// Feature 3 – Live Movement Tracking (HQ map) — owner: Chin
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Chin): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Event picker; getLiveBoard() every 30s (or live via socket "tracking:update")',
  'BaseMap with one marker per group, coloured by latest checkpoint; venue markers',
  'Side list: school, bus, progress bar (checkpoints done / 6), last update time; click → zoom to marker + timeline',
  'Filters: venue, status (not started / en route / seated / returning / done)',
  'data-testids: hq-map, hq-group-list, hq-group-<slotId>, hq-filter-status',
]
</script>

<template>
  <section>
    <PageHeader title="Live board" icon="bi-broadcast" />
    <FeaturePlaceholder feature="Feature 3 – Live Movement Tracking (HQ map)" owner="Chin" :todos="todos" />
    <!-- Suggested layout: map 8 cols + list 4 cols on desktop; list under map on mobile -->
  </section>
</template>
