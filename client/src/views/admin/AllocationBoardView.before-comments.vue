<script setup>
// Feature 1b – Smart Allocation (coordinator board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
//
// HOW THIS PAGE WORKS (read this first)
// 1. loadData() asks the server for ALL assignments: one row per volunteer, saying which school (if any),
//    which show, their status (Pending / Accepted / Declined / Withdrawn) and whether it is published.
// 2. groupedAssignments turns that flat list into { show -> { schools -> volunteers, unassigned } }.
//    Everything on the page (stat chips, school cards, map pins) is read from this one grouped object.
// 3. The admin picks a show in the dropdown, so only that show's data is displayed.
// 4. "Allocate" asks the server to match volunteers to schools. The result is a DRAFT (published = false):
//    volunteers cannot see it yet. "Publish" makes it visible so they can accept or decline.
// 5. The map and the school cards are linked: the map always shows every school as a red pin, and shows
//    the volunteers (blue pins + lines) for ONE school only: the card you opened last (focusedSchoolId).
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/BaseMap.vue'
import { createSchoolIcon, createVolIcon, volTip, schoolTip, bindTip } from '@/utils/map-icons'

// The raw list from the server: one row per volunteer assignment. Only loadData() / runAllocation() change it.
const assignments = ref([])
const shows = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const selectedShow = ref('NE Show 1')
const searchbar = ref('')
const runningAlloc = ref(false)
const errorMessage = ref('') // NEW: shown in a red box, so a failed load/run no longer looks like "There are no assignments."
const publishing = ref(false) // NEW: disables the Publish button while the request is running
const notice = ref('') // NEW: green confirmation after publishing
// Reshapes the flat `assignments` list into something easy to display. A "computed" re-runs by itself
// whenever `assignments` changes, so the cards, chips and map update automatically.
// Result looks like: { 'NE Show 1': { schools: [{ ...school, volunteers: [...] }], unassigned: [...] }, ... }
const groupedAssignments = computed(() => {
  // Step 1: build { show: { schools: [...], unassigned: [...] } }
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
        published: a.published, // NEW: lets the board mark draft rows
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
    // plus status and distance, which belong to the assignment
    schoolEntry.volunteers.push({
      ...a.volunteer,
      status: a.status,
      distance: a.distance,
      published: a.published, // NEW: lets the board mark draft rows
    })
  }

  // Step 2: rebuild the object with the show names in order (NE Show 1, 2, 3, 4)
  const result = {}
  for (const show of Object.keys(byShow).sort()) {
    result[show] = byShow[show]
  }
  return result
})

const API_URL = '/api/'

// NEW: Declined / Withdrawn volunteers no longer fill a place, so they are not counted in "Capacity x/y"
// (otherwise a school would look full while it actually has an empty place)
function filledCount(school) {
  return school.volunteers.filter((v) => v.status !== 'Declined' && v.status !== 'Withdrawn').length
}

// NEW: Counts for stats for admin to glance for a selected NE Show only (Summary)
// Counts for the stat chips (selected show only)
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
const statChips = computed(() => [
  { label: 'Schools', value: stats.value.schools },
  { label: 'Accepted', value: stats.value.Accepted },
  { label: 'Pending', value: stats.value.Pending },
  { label: 'Declined', value: stats.value.Declined },
  { label: 'Withdrawn', value: stats.value.Withdrawn },
  { label: 'Unassigned', value: stats.value.unassigned },
])

// "Only schools that still need volunteers" switch + the filtered school list (search AND switch)
const needsOnly = ref(false)
const visibleSchools = computed(() => {
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return []
  const q = searchbar.value.trim().toUpperCase()
  return data.schools.filter(
    (s) =>
      // CHANGED: a school matches if its name OR any of its volunteers' name / phone matches
      (!q ||
        s.name.toUpperCase().includes(q) ||
        s.volunteers.some(
          (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
        )) &&
      (!needsOnly.value || filledCount(s) < s.p5Classes),
  )
})

// ADDED: when the search matches a VOLUNTEER inside a school, open that school's card so the person is visible.
// Schools matched by their own name stay closed. It only opens cards, never closes them.
watch(searchbar, (value) => {
  const q = value.trim().toUpperCase()
  if (!q) return
  for (const s of visibleSchools.value) {
    const nameMatch = s.name.toUpperCase().includes(q)
    const volunteerMatch = s.volunteers.some(
      (v) => (v.name || '').toUpperCase().includes(q) || String(v.phone || '').includes(q),
    )
    if (volunteerMatch && !nameMatch) openSchools.value[s._id] = true
  }
})

// Capacity bar: width in %, and colour (green = full, red = empty, amber = in between)
function capacityPercent(school) {
  return school.p5Classes
    ? Math.min(100, Math.round((filledCount(school) / school.p5Classes) * 100))
    : 0
}
function capacityClass(school) {
  const filled = filledCount(school)
  if (filled >= school.p5Classes) return 'bg-success'
  return filled === 0 ? 'bg-danger' : 'bg-warning'
}

// ---- CARDS <-> MAP: three pieces of state that work together ----
// openSchools   : which cards are expanded in the LIST (any number can be open). Only controls the list.
// focusedSchoolId: the ONE school whose volunteers are drawn on the MAP (the card opened most recently).
//                  null means "overview": only the red school pins are shown.
// openOrder     : the order cards were opened in, so closing the focused card can fall back to the
//                  previous one that is still open instead of jumping straight to the overview.
// Why separate? "Expand all" opens 45 cards, but drawing 260+ volunteers at once would clutter the map.
// NEW: Which school cards are open. Everything starts closed; clicking a school's title toggles it.
const openSchools = ref({}) // { [schoolId]: true }
// ADDED: the one school whose volunteers are shown on the map (null = schools only)
const focusedSchoolId = ref(null)
// ADDED: the card that flashes briefly after a map click, so your eye finds it after the list jumps
const highlightedId = ref(null)
// ADDED: true when every school currently shown is open (drives the toggle label)
const allOpen = computed(
  () =>
    visibleSchools.value.length > 0 && visibleSchools.value.every((s) => openSchools.value[s._id]),
)
// ADDED: order in which cards were opened (last = most recent), so closing a card can fall back to the previous one
const openOrder = ref([])
// ADDED: the Unassigned card starts collapsed; click its header to open it
const showUnassigned = ref(false)
// ADDED: Unassigned volunteers sorted A–Z by name (change the sort here)
const sortedUnassigned = computed(() => {
  const list = groupedAssignments.value[selectedShow.value]?.unassigned || []
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')) // copy first so the original isn't reordered
})

// Runs when a school card's header is clicked.
//  - Opening: remember the order, make this school the map's focus, zoom the map to it.
//  - Closing the focused card: fall back to the most recently opened card that is still open;
//    if none are left, clear the focus and zoom back out to the overview.
//  - Closing a card that is NOT the focused one: the map is left alone.
// CHANGED: now receives the whole school (not just its id) so the map can zoom to it, it will zoom back out when card is collapsed
function toggleSchool(school) {
  openSchools.value[school._id] = !openSchools.value[school._id]
  if (openSchools.value[school._id]) {
    openOrder.value.push(school._id) // ADDED: remember the order
    focusedSchoolId.value = school._id // map focuses on this school
    focusSchool(school) // opening: zoom to this school
  } else {
    openOrder.value = openOrder.value.filter((id) => id !== school._id) // ADDED: forget it
    if (focusedSchoolId.value === school._id) {
      // CHANGED: closed the focused card -> fall back to the last card still open
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

// ADDED: used when a school icon on the map is clicked
// Unlike toggleSchool, it will never close the card: clicking a icon always opens it (another way for admin to zoom in to zones to view schools)
// makes it the map's focus and zooms to it.
function selectSchool(school) {
  if (!visibleSchools.value.some((s) => s._id === school._id)) {
    needsOnly.value = false
    searchbar.value = ''
  }
  panelOpen.value = true
  if (!openSchools.value[school._id]) {
    openSchools.value[school._id] = true
    openOrder.value.push(school._id) // remember the order, as toggleSchool does
  }
  focusedSchoolId.value = school._id // map shows this school's volunteers
  focusSchool(school) // zoom to the school + its volunteers
  // ADDED: bring the opened card into view in the list
  nextTick(
    () =>
      document
        .getElementById(`school-${school._id}`)
        ?.scrollIntoView({ block: 'start', behavior: 'auto' }), // CHANGED: instant jump instead of awkward scrolling
  )
  // ADDED: flash the card for about 1.2 seconds
  highlightedId.value = school._id
  setTimeout(() => {
    if (highlightedId.value === school._id) highlightedId.value = null
  }, 1200)
}

// ADDED: return to the zoomed-out starting view
function resetMapView() {
  if (!map || !homeView) return // map not ready yet: nothing to do
  const atHome = map.getZoom() === homeView.zoom && map.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return // already the overview: stay still
  map.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// ADDED: the floating panel can be hidden (button in its corner) to see the whole map
const panelOpen = ref(window.matchMedia('(min-width: 768px)').matches)

// ADDED: the floating panel covers part of the map, so when fitting the map to some pins we leave that
// part empty (padding) and the pins land in the visible area. Desktop/tablet: panel on the left (about 420px).
// Phones: the panel is a bottom sheet (half the screen height).
function fitPadding() {
  const wide = window.matchMedia('(min-width: 768px)').matches
  if (!panelOpen.value) return { padding: [30, 30] } // panel hidden: the whole map is free
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] } // desktop: panel 420px
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] } // tablet: panel 340px
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.55 + 30] } // phone: sheet 55vh
}

// ADDED: zoom the map to the school + its volunteers
function focusSchool(school) {
  if (!map || !L || !school.lat || !school.lng) return
  const pts = [[school.lat, school.lng]]
  for (const v of school.volunteers) if (v.lat && v.lng) pts.push([v.lat, v.lng])
  map.fitBounds(pts, { ...fitPadding(), maxZoom: 15 }) // CHANGED: keep clear of the floating panel
}

// Expand all / Collapse all (only schools currently shown, so the search and the "needs volunteers" filter apply).
// It only changes the LIST. The map stays as the overview; if a school was zoomed in, it zooms back out.
// Optional: open or close every school currently shown (respects the search / filter)
function setAllSchools(open) {
  for (const s of visibleSchools.value) openSchools.value[s._id] = open
  openOrder.value = [] // ADDED: Expand all / Collapse all forget the opening order
  // CHANGED: only the touch the map if a school is currently zoomed in; else leave it alone
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

// CHANGED: added try/catch. Before, any failure (e.g. 403 when not admin) left the page saying "There are no assignments."
async function loadData(quiet = false) {
  if (!quiet) errorMessage.value = ''
  try {
    const response = await axios.get(API_URL + 'assignments')
    assignments.value = response.data
  } catch (error) {
    if (!quiet) errorMessage.value = error.response?.data?.message || 'Could not load assignments.'
  }
}

// CHANGED: was GET /run (anyone, even a link preview, could wipe the allocation); now a confirmed POST.
// reset = false: accepted volunteers keep their school, everyone else is matched to the open places.
// reset = true : erases EVERYTHING (including accepted) and starts again.
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
    // CHANGED: the run now answers { assignments, skippedShows }; published shows are locked and not re-run
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

// NEW (publish step): rows still marked as drafts (published = false) in the selected show
const draftCount = computed(() => {
  let n = 0
  for (const a of assignments.value) {
    if (a.show === selectedShow.value && !a.published) n++
  }
  return n
})

// NEW (publish step): volunteers only see an allocation after this. It lets the admin review the result first.
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

// ---- MAP ----
// These are plain variables (not ref) on purpose: Leaflet objects must not be wrapped by Vue's reactivity.
// BaseMap creates the Leaflet map and hands it to onMapReady(); we then draw our own pins on it.
// markersGroup / linesGroup are "layer groups": one clearLayers() call removes every pin / line we drew.
let L = null
let map = null
let markersGroup = null
let linesGroup = null
let volGroup = null // ADDED: its own layer for the focused school's volunteer pins (so school pins aren't redrawn)
let homeView = null // ADDED: the zoomed-out starting view, so we can return to it

// ADDED: zoom the map so EVERY school of the selected show is visible and centred,
// then remember that view as the "overview" that resetMapView() returns to.
function fitOverview() {
  const data = groupedAssignments.value[selectedShow.value]
  if (!map || !data) return
  const pts = data.schools.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
  if (!pts.length) return
  map.invalidateSize() // make sure Leaflet knows the map's real size before fitting
  map.fitBounds(pts, { ...fitPadding(), animate: false }) // CHANGED: keep clear of the floating panel
  homeView = { center: map.getCenter(), zoom: map.getZoom() }
}

function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  homeView = { center: m.getCenter(), zoom: m.getZoom() } // ADDED: remember the zoomed-out starting view

  markersGroup = L.layerGroup().addTo(map)
  linesGroup = L.layerGroup().addTo(map)
  volGroup = L.layerGroup().addTo(map) // ADDED: for volunteer pins only
  // FIX: the map was empty on first load because it was only drawn when the dropdown changed.
  // Draw once here too, in case the assignments arrived before the map was ready.
  renderMapElements()
  fitOverview() // ADDED: was homeView = the fixed starting view; now fits all the schools in
}

// Draws the school pins. Runs only when the data or the show changes, NOT on every click.
function renderSchools() {
  if (!map || !L || !selectedShow.value) return
  const data = groupedAssignments.value[selectedShow.value]
  if (!data) return
  markersGroup.clearLayers()
  data.schools.forEach((school) => {
    if (!school.lat || !school.lng) return
    const marker = L.marker([school.lat, school.lng], { icon: createSchoolIcon() })
    bindTip(marker, schoolTip(school))
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
    if (!vol.lat || !vol.lng) return
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

// Data or show changed: redraw everything. No { deep: true }: the data is replaced as a whole when it
// reloads (loadData / Allocate / Publish), so a plain watch is enough and Vue doesn't walk every property.
watch([selectedShow, groupedAssignments], renderMapElements)

// A different school got focus: redraw only its volunteers (about 8 pins, not 45 + 8)
watch(focusedSchoolId, renderVolunteers)

// ADDED: refit the overview when the show changes or the data (re)loads, but not while a school is zoomed in
// ADDED: when the panel is hidden or shown, the map's free area changes: refit the overview
watch(panelOpen, () => {
  nextTick(() => {
    if (focusedSchoolId.value === null) fitOverview()
  })
})
// This one only zooms out the first time, or when the admin picks a different show. A refresh leaves the map where it is.
let hasFitted = false
watch([selectedShow, assignments], ([newShow], [oldShow]) => {
  const showChanged = newShow !== oldShow
  if (focusedSchoolId.value === null && (showChanged || !hasFitted)) {
    fitOverview()
    hasFitted = true
  }
})
// Reload the data every 5 seconds so the admin sees volunteers' accepts/declines
let timer = null
onMounted(() => {
  timer = setInterval(() => {
    if (!runningAlloc.value && !publishing.value) loadData()
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
loadData()
</script>

<template>
  <!-- CHANGED: full-screen map layout (same pattern as the Live Board): the map fills the page under the navbar
       and the controls + school list float over it in a panel. map-page / map-stage come from map-ui.css. -->
  <div class="map-page">
    <div class="map-stage alloc-stage" :class="{ 'sheet-open': panelOpen }">
      <BaseMap :zoom="12" @ready="onMapReady" />

      <!-- Floating panel: header + filters stay put, only the list below scrolls -->
      <!-- ADDED: button to bring the panel back when it is hidden -->
      <button
        v-if="!panelOpen"
        type="button"
        class="btn btn-light shadow alloc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Allocation
      </button>

      <aside v-show="panelOpen" class="alloc-panel">
        <!-- ADDED: hide the panel to see the whole map -->
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary alloc-hide"
          aria-label="Hide panel"
          title="Hide panel"
          @click="panelOpen = false"
        >
          <i class="bi bi-chevron-bar-left"></i>
        </button>
        <div class="alloc-panel-head">
          <!-- Header: title + show selector on the left, actions on the right -->
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
              <!-- CHANGED: shorter label; title explains that accepted volunteers keep their school -->
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
                <!-- CHANGED: shorter (the show is already named in the dropdown); the count is the unpublished drafts -->
                Publish
                <span class="badge text-bg-light ms-1" title="Unpublished drafts">{{
                  draftCount
                }}</span>
              </button>
              <!-- Reset is tucked into a menu so it cannot be clicked by accident (Bootstrap's JS handles the dropdown) -->
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
                      <!-- CHANGED: shorter label (it still asks for confirmation before erasing) -->
                      Reset
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Same three messages as before -->
          <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">
            {{ errorMessage }}
          </div>
          <div v-if="notice" class="alert alert-success py-2" role="status">{{ notice }}</div>
          <div v-if="runningAlloc" class="alert alert-info py-2" role="alert">Allocating...</div>

          <!-- Stat chips -->
          <!-- CHANGED: all six chips on ONE row (col-2 = 1/6 of the width) to save height in the panel -->
          <div v-if="groupedAssignments[selectedShow]" class="row g-1 mb-2 alloc-chips">
            <div v-for="chip in statChips" :key="chip.label" class="col-4 col-md-2">
              <div class="card-hw py-1 px-0 text-center">
                <div class="fs-6 fw-semibold">{{ chip.value }}</div>
                <div class="chip-label text-muted-hw">{{ chip.label }}</div>
              </div>
            </div>
          </div>

          <!-- Search + "needs volunteers" switch -->
          <div class="d-flex flex-wrap align-items-center gap-2 mb-0">
            <input
              type="text"
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

        <div class="alloc-panel-scroll">
          <div v-if="groupedAssignments[selectedShow]" class="card-hw p-3 mb-3">
            <!-- ADDED: same accordion pattern as the school cards (heading + button, aria-expanded) -->
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
                    <!-- ADDED: round initial -->
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
          <p v-if="!groupedAssignments[selectedShow]" class="text-muted-hw">
            There are no assignments. Press "Allocate" to create them.
          </p>
          <template v-else>
            <!-- CHANGED: the search also looks at volunteers, so the message says so -->
            <p v-if="visibleSchools.length === 0" class="text-muted-hw">
              {{
                needsOnly && !searchbar.trim()
                  ? 'Every school has enough volunteers.'
                  : 'No schools or volunteers match.'
              }}
            </p>
            <!-- ADDED: each card gets an id so selectSchool() (map pin click) can scroll to it -->
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
              <!-- Heading + button together (same pattern as Bootstrap's accordion): click the title row to open or close the list -->
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

              <!-- Capacity bar + status summary: always visible, so you can scan without opening anything -->
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

              <!-- The volunteer list: closed until the title is clicked -->
              <div class="vol-collapse" :class="{ open: openSchools[school._id] }">
                <div class="vol-collapse-inner">
                  <div
                    v-for="volunteer in school.volunteers"
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
.search-box {
  max-width: 24rem;
}
.unassigned-list {
  max-height: 240px;
  overflow-y: auto;
}
/* ADDED: round initial for unassigned volunteers */
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
/* ADDED: the browser skips layout and paint for cards scrolled out of view */
.school-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 70px; /* rough height so the scrollbar doesn't jump */
}
/* ADDED: brief highlight on the card a map click just opened */
.alloc-flash {
  box-shadow: 0 0 0 2px var(--bs-primary);
}
/* ADDED: on phones a collapsed card shows only name + count + capacity bar.
   The time and status badges appear when the card is tapped open. */
@media (max-width: 767.98px) {
  .school-card:not(.is-open) .card-time,
  .school-card:not(.is-open) .card-meta {
    display: none;
  }
}
/* CHANGED: full-screen map layout. The panel floats over the map: a card on the left for tablet/desktop,
   a bottom sheet on phones. Only the list inside it scrolls. */
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
.alloc-panel-head {
  flex: 0 0 auto; /* header and filters never shrink or scroll away */
  padding: 12px 12px 8px;
}
.alloc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0; /* lets the flex child scroll instead of growing */
  overflow-y: auto;
  padding: 0 12px 12px;
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
/* hide-panel button in the panel's top-right corner, and the button that brings the panel back */
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
.alloc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}
/* The default zoom buttons sit top-left, which is under the panel: move them to the top-right */
.alloc-stage :deep(.leaflet-top.leaflet-left) {
  left: auto;
  right: 0;
}

@media (min-width: 992px) {
  .alloc-panel {
    width: min(420px, calc(100% - 24px)); /* desktop */
  }
}

@media (max-width: 767.98px) {
  /* phones: the panel becomes a bottom sheet, and the map's bottom controls (OneMap credit) ride above it */
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

/* The title row looks like normal text but is a full-width button */
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

/* Smooth open/close by animating the grid row height from 0fr to 1fr (no fixed heights needed) */
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

@media (prefers-reduced-motion: reduce) {
  .vol-collapse,
  .chevron {
    transition: none;
  }
}
</style>
