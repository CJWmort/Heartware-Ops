<script setup>
// Feature 4 – Incident Reporting (volunteer side) — owner: Wei Ming
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Wei Ming): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Big one-tap template buttons from listTemplates() (Student unwell, Bus delayed, Lost item, Other)',
  'Optional note (max 500 chars with counter) + optional photo (camera input, resize before upload)',
  'Location + your slot attached automatically; reportIncident() → success screen with "Report another"',
  'Your recent reports with their status (new / acknowledged / resolved)',
  'data-testids: incident-type-<TYPE>, incident-note, incident-photo, incident-submit, incident-success',
]
</script>

<template>
  <section>
    <PageHeader title="Report incident" icon="bi-exclamation-triangle" />
    <FeaturePlaceholder feature="Feature 4 – Incident Reporting (volunteer side)" owner="Wei Ming" :todos="todos" />
  </section>
</template>
