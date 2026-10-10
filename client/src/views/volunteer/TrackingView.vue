<script setup>
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import BaseMap from '@/components/BaseMap.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { getUserLocation, geolocationMessage } from '@/utils/geolocation'

const todos = [
  'Big vertical stepper of the 6 checkpoints (CHECKPOINTS / CHECKPOINT_LABELS in utils/constants.js)',
  'Only the NEXT checkpoint is tappable; tap → get location (navigator.geolocation) → checkIn()',
  'While this page is open: sendPing() every PING_INTERVAL_MS; keep screen awake (navigator.wakeLock)',
  'Status strip: "Last location sent 2 min ago", GPS accuracy, offline warning',
  'Quick link to Report incident (Feature 4)',
  'data-testids: checkpoint-<NAME>, checkpoint-next, tracking-last-ping, tracking-error',
]

// Vue state
const loading = ref(true)
const error = ref('')
const location = ref(null) // stores { lat, lng, accuracy } fetched from device

// Leaflet objects
let map = null
let L = null
let volunteerLayer = null
let pinIcon = null
let myMarker = null

// Map: Create teardrop marker (with user icon)
function createPinIcon() {
  return L.divIcon({
    className: 'user-pin',
    html: `
      <div class="user-pin-inner">
        <svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true">
          <path d="M20 50 C20 50 38 32 38 19 A18 18 0 1 0 2 19 C2 32 20 50 20 50 Z"
                fill="#2563eb" stroke="#fff" stroke-width="2" />
        </svg>
        <i class="bi bi-person-fill"></i>
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

  drawMyMarker() // in case the location data arrived before the map
}

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

// function getUserLocation() {
//   return new Promise((resolve, reject) => {
//     if (!navigator.geolocation) {
//       reject(new Error('Geolocation is not supported by your browser.'))
//       return
//     }
//     navigator.geolocation.getCurrentPosition(resolve, reject, {
//       enableHighAccuracy: true, // use GPS if available
//       timeout: 10000,
//       maximumAge: 0, // always fetch fresh location
//     })
//   })
// }

// function geolocationMessage(err) {
//   switch (err.code) {
//     case err.PERMISSION_DENIED:
//       return 'Location permission was denied. Allow it in your browser settings and reload.'
//     case err.POSITION_UNAVAILABLE:
//       return 'Location information is unavailable.'
//     case err.TIMEOUT:
//       return 'Getting your location timed out. Try again.'
//     default:
//       return err.message || 'Could not get your location.'
//   }
// }

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
    <FeaturePlaceholder
      feature="Feature 3 - Live Movement Tracking (volunteer side)"
      owner="Chin"
      :todos="todos"
    />
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
      <BaseMap @ready="onMapReady" />
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
</style>
