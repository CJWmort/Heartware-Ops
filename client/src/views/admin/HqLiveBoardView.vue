<script setup>
// Feature 3 – Live Movement Tracking (HQ map) — owner: Chin
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { onMounted } from 'vue' 
import axios from 'axios'
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import BaseMap from '@/components/BaseMap.vue'

// TODO(Chin): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Event picker; getLiveBoard() every 30s (or live via socket "tracking:update")',
  'BaseMap with one marker per group, coloured by latest checkpoint; venue markers',
  'Side list: school, bus, progress bar (checkpoints done / 6), last update time; click → zoom to marker + timeline',
  'Filters: venue, status (not started / en route / seated / returning / done)',
  'data-testids: hq-map, hq-group-list, hq-group-<slotId>, hq-filter-status',
]

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
