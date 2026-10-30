<!-- The admin HQ Live Board (F4): a live map of every volunteer on the day with their journey
     stage, zone arrivals and departures, and a bell for alerts. -->

<script setup>
// Loads volunteer positions, listens for live updates over the socket, glides the pins, works out the
// zone and stage of each volunteer, follows a selected volunteer and records zone alerts.

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/map/BaseMap.vue'
import MapLoading from '@/components/map/MapLoading.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import AppDropdown from '@/components/common/AppDropdown.vue'
import { createVolIcon, createSchoolIcon, volTip, schoolTip, bindTip } from '@/utils/map-icons'
import { useZoneEventsStore, MAX_EVENTS } from '@/services/zone-events'
import { useChatStore } from '@/services/chat'
import { getSavedShow, saveShow } from '@/services/selected-show'
import { SINGAPORE_CENTER, INNER_RING, OUTER_RING, JOURNEY_STAGES } from '@/utils/constants'

const POLL_MS = 5000
const TICK_MS = 30000
const LIVE_MS = 2 * 60 * 1000
const STALE_MS = 10 * 60 * 1000
const FOCUS_ZOOM = 17
const SOLO_ZOOM = 15
const GLIDE_MS = 2000
const BIG_JUMP_M = 500

const STATUS = {
  live: { label: 'Live' },
  stale: { label: 'Stale' },
  offline: { label: 'Not reporting' },
  none: { label: 'Not started' },
}

const ZONES = [
  { key: 'inner', label: 'Inner', hint: 'Inside the inner ring' },
  { key: 'outer', label: 'Outer', hint: 'Inside the outer ring, outside the inner ring' },
  { key: 'outside', label: 'Outside', hint: 'Outside both rings' },
  { key: 'none', label: 'Not started', hint: 'No location received yet' },
]

const IMMEDIATE_M = 10
const MAX_TOASTS = 3
const EVENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'enter', label: 'Arrivals' },
  { key: 'leave', label: 'Departures' },
]
const TOAST_MS = 8000
const ZONE_RANK = { outside: 0, outer: 1, inner: 2 }

const shows = ref([])
// showOptions (computed) - the shows in the shape AppDropdown expects: a list of { value, label }.
const showOptions = computed(() => shows.value.map((s) => ({ value: s, label: s })))
const selectedShow = ref('')
// watch(selectedShow) - remember the chosen show.
watch(selectedShow, (s) => s && saveShow(s))
const volunteers = ref([])
const loading = ref(true)

const error = ref('')
// errorNotice (computed) - turns the error text into the popup object MapNotice shows.
const errorNotice = computed(() =>
  error.value
    ? {
        type: 'error',
        icon: 'bi-exclamation-triangle-fill',
        title: 'Something went wrong',
        text: error.value,
      }
    : null,
)

const query = ref('')
const searchOpen = ref(false)
const selectedId = ref(null)
const now = ref(Date.now())
const cardEl = ref(null)
const barEl = ref(null)
const following = ref(false)
const cardH = ref(0)

let clockOffset = 0
// serverNow (computed) - the current time corrected by the offset between this device's clock and the
// server's clock.
const serverNow = computed(() => now.value + clockOffset)

// ageText(ms) - "Just now", "5 min ago" or "2 h ago" from a number of milliseconds.
function ageText(ms) {
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  return `${Math.floor(mins / 60)} h ago`
}

// agoText(v) - how long ago this volunteer last reported, as text; empty if never.
function agoText(v) {
  if (!v.updatedAt) return ''
  return ageText(serverNow.value - new Date(v.updatedAt).getTime())
}

// statusOf(v) - live, stale, offline or none from the age of the last update and the LIVE_MS /
// STALE_MS limits.
function statusOf(v) {
  if (!v.updatedAt) return 'none'
  const age = serverNow.value - new Date(v.updatedAt).getTime()
  if (age <= LIVE_MS) return 'live'
  if (age <= STALE_MS) return 'stale'
  return 'offline'
}

// inRing(lat, lng, ring) - true if the point is inside the polygon (ray casting). Steps: 1) start with
// "outside" 2) for each edge of the polygon, check whether a line going right from the point crosses
// it 3) every crossing flips inside and outside 4) an odd number of crossings means inside.
function inRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// zoneOf(v) - which band a volunteer is in: none (no location), inner, outer, or outside. Inner is
// tested first so nobody is counted twice.
function zoneOf(v) {
  if (v.lat == null || v.lng == null) return 'none'
  if (inRing(v.lat, v.lng, INNER_RING)) return 'inner'
  if (inRing(v.lat, v.lng, OUTER_RING)) return 'outer'
  return 'outside'
}

// distToRing(lat, lng, ring) - shortest distance in metres from the point to the ring's edge. Steps:
// 1) convert degrees to metres around the volunteer 2) for each edge, find the closest point on that
// segment (clamped between its two ends) 3) keep the smallest distance.
function distToRing(lat, lng, ring) {
  const mLat = 111320
  const mLng = 111320 * Math.cos((lat * Math.PI) / 180)
  let best = Infinity

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][1] - lng) * mLng
    const ay = (ring[j][0] - lat) * mLat
    const dx = (ring[i][1] - lng) * mLng - ax
    const dy = (ring[i][0] - lat) * mLat - ay

    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

// zoneDepth(v) - how far inside their current zone the volunteer is, measured to the nearest ring edge
// that decides the zone (inner: the inner ring; outer: the closer of the two rings; outside: the outer
// ring).
function zoneDepth(v) {
  if (v.zone === 'inner') return distToRing(v.lat, v.lng, INNER_RING)
  if (v.zone === 'outer') {
    return Math.min(distToRing(v.lat, v.lng, INNER_RING), distToRing(v.lat, v.lng, OUTER_RING))
  }
  return distToRing(v.lat, v.lng, OUTER_RING)
}

// rows (computed) - the board data plus the work out values: status, "ago" text, zone and the journey
// chip text. Everything on screen reads from rows.
const rows = computed(() =>
  volunteers.value.map((v) => ({
    ...v,
    status: statusOf(v),
    ago: agoText(v),
    zone: zoneOf(v),
    stageLabel: v.stage > 0 ? JOURNEY_STAGES[v.stage - 1].short : 'Not started',
  })),
)

// results (computed) - the search results: by name only; everyone when the box is empty or still holds
// the selected volunteer's own name.
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const sel = selected.value
  if (!q || (sel && q === sel.name.toLowerCase())) return rows.value
  return rows.value.filter((v) => v.name.toLowerCase().includes(q))
})

// selected, liveCount, locatedCount (computed) - the selected volunteer's row, how many are live, and
// how many have a location.
const selected = computed(() => rows.value.find((v) => v.volunteerId === selectedId.value) ?? null)
// liveCount (computed) - how many volunteers are live.
const liveCount = computed(() => rows.value.filter((v) => v.status === 'live').length)
// locatedCount (computed) - how many volunteers have a known position.
const locatedCount = computed(() => rows.value.filter((v) => v.lat != null).length)

// zoneCounts (computed) - how many volunteers are in each zone chip.
const zoneCounts = computed(() => {
  const c = { inner: 0, outer: 0, outside: 0, none: 0 }
  rows.value.forEach((v) => c[v.zone]++)
  return c
})

// emptyMsg (computed) - the red message when the map has nothing to show: no confirmed volunteers, or
// nobody has shared a location yet.
const emptyMsg = computed(() => {
  if (loading.value) return ''
  if (!rows.value.length) return `No confirmed volunteers for ${selectedShow.value}.`
  if (!locatedCount.value) return 'No volunteer has shared their location yet.'
  return ''
})

let map = null
let L = null
let zoneLayer = null
let volunteerLayer = null
let baseBounds = null
let schoolMarker = null
let pinnedId = null
const markers = new Map()

let needFit = false
let boardLoaded = false
let hasFitted = false
let requestId = 0
let pollTimer = null
let tickTimer = null

// isDesktop() - true at 992px and wider (Bootstrap "lg"); the layout and camera padding differ on
// phones.
const isDesktop = () => window.matchMedia('(min-width: 992px)').matches

// onMapReady(m, leaflet) - BaseMap is ready: keep the map, create the layers, remember the max bounds,
// allow quarter zoom steps, move the zoom buttons bottom right, dragging stops follow mode, a tap on
// the map closes the bell and deselects; then draw the rings, the markers and fit the view.
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  zoneLayer = L.layerGroup().addTo(map)
  volunteerLayer = L.layerGroup().addTo(map)

  baseBounds = map.options.maxBounds
  map.options.zoomSnap = 0.25
  // map zoomend / resize - keep the map inside its allowed area.
  map.on('zoomend resize', () => limitView())

  map.zoomControl?.setPosition('bottomright')
  // map dragstart - when the admin drags the map, stop following the selected volunteer.
  map.on('dragstart', () => (following.value = false))
  // map click - clicking empty map stops following, closes the bell panel and clears the selection.
  map.on('click', () => {
    following.value = false
    bellOpen.value = false
    if (selectedId.value) clearSelection()
  })

  drawZones()
  drawMarkers()
  applyFit()
}

// drawZones() - draws the outer ring (blue, dashed) then the inner ring (purple, solid) on top of it.
function drawZones() {
  zoneLayer.clearLayers()

  L.polygon(OUTER_RING, {
    color: '#2563eb',
    weight: 3,
    dashArray: '8 6',
    fillColor: '#2563eb',
    fillOpacity: 0.14,
  }).addTo(zoneLayer)

  L.polygon(INNER_RING, {
    color: '#7c3aed',
    weight: 3,
    fillColor: '#7c3aed',
    fillOpacity: 0.22,
  }).addTo(zoneLayer)
}

// drawMarkers() - makes the map match the board: a new volunteer gets a marker (clicking selects
// them); a changed status recolours it and updates its tooltip; a moved one glides; a volunteer who
// left the board is removed. Markers are updated in place, never redrawn.
function drawMarkers() {
  if (!map) return
  const seen = new Set()

  rows.value.forEach((v) => {
    if (v.lat == null || v.lng == null) return
    seen.add(v.volunteerId)
    const entry = markers.get(v.volunteerId)

    if (!entry) {
      const marker = L.marker([v.lat, v.lng], {
        icon: createVolIcon(v.status),
        zIndexOffset: 500,
        keyboard: false,
      })
        .on('click', () => selectVolunteer(v.volunteerId))
        .addTo(volunteerLayer)
      bindTip(marker, volTip(v))
      markers.set(v.volunteerId, { marker, status: v.status, frame: null })
      return
    }

    if (entry.status !== v.status) {
      entry.marker.setIcon(createVolIcon(v.status))
      entry.marker.setTooltipContent(volTip(v))
      entry.status = v.status
    }
    glideTo(entry, v.lat, v.lng)
  })

  markers.forEach((entry, id) => {
    if (seen.has(id)) return
    cancelAnimationFrame(entry.frame)
    volunteerLayer.removeLayer(entry.marker)
    markers.delete(id)
  })

  applyFocus()
}

// applyFocus() - with someone selected, every other marker gets a lighter shade and the selected one
// goes on top (by toggling a class, so tooltips are untouched).
function applyFocus() {
  markers.forEach((entry, id) => {
    const isSelected = id === selectedId.value
    entry.marker.setZIndexOffset(isSelected ? 1500 : 500)
    entry.marker
      .getElement()
      ?.querySelector('.vol-dot')
      ?.classList.toggle('dimmed', selectedId.value !== null && !isSelected)
  })
}

let followFlying = false

// followTarget(latlng, zoom) - the map centre that puts a point in the middle of the uncovered area
// (on phones the bottom card covers part of the map).
function followTarget(latlng, zoom) {
  let dy = 0
  if (!isDesktop() && cardEl.value) {
    const { top, bottom } = coveredInsets()
    dy = (bottom - top) / 2
  }
  const pt = map.project(latlng, zoom).add(L.point(0, dy))
  return map.unproject(pt, zoom)
}

// followIfSelected(entry) - while follow mode is on, keep the selected volunteer centred as the marker
// moves.
function followIfSelected(entry) {
  if (!following.value || followFlying || !map || markers.get(selectedId.value) !== entry) return
  const zoom = map.getZoom()
  map.setView(followTarget(entry.marker.getLatLng(), zoom), zoom, { animate: false })
}

// followZoomIn() - zoom all the way in on the selected volunteer (blocks other camera moves for the
// flight; a timer is the fallback if the end event never fires).
function followZoomIn() {
  const entry = markers.get(selectedId.value)
  if (!entry || !map) return
  const max = map.getMaxZoom()
  const zoom = Number.isFinite(max) ? max : 19
  limitView(zoom)
  followFlying = true
  // map moveend (once) - the follow fly-to has finished, so clear the flying flag.
  map.once('moveend', () => (followFlying = false))
  setTimeout(() => (followFlying = false), 1500)
  map.flyTo(followTarget(entry.marker.getLatLng(), zoom), zoom, { duration: 0.6 })
}

// toggleFollow() - the crosshair button: turn follow mode on (and zoom in) or off.
function toggleFollow() {
  following.value = !following.value
  if (following.value) followZoomIn()
}

// watch(cardH) - when the bottom card changes height, re-centre the followed volunteer in the new free
// area.
watch(cardH, async () => {
  if (!following.value || !map) return
  await nextTick()
  const entry = markers.get(selectedId.value)
  if (!entry || followFlying) return
  limitView()
  const zoom = map.getZoom()
  map.setView(followTarget(entry.marker.getLatLng(), zoom), zoom, { animate: false })
})

// glideTo(entry, lat, lng) - moves a marker smoothly: ignore moves under 1 m, snap for jumps over 500
// m, otherwise animate over 2 seconds with requestAnimationFrame (progress 0 to 1).
function glideTo(entry, lat, lng) {
  const from = entry.marker.getLatLng()
  const to = L.latLng(lat, lng)
  const dist = from.distanceTo(to)

  cancelAnimationFrame(entry.frame)
  if (dist < 1) return
  if (dist > BIG_JUMP_M) {
    entry.marker.setLatLng(to)
    followIfSelected(entry)
    return
  }

  const start = performance.now()
  // step(t) - one animation frame of a marker glide: moves the marker part of the way, keeps the map
  // on it if it is selected, and asks for the next frame until done.
  const step = (t) => {
    const p = Math.min((t - start) / GLIDE_MS, 1)
    entry.marker.setLatLng([from.lat + (to.lat - from.lat) * p, from.lng + (to.lng - from.lng) * p])
    followIfSelected(entry)
    if (p < 1) entry.frame = requestAnimationFrame(step)
  }
  entry.frame = requestAnimationFrame(step)
}

// Keep the map in step with the data (new positions, status colours changing with time) Watches:
// redraw markers when rows change; re-shade markers when the selection changes.
watch(rows, drawMarkers)
// watch(selectedId) - when a volunteer is selected or cleared, apply the map focus.
watch(selectedId, applyFocus)

// fitAll(mode) - fit the camera to every volunteer who has a location. fly = animated arc, smooth =
// straight move, jump = no animation. With nobody located it shows Singapore.
function fitAll(mode = 'fly') {
  if (!map) return
  const pts = rows.value.filter((v) => v.lat != null).map((v) => [v.lat, v.lng])
  if (!pts.length) {
    if (mode === 'fly') map.flyTo(SINGAPORE_CENTER, 11, { duration: 0.5 })
    else map.setView(SINGAPORE_CENTER, 11, { animate: mode === 'smooth' })
    return
  }
  const padding = { paddingTopLeft: [40, 90], paddingBottomRight: [40, 40], maxZoom: 15 }
  if (mode === 'fly') map.flyToBounds(pts, { ...padding, duration: 0.8 })
  else map.fitBounds(pts, { ...padding, animate: mode === 'smooth' })
}

// applyFit() - fit to everyone, but only once per show and only when both the map and data exist.
function applyFit() {
  if (!map || !boardLoaded || !needFit) return
  needFit = false
  fitAll(hasFitted ? 'smooth' : 'jump')
  hasFitted = true
}

// coveredInsets() - measures how much of the map is covered: the top bar at the top, the bottom card
// at the bottom, and the free height between.
function coveredInsets() {
  const box = map.getContainer().getBoundingClientRect()
  const top = barEl.value ? barEl.value.getBoundingClientRect().bottom - box.top : 0
  const cardTop = cardEl.value ? cardEl.value.getBoundingClientRect().top - box.top : box.height
  return { top, bottom: box.height - cardTop, free: cardTop - top }
}

// mobileInsets(maxRoom) - extra padding for phones so the pins stay clear of the bar and the card.
function mobileInsets(maxRoom = 90) {
  const { top, bottom, free } = coveredInsets()
  const room = Math.max(20, Math.min(maxRoom, (free - 100) / 2))
  return { top: top + room, bottom: bottom + room }
}

// limitView(zoom) - keeps the map within Singapore. With no selection (or on desktop) use the base
// bounds; on phones with a card, enlarge the bounds by the covered part so the pins can reach the
// visible area.
function limitView(zoom) {
  if (!map || !baseBounds) return
  if (!selectedId.value || isDesktop()) {
    map.setMinZoom(Math.max(11, map.getBoundsZoom(baseBounds, true)))
    map.setMaxBounds(baseBounds)
    return
  }
  const covered = coveredInsets()
  const pad = L.point(0, covered.top + covered.bottom)
  map.setMinZoom(Math.max(11, map.getBoundsZoom(baseBounds, true, pad)))
  const z = zoom ?? map.getZoom()
  const sw = map.project(baseBounds.getSouthWest(), z).add(L.point(0, covered.bottom))
  const ne = map.project(baseBounds.getNorthEast(), z).subtract(L.point(0, covered.top))
  map.setMaxBounds(L.latLngBounds(map.unproject(sw, z), map.unproject(ne, z)))
}

// cameraFor(pts, padTL, padBR, maxZoom) - the zoom and centre that fit the points inside the uncovered
// area (also in the Allocation board).
function cameraFor(pts, padTL, padBR, maxZoom) {
  const bounds = L.latLngBounds(pts)
  const zoom = Math.min(map.getBoundsZoom(bounds, false, padTL.add(padBR)), maxZoom)
  const offset = padBR.subtract(padTL).divideBy(2)
  const sw = map.project(bounds.getSouthWest(), zoom)
  const ne = map.project(bounds.getNorthEast(), zoom)
  const target = map.unproject(sw.add(ne).divideBy(2).add(offset), zoom)
  return { zoom, target }
}

// isClear(pt, camera, padTL, padBR) - true if a point would be in the uncovered area with that camera.
function isClear(pt, camera, padTL, padBR) {
  const size = map.getSize()
  const p = map
    .project(pt, camera.zoom)
    .subtract(map.project(camera.target, camera.zoom))
    .add(size.divideBy(2))
  return p.x >= padTL.x && p.x <= size.x - padBR.x && p.y >= padTL.y && p.y <= size.y - padBR.y
}

// flyIfMoved(camera, duration) - fly to the camera only if the map is not already there (within 10 px
// at the same zoom).
function flyIfMoved(camera, duration) {
  const closeEnough =
    map.getZoom() === camera.zoom &&
    map.project(map.getCenter(), camera.zoom).distanceTo(map.project(camera.target, camera.zoom)) < 10
  if (closeEnough) return
  map.flyTo(camera.target, camera.zoom, { duration })
}

// focusOn(v) - zoom so the volunteer and their school are both in view; if the volunteer would be
// hidden, zoom to the volunteer alone.
function focusOn(v) {
  if (!map) return
  const pts = []
  if (v.lat != null) pts.push([v.lat, v.lng])
  if (v.school?.lat != null) pts.push([v.school.lat, v.school.lng])
  if (!pts.length) return

  limitView()
  const inset = isDesktop() ? { top: 150, bottom: 70 } : mobileInsets()
  const left = isDesktop() ? 440 : 60
  const padTL = L.point(left, inset.top)
  const padBR = L.point(60, inset.bottom)

  let camera = cameraFor(pts, padTL, padBR, FOCUS_ZOOM)
  if (v.lat != null && !isClear([v.lat, v.lng], camera, padTL, padBR)) {
    camera = cameraFor([[v.lat, v.lng]], padTL, padBR, SOLO_ZOOM)
  }
  limitView(camera.zoom)
  flyIfMoved(camera, 0.5)
}

// viewRing(ring) - the Inner / Outer buttons: fly so the whole ring fits.
function viewRing(ring) {
  if (!map) return
  const inset = isDesktop() ? { top: 70, bottom: cardH.value + 20 } : mobileInsets(20)
  const padTL = L.point(isDesktop() ? 300 : 20, inset.top)
  const padBR = L.point(20, inset.bottom)
  const camera = cameraFor(ring, padTL, padBR, map.getMaxZoom())
  limitView(camera.zoom)
  flyIfMoved(camera, 0.6)
}

// showSchool(v) - pins tooltips on the volunteer and their school marker. The marker further north
// gets its tooltip above and the other below, so they never overlap.
function showSchool(v) {
  clearSchool()
  const s = v.school
  const entry = markers.get(v.volunteerId)
  const hasSchool = s?.lat != null && s?.lng != null

  const schoolNorth = hasSchool && (v.lat == null || s.lat >= v.lat)

  if (entry) {
    pinnedId = v.volunteerId
    bindTip(entry.marker, volTip(v), { pinned: true, direction: schoolNorth ? 'bottom' : 'top' })
  }

  if (!map || !hasSchool) return

  schoolMarker = L.marker([s.lat, s.lng], { icon: createSchoolIcon() }).addTo(volunteerLayer)
  bindTip(schoolMarker, schoolTip(s), { pinned: true, direction: schoolNorth ? 'top' : 'bottom' })
}

// clearSchool() - removes the school marker and makes the volunteer's tooltip hover-only again.
function clearSchool() {
  if (schoolMarker) volunteerLayer.removeLayer(schoolMarker)
  schoolMarker = null

  const entry = markers.get(pinnedId)
  const v = rows.value.find((r) => r.volunteerId === pinnedId)
  if (entry && v) bindTip(entry.marker, volTip(v))
  pinnedId = null
}

// selectedUnread (computed) - unread chat messages from the selected volunteer (the red number on the
// Chat button).
const selectedUnread = computed(
  () => chat.threads.find((t) => t.volunteerId === String(selectedId.value))?.unreadAdmin ?? 0,
)

// openChatWithSelected() - open the chat panel on the selected volunteer's conversation.
function openChatWithSelected() {
  if (selectedId.value) chat.openThread(selectedId.value)
}

const timesOpen = ref(false)

// journeyTimes(v) - one row per checkpoint with the time it was clocked (from the history), plus link
// (both ends reached, solid line) and flow (the line currently being travelled, animated).
function journeyTimes(v) {
  return JOURNEY_STAGES.map((s) => ({
    ...s,
    at: (v.stageHistory || []).find((h) => h.stage === s.stage)?.at ?? null,
    link: s.stage < v.stage,
    flow: s.stage === v.stage && v.stage < JOURNEY_STAGES.length,
  }))
}

// formatStageTime(at) - a clock time such as "8:15 AM" in Singapore time.
function formatStageTime(at) {
  return new Date(at).toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  })
}

// measureCard() - after the card renders, store its height plus 12 px so the map controls move above
// it. Re-run when the times list opens or the stage changes.
async function measureCard() {
  await nextTick()
  if (selectedId.value && cardEl.value) cardH.value = cardEl.value.offsetHeight + 12
}
// watch(timesOpen) - when the times section opens or closes, re-measure the card height.
watch(timesOpen, measureCard)
// watch(cardH) - when the card height changes, keep the map inside its allowed area.
watch(cardH, () => limitView())
// watch(selected stage) - when the selected volunteer's stage changes, re-measure the card.
watch(() => selected.value?.stage, measureCard)

// selectVolunteer(id) - select someone (from the list or a marker). Steps: close the phone keyboard,
// close the times list if it is a different person, set the selection and search text, if it was
// already selected just re-centre, otherwise pin the tooltips, wait for the card, measure it and fly
// to the volunteer.
async function selectVolunteer(id) {
  const v = rows.value.find((r) => r.volunteerId === id)
  if (!v) return

  inputEl.value?.blur()
  const alreadySelected = selectedId.value === id
  if (!alreadySelected) timesOpen.value = false
  selectedId.value = id
  query.value = v.name
  searchOpen.value = false

  if (alreadySelected) {
    focusOn(v)
    return
  }

  showSchool(v)
  await nextTick()
  cardH.value = cardEl.value ? cardEl.value.offsetHeight + 12 : 0
  focusOn(v)
}

// clearSelection(fit) - deselect: stop following, hide the card and school marker, and zoom back out
// when fit is true.
function clearSelection(fit = true) {
  following.value = false
  selectedId.value = null
  limitView()
  timesOpen.value = false
  query.value = ''
  cardH.value = 0
  clearSchool()
  if (fit) fitAll()
}

// watch(selected) - if the selected volunteer drops off the board, clear the card.
watch(selected, (v) => {
  if (!v && selectedId.value) clearSelection(false)
})

// onShowMenuOpen() - the show dropdown just opened: close the search list and the bell, and close the
// selected volunteer's card.
function onShowMenuOpen() {
  searchOpen.value = false
  bellOpen.value = false
  clearSelection(false)
}

// chooseShow(s) - a show was picked in the dropdown: ignore it if it is already the current show,
// otherwise store it and load that show (AppDropdown closes its own menu).
function chooseShow(s) {
  if (s === selectedShow.value) return
  selectedShow.value = s
  onShowChange()
}

const inputEl = ref(null)

// onSearchFocus(e) - open the results, close the bell and select the text so typing replaces the name.
function onSearchFocus(e) {
  searchOpen.value = true
  bellOpen.value = false
  e.target.select()
}

// pickFirst() - Enter picks the first search result.
function pickFirst() {
  if (results.value[0]) selectVolunteer(results.value[0].volunteerId)
}

// clearQuery() - the X in the search box: deselect, clear the text and keep focus in the box.
function clearQuery() {
  if (selectedId.value) clearSelection()
  query.value = ''
  inputEl.value?.focus()
}

const toasts = ref([])
const toastTimers = new Map()
let toastSeq = 0

const chat = useChatStore()
const zoneEvents = useZoneEventsStore()
const bellOpen = ref(false)
const eventFilter = ref('all')

// showEvents and unread (computed) - events and the unread count for the show being viewed; eventRows
// (below) applies the All / Arrivals / Departures filter and adds the "ago" text; emptyEventsMsg
// explains an empty list.
const showEvents = computed(() => zoneEvents.byShow[selectedShow.value] ?? [])
// unread (computed) - number of unread zone events for the selected show.
const unread = computed(() => zoneEvents.unreadByShow[selectedShow.value] ?? 0)

// Events matching the toggle, with their "x min ago" text
const eventRows = computed(() =>
  showEvents.value
    .filter((e) => eventFilter.value === 'all' || (eventFilter.value === 'enter') === e.enter)
    .map((e) => ({ ...e, ago: ageText(now.value - e.at) })),
)

// emptyEventsMsg (computed) - the text shown when the events list is empty (no activity yet, or no
// arrivals / departures yet for the chosen filter).
const emptyEventsMsg = computed(() => {
  if (!showEvents.value.length) return 'No zone activity yet.'
  return `No ${eventFilter.value === 'enter' ? 'arrivals' : 'departures'} yet.`
})

// recordEvent(a) - saves an event in the store; it counts as unread when the panel is closed.
function recordEvent(a) {
  zoneEvents.add(selectedShow.value, a, !bellOpen.value)
}

// toggleBell() - open or close the alerts panel; opening marks all as read, closes the search and
// volunteer card, and removes the floating cards.
function toggleBell() {
  bellOpen.value = !bellOpen.value
  if (bellOpen.value) {
    zoneEvents.markRead(selectedShow.value)
    searchOpen.value = false
    clearSelection(false)
    clearToasts()
  }
}

// openEvent(e) - tapping an event selects that volunteer.
function openEvent(e) {
  bellOpen.value = false
  selectVolunteer(e.volunteerId)
}

const lastZone = new Map()
const pendingZone = new Map()

// detectZoneChanges() - after every refresh, compare each volunteer's zone with the last confirmed
// one. 1) skip those without a location 2) first sighting: just record it 3) same zone: forget any
// pending change (it was a wobble) 4) a change far enough past the edge (more than 10 m or the GPS
// accuracy) alerts at once 5) a change near the edge needs a second sighting on the next refresh 6)
// forget volunteers no longer on the board.
function detectZoneChanges() {
  const seen = new Set()

  rows.value.forEach((v) => {
    seen.add(v.volunteerId)
    if (v.zone === 'none') return

    const last = lastZone.get(v.volunteerId)
    if (last === undefined) {
      lastZone.set(v.volunteerId, v.zone)
      return
    }
    if (v.zone === last) {
      pendingZone.delete(v.volunteerId)
      return
    }
    const clearCut = zoneDepth(v) > Math.max(IMMEDIATE_M, v.accuracy ?? 0)

    if (!clearCut && pendingZone.get(v.volunteerId) !== v.zone) {
      pendingZone.set(v.volunteerId, v.zone)
      return
    }

    pendingZone.delete(v.volunteerId)
    lastZone.set(v.volunteerId, v.zone)
    addAlert(v, last, v.zone)
  })

  ;[lastZone, pendingZone].forEach((m) =>
    m.forEach((_, id) => {
      if (!seen.has(id)) m.delete(id)
    }),
  )
}

// addAlert(v, from, to) - build the alert (arrival if the new zone is closer to the venue; text such
// as "Entered the inner ring") and show a card and save an event.
function addAlert(v, from, to) {
  const enter = ZONE_RANK[to] > ZONE_RANK[from]
  const ring = enter ? to : to === 'outer' ? 'inner' : 'outer'
  const alert = {
    volunteerId: v.volunteerId,
    name: v.name,
    enter,
    text: `${enter ? 'Entered' : 'Left'} the ${ring} ring`,
  }
  showToast(alert)
  recordEvent(alert)
}

// showToast(t) - put a new card at the top, drop (and stop the timers of) cards beyond MAX_TOASTS and
// start the 8 second auto-dismiss timer.
function showToast(t) {
  const toast = { id: ++toastSeq, ...t }
  const next = [toast, ...toasts.value]

  next.slice(MAX_TOASTS).forEach((old) => {
    clearTimeout(toastTimers.get(old.id))
    toastTimers.delete(old.id)
  })
  toasts.value = next.slice(0, MAX_TOASTS)
  toastTimers.set(
    toast.id,
    setTimeout(() => dismissToast(toast.id), TOAST_MS),
  )
}

// dismissToast(id) - remove one card and its timer.
function dismissToast(id) {
  clearTimeout(toastTimers.get(id))
  toastTimers.delete(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// openToast(t) - tapping a card dismisses it and selects the volunteer.
function openToast(t) {
  dismissToast(t.id)
  selectVolunteer(t.volunteerId)
}

// clearToasts() - remove all cards and stop their timers.
function clearToasts() {
  toastTimers.forEach((timer) => clearTimeout(timer))
  toastTimers.clear()
  toasts.value = []
}

// loadBoard() - fetch the board for the selected show. Numbers each request so a slow older answer is
// ignored; then correct the clock offset, store the volunteers, check zone changes, clear the error,
// mark loaded, and fit the map once. On error show the message (the old data stays). The overlay is
// cleared only by the latest request.
async function loadBoard() {
  if (!selectedShow.value) return
  const myId = ++requestId

  try {
    const res = await axios.get('/api/locations/board', { params: { show: selectedShow.value } })
    if (myId !== requestId) return

    clockOffset = new Date(res.data.serverTime).getTime() - Date.now()
    now.value = Date.now()
    volunteers.value = res.data.volunteers
    detectZoneChanges()
    error.value = ''
    boardLoaded = true

    await nextTick()
    applyFit()
  } catch (err) {
    if (myId !== requestId) return
    error.value = err.response?.data?.message || 'Could not load volunteers.'
  } finally {
    if (myId === requestId) loading.value = false
  }
}

// onShowChange() - a different show: deselect, forget the old zone baseline (so no alerts on the first
// load), clear cards and data, show the overlay and load.
function onShowChange() {
  clearSelection(false)
  lastZone.clear()
  pendingZone.clear()
  clearToasts()
  bellOpen.value = false
  volunteers.value = []
  loading.value = true
  boardLoaded = false
  needFit = true
  loadBoard()
}

// onVisibilityChange() - refresh at once when the tab becomes visible again.
function onVisibilityChange() {
  if (document.visibilityState === 'visible') loadBoard()
}

let disposed = false
// onMounted - load the show list (and reopen the show picked earlier), load the first board, then
// start the 5 second poll, the 30 second clock and the visibility listener.
onMounted(async () => {
  try {
    const res = await axios.get('/api/locations/shows')
    shows.value = res.data
    selectedShow.value = shows.value.includes(getSavedShow())
      ? getSavedShow()
      : (shows.value[0] ?? '')
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load shows.'
    loading.value = false
    return
  }

  if (disposed) return
  needFit = true
  await loadBoard()
  if (disposed) return

  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadBoard()
  }, POLL_MS)
  tickTimer = setInterval(() => (now.value = Date.now()), TICK_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

// onUnmounted - stop timers, listeners, marker animations and cards.
onUnmounted(() => {
  disposed = true
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  markers.forEach((entry) => cancelAnimationFrame(entry.frame))
  clearToasts()
})
</script>

<template>
  <!-- The map, the volunteer list and filters, the selected-volunteer card, the alerts bell and
       the popups. -->
  <div class="map-page">
    <div class="map-stage" :style="{ '--map-inset-bottom': cardH + 'px', '--notice-top': '96px' }">
      <BaseMap :center="SINGAPORE_CENTER" :zoom="11" testid="hq-map" @ready="onMapReady" />

      <div class="ring-views" role="group" aria-label="Quick map views">
        <button type="button" class="ring-btn" @click="viewRing(INNER_RING)">
          <i class="bi bi-bullseye" aria-hidden="true"></i> Inner
        </button>
        <button type="button" class="ring-btn" @click="viewRing(OUTER_RING)">
          <i class="bi bi-record-circle" aria-hidden="true"></i> Outer
        </button>
      </div>

      <div ref="barEl" class="board-bar">
        <div class="bar-row">
          <AppDropdown
            :model-value="selectedShow"
            :options="showOptions"
            icon="bi-calendar-event"
            placeholder="Show"
            aria-label="Show"
            testid="hq-show-select"
            @update:model-value="chooseShow"
            @open="onShowMenuOpen"
          />

          <div class="search-box">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="Find by name"
              autocomplete="off"
              aria-label="Find by name"
              data-testid="hq-search"
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

          <button
            type="button"
            class="bell-btn"
            :class="{ active: bellOpen }"
            aria-label="Zone activity"
            data-testid="hq-bell"
            :aria-expanded="bellOpen"
            @click="toggleBell"
          >
            <i class="bi" :class="bellOpen ? 'bi-bell-fill' : 'bi-bell'"></i>
            <span v-if="unread" class="bell-badge">{{ unread > 9 ? '9+' : unread }}</span>
          </button>
        </div>

        <div v-if="rows.length" class="zone-row" aria-label="Volunteers by zone">
          <span v-for="z in ZONES" :key="z.key" class="zone-chip" :title="z.hint">
            <span class="zone-dot" :class="z.key"></span>{{ z.label }}
            <strong :data-testid="'hq-zone-count-' + z.key">{{ zoneCounts[z.key] }}</strong>
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
            data-testid="hq-result"
            @mousedown.prevent="selectVolunteer(v.volunteerId)"
          >
            <span class="status-dot" :class="v.status"></span>
            <span class="result-main">
              <span class="result-name">{{ v.name }}</span>
              <span class="result-sub"
                >{{ v.school?.name || 'No school' }} · {{ v.stageLabel }}</span
              >
            </span>
            <span class="result-ago">{{ v.ago || STATUS[v.status].label }}</span>
          </button>
          <div v-if="!results.length" class="results-empty">No volunteers found.</div>
        </div>

        <div v-if="bellOpen" class="activity">
          <div class="activity-head">
            <div class="activity-title">Zone activity</div>
            <button type="button" class="icon-btn" aria-label="Close" @click="bellOpen = false">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div class="seg" role="group" aria-label="Filter events">
            <button
              v-for="f in EVENT_FILTERS"
              :key="f.key"
              type="button"
              class="seg-btn"
              :class="{ active: eventFilter === f.key }"
              @click="eventFilter = f.key"
            >
              {{ f.label }}
            </button>
          </div>

          <div class="activity-list">
            <button
              v-for="e in eventRows"
              :key="e.id"
              type="button"
              class="event"
              data-testid="hq-event"
              @click="openEvent(e)"
            >
              <span class="event-icon" :class="e.enter ? 'enter' : 'leave'" aria-hidden="true">
                <i class="bi" :class="e.enter ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right'"></i>
              </span>
              <span class="event-main">
                <span class="event-name">{{ e.name }}</span>
                <span class="event-text">{{ e.text }}</span>
              </span>
              <span class="event-ago">{{ e.ago }}</span>
            </button>
            <div v-if="!eventRows.length" class="results-empty">{{ emptyEventsMsg }}</div>
          </div>

          <div class="activity-foot">
            Last {{ MAX_EVENTS }} events per show · cleared when you log out
          </div>
        </div>
      </div>

      <Transition name="card">
        <div v-if="selected" ref="cardEl" class="vol-card">
          <div class="vol-card-head">
            <div class="vol-avatar" :class="selected.status" aria-hidden="true">
              <i class="bi bi-person-fill"></i>
            </div>
            <div class="vol-card-title">
              <div class="vol-name">{{ selected.name }}</div>
              <div class="vol-status" data-testid="vol-card-status">
                <span class="status-dot" :class="selected.status"></span>
                {{ STATUS[selected.status].label
                }}<template v-if="selected.ago"> · {{ selected.ago }}</template>
              </div>
            </div>
            <button
              type="button"
              class="icon-btn follow-btn"
              :class="{ active: following }"
              :aria-pressed="following"
              :aria-label="following ? 'Stop following volunteer' : 'Follow volunteer'"
              :title="following ? 'Stop following' : 'Follow volunteer'"
              data-testid="vol-card-follow"
              @click="toggleFollow"
            >
              <i class="bi" :class="following ? 'bi-crosshair2' : 'bi-crosshair'"></i>
            </button>
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

          <div class="vol-journey">
            <button
              type="button"
              class="stage-chip"
              :class="{ none: !selected.stage, complete: selected.stage === JOURNEY_STAGES.length }"
              :aria-expanded="timesOpen"
              data-testid="vol-card-stage"
              @click="timesOpen = !timesOpen"
            >
              <i class="bi bi-signpost-split-fill" aria-hidden="true"></i>
              <span class="stage-chip-text">{{ selected.stageLabel }}</span>
              <span class="stage-chip-count">{{ selected.stage }}/{{ JOURNEY_STAGES.length }}</span>
              <i
                class="bi"
                :class="timesOpen ? 'bi-chevron-up' : 'bi-chevron-down'"
                aria-hidden="true"
              ></i>
            </button>
            <ol
              v-if="timesOpen"
              class="stage-times"
              :class="{ complete: selected.stage === JOURNEY_STAGES.length }"
            >
              <li
                v-for="t in journeyTimes(selected)"
                :key="t.stage"
                :class="{ reached: t.at, link: t.link, flow: t.flow }"
              >
                <span class="stage-times-dot" aria-hidden="true"></span>
                <span class="stage-times-name">{{ t.label }}</span>
                <span class="stage-times-at">{{ t.at ? formatStageTime(t.at) : '—' }}</span>
              </li>
            </ol>
          </div>

          <button
            type="button"
            class="btn btn-primary btn-sm w-100 mt-2 position-relative chat-btn"
            data-chat-toggle
            data-testid="vol-card-chat"
            @click="openChatWithSelected"
          >
            <i class="bi bi-chat-dots-fill me-1" aria-hidden="true"></i>Chat with
            {{ selected.name }}
            <span v-if="selectedUnread" class="badge rounded-pill bg-danger ms-1">{{
              selectedUnread > 99 ? '99+' : selectedUnread
            }}</span>
          </button>
        </div>
      </Transition>

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

      <div v-if="emptyMsg" class="empty-pill bg-dark text-white">{{ emptyMsg }}</div>

      <Transition name="loading-fade">
        <MapLoading v-if="loading" text="Fetching Volunteer Data..." />
      </Transition>

      <MapNotice :notice="errorNotice" @close="error = ''" />
    </div>
  </div>
</template>

<style scoped>
/* Styles for the live board panels, pins and cards (the map and its panels stay light). */

.board-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 1060;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px;
  background: #fff;
  color: #1f2430;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border-radius: 9px;
  color: #555;
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

.icon-btn.follow-btn.active {
  background: #2563eb;
  color: #fff;
}

.search-box .icon-btn {
  width: 26px;
  height: 26px;
}

.results {
  margin-top: 6px;
  max-height: 50vh;
  overflow-y: auto;
  background: #fff;
  color: #1f2430;
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
  color: #1f2430;
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

.status-dot {
  flex: 0 0 auto;
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 2px;
  border-radius: 50%;
  background: #9aa0a6;
}
.status-dot.live {
  background: #16a34a;
}
.status-dot.stale {
  background: #f59e0b;
}
.status-dot.offline {
  background: #dc2626;
}
.status-dot.none {
  background: #d3d6da;
}

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
.vol-avatar.live {
  background: #16a34a;
}
.vol-avatar.stale {
  background: #f59e0b;
}
.vol-avatar.offline {
  background: #dc2626;
}

.vol-card-title {
  flex: 1 1 auto;
  min-width: 0;
}

.info-value {
  color: #1f2430;
}

.vol-name {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.2;
  color: #1f2430;
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
  grid-template-columns: 1.5fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.vol-journey {
  margin-top: 10px;
}
.stage-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: 1px solid #cfdcfb;
  border-radius: 12px;
  background: #eef3ff;
  color: #1d4fd8;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
}
.stage-chip.none {
  border-color: #e6eaf0;
  background: #f6f8fb;
  color: #777;
}
.stage-chip.complete {
  border-color: #bfe5cb;
  background: #e7f6ec;
  color: #166534;
}
.stage-chip-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-chip-count {
  flex: 0 0 auto;
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.75;
}
.stage-times {
  margin: 8px 0 0;
  padding: 0 4px;
  max-height: 30vh;
  overflow-y: auto;
  list-style: none;
}
.stage-times li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 0.8rem;
  color: #aaa;
}
.stage-times li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 3px;
  top: calc(50% + 4px);
  width: 2px;
  height: 100%;
  background: #e1e5ea;
}
.stage-times li.link::after {
  background: #2563eb;
}
.stage-times li.flow::after {
  background: repeating-linear-gradient(180deg, #2563eb 0 5px, #bcd0fb 5px 10px);
  background-size: 100% 10px;
  animation: stage-flow 0.8s linear infinite;
}
.stage-times.complete li.reached .stage-times-dot,
.stage-times.complete li.link::after {
  background: #16a34a;
}
@keyframes stage-flow {
  to {
    background-position: 0 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .stage-times li.flow::after {
    animation: none;
  }
}
.stage-times li.reached {
  color: #1f2430;
}
.stage-times-dot {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d3d6da;
}
.stage-times li.reached .stage-times-dot {
  background: #2563eb;
}
.stage-times-name {
  flex: 1 1 auto;
  min-width: 0;
}
.stage-times-at {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.chat-btn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-enter-active,
.card-leave-active {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}
.card-enter-from,
.card-leave-to {
  transform: translateY(16px);
  opacity: 0;
}

.empty-pill {
  position: absolute;
  left: 50%;
  bottom: calc(24px + var(--map-inset-bottom, 0px));
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

.zone-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.zone-row::-webkit-scrollbar {
  display: none;
}

.zone-chip {
  flex: 1 1 auto;
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

.zone-dot {
  box-sizing: border-box;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #d3d6da;
}
.zone-dot.inner {
  background: #0d6efd;
}
.zone-dot.outer {
  background: #cfe0fb;
  border: 2px solid #6c757d;
}
.zone-dot.outside {
  background: #fff;
  border: 2px solid #9aa0a6;
}

.toast-stack {
  position: absolute;
  top: 96px;
  left: 12px;
  right: 12px;
  z-index: 1055;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
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
  color: #1f2430;
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
.toast-icon.enter {
  background: #16a34a;
}
.toast-icon.leave {
  background: #f59e0b;
}

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
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

.bell-btn {
  position: relative;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #555;
  font-size: 1.1rem;
}

.bell-btn:hover,
.bell-btn.active {
  background: #f1f3f6;
}

.bell-badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  box-sizing: border-box;
  border: 2px solid #fff;
  border-radius: 9px;
  background: #dc2626;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 13px;
  text-align: center;
}

.activity {
  margin-top: 6px;
  background: #fff;
  color: #1f2430;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
  overflow: hidden;
}

.activity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 4px 14px;
}

.activity-title {
  font-size: 0.95rem;
  font-weight: 600;
}

.seg {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 4px 12px 8px;
  padding: 3px;
  background: #f1f3f6;
  border-radius: 10px;
}

.seg-btn {
  padding: 6px 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #555;
  font-size: 0.8rem;
  font-weight: 600;
}

.seg-btn.active {
  background: #2563eb;
  color: #fff;
}

.activity-list {
  max-height: 45vh;
  overflow-y: auto;
}

.event {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 0;
  background: transparent;
  text-align: left;
}

.event:hover {
  background: #f5f7fa;
}

.event-icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #fff;
  font-size: 0.95rem;
}
.event-icon.enter {
  background: #16a34a;
}
.event-icon.leave {
  background: #f59e0b;
}

.event-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.event-name {
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #1f2430;
}

.event-text {
  font-size: 0.75rem;
  color: #888;
}

.event-ago {
  flex: 0 0 auto;
  font-size: 0.75rem;
  color: #888;
}

.activity-foot {
  padding: 8px 14px 10px;
  font-size: 0.7rem;
  color: #999;
  border-top: 1px solid #eceef1;
}

@media (min-width: 992px) {
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
  .empty-pill {
    bottom: 24px;
  }
}

@media (max-width: 575.98px) {
  .zone-row {
    gap: 4px;
  }
  .zone-chip {
    flex: 1 1 auto;
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

@media (max-width: 359.98px) {
  .zone-dot {
    display: none;
  }
}

.ring-views {
  position: absolute;
  right: 10px;
  bottom: calc(
    var(--map-inset-bottom) + 120px
  );
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ring-btn {
  padding: 6px 12px;
  border: 0;
  border-radius: 10px;
  background: #fff;
  color: var(--hw-navy);
  font-size: 0.85rem;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
}
.ring-btn:hover {
  background: #f1f3f5;
}
</style>
