<script setup>
// =====================================================================================================
// IncidentFocusCard (NEW) — the "focus card" of the Incident Queue, same idea as the focus card on the
// Allocation board: it shows the details of the ONE selected incident while the menu (list) is collapsed.
// Left card on tablet/desktop, bottom sheet on phones.
//
//   incident : the selected incident, or null (null = the card is hidden)
//   template : { label, icon } of the incident type
//   emits    : list (back to the menu), clear (X: unselect + zoom out), acknowledge, resolve
// =====================================================================================================
import { computed } from 'vue'
import { formatDateTime } from '@/utils/time'
import { useChatStore } from '@/services/chat'
import { useAuthStore } from '@/services/auth'

const props = defineProps({
  incident: { type: Object, default: null },
  template: { type: Object, default: null },
})
defineEmits(['list', 'clear', 'acknowledge', 'resolve'])

const label = computed(() => props.template?.label || props.incident?.type || '')
const icon = computed(() => props.template?.icon || 'bi-exclamation-circle-fill')
const school = computed(() => props.incident?.school || 'Unknown school')
const volunteerName = computed(() => props.incident?.volunteer?.name || 'Unknown volunteer')

// Chat with the volunteer who reported this incident (HQ / admin only). toggle() opens the chat panel (only while it
// is closed, otherwise it would close it); selectThread() jumps into this volunteer's one-to-one chat.
const chat = useChatStore()
const auth = useAuthStore()
const canChat = computed(() => auth.role === 'admin' && !!props.incident?.volunteer?._id)
async function openChat() {
  if (!chat.isOpen) chat.toggle()
  await chat.selectThread(props.incident.volunteer._id)
}

// Colours and wording (same as the map pins and the list cards)
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
const severityInfo = computed(() => SEVERITY[props.incident?.severity] || SEVERITY.medium)
const statusInfo = computed(() => STATUS[props.incident?.status] || STATUS.new)
const barClass = computed(() =>
  props.incident?.status === 'resolved' ? 'bg-success' : severityInfo.value.bar,
)
// The steps so far (new, acknowledged, resolved), oldest first. Old reports may have no history at all.
const steps = computed(() => props.incident?.history || [])
</script>

<template>
  <Transition name="inc-focus">
    <section
      v-if="incident"
      class="inc-focus"
      aria-label="Selected incident"
      data-testid="inc-focus-card"
    >
      <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-primary" @click="$emit('list')">
          <i class="bi bi-chevron-left me-1"></i>Incidents
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          aria-label="Unselect incident"
          title="Unselect incident"
          @click="$emit('clear')"
        >
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <h2 class="h5 mb-0">
        <i :class="['bi', icon, 'me-2']" aria-hidden="true"></i>{{ label }}
      </h2>
      <small class="d-block text-muted-hw">{{ school }}</small>
      <small class="text-muted-hw"
        ><i class="bi bi-clock me-1"></i>{{ formatDateTime(incident.createdAt) }}</small
      >

      <div class="progress my-2" role="progressbar" aria-label="Incident progress" style="height: 6px">
        <div class="progress-bar" :class="barClass" :style="{ width: statusInfo.percent + '%' }"></div>
      </div>
      <div class="d-flex flex-wrap gap-1">
        <span class="badge rounded-pill" :class="severityInfo.badge">{{ severityInfo.text }}</span>
        <span class="badge rounded-pill" :class="statusInfo.badge">{{ statusInfo.text }}</span>
      </div>

      <!-- Details: the only part that scrolls inside the card -->
      <div class="inc-focus-list">
        <div class="py-2 border-top">
          <i class="bi bi-chat-left-text me-1" aria-hidden="true"></i
          >{{ incident.note || 'No details given.' }}
        </div>
        <div v-if="incident.address" class="py-2 border-top small text-muted-hw">
          <i class="bi bi-geo-alt me-1" aria-hidden="true"></i>{{ incident.address }}
        </div>
        <div class="py-2 border-top small text-muted-hw">
          Reported by:
          <button
            v-if="canChat"
            type="button"
            class="btn btn-link btn-sm p-0 align-baseline"
            @click.stop="openChat"
          >
            {{ volunteerName }} <i class="bi bi-chat-dots-fill ms-1" aria-hidden="true"></i>
          </button>
          <span v-else>{{ volunteerName }}</span>
        </div>
        <div
          v-for="step in steps"
          :key="step._id || step.status"
          class="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-top"
        >
          <span>
            <span class="badge rounded-pill me-1" :class="(STATUS[step.status] || STATUS.new).badge">{{
              (STATUS[step.status] || STATUS.new).text
            }}</span>
            <span v-if="step.note">{{ step.note }}</span>
          </span>
          <span class="small text-muted-hw text-nowrap">{{ formatDateTime(step.at) }}</span>
        </div>
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
    </section>
  </Transition>
</template>

<style scoped>
/* Same look as .alloc-focus on the Allocation board. Left card on tablet/desktop (340px / 420px) and a bottom sheet on
   phones (45vh). Keep these numbers in step with fitPadding() in IncidentQueueView.vue. */
.inc-focus {
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
.inc-focus-list {
  min-height: 0;
  margin-top: 0.5rem;
  overflow-y: auto; /* long details scroll inside the card */
}
@media (min-width: 992px) {
  .inc-focus {
    width: min(420px, calc(100% - 24px));
  }
}
@media (max-width: 767.98px) {
  .inc-focus {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: 45vh;
    max-height: none;
    border-radius: var(--hw-radius) var(--hw-radius) 0 0;
  }
}

/* Slide in from the edge (switched off for people who turned animations off) */
.inc-focus-enter-active,
.inc-focus-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.inc-focus-enter-from,
.inc-focus-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
@media (max-width: 767.98px) {
  .inc-focus-enter-from,
  .inc-focus-leave-to {
    transform: translateY(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .inc-focus-enter-active,
  .inc-focus-leave-active {
    transition: none;
  }
}
</style>
