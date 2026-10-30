<!-- The volunteer's form to report an incident: choose a type, severity, add a note and send. -->

<script setup>
// Loads the incident types, fills in the address from the location, validates the form, asks for
// confirmation and sends the report.

import { computed, onMounted, ref, watch } from 'vue'
import { listTemplates, reportIncident, getAddressAt } from '@/services/incidents'
import ConfirmDialog from '../common/ConfirmDialog.vue'

const props = defineProps({
  location: { type: Object, default: null },
  school: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const templates = ref([])
const selectedType = ref(null)
const note = ref('')
const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')
const address = ref('')
const confirmDialog = ref(null)
let addressRequested = false

// severityClass (computed) - "severity-high / medium / low" for the chosen type (default medium) so
// the form colour matches what is sent to HQ.
const severityClass = computed(
  () => `severity-${selectedTemplate.value?.defaultSeverity || 'medium'}`,
)

// fillAddress() - 1) stop if we already asked or the GPS position is unknown 2) mark as asked 3) look
// up the street address of the position 4) if one came back and the box is still empty put it in 5)
// ignore any failure (the volunteer can type it).
function fillAddress() {
  if (addressRequested || !props.location) return
  addressRequested = true
  getAddressAt(props.location.lat, props.location.lng)
    .then((result) => {
      if (result && !address.value) address.value = result
    })
    .catch(() => {})
}
// When the GPS position arrives or changes, try fillAddress (first fix may come after the form opens).
watch(() => props.location, fillAddress)

// loadTemplates() - fetch the incident types from the server for the type picker; on failure show a
// message.
async function loadTemplates() {
  errorMessage.value = ''
  try {
    templates.value = await listTemplates()
  } catch (error) {
    errorMessage.value = error.friendlyMessage || 'Could not load the incident types.'
  }
}

// onMounted - fill in the address and load the incident types when the form opens.
onMounted(() => {
  fillAddress()
  loadTemplates()
})

// selectedTemplate (computed) - the full template (label, icon, severity) of the chosen type, or null.
const selectedTemplate = computed(
  () => templates.value.find((t) => t.type === selectedType.value) || null,
)

// backToTypes() - step 2 back arrow: forget the chosen type but keep the typed text.
function backToTypes() {
  selectedType.value = null
}

// selectTemplate(template) - a tile was tapped: remember its type (this moves the card to step 2).
function selectTemplate(template) {
  selectedType.value = template.type
}

// resetForm() - clear type, note and address, allow the address lookup again and run it for the next
// report.
function resetForm() {
  selectedType.value = null
  note.value = ''
  address.value = ''
  addressRequested = false
  fillAddress()
}

// answerConfirm(ok, text) - the "Report sent" popup was dismissed: 1) close the popup 2) clear
// "submitted" 3) reset the form 4) tell TrackingView to hide the card. (The two arguments are not
// used.)
function answerConfirm(ok, text) {
  confirmDialog.value = null
  submitted.value = false
  resetForm()
  emit('close')
}

// submitReport() - 1) stop if no type, already submitting or already submitted 2) show busy and clear
// the error 3) find the template 4) build the payload: type, severity (template default or "medium"),
// note, trimmed address, school 5) add lat and lng only if the GPS position is known 6) POST it 7)
// mark submitted and open the "Report sent!" popup with a green tick and only an OK button 8) on error
// show the message 9) always clear busy.
async function submitReport() {
  if (!selectedType.value || submitting.value || submitted.value) return
  submitting.value = true
  errorMessage.value = ''

  try {
    const template = templates.value.find((template) => template.type === selectedType.value)

    const payload = {
      type: selectedType.value,
      severity: template?.defaultSeverity || 'medium',
      note: note.value,
      address: address.value.trim(),
      school: props.school,
    }

    if (props.location) {
      payload.lat = props.location.lat
      payload.lng = props.location.lng
    }

    await reportIncident(payload)
    submitted.value = true
    confirmDialog.value = {
      title: 'Report sent!',
      text: 'HQ has been notified.',
      icon: 'bi-check-circle-fill',
      confirmText: 'Ok',
      hideCancel: true,
    }
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- Step one shows the incident type tiles; step two shows the severity, address, note and
       Send button. -->
  <section
    class="rep-card"
    :class="{ 'rep-card--large': selectedType }"
    aria-label="Report an incident"
  >
    <div class="d-flex justify-content-between align-items-center mb-2 gap-2">
      <div class="d-flex align-items-center gap-2 rep-title">
        <button
          v-if="selectedType"
          type="button"
          class="btn btn-sm btn-outline-secondary"
          aria-label="Back to incident types"
          @click="backToTypes"
        >
          <i class="bi bi-chevron-left"></i>
        </button>
        <h2 class="h5 mb-0">
          <template v-if="selectedType && selectedTemplate">
            <i class="bi me-1" :class="selectedTemplate.icon" aria-hidden="true"></i
            >{{ selectedTemplate.label }}
          </template>
          <template v-else>Report an incident</template>
        </h2>
      </div>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        aria-label="Close"
        @click="emit('close')"
      >
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <div class="rep-scroll">
      <div v-if="errorMessage" class="alert alert-danger d-flex align-items-center justify-content-between gap-2">
        <span>{{ errorMessage }}</span>
        <button v-if="!templates.length" type="button" class="btn btn-sm btn-outline-danger flex-shrink-0" @click="loadTemplates">
          Try again
        </button>
      </div>

      <div v-if="!selectedType" class="rep-tiles" role="group" aria-label="Incident type">
        <button
          v-for="template in templates"
          :key="template.type"
          type="button"
          class="rep-tile tap-target"
          :class="`severity-${template.defaultSeverity}`"
          @click="selectTemplate(template)"
          :data-testid="`incident-type-${template.type}`"
        >
          <i class="bi" :class="template.icon" aria-hidden="true"></i>
          <span>{{ template.label }}</span>
        </button>
      </div>

      <form v-else class="rep-form" :class="severityClass" @submit.prevent="submitReport">
        <label for="note" class="form-label mb-1">Details for Incident:</label>
        <textarea
          class="form-control rep-field"
          v-model="note"
          maxlength="500"
          rows="6"
          placeholder="Enter details of the incident in Who, What, When, Why and How Format"
          id="note"
          data-testid="incident-note"
        ></textarea>
        <small class="text-muted-hw d-block mb-3">{{ note.length }} / 500</small>

        <label for="address" class="form-label mb-1">Current Address:</label>
        <input
          id="address"
          v-model="address"
          class="form-control rep-field mb-3"
          placeholder="Postal code, building or road name"
        />
        <button
          class="btn btn-brand w-100"
          type="submit"
          :disabled="submitting || !note.trim()"
          data-testid="incident-submit"
        >
          Submit
        </button>
      </form>
    </div>
    <ConfirmDialog :dialog="confirmDialog" @answer="answerConfirm" />
  </section>
</template>

<style scoped>
/* Styles for the type tiles and severity buttons. */

.rep-card {
  position: absolute;
  z-index: 1110;
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
  transition: width 0.2s ease;
}
.rep-card--large {
  width: min(520px, calc(100% - 24px));
}
.rep-title {
  min-width: 0;
}
.rep-scroll {
  min-height: 0;
  overflow-y: auto;
}
@media (max-width: 767.98px) {
  .rep-card {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 60vh;
    border-radius: var(--hw-radius) var(--hw-radius) 0 0;
  }
  .rep-card--large {
    width: auto;
    max-height: 90vh;
  }
}

.rep-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rep-tile {
  --severity: var(--bs-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--hw-surface);
  color: var(--hw-text);
  border: 1px solid var(--bs-border-color);
  border-left: 4px solid var(--severity);
  border-radius: var(--hw-radius);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
}
.rep-tile i {
  flex: 0 0 auto;
  color: var(--severity);
  font-size: 1.2rem;
}
.rep-tile.severity-high {
  --severity: var(--bs-danger);
}
.rep-tile.severity-medium {
  --severity: var(--bs-warning);
}
.rep-tile.severity-low {
  --severity: var(--bs-primary);
}
.rep-tile:hover {
  background: color-mix(in srgb, var(--severity) 10%, var(--hw-surface));
}
.rep-tile:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}
.rep-form {
  --severity: var(--bs-primary);
}
.rep-form.severity-high {
  --severity: var(--bs-danger);
}
.rep-form.severity-medium {
  --severity: var(--bs-warning);
}
.rep-form.severity-low {
  --severity: var(--bs-primary);
}

.rep-field.form-control {
  border: 2px solid var(--severity);
  background: color-mix(in srgb, var(--severity) 6%, var(--hw-surface));
}
.rep-field.form-control:focus {
  border-color: var(--severity);
  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--severity) 25%, transparent);
}
</style>
