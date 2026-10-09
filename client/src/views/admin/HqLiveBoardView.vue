<script setup>
// Feature 3 – Live Movement Tracking (HQ map) — owner: Chin
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import BaseMap from '@/components/BaseMap.vue'
import { SINGAPORE_CENTER } from '@/utils/constants'

// TODO(Chin): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Side list: school, bus, progress bar (checkpoints done / 6), last update time; click → zoom to marker + timeline',
  'Filters: venue, status (not started / en route / seated / returning / done)',
  'data-testids: hq-map, hq-group-list, hq-group-<slotId>, hq-filter-status',
]

const volunteers = ref([])
const loading = ref(true)
const error = ref('')
const searchVolunteer = ref('');
const searchBy = ref('name') // 'name' or 'address'

// Leaflet objects 
let map = null
let L = null
let layer = null
const markers = {} // Each user (_id) will have marker

// Both map and geolocation data are required first
function drawMarkers() {
  if (!map || !L) return
  layer.clearLayers()
  const points = []

  volunteers.value.forEach((v) => {
    points.push([v.lat, v.lng])
    markers[v._id] = L.marker([v.lat, v.lng])
      .bindTooltip(v.name, { direction: 'top', offset: [-15, -15], sticky: false })
      .addTo(layer)
  })

  if (points.length) map.fitBounds(points, { padding: [40, 40] })
}

// Runs once BaseMap has created the map
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  layer = L.layerGroup().addTo(map)
  drawMarkers() // in case the data arrived first
}

let previousVolunteerFound = undefined; // Store previous volunteer object found
// Zoom in to a specific volunteer
function focusVolunteer(v) {
  if (!v) {
    // Reset map if no volunteer match search result
    map.flyTo(SINGAPORE_CENTER, 10, {
        animate: true,
        duration: 0.5 // Animation duration in seconds
    });
    
    // Close all existing tooltip above markers
    Object.values(markers).forEach((marker) => marker.closeTooltip())
    previousVolunteerFound = undefined; // Reset the previous volunteer found since no result
    return
  } 

  // Stop function when the same volunteer is found
  if (previousVolunteerFound === v) return

  // If new volunteer result found:
  // Set previousVolunteerFound and Zoom to volunteer geolocation
  previousVolunteerFound = v;
  map.flyTo([v.lat, v.lng], 17, {
      animate: true,
      duration: 1.5 // Animation duration in seconds
  });
  markers[v._id]?.openTooltip() // Force open pop up display for name
}

const searchLabel = computed(() => (searchBy.value === 'name' ? 'Name' : 'Address'))

// Return search result whenever 'Search Volunteer' input changes
const searchResult = computed(() => {
    const q = searchVolunteer.value.trim().toLowerCase()
    if (!q) return undefined
    return volunteers.value.find((u) => (u[searchBy.value] ?? '').toLowerCase().includes(q))
})

// Zoom to the match whenever search input changes
function onSearchInput() {
  focusVolunteer(searchResult.value)
}

// Update the searchBy reactive value ('name' or 'address')
function setSearchBy(field) {
  searchBy.value = field
  if (searchVolunteer.value){
    onSearchInput()
  }
}

onMounted(async () => {
  try {
    const res = await axios.get('/api/users/locations')
    volunteers.value = res.data
    drawMarkers() // Display markers for each volunteer (based on geolocation)
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
    <FeaturePlaceholder feature="Feature 3 – Live Movement Tracking (HQ map)" owner="Chin" :todos="todos" />
    <!-- Suggested layout: map 8 cols + list 4 cols on desktop; list under map on mobile -->
  </section>
  <div class="row">
    <div class="col-xl-4 col-lg-4 mb-3">
      <ul class="list-group mb-3">
        <li class="list-group-item">School:</li>
        <li class="list-group-item">Bus:</li>
        <li class="list-group-item">Checkpoints: 4/6</li>
        <li class="list-group-item">Last Updated: </li>
      </ul>

      <div class="">
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
              <a class="dropdown-item" :class="{ active: searchBy === 'name' }" href="#"
                @click.prevent="setSearchBy('name')">Name</a>
            </li>
            <li>
              <a class="dropdown-item" :class="{ active: searchBy === 'address' }" href="#"
                @click.prevent="setSearchBy('address')">Address</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="col-xl-8 col-lg-8 col-md-12">
      <BaseMap @ready="onMapReady" />
    </div>
  </div>
</template>
