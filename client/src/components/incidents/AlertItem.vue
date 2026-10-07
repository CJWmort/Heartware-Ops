<script setup>
// Display-only row for one missed-checkpoint alert (Feature 4 – Wei Ming).
// The Acknowledge button only emits an event – the page decides what happens.
//
// Usage:
//   <AlertItem :alert="alert" @acknowledge="..." />
import { computed } from 'vue'
import { CHECKPOINT_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/time'

const props = defineProps({
  alert: { type: Object, required: true },
})
defineEmits(['acknowledge'])

const checkpoint = computed(
  () => CHECKPOINT_LABELS[props.alert.missedCheckpoint] ?? props.alert.missedCheckpoint,
)
const isOpen = computed(() => props.alert.status === 'open')
</script>

<template>
  <div
    class="alert-item d-flex align-items-center gap-3"
    :class="{ 'is-open': isOpen }"
    :data-testid="`alert-${alert._id}`"
  >
    <i
      :class="['bi', isOpen ? 'bi-exclamation-triangle-fill' : 'bi-check-circle', 'fs-5 alert-icon']"
      aria-hidden="true"
    ></i>
    <div class="flex-grow-1 small" style="min-width: 0">
      <div class="fw-semibold text-truncate">
        {{ alert.slot?.school?.name }} · {{ alert.slot?.busNo }}
      </div>
      <div class="text-muted-hw">
        Missed <strong>{{ checkpoint }}</strong> · due {{ timeAgo(alert.dueAt) }}
      </div>
    </div>
    <button
      v-if="isOpen"
      type="button"
      class="btn btn-sm btn-light flex-shrink-0"
      data-testid="alert-ack"
      @click="$emit('acknowledge', alert)"
    >
      Acknowledge
    </button>
    <span v-else class="small text-muted-hw flex-shrink-0">Acknowledged</span>
  </div>
</template>

<style scoped>
.alert-item {
  padding: 0.625rem 0.875rem;
  border-radius: 0.6rem;
  background: var(--hw-surface);
  border: 1px solid #e5e7eb;
}
.alert-item.is-open {
  background: color-mix(in srgb, var(--hw-danger) 8%, var(--hw-surface));
  border-color: color-mix(in srgb, var(--hw-danger) 35%, transparent);
}
.alert-icon {
  color: var(--hw-muted);
}
.is-open .alert-icon {
  color: var(--hw-danger);
}
</style>
