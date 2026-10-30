<!-- The shared Leaflet map used by every map page: it creates the map, the base tiles and the zoom
     limits, and tells the parent when it is ready. -->

<script setup>
// Creates the Leaflet map on mount, works out the minimum zoom so the map always fills the box, and
// removes the map on leave.

import { onMounted, onBeforeUnmount, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@/assets/map-ui.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { SINGAPORE_CENTER } from '@/utils/constants'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const props = defineProps({
  center: { type: Object, default: () => SINGAPORE_CENTER },
  zoom: { type: Number, default: 16 },
  testid: { type: String, default: 'map' },
  fillBounds: { type: Boolean, default: true },
})
const emit = defineEmits(['ready'])

const el = ref(null)
let map = null
let resizeObserver = null

// onMounted - builds the map. 1) create the Leaflet map in the div and set the start view 2) add the
// OneMap tile layer (zoom 11 to 19, retina aware, with the required OneMap attribution) 3) set a
// Singapore bounding box as the hard pan limit (maxBoundsViscosity 1 = cannot drag outside) 4) work
// out the minimum zoom 5) recalculate it on resize 6) start a ResizeObserver that calls invalidateSize
// so tiles redraw when the box changes size 7) emit "ready" so the parent can add markers, circles and
// lines.
onMounted(() => {
  map = L.map(el.value).setView([props.center.lat, props.center.lng], props.zoom)
  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
    detectRetina: true,
    maxZoom: 19,
    minZoom: 11,
    attribution:
      '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>',
  }).addTo(map)

  const MAINLAND_SG = L.latLngBounds([1.235, 103.59], [1.475, 104.05])
  map.setMaxBounds(MAINLAND_SG)
  map.options.maxBoundsViscosity = 1.0

  const BASE_MIN_ZOOM = 11
  // fitMinZoom() - 1) ask Leaflet which zoom makes the Singapore box cover the whole view 2) if
  // fillBounds is on set the minimum zoom to the larger of that and 11, otherwise to 11. On tall phone
  // screens this raises the minimum so no grey edge appears.
  function fitMinZoom() {
    const fillZoom = map.getBoundsZoom(MAINLAND_SG, true)
    map.setMinZoom(props.fillBounds ? Math.max(BASE_MIN_ZOOM, fillZoom) : BASE_MIN_ZOOM)
  }
  fitMinZoom()
  map.on('resize', fitMinZoom)

  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(el.value)

  emit('ready', map, L)
})

// onBeforeUnmount - when the component goes away: stop the ResizeObserver and remove the Leaflet map
// (frees its events and memory).
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
})
</script>

<template>
  <!-- One div that Leaflet draws into. -->
  <div ref="el" class="map-container" :data-testid="testid"></div>
</template>

<style scoped>
/* Styles for the map container and the light map look. */

.map-container :deep(.leaflet-control-attribution) {
  max-width: calc(100vw - 20px);
  padding: 2px 8px;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.75);
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  font-size: 10px;
  line-height: 1.5;
  color: #555;
}

.map-container :deep(.leaflet-control-attribution a) {
  color: #555;
  text-decoration: none;
}

.map-container :deep(.leaflet-control-attribution a:hover) {
  color: #1a73e8;
  text-decoration: underline;
}

.map-container :deep(.leaflet-control-attribution img) {
  height: 12px !important;
  width: 12px !important;
  vertical-align: -2px;
}
</style>
