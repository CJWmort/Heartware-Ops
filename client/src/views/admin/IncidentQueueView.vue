<script setup>
import { onMounted, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import BaseMap from '@/components/BaseMap.vue'
import { listIncidents, listTemplates, updateIncidentStatus } from '@/services/incidents'
import IncidentCard from '@/components/IncidentCard.vue'

const incidents = ref([])
const templatesByType = ref({}) // { STUDENT_UNWELL: {label, icon...}, BUS_DELAYED: {...}, ... }
const selectedId = ref(null)
const errorMessage = ref('')

let mapRef = null
let leafletRef = null
let incidentLayer = null

onMounted(async () => {
  try {
    incidents.value = await listIncidents()
    const templates = await listTemplates()
    templatesByType.value = Object.fromEntries(
      templates.map((template) => [template.type, template]),
    )
    plotIncidents()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
})

// Map ready, mapRef will be updated and
function onMapReady(map, L) {
  console.log('Map is ready')
  mapRef = map
  leafletRef = L

  incidentLayer = L.layerGroup().addTo(map)

  plotIncidents()
}

function plotIncidents() {
  if (!mapRef) return //map not loaded yet do not proceed to plot anything

  incidentLayer.clearLayers() //clear layers to prevent overlaps/errors

  const incidentPlots = []

  //extract all lat,long for incidents
  incidents.value.forEach((incident) => {
    if (typeof incident.location?.lat !== 'number' || typeof incident.location?.lng !== 'number')
      return

    const icon = templatesByType.value[incident.type]?.icon || 'bi-exclamation-circle-fill'
    const colourClass =
      incident.status === 'resolved' ? 'severity-resolved' : `severity-${incident.severity}`

    const pin = leafletRef.divIcon({
      html: `<i class="bi ${icon}"></i>`, // the HTML to show
      className: `incident-pin ${colourClass}`, // a CSS class so you can style it
      iconSize: [32, 32], // width, height in px
    })

    incidentPlots.push([incident.location.lat, incident.location.lng])
    leafletRef
      .marker([incident.location.lat, incident.location.lng], { icon: pin })
      .bindTooltip(templatesByType.value[incident.type]?.label || incident.type, {
        //tooltip will display the icon
        direction: 'top', // 'top' | 'bottom' | 'left' | 'right' | 'auto'
        offset: [0, -16], // lift it above the pin (default marker is 41px tall)
        sticky: false, // true = tooltip follows the cursor instead of anchoring to the pin
      })
      .addTo(incidentLayer)
  })

  // Zoom to fit all markers
  if (incidentPlots.length) mapRef.fitBounds(incidentPlots, { padding: [40, 40] })
}

function onSelect(incident) {
  console.log('selected', incident._id)
}

async function onAcknowledge(incident) {
  try {
    await updateIncidentStatus(incident._id, 'acknowledged')
    incidents.value = await listIncidents()
    plotIncidents()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
}

async function onResolve(incident) {
  try {
    const note = prompt('Please include details on how was it resolved.')
    if (!note) return // if note is empty, it cannot be resolved
    await updateIncidentStatus(incident._id, 'resolved', note)
    incidents.value = await listIncidents()
    plotIncidents()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
}
</script>

<template>
  <section>
    <PageHeader title="Incidents & Alerts" icon="bi-bell" />

    <!-- 1. Alerts strip -->
    <div class="mb-3" data-testid="alerts-panel">
      <!-- <AlertItem v-for="…" /> -->
      <h1>Alert will be here</h1>
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
            :selected="selectedId === incident.id"
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
