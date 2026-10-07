<script setup>
// Feature 3 – Live Movement Tracking (HQ map) — owner: Chin
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { onMounted } from 'vue' 
import axios from 'axios'
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import BaseMap from '@/components/BaseMap.vue'
// TEMP: volunteers' home locations as placeholder pins.
// TODO(Chin): replace with getLiveBoard() group positions; move mock data to client/src/mocks/.
import volunteers from '../../../../server/data/mock-volunteers.json'

// TODO(Chin): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Event picker; getLiveBoard() every 30s (or live via socket "tracking:update")',
  'BaseMap with one marker per group, coloured by latest checkpoint; venue markers',
  'Side list: school, bus, progress bar (checkpoints done / 6), last update time; click → zoom to marker + timeline',
  'Filters: venue, status (not started / en route / seated / returning / done)',
  'data-testids: hq-map, hq-group-list, hq-group-<slotId>, hq-filter-status',
]

async function getLiveBoard() {
  try {
    
  } catch (error) {
    console.log(error);
  }
}

async function getRouting(){
  const START_POINT = '1.319728%2C103.8421';
  const END_POINT = '1.319728905%2C103.8421581';
  const ROUTE_TYPE = ['walk', 'drive', 'cycle'];
  
  // ⚠️ TODO(security): hard-coded OneMap token – visible to anyone in the browser/GitHub and expires in ~3 days.
  //    Move to the server: store OneMap email/password in server/config.env, add a server endpoint that gets the
  //    token + calls routing, and have this page call our API instead. Do NOT commit new tokens here.
  const authToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyNjM1NCwiZm9yZXZlciI6ZmFsc2UsImlzcyI6Ik9uZU1hcCIsImlhdCI6MTc5MTE3NjA1NiwibmJmIjoxNzkxMTc2MDU2LCJleHAiOjE3OTE0MzUyNTYsImp0aSI6IjUyOGQ3ZTY2LTEyYmUtNDY2Mi04ZWI1LTU1YTIxZmZiZjlmNCJ9.cyqcBAyFEzHua4jgd-PddfKm4ybICoc3RTpWQ4-e6KzYozOBAWJg3lJetNh8UVdyV0cpl-dmcnwWratI8WiSIhG0iXXK9jD4QdRt5JVxzODXbQCDJ-nSuVZpuhqGhqSBmXNID8CoI08O5gLNvoq5MxhvFTbp4QYMl5XIrgKbKKyp4UVpgGC2dSs79FSxHPysyWnbdlsAL9jz3fENka2pXLVZ65e2es5KJEAvYkYBlDsz8tbK7ZnTjrPAoSS-c6OfYZwyZyTtbPPOXybsr5msfgyVI5BO2GH5hm_oDCadPExTwIzfrL0n7RsWh7Bc612OvhZ7F9bK5MMJLZAmRjah-Q';

  try {
    const url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${START_POINT}&end=${END_POINT}&routeType=${ROUTE_TYPE[0]}`;
    const res = await axios.get(url, {
      headers: {
        'Authorization': authToken,
      }
    })
    console.log(res.data)

  } catch (error) {
    console.log(error);
  }
}

// Runs once BaseMap has created the map
function onMapReady(map, L) {
  const volunteerLayer = L.layerGroup().addTo(map)
  const points = []

  volunteers.forEach((v) => {
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number') return
    points.push([v.lat, v.lng])
    L.marker([v.lat, v.lng])
      .bindTooltip(v.name, {
        direction: 'top', // 'top' | 'bottom' | 'left' | 'right' | 'auto'
        offset: [0, -30], // lift it above the pin (default marker is 41px tall)
        sticky: false, // true = tooltip follows the cursor instead of anchoring to the pin
      })
      .addTo(volunteerLayer)
  })

  // Zoom to fit all markers
  if (points.length) map.fitBounds(points, { padding: [40, 40] })
}

onMounted(getRouting)


</script>

<template>
  <section>
    <PageHeader title="Live board" icon="bi-broadcast" />
    <FeaturePlaceholder feature="Feature 3 – Live Movement Tracking (HQ map)" owner="Chin" :todos="todos" />
    <!-- Suggested layout: map 8 cols + list 4 cols on desktop; list under map on mobile -->
  </section>
  <div class="row">
    <div class="col-xl-4 col-lg-4 mb-3">
      <ul class="list-group">
        <li class="list-group-item">School:</li>
        <li class="list-group-item">Bus:</li>
        <li class="list-group-item">Checkpoints: 4/6</li>
        <li class="list-group-item">Last Updated: </li>
      </ul>
    </div>
    <div class="col-xl-8 col-lg-8 col-md-12 col-sm-12">
      <BaseMap testid="hq-map" @ready="onMapReady" />
    </div>
  </div>
</template>
