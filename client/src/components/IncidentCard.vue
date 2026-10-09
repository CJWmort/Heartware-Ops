<script setup>
import { computed } from 'vue'

// 1. PROPS – what the page gives the card (one incident)
const props = defineProps({
  incident: { type: Object, required: true },
  template: { type: Object, default: null }, // { label, icon } from the incident templates
  selected: { type: Boolean, default: false },
})

// 2. EMITS – what the card tells the page ("this button was clicked")
defineEmits(['select', 'acknowledge', 'resolve'])

// 3. label
const label = computed(() => props.template?.label || props.incident.type)

// 4. icon
const icon = computed(() => props.template?.icon || 'bi-exclamation-circle-fill')

// 5. school name
const school = computed(() => props.incident.school || 'Unknown school')

// 6. provides the date/time and the note when a incident is first reported
const reported = computed(() => {
  const time = formatDateTime(props.incident.createdAt)
  if (!props.incident.note) return time
  return `${time} - ${props.incident.note}`
})

// 7. latest update to display
const latestUpdate = computed(() => {
  //array must not be empty
  const last = props.incident.history.at(-1)
  if (!last?.note) return ''
  else return `${formatDateTime(last.at)} - ${last.note}` //formated to display directly compared to createdAt
})

// 9. DateTime helper
function formatDateTime(date) {
  return new Date(date).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore',
  })
}
</script>

<template>
  <!-- 8. TEMPLATE – how ONE card looks -->
  <div
    class="card card-hw border-start border-5"
    :class="{
      'border-danger': incident.status !== 'resolved' && incident.severity === 'high',
      'border-warning': incident.status !== 'resolved' && incident.severity === 'medium',
      'border-primary': incident.status !== 'resolved' && incident.severity === 'low',
      'border-success': incident.status === 'resolved',
    }"
    :data-testid="`incident-card-${incident._id}`"
  >
    <div class="card-body">
      <h3 class="h6 mb-1" :class="['bi', icon, 'me-5']">{{ label }}</h3>
      <p class="small text-muted mb-2">{{ school }}</p>
      <p class="mb-2">
        {{ reported }}
      </p>
      <p v-if="latestUpdate" class="mb-2">{{ latestUpdate }}</p>

      <button
        v-if="incident.status === 'new'"
        class="btn btn-sm btn-outline-primary"
        data-testid="incident-ack"
        @click="$emit('acknowledge', incident)"
      >
        Acknowledge
      </button>
      <button
        v-if="incident.status === 'acknowledged'"
        class="btn btn-sm btn-success"
        data-testid="incident-resolve"
        @click="$emit('resolve', incident)"
      >
        Resolve
      </button>
    </div>
  </div>
</template>
