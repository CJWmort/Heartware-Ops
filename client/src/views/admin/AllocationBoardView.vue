<script setup>
// =====================================================================================================
// Feature 1b – Smart Allocation (coordinator / admin board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
// =====================================================================================================
//
// WHAT THIS PAGE IS FOR
// The admin matches volunteers to schools for each National Education (NE) show, reviews the result,
// then publishes it so volunteers can accept or decline. The page is one full-screen map. The school list
// (the "menu") opens full-screen on top of it; choosing a school closes the menu and zooms the map to that school,
// and a small card shows that school's volunteers.
//
// HOW THE DATA FLOWS (read this first)
//  1. loadData() asks the server for ALL assignments: one row per volunteer, saying which school (if any),
//     which show, their status (Pending / Accepted / Declined / Withdrawn) and whether it is published.
//  2. groupedAssignments turns that flat list into { show -> { schools -> volunteers, unassigned } }.
//     Everything on screen (stat chips, school cards, map pins) is read from this ONE grouped object.
//     Because it is a `computed`, it rebuilds by itself whenever the raw list changes.
//  3. The admin picks a show in the dropdown (selectedShow); only that show's data is displayed.
//  4. "Allocate" asks the server to match volunteers to schools. The result is a DRAFT (published = false):
//     volunteers cannot see it yet. "Publish" makes it visible so they can accept or decline.
//     "Reset" (in the ... menu) erases everything and starts again.
//  5. The map and the school cards are linked: the map always shows every school as a pin, and shows the
//     volunteers (coloured pins + lines) for ONE school only: the school chosen last (focusedSchoolId).
//  6. The page re-loads the data on a timer (see AUTO-REFRESH at the bottom), so the admin sees volunteers'
//     accepts / declines without refreshing the browser.
//
// FILE LAYOUT: this <script> (logic) -> <template> (HTML) -> <style> (CSS).
// Inside the script the sections are in this order: data, derived data, search/filter, cards<->map state,
// card actions, map sizing, server calls, map drawing, watchers, auto-refresh.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/map/BaseMap.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import MapLoading from '@/components/map/MapLoading.vue' // NEW: dimmed overlay + spinner shown over the map while data is fetched
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { getSavedShow, saveShow, getSavedFilter, saveFilter } from '@/services/selected-show'
import { useChatStore } from '@/services/chat'
import { createSchoolIcon, createVolIcon, volTip, schoolTip, bindTip } from '@/utils/map-icons'

// ---------------------------------------------------------------------------------------------------
// 1. BASIC DATA (the page's "memory")
// A `ref` is a box holding a value; when the value changes, everything on screen that uses it updates.
// Read or write it with `.value` in the script (the template drops the `.value`).
// ---------------------------------------------------------------------------------------------------

// The raw list from the server: one row per volunteer assignment.
// Only loadData() and runAllocation() replace it; everything else just reads it.
const assignments = ref([])
// The four shows an admin can switch between (the dropdown is built from this list).
const shows = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const selectedShow = ref(shows.includes(getSavedShow()) ? getSavedShow() : 'NE Show 1') // remembered for this session
watch(selectedShow, saveShow)

// Custom show dropdown: open/closed state, the wrapper element (for outside-click detection) and the handlers
const showMenuOpen = ref(false)
const showEl = ref(null)
function chooseShow(show) {
  showMenuOpen.value = false
  selectedShow.value = show
}
const zoneMenuOpen = ref(false)
const timeMenuOpen = ref(false)
const zoneEl = ref(null)
const timeEl = ref(null)
function chooseZone(z) {
  zoneMenuOpen.value = false
  zoneFilter.value = z
}
function chooseTime(t) {
  timeMenuOpen.value = false
  timeFilter.value = t
}
// Close the menu when the admin taps anywhere outside it
function onDocPointerDown(e) {
  if (showMenuOpen.value && showEl.value && !showEl.value.contains(e.target))
    showMenuOpen.value = false
  if (zoneMenuOpen.value && zoneEl.value && !zoneEl.value.contains(e.target))
    zoneMenuOpen.value = false
  if (timeMenuOpen.value && timeEl.value && !timeEl.value.contains(e.target))
    timeMenuOpen.value = false
}

const searchbar = ref('')
const runningAlloc = ref(false)
const publishing = ref(false) // disables the Publish button while the request is running

// STATUS POPUP (same MapNotice popup as TrackingView). Messages are temporary: they disappear after a few seconds,
// or when the close button is pressed. Running states ("Allocating...", "Publishing...") stay until the request ends.
const popup = ref(null) // { type: 'error' | 'info', icon, title, text } or null
let popupTimer = null
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
function dismissPopup() {
  clearTimeout(popupTimer)
  popup.value = null
}
// CONFIRM DIALOG (custom card instead of the browser's confirm()). askConfirm() returns a promise that resolves to
// true (OK) or false (Cancel), so callers can simply write: if (!(await askConfirm({...}))) return
const confirmDialog = ref(null) // the card's content, or null while closed
let confirmResolve = null
function askConfirm(options) {
  return new Promise((resolve) => {
    confirmResolve = resolve
    confirmDialog.value = options
  })
}
function answerConfirm(ok) {
  confirmDialog.value = null
  confirmResolve?.(ok)
  confirmResolve = null
}
// What the popup shows: a running request wins over any finished message.
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
// Reshapes the flat `assignments` list into something easy to display. A "computed" re-runs by itself
// whenever `assignments` changes, so the cards, chips and map update automatically.
// Result looks like: { 'NE Show 1': { schools: [{ ...school, volunteers: [...] }], unassigned: [...] }, ... }
const groupedAssignments = computed(() => {
  // Step 1: build { show: { schools: [...], unassigned: [...] } } by walking the flat list once
  const byShow = {}

  for (const a of assignments.value) {
    if (!byShow[a.show]) {
      byShow[a.show] = { schools: [], unassigned: [] }
    }

    // FIX (C16): a volunteer who Declined or Withdrew is not part of the allocation any more, so they are left
    // out of the board (Unassigned card, school lists and map). The row stays in the database on purpose as
    // history, and the volunteer still sees it on their own Assignment page.
    const left = a.status === 'Declined' || a.status === 'Withdrawn'

    // A free volunteer has no school: list them separately and move on
    // (assignmentId identifies the record so a drag can update it;
    //  distance is null, so it is left out)
    if (!a.school) {
      if (left) continue // FIX (C16): not shown in the "Unassigned" card
      byShow[a.show].unassigned.push({
        ...a.volunteer,
        assignmentId: a._id,
        status: a.status,
        published: a.published, // lets the board mark draft rows
      })
      continue
    }

    const showSchools = byShow[a.show].schools

    // Find the school inside this show, or add it
    // ({ ...a.school } copies every school field unchanged)
    let schoolEntry = null
    for (const s of showSchools) {
      if (s._id === a.school._id) schoolEntry = s
    }
    if (!schoolEntry) {
      schoolEntry = { ...a.school, volunteers: [] }
      showSchools.push(schoolEntry)
    }

    // FIX (C16): the school entry above is still created even if its only volunteer left, so the school card stays on the board
    if (left) continue // not shown in the school's volunteer list or on the map

    // Add the volunteer: every volunteer field unchanged,
    // plus status and distance, which belong to the assignment (not to the person)
    schoolEntry.volunteers.push({
      ...a.volunteer,
      status: a.status,
      distance: a.distance,
      published: a.published, // lets the board mark draft rows
    })
  }

  // Step 2: rebuild the object with the show names in order (NE Show 1, 2, 3, 4)
  const result = {}
  for (const show of Object.keys(byShow).sort()) {
    result[show] = byShow[show]
  }
  return result
})

// Base address of the backend API (the dev server forwards /api to Express).
const API_URL = '/api/'

// Chat with a volunteer (same behaviour as the volunteer name on the incident card).
// toggle() opens the chat panel; it is only called while the panel is closed, otherwise it would close it.
// selectThread() then jumps straight into this volunteer's one-to-one chat.
const chat = useChatStore()
async function openChat(volunteer) {
  if (!volunteer?._id) return
  if (!chat.isOpen) chat.toggle()
  await chat.selectThread(volunteer._id)
}

// How many places a school has filled. Declined / Withdrawn volunteers no longer take a place,
// so they are not counted in "Capacity x/y" (otherwise a school would look full while it has an empty place).
// Pending DOES count: a place is reserved while we wait for the answer.
function filledCount(school) {
  return school.volunteers.filter((v) => v.status !== 'Declined' && v.status !== 'Withdrawn').length
}

// Numbers for the six stat chips (selected show only): how many schools, and how many volunteers per status.
const stats = computed(() => {
  const data = groupedAssignments.value[selectedShow.value]
  const s = { schools: 0, Accepted: 0, Pending: 0, Declined: 0, Withdrawn: 0, unassigned: 0 }
  if (!data) return s // nothing allocated for this show yet: all zeros
  s.schools = data.schools.length
  s.unassigned = data.unassigned.length
  for (const school of data.schools) {
    for (const v of school.volunteers) {
      if (v.status in s) s[v.status]++ // `in` guards against an unexpected status name
    }
  }
  return s
})
// The same numbers as a list, so the template can draw the chips with one v-for.
const statChips = computed(() => [
  { key: '', label: 'Schools', value: stats.value.schools }, // key '' = no status filter, so this chip clears the filter
  { key: 'Accepted', label: 'Accepted', value: stats.value.Accepted }, // key = the volunteer status this chip filters by
  { key: 'Pending', label: 'Pending', value: stats.value.Pending },
])

// Which stat chip is pressed: 'Accepted' | 'Pending' | '' (empty = show all schools)
const statusFilter = ref('')

// Called when a stat chip is clicked: pressing the active one again turns the filter off (same as the Incidents page).
function toggleStatus(key) {
  statusFilter.value = statusFilter.value === key ? '' : key // same chip again -> '' (show all)
}

// ---------------------------------------------------------------------------------------------------
// 3. SEARCH AND FILTER
// The card LIST is filtered by two things at once: the search box AND the "Needs Volunteers" switch.
// NOTE: the map's pins are NOT filtered (renderSchools draws every school); see selectSchool() for how a
// click on a pin whose card is currently filtered out is handled.
// ---------------------------------------------------------------------------------------------------

// "Only schools that still need volunteers" switch (true = hide schools that are full)
const needsOnly = ref(false)

// Zone and reporting-time filters ('' = no filter)
const zoneFilter = ref(getSavedFilter('alloc-zone'))
const timeFilter = ref(getSavedFilter('alloc-time'))
watch(zoneFilter, (v) => saveFilter('alloc-zone', v))
watch(timeFilter, (v) => saveFilter('alloc-time', v))

// Turn "7:30 AM", "07:30" or "1:15 PM" into minutes so times sort properly (unparseable values sort last)
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

// Dropdown options come from the selected show's schools, so only values that exist are offered
const zoneOptions = computed(() => {
  const schools = groupedAssignments.value[selectedShow.value]?.schools || []
  return [...new Set(schools.map((s) => s.zone).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  )
})
const timeOptions = computed(() => {
  const schools = groupedAssignments.value[selectedShow.value]?.schools || []
  return [...new Set(schools.map((s) => s.reportingTime).filter(Boolean))].sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b),
  )
})

watch(zoneOptions, (opts) => {
  if (opts.length && zoneFilter.value && !opts.includes(zoneFilter.value)) zoneFilter.value = ''
})
watch(timeOptions, (opts) => {
  if (opts.length && timeFilter.value && !opts.includes(timeFilter.value)) timeFilter.value = ''
})

const filtersActive = computed(() => !!(zoneFilter.value || timeFilter.value))
const activeFilterCount = computed(() => [zoneFilter.value, timeFilter.value].filter(Boolean).length)
function clearSchoolFilters() {
  zoneFilter.value = ''
  timeFilter.value = ''
}

// The schools whose cards are listed: a school stays if it matches the search AND (when the switch is on) has a free place.
const visibleSchools = computed(() => {
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return []
  const q = searchbar.value.trim().toUpperCase() // upper-case both sides so the search ignores capitals
  return data.schools.filter(
    (s) =>
      // A school matches if its name OR any of its volunteers' name / phone matches (empty search matches all)
      (!q ||
        s.name.toUpperCase().includes(q) ||
        s.volunteers.some(
          (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
        )) &&
      // Switch on: keep only schools with a free place (filled < capacity). p5Classes = places needed.
      (!needsOnly.value || filledCount(s) < s.p5Classes) &&
      // A pressed stat chip keeps only schools with at least one volunteer of that status.
      // While the search box has text the chip is ignored, so the search looks through everything (same as Incidents).
      (!statusFilter.value || q || s.volunteers.some((v) => v.status === statusFilter.value)) &&
      (!zoneFilter.value || s.zone === zoneFilter.value) &&
      (!timeFilter.value || s.reportingTime === timeFilter.value),
  )
})
watch(selectedShow, () => {
  focusedSchoolId.value = null
  clearSchoolFilters()
  statusFilter.value = '' // a chip pressed on the old show must not carry over to the new one
})
// Capacity bar under each school's name: width in %, and colour (green = full, red = empty, amber = in between).
function capacityPercent(school) {
  return school.p5Classes
    ? Math.min(100, Math.round((filledCount(school) / school.p5Classes) * 100)) // capped at 100% if over-filled
    : 0 // a school with no places needed: avoid dividing by zero
}
function capacityClass(school) {
  const filled = filledCount(school)
  if (filled >= school.p5Classes) return 'bg-success'
  return filled === 0 ? 'bg-danger' : 'bg-warning'
}

// ---------------------------------------------------------------------------------------------------
// 4. MENU <-> MAP
//   panelOpen       : true = the full-screen school list (the "menu") covers the map; false = the map is visible.
//   focusedSchoolId : the ONE school the map is zoomed to: its volunteers are drawn, its pin keeps the full indigo
//                     and its details show in the focus card. null = overview (only the school pins).
// Choosing a school in the menu (or tapping its pin) closes the menu and focuses that school.
// Tapping empty map, or the X on the focus card, unfocuses it and zooms back out.
// ---------------------------------------------------------------------------------------------------

// The menu starts open on every screen size: pick a school first.
const panelOpen = ref(true)
// The one school whose volunteers are shown on the map (null = schools only).
const focusedSchoolId = ref(null)
// The focused school with its volunteers (null if none, or if it no longer exists in the selected show).
const focusedSchool = computed(
  () =>
    groupedAssignments.value[selectedShow.value]?.schools.find(
      (s) => s._id === focusedSchoolId.value,
    ) || null,
)
// The Unassigned card starts collapsed; click its header to open it.
const showUnassigned = ref(false)
// Unassigned volunteers sorted A–Z by name (change the sort here).
const sortedUnassigned = computed(() => {
  const list = groupedAssignments.value[selectedShow.value]?.unassigned || []
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')) // copy first so the original isn't reordered
})

// ---------------------------------------------------------------------------------------------------
// 5. CHOOSING / UNSELECTING A SCHOOL
// ---------------------------------------------------------------------------------------------------

// A school card in the menu, or a school PIN on the map, was chosen: close the menu, focus the school, zoom to it.
function selectSchool(school) {
  focusedSchoolId.value = school._id // map shows this school's volunteers; the focus card shows its details
  panelOpen.value = false // collapse the menu so the map is visible
  focusSchool(school) // zoom to the school + its volunteers
}

// Unselect the focused school and zoom back out (tap on the map, or the X on the focus card).
function clearFocus() {
  if (focusedSchoolId.value === null) return // nothing focused: nothing to undo
  focusedSchoolId.value = null
  limitView()
  resetMapView()
}

// Return to the zoomed-out starting view (the "overview" that fitOverview() saved in homeView).
function resetMapView() {
  if (!map || !homeView) return // map not ready yet: nothing to do
  const atHome = map.getZoom() === homeView.zoom && map.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return // already the overview (within 50 metres): stay still
  map.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// When the search matches a VOLUNTEER inside a school (but not the school's own name), the card lists who matched,
// so the admin can see why that school is in the results.
function matchedVolunteers(school) {
  const q = searchbar.value.trim().toUpperCase()
  if (!q || school.name.toUpperCase().includes(q)) return []
  return school.volunteers.filter(
    (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
  )
}

// ---------------------------------------------------------------------------------------------------
// 6. MAP SIZING
// ---------------------------------------------------------------------------------------------------

// While a school is focused, a card covers part of the map (left card on tablet/desktop, 45% bottom sheet on phones),
// so when fitting the map to a school we leave that part empty (padding) and the pins land in the visible area.
// The widths match the CSS at the bottom of this file. With no school focused the whole map is free.
// Returns an options object that Leaflet's fitBounds() understands: [horizontal, vertical] padding in pixels.
function fitPadding() {
  if (focusedSchoolId.value === null) return { padding: [30, 30] } // overview: the whole map is free
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] } // desktop: card 420px
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] } // tablet: card 340px
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.45 + 30] } // phone: sheet 45vh
}

function coveredInsets() {
  if (focusedSchoolId.value === null) return null
  const none = { top: 0, left: 0, bottom: 0, right: 0 }
  if (window.matchMedia('(min-width: 992px)').matches) return { ...none, left: 432 }
  if (window.matchMedia('(min-width: 768px)').matches) return { ...none, left: 352 }
  return { ...none, bottom: window.innerHeight * 0.45 }
}

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

function cameraFor(pts, padTL, padBR, maxZoom) {
  const bounds = L.latLngBounds(pts)
  const zoom = Math.min(map.getBoundsZoom(bounds, false, padTL.add(padBR)), maxZoom)
  const offset = padBR.subtract(padTL).divideBy(2)
  const sw = map.project(bounds.getSouthWest(), zoom)
  const ne = map.project(bounds.getNorthEast(), zoom)
  const target = map.unproject(sw.add(ne).divideBy(2).add(offset), zoom)
  return { zoom, target }
}

function isClear(pt, camera, padTL, padBR) {
  const size = map.getSize()
  const p = map
    .project(pt, camera.zoom)
    .subtract(map.project(camera.target, camera.zoom))
    .add(size.divideBy(2))
  return p.x >= padTL.x && p.x <= size.x - padBR.x && p.y >= padTL.y && p.y <= size.y - padBR.y
}

// Zoom the map so the school and all of its volunteers are visible (but never closer than zoom level 15).
function focusSchool(school) {
  if (!map || !L || !school.lat || !school.lng) return // map not ready, or the school has no coordinates
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

// One small badge per status for the collapsed card, e.g. "3 Accepted". Statuses with zero volunteers are skipped.
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

// ---------------------------------------------------------------------------------------------------
// 7. SERVER CALLS (everything that talks to the backend)
// ---------------------------------------------------------------------------------------------------

// Fetch every assignment and store it in `assignments`; every computed value above then rebuilds by itself.
//   quiet = false (default): a normal load. It clears the red error box first and shows any error there.
//   quiet = true            : a background refresh. It never touches the error box, so a message from a failed
//                             Allocate / Publish is not wiped, and a failed refresh does not nag the admin.
// The try/catch matters: before it was added, any failure (e.g. 403 when not an admin) left the page saying
// "There are no assignments." Now the real reason appears in the red box.
// NEW: true until the FIRST load finishes (success or error). It drives the "Fetching..." overlay on the map.
// The 5-second refreshes never set it back to true, so the overlay does not flash every 5 seconds.
const loading = ref(true)

async function loadData(quiet = false) {
  try {
    const response = await axios.get(API_URL + 'assignments')
    // FIX: only replace the data when it really changed. A new array every 5 s redrew every map pin and closed open tooltips.
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
    loading.value = false // NEW: runs after success AND failure, so the overlay can never get stuck on screen
  }
}

// "Allocate" (reset = false) and "Reset" (reset = true).
// It used to be a GET request (anyone, even a link preview, could wipe the allocation); it is now a POST that
// first asks the admin to confirm.
//   reset = false: accepted volunteers keep their school, everyone else is matched to the open places.
//   reset = true : erases EVERYTHING (including accepted) and starts again.
async function runAllocation(reset = false) {
  // the run replaces data, so always ask first
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
    }) // CHANGED: send the selected show so only that one is touched
    // The run answers { assignments, skippedShows }: published shows are locked and not re-run
    assignments.value = response.data.assignments
    const skipped = response.data.skippedShows || []
    // NEW: how many late volunteers the server added to each published show, e.g. { 'NE Show 1': { added: 2, placed: 1 } }
    const toppedUp = response.data.toppedUp || {}
    // One short sentence per show, e.g. "NE Show 1: 2 late volunteers added (1 placed, 1 on reserve)"
    const lateNotes = Object.entries(toppedUp)
      .filter(([, t]) => t.added > 0) // skip shows where nobody was late
      .map(
        ([show, t]) =>
          `${show}: ${t.added} late volunteer${t.added === 1 ? '' : 's'} added (${t.placed} placed, ${t.added - t.placed} on reserve)`,
      )
    const lateText = lateNotes.length > 0 ? ' ' + lateNotes.join('. ') + '.' : '' // empty when nobody was late
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
    runningAlloc.value = false // finally: the button is re-enabled even when the request fails
  }
}

// How many rows in the selected show are still drafts (published = false). Drives the number on the Publish
// button, and disables the button when there is nothing to publish.
const draftCount = computed(() => {
  let n = 0
  for (const a of assignments.value) {
    if (a.show === selectedShow.value && !a.published) n++
  }
  return n
})

// "Publish": volunteers only see an allocation after this. It lets the admin review the result first.
// Afterwards the data is re-loaded so every row shows as published.
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
    await loadData() // reload so every row now shows as published
    showPopup('info', 'Published', `${selectedShow.value} is now visible to volunteers.`)
  } catch (error) {
    showPopup('error', 'Publish failed', error.response?.data?.message || 'Could not publish.')
  } finally {
    publishing.value = false
  }
}

// ---------------------------------------------------------------------------------------------------
// 8. MAP DRAWING
// These are plain variables (not ref) on purpose: Leaflet objects must not be wrapped by Vue's reactivity.
// BaseMap creates the Leaflet map and hands it to onMapReady(); we then draw our own pins on it.
// markersGroup / linesGroup / volGroup are "layer groups": one clearLayers() call removes every pin / line we drew.
//   L            : the Leaflet library itself
//   map          : the Leaflet map object
//   markersGroup : the school pins (always shown)
//   linesGroup   : the lines from the focused school to its volunteers
//   volGroup     : the focused school's volunteer pins (its own layer, so the 45 school pins aren't redrawn)
//   homeView     : the zoomed-out "overview" ({ center, zoom }) that resetMapView() returns to
// ---------------------------------------------------------------------------------------------------
let L = null
let map = null
let markersGroup = null
let linesGroup = null
let volGroup = null
let homeView = null
let baseBounds = null
let schoolMarkers = {} // schoolId -> its Leaflet marker, so a focus change can restyle pins without redrawing them all

// Zoom the map so EVERY school of the selected show is visible and centred,
// then remember that view as the "overview" that resetMapView() returns to.
function fitOverview() {
  const data = groupedAssignments.value[selectedShow.value]
  if (!map || !data) return // map or data not ready yet
  const pts = data.schools.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
  if (!pts.length) return
  map.invalidateSize() // make sure Leaflet knows the map's real size before fitting
  map.fitBounds(pts, { ...fitPadding(), animate: false }) // padding keeps the pins clear of the floating panel
  homeView = { center: map.getCenter(), zoom: map.getZoom() }
}

// Called once by BaseMap when the Leaflet map is ready: create the three layers and draw for the first time.
function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  map.zoomControl?.setPosition('bottomright') // move +/- buttons to the bottom right (as in TrackingView)
  baseBounds = map.options.maxBounds
  map.options.zoomSnap = 0.25
  map.on('zoomend resize', () => limitView())
  homeView = { center: m.getCenter(), zoom: m.getZoom() } // temporary starting view, replaced by fitOverview() below

  markersGroup = L.layerGroup().addTo(map)
  linesGroup = L.layerGroup().addTo(map)
  volGroup = L.layerGroup().addTo(map)
  // Click / tap on empty map: unselect the focused school (pins and volunteer markers don't bubble up to this).
  map.on('click', clearFocus)
  // The map was empty on first load because it was only drawn when the dropdown changed.
  // Draw once here too, in case the assignments arrived before the map was ready.
  renderMapElements()
  fitOverview() // fits all the schools in view and saves that as the overview
}

// Pin style for a school: with a school focused, only that one keeps the full indigo; the rest turn light.
// With nothing focused (overview) every pin is full indigo.
function schoolIconFor(id) {
  const dimmed = focusedSchoolId.value !== null && focusedSchoolId.value !== id
  return createSchoolIcon({ dimmed })
}
// Restyle the existing pins after the focus changes (cheap: no pin is recreated).
function updateSchoolIcons() {
  for (const [id, marker] of Object.entries(schoolMarkers)) {
    marker.setIcon(schoolIconFor(id))
    marker.setZIndexOffset(id === focusedSchoolId.value ? 500 : 0) // focused pin on top
  }
}

// Draws the school pins. Runs only when the data or the show changes, NOT on every click.
// It draws EVERY school of the selected show (the search / "Needs Volunteers" filters only affect the card list).
function renderSchools() {
  if (!map || !L || !selectedShow.value) return
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return
  markersGroup.clearLayers() // remove the old pins first so they don't pile up
  schoolMarkers = {}
  data.schools.forEach((school) => {
    if (!school.lat || !school.lng) return // a school without coordinates cannot be placed
    const marker = L.marker([school.lat, school.lng], { icon: schoolIconFor(school._id) })
    schoolMarkers[school._id] = marker
    bindTip(marker, schoolTip(school)) // hover tooltip (shared helper in utils/map-icons.js)
    marker.on('click', () => selectSchool(school)) // clicking the icon opens + zooms to this school
    markersGroup.addLayer(marker)
  })
}

// Draws ONLY the focused school's volunteers + lines. This is the cheap one that runs on every click.
function renderVolunteers() {
  if (!map || !L || !selectedShow.value) return
  volGroup.clearLayers()
  linesGroup.clearLayers()
  const data = groupedAssignments.value[selectedShow.value]
  const school = data?.schools.find((s) => s._id === focusedSchoolId.value)
  if (!school || !school.lat || !school.lng) return // nothing focused = overview only
  school.volunteers.forEach((vol) => {
    if (!vol.lat || !vol.lng) return // a volunteer without coordinates cannot be placed
    const marker = L.marker([vol.lat, vol.lng], { icon: createVolIcon(vol.status) })
    bindTip(marker, volTip(vol)) // badge colour follows their status
    volGroup.addLayer(marker)
    linesGroup.addLayer(
      L.polyline(
        [
          [vol.lat, vol.lng], // Start: volunteer
          [school.lat, school.lng], // End: school
        ],
        { color: '#0066ff', weight: 2, opacity: 0.3, interactive: false }, // not clickable, so a tap on a line counts as a map tap
      ),
    )
  })
}

// Both together: used on first load and when the data or show changes
function renderMapElements() {
  renderSchools()
  renderVolunteers()
}

// ---------------------------------------------------------------------------------------------------
// 9. WATCHERS (code that runs by itself when something changes)
// ---------------------------------------------------------------------------------------------------

// Data or show changed: redraw everything. No { deep: true }: the data is replaced as a whole when it
// reloads (loadData / Allocate / Publish), so a plain watch is enough and Vue doesn't walk every property.
watch([selectedShow, groupedAssignments], renderMapElements)

// A different school got focus: redraw only its volunteers (about 8 pins, not 45 + 8)
watch(focusedSchoolId, () => {
  renderVolunteers()
  updateSchoolIcons()
})

watch(selectedShow, () => {
  limitView()
})
// Refit the overview ONLY the first time, or when the admin picks a different show (and never while a school
// is zoomed in). A background refresh replaces `assignments` too, but must not make the map jump,
// so it is ignored here: hasFitted remembers that the first fit already happened.
let hasFitted = false
watch([selectedShow, assignments], ([newShow], [oldShow]) => {
  const showChanged = newShow !== oldShow
  if (focusedSchoolId.value === null && (showChanged || !hasFitted)) {
    fitOverview()
    hasFitted = true
  }
})

// ---------------------------------------------------------------------------------------------------
// 10. AUTO-REFRESH AND START
// ---------------------------------------------------------------------------------------------------

// Reload the data every 5 seconds so the admin sees volunteers' accepts/declines without refreshing the page.
// It skips a round while Allocate / Publish is running so it cannot clash with them.
// onMounted = runs once the page is on screen; onUnmounted = runs when the admin leaves the page (stops the timer).
// It calls loadData(true) = the quiet mode: it never touches the red error box, so an error from Allocate / Publish
// stays on screen instead of vanishing at the next refresh, and a failed refresh does not nag the admin.
let timer = null

// FIX (C15): when the tab comes back into view, refresh straight away, because the timer skipped rounds while hidden
function onTabVisible() {
  if (document.visibilityState === 'visible' && !runningAlloc.value && !publishing.value) loadData(true)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('visibilitychange', onTabVisible) // FIX (C15)
  timer = setInterval(() => {
    // FIX (C15): skip the refresh while the browser tab is hidden (the Live Board already does this)
    if (document.visibilityState !== 'visible') return
    if (!runningAlloc.value && !publishing.value) loadData(true)
  }, 5000)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('visibilitychange', onTabVisible) // FIX (C15): clean up when leaving the page
  clearInterval(timer)
  clearTimeout(popupTimer)
})
// First load, as soon as the page opens.
loadData()
</script>

<template>
  <!-- LAYOUT: one full-screen map with the school list (the "menu") on top of it.
       .map-page and .map-stage come from assets/map-ui.css: they make the map fill the page under the navbar.
       Inside the stage, stacked on each other: the map, the full-screen menu (header + show selector + action buttons,
       stat chips, search + filters, then the scrolling list: the Unassigned card and one card per school), a small
       "Allocation" button (only when the menu is hidden and no school is focused), the focus card (the chosen school's
       details, shown when the menu is hidden) and the popups.
       :class="{ focus-open }" is added while the focus card is showing: on phones the CSS uses it to lift the map's
       zoom buttons and credit above the bottom sheet. -->
  <div class="map-page">
    <div class="map-stage alloc-stage" :class="{ 'focus-open': focusedSchool && !panelOpen }">
      <!-- The map. BaseMap builds the Leaflet map and calls onMapReady(map, L) in the script when it is ready;
           every pin is drawn from the script, not from this template. -->
      <BaseMap :zoom="12" @ready="onMapReady" />

      <!-- NEW: overlay on top of the map until the first assignments arrive (MapLoading is position:absolute, so it covers .map-stage) -->
      <MapLoading v-if="loading" class="alloc-loading" text="Fetching Allocation Data..." />

      <!-- Button to bring the panel back after it was hidden (only exists while the panel is hidden) -->
      <button
        v-if="!panelOpen && !focusedSchool"
        type="button"
        class="btn btn-primary shadow alloc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Allocation
      </button>

      <!-- The floating panel. v-show (not v-if) only hides it with CSS, so the open cards, the scroll position and the
           search text are all kept while it is hidden. -->
      <Transition name="alloc-panel-fade">
        <aside v-show="panelOpen" class="alloc-panel">
          <!-- TOP PART of the panel. It never scrolls (flex: 0 0 auto in the CSS); only .alloc-panel-scroll below scrolls. -->
          <div class="alloc-panel-head">
            <!-- Header row: title + show selector on the left, action buttons on the right.
               v-model="selectedShow" links the dropdown to the script: choosing a show changes selectedShow, and every
               chip, card and pin then switches to that show. The data-testid attributes are used by the e2e tests. -->
            <!-- On phones (CSS at the bottom) the row is: [title + show selector ... Map] then [Allocate | Publish | Reset]
               sharing one line equally, so nothing wraps onto a third line. -->
            <div class="alloc-head-row mb-2">
              <div class="alloc-title-group d-flex flex-wrap align-items-center gap-3">
                <!-- Custom show dropdown (same look and animation as the HQ Live Board) -->
                <div
                  ref="showEl"
                  class="show-select"
                  :class="{ open: showMenuOpen }"
                  @keydown.esc="showMenuOpen = false"
                >
                  <button
                    type="button"
                    class="show-btn"
                    aria-haspopup="listbox"
                    :aria-expanded="showMenuOpen"
                    aria-label="Show"
                    data-testid="alloc-event-select"
                    @click="showMenuOpen = !showMenuOpen"
                  >
                    <i class="bi bi-calendar-event" aria-hidden="true"></i>
                    <span class="show-name">{{ selectedShow }}</span>
                    <i
                      class="bi bi-chevron-down show-chevron"
                      :class="{ open: showMenuOpen }"
                      aria-hidden="true"
                    ></i>
                  </button>

                  <Transition name="menu">
                    <div v-if="showMenuOpen" class="show-menu" role="listbox">
                      <button
                        v-for="(show, i) in shows"
                        :key="show"
                        type="button"
                        class="show-option"
                        :class="{ active: show === selectedShow }"
                        :style="{ '--i': i }"
                        role="option"
                        :aria-selected="show === selectedShow"
                        :data-testid="'alloc-show-option-' + (i + 1)"
                        @click="chooseShow(show)"
                      >
                        <span>{{ show }}</span>
                        <i
                          v-if="show === selectedShow"
                          class="bi bi-check-lg"
                          aria-hidden="true"
                        ></i>
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>
              <div class="alloc-actions d-flex flex-wrap align-items-center gap-2">
                <!-- Allocate: matches unassigned volunteers to schools (draft only, nothing is visible to volunteers yet).
                   Disabled while a run is in progress. title = the tooltip shown on hover. -->
                <!-- E2E: data-testid="alloc-run" lets the Allocation test press this button -->
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
                  <!-- Publish: makes the selected show visible to volunteers. Disabled while publishing, or when there are
                     no drafts to publish. The number on the badge is draftCount (unpublished rows in this show). -->
                  Publish
                  <!-- E2E: data-testid="alloc-draft-count" lets the test read how many drafts are waiting -->
                  <span
                    class="badge text-bg-light ms-1"
                    title="Unpublished drafts"
                    data-testid="alloc-draft-count"
                    >{{ draftCount }}</span
                  >
                </button>
                <!-- Reset: erases EVERYTHING (it still asks for confirmation first). Replaces the old ... menu. -->
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
              <!-- Collapse the menu to see the map (sits beside the show selector on phones) -->
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

            <!-- Stat chips: Schools, Accepted, Pending, Declined, Withdrawn, Unassigned (counts for the selected show).
               Drawn with one v-for over statChips. Bootstrap columns: col-4 = 3 per row on phones, col-md-2 = all 6 on
               one row from tablet up (a row is 12 columns wide). -->
            <div v-if="groupedAssignments[selectedShow]" class="row g-1 mb-2 alloc-chips">
              <div v-for="chip in statChips" :key="chip.label" class="col-4">
                <!-- Each chip is a button that filters the school list (like the Incidents page).
                     is-active / aria-pressed are off for the Schools chip (it means "no filter") and while the search box
                     has text, because a search ignores the chip. -->
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

            <!-- Search box + "Needs Volunteers" switch.
               v-model keeps each control in sync with searchbar / needsOnly in the script, and the card list filters
               itself (see visibleSchools). -->
            <div class="alloc-search-row d-flex flex-wrap align-items-center gap-2 mb-0">
              <!-- Zone + reporting time filters (these apply to the card list only, like the search box) -->
              <!-- Zone + reporting time filters: same custom dropdown as the show selector -->
              <div class="alloc-filter-row d-flex flex-wrap align-items-center gap-2 mt-2">
                <div
                  ref="zoneEl"
                  class="show-select"
                  :class="{ open: zoneMenuOpen }"
                  @keydown.esc="zoneMenuOpen = false"
                >
                  <button
                    type="button"
                    class="show-btn"
                    aria-haspopup="listbox"
                    :aria-expanded="zoneMenuOpen"
                    aria-label="Filter by zone"
                    data-testid="alloc-zone-filter"
                    @click="zoneMenuOpen = !zoneMenuOpen"
                  >
                    <i class="bi bi-geo-alt" aria-hidden="true"></i>
                    <span class="show-name">{{ zoneFilter || 'All Zones' }}</span>
                    <i
                      class="bi bi-chevron-down show-chevron"
                      :class="{ open: zoneMenuOpen }"
                      aria-hidden="true"
                    ></i>
                  </button>
                  <Transition name="menu">
                    <div v-if="zoneMenuOpen" class="show-menu filter-menu" role="listbox">
                      <button
                        v-for="(z, i) in ['', ...zoneOptions]"
                        :key="z || 'all'"
                        type="button"
                        class="show-option"
                        :class="{ active: z === zoneFilter }"
                        :style="{ '--i': i }"
                        role="option"
                        :aria-selected="z === zoneFilter"
                        @click="chooseZone(z)"
                      >
                        <span>{{ z || 'All Zones' }}</span> <!-- FIX: same wording as the button above ('All Zones') -->
                        <i v-if="z === zoneFilter" class="bi bi-check-lg" aria-hidden="true"></i>
                      </button>
                    </div>
                  </Transition>
                </div>

                <div
                  ref="timeEl"
                  class="show-select"
                  :class="{ open: timeMenuOpen }"
                  @keydown.esc="timeMenuOpen = false"
                >
                  <button
                    type="button"
                    class="show-btn"
                    aria-haspopup="listbox"
                    :aria-expanded="timeMenuOpen"
                    aria-label="Filter by reporting time"
                    data-testid="alloc-time-filter"
                    @click="timeMenuOpen = !timeMenuOpen"
                  >
                    <i class="bi bi-clock" aria-hidden="true"></i>
                    <span class="show-name">{{ timeFilter || 'All Timings' }}</span>
                    <i
                      class="bi bi-chevron-down show-chevron"
                      :class="{ open: timeMenuOpen }"
                      aria-hidden="true"
                    ></i>
                  </button>
                  <Transition name="menu">
                    <div v-if="timeMenuOpen" class="show-menu filter-menu" role="listbox">
                      <button
                        v-for="(t, i) in ['', ...timeOptions]"
                        :key="t || 'all'"
                        type="button"
                        class="show-option"
                        :class="{ active: t === timeFilter }"
                        :style="{ '--i': i }"
                        role="option"
                        :aria-selected="t === timeFilter"
                        @click="chooseTime(t)"
                      >
                        <span>{{ t || 'All Timings' }}</span>
                        <i v-if="t === timeFilter" class="bi bi-check-lg" aria-hidden="true"></i>
                      </button>
                    </div>
                  </Transition>
                </div>

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

          <!-- BOTTOM PART of the panel: the only part that scrolls. -->
          <div class="alloc-panel-scroll">
            <div v-if="groupedAssignments[selectedShow]" class="card-hw p-3 mb-3">
              <!-- UNASSIGNED CARD: volunteers who do not have a school yet. Same accordion pattern as the school cards
                 (a heading that contains a button, with aria-expanded so screen readers know if it is open). -->
              <h2 class="h5 mb-0">
                <button
                  type="button"
                  class="school-head align-items-center"
                  :aria-expanded="showUnassigned"
                  @click="showUnassigned = !showUnassigned"
                >
                  <span>Unassigned volunteers</span>
                  <span class="d-flex align-items-center gap-2">
                    <!-- amber while someone is waiting, green when everyone has a school -->
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

              <!-- Collapsing area: the class "open" is added when showUnassigned is true; the CSS animates the height. -->
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
                      <!-- Round avatar with the volunteer's first letter (or ? when there is no name) -->
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
            <!-- No data for this show at all: ask the admin to press Allocate. This v-if and the v-else on the
               template below are a pair: either this message or the list of school cards is shown. -->
            <p v-if="!groupedAssignments[selectedShow]" class="text-muted-hw">
              There are no assignments. Press "Allocate" to create them.
            </p>
            <template v-else>
              <!-- Nothing to list: say why (every school is full, or nothing matched the search) -->
              <p v-if="visibleSchools.length === 0" class="text-muted-hw">
                {{
                  needsOnly && !searchbar.trim()
                    ? 'Every school has enough volunteers.'
                    : statusFilter && !searchbar.trim()
                      ? `No schools with ${statusFilter} volunteers.` // a chip is pressed and nothing matches
                      : 'No schools or volunteers match.'
                }}
              </p>
              <!-- SCHOOL CARDS: one per school in visibleSchools (so the search and the "Needs Volunteers" filter apply),
                 laid out in a responsive grid. Clicking a card (or pressing Enter on its title button) calls selectSchool():
                 the menu collapses, the map zooms to that school and the focus card shows its volunteers. -->
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

                  <!-- Capacity bar (green = full, amber = partly filled, red = empty) and one badge per status, e.g. "3 Accepted". -->
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
                  <!-- Only while searching: which volunteers of this school matched -->
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

      <!-- FOCUS CARD: shown while the menu is collapsed and a school is focused. Left card on tablet/desktop, bottom sheet
           on phones. "Schools" brings the menu back; X unselects the school and zooms out (same as tapping the map). -->
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

      <!-- Modal confirmation card (Allocate / Publish / Reset): darkens the page until Cancel or OK is clicked -->
      <ConfirmDialog :dialog="confirmDialog" @answer="answerConfirm" />
      <!-- Temporary status popup (errors, confirmations, "Allocating..."), same component as TrackingView -->
      <MapNotice
        :notice="popupNotice"
        :closable="!runningAlloc && !publishing"
        @close="dismissPopup"
      />
    </div>
  </div>
</template>

<style scoped>
/* ===== STYLES (scoped: they only affect this page). Order: small helpers, the floating panel, then the cards. ===== */
/* The search box never grows wider than 24rem */
.search-box {
  max-width: 24rem;
}
/* The unassigned list scrolls on its own after 240px so a long list does not push the school cards away */
.unassigned-list {
  max-height: 240px;
  overflow-y: auto;
}
/* Round avatar with a volunteer's initial (28px circle, centred letter) */
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
/* Performance: the browser skips layout and paint for cards scrolled out of view (45 cards with many rows
   made the list laggy). contain-intrinsic-size gives each hidden card a rough height so the scrollbar is stable. */
.school-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 70px; /* rough height so the scrollbar doesn't jump */
}
/* School cards in the menu: a responsive grid, each card is clickable */
.alloc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 8px;
}
/* Tablets and larger: always exactly 2 columns (roomier cards, names are not cut off).
   Phones (under 768px) keep the rule above, so the phone layout is unchanged */
@media (min-width: 768px) {
  .alloc-grid {
    grid-template-columns: repeat(
      2,
      minmax(0, 1fr)
    ); /* minmax(0, ...) lets long names shrink and truncate instead of stretching the card */
  }
}
.school-card {
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.school-card:hover {
  box-shadow: 0 0 0 2px var(--bs-primary);
}

/* THE MENU (school list): covers the whole map area under the navbar, like the chat window on phones.
   It is a flex column: the header stays put and only the list inside (.alloc-panel-scroll) scrolls.
   The side padding keeps the content in a readable column (same width as the navbar's .container) on wide screens. */
.alloc-panel {
  position: absolute;
  inset: 0;
  z-index: 1100; /* above Leaflet's own layers (they go up to 1000) and the focus card */
  display: flex;
  flex-direction: column;
  background: var(--hw-surface);
  color: var(--hw-text);
}
.alloc-panel-head {
  flex: 0 0 auto; /* header and filters never shrink or scroll away */
  padding: 12px max(12px, calc((100% - var(--hw-content-w)) / 2)) 8px; /* was a fixed 1100px: uses the shared --hw-content-w, same as the navbar */
}
/* Bottom part of the menu: the list of cards */
.alloc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0; /* lets the flex child scroll instead of growing */
  overflow-y: auto;
  padding: 0 max(12px, calc((100% - var(--hw-content-w)) / 2)) 12px; /* was a fixed 1100px: uses the shared --hw-content-w, same as the navbar */
}
/* Chip captions are tiny on phones so all the chips fit */
/* The stat chips are buttons: keep the card look, add a pointer, and ring the pressed one (same as the Incidents page) */
.stat-btn {
  border: 0;
  cursor: pointer;
  color: inherit;
}
.stat-btn:focus-visible {
  outline: 2px solid var(--bs-primary); /* keyboard focus ring */
  outline-offset: 2px;
}
.stat-btn.is-active {
  box-shadow: 0 0 0 2px var(--bs-primary); /* ring around the pressed chip */
}
.alloc-chips .chip-label {
  font-size: 0.7rem; /* tiny label so six chips fit in one row */
  line-height: 1.1;
  white-space: nowrap;
}
@media (min-width: 768px) {
  .alloc-chips .chip-label {
    font-size: 0.75rem; /* tablet and desktop */
  }
}
/* NEW: the loading overlay must sit ABOVE the menu (.alloc-panel is z-index 1100 and open by default), otherwise the menu
   hides it. 1105 is still below MapNotice (1150), so error popups stay visible. The longer selector beats MapLoading's own style. */
.alloc-stage .alloc-loading {
  z-index: 1105;
}
/* Button that brings the menu back (only shown when the menu is hidden and no school is focused) */
.alloc-reopen {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
}
/* HEADER ROW. Wide screens: [title + selector] [Allocate Publish Reset] [Map pushed to the right], wrapping if needed. */
.alloc-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.alloc-map-btn {
  margin-left: auto;
}
/* PHONES (under 576px): save vertical space. Row 1 = title + show selector with Map on the right; row 2 = the three
   action buttons sharing the full width equally. Search + switch stay on ONE line with smaller text, so the search
   box is no longer squeezed and cut off. */
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
/* Let the search box shrink and grow to share its row with the switch */
.alloc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}

/* THE FOCUS CARD: details of the focused school. Left card on tablet/desktop (340px / 420px: keep in step with
   fitPadding() in the script), bottom sheet on phones (45vh, also used in fitPadding()). */
.alloc-focus {
  position: absolute;
  z-index: 1050; /* above the map controls, below the menu */
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
  overflow-y: auto; /* a long volunteer list scrolls inside the card */
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
  /* lift the map's bottom controls (zoom buttons, OneMap credit) above the sheet while it is showing */
  .alloc-stage.focus-open {
    --map-inset-bottom: 45vh;
  }
}

/* OPEN / CLOSE ANIMATIONS: the menu fades and slides up a little; the focus card slides in from its edge.
   Short (0.2s) and switched off for people who turned animations off in their system settings. */
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

/* CARD HEADER: the title row looks like normal text but is a full-width button (so it is keyboard- and
   screen-reader-friendly). Used by the school cards and the Unassigned card. */
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
  outline: 2px solid var(--bs-primary); /* keyboard focus ring */
  outline-offset: 4px;
  border-radius: 4px;
}
.chevron {
  transition: transform 0.25s;
}
.school-head[aria-expanded='true'] .chevron {
  transform: rotate(180deg); /* arrow flips when open */
}

/* OPEN / CLOSE ANIMATION: animates the grid row height from 0fr to 1fr, so the list slides open without
   needing a fixed height. The script only toggles the class "open"; this CSS does the movement. */
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
  margin-top: 0.5rem; /* a little air above the list once it is open */
}

/* Respect people who turn animations off in their system settings */
@media (prefers-reduced-motion: reduce) {
  .vol-collapse,
  .chevron {
    transition: none;
  }
}
/* ===== Show dropdown (same look and animation as the HQ Live Board) ===== */
.show-select {
  position: relative;
  flex: 0 0 auto;
  z-index: 20; /* keeps the open menu above the chips and cards underneath */
}
.show-select.open {
  z-index: 30;
}
.show-btn {
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: var(--hw-bg);
  color: var(--bs-secondary-color);
  font-weight: 600;
  transition: background-color 0.15s;
}
.show-btn:hover {
  background: var(--bs-secondary-bg);
}
.show-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hw-text);
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
  background: var(--hw-surface);
  color: var(--hw-text);
  border: 1px solid var(--bs-border-color);
  border-radius: 14px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.22);
}
/* A long list of zones/times scrolls inside the menu instead of running off the screen */
.filter-menu {
  max-height: 260px;
  overflow-y: auto;
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
  color: inherit;
  font-size: 0.9rem;
  text-align: left;
  animation: option-in 0.2s ease both;
  animation-delay: calc(var(--i) * 30ms);
}
.show-option:hover {
  background: var(--hw-bg);
}
.show-option.active {
  background: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  font-weight: 600;
}
/* The menu grows out of the button */
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
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
</style>