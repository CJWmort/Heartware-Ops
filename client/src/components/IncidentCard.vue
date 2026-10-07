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

// 3. SEVERITY_LABEL
const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

// 4. label
const label = computed(() => props.template?.label || props.incident.type)

// 5. icon
const icon = computed(() => props.template?.icon || 'bi-exclamation-circle-fill')

// 6. school name
const school = computed(() => props.incident.school || 'Unknown school')

// 7. latest update to display first
const latestUpdate = computed(() => {
  //array must not be empty
  let result = ''
  if (props.incident.history.length !== 0) {
    result = props.incident.history.at(-1)?.note || '' //this will return the latest update from history or empty string if it is empty
  }
  return result
})
</script>

<template>
  <!-- 3. TEMPLATE – how ONE card looks -->
  <div
    class="card card-hw border-start border-5"
    :class="{
      'border-danger': incident.severity === 'high',
      'border-warning': incident.severity === 'medium',
      'border-secondary': incident.severity === 'low',
    }"
    :data-testid="`incident-card-${incident._id}`"
  >
    <div class="card-body">
      <h3 class="h6 mb-1" :class="['bi', icon, 'me-2']">{{ label }}</h3>
      <p class="small text-muted mb-2">{{ school }}</p>
      <p class="mb-2">{{ incident.note }}</p>
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
