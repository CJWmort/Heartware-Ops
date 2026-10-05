<script setup>
// Feature 1b – Smart Allocation (volunteer side) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Fanny): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Load getMyAssignment() and show school, bus, class, venue, date, teacher contact',
  'Small map (BaseMap) with your home → school',
  'Accept / Decline buttons (respondToSlot) with a confirm step for Decline',
  '"I can\'t make it" button linking to Feature 2 drop-out (coordinate with Yap)',
  'Empty state when nothing is published yet',
  'data-testids: assignment-card, assignment-school, assignment-accept, assignment-decline, assignment-status',
]
</script>

<template>
  <section>
    <PageHeader title="My assignment" icon="bi-geo-alt" />
    <FeaturePlaceholder feature="Feature 1b – Smart Allocation (volunteer side)" owner="Fanny" :todos="todos" />
  </section>
</template>
