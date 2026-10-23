<script setup>
// =====================================================================================================
// Incident Queue (admin / HQ) — Feature 4 (F4)
// Same layout idea as the Allocation board: one full-screen map with a floating panel on top
// (a left-hand card on tablet/desktop, a bottom sheet on phones).
// =====================================================================================================
//
// WHAT THIS PAGE DOES
// Volunteers report incidents from the field (a student unwell, a bus delayed...). The admin sees every
// incident here as a pin on the map and as a card in the list, and moves each one along:
//   new  ->  acknowledged  ->  resolved
//
// HOW IT WORKS
//  1. The incidents come from the server (listIncidents). `incidents` holds them, already sorted by the server.
//  2. Each incident is drawn twice: a pin on the map and a card in the panel. They are linked:
//       - click a CARD  -> that incident becomes the selected one and the map zooms to its pin
//         (click the same card again to deselect and zoom back out);
//       - click a PIN   -> the panel opens, the card scrolls into view and flashes.
//  3. The search box and the "Needs action" switch filter the CARD LIST only (visibleIncidents).
//     All pins stay on the map, so a pin click may need to clear the filters first (see selectIncident).
//  4. Live updates: the server tells admins about new / changed incidents over a socket, and the page re-loads
//     the list. The map is only fitted to the pins the FIRST time, so a live update never makes the map jump.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseMap from '@/components/BaseMap.vue'
import { listIncidents, listTemplates, updateIncidentStatus } from '@/services/incidents'
import IncidentCard from '@/components/IncidentCard.vue'
import { connectSocket } from '@/services/socket' // live updates
import { tipCard, bindTip, createIncidentIcon } from '@/utils/map-icons' // shared hover-card helpers (same as the Allocation and Live boards)

// ---------------------------------------------------------------------------------------------------
// 1. DATA (the page's "memory"). A `ref` is a box holding a value; when it changes, the screen updates.
// ---------------------------------------------------------------------------------------------------
const incidents = ref([]) // every incident from the server
const templatesByType = ref({}) // { STUDENT_UNWELL: {label, icon...}, BUS_DELAYED: {...}, ... } used for names and icons
const selectedId = ref(null) // _id of the selected incident (null = none); its card has a ring, its pin is ringed too
const highlightedId = ref(null) // the card that flashes briefly after a pin click
const errorMessage = ref('') // red box at the top of the panel
const searchbar = ref('') // text in the search box
const needsAction = ref(false) // switch: true = hide resolved incidents from the list
// The panel starts open on tablet/desktop (768px and wider) and hidden on phones, where it covers half the screen.
const panelOpen = ref(window.matchMedia('(min-width: 768px)').matches)

// ---------------------------------------------------------------------------------------------------
// 2. DERIVED DATA (computed: rebuilt automatically when what it reads changes)
// ---------------------------------------------------------------------------------------------------

// The readable name of an incident's type, e.g. "Student unwell". Falls back to the raw type code.
function labelOf(incident) {
  return templatesByType.value[incident.type]?.label || incident.type
}

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
  { label: 'New', value: stats.value.new },
  { label: 'Acknowledged', value: stats.value.acknowledged },
  { label: 'Resolved', value: stats.value.resolved },
])

// The incidents whose cards are listed: the search AND the "Needs action" switch both apply.
// The search looks at the school name, the incident type name and the reporter's note.
const visibleIncidents = computed(() => {
  const q = searchbar.value.trim().toUpperCase() // upper-case both sides so capitals are ignored
  return incidents.value.filter((incident) => {
    if (needsAction.value && incident.status === 'resolved') return false // switch on: hide resolved
    if (!q) return true // empty search matches everything
    return (
      (incident.school || '').toUpperCase().includes(q) ||
      labelOf(incident).toUpperCase().includes(q) ||
      (incident.note || '').toUpperCase().includes(q)
    )
  })
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
  incidentLayer = L.layerGroup().addTo(map)
  plotIncidents() // the incidents may have arrived before the map was ready
}

// The floating panel covers part of the map, so when fitting the map we leave that part empty (padding) and the
// pins land in the visible area. Desktop 420px / tablet 340px on the left, phones: bottom sheet (55% of the height).
// These numbers must match the panel CSS at the bottom of this file.
function fitPadding() {
  if (!panelOpen.value) return { padding: [30, 30] } // panel hidden: the whole map is free
  if (window.matchMedia('(min-width: 992px)').matches) {
    return { paddingTopLeft: [420 + 30, 30], paddingBottomRight: [30, 30] } // desktop
  }
  if (window.matchMedia('(min-width: 768px)').matches) {
    return { paddingTopLeft: [340 + 30, 30], paddingBottomRight: [30, 30] } // tablet
  }
  return { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.55 + 30] } // phone
}

// Every incident that has usable coordinates, as [lat, lng] pairs.
function locatedPoints() {
  return incidents.value
    .filter((i) => typeof i.location?.lat === 'number' && typeof i.location?.lng === 'number')
    .map((i) => [i.location.lat, i.location.lng])
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

// Draws one pin per incident (all of them, whatever the list filters say).
// Runs when the incidents change or the selection changes (so the selected pin gets its ring).
function plotIncidents() {
  if (!mapRef || !leafletRef) return // map not ready yet: onMapReady() calls this again
  incidentLayer.clearLayers() // remove the old pins first so they don't pile up

  incidents.value.forEach((incident) => {
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
    })
    const marker = leafletRef.marker([lat, lng], { icon: pin })
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

// A CARD was clicked: select it and zoom to its pin. Clicking the selected card again deselects it
// and zooms back out.
function onSelect(incident) {
  if (selectedId.value === incident._id) {
    selectedId.value = null
    resetMapView()
    return
  }
  selectedId.value = incident._id
  focusIncident(incident)
}

// A PIN was clicked: it never deselects. It selects the incident, zooms to it, scrolls the list to its card
// and flashes the card.
function selectIncident(incident) {
  // All pins are on the map, but the list may be filtered. If this card is hidden by a filter, clear the
  // filters first, otherwise there would be no card to show.
  if (!visibleIncidents.value.some((i) => i._id === incident._id)) {
    needsAction.value = false
    searchbar.value = ''
  }
  panelOpen.value = true // the panel may be hidden: bring it back
  selectedId.value = incident._id
  focusIncident(incident)
  // nextTick = wait until Vue has drawn the card (it may have just come back after clearing a filter), then scroll to it
  nextTick(() =>
    document.getElementById(`incident-${incident._id}`)?.scrollIntoView({ block: 'start', behavior: 'auto' }),
  )
  highlightedId.value = incident._id // flash the card for about 1.2 seconds
  setTimeout(() => {
    if (highlightedId.value === incident._id) highlightedId.value = null // only clear our own flash
  }, 1200)
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
    errorMessage.value = ''
    plotIncidents()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
}

// "Acknowledge" button on a card: new -> acknowledged
async function onAcknowledge(incident) {
  try {
    await updateIncidentStatus(incident._id, 'acknowledged')
  } catch (error) {
    errorMessage.value = error.friendlyMessage
    return
  }
  await loadIncidents()
}

// "Resolve" button on a card: acknowledged -> resolved. A note about how it was resolved is required.
async function onResolve(incident) {
  const note = prompt('Please include details on how was it resolved.')
  if (!note) return // no note = it cannot be resolved
  try {
    await updateIncidentStatus(incident._id, 'resolved', note)
  } catch (error) {
    errorMessage.value = error.friendlyMessage
    return
  }
  await loadIncidents()
}

// ---------------------------------------------------------------------------------------------------
// 6. WATCHERS, LIVE UPDATES AND START
// ---------------------------------------------------------------------------------------------------

// The selection changed: redraw the pins so the selected one gets (or loses) its ring.
watch(selectedId, plotIncidents)

// When the panel is hidden or shown, the map's free area changes: refit the overview (unless an incident is selected).
// nextTick = wait for the panel to finish appearing/disappearing before measuring.
watch(panelOpen, () => {
  nextTick(() => {
    if (selectedId.value === null) fitOverview()
  })
})

// Live updates: the server sends incident:new / incident:updated to admins only (the "hq" room).
let socket = null
onMounted(async () => {
  socket = connectSocket()
  socket.on('incident:new', loadIncidents)
  socket.on('incident:updated', loadIncidents)
  try {
    // Both at once: the pins need the templates (names + icons) and the incidents
    const [list, templates] = await Promise.all([listIncidents(), listTemplates()])
    templatesByType.value = Object.fromEntries(templates.map((template) => [template.type, template]))
    incidents.value = list
    plotIncidents()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
})
// Stop listening when the admin leaves the page, otherwise handlers pile up each time they come back.
onUnmounted(() => {
  socket?.off('incident:new', loadIncidents)
  socket?.off('incident:updated', loadIncidents)
})
</script>

<template>
  <!-- LAYOUT: one full-screen map with a floating panel on top (same pattern as the Allocation board).
       .map-page and .map-stage come from assets/map-ui.css: they make the map fill the page under the navbar.
       :class="{ sheet-open: panelOpen }" adds the class sheet-open while the panel is showing: on phones the CSS
       uses it to lift the map credit above the bottom sheet. -->
  <div class="map-page">
    <div class="map-stage inc-stage" :class="{ 'sheet-open': panelOpen }">
      <!-- The map. BaseMap builds the Leaflet map and calls onMapReady(map, L) in the script when it is ready;
           every pin is drawn from the script, not from this template. -->
      <BaseMap testid="incident-map" :zoom="12" @ready="onMapReady" />

      <!-- Button to bring the panel back after it was hidden (only exists while the panel is hidden) -->
      <button
        v-if="!panelOpen"
        type="button"
        class="btn btn-light shadow inc-reopen"
        @click="panelOpen = true"
      >
        <i class="bi bi-layout-sidebar-inset me-1"></i>Incidents
      </button>

      <!-- The floating panel. v-show (not v-if) only hides it with CSS, so the selection, the scroll position
           and the search text are all kept while it is hidden. -->
      <aside v-show="panelOpen" class="inc-panel">
        <!-- Hide button in the panel's top-right corner: hides the panel so the whole map can be seen -->
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary inc-hide"
          aria-label="Hide panel"
          title="Hide panel"
          @click="panelOpen = false"
        >
          <i class="bi bi-chevron-bar-left"></i>
        </button>

        <!-- TOP PART of the panel. It never scrolls; only .inc-panel-scroll below scrolls. -->
        <div class="inc-panel-head">
          <h1 class="h4 mb-2">Incidents</h1>

          <!-- Red box with the last error (failed load, acknowledge or resolve) -->
          <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">
            {{ errorMessage }}
          </div>

          <!-- Alerts strip (not built yet). The data-testid is used by the e2e tests. -->
          <div class="mb-2" data-testid="alerts-panel">
            <!-- <AlertItem v-for="…" /> -->
            <p class="small text-muted-hw mb-0">Alerts will appear here.</p>
          </div>

          <!-- Stat chips: how many incidents are New, Acknowledged and Resolved. Drawn with one v-for over statChips. -->
          <div class="row g-1 mb-2 inc-chips">
            <div v-for="chip in statChips" :key="chip.label" class="col-4">
              <div class="card-hw py-1 px-0 text-center">
                <div class="fs-6 fw-semibold">{{ chip.value }}</div>
                <div class="chip-label text-muted-hw">{{ chip.label }}</div>
              </div>
            </div>
          </div>

          <!-- Search box + "Needs action" switch. v-model keeps each control in sync with searchbar / needsAction
               in the script, and the card list filters itself (see visibleIncidents). -->
          <div class="d-flex flex-wrap align-items-center gap-2 mb-0">
            <input
              type="text"
              class="form-control search-box"
              placeholder="Search school, type or note"
              v-model="searchbar"
            />
            <div class="form-check form-switch mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="needsAction"
                v-model="needsAction"
              />
              <label class="form-check-label" for="needsAction">Needs action</label>
            </div>
          </div>
        </div>

        <!-- BOTTOM PART of the panel: the only part that scrolls. -->
        <div class="inc-panel-scroll">
          <!-- Nothing to list: say why -->
          <p v-if="visibleIncidents.length === 0" class="text-muted-hw">
            {{
              incidents.length === 0
                ? 'No incidents have been reported yet.'
                : needsAction && !searchbar.trim()
                  ? 'Nothing needs action.'
                  : 'No incidents match.'
            }}
          </p>

          <!-- One card per incident in visibleIncidents (so the search and the switch apply).
               :id lets selectIncident() (a pin click) scroll to the card; the id lands on the card's root element.
               inc-flash is the brief highlight after a pin click. The card itself decides how it looks
               (components/IncidentCard.vue); here we only listen to what it says: select, acknowledge, resolve. -->
          <div class="d-flex flex-column gap-2" data-testid="queue-new">
            <IncidentCard
              v-for="incident in visibleIncidents"
              :key="incident._id"
              :id="`incident-${incident._id}`"
              :incident="incident"
              :template="templatesByType[incident.type]"
              :selected="selectedId === incident._id"
              :class="{ 'inc-flash': highlightedId === incident._id }"
              @select="onSelect"
              @acknowledge="onAcknowledge"
              @resolve="onResolve"
            />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ===== STYLES (scoped: they only affect this page). They mirror the Allocation board's panel. ===== */

/* The search box never grows wider than 24rem (inside the panel it shares its row with the switch) */
.search-box {
  max-width: 24rem;
}
.inc-panel-head .search-box {
  flex: 1 1 140px;
  max-width: none;
}

/* Brief highlight (a blue outline) on the card a pin click just opened; removed after about 1.2 seconds by the script.
   Scoped styles also reach the root element of a child component, which is why this works on IncidentCard. */
.inc-flash {
  box-shadow: 0 0 0 3px var(--bs-primary);
}

/* THE FLOATING PANEL. Over the full-screen map: a card on the left for tablet/desktop, a bottom sheet on phones.
   It is a flex column: the header stays put and only the list inside (.inc-panel-scroll) scrolls.
   Widths: 340px on tablet (this rule), 420px on desktop and wider (the 992px rule below), full width on phones.
   If you change a width here, change the same number in fitPadding() in the script. */
.inc-panel {
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
/* Top part of the panel (title, messages, chips, filters): never shrinks or scrolls away */
.inc-panel-head {
  flex: 0 0 auto;
  padding: 12px 12px 8px;
}
/* Bottom part of the panel: the list of cards */
.inc-panel-scroll {
  flex: 1 1 auto;
  min-height: 0; /* lets the flex child scroll instead of growing */
  overflow-y: auto;
  padding: 0 12px 12px;
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

/* Hide-panel button in the panel's top-right corner, and the button that brings the panel back */
.inc-hide {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
}
.inc-reopen {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
}

/* The default zoom buttons sit top-left, which is under the panel: move them to the top-right */
.inc-stage :deep(.leaflet-top.leaflet-left) {
  left: auto;
  right: 0;
}

/* Desktop (992px and wider): a wider panel (keep in step with fitPadding() in the script) */
@media (min-width: 992px) {
  .inc-panel {
    width: min(420px, calc(100% - 24px));
  }
}

/* PHONES (under 768px): the panel becomes a bottom sheet taking 55% of the screen height, and the map's
   bottom controls (the OneMap credit) ride above it. 55vh must match fitPadding() in the script. */
@media (max-width: 767.98px) {
  .inc-stage.sheet-open {
    --map-inset-bottom: 55vh; /* lift the credit above the sheet only while the sheet is open */
  }
  .inc-panel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: 55vh;
    border-radius: var(--hw-radius) var(--hw-radius) 0 0;
  }
}
</style>
