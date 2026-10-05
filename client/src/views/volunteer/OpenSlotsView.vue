<script setup>
// Feature 2 – Open Slot Replacement (volunteer side) — owner: Yap
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Yap): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Cards for open slots near you (listOpenSlots): school, date, distance, live countdown to expiresAt',
  'Claim button (claimSlot) → "Claimed – waiting for coordinator" state',
  '"I can\'t make it" flow for your own slot: reason picker (MC / Urgent matter / Other) → dropOut()',
  'Optional: request a swap with another slot (requestSwap)',
  'Empty state: "No open slots near you right now"',
  'data-testids: open-slot-card, open-slot-countdown, open-slot-claim, dropout-open, dropout-reason, dropout-submit',
]
</script>

<template>
  <section>
    <PageHeader title="Open slots" icon="bi-megaphone" />
    <FeaturePlaceholder feature="Feature 2 – Open Slot Replacement (volunteer side)" owner="Yap" :todos="todos" />
  </section>
</template>
