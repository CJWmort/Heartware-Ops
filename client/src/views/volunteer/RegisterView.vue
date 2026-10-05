<script setup>
// Feature 1a – Registration — owner: Kuah
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Kuah): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Multi-step form: details → available show dates → location consent → review',
  'Postal code: live OneMap preview "📍 Found: …" (services/onemap.js, debounced)',
  'Show dates as clickable chips (listEvents from services/volunteers.js)',
  'Block submit until consent is ticked; show a clear message why',
  'On submit: auth.register(payload) then go to /me/assignment',
  'data-testids: reg-name, reg-email, reg-password, reg-postal, reg-postal-preview, reg-date-<n>, reg-consent, reg-submit, reg-error',
]
</script>

<template>
  <section>
    <PageHeader title="Volunteer sign-up" icon="bi-person-plus" />
    <FeaturePlaceholder feature="Feature 1a – Registration" owner="Kuah" :todos="todos" />
    <!-- Suggested layout: step progress bar on top, one card per step, Back / Next buttons -->
  </section>
</template>
