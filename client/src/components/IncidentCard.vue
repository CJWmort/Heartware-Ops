<script setup>
import { computed } from 'vue'
import { formatDateTime } from '@/utils/time'

// 1. PROPS – what the page gives the card (one incident)
const props = defineProps({
  incident: { type: Object, required: true },
  template: { type: Object, default: null }, // { label, icon } from the incident templates
  selected: { type: Boolean, default: false },
})

// 2. EMITS – what the card tells the page ("this button was clicked")
//    select      : the title row was clicked: the page selects this incident and zooms the map to its pin
//    acknowledge : the Acknowledge button was clicked
//    resolve     : the Resolve button was clicked
defineEmits(['select', 'acknowledge', 'resolve'])

// 3. label + icon of the incident type (the same way as before)
const label = computed(() => props.template?.label || props.incident.type)
const icon = computed(() => props.template?.icon || 'bi-exclamation-circle-fill')

// 4. school name
const school = computed(() => props.incident.school || 'Unknown school')

// 5. vounterr name
const volunteerName = computed(() => props.incident.volunteer?.name || 'Unknown volunteer') // ?. = safe if the volunteer is missing

// 6. OPEN / CLOSED. Like the school card on the Allocation board, the card is a collapsed summary that opens to show
//    the details. We do not keep a separate "open" box here: a card is open exactly while it is the SELECTED one, so
//    clicking a card, or clicking its pin on the map, opens it, and selecting another card closes it.
const isOpen = computed(() => props.selected)

// 7. Colours and wording. Severity colours are the same as the map pins (high = red, medium = amber, low = blue).
const SEVERITY = {
  high: { text: 'High', badge: 'text-bg-danger', bar: 'bg-danger' },
  medium: { text: 'Medium', badge: 'text-bg-warning', bar: 'bg-warning' },
  low: { text: 'Low', badge: 'text-bg-primary', bar: 'bg-primary' },
}
const STATUS = {
  new: { text: 'New', badge: 'text-bg-secondary', percent: 33 },
  acknowledged: { text: 'Acknowledged', badge: 'text-bg-info', percent: 66 },
  resolved: { text: 'Resolved', badge: 'text-bg-success', percent: 100 },
}
const severityInfo = computed(() => SEVERITY[props.incident.severity] || SEVERITY.medium)
const statusInfo = computed(() => STATUS[props.incident.status] || STATUS.new)

// 8. The thin bar under the title (the school card shows "places filled" here). Here it shows how far the incident has
//    got: a third = new, two thirds = acknowledged, full = resolved. Green when resolved, otherwise the severity colour.
const barClass = computed(() =>
  props.incident.status === 'resolved' ? 'bg-success' : severityInfo.value.bar,
)

// 9. The steps so far (new, acknowledged, resolved), oldest first. Old reports may have no history at all.
const steps = computed(() => props.incident.history || [])
</script>

<template>
  <div
    class="incident-card card-hw px-2 px-md-3 py-2"
    :class="{ 'is-open': isOpen, 'is-selected': selected }"
    :data-testid="`incident-card-${incident._id}`"
  >
    <!-- 10. TEMPLATE – same layout as a school card on the Allocation board:
         title button (type, school and time on the left, bus + arrow on the right), a thin bar, small pills, and a
         details part that slides open. card-hw is the shared card style; is-open / is-selected come from "selected". -->
    <!-- Heading + button together (same pattern as Bootstrap's accordion): clicking the title row tells the page
         "select", which opens this card and zooms the map to the pin. -->
    <h3 class="h5 mb-0">
      <button
        type="button"
        class="incident-head"
        :aria-expanded="isOpen"
        @click="$emit('select', incident)"
      >
        <span class="head-text">
          <span class="d-block text-truncate"
            ><i :class="['bi', icon, 'me-2']" aria-hidden="true"></i>{{ label }}</span
          >
          <small class="d-block fw-normal text-muted-hw text-truncate">{{ school }}</small>
          <small class="d-block fw-normal text-muted-hw card-time"
            ><i class="bi bi-clock me-1"></i>{{ formatDateTime(incident.createdAt) }}</small
          >
        </span>
        <span class="d-flex align-items-center gap-2 text-nowrap">
          <i class="bi bi-chevron-down chevron" aria-hidden="true"></i>
        </span>
      </button>
    </h3>

    <!-- Progress bar: always visible, so HQ can scan the list without opening any card -->
    <div
      class="progress my-2"
      role="progressbar"
      aria-label="Incident progress"
      style="height: 6px"
    >
      <div
        class="progress-bar"
        :class="barClass"
        :style="{ width: statusInfo.percent + '%' }"
      ></div>
    </div>
    <!-- Pills: how severe it is and where it is in the workflow -->
    <div class="d-flex flex-wrap gap-1 card-meta">
      <span class="badge rounded-pill" :class="severityInfo.badge">{{ severityInfo.text }}</span>
      <span class="badge rounded-pill" :class="statusInfo.badge">{{ statusInfo.text }}</span>
    </div>

    <!-- The details: closed until the card is selected (class "open" comes from isOpen). One row per item, each with a
         line above it, like the volunteer rows in a school card. -->
    <div class="incident-collapse" :class="{ open: isOpen }">
      <div class="incident-collapse-inner">
        <!-- What the volunteer wrote -->
        <div class="py-2 border-top">
          <i class="bi bi-chat-left-text me-1" aria-hidden="true"></i
          >{{ incident.note || 'No details given.' }}
        </div>
        <!-- Where it happened (only when we have an address) -->
        <div v-if="incident.address" class="py-2 border-top small text-muted-hw">
          <i class="bi bi-geo-alt me-1" aria-hidden="true"></i>{{ incident.address }}
        </div>
        <!-- Reported by which volunterr -->
        <div class="py-2 border-top small text-muted-hw">Reported by: {{ volunteerName }}</div>
        <!-- What has happened so far: the pill is the status, then the note HQ typed (if any), then the time -->
        <div
          v-for="step in steps"
          :key="step._id || step.status"
          class="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-top"
        >
          <span>
            <span
              class="badge rounded-pill me-1"
              :class="(STATUS[step.status] || STATUS.new).badge"
              >{{ (STATUS[step.status] || STATUS.new).text }}</span
            >
            <span v-if="step.note">{{ step.note }}</span>
          </span>
          <span class="small text-muted-hw text-nowrap">{{ formatDateTime(step.at) }}</span>
        </div>
        <!-- The action buttons (same buttons and test ids as before). @click.stop = pressing a button does not also
             count as a click on the card. -->
        <div v-if="incident.status !== 'resolved'" class="py-2 border-top">
          <button
            v-if="incident.status === 'new'"
            class="btn btn-sm btn-outline-primary"
            data-testid="incident-ack"
            @click.stop="$emit('acknowledge', incident)"
          >
            Acknowledge
          </button>
          <button
            v-if="incident.status === 'acknowledged'"
            class="btn btn-sm btn-success"
            data-testid="incident-resolve"
            @click.stop="$emit('resolve', incident)"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* These rules copy the school card's styles from AllocationBoardView.vue, so both cards look and behave the same. */

/* Performance: the browser skips layout and paint for cards scrolled out of view.
   contain-intrinsic-size gives each hidden card a rough height so the scrollbar doesn't jump. */
.incident-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 70px;
}
/* Ring around the selected card (the map pin gets a matching ring) */
.incident-card.is-selected {
  box-shadow: 0 0 0 2px var(--bs-primary);
}

/* CARD HEADER: the title row looks like normal text but is a full-width button (so it is keyboard- and
   screen-reader-friendly) */
.incident-head {
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
/* Lets the left text shrink (and show "..." when too long) instead of pushing the bus number off the card */
.head-text {
  min-width: 0;
}
.incident-head:focus-visible {
  outline: 2px solid var(--bs-primary); /* keyboard focus ring */
  outline-offset: 4px;
  border-radius: 4px;
}
.chevron {
  transition: transform 0.25s;
}
.incident-head[aria-expanded='true'] .chevron {
  transform: rotate(180deg); /* arrow flips when open */
}

/* OPEN / CLOSE ANIMATION: animates the grid row height from 0fr to 1fr, so the details slide open without
   needing a fixed height. The "open" class comes from the script; this CSS does the movement. */
.incident-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}
.incident-collapse-inner {
  overflow: hidden;
}
.incident-collapse.open {
  grid-template-rows: 1fr;
  margin-top: 0.5rem; /* a little air above the details once it is open */
}

/* Phones only (under 768px): a closed card shows just the title and the bar, so more cards fit on the screen.
   The pills appear once the card is opened. */
@media (max-width: 767.98px) {
  .incident-card:not(.is-open) .card-meta {
    display: none;
  }
}

/* Respect people who turn animations off in their system settings */
@media (prefers-reduced-motion: reduce) {
  .incident-collapse,
  .chevron {
    transition: none;
  }
}
</style>
