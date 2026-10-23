<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/BaseMap.vue'
import MapLoading from '@/components/MapLoading.vue'
import MapNotice from '@/components/MapNotice.vue'
import { createVolIcon, createSchoolIcon, volTip, schoolTip, bindTip } from '@/utils/map-icons'
import { useZoneEventsStore, MAX_EVENTS } from '@/services/zone-events'
import { useChatStore } from '@/services/chat'
import { getSavedShow, saveShow } from '@/services/selected-show'
import { SINGAPORE_CENTER, INNER_RING, OUTER_RING } from '@/utils/constants'

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
const POLL_MS = 5000 // how often the board is refreshed
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
const EVENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'enter', label: 'Arrivals' },
  { key: 'leave', label: 'Departures' },
]
const TOAST_MS = 8000 // how long an alert card stays
const ZONE_RANK = { outside: 0, outer: 1, inner: 2 } // higher = closer to the venue

/* ------------------------------------------------------------------ */
/* Vue state (reactive, used by the template)                          */
/* ------------------------------------------------------------------ */
const shows = ref([]) // e.g. ['NE Show 1', ...] for the dropdown
const selectedShow = ref('')
watch(selectedShow, (s) => s && saveShow(s)) // remember the pick for this session
const volunteers = ref([]) // raw board data from the server
const loading = ref(true)

const error = ref('')
const errorNotice = computed(() =>
  error.value
    ? {
        type: 'error',
        icon: 'bi-exclamation-triangle-fill',
        title: 'Something went wrong',
        text: error.value,
      }
    : null
)

const query = ref('') // search text (name only)
const searchOpen = ref(false) // is the result list showing
const showMenuOpen = ref(false) // is the show dropdown open
const showEl = ref(null) // the dropdown wrapper (for outside-click detection)
const selectedId = ref(null) // volunteer currently selected
const now = ref(Date.now()) // ticks so "x min ago" stays current
const cardEl = ref(null)
const cardH = ref(0) // height of the bottom card on mobile (moves map controls up)

let clockOffset = 0 // server time minus browser time, so a wrong phone clock can't skew freshness
const serverNow = computed(() => now.value + clockOffset)

// "Just now" / "5 min ago" / "2 h ago" from a number of milliseconds
function ageText(ms) {
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  return `${Math.floor(mins / 60)} h ago`
}

// Time since the volunteer's last update, as text
function agoText(v) {
  if (!v.updatedAt) return ''
  return ageText(serverNow.value - new Date(v.updatedAt).getTime())
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
let hasFitted = false // false until the first fit: the very first fit jumps straight there, no animation
let requestId = 0 // guards against slow responses overwriting newer ones
let pollTimer = null
let tickTimer = null

const isDesktop = () => window.matchMedia('(min-width: 992px)').matches


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
    bellOpen.value = false // tapping the map closes the panel
    if (selectedId.value) clearSelection() // and deselects, zooming back out to show everyone (same as the card's X button)
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

// Show every volunteer who has a location. mode:
//   'fly'    : flyTo animation (it zooms OUT then back IN; fine for the deselect button, where we come from a close zoom)
//   'smooth' : straight pan/zoom to the target, no out-and-in arc (used when switching show)
//   'jump'   : no animation at all (used for the first fit when the board opens)
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

// Fit to everyone, but only once per show, and only after both the map and data exist
function applyFit() {
  if (!map || !boardLoaded || !needFit) return
  needFit = false
  fitAll(hasFitted ? 'smooth' : 'jump') // first time: jump (no zoom-out-and-in); later shows: smooth
  hasFitted = true
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

  // Work out where the camera should end up (the same maths flyToBounds does internally)
  const bounds = L.latLngBounds(pts)
  const padTL = L.point(left, 150)
  const padBR = L.point(60, bottom)
  const zoom = Math.min(map.getBoundsZoom(bounds, false, padTL.add(padBR)), FOCUS_ZOOM)
  const offset = padBR.subtract(padTL).divideBy(2)
  const sw = map.project(bounds.getSouthWest(), zoom)
  const ne = map.project(bounds.getNorthEast(), zoom)
  const target = map.unproject(sw.add(ne).divideBy(2).add(offset), zoom)

  // Already there? Do nothing.
  const closeEnough =
    map.getZoom() === zoom &&
    map.project(map.getCenter(), zoom).distanceTo(map.project(target, zoom)) < 10 // pixels
  if (closeEnough) return

  map.flyTo(target, zoom, { duration: 0.5 })
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

// Unread chat messages from the selected volunteer (shown on the Chat button)
const selectedUnread = computed(
  () => chat.threads.find((t) => t.volunteerId === String(selectedId.value))?.unreadAdmin ?? 0,
)

// Opens the chat panel on the selected volunteer's conversation
function openChatWithSelected() {
  if (selectedId.value) chat.openThread(selectedId.value)
}

// Selects a volunteer (from the list or by tapping their marker)
async function selectVolunteer(id) {
  const v = rows.value.find((r) => r.volunteerId === id)
  if (!v) return

  const alreadySelected = selectedId.value === id
  selectedId.value = id
  query.value = v.name
  searchOpen.value = false

  // Same volunteer tapped again: keep the pins and card as they are,
  // and only re-centre if they have wandered out of the usual framing.
  if (alreadySelected) {
    focusOn(v)
    return
  }

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
/* Show dropdown                                                       */
/* ------------------------------------------------------------------ */

// Opens or closes the menu (and closes the other dropdowns)
function toggleShowMenu() {
  showMenuOpen.value = !showMenuOpen.value
  if (showMenuOpen.value) {
    searchOpen.value = false
    bellOpen.value = false
    if (isDesktop()) { // Clear the selected volunteer if on desktop when toggle show
      clearSelection(false);
    }
  }
}

// Picks a show and loads it (does nothing if it's already the current one)
function chooseShow(s) {
  showMenuOpen.value = false
  if (s === selectedShow.value) return
  selectedShow.value = s
  onShowChange()
}

// Closes the menu when tapping anywhere outside it
function onDocPointerDown(e) {
  if (showMenuOpen.value && showEl.value && !showEl.value.contains(e.target)) {
    showMenuOpen.value = false
  }
}

/* ------------------------------------------------------------------ */
/* Search box                                                          */
/* ------------------------------------------------------------------ */
const inputEl = ref(null)

function onSearchFocus(e) {
  searchOpen.value = true
  bellOpen.value = false // only one dropdown at a time
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

// Bell list: events live in a Pinia store (survives refreshes, cleared on logout)
const chat = useChatStore()
const zoneEvents = useZoneEventsStore()
const bellOpen = ref(false)
const eventFilter = ref('all') // 'all' | 'enter' | 'leave'

// Events and unread count for the show being viewed
const showEvents = computed(() => zoneEvents.byShow[selectedShow.value] ?? [])
const unread = computed(() => zoneEvents.unreadByShow[selectedShow.value] ?? 0)

// Events matching the toggle, with their "x min ago" text
const eventRows = computed(() =>
  showEvents.value
    .filter((e) => eventFilter.value === 'all' || (eventFilter.value === 'enter') === e.enter)
    .map((e) => ({ ...e, ago: ageText(now.value - e.at) })),
)

const emptyEventsMsg = computed(() => {
  if (!showEvents.value.length) return 'No zone activity yet.'
  return `No ${eventFilter.value === 'enter' ? 'arrivals' : 'departures'} yet.`
})

// Saves an event; it counts as unread if the panel is closed
function recordEvent(a) {
  zoneEvents.add(selectedShow.value, a, !bellOpen.value)
}

// Opens or closes the panel. Opening marks everything as read.
function toggleBell() {
  bellOpen.value = !bellOpen.value
  if (bellOpen.value) {
    zoneEvents.markRead(selectedShow.value)
    searchOpen.value = false // only one dropdown at a time
  }
}

// Tapping an event selects that volunteer
function openEvent(e) {
  bellOpen.value = false
  selectVolunteer(e.volunteerId)
}

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

// Turns a zone change into an alert card and a bell-list event
function addAlert(v, from, to) {
  const enter = ZONE_RANK[to] > ZONE_RANK[from]
  const ring = enter ? to : to === 'outer' ? 'inner' : 'outer' // the ring that was entered or left
  const alert = {
    volunteerId: v.volunteerId,
    name: v.name,
    enter,
    text: `${enter ? 'Entered' : 'Left'} the ${ring} ring`,
  }
  showToast(alert)
  recordEvent(alert)
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
  bellOpen.value = false
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
  document.addEventListener('pointerdown', onDocPointerDown, true)
  try {
    const res = await axios.get('/api/locations/shows') // Fetch all existing shows
    shows.value = res.data
    // reopen on the show picked earlier this session, if it still exists
    selectedShow.value = shows.value.includes(getSavedShow()) ? getSavedShow() : (shows.value[0] ?? '')
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
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  markers.forEach((entry) => cancelAnimationFrame(entry.frame))
  clearToasts()
})
</script>

<template>
  <div class="map-page">
      <div class="map-stage" :style="{ '--map-inset-bottom': cardH + 'px', '--notice-top': '96px' }">
      <BaseMap :center="SINGAPORE_CENTER" :zoom="11" testid="hq-map" @ready="onMapReady" />

      <!-- Top bar: show dropdown + name search -->
      <div class="board-bar">
        <div class="bar-row">
            <div ref="showEl" class="show-select" @keydown.esc="showMenuOpen = false">
            <button
              type="button"
              class="show-btn"
              aria-haspopup="listbox"
              :aria-expanded="showMenuOpen"
              aria-label="Show"
              @click="toggleShowMenu"
            >
              <i class="bi bi-calendar-event" aria-hidden="true"></i>
              <span class="show-name">{{ selectedShow || 'Show' }}</span>
              <i class="bi bi-chevron-down show-chevron" :class="{ open: showMenuOpen }" aria-hidden="true"></i>
            </button>

            <Transition name="menu">
              <div v-if="showMenuOpen" class="show-menu" role="listbox">
                <button
                  v-for="(s, i) in shows"
                  :key="s"
                  type="button"
                  class="show-option"
                  :class="{ active: s === selectedShow }"
                  :style="{ '--i': i }"
                  role="option"
                  :aria-selected="s === selectedShow"
                  @click="chooseShow(s)"
                >
                  <span>{{ s }}</span>
                  <i v-if="s === selectedShow" class="bi bi-check-lg" aria-hidden="true"></i>
                </button>
              </div>
            </Transition>
          </div>

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

          <button
            type="button"
            class="bell-btn"
            :class="{ active: bellOpen }"
            aria-label="Zone activity"
            :aria-expanded="bellOpen"
            @click="toggleBell"
          >
            <i class="bi" :class="bellOpen ? 'bi-bell-fill' : 'bi-bell'"></i>
            <span v-if="unread" class="bell-badge">{{ unread > 9 ? '9+' : unread }}</span>
          </button>
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

        <!-- Zone activity panel (last 50 events) -->
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

          <div class="activity-foot">Last {{ MAX_EVENTS }} events per show · cleared when you log out</div>
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

          <!-- data-chat-toggle: the chat panel's click-outside-to-close ignores this button, so switching volunteers doesn't flicker -->
          <button
            type="button"
            class="btn btn-primary btn-sm w-100 mt-2 position-relative chat-btn"
            data-chat-toggle
            data-testid="vol-card-chat"
            @click="openChatWithSelected"
          >
            <i class="bi bi-chat-dots-fill me-1" aria-hidden="true"></i>Chat with {{ selected.name }}
            <span v-if="selectedUnread" class="badge rounded-pill bg-danger ms-1">{{ selectedUnread > 99 ? '99+' : selectedUnread }}</span>
          </button>
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

      <MapLoading v-if="loading" text="Loading volunteers..." />

      <MapNotice :notice="errorNotice" @close="error = ''" />
    </div>
  </div>
</template>

<style scoped>
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
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
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
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
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

.info-value {
  color: #1f2430
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

/* School and P5 classes cards */
.vol-card-body {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.chat-btn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
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

/* Bell button */
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

/* Activity panel */
.activity {
  margin-top: 6px;
  background: #fff;
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
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

/* All / Arrivals / Departures toggle */
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
.event-icon.enter { background: #16a34a; }
.event-icon.leave { background: #f59e0b; }

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
  color: #1f2430
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

/* Desktop: the bar and the volunteer card stack at the top left */
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
  .toast-stack {
    top: 12px; /* desktop: top right corner */
    left: auto;
    right: 12px;
    width: 340px;
  }
}

/* Show dropdown */
.show-select {
  position: relative;
  flex: 0 0 auto;
}

.show-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: #f1f3f6;
  color: #555;
  font-weight: 600;
  transition: background-color 0.15s;
}

.show-btn:hover {
  background: #e8ebf0;
}

.show-name {
  color: #222;
}

.show-chevron {
  font-size: 0.7rem;
  transition: transform 0.25s ease;
}

.show-chevron.open {
  transform: rotate(180deg);
}

.show-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 170px;
  padding: 6px;
  background: #fff;
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
  border-radius: 14px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.22);
}

.show-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #222;
  font-size: 0.9rem;
  text-align: left;
  animation: option-in 0.2s ease both;
  animation-delay: calc(var(--i) * 30ms);
}

.show-option:hover {
  background: #f5f7fa;
}

.show-option.active {
  background: #eef3ff;
  color: #2563eb;
  font-weight: 600;
}

/* The menu grows out of the button */
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top left;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.95);
}

/* Options fade in one after another */
@keyframes option-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .show-option {
    animation: none;
  }
  .menu-enter-active,
  .menu-leave-active,
  .show-chevron {
    transition: none;
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