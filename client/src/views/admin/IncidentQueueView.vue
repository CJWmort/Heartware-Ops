<!-- The admin Incident Queue (F5): the reported incidents of one NE Show (picked in the show
     dropdown), sorted by status and severity, shown as a list and as pins on a map, with
     Acknowledge and Resolve actions. -->

<script setup>
// Loads incidents, updates live over the socket, filters and sorts them, plots the pins and handles
// Acknowledge, Resolve (needs a note) and the popups.

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseMap from '@/components/map/BaseMap.vue'
import { listIncidents, listTemplates, updateIncidentStatus } from '@/services/incidents'
import IncidentCard from '@/components/incident/IncidentCard.vue'
import IncidentFocusCard from '@/components/incident/IncidentFocusCard.vue'
import MapNotice from '@/components/map/MapNotice.vue'
import MapLoading from '@/components/map/MapLoading.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import AppDropdown from '@/components/common/AppDropdown.vue'
import { connectSocket } from '@/services/socket'
import { getSavedShow, saveShow, getSavedFilter, saveFilter } from '@/services/selected-show'
import { tipCard, bindTip, createIncidentIcon } from '@/utils/map-icons'

const incidents = ref([])
const shows = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const selectedShow = ref(shows.includes(getSavedShow()) ? getSavedShow() : 'NE Show 1')
const showDropdownOptions = shows.map((show) => ({ value: show, label: show }))
const templatesByType = ref({})
const selectedId = ref(null)
const searchbar = ref('')
// Start with the "New" chip pressed, so the first load highlights the New stats button and
// lists only new incidents. Pressing a chip again (toggleStatus) clears the filter to show all.
const statusFilter = ref('new')
const panelOpen = ref(true)
const showResolved = ref(false)

const loading = ref(true)
const popup = ref(null)
let popupTimer = null
// showPopup(type, title, text, ms) - shows a temporary popup (red icon for errors, green tick
// otherwise) and hides it after ms (6 seconds by default). dismissPopup() hides it at once.
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
// dismissPopup() - hide the popup now and cancel its timer.
function dismissPopup() {
  clearTimeout(popupTimer)
  popup.value = null
}

const confirmDialog = ref(null)
let confirmResolve = null
// askNote(options) - opens the ConfirmDialog (with a text box) and returns a Promise: the typed note
// on OK, null on Cancel. answerConfirm(ok, text) closes the dialog and resolves it.
function askNote(options) {
  return new Promise((resolve) => {
    confirmResolve = resolve
    confirmDialog.value = options
  })
}
// answerConfirm(ok, text) - the admin answered the dialog: close it and hand the typed note (or null
// if cancelled) back to the code that was waiting.
function answerConfirm(ok, text) {
  confirmDialog.value = null
  confirmResolve?.(ok ? text : null)
  confirmResolve = null
}

// labelOf(incident) - readable type name (for example "Student unwell"), falling back to the raw code.
function labelOf(incident) {
  return templatesByType.value[incident.type]?.label || incident.type
}

// selectedIncident (computed) - the selected incident, or null if none or if it no longer exists.
const selectedIncident = computed(
  () => incidents.value.find((i) => i._id === selectedId.value) || null,
)

// stats (computed) - how many incidents are new, acknowledged and resolved. statChips (below) lists
// them for the three chip buttons.
const stats = computed(() => {
  const s = { new: 0, acknowledged: 0, resolved: 0 }
  for (const incident of incidents.value) {
    if (incident.status in s) s[incident.status]++
  }
  return s
})
// The same numbers as a list, so the template can draw the chips with one v-for.
const statChips = computed(() => [
  { key: 'new', label: 'New', value: stats.value.new },
  { key: 'acknowledged', label: 'Acknowledged', value: stats.value.acknowledged },
  { key: 'resolved', label: 'Resolved', value: stats.value.resolved },
])

// toggleStatus(key) - pressing a chip filters the list by that status; pressing it again clears the
// filter.
function toggleStatus(key) {
  statusFilter.value = statusFilter.value === key ? '' : key
}

const sortBy = ref(getSavedFilter('inc-sort', 'priority'))

const sortOptions = [
  { value: 'priority', label: 'Priority (default)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'severityHigh', label: 'Severity: High → Low' },
  { value: 'severityLow', label: 'Severity: Low → High' },
  { value: 'schoolAZ', label: 'School A–Z' },
  { value: 'schoolZA', label: 'School Z–A' },
  { value: 'typeAZ', label: 'Incident type A–Z' },
  { value: 'reporterAZ', label: 'Reporter A–Z' },
]

if (!sortOptions.some((o) => o.value === sortBy.value)) sortBy.value = 'priority'
// watch(sortBy) - remember the sort choice.
watch(sortBy, (v) => saveFilter('inc-sort', v))

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

// Each sorter is a "compare" function: it returns a negative number if `a` goes first, a positive
// number if `b` goes first, and 0 if they tie.
const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
const sorters = {
  priority: null,
  newest: byNewest,
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  severityHigh: (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  severityLow: (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  schoolAZ: (a, b) => (a.school || '').localeCompare(b.school || ''),
  schoolZA: (a, b) => (b.school || '').localeCompare(a.school || ''),
  typeAZ: (a, b) => labelOf(a).localeCompare(labelOf(b)),
  reporterAZ: (a, b) => (a.volunteer?.name || '').localeCompare(b.volunteer?.name || ''),
}

const typeFilter = ref(getSavedFilter('inc-type'))
const severityFilter = ref(getSavedFilter('inc-severity'))
const schoolFilter = ref(getSavedFilter('inc-school'))

if (!['', 'high', 'medium', 'low'].includes(severityFilter.value)) severityFilter.value = ''
// watch(typeFilter) - remember the type filter.
watch(typeFilter, (v) => saveFilter('inc-type', v))
// watch(severityFilter) - remember the severity filter.
watch(severityFilter, (v) => saveFilter('inc-severity', v))
// watch(schoolFilter) - remember the school filter.
watch(schoolFilter, (v) => saveFilter('inc-school', v))

// typeOptions, schoolOptions and the three filter option lists (computed) - the choices in the
// dropdowns; schools are the distinct names in the data, A to Z.
const typeOptions = computed(() =>
  Object.entries(templatesByType.value).map(([code, t]) => ({
    value: code,
    label: t.label || code,
  })),
)

// Options for the School dropdown: every distinct school in the incident list, A–Z. A Set keeps each
// name only once; filter(Boolean) drops empty/missing names.
const schoolOptions = computed(() =>
  [...new Set(incidents.value.map((i) => i.school).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  ),
)

// typeFilterOptions (computed) - the type dropdown list: "All types" plus each type.
const typeFilterOptions = computed(() => [{ value: '', label: 'All types' }, ...typeOptions.value])
const severityFilterOptions = [
  { value: '', label: 'All severities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
// schoolFilterOptions (computed) - the school dropdown list: "All schools" plus each school name.
const schoolFilterOptions = computed(() => [
  { value: '', label: 'All schools' },
  ...schoolOptions.value.map((name) => ({ value: name, label: name })),
])

// activeFilterCount (computed) and clearFilters() - how many dropdown filters are on, and the Clear
// button that resets all three.
const activeFilterCount = computed(
  () => [typeFilter.value, severityFilter.value, schoolFilter.value].filter(Boolean).length,
)

// Called by the Clear button: put all three dropdowns back to "All".
function clearFilters() {
  typeFilter.value = ''
  severityFilter.value = ''
  schoolFilter.value = ''
}

// matchesFilters(incident) - true when the incident passes all three dropdowns (an empty dropdown
// always passes).
function matchesFilters(incident) {
  return (
    (!typeFilter.value || incident.type === typeFilter.value) &&
    (!severityFilter.value || incident.severity === severityFilter.value) &&
    (!schoolFilter.value || incident.school === schoolFilter.value)
  )
}

// visibleIncidents (computed) - the cards listed. 1) the dropdown filters always apply 2) with an
// empty search the pressed status chip applies 3) with search text the chip is ignored and the text is
// matched against school, type name, note and volunteer name 4) then the chosen sort is applied to a
// copy of the list.
const visibleIncidents = computed(() => {
  const q = searchbar.value.trim().toUpperCase()
  const filtered = incidents.value.filter((incident) => {
    if (!matchesFilters(incident)) return false
    if (!q) return !statusFilter.value || incident.status === statusFilter.value
    return (
      (incident.school || '').toUpperCase().includes(q) ||
      labelOf(incident).toUpperCase().includes(q) ||
      (incident.note || '').toUpperCase().includes(q) ||
      (incident.volunteer?.name || '').toUpperCase().includes(q)
    )
  })
  const compare = sorters[sortBy.value]
  if (!compare) return filtered
  return [...filtered].sort((a, b) => compare(a, b) || byNewest(a, b))
})

// highlightedStatuses (computed) - which stat chips should light up.
// 1) No search text: only the chip the admin pressed (same as before).
// 2) Search text: every status that appears in the search results, so the admin can see at a
//    glance which statuses the matching incidents are in (a Set keeps each status once).
const highlightedStatuses = computed(() => {
  if (!searchbar.value.trim()) return statusFilter.value ? [statusFilter.value] : []
  return [...new Set(visibleIncidents.value.map((incident) => incident.status))]
})

let mapRef = null
let leafletRef = null
let incidentLayer = null
let homeView = null
let hasFitted = false

// onMapReady(map, L) - BaseMap is ready: move the zoom buttons bottom right, a tap on the map clears
// the selection, create the pin layer and draw the pins.
function onMapReady(map, L) {
  mapRef = map
  leafletRef = L
  map.zoomControl?.setPosition('bottomright')
  map.on('click', clearSelection)
  incidentLayer = L.layerGroup().addTo(map)
  plotIncidents()
}

// fitPadding() - padding that keeps pins out from under the focus card: desktop 420px card, tablet
// 340px, phone 45 percent of the height (must match IncidentFocusCard CSS).
function fitPadding() {
  if (selectedId.value === null) return { padding: [30, 30] }
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] }
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] }
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.45 + 30] }
}

// locatedPoints() - [lat, lng] of every unresolved incident that has valid coordinates (resolved ones
// have no pin by default, so they do not stretch the first view).
function locatedPoints() {
  return incidents.value
    .filter((i) => i.status !== 'resolved')
    .filter((i) => typeof i.location?.lat === 'number' && typeof i.location?.lng === 'number')
    .map((i) => [i.location.lat, i.location.lng])
}

// fitOverview() - fit the map to all pins (max zoom 15) and remember that view as the overview.
function fitOverview() {
  const points = locatedPoints()
  if (!mapRef || !points.length) return
  mapRef.invalidateSize()
  mapRef.fitBounds(points, { ...fitPadding(), animate: false, maxZoom: 15 })
  homeView = { center: mapRef.getCenter(), zoom: mapRef.getZoom() }
}

// focusIncident(incident) - zoom to one incident's pin (max zoom 16), clear of the focus card.
function focusIncident(incident) {
  const { lat, lng } = incident.location || {}
  if (!mapRef || typeof lat !== 'number' || typeof lng !== 'number') return
  mapRef.fitBounds([[lat, lng]], { ...fitPadding(), maxZoom: 16 })
}

// resetMapView() - glide back to the overview unless already there.
function resetMapView() {
  if (!mapRef || !homeView) return
  const atHome =
    mapRef.getZoom() === homeView.zoom && mapRef.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return
  mapRef.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// toneOf(incident) - the colour group for the hover card: green when resolved, otherwise high red,
// medium amber, low blue.
function toneOf(incident) {
  if (incident.status === 'resolved') return 'live'
  return { high: 'offline', medium: 'stale', low: 'me' }[incident.severity] || 'me'
}

// plotIncidents() - redraw all pins. 1) clear the layer 2) skip resolved incidents unless the Resolved
// pill is on or that one is selected 3) skip incidents without valid coordinates 4) build the pin icon
// (colour from severity and status, ring when selected, lighter when another is selected) 5) add a
// hover card and a click that selects it 6) fit the overview once when the first pins appear.
function plotIncidents() {
  if (!mapRef || !leafletRef) return
  incidentLayer.clearLayers()

  incidents.value.forEach((incident) => {
    if (incident.status === 'resolved' && !showResolved.value && incident._id !== selectedId.value)
      return
    const { lat, lng } = incident.location || {}
    if (typeof lat !== 'number' || typeof lng !== 'number') return

    const icon = templatesByType.value[incident.type]?.icon || 'bi-exclamation-circle-fill'
    const pin = createIncidentIcon({
      icon,
      severity: incident.severity,
      status: incident.status,
      selected: incident._id === selectedId.value,
      dimmed: selectedId.value !== null && incident._id !== selectedId.value,
    })
    const marker = leafletRef.marker([lat, lng], {
      icon: pin,
      zIndexOffset: incident._id === selectedId.value ? 1000 : 0,
    })
    bindTip(
      marker,
      tipCard({
        icon,
        tone: toneOf(incident),
        title: `${labelOf(incident)} · ${incident.school || 'Unknown school'}`,
      }),
    )
    // marker click - clicking an incident pin selects that incident.
    marker.on('click', () => selectIncident(incident))
    marker.addTo(incidentLayer)
  })

  if (!hasFitted && locatedPoints().length) {
    fitOverview()
    hasFitted = true
  }
}

// selectIncident(incident) - select it, close the list and zoom to its pin.
function selectIncident(incident) {
  selectedId.value = incident._id
  panelOpen.value = false
  focusIncident(incident)
}

// clearSelection() - unselect and zoom back out (does nothing if nothing is selected).
function clearSelection() {
  if (selectedId.value === null) return
  selectedId.value = null
  resetMapView()
}

// loadIncidents() - reload the selected show's incidents (the server filters by show and does the
// sorting) and redraw the pins; used after every change, every live event and every show change.
// A failure shows an error popup.
async function loadIncidents() {
  try {
    incidents.value = await listIncidents(undefined, selectedShow.value)
    plotIncidents()
  } catch (error) {
    showPopup('error', 'Could not load', error.friendlyMessage || 'Something went wrong.')
  }
}

// refreshQuietly() - reload the list without any popup and only redraw when something actually
// changed; errors are ignored.
async function refreshQuietly() {
  try {
    const fresh = await listIncidents(undefined, selectedShow.value)
    if (JSON.stringify(fresh) !== JSON.stringify(incidents.value)) {
      incidents.value = fresh
      plotIncidents()
    }
  } catch {}
}

const SAFETY_POLL_MS = 30000
let safetyTimer = null
// onTabVisible() - when the tab becomes visible again, refresh quietly.
function onTabVisible() {
  if (document.visibilityState === 'visible') refreshQuietly()
}

const statusBusy = ref(false)

// onAcknowledge(incident) - the Acknowledge button: ignored while busy; mark the incident
// acknowledged, reload and show "Acknowledged"; errors show a popup.
async function onAcknowledge(incident) {
  if (statusBusy.value) return
  statusBusy.value = true
  try {
    try {
      await updateIncidentStatus(incident._id, 'acknowledged')
    } catch (error) {
      showPopup('error', 'Acknowledge failed', error.friendlyMessage || 'Something went wrong.')
      return
    }
    await loadIncidents()
    showPopup('info', 'Acknowledged', 'The incident was marked as acknowledged.')
  } finally {
    statusBusy.value = false
  }
}

// onResolve(incident) - the Resolve button: ignored while busy; asks for the resolution note and
// finishes the resolve, then frees the busy flag.
async function onResolve(incident) {
  if (statusBusy.value) return
  statusBusy.value = true
  try {
    await resolveWithNote(incident)
  } finally {
    statusBusy.value = false
  }
}

// resolveWithNote(incident) - ask for a required resolution note in the dialog; cancelling or an empty
// note stops; otherwise mark the incident resolved with the note, reload and show "Resolved".
async function resolveWithNote(incident) {
  const note = await askNote({
    title: 'Resolve incident',
    text: 'Please include details on how it was resolved.',
    icon: 'bi-check-circle-fill',
    confirmText: 'Resolve',
    input: {
      label: 'Resolution details',
      placeholder: 'e.g. Student was taken to the first-aid room and recovered.',
      required: true,
    },
  })
  if (!note) return
  try {
    await updateIncidentStatus(incident._id, 'resolved', note)
  } catch (error) {
    showPopup('error', 'Resolve failed', error.friendlyMessage || 'Something went wrong.')
    return
  }
  await loadIncidents()
  showPopup('info', 'Resolved', 'The incident was marked as resolved.')
}

// watch - redraw pins when the selection or the Resolved pill changes.
watch(selectedId, plotIncidents)
// The "Resolved" pill was toggled: show or hide the green pins.
watch(showResolved, plotIncidents)

// watch(selectedShow) - another NE Show was picked: 1) remember it (shared with the Allocation
// board) 2) unselect the open incident 3) clear the School filter (each show has different schools)
// 4) let the map re-fit to the new pins 5) reload the list.
watch(selectedShow, (show) => {
  saveShow(show)
  selectedId.value = null
  schoolFilter.value = ''
  hasFitted = false
  loadIncidents()
})

let socket = null
// onMounted - connect the socket, listen for new and updated incidents and reconnects, start the
// safety refresh timer and tab-visible listener, then load incidents and templates together and set up
// the page from them.
onMounted(async () => {
  socket = connectSocket()
  socket.on('incident:new', loadIncidents)
  socket.on('incident:updated', loadIncidents)
  socket.io.on('reconnect', loadIncidents)
  safetyTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshQuietly()
  }, SAFETY_POLL_MS)
  document.addEventListener('visibilitychange', onTabVisible)
  try {
    const [list, templates] = await Promise.all([
      listIncidents(undefined, selectedShow.value),
      listTemplates(),
    ])
    templatesByType.value = Object.fromEntries(
      templates.map((template) => [template.type, template]),
    )
    incidents.value = list
    if (typeFilter.value && !templatesByType.value[typeFilter.value]) typeFilter.value = ''
    if (schoolFilter.value && !schoolOptions.value.includes(schoolFilter.value))
      schoolFilter.value = ''
    plotIncidents()
  } catch (error) {
    showPopup('error', 'Could not load', error.friendlyMessage || 'Something went wrong.')
  } finally {
    loading.value = false
  }
})
// onUnmounted - remove the socket listeners, timers and tab listener.
onUnmounted(() => {
  socket?.off('incident:new', loadIncidents)
  socket?.off('incident:updated', loadIncidents)
  socket?.io.off('reconnect', loadIncidents)
  clearInterval(safetyTimer)
  document.removeEventListener('visibilitychange', onTabVisible)
  clearTimeout(popupTimer)
})
</script>

<template>
  <!-- The toolbar with the shared dropdowns, the stat chips, the incident list, the focus card,
       the map and the popups. -->
  <div class="map-page">
    <div class="map-stage inc-stage" :class="{ 'focus-open': selectedIncident && !panelOpen }">
      <BaseMap testid="incident-map" :zoom="12" @ready="onMapReady" />

      <Transition name="inc-fade">
        <MapLoading v-if="loading" class="inc-loading" text="Fetching Incidents..." />
      </Transition>

      <button
        v-if="!panelOpen && !selectedIncident"
        type="button"
        class="btn btn-primary shadow inc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Live Incidents
      </button>

      <button
        v-if="!panelOpen"
        type="button"
        class="btn shadow inc-resolved-pill"
        :class="showResolved ? 'btn-success' : 'btn-light'"
        :aria-pressed="showResolved"
        data-testid="inc-toggle-resolved"
        @click="showResolved = !showResolved"
      >
        <i class="bi me-1" :class="showResolved ? 'bi-eye-fill' : 'bi-eye-slash'"></i>Resolved
        <span class="badge text-bg-light">{{ stats.resolved }}</span>
      </button>

      <Transition name="inc-panel-fade">
        <aside v-show="panelOpen" class="inc-panel">
          <div class="inc-panel-head">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <h1 class="h4 mb-0">Incidents</h1>
              </div>
              <button
                type="button"
                class="btn btn-outline-primary"
                title="Hide the list and show the map"
                data-testid="inc-show-map"
                @click="panelOpen = false"
              >
                <i class="bi bi-map me-1"></i>Map
              </button>
            </div>

            <div class="row g-1 mb-2 inc-chips">
              <div v-for="chip in statChips" :key="chip.key" class="col-4">
                <button
                  type="button"
                  class="stat-btn card-hw py-1 px-0 text-center w-100"
                  :class="{ 'is-active': highlightedStatuses.includes(chip.key) }"
                  :aria-pressed="statusFilter === chip.key && !searchbar.trim()"
                  :data-testid="`stat-${chip.key}`"
                  @click="toggleStatus(chip.key)"
                >
                  <div class="fs-6 fw-semibold">{{ chip.value }}</div>
                  <div class="chip-label text-muted-hw">{{ chip.label }}</div>
                </button>
              </div>
            </div>

            <div class="inc-filters">
              <div class="inc-filter-row d-flex flex-wrap align-items-center gap-2 mb-0">
                <AppDropdown
                  class="f-show"
                  v-model="selectedShow"
                  :options="showDropdownOptions"
                  icon="bi-calendar-event"
                  aria-label="Show"
                  testid="inc-show-select"
                  option-testid-prefix="inc-show-option-"
                />
                <input
                  type="search"
                  class="form-control search-box f-search"
                  placeholder="Search school, name, type or note"
                  data-testid="inc-search"
                  v-model="searchbar"
                />
                <AppDropdown
                  class="f-sort"
                  v-model="sortBy"
                  :options="sortOptions"
                  icon="bi-sort-down"
                  aria-label="Sort incidents"
                  testid="inc-sort"
                  menu-end
                />
              </div>

              <div class="inc-filter-row d-flex flex-wrap align-items-center gap-2 mt-2">
                <AppDropdown
                  class="f-type"
                  v-model="typeFilter"
                  :options="typeFilterOptions"
                  icon="bi-tag"
                  aria-label="Filter by incident type"
                  testid="filter-type"
                />

                <AppDropdown
                  class="f-severity"
                  v-model="severityFilter"
                  :options="severityFilterOptions"
                  icon="bi-exclamation-triangle"
                  aria-label="Filter by severity"
                  testid="filter-severity"
                />

                <AppDropdown
                  class="f-school"
                  v-model="schoolFilter"
                  :options="schoolFilterOptions"
                  icon="bi-building"
                  aria-label="Filter by school"
                  testid="filter-school"
                  grow
                  menu-end
                />

                <button
                  v-if="activeFilterCount"
                  type="button"
                  class="btn btn-sm btn-outline-secondary f-clear"
                  @click="clearFilters"
                >
                  Clear ({{ activeFilterCount }})
                </button>
              </div>
            </div>
          </div>

          <div class="inc-panel-scroll">
            <p v-if="visibleIncidents.length === 0" class="text-muted-hw">
              {{
                incidents.length === 0
                  ? `No incidents have been reported for ${selectedShow}.`
                  : statusFilter && !searchbar.trim()
                    ? `No ${statusFilter} incidents.`
                    : 'No incidents match.'
              }}
            </p>

            <div class="inc-grid" data-testid="queue-new">
              <IncidentCard
                v-for="incident in visibleIncidents"
                :key="incident._id"
                :id="`incident-${incident._id}`"
                :incident="incident"
                :template="templatesByType[incident.type]"
                :selected="selectedId === incident._id"
                @select="selectIncident"
              />
            </div>
          </div>
        </aside>
      </Transition>

      <IncidentFocusCard
        :incident="panelOpen ? null : selectedIncident"
        :template="selectedIncident ? templatesByType[selectedIncident.type] : null"
        @list="panelOpen = true"
        @clear="clearSelection"
        :busy="statusBusy"
        @acknowledge="onAcknowledge"
        @resolve="onResolve"
      />

      <MapNotice :notice="popup" @close="dismissPopup" />

      <ConfirmDialog :dialog="confirmDialog" @answer="answerConfirm" />
    </div>
  </div>
</template>

<style scoped>
/* Styles for the queue layout, the list and the map panels. */

.search-box {
  max-width: 24rem;
}
.inc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}

.inc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 8px;
  padding: 5px;
}
@media (min-width: 768px) {
  .inc-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.inc-panel {
  position: absolute;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background: var(--hw-surface);
  color: var(--hw-text);
}
.inc-panel-head {
  flex: 0 0 auto;
  padding: 12px max(12px, calc((100% - var(--hw-content-w)) / 2)) 8px;
}
.inc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 max(12px, calc((100% - var(--hw-content-w)) / 2)) 12px;
}

.inc-chips .chip-label {
  font-size: 0.7rem;
  line-height: 1.1;
  white-space: nowrap;
}
@media (min-width: 768px) {
  .inc-chips .chip-label {
    font-size: 0.75rem;
  }
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

.inc-stage .inc-loading {
  z-index: 1105;
}
.inc-fade-enter-active,
.inc-fade-leave-active {
  transition: opacity 0.5s ease;
}
.inc-fade-enter-from,
.inc-fade-leave-to {
  opacity: 0;
}
.inc-reopen {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
}

.inc-resolved-pill {
  position: absolute;
  z-index: 1100;
  top: 12px;
  right: 12px;
}

@media (max-width: 767.98px) {
  .inc-stage.focus-open {
    --map-inset-bottom: 45vh;
  }
}

.inc-panel-fade-enter-active,
.inc-panel-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.inc-panel-fade-enter-from,
.inc-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
@media (prefers-reduced-motion: reduce) {
  .inc-panel-fade-enter-active,
  .inc-panel-fade-leave-active {
    transition: none;
  }
}

@media (max-width: 767.98px) {
  .inc-filters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
      'show sort school'
      'search search search'
      'type severity clear';
    gap: 8px;
  }
  .inc-filter-row {
    display: contents !important;
  }
  .f-show {
    grid-area: show;
  }
  .f-sort {
    grid-area: sort;
  }
  .f-school {
    grid-area: school;
  }
  .f-search {
    grid-area: search;
    height: 40px;
  }
  .f-type {
    grid-area: type;
  }
  .f-severity {
    grid-area: severity;
  }
  .f-clear {
    grid-area: clear;
    height: 40px;
  }
  .inc-filters :deep(.show-btn) {
    width: 100%;
    height: 40px;
  }
  .inc-filters :deep(.show-btn > .bi:first-child:not(.show-chevron)) {
    display: none;
  }
  .inc-filters :deep(.show-menu) {
    min-width: 100%;
  }
}
</style>
