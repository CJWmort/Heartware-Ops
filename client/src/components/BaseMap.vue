<script setup>
// Reusable Leaflet map with the OneMap basemap (F1b allocation map, F2 radius map, F3 HQ live board, F4 incident map).
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

// Stop Leaflet from guessing the image path, then point it at the bundled assets
delete L.Icon.Default.prototype._getIconUrl
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
  // OneMap basemap (Singapore Land Authority). Docs: https://www.onemap.gov.sg/docs/maps/
  // Styles: Default, Original, Grey, GreyLite, Night, LandLot – swap "Original" in the URL.
  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Original/{z}/{x}/{y}.png', {
    detectRetina: true,
    maxZoom: 19,
    minZoom: 11,
    /** DO NOT REMOVE the OneMap attribution below **/
    attribution:
      '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>',
  }).addTo(map)

  // OneMap only covers Singapore – stop users panning off the map
  // Mainland Singapore only – Tuas (west) to Changi (east), Southern coast to Woodlands (north)
  const MAINLAND_SG = L.latLngBounds([1.235, 103.59], [1.475, 104.05])
  map.setMaxBounds(MAINLAND_SG)
  map.options.maxBoundsViscosity = 1.0 // 1.0 = hard edge, can't drag outside at all
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
