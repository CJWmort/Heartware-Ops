<script setup>
// Feature 4 – Incident Reporting (volunteer side) — owner: Wei Ming
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { computed, onMounted, ref, watch } from 'vue'
import { listTemplates, reportIncident, getAddressAt } from '@/services/incidents'
import ConfirmDialog from '../common/ConfirmDialog.vue'

// PROP = data the parent (Tracking) hands DOWN to this component
const props = defineProps({ location: { type: Object, default: null } }) // { lat, lng, accuracy } or null
const emit = defineEmits(['close']) // EMIT = message sent UP to Tracking: 'close' tells it to hide this card

const templates = ref([])
const selectedType = ref(null)
const note = ref('')
const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')
const locationStatus = computed(() => (props.location ? 'ready' : 'unavailable'))
const address = ref('') // address line to be pre-filled from GPS, volunteer can edit
const confirmDialog = ref(null) // the card's content, or null while closed`
let addressRequested = false // Tracking's location changes every few seconds; ask for the address only once

// Turns the chosen incident's severity into a CSS class name, e.g. 'severity-high'.
// Falls back to 'medium', the same default that submitReport() uses, so the colour always matches what is sent to HQ.
const severityClass = computed(
  () => `severity-${selectedTemplate.value?.defaultSeverity || 'medium'}`,
)

function fillAddress() {
  if (addressRequested || !props.location) return
  addressRequested = true
  getAddressAt(props.location.lat, props.location.lng)
    .then((result) => {
      if (result && !address.value) address.value = result
    })
    .catch(() => {})
}
watch(() => props.location, fillAddress) // the first GPS fix may arrive after the form opens

onMounted(async () => {
  fillAddress() // GPS may already be known when the card opens
  try {
    templates.value = await listTemplates()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
})

// The full template of the chosen type (label, icon, severity), used for the step-2 header
const selectedTemplate = computed(
  () => templates.value.find((t) => t.type === selectedType.value) || null,
)

// Back arrow in step 2: return to the type tiles (what the volunteer typed is kept)
function backToTypes() {
  selectedType.value = null
}

function selectTemplate(template) {
  selectedType.value = template.type // 1. remember which tile
}

// null = dialog closed. Setting it to an object opens the card (same pattern as IncidentQueueView).

function resetForm() {
  selectedType.value = null
  note.value = ''
  address.value = ''
  addressRequested = false // allow the address to be pre-filled again for the next report
  fillAddress()
}

function answerConfirm(ok, text) {
  confirmDialog.value = null
  submitted.value = false
  resetForm() // only reset form as the form has been submitted to the server
  emit('close') // "Done" -> tell Tracking to hide this card
}

async function submitReport() {
  if (!selectedType.value || submitting.value || submitted.value) return // selectedType is null or submitting is false
  submitting.value = true
  errorMessage.value = ''

  try {
    const template = templates.value.find((template) => template.type === selectedType.value)

    // const { slotId, school, type, severity, note, lat, lng } = req.body;
    const payload = {
      type: selectedType.value,
      severity: template?.defaultSeverity || 'medium', //either takes defaultSeverity or baseline medium
      note: note.value,
      address: address.value.trim(),
    }

    if (props.location) {
      //only if location is ready
      payload.lat = props.location.lat
      payload.lng = props.location.lng
    }

    await reportIncident(payload)
    submitted.value = true // blocks double-submits while the dialog is open
    // confirmDialog sends a pop-up to notify volunteer that report has been sent successfully to HQ
    confirmDialog.value = {
      title: 'Report sent!',
      text: 'HQ has been notified.',
      icon: 'bi-check-circle-fill', // a green tick instead of the default question mark
      confirmText: 'Ok',
      hideCancel: true,
    }
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  } finally {
    submitting.value = false // this will re-enable Submit button
  }
}
</script>

<template>
  <!-- Two steps in one card: STEP 1 = pick a type (small card), STEP 2 = the larger form for that type.
       selectedType decides the step: null = step 1, a value = step 2. -->
  <section
    class="rep-card"
    :class="{ 'rep-card--large': selectedType }"
    aria-label="Report an incident"
  >
    <!-- No '&& !submitted' checks here: while the 'Report sent' popup is open the card keeps its step-2 look instead of shrinking behind it -->
    <!-- Header: step 1 shows the title; step 2 shows a back arrow + the chosen type -->
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

    <!-- Only this part scrolls when the content is taller than the card -->
    <div class="rep-scroll">
      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <!-- STEP 1: the type tiles -->
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

      <!-- STEP 2: the larger form for the chosen type -->
      <!-- :class adds e.g. "severity-high" to the form, so the CSS below can pick the colour -->
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
          class="btn btn-secondary w-100"
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
/* Same look as the other floating cards in the project (IncidentFocusCard, Allocation board): the shared design
   tokens from assets/main.css, so light / dark theme and radius stay consistent. Left card on tablet/desktop,
   bottom sheet on phones. */
.rep-card {
  position: absolute;
  z-index: 1110; /* above Leaflet (1000) and the route sheet (1050), below the notice (1120) */
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
/* Step 2: a wider card for the form */
.rep-card--large {
  width: min(520px, calc(100% - 24px));
}
.rep-title {
  min-width: 0; /* lets the title shrink instead of pushing the X out */
}
.rep-scroll {
  min-height: 0; /* lets this flex child scroll instead of growing */
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
    max-height: 90vh; /* nearly full height in step 2, so the form and the keyboard have room */
  }
}

/* Type tiles: 2 columns. Colour by severity, using the same Bootstrap colours as .incident-btn in main.css. */
.rep-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rep-tile {
  --severity: var(--bs-primary); /* default = low = blue */
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--hw-surface);
  color: var(--hw-text);
  border: 1px solid var(--bs-border-color);
  border-left: 4px solid var(--severity); /* the severity stripe */
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
/* Severity colour for the step-2 textboxes. Same --severity trick as .rep-tile above,
   so the colours match the tiles and the map pins. */
.rep-form {
  --severity: var(--bs-primary); /* default = low = blue */
}
.rep-form.severity-high {
  --severity: var(--bs-danger); /* red */
}
.rep-form.severity-medium {
  --severity: var(--bs-warning); /* amber */
}
.rep-form.severity-low {
  --severity: var(--bs-primary); /* blue */
}

/* Resting state: coloured border plus a very light tint (6% severity colour mixed into the card colour,
   so it still looks right in dark mode). */
.rep-field.form-control {
  border: 2px solid var(--severity);
  background: color-mix(in srgb, var(--severity) 6%, var(--hw-surface));
}
/* While typing: replace Bootstrap's default blue glow with a glow in the severity colour */
.rep-field.form-control:focus {
  border-color: var(--severity);
  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--severity) 25%, transparent);
}
</style>
