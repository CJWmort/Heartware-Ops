<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/BaseMap.vue'
import { SINGAPORE_CENTER, INNER_RING, OUTER_RING } from '@/utils/constants'

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
const POLL_MS = 15000 // how often the board is refreshed
const TICK_MS = 30000 // how often "x min ago" text is recalculated
const LIVE_MS = 2 * 60 * 1000 // updated within 2 min = live
const STALE_MS = 10 * 60 * 1000 // within 10 min = stale, older = not reporting
const FOCUS_ZOOM = 17 // max zoom when focusing a volunteer
const GLIDE_MS = 2000 // how long a marker takes to glide to its new position
const BIG_JUMP_M = 500 // jumps larger than this snap instead of gliding

const STATUS = {
  live: { label: 'Live' },
  stale: { label: 'Stale' },
  offline: { label: 'Not reporting' },
  none: { label: 'Not started' }, // confirmed, but no location received yet
}

/* ------------------------------------------------------------------ */
/* Vue state (reactive, used by the template)                          */
/* ------------------------------------------------------------------ */
const shows = ref([]) // e.g. ['NE Show 1', ...] for the dropdown
const selectedShow = ref('')
const volunteers = ref([]) // raw board data from the server
const loading = ref(true)
const error = ref('')
const query = ref('') // search text (name only)
const searchOpen = ref(false) // is the result list showing
const selectedId = ref(null) // volunteer currently selected
const now = ref(Date.now()) // ticks so "x min ago" stays current
const cardEl = ref(null)
const cardH = ref(0) // height of the bottom card on mobile (moves map controls up)

let clockOffset = 0 // server time minus browser time, so a wrong phone clock can't skew freshness
const serverNow = computed(() => now.value + clockOffset)

// Time since the volunteer's last update, as text
function agoText(v) {
  if (!v.updatedAt) return ''
  const mins = Math.floor((serverNow.value - new Date(v.updatedAt).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  return `${Math.floor(mins / 60)} h ago`
}

// live / stale / offline / none, based on how old the last update is
function statusOf(v) {
  if (!v.updatedAt) return 'none'
  const age = serverNow.value - new Date(v.updatedAt).getTime()
  if (age <= LIVE_MS) return 'live'
  if (age <= STALE_MS) return 'stale'
  return 'offline'
}

// Board data plus the computed status and "ago" text
const rows = computed(() =>
  volunteers.value.map((v) => ({ ...v, status: statusOf(v), ago: agoText(v) })),
)

// Search results: filtered by name only. Shows everyone when the box is empty
// or still holds the selected volunteer's name.
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const sel = selected.value
  if (!q || (sel && q === sel.name.toLowerCase())) return rows.value
  return rows.value.filter((v) => v.name.toLowerCase().includes(q))
})

const selected = computed(() => rows.value.find((v) => v.volunteerId === selectedId.value) ?? null)
const liveCount = computed(() => rows.value.filter((v) => v.status === 'live').length)
const locatedCount = computed(() => rows.value.filter((v) => v.lat != null).length)

// Small message shown when there is nothing to see on the map
const emptyMsg = computed(() => {
  if (loading.value) return ''
  if (!rows.value.length) return `No confirmed volunteers for ${selectedShow.value}.`
  if (!locatedCount.value) return 'No volunteer has shared their location yet.'
  return ''
})

/* ------------------------------------------------------------------ */
/* Non-reactive state (Leaflet objects and bookkeeping)                */
/* ------------------------------------------------------------------ */
let map = null
let L = null // Leaflet library, passed in by BaseMap
let zoneLayer = null
let volunteerLayer = null
let schoolMarker = null // marker for the selected volunteer's school
const markers = new Map() // volunteerId -> { marker, status, frame }

let needFit = false // fit the map to all volunteers once the next board arrives
let boardLoaded = false // true once data for the current show has arrived
let requestId = 0 // guards against slow responses overwriting newer ones
let pollTimer = null
let tickTimer = null

const isDesktop = () => window.matchMedia('(min-width: 992px)').matches

/* ------------------------------------------------------------------ */
/* Map icons                                                           */
/* ------------------------------------------------------------------ */

// Coloured dot for a volunteer (colour comes from their status)
function createVolIcon(status) {
  return L.divIcon({
    className: 'vol-marker',
    html: `<div class="vol-dot ${status}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    tooltipAnchor: [0, -12],
  })
}

// Red location pin resting on a small grey dot (the school)
function createSchoolIcon() {
  return L.divIcon({
    className: 'school-marker',
    html: `
      <div class="school-pin">
        <span class="school-dot"></span>
        <i class="bi bi-geo-alt-fill"></i>
      </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 32],
    tooltipAnchor: [0, -34],
  })
}

// Tooltip content built with textContent so names can't inject HTML
function nameTip(text) {
  const el = document.createElement('div')
  el.textContent = text
  return el
}

/* ------------------------------------------------------------------ */
/* Map setup                                                           */
/* ------------------------------------------------------------------ */

// Runs once BaseMap has created the map
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  zoneLayer = L.layerGroup().addTo(map)
  volunteerLayer = L.layerGroup().addTo(map)

  map.zoomControl?.setPosition('bottomright') // move +/- buttons to the bottom right
  map.on('click', () => {
    if (selectedId.value) clearSelection(false) // tapping empty map deselects
  })

  drawZones()
  drawMarkers() // in case the board arrived before the map
  applyFit()
}

// Map: draw the inner and outer zones
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

/* ------------------------------------------------------------------ */
/* Volunteer markers                                                   */
/* ------------------------------------------------------------------ */

// Brings the map in line with the board: adds new markers, glides moved ones,
// recolours changed ones and removes volunteers who are gone. Markers are
// updated in place, never redrawn from scratch.
function drawMarkers() {
  if (!map) return
  const seen = new Set()

  rows.value.forEach((v) => {
    if (v.lat == null || v.lng == null) return // not started: no marker
    seen.add(v.volunteerId)
    const entry = markers.get(v.volunteerId)

    if (!entry) {
      const marker = L.marker([v.lat, v.lng], { icon: createVolIcon(v.status) })
        .bindTooltip(nameTip(v.name), { direction: 'top' })
        .on('click', () => selectVolunteer(v.volunteerId))
        .addTo(volunteerLayer)
      markers.set(v.volunteerId, { marker, status: v.status, frame: null })
      return
    }

    if (entry.status !== v.status) {
      entry.marker.setIcon(createVolIcon(v.status))
      entry.status = v.status
    }
    glideTo(entry, v.lat, v.lng)
  })

  // Remove markers for volunteers no longer on the board
  markers.forEach((entry, id) => {
    if (seen.has(id)) return
    cancelAnimationFrame(entry.frame)
    volunteerLayer.removeLayer(entry.marker)
    markers.delete(id)
  })
}

// Animates a marker to a new position so it glides instead of jumping
function glideTo(entry, lat, lng) {
  const from = entry.marker.getLatLng()
  const to = L.latLng(lat, lng)
  const dist = from.distanceTo(to)

  cancelAnimationFrame(entry.frame)
  if (dist < 1) return
  if (dist > BIG_JUMP_M) {
    entry.marker.setLatLng(to)
    return
  }

  const start = performance.now()
  const step = (t) => {
    const p = Math.min((t - start) / GLIDE_MS, 1) // progress from 0 to 1
    entry.marker.setLatLng([from.lat + (to.lat - from.lat) * p, from.lng + (to.lng - from.lng) * p])
    if (p < 1) entry.frame = requestAnimationFrame(step)
  }
  entry.frame = requestAnimationFrame(step)
}

// Keep the map in step with the data (new positions, status colours changing with time)
watch(rows, drawMarkers)

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

// Zoom out to show every volunteer who has a location
function fitAll() {
  if (!map) return
  const pts = rows.value.filter((v) => v.lat != null).map((v) => [v.lat, v.lng])
  if (!pts.length) {
    map.flyTo(SINGAPORE_CENTER, 11, { duration: 0.5 })
    return
  }
  map.flyToBounds(pts, {
    paddingTopLeft: [40, 90],
    paddingBottomRight: [40, 40],
    maxZoom: 15,
    duration: 0.8,
  })
}

// Fit to everyone, but only once per show, and only after both the map and data exist
function applyFit() {
  if (!map || !boardLoaded || !needFit) return
  needFit = false
  fitAll()
}

// Zoom so the volunteer and their school are both in view
function focusOn(v) {
  if (!map) return
  const pts = []
  if (v.lat != null) pts.push([v.lat, v.lng])
  if (v.school?.lat != null) pts.push([v.school.lat, v.school.lng])
  if (!pts.length) return

  const bottom = isDesktop() ? 40 : cardH.value + 40 // keep clear of the bottom card on mobile
  map.flyToBounds(pts, {
    paddingTopLeft: [40, 90],
    paddingBottomRight: [40, bottom],
    maxZoom: FOCUS_ZOOM,
    duration: 1,
  })
}

/* ------------------------------------------------------------------ */
/* Selecting a volunteer                                               */
/* ------------------------------------------------------------------ */

// Shows the volunteer's school on the map
function showSchool(v) {
  clearSchool()
  const s = v.school
  if (!map || s?.lat == null || s?.lng == null) return
  schoolMarker = L.marker([s.lat, s.lng], { icon: createSchoolIcon() })
    .bindTooltip(nameTip(s.name || 'School'), { direction: 'top' })
    .addTo(volunteerLayer)
}

function clearSchool() {
  if (schoolMarker) volunteerLayer.removeLayer(schoolMarker)
  schoolMarker = null
}

// Selects a volunteer (from the list or by tapping their marker)
async function selectVolunteer(id) {
  const v = rows.value.find((r) => r.volunteerId === id)
  if (!v) return
  selectedId.value = id
  query.value = v.name
  searchOpen.value = false
  showSchool(v)

  await nextTick() // wait for the card to render so its height can be measured
  cardH.value = cardEl.value ? cardEl.value.offsetHeight + 12 : 0
  focusOn(v)
}

// Deselects: hides the card and school marker. fit = true also zooms back out.
function clearSelection(fit = true) {
  selectedId.value = null
  query.value = ''
  cardH.value = 0
  clearSchool()
  if (fit) fitAll()
}

// If the selected volunteer drops off the board (e.g. no longer confirmed), clear the card
watch(selected, (v) => {
  if (!v && selectedId.value) clearSelection(false)
})

/* ------------------------------------------------------------------ */
/* Search box                                                          */
/* ------------------------------------------------------------------ */
const inputEl = ref(null)

function onSearchFocus(e) {
  searchOpen.value = true
  e.target.select() // so typing replaces the selected name
}

// Enter picks the first match
function pickFirst() {
  if (results.value[0]) selectVolunteer(results.value[0].volunteerId)
}

// The X inside the search box
function clearQuery() {
  if (selectedId.value) clearSelection()
  query.value = ''
  inputEl.value?.focus()
}

/* ------------------------------------------------------------------ */
/* Loading data                                                        */
/* ------------------------------------------------------------------ */

// Fetches the board for the selected show (one API call: names, schools and last locations)
async function loadBoard() {
  if (!selectedShow.value) return
  const myId = ++requestId

  try {
    const res = await axios.get('/api/locations/board', { params: { show: selectedShow.value } })
    if (myId !== requestId) return // a newer request replaced this one

    clockOffset = new Date(res.data.serverTime).getTime() - Date.now()
    now.value = Date.now()
    volunteers.value = res.data.volunteers
    error.value = ''
    boardLoaded = true

    await nextTick() // let the markers update first
    applyFit()
  } catch (err) {
    if (myId !== requestId) return
    error.value = err.response?.data?.message || 'Could not load volunteers.'
  } finally {
    if (myId === requestId) loading.value = false
  }
}

// Admin picked a different show: reset and load it
function onShowChange() {
  clearSelection(false)
  volunteers.value = []
  loading.value = true
  boardLoaded = false
  needFit = true
  loadBoard()
}

// Refresh straight away when the admin comes back to the tab
function onVisibilityChange() {
  if (document.visibilityState === 'visible') loadBoard()
}

onMounted(async () => {
  try {
    const res = await axios.get('/api/locations/shows')
    shows.value = res.data
    selectedShow.value = shows.value[0] ?? ''
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load shows.'
    loading.value = false
    return
  }

  needFit = true
  await loadBoard()

  // Poll for new positions while the tab is visible
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadBoard()
  }, POLL_MS)
  tickTimer = setInterval(() => (now.value = Date.now()), TICK_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  markers.forEach((entry) => cancelAnimationFrame(entry.frame))
})
</script>

<template>
  <div class="map-page">
    <div class="map-stage" :style="{ '--card-h': cardH + 'px' }">
      <BaseMap :center="SINGAPORE_CENTER" :zoom="11" testid="hq-map" @ready="onMapReady" />

      <!-- Top bar: show dropdown + name search -->
      <div class="board-bar">
        <div class="bar-row">
          <label class="show-select">
            <i class="bi bi-calendar-event" aria-hidden="true"></i>
            <select v-model="selectedShow" aria-label="Show" @change="onShowChange">
              <option v-for="s in shows" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>

          <div class="search-box">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="Find by name"
              autocomplete="off"
              aria-label="Find by name"
              @focus="onSearchFocus"
              @blur="searchOpen = false"
              @keydown.enter.prevent="pickFirst"
              @keydown.esc="searchOpen = false"
            />
            <button
              v-if="query"
              type="button"
              class="icon-btn"
              aria-label="Clear search"
              @mousedown.prevent
              @click="clearQuery"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div v-if="searchOpen" class="results" role="listbox">
          <div class="results-head">{{ liveCount }} live · {{ rows.length }} volunteers</div>
          <button
            v-for="v in results"
            :key="v.volunteerId"
            type="button"
            class="result"
            role="option"
            @mousedown.prevent="selectVolunteer(v.volunteerId)"
          >
            <span class="status-dot" :class="v.status"></span>
            <span class="result-main">
              <span class="result-name">{{ v.name }}</span>
              <span class="result-sub">{{ v.school?.name || 'No school' }}</span>
            </span>
            <span class="result-ago">{{ v.ago || STATUS[v.status].label }}</span>
          </button>
          <div v-if="!results.length" class="results-empty">No volunteers found.</div>
        </div>
      </div>

      <!-- Selected volunteer: status, school and P5 classes -->
      <Transition name="card">
        <div v-if="selected" ref="cardEl" class="vol-card">
          <div class="vol-card-head">
            <div class="vol-avatar" :class="selected.status" aria-hidden="true">
              <i class="bi bi-person-fill"></i>
            </div>
            <div class="vol-card-title">
              <div class="vol-name">{{ selected.name }}</div>
              <div class="vol-status">
                <span class="status-dot" :class="selected.status"></span>
                {{ STATUS[selected.status].label }}<template v-if="selected.ago"> · {{ selected.ago }}</template>
              </div>
            </div>
            <button type="button" class="icon-btn" aria-label="Close" @click="clearSelection()">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div class="vol-card-body">
            <div class="vol-fact">
              <i class="bi bi-mortarboard" aria-hidden="true"></i>
              <div>
                <div class="fact-label">Allocated school</div>
                <div class="fact-value">{{ selected.school?.name || '—' }}</div>
              </div>
            </div>
            <div class="vol-fact">
              <i class="bi bi-people" aria-hidden="true"></i>
              <div>
                <div class="fact-label">P5 classes</div>
                <div class="fact-value">{{ selected.school?.p5Classes ?? '—' }}</div>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <div v-if="emptyMsg" class="empty-pill bg-danger text-white">{{ emptyMsg }}</div>

      <div v-if="loading" class="map-loading" role="status" aria-live="polite">
        <div class="spinner-border text-primary" aria-hidden="true"></div>
        <div class="mt-2 fw-semibold">Loading volunteers...</div>
      </div>

      <!-- Error popup -->
      <div class="notice-wrap">
        <Transition name="notice">
          <div v-if="error" class="notice" role="alert">
            <div class="notice-icon" aria-hidden="true">
              <i class="bi bi-exclamation-triangle-fill"></i>
            </div>
            <div class="notice-body">
              <div class="notice-title">Something went wrong</div>
              <div class="notice-text">{{ error }}</div>
            </div>
            <button type="button" class="icon-btn" aria-label="Dismiss message" @click="error = ''">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Map fills everything below the navbar */
.map-page {
  --nav-h: 56px; /* navbar height: check in DevTools and adjust if different */
  position: fixed;
  top: var(--nav-h);
  left: 0;
  right: 0;
  bottom: 0;
}

.map-stage {
  position: relative;
  height: 100%;
}

.map-stage :deep(.leaflet-container) {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background: #f1efe9;
}

/* Hide hairline seams between map tiles */
.map-stage :deep(.leaflet-tile) {
  outline: 1px solid transparent;
  max-width: none !important;
  max-height: none !important;
}

.map-stage :deep(.leaflet-control-zoom) {
  margin-bottom: 24px;
  margin-right: 14px;
}

/* Zoom buttons and attribution ride up above the bottom card (mobile) */
.map-stage :deep(.leaflet-bottom) {
  bottom: var(--card-h, 0px);
  transition: bottom 0.25s ease;
}

/* Top bar */
.board-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 1060; /* above Leaflet controls (1000), below the loading overlay (1100) */
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}

.show-select,
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  color: #555;
}

.show-select {
  flex: 0 0 auto;
  background: #f1f3f6;
}

.show-select select {
  border: 0;
  background: transparent;
  font-weight: 600;
  color: #222;
  outline: none;
}

.search-box {
  flex: 1 1 auto;
  min-width: 0;
}

.search-box input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #222;
}

.icon-btn {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #777;
}

.icon-btn:hover {
  background: #f1f3f6;
}

/* Search results list */
.results {
  margin-top: 6px;
  max-height: 50vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}

.results-head {
  padding: 10px 14px 6px;
  font-size: 0.75rem;
  color: #888;
}

.result {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
}

.result:hover {
  background: #f5f7fa;
}

.result-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.result-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.result-sub {
  font-size: 0.75rem;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-ago {
  flex: 0 0 auto;
  font-size: 0.75rem;
  color: #888;
}

.results-empty {
  padding: 14px;
  font-size: 0.85rem;
  color: #888;
}

/* Status colours (live / stale / offline / not started) */
.status-dot {
  flex: 0 0 auto;
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 2px;
  border-radius: 50%;
  background: #9aa0a6;
}
.status-dot.live { background: #16a34a; }
.status-dot.stale { background: #f59e0b; }
.status-dot.offline { background: #9aa0a6; }
.status-dot.none { background: #d3d6da; }

/* Marker dot on the map */
:global(.vol-dot) {
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #9aa0a6;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
}
:global(.vol-dot.live) {
  background: #16a34a;
  box-shadow: 0 0 0 6px rgb(22 163 74 / 0.2), 0 1px 4px rgb(0 0 0 / 0.4);
}
:global(.vol-dot.stale) { background: #f59e0b; }
:global(.vol-dot.offline) { background: #9aa0a6; }

/* School marker: red pin on a grey dot */
:global(.school-pin) {
  position: relative;
  width: 32px;
  height: 40px;
}

:global(.school-dot) {
  position: absolute;
  left: 11px;
  top: 27px; /* center sits on the marker's anchor */
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #9aa0a6;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
}

:global(.school-pin i) {
  position: absolute;
  left: 0;
  top: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ea4335;
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
}

/* Selected volunteer card (bottom on mobile) */
.vol-card {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 1060;
  padding: 14px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}

.vol-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vol-avatar {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #9aa0a6;
  color: #fff;
  font-size: 1.4rem;
}
.vol-avatar.live { background: #16a34a; }
.vol-avatar.stale { background: #f59e0b; }

.vol-card-title {
  flex: 1 1 auto;
  min-width: 0;
}

.vol-name {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.2;
}

.vol-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 0.8rem;
  color: #666;
}

.vol-card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eceef1;
}

.vol-fact {
  display: flex;
  gap: 10px;
  min-width: 0;
}

.vol-fact > i {
  font-size: 1.2rem;
  color: #2563eb;
}

.fact-label {
  font-size: 0.75rem;
  color: #888;
}

.fact-value {
  font-size: 0.9rem;
  font-weight: 600;
}

.card-enter-active,
.card-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.card-enter-from,
.card-leave-to {
  transform: translateY(16px);
  opacity: 0;
}

/* Message when there is nothing on the map */
.empty-pill {
  position: absolute;
  left: 50%;
  bottom: calc(24px + var(--card-h, 0px));
  transform: translateX(-50%);
  z-index: 1050;
  max-width: calc(100% - 100px);
  padding: 8px 14px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.25);
  font-size: 0.85rem;
  color: #555;
  text-align: center;
}

/* Loading overlay */
.map-loading {
  position: absolute;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6);
  backdrop-filter: grayscale(1);
}

/* Error popup */
.notice-wrap {
  position: absolute;
  top: 72px; /* just below the top bar */
  left: 12px;
  right: 12px;
  z-index: 1150;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.notice {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 420px;
  padding: 10px 8px 10px 12px;
  background: #fff;
  border: 1px solid #f5c2c0;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}

.notice-icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #fce8e6;
  color: #d93025;
  font-size: 1.1rem;
}

.notice-body {
  flex: 1 1 auto;
  min-width: 0;
}

.notice-title {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
}

.notice-text {
  margin-top: 2px;
  font-size: 0.8rem;
  line-height: 1.3;
  color: #666;
}

.notice-enter-active,
.notice-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.notice-enter-from,
.notice-leave-to {
  transform: translateY(-12px);
  opacity: 0;
}

/* Desktop: the bar and the volunteer card stack at the top left */
@media (min-width: 992px) {
  .map-stage {
    --card-h: 0px !important; /* controls stay where they were */
  }
  .board-bar {
    right: auto;
    width: 400px;
  }
  .vol-card {
    top: 72px;
    bottom: auto;
    right: auto;
    width: 400px;
  }
  .notice-wrap {
    left: 424px;
    justify-content: flex-end;
  }
  .empty-pill {
    bottom: 24px;
  }
}
</style>