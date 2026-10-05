<script setup>
// Feature 5 – Badge wall — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Hanafi): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Grid of earned badges (getMyBadges); locked/greyed ones you have not earned (listBadges)',
  'Click a badge → modal with description, event and thank-you message',
  'Button to the Badge Studio; order status tracker (getMyOrders): Placed → In production → Shipped → Delivered',
  'data-testids: badge-wall, badge-<code>, badge-modal, order-status',
]
</script>

<template>
  <section>
    <PageHeader title="My badges" icon="bi-award" />
    <FeaturePlaceholder feature="Feature 5 – Badge wall" owner="Hanafi" :todos="todos" />
  </section>
</template>
