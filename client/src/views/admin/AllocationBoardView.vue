<script setup>
// Feature 1b – Smart Allocation (coordinator board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { ref } from 'vue'
import draggable from "vuedraggable";

// TODO(Fanny): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Event picker → "Run allocation" button (runAllocation) → coverage summary',
  'Board: one column/card per school, one row per bus slot; drag a volunteer chip between slots (HTML5 drag & drop or vuedraggable)',
  'Each move calls reassignSlot(); show returned warnings as badges (too far / not available / double-booked)',
  'Toggle to map view (BaseMap): schools coloured red/amber/green by % filled, lines volunteer → school',
  'Publish button with confirmation; live accepted/declined status per slot',
  'data-testids: alloc-event-select, alloc-run, alloc-summary, alloc-slot-<id>, alloc-volunteer-<id>, alloc-warning, alloc-view-toggle, alloc-publish',
]

// to be modified: api get
// wrapped in ref() so vuedraggable's changes (v-model) update counts + table live
const shows = ref([
  {
    "showName": "NE Show 1",
    "reportingDate": "11 July 2026",
    "schools": [
      {
        "reportingLoc": "Tampines Mock Primary School",
        "reportingTime": "14:00",
        "p5Classes": 3,
        "volunteers": [
          { "v_id": 1, "v_name": "ABC", "v_phoneNum": 81234567, "v_status": "Confirmed" },
          { "v_id": 3, "v_name": "CDE", "v_phoneNum": 83456789, "v_status": "Confirmed" },
          { "v_id": 4, "v_name": "DEF", "v_phoneNum": 84567890, "v_status": "Confirmed" }
        ]
      },
      {
        "reportingLoc": "Woodlands Mock Primary School",
        "reportingTime": "14:00",
        "p5Classes": 2,
        "volunteers": [
          { "v_id": 2, "v_name": "BCD", "v_phoneNum": 82345678, "v_status": "Confirmed" },
          { "v_id": 5, "v_name": "EFG", "v_phoneNum": 85678901, "v_status": "Confirmed" }
        ]
      },
      {
        "reportingLoc": "Jurong Mock Primary School",
        "reportingTime": "14:30",
        "p5Classes": 2,
        "volunteers": [
          { "v_id": 6, "v_name": "FGH", "v_phoneNum": 86789012, "v_status": "Confirmed" },
          { "v_id": 7, "v_name": "GHI", "v_phoneNum": 87890123, "v_status": "Pending" }
        ]
      }
    ]
  },
  {
    "showName": "NE Show 2",
    "reportingDate": "18 July 2026",
    "schools": [
      {
        "reportingLoc": "Tampines Mock Primary School",
        "reportingTime": "14:00",
        "p5Classes": 3,
        "volunteers": [
          { "v_id": 1, "v_name": "ABC", "v_phoneNum": 81234567, "v_status": "Confirmed" },
          { "v_id": 3, "v_name": "CDE", "v_phoneNum": 83456789, "v_status": "Confirmed" },
          { "v_id": 4, "v_name": "DEF", "v_phoneNum": 84567890, "v_status": "Pending" }
        ]
      },
      {
        "reportingLoc": "Woodlands Mock Primary School",
        "reportingTime": "14:00",
        "p5Classes": 2,
        "volunteers": [
          { "v_id": 2, "v_name": "BCD", "v_phoneNum": 82345678, "v_status": "Confirmed" },
          { "v_id": 5, "v_name": "EFG", "v_phoneNum": 85678901, "v_status": "Confirmed" }
        ]
      },
      {
        "reportingLoc": "Jurong Mock Primary School",
        "reportingTime": "14:30",
        "p5Classes": 2,
        "volunteers": [
          { "v_id": 6, "v_name": "FGH", "v_phoneNum": 86789012, "v_status": "Confirmed" }
        ]
      }
    ]
  }
])


const selectedShow = ref("")

// warnings shown as badges on a school card, keyed by reportingLoc
const warnings = ref({})

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
</script>


<template>
  <section>
    <PageHeader title="Allocation" icon="bi-grid-3x3-gap" />
    <FeaturePlaceholder feature="Feature 1b – Smart Allocation (coordinator board)" owner="Fanny" :todos="todos" />
    <!-- Suggested layout: toolbar (event, run, filters, board/map toggle, publish) above a responsive grid of school cards -->
     
      
  </section>
  <body>
    <label for="show"> Select show:</label>
    <select name="show" id="show" class="form-select" v-model="selectedShow" data-testid="alloc-event-select">
      <option v-for="show in shows" :value="show.showName">{{ show.showName }}</option>
    </select>

    <br /><br />
    <div v-for="show in shows">
      <span v-if="show.showName == selectedShow">
        <div class="card text-start m-2" v-for="school in show.schools" :key="school.reportingLoc" :data-testid="`alloc-slot-${school.reportingLoc}`">
          <div class="card-body">
            <h4 class="card-title">{{ school.reportingLoc }}</h4>
            <p class="card-text"> 
              reporting time: {{ school.reportingTime }} <br>
              volunter allocated: {{school.volunteers.length}}/{{ school.p5Classes }}
            </p>

            <!-- warning badges (too far / not available / double-booked / over capacity) -->
            <span v-for="(w, i) in warnings[school.reportingLoc]" :key="i" class="badge bg-warning text-dark me-1 mb-2" data-testid="alloc-warning">{{ w }}</span>

            <!-- vuedraggable v4: v-model + item-key + #item slot; same group name lets chips move between schools -->
            <draggable
              class="list-group mb-3"
              style="min-height: 48px"
              v-model="school.volunteers"
              group="volunteers"
              item-key="v_id"
              @change="onChange($event, school)"
            >
              <template #item="{ element: vol }">
                <div class="list-group-item" :data-testid="`alloc-volunteer-${vol.v_id}`">{{ vol.v_name}}</div>
              </template>
            </draggable>

            <table class="table tabler-hover table-striped">
              <tr>
                <th>Volunteer ID </th>
                <th>Volunteer Name </th>
                <th>Volunteer PN </th>
                <th>Volunteer Status </th>
              </tr>
              
              <tr v-for="vol in school.volunteers">
                <td>{{ vol.v_id }}</td>
                <td>{{ vol.v_name }}</td>
                <td>{{ vol.v_phoneNum }}</td>
                <td>{{ vol.v_status }}</td>
              </tr>

            </table>
          </div>
        </div>
      </span>
    </div>
    <!-- <span v-for="(val, show, idx) in shows">
      <table v-if="show == selectedShow " class="table-bordered">
        <tr>
          <td>Vol ID</td>
          <td>Name</td>
          <td>Phone Number</td>
          <td>Reporting Location</td>
          <td>Reporting time</td>
        </tr> 
        <tr v-for="vol in val">
          <td> {{ vol.v_id  }}</td>
          <td> {{ vol.v_name  }}</td>
          <td> {{ vol.v_phoneNum  }}</td>
          <td> {{ vol.v_reportingLoc  }}</td>
          <td> {{ vol.v_reportingTime  }}</td>
        </tr>
  
      </table>
    </span> -->
  </body>
  
  <!-- <button class="btn btn-brand btn-lg w-100 mt-2 tap-target">
        Run Allocations
     </button>
     <div class="my-5 bg-light-subtle border border-2 rounded p-3">
      <h1> Allocations</h1>
        <div class="flex-row gap-1 ">

          <div class="card text-start w-25">
            <div class="card-body">
              <h4 class="card-title">School Name</h4>
              <p class="card-text">
                reporting time:  <br>
                capacity:
              </p>
            </div>
          </div>
          

        </div>
      </div> -->
</template>