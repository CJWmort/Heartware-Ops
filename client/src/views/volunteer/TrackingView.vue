<!-- The volunteer Tracking page (F4): shows the volunteer on a map, shares their location with HQ,
     draws the route and lets them move through the journey stages. -->

<script setup>
// Watches the GPS, sends the position to the server, glides the marker and heading cone, draws and
// re-draws the route, works out the journey stage and time left, and handles the stage buttons.

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import BaseMap from '@/components/map/BaseMap.vue'
import { getSavedShow, saveShow } from '@/services/selected-show'
import MapLoading from '@/components/map/MapLoading.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import IncidentReportForm from '@/components/incident/IncidentReportForm.vue'
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
import { haversineKm } from '@/utils/haversine'
import {
  startTracking,
  stopTracking,
  geolocationMessage,
  getUserLocation,
} from '@/utils/geolocation'

const DEST = VENUES['Padang']
const GLIDE_MS = 1000
const BIG_JUMP_M = 500
const REROUTE_M = 10
const HEADING_MIN_MOVE_M = 5
const DISPLAY_MAX_ACCURACY_M = 50
const REPORT_MOVE_M = 25
const REPORT_HEARTBEAT_MS = 30000
const STILL_REFRESH_MS = 25000
const REPORT_MIN_GAP_MS = 6000
const REPORT_MAX_ACCURACY_M = 100
const REPORT_MAX_FIX_AGE_MS = 120000

const showHeading = window.matchMedia('(pointer: coarse)').matches

const MODES = [
  { key: 'drive', label: 'Drive', icon: 'bi-car-front-fill', verb: 'Driving' },
  { key: 'walk', label: 'Walk', icon: 'bi-person-walking', verb: 'Walking' },
]

const geoError = ref('')
const routeError = ref('')
const showTrackingInfo = ref(false)
const location = ref(null)
const routeInfo = ref(null)
const following = ref(true)
const travelMode = ref('drive')
const loadingRoute = ref(false)
const routeBusy = ref(false)
const toast = ref(null)
const reporting = ref(true)
const showIncidentReport = ref(false)

// activeMode (computed) - the MODES entry of the chosen travel mode.
const activeMode = computed(() => MODES.find((m) => m.key === travelMode.value))

const assignments = ref([])
const assignStatus = ref('loading')
const selectedShow = ref('')
// watch(selectedShow) - whenever the volunteer picks a show, remember the choice by saving it.
watch(selectedShow, (s) => s && saveShow(s))

// currentAssignment (computed) - the assignment of the selected show, or null.
// watch(currentAssignment) redraws the school marker when the selection changes.
const currentAssignment = computed(
  () => assignments.value.find((a) => a.show === selectedShow.value) ?? null,
)

// watch(currentAssignment) - when the current assignment changes, redraw the school pin on the map.
watch(currentAssignment, drawSchool)

const stageBusy = ref(false)
const stageError = ref('')
// currentStage (computed) - how many journey steps are done for the current assignment (0 if none).
const currentStage = computed(() => currentAssignment.value?.stage ?? 0)
// dayEnded (computed) - true once every journey step has been done.
const dayEnded = computed(() => currentStage.value >= JOURNEY_STAGES.length)
// nextStage (computed) - the next journey step to do, or null when the day is over.
const nextStage = computed(() => JOURNEY_STAGES[currentStage.value] ?? null)
// lastStage (computed) - the journey step done most recently, or null if none yet.
const lastStage = computed(() => JOURNEY_STAGES[currentStage.value - 1] ?? null)
// journeyLeg (computed) - the label and icon for the current leg: "Day complete", "Going to Padang" or
// "Returning to school".
const journeyLeg = computed(() => {
  if (currentStage.value >= JOURNEY_STAGES.length)
    return { text: 'Day complete', icon: 'bi-check-circle-fill' }
  return nextStage.value.leg === 'out'
    ? { text: 'Going to Padang', icon: 'bi-arrow-right-circle-fill' }
    : { text: 'Returning to school', icon: 'bi-arrow-left-circle-fill' }
})

// routeTarget (computed) - where the route goes: Padang on the way there, the allocated school from
// checkpoint 4 ("Reached Padang") onwards; falls back to Padang if the school has no coordinates.
const routeTarget = computed(() => {
  const school = currentAssignment.value?.school
  if (currentStage.value >= 4 && school?.lat != null && school?.lng != null) {
    return { lat: school.lat, lng: school.lng, name: school.name || 'school' }
  }
  return { lat: DEST.lat, lng: DEST.lng, name: 'Padang' }
})

// watch(routeTarget) - when the destination really changes (stage 4 reached or undone, another show
// picked) fetch the new route.
watch(routeTarget, (now, before) => {
  if (now.lat !== before.lat || now.lng !== before.lng) drawRoute(false, true)
})

// watch(dayEnded) - when the day ends cancel any route request, remove the line, clear the route info
// and the loading flags; if the day is un-ended (Undo) draw the route again.
watch(dayEnded, (ended) => {
  if (!map) return
  if (ended) {
    routeRequestId++
    flushPreview(false)
    removeRoute()
    routeInfo.value = null
    routeBase = null
    routeError.value = ''
    loadingRoute.value = false
    routeBusy.value = false
  } else if (!loadingRoute.value && !routeBusy.value) {
    drawRoute(false, true)
  }
})

// journeyReturning (computed) - true during the return leg (stages 4 to 7).
const journeyReturning = computed(
  () => currentStage.value >= 4 && currentStage.value < JOURNEY_STAGES.length,
)
// journeyDots (computed) - works out how each of the 4 dots looks for the current stage. The 4 dots
// play twice: left to right to Padang (stages 1-4), then in reverse on the way back. For each dot it
// returns its label, title and CSS classes: out and back (reached), link-out and link-back (the line
// before it is coloured), next (pulses), flow-fwd and flow-back (the animating line).
const journeyDots = computed(() => {
  const st = currentStage.value
  const back = st >= 4
  const nextPos = st >= 8 ? 0 : back ? 8 - st : st + 1
  const flowDot = st >= 8 ? 0 : back ? Math.min(3, 8 - st) + 1 : st + 1
  return [1, 2, 3, 4].map((d) => {
    const stageForDot = back ? JOURNEY_STAGES[8 - d] : JOURNEY_STAGES[d - 1]
    const reachedNow = back ? st >= 9 - d && st >= 5 : st >= d
    return {
      pos: d,
      label: stageForDot.label + (reachedNow ? ' (done)' : ''),
      title: stageForDot.label,
      classes: {
        out: st >= d,
        back: st >= 5 && st >= 9 - d,
        'link-out': d >= 2 && st >= d,
        'link-back': d >= 2 && st >= 10 - d,
        next: d === nextPos,
        'flow-fwd': d >= 2 && d === flowDot && !back,
        'flow-back': d >= 2 && d === flowDot && back,
      },
    }
  })
})

// sendStage(assignment, request) - sends one checkpoint change and applies the server's answer. 1)
// ignore if a request is running 2) show busy and clear the error 3) call the request 4) store the new
// stage and history on the assignment 5) onStageChanged shows the toast 6) a 409 means our stage
// differs from the server's (double tap, second phone, new day): take the server's stage 7) any other
// error shows a message 8) always clear busy.
async function sendStage(assignment, request) {
  if (stageBusy.value) return
  stageBusy.value = true
  stageError.value = ''
  try {
    const res = await request()
    const before = assignment.stage
    assignment.stage = res.data.stage
    assignment.stageHistory = res.data.stageHistory
    onStageChanged(before, res.data.stage)
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

// showToast(text, icon, tone) - shows the small checkpoint message for 2.6 seconds.
function showToast(text, icon, tone) {
  toast.value = { text, icon, tone }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 2600)
}

// onStageChanged(before, after) - forward: toast with the checkpoint name (or "Day complete"), a ring
// pulse on the marker and a short vibration; backward: toast "Checkpoint removed".
function onStageChanged(before, after) {
  if (after === before) return
  if (after > before) {
    const done = JOURNEY_STAGES[after - 1]
    const finished = after >= JOURNEY_STAGES.length
    showToast(
      finished ? 'Day complete' : done.label,
      finished ? 'bi-check-circle-fill' : 'bi-check2-circle',
      finished ? 'done' : journeyReturning.value ? 'back' : 'out',
    )
    pulseRing()
    navigator.vibrate?.(40)
  } else {
    showToast('Checkpoint removed', 'bi-arrow-counterclockwise', 'neutral')
  }
}

// pulseRing() - adds a short-lived ring element to the user's marker (removed when its animation ends,
// or after 1.5 s).
function pulseRing() {
  const el = myMarker?.getElement()
  if (!el) return
  const ring = document.createElement('span')
  ring.className = 'checkpoint-ring' + (journeyReturning.value ? ' back' : '')
  el.appendChild(ring)
  // remove - small helper that removes the pulsing ring from the map.
  const remove = () => ring.remove()
  ring.addEventListener('animationend', remove, { once: true })
  setTimeout(remove, 1500)
}

// advanceStage() - the big button: clock the next checkpoint (PUT stage + 1). Ignored when the day is
// complete.
function advanceStage() {
  const a = currentAssignment.value
  if (!a || a.stage >= JOURNEY_STAGES.length) return
  sendStage(a, () => axios.put('/api/assignments/me/stage', { show: a.show, stage: a.stage + 1 }))
}

// undoStage() - the Undo link: DELETE the last checkpoint (can be repeated).
function undoStage() {
  const a = currentAssignment.value
  if (!a || a.stage < 1) return
  sendStage(a, () =>
    axios.delete('/api/assignments/me/stage', { params: { show: a.show, stage: a.stage } }),
  )
}

const trackingOn = ref(false)
const lastSentAt = ref(0)
const clock = ref(Date.now())
const SHARE_FRESH_MS = 90000

const SHARE_LABELS = {
  sharing: 'Sharing location',
  blocked: 'Location blocked',
  off: 'Not sharing',
  waiting: 'Connecting…',
}

// shareStatus (computed) - which pill to show: none when not tracking; 'blocked' for a location error;
// 'off' when the server stopped us; 'sharing' when a send was recent; otherwise 'waiting'.
const shareStatus = computed(() => {
  if (!trackingOn.value) return null
  if (geoError.value) return 'blocked'
  if (!reporting.value) return 'off'
  if (lastSentAt.value && clock.value - lastSentAt.value < SHARE_FRESH_MS) return 'sharing'
  return 'waiting'
})

// shareHint (computed) - the tooltip text for the pill.
const shareHint = computed(
  () =>
    ({
      sharing: 'Organisers can see your location while this page is open.',
      blocked: geoError.value,
      off: 'Sharing stopped. You may be logged out or have no accepted show.',
      waiting: 'Waiting for a good location fix.',
    })[shareStatus.value] ?? '',
)

// showNoShows / noShows (computed) - the blurred "No allocated shows yet" overlay (or "Could not load
// your shows" on error) shown once the shows are known and none is accepted.
const showNoShows = computed(() => assignStatus.value !== 'loading' && !assignments.value.length)
// noShows (computed) - the empty-state message when there are no shows: a "could not load" message if
// the allocation check failed, otherwise "No allocated shows yet" telling the volunteer to accept a
// show.
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

// loadAssignments() - 1) GET my assignments 2) keep only Accepted ones, sorted by show number (NE Show
// 1, 2, 3, 4) 3) reopen on the show picked earlier this session if still accepted, otherwise the first
// 4) mark ready 5) on any error mark 'error'. Loads the volunteer's accepted shows. They follow the
// order of availableShows, and the first one is selected by default. Loads the volunteer's
// allocations, keeps the accepted ones in order (NE Show 1, 2, 3, 4). The first one is selected by
// default.
async function loadAssignments() {
  try {
    const res = await axios.get('/api/assignments/me')
    assignments.value = res.data
      .filter((a) => a.status === 'Accepted')
      .sort((a, b) => a.show.localeCompare(b.show, undefined, { numeric: true }))
    const saved = getSavedShow()
    selectedShow.value = assignments.value.some((a) => a.show === saved)
      ? saved
      : (assignments.value[0]?.show ?? '')
    assignStatus.value = 'ready'
  } catch {
    assignStatus.value = 'error'
  }
}

// notice (computed) - the single popup message. Priority: location error, route error, checkpoint
// error, then the info "Location tracking is on".
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

let map = null
let L = null
let volunteerLayer = null
let meIcon = null
let myMarker = null
let routeLine = null
let routeCasing = null
let revealFrame = null
let previewing = false
let previewRun = 0
let pendingShow = null
let recenterTimer = null
let recenterFlying = false
let toastTimer = null
let routeRenderer = null
let routeLabel = null
let schoolMarker = null

let firstFix = true
let lastRouteLoc = null
let animFrame = null
let recentering = false
let heading = null
let prevFix = null
let shownHeading = null
let routeBase = null
let routeRequestId = 0
let lastFixAt = 0
let lastReported = null
let reportInFlight = false
let refreshing = false
let lastAttemptAt = 0
let reportTimer = null
let catchUp = false

// distanceMeters(a, b) - straight-line distance between two points in metres.
const distanceMeters = (a, b) => haversineKm(a, b) * 1000

// bearingDeg(a, b) - compass bearing from a to b in degrees (0 north, 90 east).
function bearingDeg(a, b) {
  // toRad(d) - converts degrees to radians.
  const toRad = (d) => (d * Math.PI) / 180
  // toDeg(r) - converts radians to degrees.
  const toDeg = (r) => (r * 180) / Math.PI
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// routeMidpoint(coords) - the point halfway along the route's LENGTH (not just the middle vertex): add
// up the segment lengths, then walk until half is reached and interpolate inside that segment. Used to
// place the "xx min" pill.
function routeMidpoint(coords) {
  if (coords.length < 2) return coords[0]
  // segLen(i) - length of route segment i, between point i-1 and point i, in metres.
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

// placeRouteLabel(coords, minutes) - creates the "xx min" pill on first call, then moves it and
// refreshes its text on later calls.
function placeRouteLabel(coords, minutes) {
  const pos = routeMidpoint(coords)
  if (!routeLabel) {
    routeLabel = L.marker(pos, {
      icon: createRouteLabelIcon(minutes),
      interactive: false,
      keyboard: false,
      zIndexOffset: -100,
    }).addTo(volunteerLayer)
  } else {
    routeLabel.setLatLng(pos)
    routeLabel.setIcon(createRouteLabelIcon(minutes))
  }
}

// drawSchool() - replaces the school marker with the allocated school of the selected show (with a
// hover tooltip). The camera never moves.
function drawSchool() {
  if (!map) return

  if (schoolMarker) volunteerLayer.removeLayer(schoolMarker)
  schoolMarker = null

  const s = currentAssignment.value?.school
  if (s?.lat == null || s?.lng == null) return

  schoolMarker = L.marker([s.lat, s.lng], { icon: createSchoolIcon(), zIndexOffset: -50 }).addTo(
    volunteerLayer,
  )
  bindTip(
    schoolMarker,
    tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: s.name || 'School' }),
  )
}

// onMapReady(m, leaflet) - BaseMap is ready. 1) keep map and L 2) make a shared canvas renderer for
// the route 3) make the marker layer 4) add the Padang flag marker 5) move the zoom buttons to the
// bottom right 6) dragging the map turns off "following" 7) tapping the map closes the sheet 8) draw
// my marker, the route and the school if we already have data.
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  routeRenderer = L.canvas()
  volunteerLayer = L.layerGroup().addTo(map)
  meIcon = createDotIcon()

  const destMarker = L.marker([DEST.lat, DEST.lng], { icon: createDestIcon() }).addTo(
    volunteerLayer,
  )
  bindTip(destMarker, tipCard({ icon: 'bi-flag-fill', tone: 'dest', title: 'Padang' }))

  map.zoomControl?.setPosition('bottomright')
  // map dragstart - when the user drags the map by hand, stop following their position, cancel any
  // pending re-centre and finish any route preview.
  map.on('dragstart', () => {
    following.value = false
    clearTimeout(recenterTimer)
    recenterFlying = false
    flushPreview(true)
  })
  map.on('click', collapseSheet)
  drawMyMarker(true)
  drawRoute(false, false)
  drawSchool()
}

// drawMyMarker(shouldCenter) - creates the user's marker on the first call, otherwise glides it to the
// latest position; optionally centres the map; then refreshes the direction cone.
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

  if (shouldCenter) map.setView([lat, lng], map.getMaxZoom())
  updateHeadingUI()
}

// moveMarkerSmooth(lat, lng) - animates the marker from its current spot to the new one over GLIDE_MS
// (snaps if the jump is over 500 m). While "following" the camera pans along each frame.
function moveMarkerSmooth(lat, lng, duration = GLIDE_MS) {
  const from = myMarker.getLatLng()
  const to = L.latLng(lat, lng)

  cancelAnimationFrame(animFrame)

  if (from.distanceTo(to) > BIG_JUMP_M) {
    myMarker.setLatLng(to)
    if (following.value && !recentering && !previewing) map.panTo(to, { animate: false })
    return
  }

  const start = performance.now()
  // step(now) - one animation frame of the marker glide: works out progress from 0 to 1, moves the dot
  // part of the way, keeps the map centred on it when following, and asks for the next frame until
  // done.
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1)
    const cur = [from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]
    myMarker.setLatLng(cur)
    if (following.value && !recentering && !previewing) map.panTo(cur, { animate: false })
    if (t < 1) animFrame = requestAnimationFrame(step)
  }
  animFrame = requestAnimationFrame(step)
}

// flyToMe(ms) - animates the map to the user at max zoom and blocks other camera moves for that time.
function flyToMe(ms = 900) {
  clearTimeout(recenterTimer)
  recentering = true
  recenterFlying = true
  map.flyTo(myMarker.getLatLng(), map.getMaxZoom(), { duration: ms / 1000 })
  recenterTimer = setTimeout(() => {
    recentering = false
    recenterFlying = false
  }, ms + 150)
}

// recenter() - the recenter button: turn following back on, end any route preview and fly to the user
// (skipped when already centred).
function recenter() {
  if (!map || !myMarker) return
  following.value = true
  flushPreview(true)
  if (recenterFlying) return
  const gap = map
    .latLngToContainerPoint(myMarker.getLatLng())
    .distanceTo(map.latLngToContainerPoint(map.getCenter()))
  if (map.getZoom() === map.getMaxZoom() && gap < 3) return
  flyToMe()
}

// updateHeading(pos) - works out the direction in degrees: the device's own heading if present,
// otherwise the bearing between the last two positions that are at least 3 m apart. Cleared on
// desktop.
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

  if (!prevFix || movedFar) {
    prevFix = { lat: location.value.lat, lng: location.value.lng }
  }
}

// updateHeadingUI() - shows and rotates the blue direction cone on the user's dot (smoothly, taking
// the shortest turn), or hides it when the direction is unknown.
function updateHeadingUI() {
  const el = myMarker?.getElement()?.querySelector('.me-dot-cone')
  if (!el) return
  if (!showHeading || heading === null) {
    el.style.display = 'none'
    return
  }
  el.style.display = 'block'
  if (shownHeading === null) shownHeading = heading
  const diff = ((((heading - shownHeading + 180) % 360) + 360) % 360) - 180
  shownHeading += diff * 0.35
  el.style.transform = `rotate(${shownHeading}deg)`
}

// removeRoute() - removes the route line, its white casing and the "xx min" pill from the map.
function removeRoute() {
  cancelAnimationFrame(revealFrame)
  routeLine?.remove()
  routeCasing?.remove()
  routeLine = null
  routeCasing = null
  if (routeLabel) {
    volunteerLayer.removeLayer(routeLabel)
    routeLabel = null
  }
}

// routeStyles() - the line styles: blue on the way to Padang, teal on the way back; the walk mode uses
// dots instead of a solid line.
function routeStyles() {
  const color = journeyReturning.value ? '#0d9488' : '#1a73e8'
  const walk = travelMode.value === 'walk'
  return {
    casing: {
      color: '#ffffff',
      weight: walk ? 11 : 10,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: walk ? '1 11' : null,
      renderer: routeRenderer,
      interactive: false,
    },
    line: {
      color,
      weight: walk ? 7 : 6,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: walk ? '1 11' : null,
      renderer: routeRenderer,
      interactive: false,
    },
  }
}

// revealRoute(coords, casing, line, ms) - animates the route being drawn from the start to the end by
// adding more of the points each frame (ease-out).
function revealRoute(coords, casing, line, ms = 800) {
  cancelAnimationFrame(revealFrame)
  const start = performance.now()
  // step(now) - one animation frame of the route reveal: eases the progress and draws more and more of
  // the route line each frame until the whole route shows.
  const step = (now) => {
    const t = Math.min((now - start) / ms, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    const part = coords.slice(0, Math.max(2, Math.ceil(coords.length * eased)))
    casing.setLatLngs(part)
    line.setLatLngs(part)
    if (t < 1) revealFrame = requestAnimationFrame(step)
  }
  revealFrame = requestAnimationFrame(step)
}

// sleep(ms) - waits that long (used by the route preview steps).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// fadeRoute(visible) - fades the whole canvas route layer in or out.
function fadeRoute(visible) {
  const el = routeRenderer?._container
  if (!el) return
  el.style.transition = 'opacity 0.25s ease'
  el.style.opacity = visible ? '1' : '0'
}

// flushPreview(showPending) - ends a route preview straight away: bumps the run id, clears the flags,
// optionally places the pending route, and fades the route back in.
function flushPreview(showPending = true) {
  previewRun++
  previewing = false
  if (!recenterFlying) recentering = false
  const pending = pendingShow
  pendingShow = null
  if (showPending && pending) pending()
  fadeRoute(true)
}

// previewRoute(coords, place) - the route "flythrough". 1) zoom the camera to fit the whole route and
// my position 2) after 1 s draw the route 3) after 2 more seconds fade it 4) fly back to me if still
// following 5) fade the route in. Every step checks it is still the latest run (alive) so a new action
// cancels it.
async function previewRoute(coords, place) {
  const run = ++previewRun
  // alive() - true while this route preview is still the latest one; older previews stop when it turns
  // false.
  const alive = () => run === previewRun
  pendingShow = place
  const narrow = window.matchMedia('(max-width: 991.98px)').matches
  const bounds = L.latLngBounds(coords).extend(myMarker.getLatLng())
  fadeRoute(false)
  previewing = true
  recentering = true
  map.flyToBounds(bounds, {
    paddingTopLeft: [narrow ? 40 : 440, 90],
    paddingBottomRight: [40, narrow ? 40 : 60],
    maxZoom: 17,
    duration: 0.9,
  })
  await sleep(1000)
  if (!alive()) return
  recentering = false
  pendingShow = null
  place()
  fadeRoute(true)
  await sleep(2000)
  if (!alive()) return
  fadeRoute(false)
  await sleep(250)
  if (!alive()) return
  previewing = false
  if (following.value) flyToMe()
  await sleep(1100)
  if (!alive()) return
  fadeRoute(true)
}

// drawRoute(background, preview) - fetches and draws the route from my position to routeTarget. 1)
// stop if no map, no position or the day ended 2) a normal call clears preview and (soft) dims the old
// line or (hard) removes it and shows the overlay 3) number the request so a slow old answer cannot
// overwrite a newer one 4) GET /api/users/route (no timeout set) 5) decode the line, save a snapshot
// for live estimates and the summary 6) place() draws casing and line (animated unless background) 7)
// when previewing play the flythrough 8) on error restore the line and show "Could not load route." 9)
// clear the loading flags if still the latest request.
async function drawRoute(background = false, preview = false) {
  if (!map || !location.value || dayEnded.value) return

  if (!background) flushPreview(false)

  const soft = !background && preview && (!!routeLine || !!routeInfo.value)

  if (!background) {
    if (soft) {
      routeLine?.setStyle({ opacity: 0.3 })
      routeCasing?.setStyle({ opacity: 0.3 })
      routeBusy.value = true
    } else {
      removeRoute()
      routeInfo.value = null
      loadingRoute.value = true
    }
  }

  const requestId = ++routeRequestId
  const { lat, lng } = location.value

  try {
    const res = await axios.get('/api/users/route', {
      params: {
        startLat: lat,
        startLng: lng,
        endLat: routeTarget.value.lat,
        endLng: routeTarget.value.lng,
        routeType: travelMode.value,
      },
    })

    if (requestId !== routeRequestId || dayEnded.value) return

    routeError.value = ''

    const coords = polyline.decode(res.data.route_geometry)
    const sum = res.data.route_summary
    const minutes = Math.round(sum.total_time / 60)
    routeBase = {
      straight: distanceMeters({ lat, lng }, routeTarget.value),
      km: sum.total_distance / 1000,
      minutes: sum.total_time / 60,
    }
    routeInfo.value = {
      minutes,
      km: (sum.total_distance / 1000).toFixed(1),
    }

    // place() - draws the new route: creates the outline and coloured line (only the first two points
    // if it will animate), removes the old route, stores the new one and starts the reveal animation
    // when needed.
    const place = () => {
      const styles = routeStyles()
      const animate = !background && coords.length > 2
      const seed = animate ? coords.slice(0, 2) : coords
      const newCasing = L.polyline(seed, styles.casing).addTo(map)
      const newLine = L.polyline(seed, styles.line).addTo(map)
      cancelAnimationFrame(revealFrame)
      routeLine?.remove()
      routeCasing?.remove()
      routeLine = newLine
      routeCasing = newCasing
      if (animate) revealRoute(coords, newCasing, newLine)
      placeRouteLabel(coords, minutes)
    }

    if (preview && following.value && myMarker) {
      cancelAnimationFrame(revealFrame)
      routeLine?.remove()
      routeCasing?.remove()
      routeLine = null
      routeCasing = null
      if (routeLabel) {
        volunteerLayer.removeLayer(routeLabel)
        routeLabel = null
      }
      previewRoute(coords, place)
    } else {
      place()
    }
  } catch (err) {
    if (requestId !== routeRequestId) return
    routeLine?.setStyle({ opacity: 1 })
    routeCasing?.setStyle({ opacity: 0.95 })
    fadeRoute(true)
    routeError.value = err.response?.data?.message || 'Could not load route.'
  } finally {
    if (requestId === routeRequestId) {
      loadingRoute.value = false
      routeBusy.value = false
    }
  }
}

// liveInfo (computed) - the time and distance in the sheet. Between route fetches they shrink in
// proportion to the straight-line distance still to go; each new route replaces them with exact
// numbers.
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

// Keep the pill's minutes in step with the sheet as the user moves Keep the pill's minutes in step
// with the sheet as the user moves.
watch(
  () => liveInfo.value?.minutes,
  (min) => {
    if (routeLabel && min != null) routeLabel.setIcon(createRouteLabelIcon(min))
  },
)

// setTravelMode(mode) - switch Drive/Walk (ignored if unchanged) and fetch a new route with the
// preview.
function setTravelMode(mode) {
  if (mode === travelMode.value) return
  travelMode.value = mode
  drawRoute(false, true)
}

// reportLocation(force) - sends my position to the server so the admin Live Board shows it. Skips
// when: not reporting, a send is running, no position, the fix is older than 2 minutes, the last
// attempt was under 6 s ago, accuracy is worse than 100 m, or (unless forced) I moved under 25 m and
// waited under 30 s. On success remember the time (the pill turns green); on 401/403 stop reporting
// (retrying will not help); other errors are ignored and retried later.
async function reportLocation(force = false) {
  if (!reporting.value || reportInFlight || !location.value) return
  if (Date.now() - lastFixAt > REPORT_MAX_FIX_AGE_MS) return
  if (Date.now() - lastAttemptAt < REPORT_MIN_GAP_MS) return

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
    lastSentAt.value = Date.now()
    clock.value = lastSentAt.value
  } catch (err) {
    const status = err.response?.status
    if (status === 401 || status === 403) reporting.value = false
  } finally {
    reportInFlight = false
  }
}

// refreshIfStill() - the browser only reports a new position when you MOVE, so standing still makes
// the last fix grow old and the pill would drop to "Connecting". After 25 s without a fix ask for one
// fresh reading; if GPS is really lost it fails quietly and the pill changes honestly.
async function refreshIfStill() {
  if (refreshing || !trackingOn.value || !location.value) return
  if (Date.now() - lastFixAt < STILL_REFRESH_MS) return
  refreshing = true
  try {
    onPosition(await getUserLocation())
  } catch {
  } finally {
    refreshing = false
  }
}

// onVisibilityChange() - when the tab becomes visible again: allow reporting again, mark catch-up
// (send straight away) and restart the GPS watch.
function onVisibilityChange() {
  if (document.visibilityState !== 'visible' || !trackingOn.value) return
  reporting.value = true
  catchUp = true
  startTracking(onPosition, onGeoError)
}

// onPosition(pos) - runs on every new GPS fix. After the first fix, a fix that is too inaccurate is
// ignored. Otherwise it stores the location, clears any location error, records the time, and then
// updates the heading, the marker and the route.
function onPosition(pos) {
  if (!firstFix && pos.coords.accuracy > DISPLAY_MAX_ACCURACY_M) {
    lastFixAt = Date.now()
    return
  }
  location.value = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  }
  geoError.value = ''
  lastFixAt = Date.now()
  const forceReport = catchUp
  catchUp = false

  updateHeading(pos)

  if (firstFix) {
    firstFix = false
    showTrackingNotice()
    reportLocation(true)
    drawMyMarker(true)
    drawRoute(false, false)
    lastRouteLoc = { ...location.value }
  } else {
    drawMyMarker(false)
    reportLocation(forceReport)
    if (distanceMeters(lastRouteLoc, location.value) > REROUTE_M) {
      drawRoute(true)
      lastRouteLoc = { ...location.value }
    }
  }
}

// onGeoError(err) - turns a location error (permission denied, timeout...) into a readable message.
function onGeoError(err) {
  geoError.value = geolocationMessage(err)
}

let noticeTimer = null

// showTrackingNotice() - shows "Location tracking is on" for 5 seconds.
function showTrackingNotice() {
  showTrackingInfo.value = true
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (showTrackingInfo.value = false), 5000)
}

// dismissNotice() - the popup X: clears whichever message is showing (location, route, checkpoint or
// info).
function dismissNotice() {
  if (geoError.value) geoError.value = ''
  else if (routeError.value) routeError.value = ''
  else if (stageError.value) stageError.value = ''
  else showTrackingInfo.value = false
}

const sheetEl = ref(null)
const peekEl = ref(null)
const expanded = ref(false)
const dragging = ref(false)
const sheetAnimated = ref(false)
const sheetFull = ref(0)
const sheetPeek = ref(0)
const sheetVisible = ref(0)

let dragStartY = 0
let dragStartVisible = 0
let dragMoved = false
let sheetObserver = null

// sheetStyle (computed) - slides the sheet down by the hidden part with translateY.
const sheetStyle = computed(() => ({
  transform: `translateY(${sheetFull.value - sheetVisible.value}px)`,
}))

// measureSheet() - measures the open and collapsed heights and snaps to the current state (not while
// dragging).
function measureSheet() {
  if (!sheetEl.value || !peekEl.value) return
  sheetFull.value = sheetEl.value.offsetHeight
  sheetPeek.value = peekEl.value.offsetHeight
  if (!dragging.value) sheetVisible.value = expanded.value ? sheetFull.value : sheetPeek.value
}

// collapseSheet() - closes the sheet (a tap on the map). toggleSheet() below opens it if closed and
// closes it if open.
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

// onSheetPointerDown(e) - start of a drag or tap on the handle: remember the start position and
// capture the pointer so moves outside the handle still arrive.
function onSheetPointerDown(e) {
  dragging.value = true
  dragMoved = false
  dragStartY = e.clientY
  dragStartVisible = sheetVisible.value
  e.currentTarget.setPointerCapture(e.pointerId)
}

// onSheetPointerMove(e) - the sheet height follows the finger, clamped between collapsed and open; a
// move over 4 px counts as a drag.
function onSheetPointerMove(e) {
  if (!dragging.value) return
  const dy = dragStartY - e.clientY
  if (Math.abs(dy) > 4) dragMoved = true
  sheetVisible.value = Math.min(sheetFull.value, Math.max(sheetPeek.value, dragStartVisible + dy))
}

// onSheetPointerUp() - a tap toggles; a drag snaps to whichever end is nearer.
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

let disposed = false

// beginTracking() - runs once when the volunteer has an accepted show: marks tracking on, starts the
// GPS watch and a 5 second timer that updates the clock, refreshes a stale fix and checks whether to
// report.
function beginTracking() {
  if (trackingOn.value) return
  trackingOn.value = true
  startTracking(onPosition, onGeoError)
  reportTimer = setInterval(() => {
    clock.value = Date.now()
    refreshIfStill()
    reportLocation()
  }, 5000)
}

// setupTracking() - load the accepted shows, then start tracking only if there is at least one (and
// the page is still open).
async function setupTracking() {
  assignStatus.value = 'loading'
  await loadAssignments()
  if (!disposed && assignments.value.length) beginTracking()
}

// onMounted - listen for tab visibility, measure the sheet and watch its size, enable the sheet
// animation after first layout, then run setupTracking.
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  measureSheet()
  sheetObserver = new ResizeObserver(measureSheet)
  sheetObserver.observe(sheetEl.value)
  requestAnimationFrame(() => (sheetAnimated.value = true))
  setupTracking()
})

// onUnmounted - stop GPS, timers, animation frames and listeners when leaving the page.
onUnmounted(() => {
  disposed = true
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopTracking()
  cancelAnimationFrame(animFrame)
  sheetObserver?.disconnect()
  clearTimeout(noticeTimer)
  clearInterval(reportTimer)
  previewRun++
  clearTimeout(recenterTimer)
  clearTimeout(toastTimer)
  cancelAnimationFrame(revealFrame)
})
</script>

<template>
  <!-- The map, the route card, the stage buttons, the sharing status pill and the empty states. -->
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

      <Transition name="loading-fade">
        <MapLoading
          v-if="loadingRoute || assignStatus === 'loading'"
          text="Fetching Location Data..."
        />
      </Transition>

      <Transition name="fade" mode="out-in">
        <div
          v-if="shareStatus"
          :key="shareStatus"
          class="share-pill"
          data-testid="share-status"
          :class="shareStatus"
          role="status"
          :title="shareHint"
        >
          <span class="share-dot" aria-hidden="true"></span>{{ SHARE_LABELS[shareStatus] }}
        </div>
      </Transition>

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

      <Transition name="toast">
        <div v-if="toast" class="checkpoint-toast" :class="toast.tone" role="status">
          <i class="bi" :class="toast.icon" aria-hidden="true"></i>
          <span>{{ toast.text }}</span>
        </div>
      </Transition>

      <IncidentReportForm
        v-if="showIncidentReport"
        :location="location"
        :school="currentAssignment?.school?.name"
        :show="currentAssignment?.show"
        @close="showIncidentReport = false"
      />

      <div v-show="!showIncidentReport" ref="sheetEl" class="sheet" :style="sheetStyle">
        <div ref="peekEl" class="sheet-peek">
          <div
            class="sheet-handle"
            role="button"
            tabindex="0"
            :aria-expanded="expanded"
            aria-label="Toggle route details"
            data-testid="sheet-toggle"
            @pointerdown="onSheetPointerDown"
            @pointermove="onSheetPointerMove"
            @pointerup="onSheetPointerUp"
            @pointercancel="onSheetPointerUp"
            @keydown.enter.prevent="toggleSheet"
            @keydown.space.prevent="toggleSheet"
          >
            <span class="sheet-grip"></span>
          </div>

          <div v-if="!dayEnded" class="mode-toggle" role="group" aria-label="Travel mode">
            <span
              class="mode-thumb"
              aria-hidden="true"
              :style="{
                transform: travelMode === 'walk' ? 'translateX(calc(100% + 4px))' : 'none',
              }"
            ></span>
            <button
              v-for="m in MODES"
              :key="m.key"
              type="button"
              class="mode-btn"
              :class="{ active: travelMode === m.key }"
              :disabled="loadingRoute || routeBusy"
              @click="setTravelMode(m.key)"
            >
              <i class="bi" :class="m.icon"></i> {{ m.label }}
            </button>
          </div>
        </div>

        <div class="sheet-details">
          <div v-if="!dayEnded" class="route-summary">
            <Transition name="swap" mode="out-in">
              <div
                :key="travelMode + (journeyReturning ? 'b' : 'o')"
                class="route-icon"
                :class="{ returning: journeyReturning }"
                aria-hidden="true"
              >
                <i class="bi" :class="activeMode.icon"></i>
              </div>
            </Transition>
            <div>
              <Transition name="swap" mode="out-in">
                <div :key="activeMode.verb + routeTarget.name" class="sheet-title">
                  {{ activeMode.verb }} to {{ routeTarget.name }}
                </div>
              </Transition>
              <Transition name="swap" mode="out-in">
                <div
                  v-if="liveInfo"
                  :key="'stats-' + travelMode"
                  class="route-stats"
                  :class="{ 'is-busy': routeBusy }"
                >
                  <span class="route-min" :class="{ returning: journeyReturning }"
                    >{{ liveInfo.minutes }} min</span
                  >
                  <span class="route-km">{{ liveInfo.km }} km</span>
                  <span
                    v-if="routeBusy"
                    class="spinner-border spinner-border-sm text-primary ms-2"
                    aria-hidden="true"
                  ></span>
                </div>
                <div v-else key="wait" class="route-stats text-muted">
                  <span
                    class="spinner-border spinner-border-sm text-primary me-2"
                    aria-hidden="true"
                  ></span
                  >Finding route…
                </div>
              </Transition>
            </div>
          </div>

          <div class="assign" :class="{ 'day-ended': dayEnded }">
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
                  <div class="info-value" data-testid="track-school">
                    {{ currentAssignment?.school?.name || '—' }}
                  </div>
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

              <div class="journey" :class="{ done: !nextStage, returning: journeyReturning }">
                <div class="journey-head">
                  <span class="journey-leg"
                    ><i class="bi" :class="journeyLeg.icon" aria-hidden="true"></i
                    >{{ journeyLeg.text }}</span
                  >
                  <span class="journey-count" data-testid="journey-count"
                    >{{ currentStage }}/{{ JOURNEY_STAGES.length }}</span
                  >
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

                <button
                  v-if="nextStage"
                  type="button"
                  class="journey-btn"
                  :disabled="stageBusy"
                  data-testid="journey-next"
                  @click="advanceStage"
                >
                  <span
                    v-if="stageBusy"
                    class="spinner-border spinner-border-sm"
                    aria-hidden="true"
                  ></span>
                  <i v-else class="bi bi-check2-circle" aria-hidden="true"></i>
                  {{ nextStage.label }}
                </button>
                <div v-else class="journey-complete" data-testid="journey-complete">
                  <i class="bi bi-check-circle-fill" aria-hidden="true"></i> Day complete
                </div>
              </div>

              <button
                type="button"
                class="report-open-btn"
                :disabled="dayEnded"
                data-testid="incident-open"
                @click="showIncidentReport = true"
              >
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> Report incident
              </button>
            </template>

            <div v-else-if="assignStatus === 'loading'" class="assign-msg">
              <span
                class="spinner-border spinner-border-sm text-primary me-2"
                aria-hidden="true"
              ></span
              >Loading your shows…
            </div>
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
/* Styles for the map overlays, the route card and the stage buttons. */

.recenter-btn {
  position: absolute;
  right: 10px;
  bottom: calc(30px + var(--map-inset-bottom, 0px));
  z-index: 1000;
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

.recenter-btn.active {
  color: #1a73e8;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1050;
  background: #fff;
  color: #1f2430;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -2px 12px rgb(0 0 0 / 0.15);
}

.sheet-handle {
  display: flex;
  justify-content: center;
  padding: 10px 0 8px;
  cursor: grab;
  touch-action: none;
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

.mode-toggle {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 0 16px;
  padding: 4px;
  background: #f1f3f6;
  border-radius: 12px;
}

.mode-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 6px);
  border-radius: 9px;
  background: #2563eb;
  box-shadow: 0 2px 6px rgb(37 99 235 / 0.35);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mode-btn {
  position: relative;
  z-index: 1;
  transition: color 0.2s;
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
  color: #fff;
}

.mode-btn:disabled {
  opacity: 0.7;
  cursor: progress;
}

.sheet-details {
  padding: 4px 16px 16px;
}

.sheet-title {
  font-size: 1.1rem;
  overflow-wrap: anywhere;
}

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
  transition: color 0.4s;
}
.route-min.returning {
  color: #0d9488;
}
.route-icon {
  transition: background-color 0.4s;
}
.route-icon.returning {
  background: #0d9488;
}
.route-stats {
  transition: opacity 0.2s;
}
.route-stats.is-busy {
  opacity: 0.55;
}
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.swap-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.94);
}
.swap-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.94);
}

.map-stage :deep(.checkpoint-ring) {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  box-sizing: border-box;
  border: 3px solid #1a73e8;
  border-radius: 50%;
  pointer-events: none;
  animation: checkpoint-ring-out 0.9s ease-out forwards;
}
.map-stage :deep(.checkpoint-ring.back) {
  border-color: #0d9488;
}
@keyframes checkpoint-ring-out {
  from {
    opacity: 0.9;
    transform: scale(0.6);
  }
  to {
    opacity: 0;
    transform: scale(4);
  }
}

.checkpoint-toast {
  position: absolute;
  top: 54px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: calc(100% - 32px);
  z-index: 1150;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 24px;
  background: #1a73e8;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.3);
}
.checkpoint-toast.back {
  background: #0d9488;
}
.checkpoint-toast.done {
  background: #16a34a;
}
.checkpoint-toast.neutral {
  background: #3c4043;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.9);
}

.route-km {
  margin-left: 8px;
  font-size: 0.9rem;
  color: #666;
}

@media (max-width: 991.98px) {
  .map-stage :deep(.leaflet-container) {
    height: calc(100% - max(var(--sheet-visible, 0px) - 16px, 0px));
  }

  .recenter-btn {
    bottom: calc(30px + var(--sheet-visible, 0px));
  }
}

.map-stage.sheet-anim:not(.is-dragging) .sheet {
  transition: transform 0.25s ease;
}

.map-stage.sheet-anim:not(.is-dragging) :deep(.leaflet-container) {
  transition: height 0.25s ease;
}

.map-stage.sheet-anim:not(.is-dragging) .recenter-btn {
  transition:
    bottom 0.25s ease,
    background-color 0.15s,
    box-shadow 0.15s,
    color 0.15s;
}

.assign {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #eceef1;
}

.assign.day-ended {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.show-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
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
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 20px;
}
.jdot:first-child {
  flex: 0 0 12px;
}
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
.jdot.link-out::before {
  background: #2563eb;
}
.jdot.link-back::before {
  background: #0d9488;
}
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

.report-open-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 10px;
  padding: 11px 12px;
  border: 0;
  border-radius: 12px;
  background: #fef2f2;
  color: #dc2626;
  font-weight: 600;
}

.report-open-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.report-open-btn:hover:not(:disabled) {
  background: #fee2e2;
}
.report-open-btn:focus-visible {
  outline: 2px solid #1a73e8;
  outline-offset: 2px;
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

.noshow {
  position: absolute;
  inset: 0;
  z-index: 1120;
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
  color: #1f2430;
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
  .map-stage :deep(.checkpoint-ring),
  .share-pill.sharing .share-dot,
  .jdot.flow-fwd::before,
  .jdot.flow-back::before,
  .jdot.next .dot {
    animation: none;
  }
}

@media (min-width: 992px) {
  .sheet {
    top: 12px;
    bottom: auto;
    left: 12px;
    right: auto;
    width: 400px;
    border-radius: 12px;
    transform: none !important;
  }
  .sheet-handle {
    display: none;
  }
  .sheet-peek {
    padding-top: 16px;
  }
}
</style>
