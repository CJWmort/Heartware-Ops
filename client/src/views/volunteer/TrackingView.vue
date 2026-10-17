<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import BaseMap from '@/components/BaseMap.vue'
import axios from 'axios'
import polyline from '@mapbox/polyline'
import { VENUES } from '@/utils/constants'
import { getUserLocation, geolocationMessage } from '@/utils/geolocation'

// Vue state
const loading = ref(true)
const error = ref('')
const location = ref(null) // stores { lat, lng, accuracy } fetched from device
const routeInfo = ref(null) // { minutes, km }

// Leaflet objects
let map = null
let L = null
let volunteerLayer = null
let pinIcon = null
let myMarker = null
let destMarker = null
let routeLine = null

// Map: Create teardrop marker
function createPinIcon(color = '#2563eb', iconClass = 'bi-person-fill') {
  return L.divIcon({
    className: 'user-pin',
    html: `
      <div class="user-pin-inner">
        <svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true">
          <path d="M20 50 C20 50 38 32 38 19 A18 18 0 1 0 2 19 C2 32 20 50 20 50 Z"
                fill="${color}" stroke="#fff" stroke-width="2" />
        </svg>
        <i class="bi ${iconClass}"></i>
      </div>`,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    tooltipAnchor: [0, -63],
  })
}

// Runs once BaseMap has created the map
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  volunteerLayer = L.layerGroup().addTo(map)
  pinIcon = createPinIcon()

  destMarker = L.marker([VENUES['Padang'].lat, VENUES['Padang'].lng], {
    icon: createPinIcon('#dc2626', 'bi-flag-fill'),
    opacity: 0.8,
  })
    .bindTooltip('Padang', { direction: 'top', sticky: false })
    .addTo(volunteerLayer)

  drawMyMarker()
  drawRoute()
}

// Current volunteer marker
function drawMyMarker() {
  if (!map || !location.value) return

  const { lat, lng } = location.value

  if (!myMarker) {
    myMarker = L.marker([lat, lng], { icon: pinIcon })
      .bindTooltip('Me', { direction: 'top', sticky: false })
      .addTo(volunteerLayer)
  } else {
    myMarker.setLatLng([lat, lng])
  }

  map.setView([lat, lng], 16)
}

// Plot the travel route from Volunteer's current location to Padang (depends on 'routeType')
async function drawRoute() {
  if (!map || !location.value) return

  routeLine?.remove()
  routeLine = null
  routeInfo.value = null
  error.value = ''
  loadingRoute.value = true // show overlay

  const requestId = ++routeRequestId
  const { lat, lng } = location.value

  try {
    const res = await axios.get('/api/users/route', {
      params: {
        startLat: lat,
        startLng: lng,
        endLat: VENUES['Padang'].lat,
        endLng: VENUES['Padang'].lng,
        routeType: travelMode.value,
      },
    })

    if (requestId !== routeRequestId) return

    const coords = polyline.decode(res.data.route_geometry)
    routeLine = L.polyline(coords, { color: '#2563eb', weight: 4 }).addTo(map)
    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] })

    const s = res.data.route_summary
    routeInfo.value = {
      minutes: Math.round(s.total_time / 60),
      km: (s.total_distance / 1000).toFixed(1),
    }
  } catch (err) {
    if (requestId !== routeRequestId) return
    error.value = err.response?.data?.message || 'Could not load route.'
  } finally {
    // Only hide the loading overlay if this is still the latest request.
    // If a newer one is incoming, keeps the overlay on.
    if (requestId === routeRequestId) loadingRoute.value = false
  }
}

// Just to showcase routing between different travel modes
const travelMode = ref('drive') // starting mode
const loadingRoute = ref(false)

const MODES = [
  { key: 'drive', label: 'Drive', icon: 'bi-car-front-fill', verb: 'Driving' },
  { key: 'cycle', label: 'Cycle', icon: 'bi-bicycle', verb: 'Cycling' },
  { key: 'walk', label: 'Walk', icon: 'bi-person-walking', verb: 'Walking' },
]
const activeMode = computed(() => MODES.find((m) => m.key === travelMode.value))

let routeRequestId = 0 // guards against slow responses overwriting newer ones

function setTravelMode(mode) {
  if (mode === travelMode.value) return
  travelMode.value = mode
  drawRoute()
}

// Fetch volunteer geolocation data on page load then draw markers
onMounted(async () => {
  try {
    const pos = await getUserLocation()
    location.value = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy, // metres
    }
    drawMyMarker() // in case the map was ready first
    drawRoute() // display the route from start (volunteer) to end (padang)
  } catch (err) {
    error.value = geolocationMessage(err)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section>
    <PageHeader title="Event day" icon="bi-signpost-split" />
    <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
  </section>

  <div class="row">
    <div class="col-xl-4 col-lg-4 mb-3">
      <ul class="list-group mb-3">
        <li class="list-group-item">School: ?</li>
        <li class="list-group-item">Bus: ?</li>
        <li class="list-group-item">Checkpoints: ?/6</li>
        <li class="list-group-item">Last Updated: ?</li>
      </ul>

      <div>
        <p v-if="loading" class="text-muted-hw">Loading current position...</p>
        <p v-else-if="!location" class="text-muted-hw">No location found.</p>
      </div>
    </div>

    <div class="col-xl-8 col-lg-8 col-md-12">
      <div class="btn-group mb-2" role="group" aria-label="Travel mode">
        <button
          v-for="m in MODES"
          :key="m.key"
          type="button"
          class="btn"
          :class="travelMode === m.key ? 'btn-primary' : 'btn-outline-primary'"
          @click="setTravelMode(m.key)"
          :disabled="loadingRoute"
        >
          <i class="bi" :class="m.icon"></i> {{ m.label }}
        </button>
      </div>

      <div v-if="routeInfo" class="list-group-item mb-2">
        {{ activeMode.verb }} to Padang: {{ routeInfo.minutes }} min · {{ routeInfo.km }} km
      </div>

      <div class="map-wrap position-relative">
        <BaseMap @ready="onMapReady" />

        <div v-if="loadingRoute" class="map-loading" role="status" aria-live="polite">
          <div class="spinner-border text-primary" aria-hidden="true"></div>
          <div class="mt-2 fw-semibold">Fetching Routes...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Marker css styling */
:global(.user-pin-inner) {
  position: relative;
  width: 30px;
  height: 52px;
  transform-origin: 50% 100%;
  transition: transform 0.15s;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35));
}

:global(.user-pin-inner:hover) {
  transform: scale(1.15);
}

:global(.user-pin-inner i) {
  position: absolute;
  top: 0;
  left: 0;
  width: 40px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.25rem;
}

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 1100; /* above Leaflet panes and zoom controls */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6);
  backdrop-filter: grayscale(1);
  border-radius: inherit;
}
</style>
