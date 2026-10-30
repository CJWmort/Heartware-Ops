<!-- The admin Allocation board (F2): choose a show, run or reset the allocation, see each school's
     volunteers on a map and publish. Declined and Withdrawn volunteers are not shown. -->

<script setup>
// Loads assignments and refreshes them every 5 seconds, groups them by school, filters by zone and
// time, runs Allocate, Reset and Publish with confirmations, draws the Leaflet map and handles popups.

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/map/BaseMap.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import MapLoading from '@/components/map/MapLoading.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import AppDropdown from '@/components/common/AppDropdown.vue'
import { getSavedShow, saveShow, getSavedFilter, saveFilter } from '@/services/selected-show'
import { useChatStore } from '@/services/chat'
import { createSchoolIcon, createVolIcon, volTip, schoolTip, bindTip } from '@/utils/map-icons'

const assignments = ref([])
const shows = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const selectedShow = ref(shows.includes(getSavedShow()) ? getSavedShow() : 'NE Show 1')
// watch(selectedShow) - remember the chosen show so it is still selected next visit.
watch(selectedShow, saveShow)

const showDropdownOptions = shows.map((show) => ({ value: show, label: show }))

const searchbar = ref('')
const runningAlloc = ref(false)
const publishing = ref(false)

const popup = ref(null)
let popupTimer = null
// showPopup(type, title, text, ms) - 1) cancel any earlier hide timer 2) set the popup content (red
// warning icon for errors, green tick otherwise) 3) hide it again after ms milliseconds (6 seconds by
// default).
function showPopup(type, title, text, ms = 6000) {
  clearTimeout(popupTimer)
  popup.value = {
    type,
    icon: type === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill',
    title,
    text,
  }
  popupTimer = setTimeout(() => (popup.value = null), ms)
}
// dismissPopup() - the popup X: cancel the timer and hide it now.
function dismissPopup() {
  clearTimeout(popupTimer)
  popup.value = null
}
const confirmDialog = ref(null)
let confirmResolve = null
// askConfirm(options) - opens the ConfirmDialog and returns a Promise. It stores the Promise's resolve
// function, then sets the dialog content. The caller writes: if (!(await askConfirm({...}))) return.
function askConfirm(options) {
  return new Promise((resolve) => {
    confirmResolve = resolve
    confirmDialog.value = options
  })
}
// answerConfirm(ok) - the ConfirmDialog's answer: close the dialog and resolve the waiting Promise
// with true (OK) or false (Cancel).
function answerConfirm(ok) {
  confirmDialog.value = null
  confirmResolve?.(ok)
  confirmResolve = null
}
// popupNotice (computed) - what the MapNotice shows: "Allocating..." while a run is going,
// "Publishing..." while publishing, otherwise the finished message (if any).
const popupNotice = computed(() => {
  if (runningAlloc.value) {
    return {
      type: 'info',
      icon: 'bi-hourglass-split',
      title: 'Allocating...',
      text: 'Matching volunteers to schools.',
    }
  }
  if (publishing.value) {
    return {
      type: 'info',
      icon: 'bi-hourglass-split',
      title: 'Publishing...',
      text: `Publishing ${selectedShow.value}.`,
    }
  }
  return popup.value
})
// groupedAssignments (computed) - turns the flat assignments list into one entry per show with its
// schools (and their volunteers) and the volunteers still without a school. Declined and Withdrawn
// volunteers are left out. It re-runs by itself whenever the assignments change, so the cards, chips
// and map update automatically.
const groupedAssignments = computed(() => {
  const byShow = {}

  for (const a of assignments.value) {
    if (!byShow[a.show]) {
      byShow[a.show] = { schools: [], unassigned: [] }
    }

    const left = a.status === 'Declined' || a.status === 'Withdrawn'

    if (!a.school) {
      if (left) continue
      byShow[a.show].unassigned.push({
        ...a.volunteer,
        assignmentId: a._id,
        status: a.status,
        published: a.published,
      })
      continue
    }

    const showSchools = byShow[a.show].schools

    let schoolEntry = null
    for (const s of showSchools) {
      if (s._id === a.school._id) schoolEntry = s
    }
    if (!schoolEntry) {
      schoolEntry = { ...a.school, volunteers: [] }
      showSchools.push(schoolEntry)
    }

    if (left) continue

    schoolEntry.volunteers.push({
      ...a.volunteer,
      status: a.status,
      distance: a.distance,
      published: a.published,
    })
  }

  const result = {}
  for (const show of Object.keys(byShow).sort()) {
    result[show] = byShow[show]
  }
  return result
})

const API_URL = '/api/'

const chat = useChatStore()
// openChat(volunteer) - opens the chat panel (only if it is closed, because toggle would close it) and
// jumps to that volunteer's thread.
async function openChat(volunteer) {
  if (!volunteer?._id) return
  if (!chat.isOpen) chat.toggle()
  await chat.selectThread(volunteer._id)
}

// filledCount(school) - places used at a school: volunteers who are not Declined or Withdrawn (Pending
// counts as taken).
function filledCount(school) {
  return school.volunteers.filter((v) => v.status !== 'Declined' && v.status !== 'Withdrawn').length
}

// stats (computed) - counts for the selected show: number of schools, unassigned, and volunteers per
// status. Returns all zeros when the show has no data.
const stats = computed(() => {
  const data = groupedAssignments.value[selectedShow.value]
  const s = { schools: 0, Accepted: 0, Pending: 0, Declined: 0, Withdrawn: 0, unassigned: 0 }
  if (!data) return s
  s.schools = data.schools.length
  s.unassigned = data.unassigned.length
  for (const school of data.schools) {
    for (const v of school.volunteers) {
      if (v.status in s) s[v.status]++
    }
  }
  return s
})
// statChips (computed) - the chip list for the template: Schools (no filter), Accepted, Pending.
const statChips = computed(() => [
  { key: '', label: 'Schools', value: stats.value.schools },
  { key: 'Accepted', label: 'Accepted', value: stats.value.Accepted },
  { key: 'Pending', label: 'Pending', value: stats.value.Pending },
])

const statusFilter = ref('')

// toggleStatus(key) - a stat chip was clicked: pressing the active chip again clears the filter.
function toggleStatus(key) {
  statusFilter.value = statusFilter.value === key ? '' : key
}

const needsOnly = ref(false)

const zoneFilter = ref(getSavedFilter('alloc-zone'))
const timeFilter = ref(getSavedFilter('alloc-time'))
// watch(zoneFilter) - remember the chosen zone filter.
watch(zoneFilter, (v) => saveFilter('alloc-zone', v))
// watch(timeFilter) - remember the chosen reporting-time filter.
watch(timeFilter, (v) => saveFilter('alloc-time', v))

// timeToMinutes(t) - converts "7:30 AM", "07:30" or "1:15 PM" to minutes after midnight so times sort
// correctly; anything that cannot be read sorts last (Infinity).
function timeToMinutes(t) {
  const m = String(t || '')
    .trim()
    .match(/^(\d{1,2})[:.]?(\d{2})?\s*(AM|PM)?$/i)
  if (!m) return Infinity
  let h = Number(m[1])
  const min = Number(m[2] || 0)
  const ap = (m[3] || '').toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

// zoneOptions (computed) - the distinct zones of the selected show's schools, sorted naturally (so
// "Zone 2" comes before "Zone 10"). timeOptions below does the same for reporting times.
const zoneOptions = computed(() => {
  const schools = groupedAssignments.value[selectedShow.value]?.schools || []
  return [...new Set(schools.map((s) => s.zone).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  )
})
// timeOptions (computed) - the distinct reporting times of the selected show's schools, earliest
// first, for the time dropdown.
const timeOptions = computed(() => {
  const schools = groupedAssignments.value[selectedShow.value]?.schools || []
  return [...new Set(schools.map((s) => s.reportingTime).filter(Boolean))].sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b),
  )
})

// zoneDropdownOptions (computed) - the zone dropdown list: "All Zones" plus each zone.
const zoneDropdownOptions = computed(() => [
  { value: '', label: 'All Zones' },
  ...zoneOptions.value.map((z) => ({ value: z, label: z })),
])
// timeDropdownOptions (computed) - the time dropdown list: "All Timings" plus each reporting time.
const timeDropdownOptions = computed(() => [
  { value: '', label: 'All Timings' },
  ...timeOptions.value.map((t) => ({ value: t, label: t })),
])
// Two watches: if the selected show changes and the chosen zone or time no longer exists in it, reset
// that filter.
watch(zoneOptions, (opts) => {
  if (opts.length && zoneFilter.value && !opts.includes(zoneFilter.value)) zoneFilter.value = ''
})
// watch(timeOptions) - if the chosen time no longer exists for this show, clear the time filter.
watch(timeOptions, (opts) => {
  if (opts.length && timeFilter.value && !opts.includes(timeFilter.value)) timeFilter.value = ''
})

// filtersActive and activeFilterCount (computed) - whether any zone or time filter is on and how many;
// used by the Clear button. clearSchoolFilters() clears both.
const filtersActive = computed(() => !!(zoneFilter.value || timeFilter.value))
// activeFilterCount (computed) - how many of the zone and time filters are switched on.
const activeFilterCount = computed(
  () => [zoneFilter.value, timeFilter.value].filter(Boolean).length,
)
// clearSchoolFilters() - the Clear button: reset both filters.
function clearSchoolFilters() {
  zoneFilter.value = ''
  timeFilter.value = ''
}

// visibleSchools (computed) - the schools whose cards are listed. A school is kept when ALL of these
// hold: it matches the search (school name, or any volunteer name or phone), it has a free place when
// the switch is on, it has a volunteer with the pressed status (ignored while searching), and it
// matches the zone and time filters.
const visibleSchools = computed(() => {
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return []
  const q = searchbar.value.trim().toUpperCase()
  return data.schools.filter(
    (s) =>
      (!q ||
        s.name.toUpperCase().includes(q) ||
        s.volunteers.some(
          (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
        )) &&
      (!needsOnly.value || filledCount(s) < s.p5Classes) &&
      (!statusFilter.value || q || s.volunteers.some((v) => v.status === statusFilter.value)) &&
      (!zoneFilter.value || s.zone === zoneFilter.value) &&
      (!timeFilter.value || s.reportingTime === timeFilter.value),
  )
})
// watch(selectedShow) - on a new show: unfocus the school, clear the filters and the pressed chip.
watch(selectedShow, () => {
  focusedSchoolId.value = null
  clearSchoolFilters()
  statusFilter.value = ''
})
// capacityPercent(school) - width of the capacity bar: filled divided by places, capped at 100; 0 when
// the school needs no places (avoids dividing by zero).
function capacityPercent(school) {
  return school.p5Classes
    ? Math.min(100, Math.round((filledCount(school) / school.p5Classes) * 100))
    : 0
}
// capacityClass(school) - Bootstrap colour of the bar: bg-success when full, bg-danger when empty,
// bg-warning in between.
function capacityClass(school) {
  const filled = filledCount(school)
  if (filled >= school.p5Classes) return 'bg-success'
  return filled === 0 ? 'bg-danger' : 'bg-warning'
}

const panelOpen = ref(true)
const focusedSchoolId = ref(null)
// focusedSchool (computed) - the focused school with its volunteers, or null if none or if it is not
// in the selected show.
const focusedSchool = computed(
  () =>
    groupedAssignments.value[selectedShow.value]?.schools.find(
      (s) => s._id === focusedSchoolId.value,
    ) || null,
)
const showUnassigned = ref(false)
// sortedUnassigned (computed) - unassigned volunteers A to Z (a copy, so the original is not
// reordered).
const sortedUnassigned = computed(() => {
  const list = groupedAssignments.value[selectedShow.value]?.unassigned || []
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})

// selectSchool(school) - a card or a map pin was chosen: focus the school, close the list and zoom the
// map to it.
function selectSchool(school) {
  focusedSchoolId.value = school._id
  panelOpen.value = false
  focusSchool(school)
}

// clearFocus() - unfocus and zoom back out (tap on the map or the X on the focus card). Does nothing
// if nothing is focused.
function clearFocus() {
  if (focusedSchoolId.value === null) return
  focusedSchoolId.value = null
  limitView()
  resetMapView()
}

// resetMapView() - flies back to the saved overview, unless the map is already within 50 metres of it
// at the same zoom.
function resetMapView() {
  if (!map || !homeView) return
  const atHome = map.getZoom() === homeView.zoom && map.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return
  map.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// matchedVolunteers(school) - while searching: which volunteers of the school matched (shown under the
// card), or nothing if the school name itself matched.
function matchedVolunteers(school) {
  const q = searchbar.value.trim().toUpperCase()
  if (!q || school.name.toUpperCase().includes(q)) return []
  return school.volunteers.filter(
    (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
  )
}

// fitPadding() - how much of the map is covered by the card, so pins land in the free part. No school
// focused: 30px all round. Desktop (992px and up): 420px card on the left. Tablet (768px and up):
// 340px. Phone: the bottom sheet covers 45 percent of the screen height. These numbers must match the
// CSS at the bottom.
function fitPadding() {
  if (focusedSchoolId.value === null) return { padding: [30, 30] }
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] }
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] }
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.45 + 30] }
}

// coveredInsets() - the same idea as fitPadding but as top, left, bottom and right pixel amounts (card
// width plus 12px gap on the left, or 45 percent of the height at the bottom). null when nothing is
// focused.
function coveredInsets() {
  if (focusedSchoolId.value === null) return null
  const none = { top: 0, left: 0, bottom: 0, right: 0 }
  if (window.matchMedia('(min-width: 992px)').matches) return { ...none, left: 432 }
  if (window.matchMedia('(min-width: 768px)').matches) return { ...none, left: 352 }
  return { ...none, bottom: window.innerHeight * 0.45 }
}

// limitView(zoom) - keeps the map from being dragged away from Singapore. 1) nothing to do before the
// map exists 2) with no card, limit zoom out and panning to the base bounds 3) with a card, enlarge
// the allowed bounds by the covered amount so the visible part can still reach the edges.
function limitView(zoom) {
  if (!map || !L || !baseBounds) return
  const covered = coveredInsets()
  if (!covered) {
    map.setMinZoom(Math.max(11, map.getBoundsZoom(baseBounds, true)))
    map.setMaxBounds(baseBounds)
    return
  }
  const pad = L.point(covered.left + covered.right, covered.top + covered.bottom)
  map.setMinZoom(Math.max(11, map.getBoundsZoom(baseBounds, true, pad)))
  const z = zoom ?? map.getZoom()
  const sw = map.project(baseBounds.getSouthWest(), z).add(L.point(-covered.left, covered.bottom))
  const ne = map.project(baseBounds.getNorthEast(), z).add(L.point(covered.right, -covered.top))
  map.setMaxBounds(L.latLngBounds(map.unproject(sw, z), map.unproject(ne, z)))
}

// cameraFor(pts, padTL, padBR, maxZoom) - works out the zoom and centre that fit all points inside the
// free area: 1) bounds of the points 2) zoom that fits (never above maxZoom) 3) shift the centre by
// half of the padding difference so the points sit in the uncovered part.
function cameraFor(pts, padTL, padBR, maxZoom) {
  const bounds = L.latLngBounds(pts)
  const zoom = Math.min(map.getBoundsZoom(bounds, false, padTL.add(padBR)), maxZoom)
  const offset = padBR.subtract(padTL).divideBy(2)
  const sw = map.project(bounds.getSouthWest(), zoom)
  const ne = map.project(bounds.getNorthEast(), zoom)
  const target = map.unproject(sw.add(ne).divideBy(2).add(offset), zoom)
  return { zoom, target }
}

// isClear(pt, camera, padTL, padBR) - true if a point would be inside the free area (not under the
// card) when the map uses that camera.
function isClear(pt, camera, padTL, padBR) {
  const size = map.getSize()
  const p = map
    .project(pt, camera.zoom)
    .subtract(map.project(camera.target, camera.zoom))
    .add(size.divideBy(2))
  return p.x >= padTL.x && p.x <= size.x - padBR.x && p.y >= padTL.y && p.y <= size.y - padBR.y
}

// focusSchool(school) - zoom to the school and its volunteers (never closer than zoom 15). If the
// school pin would end up hidden under the card, zoom to the school alone instead.
function focusSchool(school) {
  if (!map || !L || !school.lat || !school.lng) return
  const pts = [[school.lat, school.lng]]
  for (const v of school.volunteers) if (v.lat && v.lng) pts.push([v.lat, v.lng])
  limitView()
  const pad = fitPadding()
  const tl = pad.paddingTopLeft ?? pad.padding
  const br = pad.paddingBottomRight ?? pad.padding
  const padTL = L.point(tl[0], tl[1])
  const padBR = L.point(br[0], br[1])
  let camera = cameraFor(pts, padTL, padBR, 15)
  if (!isClear([school.lat, school.lng], camera, padTL, padBR)) {
    camera = cameraFor([[school.lat, school.lng]], padTL, padBR, 15)
  }
  limitView(camera.zoom)
  map.setView(camera.target, camera.zoom)
}

// statusSummary(school) - counts volunteers per status and returns the Bootstrap badge colour for each
// (text-bg-warning, success, danger, dark).
function statusSummary(school) {
  const counts = {}
  for (const v of school.volunteers) counts[v.status] = (counts[v.status] || 0) + 1
  const classes = {
    Pending: 'text-bg-warning',
    Accepted: 'text-bg-success',
    Declined: 'text-bg-danger',
    Withdrawn: 'text-bg-dark',
  }
  return Object.entries(counts).map(([status, n]) => ({ status, n, cls: classes[status] }))
}

const loading = ref(true)

// loadData(quiet) - fetches all assignments. Only replaces the stored list when it really changed (so
// the map does not redraw every 5 seconds). On error: a normal load shows a red popup, a quiet
// background load stays silent. Always clears the first-load flag so the overlay cannot get stuck.
async function loadData(quiet = false) {
  try {
    const response = await axios.get(API_URL + 'assignments')
    if (JSON.stringify(response.data) !== JSON.stringify(assignments.value))
      assignments.value = response.data
  } catch (error) {
    if (!quiet)
      showPopup(
        'error',
        'Could not load',
        error.response?.data?.message || 'Could not load assignments.',
      )
  } finally {
    loading.value = false
  }
}

// runAllocation(reset) - the Allocate or Reset button. Ask the admin to confirm, show the busy state,
// send the show name to the server, store the returned assignments, show a result popup and reload;
// errors show a popup.
async function runAllocation(reset = false) {
  const ok = await askConfirm(
    reset
      ? {
          title: `Reset ${selectedShow.value}?`,
          text: `This erases ALL assignments for ${selectedShow.value}, including volunteers who already accepted. Other shows are not affected.`,
          confirmText: 'Reset',
          danger: true,
        }
      : {
          title: `Allocate ${selectedShow.value}?`,
          text: 'Volunteers who already accepted keep their school; everyone else in this show is matched again.',
          confirmText: 'Allocate',
          icon: 'bi-diagram-3-fill',
        },
  )
  if (!ok) return
  runningAlloc.value = true
  dismissPopup()
  try {
    const response = await axios.post(API_URL + 'assignments/run', {
      reset,
      show: selectedShow.value,
    })
    assignments.value = response.data.assignments
    const skipped = response.data.skippedShows || []
    const toppedUp = response.data.toppedUp || {}
    const lateNotes = Object.entries(toppedUp)
      .filter(([, t]) => t.added > 0)
      .map(
        ([show, t]) =>
          `${show}: ${t.added} new volunteer${t.added === 1 ? '' : 's'} added (${t.placed} placed, ${t.added - t.placed} on reserve)`,
      )
    const lateText = lateNotes.length > 0 ? ' ' + lateNotes.join('. ') + '.' : ''
    if (skipped.length > 0) {
      showPopup(
        'info',
        'Allocation done',
        `${skipped.join(', ')} ${skipped.length === 1 ? 'is' : 'are'} published, so ${skipped.length === 1 ? 'it was' : 'they were'} not re-run (open places there are filled automatically).${lateText} Use Reset to start over.`,
        9000,
      )
    } else {
      showPopup(
        'info',
        reset ? 'Reset done' : 'Allocation done',
        reset
          ? `All assignments for ${selectedShow.value} were erased.`
          : 'The allocation is a draft until you publish it.',
      )
    }
  } catch (error) {
    showPopup(
      'error',
      'Allocation failed',
      error.response?.data?.message || 'Could not run the allocation.',
    )
  } finally {
    runningAlloc.value = false
  }
}

// draftCount (computed) - rows of the selected show that are not published yet (the number on the
// Publish button).
const draftCount = computed(() => {
  let n = 0
  for (const a of assignments.value) {
    if (a.show === selectedShow.value && !a.published) n++
  }
  return n
})

// publishShow() - Publish. 1) confirm 2) POST publish for the show 3) reload so rows show as published
// 4) show "Published"; errors show a red popup.
async function publishShow() {
  const ok = await askConfirm({
    title: `Publish ${selectedShow.value}?`,
    text: 'Volunteers will see their school and can accept or decline.',
    confirmText: 'Publish',
    icon: 'bi-send-fill',
  })
  if (!ok) return
  publishing.value = true
  dismissPopup()
  try {
    await axios.post(API_URL + 'assignments/publish', { show: selectedShow.value })
    await loadData()
    showPopup('info', 'Published', `${selectedShow.value} is now visible to volunteers.`)
  } catch (error) {
    showPopup('error', 'Publish failed', error.response?.data?.message || 'Could not publish.')
  } finally {
    publishing.value = false
  }
}

let L = null
let map = null
let markersGroup = null
let linesGroup = null
let volGroup = null
let homeView = null
let baseBounds = null
let schoolMarkers = {}

// fitOverview() - fits the map to all schools of the selected show and remembers that view as the
// overview.
function fitOverview() {
  const data = groupedAssignments.value[selectedShow.value]
  if (!map || !data) return
  const pts = data.schools.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
  if (!pts.length) return
  map.invalidateSize()
  map.fitBounds(pts, { ...fitPadding(), animate: false })
  homeView = { center: map.getCenter(), zoom: map.getZoom() }
}

// onMapReady(m, leaflet) - BaseMap is ready: keep map and Leaflet, move the zoom buttons bottom right,
// remember the max bounds, allow quarter zoom steps, keep the view limited on zoom and resize, create
// the three layers (schools, lines, volunteers), a map click unfocuses, draw everything and fit the
// overview.
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  map.zoomControl?.setPosition('bottomright')
  baseBounds = map.options.maxBounds
  map.options.zoomSnap = 0.25
  // map zoomend / resize - keep the map inside its allowed area after zooming or resizing.
  map.on('zoomend resize', () => limitView())
  homeView = { center: m.getCenter(), zoom: m.getZoom() }

  markersGroup = L.layerGroup().addTo(map)
  linesGroup = L.layerGroup().addTo(map)
  volGroup = L.layerGroup().addTo(map)
  map.on('click', clearFocus)
  renderMapElements()
  fitOverview()
}

// schoolIconFor(id) - the pin style: dim every school except the focused one.
function schoolIconFor(id) {
  const dimmed = focusedSchoolId.value !== null && focusedSchoolId.value !== id
  return createSchoolIcon({ dimmed })
}
// updateSchoolIcons() - restyle the existing pins after the focus changes (no pin is recreated); the
// focused pin goes on top.
function updateSchoolIcons() {
  for (const [id, marker] of Object.entries(schoolMarkers)) {
    marker.setIcon(schoolIconFor(id))
    marker.setZIndexOffset(id === focusedSchoolId.value ? 500 : 0)
  }
}

// renderSchools() - redraw all school pins of the selected show: clear the layer, then add one marker
// per school that has coordinates, with a hover tip and a click that selects the school.
function renderSchools() {
  if (!map || !L || !selectedShow.value) return
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return
  markersGroup.clearLayers()
  schoolMarkers = {}
  data.schools.forEach((school) => {
    if (!school.lat || !school.lng) return
    const marker = L.marker([school.lat, school.lng], { icon: schoolIconFor(school._id) })
    schoolMarkers[school._id] = marker
    bindTip(marker, schoolTip(school))
    // marker click - clicking a school pin selects that school.
    marker.on('click', () => selectSchool(school))
    markersGroup.addLayer(marker)
  })
}

// renderVolunteers() - redraw only the focused school's volunteers and the faint blue lines from each
// to the school. Lines are not clickable so a tap on a line counts as a map tap.
function renderVolunteers() {
  if (!map || !L || !selectedShow.value) return
  volGroup.clearLayers()
  linesGroup.clearLayers()
  const data = groupedAssignments.value[selectedShow.value]
  const school = data?.schools.find((s) => s._id === focusedSchoolId.value)
  if (!school || !school.lat || !school.lng) return
  school.volunteers.forEach((vol) => {
    if (!vol.lat || !vol.lng) return
    const marker = L.marker([vol.lat, vol.lng], { icon: createVolIcon(vol.status) })
    bindTip(marker, volTip(vol))
    volGroup.addLayer(marker)
    linesGroup.addLayer(
      L.polyline(
        [
          [vol.lat, vol.lng],
          [school.lat, school.lng],
        ],
        { color: '#0066ff', weight: 2, opacity: 0.3, interactive: false },
      ),
    )
  })
}

// renderMapElements() - both of the above together.
function renderMapElements() {
  renderSchools()
  renderVolunteers()
}

// watch - redraw when the show or the grouped data changes.
watch([selectedShow, groupedAssignments], renderMapElements)

// watch(focusedSchoolId) - redraw the volunteers and restyle the pins.
watch(focusedSchoolId, () => {
  renderVolunteers()
  updateSchoolIcons()
})

// watch(selectedShow) - when a different show is picked, keep the map inside its allowed area.
watch(selectedShow, () => {
  limitView()
})
let hasFitted = false
// watch - fit the overview the first time, or when another show is picked, but never while a school is
// focused and never on a background refresh.
watch([selectedShow, assignments], ([newShow], [oldShow]) => {
  const showChanged = newShow !== oldShow
  if (focusedSchoolId.value === null && (showChanged || !hasFitted)) {
    fitOverview()
    hasFitted = true
  }
})

let timer = null

// onTabVisible() - when the browser tab becomes visible again, reload the data (unless an allocation
// or publish is running).
function onTabVisible() {
  if (document.visibilityState === 'visible' && !runningAlloc.value && !publishing.value)
    loadData(true)
}

// onMounted - start listening for the tab becoming visible and reload the data every 5 seconds while
// the tab is visible.
onMounted(() => {
  document.addEventListener('visibilitychange', onTabVisible)
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    if (!runningAlloc.value && !publishing.value) loadData(true)
  }, 5000)
})
// onUnmounted - remove the listener and stop both timers.
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onTabVisible)
  clearInterval(timer)
  clearTimeout(popupTimer)
})
loadData()
</script>

<template>
  <!-- The toolbar with the shared dropdowns, the stat chips, the school cards, the unassigned
       list, the map and the popups. -->
  <div class="map-page">
    <div class="map-stage alloc-stage" :class="{ 'focus-open': focusedSchool && !panelOpen }">
      <BaseMap :zoom="12" @ready="onMapReady" />

      <MapLoading v-if="loading" class="alloc-loading" text="Fetching Allocation Data..." />

      <button
        v-if="!panelOpen && !focusedSchool"
        type="button"
        class="btn btn-primary shadow alloc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Allocation
      </button>

      <Transition name="alloc-panel-fade">
        <aside v-show="panelOpen" class="alloc-panel">
          <div class="alloc-panel-head">
            <div class="alloc-head-row mb-2">
              <div class="alloc-title-group d-flex flex-wrap align-items-center gap-3">
                <AppDropdown
                  v-model="selectedShow"
                  :options="showDropdownOptions"
                  icon="bi-calendar-event"
                  aria-label="Show"
                  testid="alloc-event-select"
                  option-testid-prefix="alloc-show-option-"
                />
              </div>
              <div class="alloc-actions d-flex flex-wrap align-items-center gap-2">
                <button
                  class="btn btn-brand"
                  :disabled="runningAlloc"
                  title="Match unassigned volunteers; accepted volunteers keep their school"
                  data-testid="alloc-run"
                  @click="runAllocation(false)"
                >
                  Allocate
                </button>
                <button
                  class="btn btn-success"
                  :disabled="publishing || draftCount === 0"
                  data-testid="alloc-publish"
                  @click="publishShow"
                >
                  Publish
                  <span
                    class="badge text-bg-light ms-1"
                    title="Unpublished drafts"
                    data-testid="alloc-draft-count"
                    >{{ draftCount }}</span
                  >
                </button>
                <button
                  class="btn btn-outline-danger"
                  type="button"
                  :disabled="runningAlloc || publishing"
                  data-testid="alloc-reset"
                  @click="runAllocation(true)"
                >
                  <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
                </button>
              </div>
              <button
                type="button"
                class="btn btn-outline-primary alloc-map-btn"
                title="Hide the list and show the map"
                data-testid="alloc-show-map"
                @click="panelOpen = false"
              >
                <i class="bi bi-map me-1"></i>Map
              </button>
            </div>

            <div v-if="groupedAssignments[selectedShow]" class="row g-1 mb-2 alloc-chips">
              <div v-for="chip in statChips" :key="chip.label" class="col-4">
                <button
                  type="button"
                  class="stat-btn card-hw py-1 px-0 text-center w-100"
                  :class="{
                    'is-active': !!chip.key && statusFilter === chip.key && !searchbar.trim(),
                  }"
                  :aria-pressed="!!chip.key && statusFilter === chip.key && !searchbar.trim()"
                  :data-testid="`alloc-stat-${chip.label.toLowerCase()}`"
                  @click="toggleStatus(chip.key)"
                >
                  <div class="fs-6 fw-semibold">{{ chip.value }}</div>
                  <div class="chip-label text-muted-hw">{{ chip.label }}</div>
                </button>
              </div>
            </div>

            <div class="alloc-search-row d-flex flex-wrap align-items-center gap-2 mb-0">
              <div class="alloc-filter-row d-flex flex-wrap align-items-center gap-2 mt-2">
                <AppDropdown
                  v-model="zoneFilter"
                  :options="zoneDropdownOptions"
                  icon="bi-geo-alt"
                  aria-label="Filter by zone"
                  testid="alloc-zone-filter"
                />

                <AppDropdown
                  v-model="timeFilter"
                  :options="timeDropdownOptions"
                  icon="bi-clock"
                  aria-label="Filter by reporting time"
                  testid="alloc-time-filter"
                />

                <button
                  v-if="filtersActive"
                  type="button"
                  class="btn btn-sm btn-outline-secondary text-nowrap"
                  @click="clearSchoolFilters"
                >
                  Clear ({{ activeFilterCount }})
                </button>
              </div>
              <input
                type="search"
                class="form-control search-box"
                placeholder="Search school or volunteer"
                v-model="searchbar"
              />
              <div class="form-check form-switch mb-0">
                <input
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="needsOnly"
                  v-model="needsOnly"
                />
                <label class="form-check-label" for="needsOnly">Needs Volunteers</label>
              </div>
            </div>
          </div>

          <div class="alloc-panel-scroll">
            <div v-if="groupedAssignments[selectedShow]" class="card-hw p-3 mb-3">
              <h2 class="h5 mb-0">
                <button
                  type="button"
                  class="school-head align-items-center"
                  :aria-expanded="showUnassigned"
                  @click="showUnassigned = !showUnassigned"
                >
                  <span>Unassigned volunteers</span>
                  <span class="d-flex align-items-center gap-2">
                    <span
                      class="badge"
                      :class="stats.unassigned ? 'text-bg-warning' : 'text-bg-success'"
                    >
                      {{ stats.unassigned }}
                    </span>
                    <i class="bi bi-chevron-down chevron"></i>
                  </span>
                </button>
              </h2>

              <div class="vol-collapse" :class="{ open: showUnassigned }">
                <div class="vol-collapse-inner">
                  <p v-if="!stats.unassigned" class="small text-muted-hw mb-0">
                    <i class="bi bi-check-circle-fill text-success me-1"></i>Everyone has a school.
                  </p>
                  <div v-else class="unassigned-list">
                    <div
                      v-for="volunteer in sortedUnassigned"
                      :key="volunteer.assignmentId"
                      class="d-flex align-items-center gap-2 py-2 border-top"
                    >
                      <span class="avatar">{{
                        (volunteer.name || '?').charAt(0).toUpperCase()
                      }}</span>
                      <span class="flex-grow-1 text-truncate">
                        <button
                          v-if="volunteer._id"
                          type="button"
                          class="btn btn-link btn-sm p-0 align-baseline text-truncate mw-100"
                          @click.stop="openChat(volunteer)"
                        >
                          {{ volunteer.name }}
                          <i class="bi bi-chat-dots-fill ms-1" aria-hidden="true"></i>
                        </button>
                        <span v-else>{{ volunteer.name }}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="!groupedAssignments[selectedShow]" class="text-muted-hw">
              There are no assignments. Press "Allocate" to create them.
            </p>
            <template v-else>
              <p v-if="visibleSchools.length === 0" class="text-muted-hw">
                {{
                  needsOnly && !searchbar.trim()
                    ? 'Every school has enough volunteers.'
                    : statusFilter && !searchbar.trim()
                      ? `No schools with ${statusFilter} volunteers.`
                      : 'No schools or volunteers match.'
                }}
              </p>
              <div class="alloc-grid">
                <div
                  v-for="school in visibleSchools"
                  :key="school._id"
                  :id="`school-${school._id}`"
                  class="school-card card-hw px-2 px-md-3 py-2"
                  @click="selectSchool(school)"
                >
                  <h2 class="h5 mb-0">
                    <button
                      type="button"
                      class="school-head"
                      :aria-label="`Show ${school.name} on the map`"
                    >
                      <span class="text-truncate">
                        {{ school.name }}
                        <small class="d-block fw-normal text-muted-hw card-time"
                          ><i class="bi bi-clock me-1"></i>{{ school.reportingTime }}</small
                        >
                      </span>
                      <span class="d-flex align-items-center gap-2 text-nowrap">
                        {{ filledCount(school) }}/{{ school.p5Classes }}
                        <i class="bi bi-chevron-right" aria-hidden="true"></i>
                      </span>
                    </button>
                  </h2>

                  <div
                    class="progress my-2"
                    role="progressbar"
                    aria-label="Places filled"
                    :aria-valuenow="capacityPercent(school)"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    style="height: 6px"
                  >
                    <div
                      class="progress-bar"
                      :class="capacityClass(school)"
                      :style="{ width: capacityPercent(school) + '%' }"
                    ></div>
                  </div>
                  <div class="d-flex flex-wrap gap-1 card-meta">
                    <span
                      v-for="s in statusSummary(school)"
                      :key="s.status"
                      class="badge rounded-pill"
                      :class="s.cls"
                      >{{ s.n }} {{ s.status }}</span
                    >
                    <span v-if="!school.volunteers.length" class="small text-muted-hw"
                      >No volunteers yet</span
                    >
                  </div>
                  <div v-if="matchedVolunteers(school).length" class="small text-muted-hw mt-1">
                    <i class="bi bi-search me-1"></i
                    >{{
                      matchedVolunteers(school)
                        .map((v) => v.name)
                        .join(', ')
                    }}
                  </div>
                </div>
              </div>
            </template>
          </div>
        </aside>
      </Transition>

      <Transition name="alloc-focus">
        <section
          v-if="focusedSchool && !panelOpen"
          class="alloc-focus"
          aria-label="Selected school"
          data-testid="alloc-focus-card"
        >
          <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
            <button type="button" class="btn btn-sm btn-outline-primary" @click="panelOpen = true">
              <i class="bi bi-chevron-left me-1"></i>Schools
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              aria-label="Unselect school"
              title="Unselect school"
              @click="clearFocus"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <h2 class="h5 mb-0">{{ focusedSchool.name }}</h2>
          <small class="text-muted-hw"
            ><i class="bi bi-clock me-1"></i>{{ focusedSchool.reportingTime }}</small
          >
          <div class="d-flex justify-content-between small mt-2">
            <span>Places filled</span>
            <span>{{ filledCount(focusedSchool) }}/{{ focusedSchool.p5Classes }}</span>
          </div>
          <div
            class="progress my-1"
            role="progressbar"
            aria-label="Places filled"
            :aria-valuenow="capacityPercent(focusedSchool)"
            aria-valuemin="0"
            aria-valuemax="100"
            style="height: 6px"
          >
            <div
              class="progress-bar"
              :class="capacityClass(focusedSchool)"
              :style="{ width: capacityPercent(focusedSchool) + '%' }"
            ></div>
          </div>
          <div class="d-flex flex-wrap gap-1 mt-1">
            <span
              v-for="s in statusSummary(focusedSchool)"
              :key="s.status"
              class="badge rounded-pill"
              :class="s.cls"
              >{{ s.n }} {{ s.status }}</span
            >
          </div>
          <p v-if="!focusedSchool.volunteers.length" class="small text-muted-hw mt-2 mb-0">
            No volunteers yet
          </p>
          <div v-else class="alloc-focus-list">
            <div
              v-for="volunteer in focusedSchool.volunteers"
              :key="volunteer._id || volunteer.phone"
              class="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-top"
            >
              <span>
                <span v-if="!volunteer.published" class="badge text-bg-light border me-1"
                  >Draft</span
                >
                <span
                  class="badge rounded-pill"
                  :class="{
                    'text-bg-warning': volunteer.status == 'Pending',
                    'text-bg-success': volunteer.status == 'Accepted',
                    'text-bg-danger': volunteer.status == 'Declined',
                    'text-bg-dark': volunteer.status == 'Withdrawn',
                  }"
                >
                  {{ volunteer.status }}
                </span>
                <button
                  v-if="volunteer._id"
                  type="button"
                  class="btn btn-link btn-sm ms-1 p-0 align-baseline"
                  @click.stop="openChat(volunteer)"
                >
                  {{ volunteer.name }}
                  <i class="bi bi-chat-dots-fill ms-1" aria-hidden="true"></i>
                </button>
                <span v-else>{{ volunteer.name }}</span>
              </span>
              <span class="small text-muted-hw text-nowrap">{{
                volunteer.distance != null ? volunteer.distance + ' km' : ''
              }}</span>
            </div>
          </div>
        </section>
      </Transition>

      <ConfirmDialog :dialog="confirmDialog" @answer="answerConfirm" />
      <MapNotice
        :notice="popupNotice"
        :closable="!runningAlloc && !publishing"
        @close="dismissPopup"
      />
    </div>
  </div>
</template>

<style scoped>
/* Styles for the board layout, the school cards, the chips and the popups. */

.search-box {
  max-width: 24rem;
}
.unassigned-list {
  max-height: 240px;
  overflow-y: auto;
}
.avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--hw-bg);
  border: 1px solid var(--bs-border-color);
  font-size: 0.8rem;
  font-weight: 600;
}
.school-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 70px;
}
.alloc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 8px;
}
@media (min-width: 768px) {
  .alloc-grid {
    grid-template-columns: repeat(
      2,
      minmax(0, 1fr)
    );
  }
}
.school-card {
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.school-card:hover {
  box-shadow: 0 0 0 2px var(--bs-primary);
}

.alloc-panel {
  position: absolute;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background: var(--hw-surface);
  color: var(--hw-text);
}
.alloc-panel-head {
  flex: 0 0 auto;
  padding: 12px max(12px, calc((100% - var(--hw-content-w)) / 2)) 8px;
}
.alloc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 max(12px, calc((100% - var(--hw-content-w)) / 2)) 12px;
}
.stat-btn {
  border: 0;
  cursor: pointer;
  color: inherit;
}
.stat-btn:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}
.stat-btn.is-active {
  box-shadow: 0 0 0 2px var(--bs-primary);
}
.alloc-chips .chip-label {
  font-size: 0.7rem;
  line-height: 1.1;
  white-space: nowrap;
}
@media (min-width: 768px) {
  .alloc-chips .chip-label {
    font-size: 0.75rem;
  }
}
.alloc-stage .alloc-loading {
  z-index: 1105;
}
.alloc-reopen {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
}
.alloc-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.alloc-map-btn {
  margin-left: auto;
}
@media (max-width: 575.98px) {
  .alloc-title-group {
    order: 1;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.5rem !important;
  }
  .alloc-map-btn {
    order: 2;
  }
  .alloc-actions {
    order: 3;
    flex: 1 1 100%;
    flex-wrap: nowrap !important;
  }
  .alloc-actions .btn {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 0.4rem;
    white-space: nowrap;
  }
  .alloc-search-row {
    flex-wrap: wrap !important;
  }
  .alloc-filter-row {
    flex: 0 0 100%;
    flex-wrap: nowrap !important;
  }
  .alloc-filter-row .show-select {
    flex: 0 1 auto;
    min-width: 0;
  }
  .alloc-filter-row .btn {
    flex: 0 0 auto;
  }
  .alloc-search-row .search-box {
    flex: 1 1 0;
    min-width: 0;
    font-size: 0.875rem;
  }
  .alloc-search-row .form-check {
    flex: 0 0 auto;
    font-size: 0.875rem;
    white-space: nowrap;
  }
}
.alloc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}

.alloc-focus {
  position: absolute;
  z-index: 1050;
  top: 12px;
  left: 12px;
  width: min(340px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--hw-surface);
  color: var(--hw-text);
  border-radius: var(--hw-radius);
  box-shadow: var(--hw-shadow);
  overflow: hidden;
}
.alloc-focus-list {
  min-height: 0;
  margin-top: 0.5rem;
  overflow-y: auto;
}
@media (min-width: 992px) {
  .alloc-focus {
    width: min(420px, calc(100% - 24px));
  }
}
@media (max-width: 767.98px) {
  .alloc-focus {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: 45vh;
    max-height: none;
    border-radius: var(--hw-radius) var(--hw-radius) 0 0;
  }
  .alloc-stage.focus-open {
    --map-inset-bottom: 45vh;
  }
}

.alloc-panel-fade-enter-active,
.alloc-panel-fade-leave-active,
.alloc-focus-enter-active,
.alloc-focus-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.alloc-panel-fade-enter-from,
.alloc-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.alloc-focus-enter-from,
.alloc-focus-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
@media (max-width: 767.98px) {
  .alloc-focus-enter-from,
  .alloc-focus-leave-to {
    transform: translateY(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .alloc-panel-fade-enter-active,
  .alloc-panel-fade-leave-active,
  .alloc-focus-enter-active,
  .alloc-focus-leave-active {
    transition: none;
  }
}

.school-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  font: inherit;
}
.school-head:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 4px;
  border-radius: 4px;
}
.chevron {
  transition: transform 0.25s;
}
.school-head[aria-expanded='true'] .chevron {
  transform: rotate(180deg);
}

.vol-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}
.vol-collapse-inner {
  overflow: hidden;
}
.vol-collapse.open {
  grid-template-rows: 1fr;
  margin-top: 0.5rem;
}

@media (prefers-reduced-motion: reduce) {
  .vol-collapse,
  .chevron {
    transition: none;
  }
}
</style>
