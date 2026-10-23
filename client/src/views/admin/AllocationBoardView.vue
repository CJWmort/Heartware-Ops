<script setup>
// =====================================================================================================
// Feature 1b – Smart Allocation (coordinator / admin board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
// =====================================================================================================
//
// WHAT THIS PAGE IS FOR
// The admin matches volunteers to schools for each National Education (NE) show, reviews the result,
// then publishes it so volunteers can accept or decline. The page is one full-screen map with a floating
// panel on top (a left-hand card on tablet/desktop, a bottom sheet on phones).
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
//     volunteers (coloured pins + lines) for ONE school only: the card opened last (focusedSchoolId).
//  6. The page re-loads the data on a timer (see AUTO-REFRESH at the bottom), so the admin sees volunteers'
//     accepts / declines without refreshing the browser.
//
// FILE LAYOUT: this <script> (logic) -> <template> (HTML) -> <style> (CSS).
// Inside the script the sections are in this order: data, derived data, search/filter, cards<->map state,
// card actions, map sizing, server calls, map drawing, watchers, auto-refresh.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/BaseMap.vue'
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
const selectedShow = ref('NE Show 1') // the show currently displayed
const searchbar = ref('') // text in the search box
const runningAlloc = ref(false) // true while Allocate / Reset is running (disables those buttons)
const errorMessage = ref('') // red box at the top of the panel; shown instead of a misleading "There are no assignments."
const publishing = ref(false) // true while Publish is running (disables the Publish button)
const notice = ref('') // green confirmation box, e.g. after publishing

// ---------------------------------------------------------------------------------------------------
// 2. DERIVED DATA (computed: rebuilt automatically whenever `assignments` changes)
// ---------------------------------------------------------------------------------------------------

// Reshapes the flat `assignments` list into something easy to display.
// Result looks like:
//   { 'NE Show 1': { schools: [{ ...school, volunteers: [ {...volunteer, status, distance, published} ] }],
//                    unassigned: [ {...volunteer, assignmentId, status, published} ] },
//     'NE Show 2': { ... }, ... }
// Only shows that have at least one assignment appear as keys (so the template checks groupedAssignments[selectedShow]).
const groupedAssignments = computed(() => {
  // Step 1: build { show: { schools: [...], unassigned: [...] } } by walking the flat list once
  const byShow = {}

  for (const a of assignments.value) {
    if (!byShow[a.show]) {
      byShow[a.show] = { schools: [], unassigned: [] }
    }

    // A free volunteer has no school: list them separately and move on
    // (assignmentId identifies the record so a drag can update it;
    //  distance is null, so it is left out)
    if (!a.school) {
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
  { label: 'Schools', value: stats.value.schools },
  { label: 'Accepted', value: stats.value.Accepted },
  { label: 'Pending', value: stats.value.Pending },
  { label: 'Declined', value: stats.value.Declined },
  { label: 'Withdrawn', value: stats.value.Withdrawn },
  { label: 'Unassigned', value: stats.value.unassigned },
])

// ---------------------------------------------------------------------------------------------------
// 3. SEARCH AND FILTER
// The card LIST is filtered by two things at once: the search box AND the "Needs Volunteers" switch.
// NOTE: the map's pins are NOT filtered (renderSchools draws every school); see selectSchool() for how a
// click on a pin whose card is currently filtered out is handled.
// ---------------------------------------------------------------------------------------------------

// "Only schools that still need volunteers" switch (true = hide schools that are full)
const needsOnly = ref(false)
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
      (!needsOnly.value || filledCount(s) < s.p5Classes),
  )
})

// When the search matches a VOLUNTEER inside a school, open that school's card so the person is visible.
// Schools matched by their own name stay closed. It only opens cards, never closes them.
watch(searchbar, (value) => {
  const q = value.trim().toUpperCase()
  if (!q) return // search cleared: leave the cards as they are
  for (const s of visibleSchools.value) {
    const nameMatch = s.name.toUpperCase().includes(q)
    const volunteerMatch = s.volunteers.some(
      (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
    )
    if (volunteerMatch && !nameMatch) openSchools.value[s._id] = true
  }
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
// 4. CARDS <-> MAP: three pieces of state that work together
//   openSchools     : which cards are expanded in the LIST (any number can be open). Only controls the list.
//   focusedSchoolId : the ONE school whose volunteers are drawn on the MAP (the card opened most recently).
//                     null means "overview": only the school pins are shown.
//   openOrder       : the order cards were opened in, so closing the focused card can fall back to the
//                     previous one that is still open instead of jumping straight to the overview.
// Why separate? "Expand all" opens 45 cards, but drawing 260+ volunteers at once would clutter the map.
// ---------------------------------------------------------------------------------------------------

// Which school cards are open: { [schoolId]: true }. Everything starts closed; clicking a school's title toggles it.
const openSchools = ref({})
// The one school whose volunteers are shown on the map (null = schools only).
const focusedSchoolId = ref(null)
// The card that flashes briefly after a map click, so your eye finds it after the list jumps.
const highlightedId = ref(null)
// True when every school currently listed is open (decides whether the button says "Expand all" or "Collapse all").
const allOpen = computed(
  () =>
    visibleSchools.value.length > 0 && visibleSchools.value.every((s) => openSchools.value[s._id]),
)
// Ids in the order the cards were opened (last = most recent), so closing a card can fall back to the previous one.
const openOrder = ref([])
// The Unassigned card starts collapsed; click its header to open it.
const showUnassigned = ref(false)
// Unassigned volunteers sorted A–Z by name (change the sort here).
const sortedUnassigned = computed(() => {
  const list = groupedAssignments.value[selectedShow.value]?.unassigned || []
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')) // copy first so the original isn't reordered
})

// ---------------------------------------------------------------------------------------------------
// 5. CARD ACTIONS
// ---------------------------------------------------------------------------------------------------

// Runs when a school card's header is clicked.
//  - Opening: remember the order, make this school the map's focus, zoom the map to it.
//  - Closing the focused card: fall back to the most recently opened card that is still open;
//    if none are left, clear the focus and zoom back out to the overview.
//  - Closing a card that is NOT the focused one: the map is left alone.
// It receives the whole school (not just its id) so the map can zoom to its coordinates.
function toggleSchool(school) {
  openSchools.value[school._id] = !openSchools.value[school._id]
  if (openSchools.value[school._id]) {
    openOrder.value.push(school._id) // remember the order
    focusedSchoolId.value = school._id // map focuses on this school
    focusSchool(school) // opening: zoom to this school
  } else {
    openOrder.value = openOrder.value.filter((id) => id !== school._id) // forget it
    if (focusedSchoolId.value === school._id) {
      // Closed the focused card -> fall back to the last card still open
      const prevId = openOrder.value[openOrder.value.length - 1]
      const prev = visibleSchools.value.find((s) => s._id === prevId)
      if (prev) {
        focusedSchoolId.value = prev._id
        focusSchool(prev)
      } else {
        focusedSchoolId.value = null // nothing left open: back to the overview
        resetMapView()
      }
    }
  }
}

// Runs when a school PIN on the map is clicked (a second way, besides the card, to zoom in on a school).
// Unlike toggleSchool, it never closes a card: clicking a pin always opens it, makes it the map's focus,
// zooms to it, scrolls the list to it and flashes it.
function selectSchool(school) {
  // The pins show every school, but the list may be filtered (search / "Needs Volunteers"). If this school's
  // card is hidden by a filter, clear the filters first, otherwise there would be no card to open.
  if (!visibleSchools.value.some((s) => s._id === school._id)) {
    needsOnly.value = false
    searchbar.value = ''
  }
  panelOpen.value = true // the panel may be hidden: bring it back so the card can be seen
  if (!openSchools.value[school._id]) {
    openSchools.value[school._id] = true
    openOrder.value.push(school._id) // remember the order, as toggleSchool does
  }
  focusedSchoolId.value = school._id // map shows this school's volunteers
  focusSchool(school) // zoom to the school + its volunteers
  // Bring the opened card into view in the list. nextTick = wait until Vue has drawn the opened card,
  // otherwise we would scroll to a card that is still collapsed.
  nextTick(
    () =>
      document
        .getElementById(`school-${school._id}`)
        ?.scrollIntoView({ block: 'start', behavior: 'auto' }), // instant jump: smooth scrolling felt awkward
  )
  // Flash the card for about 1.2 seconds
  highlightedId.value = school._id
  setTimeout(() => {
    if (highlightedId.value === school._id) highlightedId.value = null // only clear our own flash
  }, 1200)
}

// Return to the zoomed-out starting view (the "overview" that fitOverview() saved in homeView).
function resetMapView() {
  if (!map || !homeView) return // map not ready yet: nothing to do
  const atHome = map.getZoom() === homeView.zoom && map.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return // already the overview (within 50 metres): stay still
  map.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// ---------------------------------------------------------------------------------------------------
// 6. FLOATING PANEL + MAP SIZING
// ---------------------------------------------------------------------------------------------------

// The floating panel can be hidden (button in its corner) to see the whole map.
// It starts open on tablet/desktop (768px and wider) and hidden on phones, where it would cover half the screen.
const panelOpen = ref(window.matchMedia('(min-width: 768px)').matches)

// The floating panel covers part of the map, so when fitting the map to some pins we leave that part empty
// (padding) and the pins land in the visible area. Desktop/tablet: panel on the left (420px / 340px wide).
// Phones: the panel is a bottom sheet (55% of the screen height). The widths match the CSS at the bottom of this file.
// Returns an options object that Leaflet's fitBounds() understands: [horizontal, vertical] padding in pixels.
function fitPadding() {
  const wide = window.matchMedia('(min-width: 768px)').matches // NOTE: not used below (leftover); safe to delete
  if (!panelOpen.value) return { padding: [30, 30] } // panel hidden: the whole map is free
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] } // desktop: panel 420px
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] } // tablet: panel 340px
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.55 + 30] } // phone: sheet 55vh
}

// Zoom the map so the school and all of its volunteers are visible (but never closer than zoom level 15).
function focusSchool(school) {
  if (!map || !L || !school.lat || !school.lng) return // map not ready, or the school has no coordinates
  const pts = [[school.lat, school.lng]]
  for (const v of school.volunteers) if (v.lat && v.lng) pts.push([v.lat, v.lng])
  map.fitBounds(pts, { ...fitPadding(), maxZoom: 15 }) // padding keeps the pins clear of the floating panel
}

// Expand all / Collapse all (only schools currently shown, so the search and the "needs volunteers" filter apply).
// It only changes the LIST. The map stays as the overview; if a school was zoomed in, it zooms back out.
function setAllSchools(open) {
  for (const s of visibleSchools.value) openSchools.value[s._id] = open
  openOrder.value = [] // Expand all / Collapse all forget the opening order
  // Only touch the map if a school is currently zoomed in; otherwise leave it alone
  if (focusedSchoolId.value !== null) {
    focusedSchoolId.value = null
    resetMapView()
  }
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
async function loadData(quiet = false) {
  if (!quiet) errorMessage.value = ''
  try {
    const response = await axios.get(API_URL + 'assignments')
    assignments.value = response.data
  } catch (error) {
    if (!quiet) errorMessage.value = error.response?.data?.message || 'Could not load assignments.'
  }
}

// "Allocate" (reset = false) and "Reset" (reset = true).
// It used to be a GET request (anyone, even a link preview, could wipe the allocation); it is now a POST that
// first asks the admin to confirm.
//   reset = false: accepted volunteers keep their school, everyone else is matched to the open places.
//   reset = true : erases EVERYTHING (including accepted) and starts again.
async function runAllocation(reset = false) {
  const question = reset
    ? 'RESET: this erases ALL assignments, including volunteers who already accepted. Continue?'
    : 'Run allocation? Volunteers who already accepted keep their school; everyone else is matched again.'
  if (!confirm(question)) return // the run replaces data, so always ask first
  runningAlloc.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const response = await axios.post(API_URL + 'assignments/run', { reset })
    // The run answers { assignments, skippedShows }: published shows are locked and not re-run
    assignments.value = response.data.assignments
    const skipped = response.data.skippedShows || []
    if (skipped.length > 0) {
      notice.value = `${skipped.join(', ')} ${skipped.length === 1 ? 'is' : 'are'} published, so ${skipped.length === 1 ? 'it was' : 'they were'} not re-run (open places there are filled automatically). Use Reset to start over.`
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.message || 'Could not run the allocation.'
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
  if (
    !confirm(
      `Publish ${selectedShow.value}? Volunteers will see their school and can accept or decline.`,
    )
  )
    return
  publishing.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await axios.post(API_URL + 'assignments/publish', { show: selectedShow.value })
    await loadData() // reload so every row now shows as published
    notice.value = `${selectedShow.value} is now visible to volunteers.`
  } catch (error) {
    errorMessage.value = error.response?.data?.message || 'Could not publish.'
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
  homeView = { center: m.getCenter(), zoom: m.getZoom() } // temporary starting view, replaced by fitOverview() below

  markersGroup = L.layerGroup().addTo(map)
  linesGroup = L.layerGroup().addTo(map)
  volGroup = L.layerGroup().addTo(map)
  // The map was empty on first load because it was only drawn when the dropdown changed.
  // Draw once here too, in case the assignments arrived before the map was ready.
  renderMapElements()
  fitOverview() // fits all the schools in view and saves that as the overview
}

// Draws the school pins. Runs only when the data or the show changes, NOT on every click.
// It draws EVERY school of the selected show (the search / "Needs Volunteers" filters only affect the card list).
function renderSchools() {
  if (!map || !L || !selectedShow.value) return
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return
  markersGroup.clearLayers() // remove the old pins first so they don't pile up
  data.schools.forEach((school) => {
    if (!school.lat || !school.lng) return // a school without coordinates cannot be placed
    const marker = L.marker([school.lat, school.lng], { icon: createSchoolIcon() })
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
        { color: '#0066ff', weight: 2, opacity: 0.3 },
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
watch(focusedSchoolId, renderVolunteers)

// When the panel is hidden or shown, the map's free area changes: refit the overview (unless a school is zoomed in).
// nextTick = wait for the panel to finish appearing/disappearing before measuring.
watch(panelOpen, () => {
  nextTick(() => {
    if (focusedSchoolId.value === null) fitOverview()
  })
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
onMounted(() => {
  timer = setInterval(() => {
    if (!runningAlloc.value && !publishing.value) loadData(true)
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
// First load, as soon as the page opens.
loadData()
</script>

<template>
  <!-- LAYOUT: one full-screen map with a floating panel on top.
       .map-page and .map-stage come from assets/map-ui.css: they make the map fill the page under the navbar.
       Inside the stage there are three things stacked on each other: the map, a small "Allocation" button
       (only when the panel is hidden) and the panel itself. The panel holds, from top to bottom: header + show
       selector + action buttons, messages, stat chips, search + filters, then the scrolling list (the Unassigned
       card followed by one card per school).
       :class="{ sheet-open: panelOpen }" adds the class sheet-open while the panel is showing: on phones the CSS
       uses it to lift the map credit above the bottom sheet. -->
  <div class="map-page">
    <div class="map-stage alloc-stage" :class="{ 'sheet-open': panelOpen }">
      <!-- The map. BaseMap builds the Leaflet map and calls onMapReady(map, L) in the script when it is ready;
           every pin is drawn from the script, not from this template. -->
      <BaseMap :zoom="12" @ready="onMapReady" />

      <!-- Button to bring the panel back after it was hidden (only exists while the panel is hidden) -->
      <button
        v-if="!panelOpen"
        type="button"
        class="btn btn-light shadow alloc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Allocation
      </button>

      <!-- The floating panel. v-show (not v-if) only hides it with CSS, so the open cards, the scroll position and the
           search text are all kept while it is hidden. -->
      <aside v-show="panelOpen" class="alloc-panel">
        <!-- Hide button in the panel's top-right corner: hides the panel so the whole map can be seen -->
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary alloc-hide"
          aria-label="Hide panel"
          title="Hide panel"
          @click="panelOpen = false"
        >
          <i class="bi bi-chevron-bar-left"></i>
        </button>
        <!-- TOP PART of the panel. It never scrolls (flex: 0 0 auto in the CSS); only .alloc-panel-scroll below scrolls. -->
        <div class="alloc-panel-head">
          <!-- Header row: title + show selector on the left, action buttons on the right.
               v-model="selectedShow" links the dropdown to the script: choosing a show changes selectedShow, and every
               chip, card and pin then switches to that show. The data-testid attributes are used by the e2e tests. -->
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <div class="d-flex flex-wrap align-items-center gap-3">
              <h1 class="h4 mb-0">Allocation</h1>
              <label for="show" class="visually-hidden">Select show</label>
              <select
                name="show"
                id="show"
                class="form-select w-auto"
                v-model="selectedShow"
                data-testid="alloc-event-select"
              >
                <option v-for="show in shows" :key="show" :value="show">{{ show }}</option>
              </select>
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2">
              <!-- Allocate: matches unassigned volunteers to schools (draft only, nothing is visible to volunteers yet).
                   Disabled while a run is in progress. title = the tooltip shown on hover. -->
              <button
                class="btn btn-brand"
                :disabled="runningAlloc"
                title="Match unassigned volunteers; accepted volunteers keep their school"
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
                <span class="badge text-bg-light ms-1" title="Unpublished drafts">{{
                  draftCount
                }}</span>
              </button>
              <!-- Reset is tucked into a ... menu so it cannot be clicked by accident (Bootstrap's JS handles the dropdown) -->
              <div class="dropdown">
                <button
                  class="btn btn-outline-secondary"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-label="More actions"
                >
                  <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                  <li>
                    <button
                      class="dropdown-item text-danger"
                      :disabled="runningAlloc"
                      data-testid="alloc-reset"
                      @click="runAllocation(true)"
                    >
                      <!-- runAllocation(true) = Reset: erases EVERYTHING; it still asks for confirmation first -->
                      Reset
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Three message boxes: red = the last error, green = a confirmation (e.g. "is now visible to volunteers"),
               blue = Allocate is running. Each shows only while its value in the script is set. -->
          <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">
            {{ errorMessage }}
          </div>
          <div v-if="notice" class="alert alert-success py-2" role="status">{{ notice }}</div>
          <div v-if="runningAlloc" class="alert alert-info py-2" role="alert">Allocating...</div>

          <!-- Stat chips: Schools, Accepted, Pending, Declined, Withdrawn, Unassigned (counts for the selected show).
               Drawn with one v-for over statChips. Bootstrap columns: col-4 = 3 per row on phones, col-md-2 = all 6 on
               one row from tablet up (a row is 12 columns wide). -->
          <div v-if="groupedAssignments[selectedShow]" class="row g-1 mb-2 alloc-chips">
            <div v-for="chip in statChips" :key="chip.label" class="col-4 col-md-2">
              <div class="card-hw py-1 px-0 text-center">
                <div class="fs-6 fw-semibold">{{ chip.value }}</div>
                <div class="chip-label text-muted-hw">{{ chip.label }}</div>
              </div>
            </div>
          </div>

          <!-- Search box + "Needs Volunteers" switch + Expand/Collapse all.
               v-model keeps each control in sync with searchbar / needsOnly in the script, and the card list filters
               itself (see visibleSchools). The last button flips between "Expand all" and "Collapse all" using allOpen. -->
          <div class="d-flex flex-wrap align-items-center gap-2 mb-0">
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
            <button
              type="button"
              class="btn btn-link btn-sm text-decoration-none ms-auto px-0"
              @click="setAllSchools(!allOpen)"
            >
              <i
                class="bi"
                :class="allOpen ? 'bi-chevron-double-up' : 'bi-chevron-double-down'"
              ></i>
              {{ allOpen ? 'Collapse all' : 'Expand all' }}
            </button>
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
                    <span class="flex-grow-1 text-truncate">{{ volunteer.name }}</span>
                    <a class="small" :href="`tel:${volunteer.phone}`">{{ volunteer.phone }}</a>
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
                  : 'No schools or volunteers match.'
              }}
            </p>
            <!-- SCHOOL CARDS: one per school in visibleSchools (so the search and the "Needs Volunteers" filter apply).
                 The id lets selectSchool() (a map-pin click) scroll to the card. is-open marks an open card (the phone CSS
                 uses it); alloc-flash is the brief highlight after a pin click. -->
            <div
              v-for="school in visibleSchools"
              :key="school._id"
              :id="`school-${school._id}`"
              class="school-card card-hw px-2 px-md-3 py-2 mb-2"
              :class="{
                'alloc-flash': highlightedId === school._id,
                'is-open': openSchools[school._id],
              }"
            >
              <!-- Heading + button together (same pattern as Bootstrap's accordion): clicking the title row calls
                   toggleSchool(), which opens or closes the card and zooms the map. Right side: places filled / needed. -->
              <h2 class="h5 mb-0">
                <button
                  type="button"
                  class="school-head"
                  :aria-expanded="!!openSchools[school._id]"
                  @click="toggleSchool(school)"
                >
                  <span class="text-truncate">
                    {{ school.name }}
                    <small class="d-block fw-normal text-muted-hw card-time"
                      ><i class="bi bi-clock me-1"></i>{{ school.reportingTime }}</small
                    >
                  </span>
                  <span class="d-flex align-items-center gap-2 text-nowrap">
                    {{ filledCount(school) }}/{{ school.p5Classes }}
                    <i class="bi bi-chevron-down chevron" aria-hidden="true"></i>
                  </span>
                </button>
              </h2>

              <!-- Capacity bar (green = full, amber = partly filled, red = empty) and one badge per status, e.g. "3 Accepted".
                   Always visible, so the admin can scan the list without opening any card. -->
              <div
                class="progress my-2"
                role="progressbar"
                aria-label="Places filled"
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

              <!-- The volunteer list: closed until the title is clicked (class "open" comes from openSchools). -->
              <div class="vol-collapse" :class="{ open: openSchools[school._id] }">
                <div class="vol-collapse-inner">
                  <div
                    v-for="volunteer in school.volunteers"
                    :key="volunteer._id || volunteer.phone"
                    class="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-top"
                  >
                    <span>
                      <!-- One row per volunteer. "Draft" = not published yet (volunteers cannot see it); the coloured badge is their
                           status; the distance is from the volunteer's home to the school (empty when unknown). -->
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
                      {{ volunteer.name }} ({{ volunteer.phone }})
                    </span>
                    <span class="small text-muted-hw text-nowrap">{{
                      volunteer.distance != null ? volunteer.distance + ' km' : ''
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </aside>
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
/* Brief highlight (a blue outline) on the card a map click just opened; removed after about 1.2 seconds by the script */
.alloc-flash {
  box-shadow: 0 0 0 2px var(--bs-primary);
}
/* Phones only (under 768px): a collapsed card shows just name + count + capacity bar, so more schools fit on
   the screen. The reporting time and the status badges appear once the card is opened (class is-open). */
@media (max-width: 767.98px) {
  .school-card:not(.is-open) .card-time,
  .school-card:not(.is-open) .card-meta {
    display: none;
  }
}
/* THE FLOATING PANEL. Over the full-screen map: a card on the left for tablet/desktop, a bottom sheet on phones.
   It is a flex column: the header stays put and only the list inside (.alloc-panel-scroll) scrolls.
   Widths: 340px on tablet (this rule), 420px on desktop and wider (the 992px rule below), full width on
   phones. If you change a width here, change the same number in fitPadding() in the script. */
.alloc-panel {
  position: absolute;
  z-index: 1100; /* above Leaflet's own layers (they go up to 1000) */
  top: 12px;
  left: 12px;
  bottom: 12px;
  width: min(340px, calc(100% - 24px)); /* tablet default; desktop widens it below */
  display: flex;
  flex-direction: column;
  background: var(--hw-surface);
  color: var(--hw-text);
  border-radius: var(--hw-radius);
  box-shadow: var(--hw-shadow);
  overflow: hidden;
}
/* Top part of the panel (header, messages, chips, filters) */
.alloc-panel-head {
  flex: 0 0 auto; /* header and filters never shrink or scroll away */
  padding: 12px 12px 8px;
}
/* Bottom part of the panel: the list of cards */
.alloc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0; /* lets the flex child scroll instead of growing */
  overflow-y: auto;
  padding: 0 12px 12px;
}
/* Chip captions are tiny on phones so all the chips fit */
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
/* Hide-panel button in the panel's top-right corner, and the button that brings the panel back */
.alloc-hide {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
}
.alloc-reopen {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
}
/* Let the search box shrink and grow to share its row with the switch and the Expand all button */
.alloc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}
/* The default zoom buttons sit top-left, which is under the panel: move them to the top-right */
.alloc-stage :deep(.leaflet-top.leaflet-left) {
  left: auto;
  right: 0;
}

/* Desktop (992px and wider): a wider panel (keep in step with fitPadding() in the script) */
@media (min-width: 992px) {
  .alloc-panel {
    width: min(420px, calc(100% - 24px)); /* desktop */
  }
}

@media (max-width: 767.98px) {
  /* PHONES (under 768px): the panel becomes a bottom sheet taking 55% of the screen height, and the map's
     bottom controls (the OneMap credit) ride above it. 55vh must match fitPadding() in the script. */
  .alloc-stage.sheet-open {
    --map-inset-bottom: 55vh; /* lift the credit above the sheet only while the sheet is open */
  }
  .alloc-panel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: 55vh;
    border-radius: var(--hw-radius) var(--hw-radius) 0 0;
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
</style>
