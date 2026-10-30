<!-- One incident in the admin queue list: type icon, school, severity and status. -->

<script setup>
// Works out the label, icon, school name and the colours for the severity and status.

import { computed } from 'vue'
import { formatDateTime } from '@/utils/time'

const props = defineProps({
  incident: { type: Object, required: true },
  template: { type: Object, default: null },
  selected: { type: Boolean, default: false },
})
defineEmits(['select'])

// label, icon, school (computed) - text shown on the card: the template's label (or the raw type), the
// template's icon (or a warning icon), and the school name (or "Unknown school").
const label = computed(() => props.template?.label || props.incident.type)
// icon (computed) - the incident type's icon, or a default warning icon.
const icon = computed(() => props.template?.icon || 'bi-exclamation-circle-fill')
// school (computed) - the school name, or "Unknown school".
const school = computed(() => props.incident.school || 'Unknown school')

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
// severityInfo / statusInfo (computed) - pick the table row; an unknown value falls back to medium /
// new.
const severityInfo = computed(() => SEVERITY[props.incident.severity] || SEVERITY.medium)
// statusInfo (computed) - the label and colour for the incident's status (new if unknown).
const statusInfo = computed(() => STATUS[props.incident.status] || STATUS.new)
// barClass (computed) - green when resolved, otherwise the severity colour.
const barClass = computed(() =>
  props.incident.status === 'resolved' ? 'bg-success' : severityInfo.value.bar,
)
</script>

<template>
  <!-- A clickable card showing the incident summary. -->
  <div
    class="incident-card card-hw px-2 px-md-3 py-2"
    :class="{ 'is-selected': selected }"
    :data-testid="`incident-card-${incident._id}`"
    @click="$emit('select', incident)"
  >
    <h3 class="h5 mb-0">
      <button
        type="button"
        class="incident-head"
        :aria-label="`Show ${label} at ${school} on the map`"
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
          <i class="bi bi-chevron-right" aria-hidden="true"></i>
        </span>
      </button>
    </h3>

    <div class="progress my-2" role="progressbar" aria-label="Incident progress" :aria-valuenow="statusInfo.percent" aria-valuemin="0" aria-valuemax="100" style="height: 6px">
      <div class="progress-bar" :class="barClass" :style="{ width: statusInfo.percent + '%' }"></div>
    </div>
    <div class="d-flex flex-wrap gap-1 card-meta">
      <span class="badge rounded-pill" :class="severityInfo.badge">{{ severityInfo.text }}</span>
      <span class="badge rounded-pill" :class="statusInfo.badge">{{ statusInfo.text }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Styles for the card and its coloured top bar. */

.incident-card {
  cursor: pointer;
  transition: box-shadow 0.15s;
  content-visibility: auto;
  contain-intrinsic-size: auto 70px;
}
.incident-card:hover,
.incident-card.is-selected {
  box-shadow: 0 0 0 2px var(--bs-primary);
}
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
.head-text {
  min-width: 0;
}
.incident-head:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 4px;
  border-radius: 4px;
}
</style>
