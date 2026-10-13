<script setup>
// Feature 1b – Smart Allocation (coordinator board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { ref, computed } from 'vue'
import draggable from "vuedraggable";
import axios from 'axios';

// TODO(Fanny): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Event picker → "Run allocation" button (runAllocation) → coverage summary',
  'Board: one column/card per school, one row per bus slot; drag a volunteer chip between slots (HTML5 drag & drop or vuedraggable)',
  'Each move calls reassignSlot(); show returned warnings as badges (too far / not available / double-booked)',
  'Toggle to map view (BaseMap): schools coloured red/amber/green by % filled, lines volunteer → school',
  'Publish button with confirmation; live accepted/declined status per slot',
  'data-testids: alloc-event-select, alloc-run, alloc-summary, alloc-slot-<id>, alloc-volunteer-<id>, alloc-warning, alloc-view-toggle, alloc-publish',
]

const assignments = ref([])
const shows = ["NE Show 1","NE Show 2","NE Show 3","NE Show 4"]
const selectedShow = ref("")
const schools = ref([])
const searchbar = ref('')
const groupedAssignments = computed(() => {
  // Step 1: build { show: { schools: [...] } }
  const byShow = {};

  for (const a of assignments.value) {
    if (!byShow[a.show]) {
      byShow[a.show] = { schools: [] };
    }
    const schools = byShow[a.show].schools;

    // Find the school inside this show, or add it
    // ({ ...a.school } copies every school field unchanged)
    let schoolEntry = null;
    for (const s of schools) {
      if (s._id === a.school._id) schoolEntry = s;
    }
    if (!schoolEntry) {
      schoolEntry = { ...a.school, volunteers: [] };
      schools.push(schoolEntry);
    }

    // Add the volunteer: every volunteer field unchanged,
    // plus status and distance, which belong to the assignment
    schoolEntry.volunteers.push({
      ...a.volunteer,
      status: a.status,
      distance: a.distance,
    });
  }

  // Step 2: rebuild the object with the show names in order (NE Show 1, 2, 3, 4)
  const result = {};
  for (const show of Object.keys(byShow).sort()) {
    result[show] = byShow[show];
  }
  return result;
});

const API_URL = "/api/"

// warnings shown as badges on a school card, keyed by reportingLoc
const warnings = ref({})

async function loadData(){
  const response = await axios.get(API_URL+"assignments");
  assignments.value = response.data;  
  console.log(assignments.value);

  const schools = await axios.get(API_URL+"schools")
  schools.value = schools.data;
}

async function runAllocation(){
  const response = await axios.get(API_URL+"assignments/run");
  assignments.value = response.data;
}

function addWarning(school, msg) {
  if (!warnings.value[school.reportingLoc]) warnings.value[school.reportingLoc] = []
  warnings.value[school.reportingLoc].push(msg)
}

function clearWarnings(school) {
  warnings.value[school.reportingLoc] = []
}

// Fires on every list involved in a drag: evt.added / evt.removed / evt.moved
async function onChange(evt, school) {
  if (evt.added) {
    const vol = evt.added.element
    clearWarnings(school)

    // TODO: call reassignSlot() here and push each returned warning with addWarning(school, w)
    // e.g. const res = await reassignSlot({ volunteerId: vol.v_id, toSchool: school.reportingLoc })
    //      res.warnings.forEach(w => addWarning(school, w))

    // over capacity -> warning badge (not a hard block)
    if (school.volunteers.length > school.p5Classes) {
      addWarning(school, `Over capacity (${school.volunteers.length}/${school.p5Classes})`)
    }
    // same volunteer already placed at another school in this show -> double-booked
    console.log(`${vol.v_name} moved to ${school.reportingLoc}`)
  }
  if (evt.removed) {
    clearWarnings(school)
    if (school.volunteers.length > school.p5Classes) {
      addWarning(school, `Over capacity (${school.volunteers.length}/${school.p5Classes})`)
    }
  }
}

loadData();
</script>


<template>
  <section>
    <PageHeader title="Allocation" icon="bi-grid-3x3-gap" />
    <FeaturePlaceholder feature="Feature 1b – Smart Allocation (coordinator board)" owner="Fanny" :todos="todos" />
    <!-- Suggested layout: toolbar (event, run, filters, board/map toggle, publish) above a responsive grid of school cards -->
     
      
  </section>
  <body>
    <button class="btn btn-brand btn-lg w-100 mt-2 tap-target" @click = "runAllocation">
        Run Allocations
     </button> <br>

    <div class="bg-dark-subtle border border-1 rounded p-2" >
    <label for="show"> Select show:</label>
    <select name="show" id="show" class="form-select" v-model="selectedShow" data-testid="alloc-event-select">
      <option v-for="show in shows" :value="show">{{ show }}</option>
    </select>
    <input type="text" class=" form-control my-2" placeholder="School search" v-model="searchbar">
        
    <div v-if="groupedAssignments[selectedShow]">
      <span v-for="school in groupedAssignments[selectedShow].schools">
      <div class="card text-start my-2" v-if="searchbar == '' || school.name.toUpperCase().includes(searchbar.toUpperCase())">
        <div class="card-body">
          <h4 class="card-title">{{school.name}} </h4>
          <p class="card-text">
            Reporting time: {{school.reportingTime}} <br>
            Capacity: {{school.volunteers.length}}/{{school.p5Classes}}
          </p>

          <div v-for="volunteer in school.volunteers" class="border border-1 rounded p-2 m-1 d-flex justify-content-between">
            <span> {{  volunteer.name }} ({{ volunteer.phone }}) </span>
            <span class="badge rounded-pill text-bg-warning"> {{  volunteer.status }} </span>
          </div>
        </div>
      </div>
      </span>
    </div>
    <p v-else> There are no assignments.</p>
    </div>

  </body>
</template>