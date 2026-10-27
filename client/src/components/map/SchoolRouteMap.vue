<script setup>
// Directions from the volunteer's home to their school (My Assignment page).
// Uses the shared BaseMap, the same markers as the Tracking page, and the server's OneMap route: GET /api/users/route.
//
// Usage: <SchoolRouteMap :home="{ lat, lng }" :school="{ lat, lng, name }" />
import { ref, computed, onBeforeUnmount } from 'vue'
import axios from 'axios'
import polyline from '@mapbox/polyline'
import BaseMap from '@/components/map/BaseMap.vue'
import MapLoading from '@/components/map/MapLoading.vue'
import { createDotIcon, createSchoolIcon, createRouteLabelIcon, tipCard, bindTip } from '@/utils/map-icons'

const props = defineProps({
  home: { type: Object, required: true }, // { lat, lng }
  school: { type: Object, required: true }, // { lat, lng, name }
})

const MODES = [
  { key: 'drive', label: 'Drive', icon: 'bi-car-front-fill', google: 'driving' },
  { key: 'walk', label: 'Walk', icon: 'bi-person-walking', google: 'walking' },
]
const mode = ref('drive')
const loading = ref(false)
const error = ref('')
const info = ref(null) // { minutes, km }

// Opens Google Maps for turn-by-turn directions with the same start, end and travel mode
const googleMapsUrl = computed(() => {
  const travel = MODES.find((m) => m.key === mode.value).google
  return `https://www.google.com/maps/dir/?api=1&origin=${props.home.lat},${props.home.lng}&destination=${props.school.lat},${props.school.lng}&travelmode=${travel}`
})

let map = null
let L = null
let routeLayer = null // holds the route line + "xx min" pill, cleared before each new route

async function drawRoute() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.get('/api/users/route', {
      params: {
        startLat: props.home.lat,
        startLng: props.home.lng,
        endLat: props.school.lat,
        endLng: props.school.lng,
        routeType: mode.value,
      },
      timeout: 15000,
    })
    if (!map) return // popup was closed while waiting

    const coords = polyline.decode(data.route_geometry)
    const minutes = Math.round(data.route_summary.total_time / 60)
    routeLayer.clearLayers()
    const line = L.polyline(coords, { color: '#2563eb', weight: 4 }).addTo(routeLayer)
    L.marker(coords[Math.floor(coords.length / 2)], { icon: createRouteLabelIcon(minutes), interactive: false }).addTo(routeLayer)
    map.fitBounds(line.getBounds(), { padding: [40, 40] })
    info.value = { minutes, km: (data.route_summary.total_distance / 1000).toFixed(1) }
  } catch (err) {
    routeLayer?.clearLayers()
    info.value = null
    error.value = err.response?.data?.message || 'Could not get directions. Try again, or use Google Maps below.'
  } finally {
    loading.value = false
  }
}

function setMode(key) {
  mode.value = key
  drawRoute()
}

// BaseMap is ready: add Home and the school, zoom to show both, then load the route
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  routeLayer = L.layerGroup().addTo(map)
  const homeMarker = L.marker([props.home.lat, props.home.lng], { icon: createDotIcon() }).addTo(map)
  const schoolMarker = L.marker([props.school.lat, props.school.lng], { icon: createSchoolIcon() }).addTo(map)
  bindTip(homeMarker, tipCard({ icon: 'bi-house-door-fill', tone: 'me', title: 'Home' }))
  bindTip(schoolMarker, tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: props.school.name || 'School' }))
  map.fitBounds([[props.home.lat, props.home.lng], [props.school.lat, props.school.lng]], { padding: [40, 40] })
  drawRoute()
}

onBeforeUnmount(() => {
  map = null
})
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
      <div class="btn-group btn-group-sm" role="group" aria-label="Travel mode">
        <button
          v-for="m in MODES"
          :key="m.key"
          type="button"
          class="btn"
          :class="mode === m.key ? 'btn-primary' : 'btn-outline-primary'"
          :aria-pressed="mode === m.key"
          :disabled="loading"
          :data-testid="`route-mode-${m.key}`"
          @click="setMode(m.key)"
        >
          <i class="bi me-1" :class="m.icon" aria-hidden="true"></i>{{ m.label }}
        </button>
      </div>
      <div v-if="info" data-testid="route-summary">
        <strong>{{ info.minutes }} min</strong>
        <span class="text-muted-hw"> · {{ info.km }} km</span>
      </div>
    </div>

    <div class="map-stage">
      <BaseMap :zoom="13" testid="school-route-map" @ready="onMapReady" />
      <!-- NEW: <Transition> makes the overlay fade in/out instead of popping -->
      <Transition name="loading-fade">
        <MapLoading v-if="loading" text="Finding the route..." />
      </Transition>
    </div>
    <p v-if="error" class="text-danger small mt-2 mb-0" role="alert">{{ error }}</p>

    <a
      class="btn btn-outline-secondary btn-sm w-100 mt-2"
      :href="googleMapsUrl"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="route-google-maps"
    >
      <i class="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i> Turn-by-turn in Google Maps
    </a>
  </div>
</template>

<style scoped>
/* MapLoading covers this box. The map needs its own height inside the popup. */
.map-stage {
  position: relative;
}
.map-stage :deep(.map-container) {
  height: 380px;
}
@media (max-width: 576px) {
  .map-stage :deep(.map-container) {
    height: 300px;
  }
}
</style>
