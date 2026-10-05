<script setup>
// Feature 4 – HQ triage queue + automatic alerts — owner: Wei Ming
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

// TODO(Wei Ming): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Three columns (tabs on mobile): New → Acknowledged → Resolved (listIncidents)',
  'Card: type icon, severity colour, school/bus, time ago, note, photo thumbnail',
  'Acknowledge / Resolve buttons (updateIncidentStatus); Resolve asks for a note',
  'Alerts panel: missed-checkpoint alerts (listAlerts) with Acknowledge button',
  'BONUS: services/socket.js → live "incident:new" / "alert:new" with toast + sound',
  'data-testids: queue-new, queue-acknowledged, queue-resolved, incident-card-<id>, incident-ack, incident-resolve, alerts-panel, alert-<id>',
]
</script>

<template>
  <section>
    <PageHeader title="Incidents & alerts" icon="bi-bell" />
    <FeaturePlaceholder feature="Feature 4 – HQ triage queue + automatic alerts" owner="Wei Ming" :todos="todos" />
    <!-- Suggested layout: alerts strip on top, kanban-style 3 columns below -->
  </section>
</template>
