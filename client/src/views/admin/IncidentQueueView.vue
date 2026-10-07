<script setup>
import { ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import IncidentCard from '@/components/incidents/IncidentCard.vue'
import { mockIncidents, mockTemplates } from '@/mocks/incidents'
import BaseMap from '@/components/BaseMap.vue'

const incidents = ref(mockIncidents)
const selectedId = ref(null)

// { STUDENT_UNWELL: {label, icon...}, BUS_DELAYED: {...}, ... }
const templatesByType = Object.fromEntries(mockTemplates.map((t) => [t.type, t]))

// TODO(Wei Ming): replace these with your real logic
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

    <BaseMap></BaseMap>

    <div class="d-flex flex-column gap-3">
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
  </section>
</template>
