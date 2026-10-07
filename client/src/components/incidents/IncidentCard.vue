<script setup>
// Display-only card for one incident (Feature 4 – Wei Ming).
// It does NOT change anything itself: buttons just emit events, and the page
// (IncidentQueueView.vue) decides what happens. That logic is yours to write.
//
// Usage:
//   <IncidentCard
//     :incident="incident"
//     :template="templatesByType[incident.type]"
//     :selected="selectedId === incident._id"
//     @select="..." @acknowledge="..." @resolve="..."
//   />
import { computed } from 'vue'
import { timeAgo, clockTime } from '@/utils/time'

const props = defineProps({
  incident: { type: Object, required: true },
  template: { type: Object, default: null }, // { label, icon } from the incident templates
  selected: { type: Boolean, default: false },
})
defineEmits(['select', 'acknowledge', 'resolve'])

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

const label = computed(() => props.template?.label ?? props.incident.type)
const icon = computed(() => props.template?.icon ?? 'bi-exclamation-circle-fill')
const school = computed(() => props.incident.slot?.school?.name ?? 'Unknown school')
const bus = computed(() => {
  const s = props.incident.slot
  return s ? [s.busNo, s.className && `Class ${s.className}`].filter(Boolean).join(' · ') : ''
})
const lastNote = computed(() => {
  const withNote = [...(props.incident.history ?? [])].reverse().find((h) => h.note)
  return withNote?.note ?? ''
})
</script>

<template>
  <article
    class="incident-card card-hw"
    :class="[`sev-${incident.severity}`, { 'is-selected': selected }]"
    :data-testid="`incident-card-${incident._id}`"
    tabindex="0"
    @click="$emit('select', incident)"
    @keydown.enter="$emit('select', incident)"
  >
    <!-- Header: icon + type + severity -->
    <header class="d-flex align-items-start gap-2">
      <span class="type-icon" aria-hidden="true"><i :class="['bi', icon]"></i></span>
      <div class="flex-grow-1 min-w-0">
        <h3 class="h6 mb-0 text-truncate">{{ label }}</h3>
        <p class="small text-muted-hw mb-0 text-truncate">{{ school }}</p>
      </div>
      <span class="sev-badge" :title="`Severity: ${SEVERITY_LABEL[incident.severity]}`">
        {{ SEVERITY_LABEL[incident.severity] }}
      </span>
    </header>

    <!-- Meta: bus/class + time -->
    <div class="d-flex flex-wrap gap-2 small text-muted-hw mt-2">
      <span v-if="bus"><i class="bi bi-bus-front me-1" aria-hidden="true"></i>{{ bus }}</span>
      <span :title="clockTime(incident.createdAt)">
        <i class="bi bi-clock me-1" aria-hidden="true"></i>{{ timeAgo(incident.createdAt) }}
      </span>
      <span v-if="!incident.location" class="text-warning">
        <i class="bi bi-geo-alt me-1" aria-hidden="true"></i>No location
      </span>
    </div>

    <!-- Body: note + photo -->
    <div class="d-flex gap-2 mt-2">
      <p v-if="incident.note" class="note mb-0 flex-grow-1">{{ incident.note }}</p>
      <img
        v-if="incident.photoUrl"
        :src="incident.photoUrl"
        class="thumb"
        alt="Photo attached to the incident"
        loading="lazy"
      />
    </div>

    <!-- Latest HQ note (e.g. resolution note) -->
    <p v-if="lastNote" class="hq-note small mb-0 mt-2">
      <i class="bi bi-chat-left-text me-1" aria-hidden="true"></i>{{ lastNote }}
    </p>

    <!-- Footer: reporter + action buttons -->
    <footer class="d-flex align-items-center justify-content-between gap-2 mt-3">
      <span class="small text-muted-hw text-truncate">
        <i class="bi bi-person me-1" aria-hidden="true"></i>{{ incident.reporter?.name }}
      </span>
      <div class="d-flex gap-2 flex-shrink-0">
        <button
          v-if="incident.status === 'new'"
          type="button"
          class="btn btn-sm btn-outline-primary"
          data-testid="incident-ack"
          @click.stop="$emit('acknowledge', incident)"
        >
          Acknowledge
        </button>
        <button
          v-if="incident.status === 'acknowledged'"
          type="button"
          class="btn btn-sm btn-success"
          data-testid="incident-resolve"
          @click.stop="$emit('resolve', incident)"
        >
          Resolve
        </button>
        <span v-if="incident.status === 'resolved'" class="badge text-bg-success">
          <i class="bi bi-check2 me-1" aria-hidden="true"></i>Resolved
        </span>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.incident-card {
  --sev: var(--hw-muted);
  position: relative;
  padding: 0.875rem 1rem 0.875rem 1.125rem;
  border-left: 5px solid var(--sev);
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.incident-card:hover,
.incident-card:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.1);
  outline: none;
}
.incident-card.is-selected {
  box-shadow: 0 0 0 2px var(--sev), var(--hw-shadow);
}

.sev-high {
  --sev: var(--hw-danger);
}
.sev-medium {
  --sev: var(--hw-warning);
}
.sev-low {
  --sev: var(--hw-muted);
}

.type-icon {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--sev) 14%, transparent);
  color: var(--sev);
  font-size: 1.1rem;
}

.sev-badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  color: var(--sev);
  background: color-mix(in srgb, var(--sev) 12%, transparent);
}

.min-w-0 {
  min-width: 0; /* lets text-truncate work inside flex */
}

.note {
  font-size: 0.9rem;
  /* show at most 3 lines */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.thumb {
  width: 64px;
  height: 48px;
  object-fit: cover;
  border-radius: 0.4rem;
  flex-shrink: 0;
}

.hq-note {
  background: var(--hw-bg);
  border-radius: 0.4rem;
  padding: 0.4rem 0.6rem;
}
</style>
