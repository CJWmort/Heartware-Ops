<script setup>
// Feature 2 – Open Slot Replacement (coordinator side) — owner: Yap
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Yap): build this page, then delete FeaturePlaceholder below.
const todos = [
  'List of open slots (listOpenSlots); mark a volunteer as no-show (markNoShow)',
  'Select a slot → map (BaseMap) centred on the school with a circle + radius slider (1–15 km)',
  'Slider change → listCandidates(radiusKm) → candidate pins appear/disappear; claimants highlighted',
  'Compare panel: 2–3 candidates side by side (distance, events completed, drop-outs, badges)',
  'Approve button (approveClaim) → slot filled; swap requests list (decideSwap)',
  'History tab (getHistory): drop-out → claim → approval timeline',
  'data-testids: repl-open-list, repl-slot-<id>, repl-radius, repl-candidate-<id>, repl-compare, repl-approve, repl-history',
]
</script>

<template>
  <section>
    <PageHeader title="Replacements" icon="bi-arrow-left-right" />
    <FeaturePlaceholder feature="Feature 2 – Open Slot Replacement (coordinator side)" owner="Yap" :todos="todos" />
    <!-- Suggested layout: left = open slot list, right = map + slider; compare panel slides up below (stacks on mobile) -->
  </section>
</template>
