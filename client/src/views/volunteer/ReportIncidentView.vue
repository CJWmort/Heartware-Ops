<script setup>
// Feature 4 – Incident Reporting (volunteer side) — owner: Wei Ming
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { listTemplates } from '@/services/incidents'
import { onMounted, ref } from 'vue'

const templates = ref([])
const selectedType = ref(null)
const note = ref('')
const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')

// TODO(Wei Ming): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Big one-tap template buttons from listTemplates() (Student unwell, Bus delayed, Lost item, Other)',
  'Optional note (max 500 chars with counter) + optional photo (camera input, resize before upload)',
  'Location + your slot attached automatically; reportIncident() → success screen with "Report another"',
  'Your recent reports with their status (new / acknowledged / resolved)',
  'data-testids: incident-type-<TYPE>, incident-note, incident-photo, incident-submit, incident-success',
]
onMounted(async () => {
  try {
    templates.value = await listTemplates()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
})
</script>

<template>
  <section>
    <PageHeader title="Incident Report" icon="bi-exclamation-triangle" />
    <FeaturePlaceholder
      feature="Feature 4 – Incident Reporting (volunteer side)"
      owner="Wei Ming"
      :todos="todos"
    />

    <div class="row g-2">
      <div v-for="template in templates" :key="template.type" class="col-6 align-content-center">
        <button
          class="btn"
          :class="{
            'btn-outline-danger': template.defaultSeverity === 'high',
            'btn-outline-warning': template.defaultSeverity === 'medium',
            'btn-outline-primary': template.defaultSeverity === 'low',
          }"
          @click="selectedType === template.defaultSeverity"
          :data-testid="`incident-type-${template.type}`"
        >
          {{ template.label }}
        </button>
      </div>
    </div>
  </section>
</template>
