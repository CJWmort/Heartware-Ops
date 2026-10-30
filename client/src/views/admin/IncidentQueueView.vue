<script setup>
// =====================================================================================================
// Incident Queue (admin / HQ) — Feature 4 (F4)
// Same design as the Allocation board: one full-screen map with the incident list (the "menu") on top of it.
// Picking an incident collapses the menu, zooms the map to its pin and shows the focus card (left card on
// tablet/desktop, bottom sheet on phones) with the details and the Acknowledge / Resolve buttons.
// =====================================================================================================
//
// WHAT THIS PAGE DOES
// Volunteers report incidents from the field (a student unwell, a bus delayed...). The admin sees every
// incident here as a pin on the map and as a card in the list, and moves each one along:
//   new  ->  acknowledged  ->  resolved
//
// HOW IT WORKS
//  1. The incidents come from the server (listIncidents). `incidents` holds them, already sorted by the server.
//  2. Each incident is drawn twice: a pin on the map and a card in the menu. They are linked:
//       - click a CARD or a PIN -> the incident is selected, the menu collapses, the map zooms to its pin and the
//         focus card shows its details;
//       - tap empty map, or the X on the focus card -> unselect and zoom back out; "Incidents" brings the menu back.
//  3. The search box and the three stat buttons (New / Acknowledged / Resolved) filter the CARD LIST only (visibleIncidents).
//     The map shows a pin for every New / Acknowledged incident (a Resolved one only while it is selected), whatever the
//     filters say.
//  4. Live updates: the server tells admins about new / changed incidents over a socket, and the page re-loads
//     the list. The map is only fitted to the pins the FIRST time, so a live update never makes the map jump.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseMap from '@/components/map/BaseMap.vue'
import { listIncidents, listTemplates, updateIncidentStatus } from '@/services/incidents'
import IncidentCard from '@/components/incident/IncidentCard.vue'
import IncidentFocusCard from '@/components/incident/IncidentFocusCard.vue'
import MapNotice from '@/components/map/MapNotice.vue' // temporary status popup (same as the Allocation board)
import MapLoading from '@/components/map/MapLoading.vue' // NEW: dimmed overlay + spinner shown over the map while data is fetched
import ConfirmDialog from '@/components/common/ConfirmDialog.vue' // custom card instead of the browser's prompt()
import AppDropdown from '@/components/common/AppDropdown.vue' // reusable dropdown (replaces the four hand-built menus)
import { connectSocket } from '@/services/socket' // live updates
import { getSavedFilter, saveFilter } from '@/services/selected-show'
import { tipCard, bindTip, createIncidentIcon } from '@/utils/map-icons' // shared hover-card helpers (same as the Allocation and Live boards)

// ---------------------------------------------------------------------------------------------------
// 1. DATA (the page's "memory"). A `ref` is a box holding a value; when it changes, the screen updates.
// ---------------------------------------------------------------------------------------------------
const incidents = ref([]) // every incident from the server
const templatesByType = ref({}) // { STUDENT_UNWELL: {label, icon...}, BUS_DELAYED: {...}, ... } used for names and icons
const selectedId = ref(null) // _id of the selected incident (null = none); its pin is ringed and the focus card shows it
const searchbar = ref('') // text in the search box
const statusFilter = ref('') // which stat button is pressed: 'new' | 'acknowledged' | 'resolved' | '' (empty = show all)
// true = the full-screen incident list (the "menu") covers the map; false = the map is visible.
// Like the Allocation board, the menu starts open on every screen size: pick an incident first.
const panelOpen = ref(true)
// true = resolved incidents also get a pin on the map (pill at the top right of the map). Off by default.
const showResolved = ref(false)

// STATUS POPUP (same MapNotice popup as the Allocation board). Messages are temporary: they disappear after a few
// seconds, or when the close button is pressed.
// NEW: true until the FIRST load (incidents + templates) finishes, success or error. It drives the "Fetching..." overlay.
// Live updates (loadIncidents) never set it back to true, so the overlay does not flash on every socket event.
const loading = ref(true)
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

// RESOLVE-NOTE DIALOG (custom card instead of the browser's prompt(), same ConfirmDialog as the Allocation board).
// askNote() returns a promise: the typed note on OK, or null on Cancel.
const confirmDialog = ref(null) // the card's content, or null while closed
let confirmResolve = null
function askNote(options) {
  return new Promise((resolve) => {
    confirmResolve = resolve
    confirmDialog.value = options
  })
}
function answerConfirm(ok, text) {
  confirmDialog.value = null
  confirmResolve?.(ok ? text : null)
  confirmResolve = null
}

// ---------------------------------------------------------------------------------------------------
// 2. DERIVED DATA (computed: rebuilt automatically when what it reads changes)
// ---------------------------------------------------------------------------------------------------

// The readable name of an incident's type, e.g. "Student unwell". Falls back to the raw type code.
function labelOf(incident) {
  return templatesByType.value[incident.type]?.label || incident.type
}

// The selected incident (null if none, or if it no longer exists in the list).
const selectedIncident = computed(
  () => incidents.value.find((i) => i._id === selectedId.value) || null,
)

// Numbers for the three status chips.
const stats = computed(() => {
  const s = { new: 0, acknowledged: 0, resolved: 0 }
  for (const incident of incidents.value) {
    if (incident.status in s) s[incident.status]++ // `in` guards against an unexpected status name
  }
  return s
})
// The same numbers as a list, so the template can draw the chips with one v-for.
const statChips = computed(() => [
  { key: 'new', label: 'New', value: stats.value.new }, // key = the incident.status this button filters by
  { key: 'acknowledged', label: 'Acknowledged', value: stats.value.acknowledged },
  { key: 'resolved', label: 'Resolved', value: stats.value.resolved },
])

// Called when a stat button is clicked: pressing the active one again turns the filter off.
function toggleStatus(key) {
  statusFilter.value = statusFilter.value === key ? '' : key // same button again -> '' (show all)
}

// ---------------------------------------------------------------------------------------------------
// SORTING: which order the card list uses. 'priority' = keep the server's order (status > severity > newest).
// ---------------------------------------------------------------------------------------------------
const sortBy = ref(getSavedFilter('inc-sort', 'priority'))

// The dropdown options. `value` is the key into `sorters` below; `label` is what the admin sees.
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
watch(sortBy, (v) => saveFilter('inc-sort', v))

// Lower number = more urgent. Same ranking the server uses.
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

// Each sorter is a "compare" function: it returns a negative number if `a` goes first,
// a positive number if `b` goes first, and 0 if they tie.
const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt) // bigger (later) date first
const sorters = {
  priority: null, // null = do not re-sort, keep the order the server gave us
  newest: byNewest,
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt), // reverse of newest
  severityHigh: (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  severityLow: (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  // localeCompare compares text alphabetically; (x || '') guards against a missing value
  schoolAZ: (a, b) => (a.school || '').localeCompare(b.school || ''),
  schoolZA: (a, b) => (b.school || '').localeCompare(a.school || ''),
  typeAZ: (a, b) => labelOf(a).localeCompare(labelOf(b)),
  reporterAZ: (a, b) => (a.volunteer?.name || '').localeCompare(b.volunteer?.name || ''),
}

// ---------------------------------------------------------------------------------------------------
// FILTERS: dropdowns that let the admin narrow the card list. '' (empty) = "All", i.e. no filtering on that field.
// ---------------------------------------------------------------------------------------------------
const typeFilter = ref(getSavedFilter('inc-type')) // an incident type code, e.g. 'BUS_DELAYED'
const severityFilter = ref(getSavedFilter('inc-severity')) // 'high' | 'medium' | 'low'
const schoolFilter = ref(getSavedFilter('inc-school')) // a school name

// Options for the Type dropdown. Built from templatesByType so the names match the cards ("Bus delayed", not "BUS_DELAYED").
if (!['', 'high', 'medium', 'low'].includes(severityFilter.value)) severityFilter.value = ''
watch(typeFilter, (v) => saveFilter('inc-type', v))
watch(severityFilter, (v) => saveFilter('inc-severity', v))
watch(schoolFilter, (v) => saveFilter('inc-school', v))

const typeOptions = computed(() =>
  Object.entries(templatesByType.value).map(([code, t]) => ({ value: code, label: t.label || code })),
)

// Options for the School dropdown: every distinct school in the incident list, A–Z.
// A Set keeps each name only once; filter(Boolean) drops empty/missing names.
const schoolOptions = computed(() =>
  [...new Set(incidents.value.map((i) => i.school).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
)

const typeFilterOptions = computed(() => [{ value: '', label: 'All types' }, ...typeOptions.value])
const severityFilterOptions = [
  { value: '', label: 'All severities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
const schoolFilterOptions = computed(() => [
  { value: '', label: 'All schools' },
  ...schoolOptions.value.map((name) => ({ value: name, label: name })),
])

// Each dropdown below is an <AppDropdown>: it keeps its own open/closed state and closes itself on an outside click,
// so the page only needs the options and the v-model value (sortBy, typeFilter, severityFilter, schoolFilter).

// How many of the three dropdowns are in use (drives the "Clear" button and its badge).
const activeFilterCount = computed(
  () => [typeFilter.value, severityFilter.value, schoolFilter.value].filter(Boolean).length,
)

// Called by the Clear button: put all three dropdowns back to "All".
function clearFilters() {
  typeFilter.value = ''
  severityFilter.value = ''
  schoolFilter.value = ''
}

// True when an incident passes all three dropdowns. An empty dropdown always passes.
function matchesFilters(incident) {
  return (
    (!typeFilter.value || incident.type === typeFilter.value) &&
    (!severityFilter.value || incident.severity === severityFilter.value) &&
    (!schoolFilter.value || incident.school === schoolFilter.value)
  )
}

// The incidents whose cards are listed.
// - Search box EMPTY: the pressed stat button (if any) keeps only that status.
// - Search box HAS TEXT: the stat button is ignored, so the search looks through ALL statuses
//   (typing a name should find the incident even if the "New" button is pressed).
// The search looks at the school name, the incident type name, the reporter's note and the volunteer's name.
const visibleIncidents = computed(() => {
  const q = searchbar.value.trim().toUpperCase() // upper-case both sides so capitals are ignored
  const filtered = incidents.value.filter((incident) => {
    if (!matchesFilters(incident)) return false // NEW: the dropdown filters apply first, whether or not the admin is searching
    if (!q) return !statusFilter.value || incident.status === statusFilter.value // no search: only the pressed button's status (or all)
    return (
      (incident.school || '').toUpperCase().includes(q) ||
      labelOf(incident).toUpperCase().includes(q) ||
      (incident.note || '').toUpperCase().includes(q) ||
      (incident.volunteer?.name || '').toUpperCase().includes(q) // NEW: volunteer name; ?. = safe if the volunteer is missing
    )
  })
  const compare = sorters[sortBy.value]
  if (!compare) return filtered // default: keep the server's order
  // [...filtered] makes a copy, because .sort() changes the array it is called on.
  // `compare(a, b) || byNewest(a, b)`: if the chosen sort ties (returns 0), fall back to newest first
  return [...filtered].sort((a, b) => compare(a, b) || byNewest(a, b))
})

// ---------------------------------------------------------------------------------------------------
// 3. MAP VARIABLES
// Plain variables (not ref) on purpose: Leaflet objects must not be wrapped by Vue's reactivity.
// BaseMap creates the map and hands it to onMapReady(); we then draw our own pins on it.
//   mapRef        : the Leaflet map          leafletRef : the Leaflet library (L)
//   incidentLayer : a "layer group" holding every pin, so one clearLayers() call removes them all
//   homeView      : the zoomed-out overview ({ center, zoom }) that resetMapView() returns to
//   hasFitted     : true after the map was fitted to the pins once (we never refit on live updates)
// ---------------------------------------------------------------------------------------------------
let mapRef = null
let leafletRef = null
let incidentLayer = null
let homeView = null
let hasFitted = false

// Called once by BaseMap when the map is ready: create the layer and draw the pins.
function onMapReady(map, L) {
  mapRef = map
  leafletRef = L
  map.zoomControl?.setPosition('bottomright') // zoom buttons at the bottom right (as on the Allocation board)
  map.on('click', clearSelection) // tap on empty map: unselect the incident (pins don't bubble up to this)
  incidentLayer = L.layerGroup().addTo(map)
  plotIncidents() // the incidents may have arrived before the map was ready
}

// While an incident is selected, the focus card covers part of the map (left card on tablet/desktop, 45% bottom sheet on
// phones), so when fitting the map we leave that part empty (padding) and the pin lands in the visible area.
// These numbers must match the focus card CSS in components/incident/IncidentFocusCard.vue. With nothing selected the whole map is free.
function fitPadding() {
  if (selectedId.value === null) return { padding: [30, 30] } // overview: the whole map is free
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] } // desktop: card 420px
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] } // tablet: card 340px
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.45 + 30] } // phone: sheet 45vh
}

// Every incident that has usable coordinates, as [lat, lng] pairs.
function locatedPoints() {
  return incidents.value
    .filter((i) => i.status !== 'resolved') // no pin by default, so they must not stretch the first map view
    .filter((i) => typeof i.location?.lat === 'number' && typeof i.location?.lng === 'number')
    .map((i) => [i.location.lat, i.location.lng]) // Leaflet wants [lat, lng] pairs, not whole incidents
}

// Zoom out so EVERY pin is visible, and remember that view as the "overview" (homeView).
function fitOverview() {
  const points = locatedPoints()
  if (!mapRef || !points.length) return
  mapRef.invalidateSize() // make sure Leaflet knows the map's real size before fitting
  mapRef.fitBounds(points, { ...fitPadding(), animate: false, maxZoom: 15 }) // maxZoom: a lone pin does not zoom in too far
  homeView = { center: mapRef.getCenter(), zoom: mapRef.getZoom() }
}

// Zoom in on one incident (keeping it clear of the floating panel).
function focusIncident(incident) {
  const { lat, lng } = incident.location || {}
  if (!mapRef || typeof lat !== 'number' || typeof lng !== 'number') return
  mapRef.fitBounds([[lat, lng]], { ...fitPadding(), maxZoom: 16 })
}

// Glide back to the overview (skipped when the map is already there).
function resetMapView() {
  if (!mapRef || !homeView) return
  const atHome =
    mapRef.getZoom() === homeView.zoom && mapRef.getCenter().distanceTo(homeView.center) < 50
  if (atHome) return
  mapRef.setView(homeView.center, homeView.zoom, { animate: true, duration: 0.5 })
}

// Pin and tooltip colour follow the status / severity. The tooltip badge borrows the shared colours in map-ui.css:
// high = red (offline), medium = amber (stale), low = blue (me), resolved = green (live).
function toneOf(incident) {
  if (incident.status === 'resolved') return 'live'
  return { high: 'offline', medium: 'stale', low: 'me' }[incident.severity] || 'me'
}

// Draws one pin per incident that is not resolved (plus the selected one, even if resolved, and every resolved one while
// the "Resolved" pill is on), whatever the list filters say.
// Runs when the incidents change or the selection changes (so the selected pin gets its ring).
function plotIncidents() {
  if (!mapRef || !leafletRef) return // map not ready yet: onMapReady() calls this again
  incidentLayer.clearLayers() // remove the old pins first so they don't pile up

  incidents.value.forEach((incident) => {
    // Resolved incidents have no pin, unless that incident is the selected one: clicking its card shows where it happened
    if (incident.status === 'resolved' && !showResolved.value && incident._id !== selectedId.value)
      return
    const { lat, lng } = incident.location || {}
    if (typeof lat !== 'number' || typeof lng !== 'number') return // no usable location: no pin

    const icon = templatesByType.value[incident.type]?.icon || 'bi-exclamation-circle-fill'
    // The pin's look (colour by status / severity, ring when selected) comes from createIncidentIcon() in
    // utils/map-icons.js; its CSS is in assets/map-ui.css.
    const pin = createIncidentIcon({
      icon,
      severity: incident.severity,
      status: incident.status,
      selected: incident._id === selectedId.value,
      dimmed: selectedId.value !== null && incident._id !== selectedId.value, // another incident is focused: lighter shade
    })
    // The focused pin is lifted above the others so it is easy to find when pins overlap
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
    marker.on('click', () => selectIncident(incident)) // clicking a pin opens its card
    marker.addTo(incidentLayer)
  })

  // Fit the map to all the pins ONLY the first time there is something to show.
  // Later redraws (live updates, selecting a card) must not move the map.
  if (!hasFitted && locatedPoints().length) {
    fitOverview()
    hasFitted = true
  }
}

// ---------------------------------------------------------------------------------------------------
// 4. CARDS <-> MAP ACTIONS
// ---------------------------------------------------------------------------------------------------

// A card in the menu, or a PIN on the map, was chosen: select it, collapse the menu and zoom to its pin.
// The focus card then shows the details.
function selectIncident(incident) {
  selectedId.value = incident._id
  panelOpen.value = false // collapse the menu so the map is visible
  focusIncident(incident)
}

// Unselect the incident and zoom back out (tap on the map, or the X on the focus card).
function clearSelection() {
  if (selectedId.value === null) return // nothing selected: nothing to undo
  selectedId.value = null
  resetMapView()
}

// ---------------------------------------------------------------------------------------------------
// 5. SERVER CALLS
// ---------------------------------------------------------------------------------------------------

// Re-load the incidents and redraw the pins. Used after every change and on every live update.
// Reloading the whole list (instead of patching one row) keeps the status / severity sort order identical to the
// first load, because the server does the sorting.
async function loadIncidents() {
  try {
    incidents.value = await listIncidents()
    plotIncidents()
  } catch (error) {
    showPopup('error', 'Could not load', error.friendlyMessage || 'Something went wrong.') // FIX (C13): fallback so the popup never has a title with no text
  }
}

// FIX (C12, safety poll): a quiet version of loadIncidents for the 30-second safety net below.
// - Quiet: a failed background refresh shows no popup (it would nag the admin every 30 s); the next round just tries again.
// - Only redraws when the list really changed, so the map pins and open tooltips are not redrawn for nothing.
async function refreshQuietly() {
  try {
    const fresh = await listIncidents()
    if (JSON.stringify(fresh) !== JSON.stringify(incidents.value)) {
      incidents.value = fresh
      plotIncidents()
    }
  } catch {
    /* ignore: the socket or the next round will catch up */
  }
}

// FIX (C12): the socket is the fast path, this poll is the safety net for events the socket missed.
const SAFETY_POLL_MS = 30000 // 30 seconds
let safetyTimer = null
// Refresh straight away when the admin comes back to this tab (the timer skips rounds while the tab is hidden)
function onTabVisible() {
  if (document.visibilityState === 'visible') refreshQuietly()
}

// FIX (C17): true while an Acknowledge / Resolve is in progress, so a quick double-click cannot send it twice.
// It is also passed to the focus card, which greys out its buttons while this is true.
const statusBusy = ref(false)

// "Acknowledge" button on a card: new -> acknowledged
async function onAcknowledge(incident) {
  if (statusBusy.value) return // FIX (C17): already working on one, ignore the extra click
  statusBusy.value = true
  try {
    try {
      await updateIncidentStatus(incident._id, 'acknowledged')
    } catch (error) {
      showPopup('error', 'Acknowledge failed', error.friendlyMessage || 'Something went wrong.') // FIX (C13): fallback so the popup never has a title with no text
      return
    }
    await loadIncidents()
    showPopup('info', 'Acknowledged', 'The incident was marked as acknowledged.')
  } finally {
    statusBusy.value = false // FIX (C17): always unlock, even after an error
  }
}

// "Resolve" button on a card: acknowledged -> resolved. A note about how it was resolved is required.
async function onResolve(incident) {
  if (statusBusy.value) return // FIX (C17): ignore extra clicks (this also stops the note dialog opening twice)
  statusBusy.value = true
  try {
    await resolveWithNote(incident)
  } finally {
    statusBusy.value = false // FIX (C17): always unlock, even after an error or when the dialog is cancelled
  }
}

// The original body of onResolve (unchanged), split out so onResolve above can wrap it in the busy guard
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
  if (!note) return // cancelled or empty = it cannot be resolved
  try {
    await updateIncidentStatus(incident._id, 'resolved', note)
  } catch (error) {
    showPopup('error', 'Resolve failed', error.friendlyMessage || 'Something went wrong.') // FIX (C13): fallback so the popup never has a title with no text
    return
  }
  await loadIncidents()
  showPopup('info', 'Resolved', 'The incident was marked as resolved.')
}

// ---------------------------------------------------------------------------------------------------
// 6. WATCHERS, LIVE UPDATES AND START
// ---------------------------------------------------------------------------------------------------

// The selection changed: redraw the pins so the selected one gets (or loses) its ring.
watch(selectedId, plotIncidents)
// The "Resolved" pill was toggled: show or hide the green pins.
watch(showResolved, plotIncidents)

// Live updates: the server sends incident:new / incident:updated to admins only (the "hq" room).
let socket = null
onMounted(async () => {
  socket = connectSocket()
  socket.on('incident:new', loadIncidents)
  socket.on('incident:updated', loadIncidents)
  // FIX (C12): after the connection drops and comes back, we may have missed incident events,
  // so reload the list. "reconnect" does not fire on the first connect, so there is no duplicate load at startup.
  socket.io.on('reconnect', loadIncidents)
  // FIX (C12): safety poll every 30 s, only while the tab is visible
  safetyTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshQuietly()
  }, SAFETY_POLL_MS)
  document.addEventListener('visibilitychange', onTabVisible)
  try {
    // Both at once: the pins need the templates (names + icons) and the incidents
    const [list, templates] = await Promise.all([listIncidents(), listTemplates()])
    templatesByType.value = Object.fromEntries(
      templates.map((template) => [template.type, template]),
    )
    incidents.value = list
    if (typeFilter.value && !templatesByType.value[typeFilter.value]) typeFilter.value = ''
    if (schoolFilter.value && !schoolOptions.value.includes(schoolFilter.value)) schoolFilter.value = ''
    plotIncidents()
  } catch (error) {
    showPopup('error', 'Could not load', error.friendlyMessage || 'Something went wrong.') // FIX (C13): fallback so the popup never has a title with no text
  } finally {
    loading.value = false // NEW: runs after success AND failure, so the overlay can never get stuck on screen
  }
})
// Stop listening when the admin leaves the page, otherwise handlers pile up each time they come back.
onUnmounted(() => {
  socket?.off('incident:new', loadIncidents)
  socket?.off('incident:updated', loadIncidents)
  socket?.io.off('reconnect', loadIncidents) // FIX (C12): clean up when leaving the page
  clearInterval(safetyTimer) // FIX (C12)
  document.removeEventListener('visibilitychange', onTabVisible) // FIX (C12)
  clearTimeout(popupTimer)
})
</script>

<template>
  <!-- LAYOUT (same as the Allocation board): one full-screen map with the incident list (the "menu") on top of it.
       .map-page and .map-stage come from assets/map-ui.css: they make the map fill the page under the navbar.
       Inside the stage, stacked on each other: the map, the full-screen menu (title, stat chips, search, then the
       scrolling list of cards), a small "Incidents" button (only when the menu is hidden and nothing is selected),
       the focus card (the selected incident's details, shown when the menu is hidden) and the popup.
       :class="{ focus-open }" is added while the focus card is showing: on phones the CSS lifts the map's zoom
       buttons and credit above the bottom sheet. -->
  <div class="map-page">
    <div class="map-stage inc-stage" :class="{ 'focus-open': selectedIncident && !panelOpen }">
      <!-- The map. BaseMap builds the Leaflet map and calls onMapReady(map, L) in the script when it is ready;
           every pin is drawn from the script, not from this template. -->
      <BaseMap testid="incident-map" :zoom="12" @ready="onMapReady" />

      <!-- NEW: overlay on top of the map until the first incidents arrive (MapLoading is position:absolute, so it covers .map-stage) -->
      <!-- NEW: <Transition> keeps the overlay on screen while it fades out (and fades it in), instead of removing it instantly -->
      <Transition name="inc-fade">
        <MapLoading v-if="loading" class="inc-loading" text="Fetching Incidents..." />
      </Transition>

      <!-- Button to bring the menu back after it was hidden (only exists while the menu is hidden and nothing is selected) -->
      <button
        v-if="!panelOpen && !selectedIncident"
        type="button"
        class="btn btn-primary shadow inc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Live Incidents
      </button>

      <!-- Pill at the top right of the map (same height and top offset as the button above): show / hide resolved pins.
           Only visible while the map is showing (menu hidden). -->
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

      <!-- THE MENU. v-show (not v-if) only hides it with CSS, so the search text and the scroll position are kept
           while it is hidden. -->
      <Transition name="inc-panel-fade">
        <aside v-show="panelOpen" class="inc-panel">
          <!-- TOP PART of the menu. It never scrolls; only .inc-panel-scroll below scrolls. -->
          <div class="inc-panel-head">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <h1 class="h4 mb-0">Incidents</h1>
              <!-- Collapse the menu to see the map -->
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

            <!-- Stat chips: how many incidents are New, Acknowledged and Resolved. Each one is a button that filters the list.
                 aria-pressed / is-active are off while the search box has text, because a search ignores this button. -->
            <div class="row g-1 mb-2 inc-chips">
              <div v-for="chip in statChips" :key="chip.key" class="col-4">
                <button
                  type="button"
                  class="stat-btn card-hw py-1 px-0 text-center w-100"
                  :class="{ 'is-active': statusFilter === chip.key && !searchbar.trim() }"
                  :aria-pressed="statusFilter === chip.key && !searchbar.trim()"
                  :data-testid="`stat-${chip.key}`"
                  @click="toggleStatus(chip.key)"
                >
                  <div class="fs-6 fw-semibold">{{ chip.value }}</div>
                  <div class="chip-label text-muted-hw">{{ chip.label }}</div>
                </button>
              </div>
            </div>

            <!-- Search box. v-model keeps it in sync with searchbar in the script (see visibleIncidents). -->
            <div class="d-flex flex-wrap align-items-center gap-2 mb-0">
              <!-- E2E: data-testid="inc-search" lets the Feature 5 test type a note into this box -->
              <input
                type="search"
                class="form-control search-box"
                placeholder="Search school, name, type or note"
                data-testid="inc-search"
                v-model="searchbar"
              />
              <!-- Sort dropdown. v-model keeps sortBy and the dropdown in sync (the existing watch still saves the choice).
                   menu-end opens the menu from the right edge so it stays on screen. -->
              <AppDropdown
                v-model="sortBy"
                :options="sortOptions"
                icon="bi-sort-down"
                aria-label="Sort incidents"
                testid="inc-sort"
                menu-end
              />
            </div>

            <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
              <!-- Incident type filter ('' = All types) -->
              <AppDropdown
                v-model="typeFilter"
                :options="typeFilterOptions"
                icon="bi-tag"
                aria-label="Filter by incident type"
                testid="filter-type"
              />

              <!-- Severity filter ('' = All severities) -->
              <AppDropdown
                v-model="severityFilter"
                :options="severityFilterOptions"
                icon="bi-exclamation-triangle"
                aria-label="Filter by severity"
                testid="filter-severity"
              />

              <!-- School filter ('' = All schools). grow = stretch to fill the rest of the row. -->
              <AppDropdown
                v-model="schoolFilter"
                :options="schoolFilterOptions"
                icon="bi-building"
                aria-label="Filter by school"
                testid="filter-school"
                grow
              />

              <button v-if="activeFilterCount" type="button" class="btn btn-sm btn-outline-secondary" @click="clearFilters">
                Clear ({{ activeFilterCount }})
              </button>
            </div>
          </div>

          <!-- BOTTOM PART of the menu: the only part that scrolls. -->
          <div class="inc-panel-scroll">
            <!-- Nothing to list: say why -->
            <p v-if="visibleIncidents.length === 0" class="text-muted-hw">
              {{
                incidents.length === 0
                  ? 'No incidents have been reported yet.'
                  : statusFilter && !searchbar.trim()
                    ? `No ${statusFilter} incidents.`
                    : 'No incidents match.'
              }}
            </p>

            <!-- One card per incident in visibleIncidents, in a responsive grid. Clicking a card calls selectIncident():
                 the menu collapses, the map zooms to the pin and the focus card shows the details. -->
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

      <!-- FOCUS CARD: shown while the menu is collapsed and an incident is selected. "Incidents" brings the menu back;
           X unselects the incident and zooms out (same as tapping the map). -->
      <IncidentFocusCard
        :incident="panelOpen ? null : selectedIncident"
        :template="selectedIncident ? templatesByType[selectedIncident.type] : null"
        @list="panelOpen = true"
        @clear="clearSelection"
        :busy="statusBusy"
        @acknowledge="onAcknowledge"
        @resolve="onResolve"
      />

      <!-- Temporary status popup (errors, confirmations), same component as the Allocation board -->
      <MapNotice :notice="popup" @close="dismissPopup" />

      <!-- Custom prompt for the resolve note (replaces the browser's prompt()) -->
      <ConfirmDialog :dialog="confirmDialog" @answer="answerConfirm" />
    </div>
  </div>
</template>

<style scoped>
/* ===== STYLES (scoped: they only affect this page). They mirror the Allocation board's menu. ===== */

/* The search box never grows wider than 24rem (inside the menu it fills the row) */
.search-box {
  max-width: 24rem;
}
.inc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}


/* Incident cards in the menu: a responsive grid */
.inc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 8px;
  padding: 5px;
}
/* Tablets and larger: always exactly 2 columns (roomier cards, names are not cut off).
   Phones (under 768px) keep the rule above, so the phone layout is unchanged */
@media (min-width: 768px) {
  .inc-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)); /* minmax(0, ...) lets long names shrink and truncate instead of stretching the card */
  }
}

/* THE MENU (incident list): covers the whole map area under the navbar, like the chat window on phones.
   It is a flex column: the header stays put and only the list inside (.inc-panel-scroll) scrolls.
   The side padding keeps the content in a readable column (same width as the navbar's .container) on wide screens. */
.inc-panel {
  position: absolute;
  inset: 0;
  z-index: 1100; /* above Leaflet's own layers (they go up to 1000) and the focus card */
  display: flex;
  flex-direction: column;
  background: var(--hw-surface);
  color: var(--hw-text);
}
.inc-panel-head {
  flex: 0 0 auto; /* title and filters never shrink or scroll away */
  padding: 12px max(12px, calc((100% - var(--hw-content-w)) / 2)) 8px; /* was a fixed 1100px: uses the shared --hw-content-w, same as the navbar */
}
.inc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0; /* lets the flex child scroll instead of growing */
  overflow-y: auto;
  padding: 0 max(12px, calc((100% - var(--hw-content-w)) / 2)) 12px; /* was a fixed 1100px: uses the shared --hw-content-w, same as the navbar */
}

/* Chip captions are small so the three chips stay tidy on phones */
.inc-chips .chip-label {
  font-size: 0.7rem;
  line-height: 1.1;
  white-space: nowrap;
}
@media (min-width: 768px) {
  .inc-chips .chip-label {
    font-size: 0.75rem; /* tablet and desktop */
  }
}
/* The stat chips are buttons: keep the card look, add a pointer, and ring the pressed one */
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
  box-shadow: 0 0 0 2px var(--bs-primary);
}

/* NEW: the loading overlay must sit ABOVE the menu (.inc-panel is z-index 1100 and open by default), otherwise the menu
   hides it. 1105 is still below MapNotice (1150), so error popups stay visible. The longer selector beats MapLoading's own style. */
.inc-stage .inc-loading {
  z-index: 1105;
}
/* NEW: fade rules used by <Transition name="inc-fade">. Vue adds these classes while the overlay appears (enter) and
   disappears (leave): it starts / ends at opacity 0 and eases in between, so the map is revealed gradually, not with a jump. */
.inc-fade-enter-active,
.inc-fade-leave-active {
  transition: opacity 0.5s ease; /* 0.5 s fade; change this number to make it faster or slower */
}
.inc-fade-enter-from,
.inc-fade-leave-to {
  opacity: 0;
}
/* Button that brings the menu back (only shown when the menu is hidden and nothing is selected) */
.inc-reopen {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
}

/* Pill that shows / hides the resolved pins: mirrors .inc-reopen on the right so both sit on the same line */
.inc-resolved-pill {
  position: absolute;
  z-index: 1100;
  top: 12px;
  right: 12px;
}

/* PHONES (under 768px): lift the map's bottom controls (zoom buttons, OneMap credit) above the focus card's bottom
   sheet (45vh, see IncidentFocusCard.vue) while it is showing. */
@media (max-width: 767.98px) {
  .inc-stage.focus-open {
    --map-inset-bottom: 45vh;
  }
}

/* OPEN / CLOSE ANIMATION: the menu fades and slides up a little. Short (0.2s) and switched off for people who
   turned animations off in their system settings. */
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

/* The dropdown styles (.show-select, .show-btn, .show-menu, .show-option ...) moved into components/common/AppDropdown.vue */
</style>