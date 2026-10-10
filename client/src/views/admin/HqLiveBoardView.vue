<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import PageHeader from '@/components/PageHeader.vue'
import BaseMap from '@/components/BaseMap.vue'
import { VENUES, SINGAPORE_CENTER, INNER_RING, OUTER_RING } from '@/utils/constants'

// Vue state
const volunteers = ref([])
const loading = ref(true)
const error = ref('')
const searchVolunteer = ref('')
const searchBy = ref('name') // 'name' or 'address'

// Leaflet objects
let map = null
let L = null
let zoneLayer = null
let volunteerLayer = null
let pinIcon = null
const markers = {} // volunteer _id: marker

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
  zoneLayer = L.layerGroup().addTo(map)
  volunteerLayer = L.layerGroup().addTo(map)
  pinIcon = createPinIcon()

  drawZones()
  drawMarkers()
}

// Map: Drawing zones (inner + outer)
function drawZones() {
  zoneLayer.clearLayers()

  L.polygon(OUTER_RING, {
    color: '#6C757D',
    weight: 1.5,
    fillColor: '#3b82f6',
    fillOpacity: 0.1,
  }).addTo(zoneLayer)

  L.polygon(INNER_RING, {
    color: '#0d6efd',
    weight: 1.5,
    fillColor: '#0d6efd',
    fillOpacity: 0.1,
  }).addTo(zoneLayer)
}

// Map: Drawing markers
function drawMarkers() {
  if (!map) return // Stop drawing markers if no map found

  volunteerLayer.clearLayers()
  Object.keys(markers).forEach((id) => delete markers[id]) // Clear all markers

  const points = []
  volunteers.value.forEach((v) => {
    points.push([v.lat, v.lng])
    markers[v._id] = L.marker([v.lat, v.lng], { icon: pinIcon })
      .bindTooltip(v.name, { direction: 'top', sticky: false })
      .addTo(volunteerLayer)
  })
}

// Map: reset tooltips
function closeAllTooltips() {
  Object.values(markers).forEach((marker) => marker.closeTooltip())
}

// Map: reset zoom
function resetView() {
  closeAllTooltips()
  map.flyTo(SINGAPORE_CENTER, 10, { animate: true, duration: 0.5 })
}

// Map: focus volunteer
function focusVolunteer(v) {
  closeAllTooltips()
  map.flyTo([v.lat, v.lng], 17, { animate: true, duration: 1.5 })
  markers[v._id]?.openTooltip()
}

// Search volunteers by 'name' / 'address'
const searchLabel = computed(() => (searchBy.value === 'name' ? 'Name' : 'Address'))

const searchResult = computed(() => {
  const q = searchVolunteer.value.trim().toLowerCase()
  if (!q) return undefined
  return volunteers.value.find((u) => (u[searchBy.value] ?? '').toLowerCase().includes(q))
})

let lastMatchId = null // so typing more letters of the same match doesn't re-fly the map >> i am pushing main again

function onSearchInput() {
  const match = searchResult.value

  if (!match) {
    if (lastMatchId) resetView() // only reset if we had zoomed somewhere
    lastMatchId = null
    return
  }

  if (match._id === lastMatchId) return
  lastMatchId = match._id
  focusVolunteer(match)
}

function setSearchBy(field) {
  searchBy.value = field
  if (searchVolunteer.value) onSearchInput()
}

// Fetch volunteer geolocation data on page load then draw markers
onMounted(async () => {
  try {
    const res = await axios.get('/api/users/locations')
    volunteers.value = res.data
    drawMarkers()
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load volunteers.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section>
    <PageHeader title="Live board" icon="bi-broadcast" />
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
        <p v-if="loading" class="text-muted-hw">Loading volunteers…</p>
        <p v-else-if="!volunteers.length" class="text-muted-hw">No volunteer locations yet.</p>

        <div class="input-group mb-3">
          <input
            v-model="searchVolunteer"
            class="form-control"
            :placeholder="`Search volunteers by ${searchBy}...`"
            @input="onSearchInput"
          />
          <button
            class="btn btn-outline-secondary dropdown-toggle"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            {{ searchLabel }}
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li>
              <a
                class="dropdown-item"
                :class="{ active: searchBy === 'name' }"
                href="#"
                @click.prevent="setSearchBy('name')"
                >Name</a
              >
            </li>
            <li>
              <a
                class="dropdown-item"
                :class="{ active: searchBy === 'address' }"
                href="#"
                @click.prevent="setSearchBy('address')"
                >Address</a
              >
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="col-xl-8 col-lg-8 col-md-12">
      <!-- Zoom to Padang by defining prop values being sent to BaseMap component -->
      <BaseMap :center="VENUES['Padang']" :zoom="13" testid="hq-map" @ready="onMapReady" />
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
