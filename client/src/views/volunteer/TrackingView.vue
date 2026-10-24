<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import BaseMap from '@/components/map/BaseMap.vue'
import { getSavedShow, saveShow } from '@/services/selected-show'
import MapLoading from '@/components/map/MapLoading.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import axios from 'axios'
import polyline from '@mapbox/polyline'
import {
  createDestIcon,
  createSchoolIcon,
  createDotIcon,
  createRouteLabelIcon,
  tipCard,
  bindTip,
} from '@/utils/map-icons'
import { VENUES, JOURNEY_STAGES } from '@/utils/constants'
import {
  startTracking,
  stopTracking,
  geolocationMessage,
  getUserLocation,
} from '@/utils/geolocation'

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
const DEST = VENUES['Padang'] // destination { lat, lng }
const FOLLOW_ZOOM = 16 // zoom level used when centering on the user
const GLIDE_MS = 1000 // how long the marker takes to glide between GPS fixes
const BIG_JUMP_M = 500 // jumps larger than this snap instead of gliding
const REROUTE_M = 10 // re-fetch the route after moving this many metres
const HEADING_MIN_MOVE_M = 3 // ignore GPS jitter smaller than this when computing heading
const REPORT_MOVE_M = 25 // send to the server after moving this far...
const REPORT_HEARTBEAT_MS = 30000 // ...or after this long without sending, 30s
const STILL_REFRESH_MS = 25000 // standing still: ask for a fresh reading after this long without a GPS update
const REPORT_MIN_GAP_MS = 6000 // never send twice within this time (the server rejects updates closer than 5 s with a 429)
const REPORT_MAX_ACCURACY_M = 100 // skip fixes less accurate than this
const REPORT_MAX_FIX_AGE_MS = 120000 // don't re-send a fix older than this

// Phones/tablets have a coarse (finger) primary pointer; desktops don't.
// Used to show the heading cone only on devices that can report a direction.
const showHeading = window.matchMedia('(pointer: coarse)').matches

const MODES = [
  { key: 'drive', label: 'Drive', icon: 'bi-car-front-fill', verb: 'Driving' },
  { key: 'walk', label: 'Walk', icon: 'bi-person-walking', verb: 'Walking' },
]

/* ------------------------------------------------------------------ */
/* Vue state (reactive, used by the template)                          */
/* ------------------------------------------------------------------ */
const loading = ref(true) // waiting for the first GPS fix
const geoError = ref('') // location problem (permission denied, timeout, ...)
const routeError = ref('') // route could not be loaded
const showTrackingInfo = ref(false) // brief "tracking is on" message
const location = ref(null) // latest position: { lat, lng, accuracy }
const routeInfo = ref(null) // last fetched route summary: { minutes, km }
const following = ref(true) // true = map camera follows the user's marker
const travelMode = ref('drive') // 'drive' or 'walk'
const loadingRoute = ref(false) // shows the "Fetching Routes..." overlay
const reporting = ref(true) // turns false if the server says this volunteer isn't tracked

const activeMode = computed(() => MODES.find((m) => m.key === travelMode.value))

/* My accepted shows */
const assignments = ref([]) // accepted shows: [{ show, school: { name, p5Classes } | null }]
const assignStatus = ref('loading') // 'loading' | 'ready' | 'error'
const selectedShow = ref('') // the show whose school is displayed
watch(selectedShow, (s) => s && saveShow(s)) // remember the pick for this session

const currentAssignment = computed(
  () => assignments.value.find((a) => a.show === selectedShow.value) ?? null,
)

watch(currentAssignment, drawSchool) // tapping a pill (or the list loading) redraws the school

/* Journey: which of the 8 checkpoints the volunteer has clocked today for the selected show */
const stageBusy = ref(false) // true while a checkpoint request is running (buttons are disabled)
const stageError = ref('') // set when a checkpoint could not be saved
const currentStage = computed(() => currentAssignment.value?.stage ?? 0) // 0 = not started, 8 = dismissed
const nextStage = computed(() => JOURNEY_STAGES[currentStage.value] ?? null) // the checkpoint the big button clocks (null after Dismissal)
const lastStage = computed(() => JOURNEY_STAGES[currentStage.value - 1] ?? null) // the checkpoint "Undo" would remove
const journeyLeg = computed(() => {
  if (currentStage.value >= JOURNEY_STAGES.length)
    return { text: 'Day complete', icon: 'bi-check-circle-fill' }
  // The leg follows the NEXT checkpoint: 1-4 are on the way to Padang, 5-8 on the way back
  return nextStage.value.leg === 'out'
    ? { text: 'Going to Padang', icon: 'bi-arrow-right-circle-fill' }
    : { text: 'Returning to school', icon: 'bi-arrow-left-circle-fill' }
})

// Where the route goes: Padang on the way there, the volunteer's allocated school from "Reached Padang" onwards
// (the same moment the journey switches to "Returning to school"). Falls back to Padang if the school has no coordinates.
const routeTarget = computed(() => {
  const school = currentAssignment.value?.school
  if (currentStage.value >= 4 && school?.lat != null && school?.lng != null) {
    return { lat: school.lat, lng: school.lng, name: school.name || 'school' }
  }
  return { lat: DEST.lat, lng: DEST.lng, name: 'Padang' }
})

// The destination changed (stage 4 reached or undone, another show picked, undo back to the outbound leg): fetch the new route
watch(routeTarget, (now, before) => {
  if (now.lat !== before.lat || now.lng !== before.lng) drawRoute()
})

// The journey row has 4 dots that play twice: left to right on the way to Padang (stages 1-4), then in reverse on the
// way back (stages 5-8, where dot 4 = Leaving Padang ... dot 1 = Dismissal). This works out each dot's look for the
// current stage. A dot's left-hand line is the line between it and the previous dot.
const journeyReturning = computed(
  () => currentStage.value >= 4 && currentStage.value < JOURNEY_STAGES.length,
)
const journeyDots = computed(() => {
  const st = currentStage.value
  const back = st >= 4 // from "Reached Padang" on, the next checkpoints belong to the return leg
  const nextPos = st >= 8 ? 0 : back ? 8 - st : st + 1 // the dot the next checkpoint lights up (pulses)
  // The line that is animating: it belongs to the dot on its right
  const flowDot = st >= 8 ? 0 : back ? Math.min(3, 8 - st) + 1 : st + 1
  return [1, 2, 3, 4].map((d) => {
    const stageForDot = back ? JOURNEY_STAGES[8 - d] : JOURNEY_STAGES[d - 1] // what this dot stands for in the current leg
    const reachedNow = back ? st >= 9 - d && st >= 5 : st >= d
    return {
      pos: d,
      label: stageForDot.label + (reachedNow ? ' (done)' : ''),
      title: stageForDot.label,
      classes: {
        out: st >= d, // reached on the way to Padang
        back: st >= 5 && st >= 9 - d, // reached on the way back
        'link-out': d >= 2 && st >= d,
        'link-back': d >= 2 && st >= 10 - d,
        next: d === nextPos,
        'flow-fwd': d >= 2 && d === flowDot && !back,
        'flow-back': d >= 2 && d === flowDot && back,
      },
    }
  })
})

// Sends one stage change and applies the server's answer to the selected assignment.
// 409 = the server's stage differs from ours (double tap, second phone, new day): we just take the server's stage.
async function sendStage(assignment, request) {
  if (stageBusy.value) return
  stageBusy.value = true
  stageError.value = ''
  try {
    const res = await request()
    assignment.stage = res.data.stage
    assignment.stageHistory = res.data.stageHistory
  } catch (err) {
    if (err.response?.status === 409 && typeof err.response.data?.stage === 'number') {
      assignment.stage = err.response.data.stage
    } else {
      stageError.value =
        err.response?.data?.message || 'Could not save your checkpoint. Please try again.'
    }
  } finally {
    stageBusy.value = false
  }
}

// Big button: clock the next checkpoint
function advanceStage() {
  const a = currentAssignment.value
  if (!a || a.stage >= JOURNEY_STAGES.length) return
  sendStage(a, () => axios.put('/api/assignments/me/stage', { show: a.show, stage: a.stage + 1 }))
}

// Undo link: go back one checkpoint (as many times as needed)
function undoStage() {
  const a = currentAssignment.value
  if (!a || a.stage < 1) return
  sendStage(a, () =>
    axios.delete('/api/assignments/me/stage', { params: { show: a.show, stage: a.stage } }),
  )
}

/* Tracking and sharing status */
const trackingOn = ref(false) // true once location tracking has started (needs an accepted show)
const lastSentAt = ref(0) // time of the last successful send to the server
const clock = ref(Date.now()) // ticks every 5 s so the pill notices when sends stop
const SHARE_FRESH_MS = 90000 // counts as "sharing" while the last send is newer than this

const SHARE_LABELS = {
  sharing: 'Sharing location',
  blocked: 'Location blocked',
  off: 'Not sharing',
  waiting: 'Connecting…',
}

// Which pill to show (null = none)
const shareStatus = computed(() => {
  if (!trackingOn.value) return null // not tracking at all
  if (geoError.value) return 'blocked'
  if (!reporting.value) return 'off'
  if (lastSentAt.value && clock.value - lastSentAt.value < SHARE_FRESH_MS) return 'sharing'
  return 'waiting'
})

// Tooltip text for the pill
const shareHint = computed(
  () =>
    ({
      sharing: 'Organisers can see your location while this page is open.',
      blocked: geoError.value,
      off: 'Sharing stopped. You may be logged out or have no accepted show.',
      waiting: 'Waiting for a good location fix.',
    })[shareStatus.value] ?? '',
)

// The blur overlay: shown once the shows are known and there is no accepted one
const showNoShows = computed(() => assignStatus.value !== 'loading' && !assignments.value.length)
const noShows = computed(() =>
  assignStatus.value === 'error'
    ? {
        icon: 'bi-wifi-off',
        title: 'Could not load your shows',
        text: "We couldn't check your allocation, so location tracking hasn't started. Please try again.",
      }
    : {
        icon: 'bi-calendar-x',
        title: 'No allocated shows yet',
        text: "Your location isn't being tracked. Please ensure that you have accepted an assigned show.",
      },
)

// Loads the volunteer's accepted shows. They follow the order of availableShows,
// and the first one is selected by default.
// Loads the volunteer's allocations, keeps the accepted ones in order (NE Show 1, 2, 3, 4).
// The first one is selected by default.
async function loadAssignments() {
  try {
    const res = await axios.get('/api/assignments/me') // Fetch all assignments allocated to current logged in user
    assignments.value = res.data
      .filter((a) => a.status === 'Accepted')
      .sort((a, b) => a.show.localeCompare(b.show, undefined, { numeric: true }))
    // reopen on the show picked earlier this session if the volunteer has accepted it, else the first one
    const saved = getSavedShow()
    selectedShow.value = assignments.value.some((a) => a.show === saved)
      ? saved
      : (assignments.value[0]?.show ?? '')
    assignStatus.value = 'ready'
  } catch {
    assignStatus.value = 'error'
  }
}

// The single message shown in the popup. Errors take priority over the info message.
const notice = computed(() => {
  if (geoError.value) {
    return {
      type: 'error',
      icon: 'bi-exclamation-triangle-fill',
      title: 'Location unavailable',
      text: geoError.value,
    }
  }
  if (routeError.value) {
    return {
      type: 'error',
      icon: 'bi-exclamation-triangle-fill',
      title: 'Route problem',
      text: routeError.value,
    }
  }
  if (stageError.value) {
    return {
      type: 'error',
      icon: 'bi-exclamation-triangle-fill',
      title: 'Checkpoint problem',
      text: stageError.value,
    }
  }
  if (showTrackingInfo.value) {
    return {
      type: 'info',
      icon: 'bi-geo-alt-fill',
      title: 'Location tracking is on',
      text: 'Organisers can see your location while this page is open.',
    }
  }
  return null
})

/* ------------------------------------------------------------------ */
/* Non-reactive state (Leaflet objects and bookkeeping)                */
/* ------------------------------------------------------------------ */
let map = null
let L = null // Leaflet library, passed in by BaseMap
let volunteerLayer = null // layer group holding the markers
let meIcon = null // blue dot icon for the user
let myMarker = null // the user's marker
let routeLine = null // the drawn route polyline
let routeRenderer = null // shared canvas renderer for route lines
let routeLabel = null // "xx min" pill sitting on the route
let schoolMarker = null // badge for the allocated school of the selected show
let schoolLine = null // dashed line from the volunteer to that school

let firstFix = true // true until the first GPS position arrives
let lastRouteLoc = null // where the route was last fetched from
let animFrame = null // id of the running glide animation
let recentering = false // true while the recenter pan is animating
let heading = null // degrees clockwise from north, null if unknown
let prevFix = null // last position used for the bearing fallback
let routeBase = null // snapshot of the last route, used for live estimates
let routeRequestId = 0 // guards against slow responses overwriting newer ones
let lastFixAt = 0 // time the latest GPS fix arrived
let lastReported = null // { lat, lng, time } of the last position sent to the server
let reportInFlight = false // true while a send is in progress
let refreshing = false // true while a still-position refresh is running
let lastAttemptAt = 0 // time the last send was started (successful or not)
let reportTimer = null // interval that sends the heartbeat
let catchUp = false // true = send the next fix straight away (set when the tab becomes visible again)

/* ------------------------------------------------------------------ */
/* Distance and direction helpers                                      */
/* ------------------------------------------------------------------ */

// Straight-line distance in metres between two { lat, lng } points (haversine)
function distanceMeters(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Compass bearing in degrees (0 = north, 90 = east) from point a to point b
function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/* ------------------------------------------------------------------ */
/* Map icons                                                           */
/* ------------------------------------------------------------------ */

// Point halfway along the route's length (not just the middle vertex)
function routeMidpoint(coords) {
  if (coords.length < 2) return coords[0]
  const segLen = (i) => L.latLng(coords[i - 1]).distanceTo(coords[i])

  let total = 0
  for (let i = 1; i < coords.length; i++) total += segLen(i)

  let walked = 0
  for (let i = 1; i < coords.length; i++) {
    const seg = segLen(i)
    if (walked + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - walked) / seg
      const [a, b] = [coords[i - 1], coords[i]]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    walked += seg
  }
  return coords[0]
}

// Create the label on first call, then move and refresh it on later calls
function placeRouteLabel(coords, minutes) {
  const pos = routeMidpoint(coords)
  if (!routeLabel) {
    routeLabel = L.marker(pos, {
      icon: createRouteLabelIcon(minutes),
      interactive: false, // clicks pass through to the map
      keyboard: false,
      zIndexOffset: -100, // stays below your dot and the flag
    }).addTo(volunteerLayer)
  } else {
    routeLabel.setLatLng(pos)
    routeLabel.setIcon(createRouteLabelIcon(minutes))
  }
}

/* ------------------------------------------------------------------ */
/* Map setup                                                           */
/* ------------------------------------------------------------------ */

// Shows the allocated school of the selected show, with a dashed line from the
// volunteer. The camera is never moved.
function drawSchool() {
  if (!map) return

  if (schoolMarker) volunteerLayer.removeLayer(schoolMarker)
  if (schoolLine) volunteerLayer.removeLayer(schoolLine)
  schoolMarker = null
  schoolLine = null

  const s = currentAssignment.value?.school
  if (s?.lat == null || s?.lng == null) return

  schoolMarker = L.marker([s.lat, s.lng], { icon: createSchoolIcon(), zIndexOffset: -50 }).addTo(
    volunteerLayer,
  )
  bindTip(
    schoolMarker,
    tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: s.name || 'School' }),
  )

  // The line needs the volunteer's marker; drawMyMarker calls this again once it exists
  if (myMarker) {
    schoolLine = L.polyline([myMarker.getLatLng(), [s.lat, s.lng]], {
      color: '#4f46e5',
      weight: 3,
      dashArray: '6 8',
      opacity: 0.85,
      interactive: false,
      renderer: routeRenderer, // canvas, so the line stays visible while zooming
    }).addTo(volunteerLayer)
  }
}

// Keeps the dashed line's volunteer end on the marker while it glides
function updateSchoolLine() {
  const s = currentAssignment.value?.school
  if (!schoolLine || !myMarker || s?.lat == null) return
  schoolLine.setLatLngs([myMarker.getLatLng(), [s.lat, s.lng]])
}

// Runs once BaseMap has created the map: sets up layers, the destination
// marker, and draws anything we already have a location for.
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  routeRenderer = L.canvas() // reused so the route stays visible during zoom animations
  volunteerLayer = L.layerGroup().addTo(map)
  meIcon = createDotIcon()

  const destMarker = L.marker([DEST.lat, DEST.lng], { icon: createDestIcon() }).addTo(
    volunteerLayer,
  )
  bindTip(destMarker, tipCard({ icon: 'bi-flag-fill', tone: 'dest', title: 'Padang' }))

  map.zoomControl?.setPosition('bottomright') // move +/- buttons to the bottom right
  map.on('dragstart', () => (following.value = false)) // user took control of the map
  map.on('click', collapseSheet) // tapping / clicking the map closes the bottom sheet
  drawMyMarker(true)
  drawRoute()
  drawSchool()
}

/* ------------------------------------------------------------------ */
/* User marker                                                         */
/* ------------------------------------------------------------------ */

// Creates the user's marker on the first call, then glides it to the latest
// position. Pass shouldCenter = true to also center the map on the user.
function drawMyMarker(shouldCenter = false) {
  if (!map || !location.value) return
  const { lat, lng } = location.value

  if (!myMarker) {
    myMarker = L.marker([lat, lng], { icon: meIcon }).addTo(volunteerLayer)
    bindTip(myMarker, tipCard({ icon: 'bi-person-fill', tone: 'me', title: 'Me' }))
    shouldCenter = true
    drawSchool()
  } else {
    moveMarkerSmooth(lat, lng)
  }

  if (shouldCenter) map.setView([lat, lng], FOLLOW_ZOOM)
  updateHeadingUI()
}

// Animates the marker from its current spot to (lat, lng) so it glides
// instead of jumping. The camera follows each frame while `following` is on.
function moveMarkerSmooth(lat, lng, duration = GLIDE_MS) {
  const from = myMarker.getLatLng()
  const to = L.latLng(lat, lng)

  cancelAnimationFrame(animFrame) // stop any glide still in progress

  // Big jump (e.g. first fix or GPS recovery): snap instead of gliding
  if (from.distanceTo(to) > BIG_JUMP_M) {
    myMarker.setLatLng(to)
    updateSchoolLine()
    if (following.value && !recentering) map.panTo(to, { animate: false })
    return
  }

  const start = performance.now()
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1) // progress from 0 to 1
    const cur = [from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]
    myMarker.setLatLng(cur)
    updateSchoolLine()
    if (following.value && !recentering) map.panTo(cur, { animate: false })
    if (t < 1) animFrame = requestAnimationFrame(step)
  }
  animFrame = requestAnimationFrame(step)
}

// Recenter button: turns following back on and pans the map to the volunteer.
function recenter() {
  if (!map || !myMarker) return
  following.value = true
  recentering = true
  map.once('moveend', () => (recentering = false))
  map.panTo(myMarker.getLatLng(), { duration: 0.5 })
  setTimeout(() => (recentering = false), 600) // fallback in case moveend never fires
}

/* ------------------------------------------------------------------ */
/* Heading (look direction)                                           */
/* ------------------------------------------------------------------ */

// Updates `heading` from a GPS reading. Uses the device's own heading when
// available, otherwise the bearing between the last two meaningful positions.
// Heading is cleared on desktop, where the cone is never shown.
function updateHeading(pos) {
  const gpsHeading = pos.coords.heading
  const movedFar = prevFix && distanceMeters(prevFix, location.value) > HEADING_MIN_MOVE_M

  if (!showHeading) {
    heading = null
  } else if (typeof gpsHeading === 'number' && !Number.isNaN(gpsHeading)) {
    heading = gpsHeading
  } else if (movedFar) {
    heading = bearingDeg(prevFix, location.value)
  }

  // Only advance the reference point after real movement (ignores GPS jitter)
  if (!prevFix || movedFar) {
    prevFix = { lat: location.value.lat, lng: location.value.lng }
  }
}

// Shows and rotates the cone on the user's dot, or hides it if heading is unknown
function updateHeadingUI() {
  const el = myMarker?.getElement()?.querySelector('.me-dot-cone')
  if (!el) return
  if (!showHeading || heading === null) {
    el.style.display = 'none'
    return
  }
  el.style.display = 'block'
  el.style.transform = `rotate(${heading}deg)`
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

// Fetches the route from the user's location to the current destination (Padang, or the school when returning) and draws it.
// background = true refreshes quietly (no overlay, old line stays until the
// new one is ready); false is used for first load and travel-mode changes.
async function drawRoute(background = false) {
  if (!map || !location.value) return

  if (!background) {
    routeLine?.remove()
    routeLine = null
    if (routeLabel) {
      volunteerLayer.removeLayer(routeLabel)
      routeLabel = null
    }
    routeInfo.value = null
    loadingRoute.value = true
  }

  const requestId = ++routeRequestId
  const { lat, lng } = location.value

  try {
    // Calls the OneMap API for the route
    const res = await axios.get('/api/users/route', {
      params: {
        startLat: lat,
        startLng: lng,
        endLat: routeTarget.value.lat,
        endLng: routeTarget.value.lng,
        routeType: travelMode.value, // 'walk' or 'drive'
      },
    })

    if (requestId !== routeRequestId) return // a newer request replaced this one

    routeError.value = '' // route found, clear any old error

    // Draw the new line first, then remove the old one so the route never blinks out
    const coords = polyline.decode(res.data.route_geometry)
    const newLine = L.polyline(coords, {
      color: '#2563eb',
      weight: 4,
      renderer: routeRenderer,
    }).addTo(map)
    routeLine?.remove()
    routeLine = newLine

    const s = res.data.route_summary
    routeBase = {
      straight: distanceMeters({ lat, lng }, routeTarget.value),
      km: s.total_distance / 1000,
      minutes: s.total_time / 60,
    }
    routeInfo.value = {
      minutes: Math.round(s.total_time / 60),
      km: (s.total_distance / 1000).toFixed(1),
    }
    placeRouteLabel(coords, Math.round(s.total_time / 60))
  } catch (err) {
    if (requestId !== routeRequestId) return
    routeError.value = err.response?.data?.message || 'Could not load route.'
  } finally {
    // Only hide the overlay if this is still the latest request;
    // if a newer one is in flight, it keeps the overlay on.
    if (requestId === routeRequestId) loadingRoute.value = false
  }
}

// Time and distance shown in the card. Between route fetches it shrinks as the
// user gets closer to the destination (scaled by straight-line distance), and each
// re-route replaces it with exact numbers from the API.
const liveInfo = computed(() => {
  if (!routeInfo.value || !routeBase || !location.value) return routeInfo.value
  if (routeBase.straight < 1) return routeInfo.value

  const straightNow = distanceMeters(location.value, routeTarget.value)
  const ratio = Math.max(0, Math.min(1, straightNow / routeBase.straight))

  return {
    km: (routeBase.km * ratio).toFixed(1),
    minutes: Math.max(1, Math.round(routeBase.minutes * ratio)),
  }
})

// Keep the pill's minutes in step with the sheet as the user moves
watch(
  () => liveInfo.value?.minutes,
  (min) => {
    if (routeLabel && min != null) routeLabel.setIcon(createRouteLabelIcon(min))
  },
)

// Switches between drive/walk and fetches a fresh route
function setTravelMode(mode) {
  if (mode === travelMode.value) return
  travelMode.value = mode
  drawRoute()
}

/* ------------------------------------------------------------------ */
/* Reporting to the server                                             */
/* ------------------------------------------------------------------ */

// Sends the latest position to the server so admins can see it on the Live Board.
// Skips the send if the fix is poor or old, or if nothing has changed enough.
// force = true skips the distance/time check (used for the first fix).
async function reportLocation(force = false) {
  if (!reporting.value || reportInFlight || !location.value) return
  if (Date.now() - lastFixAt > REPORT_MAX_FIX_AGE_MS) return // stale fix: don't present it as live
  if (Date.now() - lastAttemptAt < REPORT_MIN_GAP_MS) return // too soon after the last send, even when forced: the next 5 s check retries

  const { lat, lng, accuracy } = location.value
  if (accuracy > REPORT_MAX_ACCURACY_M) return

  if (!force && lastReported) {
    const moved = distanceMeters(lastReported, location.value)
    const waited = Date.now() - lastReported.time
    if (moved < REPORT_MOVE_M && waited < REPORT_HEARTBEAT_MS) return
  }

  reportInFlight = true
  lastAttemptAt = Date.now()
  try {
    await axios.put('/api/locations/me', { lat, lng, accuracy })
    lastReported = { lat, lng, time: Date.now() }
    lastSentAt.value = Date.now() // the pill turns green
    clock.value = lastSentAt.value
  } catch (err) {
    const status = err.response?.status
    // Not logged in or no confirmed assignment: retrying won't help, so stop
    if (status === 401 || status === 403) reporting.value = false
    // Anything else (429, network, 500): ignore, the next check tries again
  } finally {
    reportInFlight = false
  }
}

// The browser only reports a new position when you MOVE, so standing still makes the last fix grow old. It would
// then be rejected as stale and the pill would drop to "Connecting…" even though you are still there.
// So after a quiet spell, ask for one fresh reading. If it works the fix is current again; if GPS is really lost
// it fails quietly, the fix goes stale, and the pill honestly changes.
async function refreshIfStill() {
  if (refreshing || !trackingOn.value || !location.value) return
  if (Date.now() - lastFixAt < STILL_REFRESH_MS) return
  refreshing = true
  try {
    onPosition(await getUserLocation())
  } catch {
    // ignore: the stale check in reportLocation handles a real loss of signal
  } finally {
    refreshing = false
  }
}

// When the tab becomes visible again, get a fresh GPS fix and send it right away
function onVisibilityChange() {
  if (document.visibilityState !== 'visible' || !trackingOn.value) return
  reporting.value = true // retry once, in case the show was accepted while away
  catchUp = true
  startTracking(onPosition, onGeoError) // restarts the watch, which delivers a fresh fix
}

/* ------------------------------------------------------------------ */
/* Geolocation callbacks                                               */
/* ------------------------------------------------------------------ */

// Called by watchPosition on every new GPS fix
function onPosition(pos) {
  location.value = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy, // metres
  }
  geoError.value = '' // a fix arrived, clear any location error
  loading.value = false
  lastFixAt = Date.now()
  const forceReport = catchUp // true only for the first fix after returning to the tab
  catchUp = false

  updateHeading(pos)

  if (firstFix) {
    // First fix: center the map and draw the initial route
    firstFix = false
    showTrackingNotice()
    reportLocation(true) // update volunteer's location in the server right away
    drawMyMarker(true)
    drawRoute()
    lastRouteLoc = { ...location.value }
  } else {
    // Later fixes: glide the marker, and quietly re-route after enough movement
    drawMyMarker(false)
    reportLocation(forceReport) // normally only sends after 25 m or 30 s; forced to send after returning to the tab
    if (distanceMeters(lastRouteLoc, location.value) > REROUTE_M) {
      drawRoute(true)
      lastRouteLoc = { ...location.value }
    }
  }
}

// Called by watchPosition when location fails (permission denied, timeout, etc.)
function onGeoError(err) {
  geoError.value = geolocationMessage(err)
  loading.value = false
}

/* ------------------------------------------------------------------ */
/* Notice popup                                                        */
/* ------------------------------------------------------------------ */
let noticeTimer = null

// Shows the "tracking is on" message, then hides it after 5 seconds
function showTrackingNotice() {
  showTrackingInfo.value = true
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (showTrackingInfo.value = false), 5000)
}

// Close button: dismisses whatever message is currently showing
function dismissNotice() {
  if (geoError.value) geoError.value = ''
  else if (routeError.value) routeError.value = ''
  else if (stageError.value) stageError.value = ''
  else showTrackingInfo.value = false
}

/* ------------------------------------------------------------------ */
/* Bottom sheet                                                        */
/* ------------------------------------------------------------------ */
const sheetEl = ref(null) // the whole sheet
const peekEl = ref(null) // the part that's always visible (handle + Drive/Walk)
const expanded = ref(false) // true = fully open
const dragging = ref(false) // true while the finger is dragging the handle
const sheetAnimated = ref(false) // false until first layout, so it doesn't animate on load
const sheetFull = ref(0) // height when fully open (px)
const sheetPeek = ref(0) // height when collapsed (px)
const sheetVisible = ref(0) // how many px of the sheet are currently showing

let dragStartY = 0
let dragStartVisible = 0
let dragMoved = false
let sheetObserver = null

// Moves the sheet down by the hidden part; the open sheet has no offset
const sheetStyle = computed(() => ({
  transform: `translateY(${sheetFull.value - sheetVisible.value}px)`,
}))

// Measures the sheet and snaps it to its open or collapsed height
function measureSheet() {
  if (!sheetEl.value || !peekEl.value) return
  sheetFull.value = sheetEl.value.offsetHeight
  sheetPeek.value = peekEl.value.offsetHeight
  if (!dragging.value) sheetVisible.value = expanded.value ? sheetFull.value : sheetPeek.value
}

// Closes the sheet (used when the map is tapped)
function collapseSheet() {
  if (!expanded.value) return
  expanded.value = false
  sheetVisible.value = sheetPeek.value
}

// Open if closed, close if open
function toggleSheet() {
  expanded.value = !expanded.value
  sheetVisible.value = expanded.value ? sheetFull.value : sheetPeek.value
}

function onSheetPointerDown(e) {
  dragging.value = true
  dragMoved = false
  dragStartY = e.clientY
  dragStartVisible = sheetVisible.value
  e.currentTarget.setPointerCapture(e.pointerId) // keep receiving moves outside the handle
}

// Sheet height follows the finger, clamped between collapsed and open
function onSheetPointerMove(e) {
  if (!dragging.value) return
  const dy = dragStartY - e.clientY // dragging up is positive
  if (Math.abs(dy) > 4) dragMoved = true
  sheetVisible.value = Math.min(sheetFull.value, Math.max(sheetPeek.value, dragStartVisible + dy))
}

// A tap toggles; a drag snaps to whichever end is closer
function onSheetPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  if (!dragMoved) {
    expanded.value = !expanded.value
  } else {
    expanded.value = sheetVisible.value > (sheetFull.value + sheetPeek.value) / 2
  }
  sheetVisible.value = expanded.value ? sheetFull.value : sheetPeek.value
}

let disposed = false // true once the page is closed (stops a late load from starting tracking)

// Starts location tracking and reporting. Only called when the volunteer has an accepted show.
function beginTracking() {
  if (trackingOn.value) return
  trackingOn.value = true
  startTracking(onPosition, onGeoError)
  reportTimer = setInterval(() => {
    clock.value = Date.now() // lets the pill notice when sends stop
    refreshIfStill() // standing still? get a fresh reading so the fix doesn't go stale
    reportLocation() // heartbeat check every 5 s (sends only if 30 s have passed)
  }, 5000)
}

// Loads the volunteer's shows, and starts tracking only if they have an accepted one
async function setupTracking() {
  assignStatus.value = 'loading'
  await loadAssignments()
  if (!disposed && assignments.value.length) beginTracking()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  measureSheet()
  sheetObserver = new ResizeObserver(measureSheet) // re-measure when the content changes height
  sheetObserver.observe(sheetEl.value)
  requestAnimationFrame(() => (sheetAnimated.value = true)) // enable animations after first layout
  setupTracking()
})

// Stop tracking and any running animation when leaving the page
onUnmounted(() => {
  disposed = true
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopTracking()
  cancelAnimationFrame(animFrame)
  sheetObserver?.disconnect()
  clearTimeout(noticeTimer)
  clearInterval(reportTimer)
})
</script>

<template>
  <div class="map-page">
    <div
      class="map-stage"
      :class="{ 'is-dragging': dragging, 'sheet-anim': sheetAnimated }"
      :style="{
        '--map-inset-bottom': '16px',
        '--sheet-visible': sheetVisible + 'px',
        '--map-zoom-offset': '60px',
      }"
    >
      <BaseMap @ready="onMapReady" />

      <button
        type="button"
        class="recenter-btn"
        :class="{ active: following }"
        @click="recenter"
        aria-label="Recenter map to my location"
        title="Your location"
      >
        <i class="bi" :class="following ? 'bi-geo-alt-fill' : 'bi-crosshair2'"></i>
      </button>

      <MapLoading
        v-if="loadingRoute || assignStatus === 'loading'"
        text="Fetching Location Data..."
      />

      <!-- Sharing status pill -->
      <Transition name="fade" mode="out-in">
        <div
          v-if="shareStatus"
          :key="shareStatus"
          class="share-pill"
          :class="shareStatus"
          role="status"
          :title="shareHint"
        >
          <span class="share-dot" aria-hidden="true"></span>{{ SHARE_LABELS[shareStatus] }}
        </div>
      </Transition>

      <!-- No accepted show: blur the map and display that error. Nothing is tracked. -->
      <Transition name="fade">
        <div v-if="showNoShows" class="noshow" role="status">
          <div class="noshow-card">
            <div class="noshow-icon" aria-hidden="true">
              <i class="bi" :class="noShows.icon"></i>
            </div>
            <div class="noshow-title">{{ noShows.title }}</div>
            <div class="noshow-text">{{ noShows.text }}</div>
            <button type="button" class="noshow-btn" @click="$router.push('/volunteer/assignment')">
              View Assignments
            </button>
          </div>
        </div>
      </Transition>

      <MapNotice :notice="notice" @close="dismissNotice" />

      <!-- Bottom sheet: Drive/Walk always visible, route details when expanded -->
      <div ref="sheetEl" class="sheet" :style="sheetStyle">
        <div ref="peekEl" class="sheet-peek">
          <div
            class="sheet-handle"
            role="button"
            tabindex="0"
            :aria-expanded="expanded"
            aria-label="Toggle route details"
            @pointerdown="onSheetPointerDown"
            @pointermove="onSheetPointerMove"
            @pointerup="onSheetPointerUp"
            @pointercancel="onSheetPointerUp"
            @keydown.enter.prevent="toggleSheet"
            @keydown.space.prevent="toggleSheet"
          >
            <span class="sheet-grip"></span>
          </div>

          <div class="mode-toggle" role="group" aria-label="Travel mode">
            <button
              v-for="m in MODES"
              :key="m.key"
              type="button"
              class="mode-btn"
              :class="{ active: travelMode === m.key }"
              :disabled="loadingRoute"
              @click="setTravelMode(m.key)"
            >
              <i class="bi" :class="m.icon"></i> {{ m.label }}
            </button>
          </div>
        </div>

        <div class="sheet-details">
          <div class="route-summary">
            <div class="route-icon" aria-hidden="true">
              <i class="bi" :class="activeMode.icon"></i>
            </div>
            <div>
              <div class="sheet-title">{{ activeMode.verb }} to {{ routeTarget.name }}</div>
              <div v-if="liveInfo" class="route-stats">
                <span class="route-min">{{ liveInfo.minutes }} min</span>
                <span class="route-km">{{ liveInfo.km }} km</span>
              </div>
              <div v-else class="route-stats text-muted">Finding route…</div>
            </div>
          </div>

          <!-- My accepted shows: pills pick the show, cards show its school -->
          <div class="assign">
            <template v-if="assignStatus === 'ready' && assignments.length">
              <div class="show-pills" role="group" aria-label="My shows">
                <button
                  v-for="a in assignments"
                  :key="a.show"
                  type="button"
                  class="show-pill"
                  :class="{ active: a.show === selectedShow }"
                  :aria-pressed="a.show === selectedShow"
                  @click="selectedShow = a.show"
                >
                  {{ a.show }}
                </button>
              </div>

              <div class="info-grid">
                <div class="info-card">
                  <div class="info-label">
                    <i class="bi bi-mortarboard-fill" aria-hidden="true"></i>Allocated school
                  </div>
                  <div class="info-value">{{ currentAssignment?.school?.name || '—' }}</div>
                </div>
                <div class="info-card">
                  <div class="info-label">
                    <i class="bi bi-people-fill" aria-hidden="true"></i>P5 classes
                  </div>
                  <div class="info-value info-number">
                    {{ currentAssignment?.school?.p5Classes ?? '—' }}
                  </div>
                </div>
              </div>

              <!-- Journey: where the volunteer is in today's 8 checkpoints (the admin sees the same on the Live Board) -->
              <div class="journey" :class="{ done: !nextStage, returning: journeyReturning }">
                <div class="journey-head">
                  <span class="journey-leg"
                    ><i class="bi" :class="journeyLeg.icon" aria-hidden="true"></i
                    >{{ journeyLeg.text }}</span
                  >
                  <span class="journey-count">{{ currentStage }}/{{ JOURNEY_STAGES.length }}</span>
                </div>

                <ol class="journey-dots" aria-label="Journey progress">
                  <li
                    v-for="d in journeyDots"
                    :key="d.pos"
                    class="jdot"
                    :class="d.classes"
                    :title="d.title"
                  >
                    <span class="dot"></span>
                    <span class="visually-hidden">{{ d.label }}</span>
                  </li>
                </ol>

                <button
                  v-if="nextStage"
                  type="button"
                  class="journey-btn"
                  :disabled="stageBusy"
                  data-testid="journey-next"
                  @click="advanceStage"
                >
                  <i class="bi bi-check2-circle" aria-hidden="true"></i> {{ nextStage.label }}
                </button>
                <div v-else class="journey-complete">
                  <i class="bi bi-check-circle-fill" aria-hidden="true"></i> Day complete
                </div>

                <button
                  v-if="lastStage"
                  type="button"
                  class="journey-undo"
                  :disabled="stageBusy"
                  data-testid="journey-undo"
                  @click="undoStage"
                >
                  <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Undo:
                  {{ lastStage.label }}
                </button>
              </div>
            </template>

            <div v-else-if="assignStatus === 'loading'" class="assign-msg">Loading your shows…</div>
            <div v-else-if="assignStatus === 'error'" class="assign-msg">
              Could not load your shows.
            </div>
            <div v-else class="assign-msg">You have no allocated shows yet.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Recenter button */
.recenter-btn {
  position: absolute;
  right: 10px;
  bottom: calc(30px + var(--map-inset-bottom, 0px)); /* rides up with the sheet */
  z-index: 1000; /* above Leaflet panes */
  width: 40px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #666;
  border: none;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  font-size: 1.2rem;
  cursor: pointer;
  transition:
    background-color 0.15s,
    box-shadow 0.15s,
    color 0.15s;
}

.recenter-btn:hover {
  background: #f5f5f5;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
}

.recenter-btn:active {
  background: #eaeaea;
}

.recenter-btn:focus-visible {
  outline: 2px solid #1a73e8;
  outline-offset: 2px;
}

/* "Following the user" icon: blue */
.recenter-btn.active {
  color: #1a73e8;
}

/* Bottom sheet */
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1050; /* above Leaflet controls (1000), below the loading overlay (1100) */
  background: #fff;
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -2px 12px rgb(0 0 0 / 0.15);
}

.sheet-handle {
  display: flex;
  justify-content: center;
  padding: 10px 0 8px;
  cursor: grab;
  touch-action: none; /* lets us handle the drag instead of the browser scrolling */
}

.sheet-grip {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #c9ccd1;
}

.sheet-peek {
  padding-bottom: 12px;
}

/* Drive / Walk segmented control */
.mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 0 16px;
  padding: 4px;
  background: #f1f3f6;
  border-radius: 12px;
}

.mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #555;
  font-weight: 600;
}

.mode-btn.active {
  background: #2563eb;
  color: #fff;
}

.mode-btn:disabled {
  opacity: 0.7;
}

.sheet-details {
  padding: 4px 16px 16px;
}

.sheet-title {
  font-size: 1.1rem;
  overflow-wrap: anywhere; /* long school names wrap instead of overflowing */
}

/* Icon on the left, text on the right */
.route-summary {
  display: flex;
  align-items: center;
  gap: 16px;
}

.route-icon {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #2563eb;
  color: #fff;
  font-size: 1.9rem;
  margin-left: 5px;
}

.route-min {
  font-size: 1.8rem;
  line-height: 1.1;
  color: #2563eb;
}

.route-km {
  margin-left: 8px;
  font-size: 0.9rem;
  color: #666;
}
/* Move Leaflet's bottom controls (zoom + attribution) up with the sheet */

/* Phones / tablets: the map itself shrinks as the sheet opens, so it only ever reaches 16px (the sheet's rounded
   corners) under the sheet. The zoom buttons and recenter button therefore use a fixed 16px inset (set inline). */
@media (max-width: 991.98px) {
  .map-stage :deep(.leaflet-container) {
    height: calc(100% - max(var(--sheet-visible, 0px) - 16px, 0px));
  }

  /* The recenter button sits on the stage (not inside the map), so it rides up with the sheet to stay visible */
  .recenter-btn {
    bottom: calc(30px + var(--sheet-visible, 0px));
  }
}

/* Animate everything together, but not while the finger is dragging */
.map-stage.sheet-anim:not(.is-dragging) .sheet {
  transition: transform 0.25s ease;
}

.map-stage.sheet-anim:not(.is-dragging) :deep(.leaflet-container) {
  transition: height 0.25s ease; /* same timing as the sheet, so the two stay in step */
}

.map-stage.sheet-anim:not(.is-dragging) .recenter-btn {
  transition:
    bottom 0.25s ease,
    background-color 0.15s,
    box-shadow 0.15s,
    color 0.15s;
}

/* Hide hairline seams between map tiles */

/* Popup message (tracking info and errors) */

/* My shows: pills + school cards (same look as the Live Board) */
.assign {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #eceef1;
}

.show-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none; /* scrolls sideways if a volunteer has many shows */
}
.show-pills::-webkit-scrollbar {
  display: none;
}

.show-pill {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 16px;
  background: #f1f3f6;
  color: #555;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.show-pill:hover {
  background: #e8ebf0;
}

.show-pill.active {
  background: #2563eb;
  color: #fff;
}

.info-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 8px;
  margin-top: 10px;
}

/* Smaller school / P5 cards in the sheet, to leave room for the journey section */
.assign .info-card {
  padding: 6px 10px;
  border-radius: 10px;
}
.assign .info-label {
  font-size: 0.68rem;
}
.assign .info-value {
  margin-top: 2px;
  font-size: 0.85rem;
}
.assign .info-number {
  font-size: 1.15rem;
}

/* Journey: label, row of dots, next-checkpoint button, undo */
.journey {
  margin-top: 12px;
}
.journey-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.journey-leg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #2563eb;
}
.journey-count {
  font-size: 0.75rem;
  font-weight: 600;
  color: #777;
}

.journey-dots {
  display: flex;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}
.jdot {
  position: relative;
  flex: 1 1 0; /* each segment (line + the dot at its right end) takes an equal share */
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 20px;
}
/* The first dot has no line: it sits flush with the button's left edge, and the last dot with its right edge */
.jdot:first-child {
  flex: 0 0 12px;
}
/* Line from the previous dot to this one */
.jdot::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 3px;
  transform: translateY(-50%);
  border-radius: 2px;
  background: #e1e5ea;
}
.jdot:first-child::before {
  display: none;
}
/* Blue = on the way to Padang, teal = on the way back */
.jdot.link-out::before {
  background: #2563eb;
}
.jdot.link-back::before {
  background: #0d9488;
}
/* The line the trip is travelling along: dashes keep moving forwards (to Padang) or backwards (to school) */
.jdot.flow-fwd::before {
  background: repeating-linear-gradient(90deg, #2563eb 0 6px, #bcd0fb 6px 12px);
  background-size: 12px 100%;
  animation: journey-flow-fwd 0.8s linear infinite;
}
.jdot.flow-back::before {
  background: repeating-linear-gradient(90deg, #0d9488 0 6px, #b5e6e1 6px 12px);
  background-size: 12px 100%;
  animation: journey-flow-back 0.8s linear infinite;
}
.jdot .dot {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #cfd5dd;
}
.jdot.out .dot {
  background: #2563eb;
  border-color: #2563eb;
}
.jdot.back .dot {
  background: #0d9488;
  border-color: #0d9488;
}
.jdot.next .dot {
  background: #fff;
  border-color: #2563eb;
  animation: journey-pulse 1.6s ease-out infinite;
}
.journey.returning .jdot.next .dot {
  border-color: #0d9488;
  animation-name: journey-pulse-back;
}
.journey.returning .journey-leg {
  color: #0d9488;
}
.journey.done .jdot::before {
  background: #16a34a;
}
.journey.done .jdot .dot {
  background: #16a34a;
  border-color: #16a34a;
}

.journey-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-radius: 12px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}
.journey-btn:hover:not(:disabled) {
  background: #1d4fd8;
}
.journey-btn:disabled {
  opacity: 0.7;
}
.journey-complete {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 12px;
  border-radius: 12px;
  background: #e7f6ec;
  color: #166534;
  font-weight: 600;
}
.journey-undo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 6px;
  padding: 6px;
  border: 0;
  background: transparent;
  color: #666;
  font-size: 0.8rem;
}
.journey-undo:hover:not(:disabled) {
  color: #1f2430;
  text-decoration: underline;
}
.journey-undo:disabled {
  opacity: 0.5;
}

@keyframes journey-flow-fwd {
  to {
    background-position: 12px 0;
  }
}
@keyframes journey-flow-back {
  to {
    background-position: -12px 0;
  }
}
@keyframes journey-pulse-back {
  0% {
    box-shadow: 0 0 0 0 rgb(13 148 136 / 0.5);
  }
  100% {
    box-shadow: 0 0 0 8px rgb(13 148 136 / 0);
  }
}
@keyframes journey-pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(37 99 235 / 0.5);
  }
  100% {
    box-shadow: 0 0 0 8px rgb(37 99 235 / 0);
  }
}

.assign-msg {
  font-size: 0.85rem;
  color: #888;
}

/* Sharing status pill (top right, above the alert cards) */
.share-pill {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1150;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 12px;
  background: #fff;
  border-radius: 15px;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.25);
  font-size: 0.78rem;
  font-weight: 600;
  color: #555;
  white-space: nowrap;
}

.share-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #9aa0a6;
}

.share-pill.sharing {
  color: #166534;
}
.share-pill.sharing .share-dot {
  background: #16a34a;
  animation: share-pulse 2s ease-out infinite;
}

.share-pill.blocked {
  color: #b91c1c;
  box-shadow:
    0 1px 6px rgb(0 0 0 / 0.25),
    0 0 0 1px #f5c2c0;
}
.share-pill.blocked .share-dot {
  background: #dc2626;
}

@keyframes share-pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(22 163 74 / 0.5);
  }
  100% {
    box-shadow: 0 0 0 8px rgb(22 163 74 / 0);
  }
}

/* No accepted show: blurred map with a card */
.noshow {
  position: absolute;
  inset: 0;
  z-index: 1120; /* above the sheet (1050) and the loading overlay (1100) */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(255 255 255 / 0.45);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.noshow-card {
  width: 100%;
  max-width: 340px;
  padding: 22px 20px;
  background: #fff;
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
  border-radius: 18px;
  box-shadow: 0 4px 20px rgb(0 0 0 / 0.2);
  text-align: center;
}

.noshow-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #eef3ff;
  color: #2563eb;
  font-size: 1.5rem;
}

.noshow-title {
  font-size: 1.05rem;
  font-weight: 600;
}

.noshow-text {
  margin-top: 6px;
  font-size: 0.85rem;
  line-height: 1.4;
  color: #666;
}

.noshow-btn {
  margin-top: 16px;
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 19px;
  background: #2563eb;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
}
.noshow-btn:hover {
  background: #1d4fd8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .share-pill.sharing .share-dot,
  .jdot.flow-fwd::before,
  .jdot.flow-back::before,
  .jdot.next .dot {
    animation: none;
  }
}

/* Desktop: no drag. Show the same content as a card at the top left */
@media (min-width: 992px) {
  .sheet {
    top: 12px;
    bottom: auto;
    left: 12px;
    right: auto;
    width: 400px;
    border-radius: 12px;
    transform: none !important; /* always fully open */
  }
  .sheet-handle {
    display: none;
  }
  .sheet-peek {
    padding-top: 16px;
  }
}
</style>
