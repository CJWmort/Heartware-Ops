<script setup>
import { ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import IncidentCard from '@/components/incidents/IncidentCard.vue'
import AlertItem from '@/components/incidents/AlertItem.vue'
import { mockIncidents, mockTemplates } from '@/mocks/incidents'
import BaseMap from '@/components/BaseMap.vue'

const incidents = ref(mockIncidents)
const selectedId = ref(null)

// { STUDENT_UNWELL: {label, icon...}, BUS_DELAYED: {...}, ... }
const templatesByType = Object.fromEntries(mockTemplates.map((t) => [t.type, t]))

// TODO(Wei Ming): replace these with your real logic
function onMapReady(map, L) {
  console.log('Map is ready')
}
function onSelect(incident) {
  console.log('selected', incident._id)
}
function onAcknowledge(incident) {
  console.log('acknowledge', incident._id)
}
function onResolve(incident) {
  console.log('resolve', incident._id)
}
</script>

<template>
  <section>
    <PageHeader title="Incidents & Alerts" icon="bi-bell" />

    <!-- 1. Alerts strip -->
    <div class="mb-3" data-testid="alerts-panel">
      <!-- <AlertItem v-for="…" /> -->
      <AlertItem v-for="alert in alerts">
        :key="alert._id" :alert="alert" @acknowledge="onAcknowledgeAlert"
      </AlertItem>
    </div>

    <div class="row g-3">
      <!-- the map will be here, top for phones and right-side for desktop views-->
      <div class="col-12 col-lg-5 order-1 order-lg-2">
        <div class="incident-map-wrap sticky-lg-top">
          <BaseMap testid="incident-map" @ready="onMapReady"></BaseMap>
        </div>
      </div>

      <!-- status/cards will under map on iphone 16, left side on desktop -->
      <div class="col-12 col-lg-7 order-2 order-lg-1">
        <div class="d-flex flex-column gap-3" data-testid="queue-new">
          <IncidentCard
            v-for="incident in incidents"
            :key="incident._id"
            :incident="incident"
            :template="templatesByType[incident.type]"
            :selected="selectedId === incident._id"
            @select="onSelect"
            @acknowledge="onAcknowledge"
            @resolve="onResolve"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.incident-map-wrap {
  top: 1rem; /* gap from the top when the map sticks while scrolling on desktop */
}

/* Shorter map on phones/tablets so the cards are visible without much scrolling */
@media (max-width: 991.98px) {
  .incident-map-wrap :deep(.map-container) {
    height: 220px;
  }
}
</style>
