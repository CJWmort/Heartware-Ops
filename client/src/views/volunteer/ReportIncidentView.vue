<script setup>
// Feature 4 – Incident Reporting (volunteer side) — owner: Wei Ming
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { onMounted, ref } from 'vue'
import { listTemplates, reportIncident, getAddressAt } from '@/services/incidents'
import { getUserLocation, geolocationMessage } from '@/utils/geolocation'

const templates = ref([])
const selectedType = ref(null)
const note = ref('')
const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')
const location = ref({}) // stores { lat, lng, accuracy } fetched from device
const locationStatus = ref(null) // default shall be null to cater for gps errors
const address = ref('') // address line to be pre-filled from GPS, volunteer can edit

onMounted(async () => {
  try {
    templates.value = await listTemplates()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
})

function selectTemplate(template) {
  selectedType.value = template.type // 1. remember which tile

  if (locationStatus.value === null) {
    locationStatus.value = 'loading'

    getUserLocation()
      .then((pos) => {
        location.value = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }
        locationStatus.value = 'ready'

        getAddressAt(pos.coords.latitude, pos.coords.longitude)
          .then((result) => {
            if (result && !address.value) address.value = result // don't overwrite what they typed
          })
          .catch(() => {}) // no address is fine, not an error
      })
      .catch((err) => {
        locationStatus.value = 'unavailable'
        errorMessage.value = geolocationMessage(err)
      })
  }
}

function reportAnother() {
  selectedType.value = null
  note.value = ''
  address.value = ''
  submitted.value = false
}

async function submitReport() {
  if (!selectedType.value || submitting.value || submitted.value) return // selectedType is null or submitting is false
  submitting.value = true
  errorMessage.value = ''

  try {
    const template = templates.value.find((template) => template.type === selectedType.value)

    // const { slotId, school, busNo, type, severity, note, lat, lng } = req.body;
    const payload = {
      type: selectedType.value,
      severity: template?.defaultSeverity || 'medium', //either takes defaultSeverity or baseline medium
      note: note.value,
      address: address.value.trim(),
    }

    if (locationStatus.value === 'ready') {
      //only if locationStatus is ready
      payload.lat = location.value.lat
      payload.lng = location.value.lng
    }

    await reportIncident(payload)
    submitted.value = true // confirms that report has been submitted to db
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section>
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
    <div v-if="submitted" class="alert alert-success" data-testid="incident-success">
      Report sent, HQ has been notified.
      <button type="button" class="btn btn-sm btn-outline-success ms-2" @click="reportAnother">
        Report another
      </button>
    </div>

    <form @submit.prevent="submitReport">
      <div class="row g-2 mb-3">
        <div v-for="template in templates" :key="template.type" class="col-6 align-content-center">
          <button
            class="btn"
            type="button"
            :class="{
              'btn-outline-danger': template.defaultSeverity === 'high',
              'btn-outline-warning': template.defaultSeverity === 'medium',
              'btn-outline-primary': template.defaultSeverity === 'low',
              active: selectedType === template.type,
            }"
            @click="selectTemplate(template)"
            :data-testid="`incident-type-${template.type}`"
          >
            {{ template.label }}
          </button>
        </div>
      </div>

      <div class="row g-2 mb-1" v-if="selectedType">
        <label for="note">Details for Incident:</label>
        <textarea
          class="form-control"
          v-model="note"
          maxlength="500"
          placeholder="Enter details of the incident in Who, What, When, Why and How Format"
          id="note"
          data-testid="incident-note"
        ></textarea>
        <label for="note-length">{{ note.length }} / 500</label>
        <label for="locationStatus"> GPS: {{ locationStatus }} </label>
        <label for="address" class="form-label">Your location:</label>
        <input
          id="address"
          v-model="address"
          class="form-control"
          placeholder="Postal code, building or road name"
        />
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="submitting || !note.trim()"
          data-testid="incident-submit"
        >
          Submit
        </button>
      </div>
    </form>
  </section>
</template>
