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
const STALE_MS = 10 * 60 * 1000 // within 2-10 min = stale, older = not reporting
const FOCUS_ZOOM = 17 // max zoom when focusing a volunteer
const GLIDE_MS = 2000 // how long a marker takes to glide to its new position
const BIG_JUMP_M = 500 // jumps larger than this snap instead of gliding

const STATUS = {
  live: { label: 'Live' }, // < 2min since last updated location
  stale: { label: 'Stale' }, // > 2min since last updated location
  offline: { label: 'Not reporting' }, // > 10min since last updated location
  none: { label: 'Not started' }, // confirmed, but no location received yet
}

// The zone bands shown as chips (each volunteer is in exactly one)
const ZONES = [
  { key: 'inner', label: 'Inner', hint: 'Inside the inner ring' },
  { key: 'outer', label: 'Outer', hint: 'Inside the outer ring, outside the inner ring' },
  { key: 'outside', label: 'Outside', hint: 'Outside both rings' },
  { key: 'none', label: 'Not started', hint: 'No location received yet' },
]

const IMMEDIATE_M = 10 // alert on the first sighting if this far (in metres) past a ring edge (or the GPS accuracy, if larger)
const MAX_TOASTS = 3 // alert cards visible at once
const TOAST_MS = 8000 // how long an alert card stays
const ZONE_RANK = { outside: 0, outer: 1, inner: 2 } // higher = closer to the venue

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

// True if the point is inside the ring (ray casting). ring = [[lat, lng], ...]
// Ray casting: stand at the volunteer’s spot, shoot a straight line to the right forever, and count how many times it crosses the polygon’s edge
function inRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// Which band a volunteer is in: inner takes priority, so nobody is counted twice
function zoneOf(v) {
  if (v.lat == null || v.lng == null) return 'none'
  if (inRing(v.lat, v.lng, INNER_RING)) return 'inner' // First test, the ray is counted against the inner ring’s edges ONLY
  if (inRing(v.lat, v.lng, OUTER_RING)) return 'outer' // Second test, only if the first test failed. If the count is odd, the volunteer is inside the outer ring
  return 'outside' // Both counts were even means the volunteer is Outside.
}

// Shortest distance in metres from a point to the edge of a ring.
// Works in a flat local grid (metres), which is accurate enough at this size.
function distToRing(lat, lng, ring) {
  const mLat = 111320 // metres per degree of latitude
  const mLng = 111320 * Math.cos((lat * Math.PI) / 180) // metres per degree of longitude here
  let best = Infinity

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    // The edge from point j to point i, measured from the volunteer at (0, 0)
    const ax = (ring[j][1] - lng) * mLng
    const ay = (ring[j][0] - lat) * mLat
    const dx = (ring[i][1] - lng) * mLng - ax
    const dy = (ring[i][0] - lat) * mLat - ay

    // Closest point on that edge to the volunteer
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

// How far a volunteer is from the ring edge that decides their zone
function zoneDepth(v) {
  if (v.zone === 'inner') return distToRing(v.lat, v.lng, INNER_RING)
  if (v.zone === 'outer') {
    return Math.min(distToRing(v.lat, v.lng, INNER_RING), distToRing(v.lat, v.lng, OUTER_RING))
  }
  return distToRing(v.lat, v.lng, OUTER_RING) // outside
}

// Board data plus the computed status and "ago" text
const rows = computed(() =>
  volunteers.value.map((v) => ({ ...v, status: statusOf(v), ago: agoText(v), zone: zoneOf(v) }))
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

// How many volunteers are in each band
const zoneCounts = computed(() => {
  const c = { inner: 0, outer: 0, outside: 0, none: 0 }
  rows.value.forEach((v) => c[v.zone]++)
  return c
})

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
let linkLine = null // dashed line from the selected volunteer to their school
let pinnedId = null // volunteer whose tooltip is pinned open while selected
let lineRenderer = null // canvas renderer so the line stays visible while zooming
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

// Round badge with a person icon for a volunteer (colour comes from their status)
function createVolIcon(status) {
  return L.divIcon({
    className: 'vol-marker',
    html: `<div class="vol-dot ${status}"><i class="bi bi-person-fill"></i></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -18],
  })
}

// Rounded badge with a graduation cap (the school)
function createSchoolIcon() {
  return L.divIcon({
    className: 'school-marker',
    html: `<div class="school-badge"><i class="bi bi-mortarboard-fill"></i></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    tooltipAnchor: [0, -20],
  })
}

// Tooltip card in the same style as the volunteer card: icon badge + name only.
// Built with the DOM (textContent) so names can't inject HTML.
function tipCard({ icon, tone, title }) {
  const el = document.createElement('div')
  el.className = 'tip'

  const badge = document.createElement('div')
  badge.className = `tip-icon ${tone}`
  const i = document.createElement('i')
  i.className = `bi ${icon}`
  badge.appendChild(i)

  const t = document.createElement('div')
  t.className = 'tip-title'
  t.textContent = title

  el.append(badge, t)
  return el
}

// Volunteer tooltip: the badge colour follows their status
function volTip(v) {
  return tipCard({ icon: 'bi-person-fill', tone: v.status, title: v.name })
}

// School tooltip
function schoolTip(s) {
  return tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: s.name || 'School' })
}

// Attaches a tooltip card to a marker, replacing any tooltip it already has.
// pinned = stays open until the tooltip is rebound; otherwise it shows on hover only.
function bindTip(marker, content, { pinned = false, direction = 'top' } = {}) {
  marker.unbindTooltip()
  marker.bindTooltip(content, {
    className: 'hq-tip',
    direction,
    offset: [0, direction === 'bottom' ? 26 : -6], // keeps the card clear of the marker
    opacity: 1,
    permanent: pinned,
  })
  if (pinned) marker.openTooltip()
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
  lineRenderer = L.canvas() // reused for the dashed line

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
      const marker = L.marker([v.lat, v.lng], {
        icon: createVolIcon(v.status),
        zIndexOffset: 500,
        keyboard: false, // not focusable, so a focus/blur can't close the pinned tooltip
      })
        .on('click', () => selectVolunteer(v.volunteerId))
        .addTo(volunteerLayer)
      bindTip(marker, volTip(v))
      markers.set(v.volunteerId, { marker, status: v.status, frame: null })
      return
    }

    if (entry.status !== v.status) {
      entry.marker.setIcon(createVolIcon(v.status))
      entry.marker.setTooltipContent(volTip(v)) // badge colour follows the new status
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

  updateLink()
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
    updateLink() // keep the dashed line attached to the moving marker
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

  const bottom = isDesktop() ? 70 : cardH.value + 70 // room for the tooltip and the bottom card
  const left = isDesktop() ? 440 : 60 // on desktop, stay clear of the top-left cards
  map.flyToBounds(pts, {
    paddingTopLeft: [left, 150],
    paddingBottomRight: [60, bottom],
    maxZoom: FOCUS_ZOOM,
    duration: 1,
  })
}

/* ------------------------------------------------------------------ */
/* Selecting a volunteer                                               */
/* ------------------------------------------------------------------ */

// Pins tooltips on the selected volunteer and their school, with a dashed line between them
function showSchool(v) {
  clearSchool()
  const s = v.school
  const entry = markers.get(v.volunteerId)
  const hasSchool = s?.lat != null && s?.lng != null

  // The marker further north gets its tooltip above and the other below, so they never overlap
  const schoolNorth = hasSchool && (v.lat == null || s.lat >= v.lat)

  if (entry) {
    pinnedId = v.volunteerId
    bindTip(entry.marker, volTip(v), { pinned: true, direction: schoolNorth ? 'bottom' : 'top' })
  }

  if (!map || !hasSchool) return

  schoolMarker = L.marker([s.lat, s.lng], { icon: createSchoolIcon() }).addTo(volunteerLayer)
  bindTip(schoolMarker, schoolTip(s), { pinned: true, direction: schoolNorth ? 'top' : 'bottom' })

  if (v.lat != null) {
    linkLine = L.polyline(
      [[v.lat, v.lng], [s.lat, s.lng]],
      { color: '#4f46e5', weight: 3, dashArray: '6 8', opacity: 0.85, interactive: false, renderer: lineRenderer },
    ).addTo(volunteerLayer)
  }
}

// Moves the line's volunteer end to the marker's current position
function updateLink() {
  const v = selected.value
  const entry = v && markers.get(v.volunteerId)
  if (!linkLine || !entry || v.school?.lat == null) return
  linkLine.setLatLngs([entry.marker.getLatLng(), [v.school.lat, v.school.lng]])
}

// Removes the school marker and line, and turns the volunteer's tooltip back into hover-only
function clearSchool() {
  if (schoolMarker) volunteerLayer.removeLayer(schoolMarker)
  if (linkLine) volunteerLayer.removeLayer(linkLine)
  schoolMarker = null
  linkLine = null

  const entry = markers.get(pinnedId)
  const v = rows.value.find((r) => r.volunteerId === pinnedId)
  if (entry && v) bindTip(entry.marker, volTip(v))
  pinnedId = null
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
/* Zone alerts                                                         */
/* ------------------------------------------------------------------ */
const toasts = ref([]) // alert cards currently showing, newest first
const toastTimers = new Map() // toast id -> its auto-dismiss timer
let toastSeq = 0

const lastZone = new Map() // volunteerId -> zone we last confirmed
const pendingZone = new Map() // volunteerId -> new zone seen once, waiting for a second sighting

// Compares every volunteer's zone with the last confirmed one and raises an alert
// when it has really changed. Called after every board refresh.
function detectZoneChanges() {
  const seen = new Set()

  rows.value.forEach((v) => {
    seen.add(v.volunteerId)
    if (v.zone === 'none') return // no location yet: nothing to compare

    const last = lastZone.get(v.volunteerId)
    if (last === undefined) {
      lastZone.set(v.volunteerId, v.zone) // first time seen: record it, no alert
      return
    }
    if (v.zone === last) {
      pendingZone.delete(v.volunteerId) // back where they were, so it was just a wobble
      return
    }
     // Far enough past the edge that GPS wobble can't explain it: alert on the first sighting
    const clearCut = zoneDepth(v) > Math.max(IMMEDIATE_M, v.accuracy ?? 0)

    if (!clearCut && pendingZone.get(v.volunteerId) !== v.zone) {
      pendingZone.set(v.volunteerId, v.zone) // close to the edge: wait for a second sighting
      return
    }

    // Seen in the new zone on two refreshes in a row: it's real
    pendingZone.delete(v.volunteerId)
    lastZone.set(v.volunteerId, v.zone)
    addAlert(v, last, v.zone)
  })

  // Forget volunteers who are no longer on the board
  ;[lastZone, pendingZone].forEach((m) =>
    m.forEach((_, id) => {
      if (!seen.has(id)) m.delete(id)
    }),
  )
}

// Turns a zone change into an alert card
function addAlert(v, from, to) {
  const enter = ZONE_RANK[to] > ZONE_RANK[from]
  const ring = enter ? to : to === 'outer' ? 'inner' : 'outer' // the ring that was entered or left
  showToast({
    volunteerId: v.volunteerId,
    name: v.name,
    enter,
    text: `${enter ? 'Entered' : 'Left'} the ${ring} ring`,
  })
}

// Adds a card to the top of the stack and drops the oldest if there are too many
function showToast(t) {
  const toast = { id: ++toastSeq, ...t }
  const next = [toast, ...toasts.value]

  next.slice(MAX_TOASTS).forEach((old) => {
    clearTimeout(toastTimers.get(old.id))
    toastTimers.delete(old.id)
  })
  toasts.value = next.slice(0, MAX_TOASTS)
  toastTimers.set(toast.id, setTimeout(() => dismissToast(toast.id), TOAST_MS))
}

function dismissToast(id) {
  clearTimeout(toastTimers.get(id))
  toastTimers.delete(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// Tapping a card selects that volunteer
function openToast(t) {
  dismissToast(t.id)
  selectVolunteer(t.volunteerId)
}

function clearToasts() {
  toastTimers.forEach((timer) => clearTimeout(timer))
  toastTimers.clear()
  toasts.value = []
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
    detectZoneChanges() // zone alerts
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
  lastZone.clear() // new show: start from a fresh baseline, so no alerts for the first load
  pendingZone.clear()
  clearToasts()
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
    const res = await axios.get('/api/locations/shows') // Fetch all existing shows
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
  clearToasts()
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

        <!-- Zone counts -->
        <div v-if="rows.length" class="zone-row" aria-label="Volunteers by zone">
          <span v-for="z in ZONES" :key="z.key" class="zone-chip" :title="z.hint">
            <span class="zone-dot" :class="z.key"></span>{{ z.label }}
            <strong>{{ zoneCounts[z.key] }}</strong>
          </span>
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
            <div class="info-card">
              <div class="info-label">
                <i class="bi bi-mortarboard-fill" aria-hidden="true"></i>Allocated school
              </div>
              <div class="info-value">{{ selected.school?.name || '—' }}</div>
            </div>
            <div class="info-card">
              <div class="info-label">
                <i class="bi bi-people-fill" aria-hidden="true"></i>P5 classes
              </div>
              <div class="info-value info-number">{{ selected.school?.p5Classes ?? '—' }}</div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Zone alerts -->
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast-card"
          role="status"
          tabindex="0"
          @click="openToast(t)"
          @keydown.enter="openToast(t)"
        >
          <div class="toast-icon" :class="t.enter ? 'enter' : 'leave'" aria-hidden="true">
            <i class="bi" :class="t.enter ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right'"></i>
          </div>
          <div class="toast-body">
            <div class="toast-title">{{ t.name }}</div>
            <div class="toast-text">{{ t.text }}</div>
          </div>
          <button
            type="button"
            class="icon-btn"
            aria-label="Dismiss alert"
            @click.stop="dismissToast(t.id)"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </TransitionGroup>

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
  gap: 3px;
  padding: 4px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}

.show-select,
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border-radius: 9px;
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

.search-box .icon-btn {
  width: 26px;
  height: 26px;
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
.status-dot.offline { background: #dc2626; }
.status-dot.none { background: #d3d6da; }

/* Volunteer marker: round badge with a person icon */
:global(.vol-dot) {
  position: relative;
  width: 34px;
  height: 34px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #9aa0a6;
  color: #fff;
  font-size: 1.05rem;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
}
:global(.vol-dot.live) { background: #16a34a; }
:global(.vol-dot.stale) { background: #f59e0b; }
:global(.vol-dot.offline) { background: #dc2626; }

/* Pulsing ring on live volunteers */
:global(.vol-dot.live::after) {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid #16a34a;
  /* use the "vol-pulse" animation defined below */
  animation: vol-pulse 1s ease-out infinite;
}

/* The pulse animation */
@keyframes vol-pulse {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

/* School marker: indigo rounded badge with a graduation cap */
:global(.school-badge) {
  width: 36px;
  height: 36px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #fff;
  border-radius: 11px;
  background: #4f46e5;
  color: #fff;
  font-size: 1.1rem;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
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
.vol-avatar.offline { background: #dc2626; }

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

/* School and P5 classes cards */
.vol-card-body {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.info-card {
  min-width: 0;
  padding: 10px 12px;
  background: #f6f8fb;
  border: 1px solid #e6eaf0;
  border-radius: 12px;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: #777;
}

.info-label i {
  font-size: 0.95rem;
  color: #4f46e5;
}

.info-value {
  margin-top: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.25;
}

.info-number {
  font-size: 1.5rem;
  line-height: 1.1;
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
  top: 96px; /* just below the top bar and zone chips */
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

/* Tooltip cards (same look as the volunteer card, name only) */
:global(.leaflet-tooltip.hq-tip) {
  padding: 6px 12px 6px 6px;
  background: #fff;
  border: 1px solid #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
  color: #222;
  white-space: nowrap;
}

:global(.tip) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:global(.tip-icon) {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #9aa0a6;
  color: #fff;
  font-size: 0.95rem;
}

:global(.tip-icon.live) { background: #16a34a; }
:global(.tip-icon.stale) { background: #f59e0b; }
:global(.tip-icon.offline) { background: #dc2626; }
:global(.tip-icon.school) { background: #4f46e5; }

:global(.tip-title) {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
}

/* Zone count chips */
.zone-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  overflow-x: auto;
  scrollbar-width: none; /* scrolls sideways on very narrow phones */
}
.zone-row::-webkit-scrollbar {
  display: none;
}

.zone-chip {
  flex: 1 1 auto; /* share the row evenly instead of overflowing */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.2);
  font-size: 0.78rem;
  color: #555;
  white-space: nowrap;
}

.zone-chip strong {
  font-size: 0.85rem;
  color: #222;
}

/* Dots match the rings drawn on the map */
.zone-dot {
  box-sizing: border-box;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #d3d6da;
}
.zone-dot.inner { background: #0d6efd; }
.zone-dot.outer { background: #cfe0fb; border: 2px solid #6c757d; }
.zone-dot.outside { background: #fff; border: 2px solid #9aa0a6; }

/* Zone alert cards */
.toast-stack {
  position: absolute;
  top: 96px; /* just below the top bar and zone chips */
  left: 12px;
  right: 12px;
  z-index: 1055; /* below the top bar (1060) so the search list covers them */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none; /* only the cards take clicks */
}

.toast-card {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 340px;
  padding: 8px 6px 8px 8px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
  cursor: pointer;
}

.toast-icon {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: #fff;
  font-size: 1.05rem;
}
.toast-icon.enter { background: #16a34a; }
.toast-icon.leave { background: #f59e0b; }

.toast-body {
  flex: 1 1 auto;
  min-width: 0;
}

.toast-title {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-text {
  margin-top: 2px;
  font-size: 0.8rem;
  color: #666;
}

.toast-enter-active,
.toast-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateY(-10px);
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
    top: 96px;
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
  .toast-stack {
    top: 12px; /* desktop: top right corner */
    left: auto;
    right: 12px;
    width: 340px;
  }
}

/* Phones: compact chips that share the row evenly so all four fit */
@media (max-width: 575.98px) {
  .zone-row {
    gap: 4px;
  }
  .zone-chip {
    flex: 1 1 auto; /* grow to fill the row instead of leaving a gap at the end */
    justify-content: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    font-size: 0.72rem;
  }
  .zone-chip strong {
    font-size: 0.78rem;
  }
  .zone-dot {
    width: 8px;
    height: 8px;
  }
}

/* Very narrow phones: drop the dots to save space */
@media (max-width: 359.98px) {
  .zone-dot {
    display: none;
  }
}


</style>