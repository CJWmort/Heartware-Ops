<script setup>
// Feature 1b – Smart Allocation (coordinator board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { ref } from 'vue'
import draggable from 'vuedraggable'
import axios from 'axios'

// TODO(Fanny): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Event picker → "Run allocation" button (runAllocation) → coverage summary',
  'Board: one column/card per school, one row per bus slot; drag a volunteer chip between slots (HTML5 drag & drop or vuedraggable)',
  'Each move calls reassignSlot(); show returned warnings as badges (too far / not available / double-booked)',
  'Toggle to map view (BaseMap): schools coloured red/amber/green by % filled, lines volunteer → school',
  'Publish button with confirmation; live accepted/declined status per slot',
  'data-testids: alloc-event-select, alloc-run, alloc-summary, alloc-slot-<id>, alloc-volunteer-<id>, alloc-warning, alloc-view-toggle, alloc-publish',
]

const API_URL = '/api/'

const assignments = ref([])
const shows = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const selectedShow = ref('')
const searchbar = ref('')

// The board is a plain reactive object (NOT a computed) so that vuedraggable
// can write the reordered volunteer arrays back into it.
// Shape: { 'NE Show 1': { schools: [{ ...school, volunteers: [...] }] }, ... }
const board = ref({})

// warnings shown as badges on a school card, keyed by reportingLoc
const warnings = ref({})

// Stable key for each volunteer chip (adjust if your volunteer id field differs)
const volKey = (v) => v._id ?? v.v_id ?? v.phone ?? v.name

function buildBoard(list) {
  const byShow = {}

  for (const a of list) {
    if (!byShow[a.show]) byShow[a.show] = { schools: [] }
    const schoolsInShow = byShow[a.show].schools

    let entry = schoolsInShow.find((s) => s._id === a.school._id)
    if (!entry) {
      entry = { ...a.school, volunteers: [] }
      schoolsInShow.push(entry)
    }

    entry.volunteers.push({
      ...a.volunteer,
      status: a.status,
      distance: a.distance,
    })
  }

  // show names in order (NE Show 1, 2, 3, 4)
  const result = {}
  for (const show of Object.keys(byShow).sort()) result[show] = byShow[show]
  board.value = result
  warnings.value = {}
}

async function loadData() {
  const response = await axios.get(API_URL + 'assignments')
  assignments.value = response.data
  buildBoard(assignments.value)
}

async function runAllocation() {
  const response = await axios.get(API_URL + 'assignments/run')
  assignments.value = response.data
  buildBoard(assignments.value)
}

function addWarning(school, msg) {
  if (!warnings.value[school.reportingLoc]) warnings.value[school.reportingLoc] = []
  warnings.value[school.reportingLoc].push(msg)
}

function clearWarnings(school) {
  warnings.value[school.reportingLoc] = []
}

function checkCapacity(school) {
  if (school.volunteers.length > school.p5Classes) {
    addWarning(school, `Over capacity (${school.volunteers.length}/${school.p5Classes})`)
  }
}

// Fires on every list involved in a drag: evt.added / evt.removed / evt.moved
async function onChange(evt, school) {
  if (evt.added) {
    const vol = evt.added.element
    clearWarnings(school)

    // TODO: persist the move and show server warnings, e.g.
    // const res = await reassignSlot({ volunteerId: vol._id, toSchool: school.reportingLoc })
    // res.warnings.forEach((w) => addWarning(school, w))

    // over capacity -> warning badge (not a hard block)
    checkCapacity(school)
    console.log(`${vol.name} moved to ${school.reportingLoc}`)
  }
  if (evt.removed) {
    clearWarnings(school)
    checkCapacity(school)
  }
}

function matchesSearch(school) {
  return searchbar.value === '' || school.name.toUpperCase().includes(searchbar.value.toUpperCase())
}

loadData()
</script>

<template>
  <section>
    <PageHeader title="Allocation" icon="bi-grid-3x3-gap" />
    <FeaturePlaceholder feature="Feature 1b – Smart Allocation (coordinator board)" owner="Fanny" :todos="todos" />
    <!-- Suggested layout: toolbar (event, run, filters, board/map toggle, publish) above a responsive grid of school cards -->

    <button
      class="btn btn-brand btn-lg w-100 mt-2 tap-target"
      data-testid="alloc-run"
      @click="runAllocation"
    >
      Run Allocations
    </button>
    <br />

    <div class="bg-dark-subtle border border-1 rounded p-2">
      <label for="show">Select show:</label>
      <select
        name="show"
        id="show"
        class="form-select"
        v-model="selectedShow"
        data-testid="alloc-event-select"
      >
        <option v-for="show in shows" :key="show" :value="show">{{ show }}</option>
      </select>
      <input type="text" class="form-control my-2" placeholder="School search" v-model="searchbar" />

      <div v-if="board[selectedShow]">
        <template v-for="school in board[selectedShow].schools" :key="school._id">
          <div class="card text-start my-2" v-if="matchesSearch(school)">
            <div class="card-body">
              <h4 class="card-title">{{ school.name }}</h4>
              <p class="card-text">
                Reporting time: {{ school.reportingTime }} <br />
                Capacity: {{ school.volunteers.length }}/{{ school.p5Classes }}
              </p>

              <!-- warning badges -->
              <div v-if="warnings[school.reportingLoc]?.length" class="mb-2">
                <span
                  v-for="(w, i) in warnings[school.reportingLoc]"
                  :key="i"
                  class="badge text-bg-danger me-1"
                  data-testid="alloc-warning"
                >
                  {{ w }}
                </span>
              </div>

              <!-- drop zone: volunteers can be dragged between schools in the same show -->
              <draggable
                v-model="school.volunteers"
                :group="'volunteers-' + selectedShow"
                :item-key="volKey"
                class="volunteer-list"
                ghost-class="drag-ghost"
                :data-testid="'alloc-slot-' + school._id"
                @change="onChange($event, school)"
              >
                <template #item="{ element: volunteer }">
                  <div
                    class="border border-1 rounded p-2 m-1 d-flex justify-content-between volunteer-chip"
                    :data-testid="'alloc-volunteer-' + volKey(volunteer)"
                  >
                    <span>{{ volunteer.name }} ({{ volunteer.phone }})</span>
                    <span class="badge rounded-pill text-bg-warning">{{ volunteer.status }}</span>
                  </div>
                </template>
              </draggable>
            </div>
          </div>
        </template>
      </div>
      <p v-else>There are no assignments.</p>
    </div>
  </section>
</template>

<style scoped>
.volunteer-list {
  min-height: 3rem; /* keeps an empty school droppable */
  padding: 0.25rem;
  border: 1px dashed var(--bs-border-color);
  border-radius: 0.5rem;
}
.volunteer-chip {
  cursor: grab;
  background: var(--bs-body-bg);
}
.volunteer-chip:active {
  cursor: grabbing;
}
.drag-ghost {
  opacity: 0.4;
}
</style>
