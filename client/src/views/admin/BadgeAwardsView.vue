<script setup>
// Feature 5 – Awards + orders (coordinator) — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Hanafi): build this page, then delete FeaturePlaceholder below.
const todos = [
  '"Run auto-awards" for an event (autoAward) → count awarded',
  'Custom award: pick badge, pick one or many volunteers (searchable), message → awardBadge()',
  'Orders table with status dropdown (updateOrderStatus)',
  'data-testids: awards-auto, awards-badge-select, awards-volunteer-search, awards-message, awards-submit, orders-table',
]
</script>

<template>
  <section>
    <PageHeader title="Badges & orders" icon="bi-award" />
    <FeaturePlaceholder feature="Feature 5 – Awards + orders (coordinator)" owner="Hanafi" :todos="todos" />
  </section>
</template>
