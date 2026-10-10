<script setup>
// Feature 3 – Live Movement Tracking (volunteer side) — owner: Chin
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Chin): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Big vertical stepper of the 6 checkpoints (CHECKPOINTS / CHECKPOINT_LABELS in utils/constants.js)',
  'Only the NEXT checkpoint is tappable; tap → get location (navigator.geolocation) → checkIn()',
  'While this page is open: sendPing() every PING_INTERVAL_MS; keep screen awake (navigator.wakeLock)',
  'Status strip: "Last location sent 2 min ago", GPS accuracy, offline warning',
  'Quick link to Report incident (Feature 4)',
  'data-testids: checkpoint-<NAME>, checkpoint-next, tracking-last-ping, tracking-error',
]
</script>

<template>
  <section>
    <PageHeader title="Event day" icon="bi-signpost-split" />
    <FeaturePlaceholder feature="Feature 3 – Live Movement Tracking (volunteer side)" owner="Chin" :todos="todos" />
  </section>
</template>
