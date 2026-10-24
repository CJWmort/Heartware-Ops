<script setup>
// Directions from the volunteer's home to their allocated school (My Assignment page).
// Reuses the shared map pieces: BaseMap (OneMap basemap), the same markers / tooltips / "xx min" route label as
// the Tracking page (utils/map-icons.js), and the server's OneMap routing endpoint GET /api/users/route.
//
// Usage: <SchoolRouteMap :home="{ lat, lng }" :school="{ lat, lng, name, address }" />
import { ref, computed, onBeforeUnmount } from 'vue'
import axios from 'axios'
import polyline from '@mapbox/polyline'
import BaseMap from '@/components/map/BaseMap.vue'
import MapLoading from '@/components/map/MapLoading.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import {
  createDotIcon,
  createSchoolIcon,
  createRouteLabelIcon,
  tipCard,
  bindTip,
} from '@/utils/map-icons'

const props = defineProps({
  home: { type: Object, required: true }, // { lat, lng }
  school: { type: Object, required: true }, // { lat, lng, name, address }
})

// Same two travel modes as the Tracking page
const MODES = [
  { key: 'drive', label: 'Drive', icon: 'bi-car-front-fill', google: 'driving' },
  { key: 'walk', label: 'Walk', icon: 'bi-person-walking', google: 'walking' },
]
const travelMode = ref('drive')
const loading = ref(false)
const notice = ref(null) // { type, icon, title, text } shown on the map when the route fails
const info = ref(null) // { minutes, km } of the current route

// Turn-by-turn in Google Maps (opens in a new tab), for when they are actually on the way
const googleMapsUrl = computed(() => {
  const mode = MODES.find((m) => m.key === travelMode.value).google
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${props.home.lat},${props.home.lng}` +
    `&destination=${props.school.lat},${props.school.lng}` +
    `&travelmode=${mode}`
  )
})

let map = null
let L = null
let routeLine = null
let routeLabel = null
let requestId = 0 // a slow answer for an old mode must not replace the current one

// Halfway along the route (by length), where the "xx min" pill sits
function midpoint(coords) {
  if (coords.length < 2) return coords[0]
  const seg = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
    seg.push(d)
    total += d
  }
  let walked = 0
  for (let i = 0; i < seg.length; i++) {
    if (walked + seg[i] >= total / 2) {
      const t = seg[i] === 0 ? 0 : (total / 2 - walked) / seg[i]
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
      ]
    }
    walked += seg[i]
  }
  return coords[coords.length - 1]
}

function clearRoute() {
  routeLine?.remove()
  routeLabel?.remove()
  routeLine = null
  routeLabel = null
}

async function drawRoute() {
  if (!map) return
  const id = ++requestId
  loading.value = true
  notice.value = null
  try {
    const res = await axios.get('/api/users/route', {
      params: {
        startLat: props.home.lat,
        startLng: props.home.lng,
        endLat: props.school.lat,
        endLng: props.school.lng,
        routeType: travelMode.value,
      },
      timeout: 15000,
    })
    if (id !== requestId || !map) return // the mode changed or the popup closed meanwhile

    const coords = polyline.decode(res.data.route_geometry)
    const minutes = Math.round(res.data.route_summary.total_time / 60)
    clearRoute()
    routeLine = L.polyline(coords, { color: '#2563eb', weight: 4 }).addTo(map)
    routeLabel = L.marker(midpoint(coords), { icon: createRouteLabelIcon(minutes), interactive: false }).addTo(map)
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] })
    info.value = { minutes, km: (res.data.route_summary.total_distance / 1000).toFixed(1) }
  } catch (err) {
    if (id !== requestId) return
    clearRoute()
    info.value = null
    // Still show both places so the volunteer can see where the school is
    map?.fitBounds(L.latLngBounds([props.home, props.school]), { padding: [40, 40] })
    notice.value = {
      type: 'error',
      icon: 'bi-sign-turn-right',
      title: 'No route right now',
      text: err.response?.data?.message || 'Could not get directions. Try again, or open Google Maps below.',
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}

function setMode(mode) {
  if (mode === travelMode.value || loading.value) return
  travelMode.value = mode
  drawRoute()
}

// BaseMap is ready: put Home and the school on the map, then fetch the route
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  const homeMarker = L.marker([props.home.lat, props.home.lng], { icon: createDotIcon() }).addTo(map)
  bindTip(homeMarker, tipCard({ icon: 'bi-house-door-fill', tone: 'me', title: 'Home' }))
  const schoolMarker = L.marker([props.school.lat, props.school.lng], { icon: createSchoolIcon() }).addTo(map)
  // hover / tap only: a pinned label would cover the route and its "xx min" pill
  bindTip(schoolMarker, tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: props.school.name || 'School' }))
  map.fitBounds(L.latLngBounds([props.home, props.school]), { padding: [40, 40] })
  drawRoute()
}

onBeforeUnmount(() => {
  requestId++ // ignore any answer that arrives after the popup closed
  map = null
})
</script>

<template>
  <div class="route-map">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
      <div class="btn-group btn-group-sm" role="group" aria-label="Travel mode">
        <button
          v-for="m in MODES"
          :key="m.key"
          type="button"
          class="btn"
          :class="travelMode === m.key ? 'btn-primary' : 'btn-outline-primary'"
          :aria-pressed="travelMode === m.key"
          :disabled="loading"
          :data-testid="`route-mode-${m.key}`"
          @click="setMode(m.key)"
        >
          <i class="bi me-1" :class="m.icon" aria-hidden="true"></i>{{ m.label }}
        </button>
      </div>
      <div v-if="info" class="route-summary" data-testid="route-summary">
        <strong>{{ info.minutes }} min</strong>
        <span class="text-muted-hw"> · {{ info.km }} km</span>
      </div>
    </div>

    <div class="map-stage">
      <BaseMap :zoom="13" testid="school-route-map" @ready="onMapReady" />
      <MapLoading v-if="loading" text="Finding the route..." />
      <MapNotice :notice="notice" @close="notice = null" />
    </div>

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
/* MapLoading and MapNotice are positioned against this box */
.map-stage {
  position: relative;
  --notice-top: 12px;
}
/* Give the map a fixed height inside the popup (the shared .map-container height does not apply here) */
.map-stage :deep(.map-container) {
  height: 380px;
}
@media (max-width: 576px) {
  .map-stage :deep(.map-container) {
    height: 300px;
  }
}
.route-summary {
  font-variant-numeric: tabular-nums;
}
</style>
