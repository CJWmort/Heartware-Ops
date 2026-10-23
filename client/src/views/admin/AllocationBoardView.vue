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
import { ref, computed, watch } from 'vue'
import axios from 'axios'
import BaseMap from '@/components/BaseMap.vue'
import { getSavedShow, saveShow } from '@/services/selected-show'
import { createSchoolIcon, createVolIcon, volTip, schoolTip, bindTip } from '@/utils/map-icons'

// The raw list from the server: one row per volunteer assignment. Only loadData() / runAllocation() change it.
const assignments = ref([])
const shows = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const selectedShow = ref(shows.includes(getSavedShow()) ? getSavedShow() : 'NE Show 1') // remembered for this session
watch(selectedShow, saveShow)
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
      (!q || s.name.toUpperCase().includes(q)) &&
      (!needsOnly.value || filledCount(s) < s.p5Classes),
  )
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

// ADDED: return to the zoomed-out starting view
function resetMapView() {
  if (!map || !homeView) return // map not ready yet: nothing to do
  const atHome = map.getZoom() === homeView.zoom && map.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return // already the overview: stay still
  map.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// ADDED: zoom the map to the school + its volunteers
function focusSchool(school) {
  if (!map || !L || !school.lat || !school.lng) return
  const pts = [[school.lat, school.lng]]
  for (const v of school.volunteers) if (v.lat && v.lng) pts.push([v.lat, v.lng])
  map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 })
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
async function loadData() {
  errorMessage.value = ''
  try {
    const response = await axios.get(API_URL + 'assignments')
    assignments.value = response.data
  } catch (error) {
    errorMessage.value = error.response?.data?.message || 'Could not load assignments.'
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
let homeView = null // ADDED: the zoomed-out starting view, so we can return to it

// ADDED: zoom the map so EVERY school of the selected show is visible and centred,
// then remember that view as the "overview" that resetMapView() returns to.
function fitOverview() {
  const data = groupedAssignments.value[selectedShow.value]
  if (!map || !data) return
  const pts = data.schools.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
  if (!pts.length) return
  map.invalidateSize() // make sure Leaflet knows the map's real size before fitting
  map.fitBounds(pts, { padding: [30, 30], animate: false })
  homeView = { center: map.getCenter(), zoom: map.getZoom() }
}

function onMapReady(m, leaflet) {
  map = m
  L = leaflet
  homeView = { center: m.getCenter(), zoom: m.getZoom() } // ADDED: remember the zoomed-out starting view

  markersGroup = L.layerGroup().addTo(map)
  linesGroup = L.layerGroup().addTo(map)
  // FIX: the map was empty on first load because it was only drawn when the dropdown changed.
  // Draw once here too, in case the assignments arrived before the map was ready.
  renderMapElements()
  fitOverview() // ADDED: was homeView = the fixed starting view; now fits all the schools in
}

// Redraws the whole map from scratch (it is cheap, and simpler than updating pins one by one).
//  1. Clear all old pins and lines.
//  2. Add a red pin for every school in the selected show (always shown).
//  3. For the FOCUSED school only, add a blue pin per volunteer plus a line from each volunteer to the school.
// It runs on first load, when the show changes, when data changes, and when the focused school changes
// (see the watch() below).
function renderMapElements() {
  if (!map || !L || !selectedShow.value) return

  const currentShowData = groupedAssignments.value[selectedShow.value]
  if (!currentShowData) return

  // 1. Clear both markers and connecting lines from previous renders
  if (markersGroup) markersGroup.clearLayers()
  if (linesGroup) linesGroup.clearLayers()

  currentShowData.schools.forEach((school) => {
    // Check school coordinates
    if (school.lat && school.lng) {
      // CHANGED: shared school badge + hover tooltip (same look as the Live Board)
      const schoolMarker = L.marker([school.lat, school.lng], { icon: createSchoolIcon() })
      bindTip(schoolMarker, schoolTip(school))
      markersGroup.addLayer(schoolMarker)

      // Loop through assigned volunteers
      // CHANGED: only the focused school (the one last clicked) shows its volunteers + lines
      if (focusedSchoolId.value !== school._id) {
        return
      }
      school.volunteers.forEach((vol) => {
        if (vol.lat && vol.lng) {
          // Add Volunteer Marker
          // CHANGED: round person badge coloured by status + hover tooltip
          const volMarker = L.marker([vol.lat, vol.lng], { icon: createVolIcon(vol.status) })
          bindTip(volMarker, volTip(vol))
          markersGroup.addLayer(volMarker)

          // 2. Draw connecting line between Volunteer and School
          const line = L.polyline(
            [
              [vol.lat, vol.lng], // Start: Volunteer coordinates
              [school.lat, school.lng], // End: School coordinates
            ],
            {
              color: '#0066ff', // Line color
              weight: 2, // Line thickness
              opacity: 0.3,
            },
          )

          linesGroup.addLayer(line)
        }
      })
    }
  })
}

// Re-draw the map whenever something it depends on changes: the chosen show, the loaded data,
// or which school is focused. { deep: true } makes it notice changes inside the data, not just replacement.
watch(
  // FIX: also watch groupedAssignments, so the map redraws when data loads or after Run (not only on a dropdown change)
  // CHANGED: also redraw when a card opens or closes
  [selectedShow, groupedAssignments, focusedSchoolId],
  () => {
    renderMapElements()
  },
  { deep: true }, // Ensures updates trigger when pushing or modifying array items
)

// ADDED: refit the overview when the show changes or the data (re)loads, but not while a school is zoomed in
watch([selectedShow, assignments], () => {
  if (focusedSchoolId.value === null) fitOverview()
})

loadData()
</script>

<template>
  <div>
    <!-- Header: title + show selector on the left, actions on the right -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
      <div class="d-flex flex-wrap align-items-center gap-3">
        <h1 class="h3 mb-0">Allocation</h1>
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
          Publish {{ selectedShow }}
          <span class="badge text-bg-light ms-1">{{ draftCount }} unpublished</span>
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
    <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">{{ errorMessage }}</div>
    <div v-if="notice" class="alert alert-success py-2" role="status">{{ notice }}</div>
    <div v-if="runningAlloc" class="alert alert-info py-2" role="alert">Allocating...</div>

    <!-- Stat chips -->
    <div v-if="groupedAssignments[selectedShow]" class="row g-2 mb-3">
      <div v-for="chip in statChips" :key="chip.label" class="col-4 col-md-2">
        <div class="card-hw p-2 text-center">
          <div class="fs-4 fw-semibold">{{ chip.value }}</div>
          <div class="small text-muted-hw">{{ chip.label }}</div>
        </div>
      </div>
    </div>

    <!-- Search + "needs volunteers" switch -->
    <div class="d-flex flex-wrap align-items-center gap-3 mb-3">
      <input
        type="text"
        class="form-control search-box"
        placeholder="School search"
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
        <i class="bi" :class="allOpen ? 'bi-chevron-double-up' : 'bi-chevron-double-down'"></i>
        {{ allOpen ? 'Collapse all' : 'Expand all' }}
      </button>
    </div>

    <div class="row g-3">
      <!-- Right column FIRST in the code so it shows first on phones; order-xl swaps it to the right on desktop -->
      <div class="col-12 col-xl-5 order-1 order-xl-2">
        <div class="alloc-side">
          <BaseMap :zoom="12" @ready="onMapReady" />
          <div v-if="groupedAssignments[selectedShow]" class="card-hw p-3 mt-3">
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
        </div>
      </div>

      <!-- School list -->
      <div class="col-12 col-xl-7 order-2 order-xl-1">
        <p v-if="!groupedAssignments[selectedShow]" class="text-muted-hw">
          There are no assignments. Press "Allocate" to create them.
        </p>
        <template v-else>
          <p v-if="visibleSchools.length === 0" class="text-muted-hw">No schools match.</p>
          <div v-for="school in visibleSchools" :key="school._id" class="card-hw p-3 mb-3">
            <!-- Heading + button together (same pattern as Bootstrap's accordion): click the title row to open or close the list -->
            <h2 class="h5 mb-0">
              <button
                type="button"
                class="school-head"
                :aria-expanded="!!openSchools[school._id]"
                @click="toggleSchool(school)"
              >
                <span>
                  {{ school.name }}
                  <small class="d-block fw-normal text-muted-hw"
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
            <div class="d-flex flex-wrap gap-1">
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
                  class="d-flex justify-content-between align-items-center gap-2 py-2 border-top"
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
/* Map and Unassigned list stay in view while you scroll the long school list (desktop only) */
@media (min-width: 1200px) {
  .alloc-side {
    position: sticky;
    top: 72px;
  }
}
/* A shorter map than the default 420px, so map + Unassigned fit on a laptop screen */
.alloc-side :deep(.map-container) {
  height: 320px;
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
