<script setup>
// Reusable Leaflet map (F1b allocation map, F2 radius map, F3 HQ live board).
// Leaflet docs: https://leafletjs.com/reference.html
//
// Usage:
//   <BaseMap :center="{ lat: 1.35, lng: 103.82 }" :zoom="11" @ready="onMapReady" />
//   function onMapReady(map, L) { L.marker([lat, lng]).addTo(map) }
//
// The parent gets the Leaflet `map` and `L` objects via @ready and adds its own
// markers / circles / lines – this component only creates and cleans up the map.
import { onMounted, onBeforeUnmount, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { SINGAPORE_CENTER } from '@/utils/constants'

// Fix Leaflet's default marker images, which break when bundled by Vite
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const props = defineProps({
  center: { type: Object, default: () => SINGAPORE_CENTER },
  zoom: { type: Number, default: 11 },
  testid: { type: String, default: 'map' },
})
const emit = defineEmits(['ready'])

const el = ref(null)
let map = null

onMounted(() => {
  map = L.map(el.value).setView([props.center.lat, props.center.lng], props.zoom)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  emit('ready', map, L)
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div ref="el" class="map-container" :data-testid="testid"></div>
</template>
