<script setup>
// Feature 1b – Smart Allocation (coordinator board) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { ref, computed, watch} from 'vue'
import draggable from "vuedraggable";
import axios from 'axios';
import BaseMap from '@/components/BaseMap.vue'

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
const selectedShow = ref("NE Show 1")
const searchbar = ref('')
const runningAlloc = ref(false)
const errorMessage = ref('') // NEW: shown in a red box, so a failed load/run no longer looks like "There are no assignments."
const publishing = ref(false) // NEW: disables the Publish button while the request is running
const notice = ref('') // NEW: green confirmation after publishing
const groupedAssignments = computed(() => {
  // Step 1: build { show: { schools: [...], unassigned: [...] } }
  const byShow = {};
 
  for (const a of assignments.value) {
    if (!byShow[a.show]) {
      byShow[a.show] = { schools: [], unassigned: [] };
    }
 
    // A free volunteer has no school: list them separately and move on
    // (assignmentId identifies the record so a drag can update it;
    //  distance is null, so it is left out)
    if (!a.school) {
      byShow[a.show].unassigned.push({
        ...a.volunteer,
        assignmentId: a._id,
        status: a.status,
        published: a.published, // NEW: lets the board mark draft rows
      });
      continue;
    }

    const showSchools = byShow[a.show].schools;

    // Find the school inside this show, or add it
    // ({ ...a.school } copies every school field unchanged)
    let schoolEntry = null;
    for (const s of showSchools) {
      if (s._id === a.school._id) schoolEntry = s;
    }
    if (!schoolEntry) {
      schoolEntry = { ...a.school, volunteers: [] };
      showSchools.push(schoolEntry);
    }

    // Add the volunteer: every volunteer field unchanged,
    // plus status and distance, which belong to the assignment
    schoolEntry.volunteers.push({
      ...a.volunteer,
      status: a.status,
      distance: a.distance,
      published: a.published, // NEW: lets the board mark draft rows
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

// NEW: Declined / Withdrawn volunteers no longer fill a place, so they are not counted in "Capacity x/y"
// (otherwise a school would look full while it actually needs a replacement)
function filledCount(school) {
  return school.volunteers.filter(v => v.status !== 'Declined' && v.status !== 'Withdrawn').length
}


// CHANGED: added try/catch. Before, any failure (e.g. 403 when not admin) left the page saying "There are no assignments."
async function loadData(){
  errorMessage.value = "";
  try {
    const response = await axios.get(API_URL+"assignments");
    assignments.value = response.data;
  } catch (error) {
    errorMessage.value = error.response?.data?.message || "Could not load assignments.";
  }
}

// CHANGED: was GET /run (anyone, even a link preview, could wipe the allocation); now a confirmed POST.
// reset = false: accepted volunteers keep their school, everyone else is matched to the open places.
// reset = true : erases EVERYTHING (including accepted) and starts again.
async function runAllocation(reset = false){
  const question = reset
    ? "RESET: this erases ALL assignments, including volunteers who already accepted. Continue?"
    : "Run allocation? Volunteers who already accepted keep their school; everyone else is matched again.";
  if (!confirm(question)) return; // the run replaces data, so always ask first
  runningAlloc.value = true;
  errorMessage.value = "";
  notice.value = "";
  try {
    const response = await axios.post(API_URL+"assignments/run", { reset });
    assignments.value = response.data;
  } catch (error) {
    errorMessage.value = error.response?.data?.message || "Could not run the allocation.";
  } finally {
    runningAlloc.value = false; // finally: the button is re-enabled even when the request fails
  }
}

// NEW (publish step): rows still marked as drafts (published = false) in the selected show
const draftCount = computed(() => {
  let n = 0;
  for (const a of assignments.value) {
    if (a.show === selectedShow.value && !a.published) n++;
  }
  return n;
});

// NEW (publish step): volunteers only see an allocation after this. It lets the admin review the result first.
async function publishShow(){
  if (!confirm(`Publish ${selectedShow.value}? Volunteers will see their school and can accept or decline.`)) return;
  publishing.value = true;
  errorMessage.value = "";
  notice.value = "";
  try {
    await axios.post(API_URL+"assignments/publish", { show: selectedShow.value });
    await loadData(); // reload so every row now shows as published
    notice.value = `${selectedShow.value} is now visible to volunteers.`;
  } catch (error) {
    errorMessage.value = error.response?.data?.message || "Could not publish.";
  } finally {
    publishing.value = false;
  }
}

let L = null
let map = null
let markersGroup = null;
let linesGroup = null;

function onMapReady(m, leaflet) {
  map = m
  L = leaflet

  markersGroup = L.layerGroup().addTo(map);
  linesGroup = L.layerGroup().addTo(map);
  // FIX: the map was empty on first load because it was only drawn when the dropdown changed.
  // Draw once here too, in case the assignments arrived before the map was ready.
  renderMapElements();
}


function renderMapElements() {
  if (!map || !L || !selectedShow.value) return;

  const currentShowData = groupedAssignments.value[selectedShow.value];
  if (!currentShowData) return;

  // 1. Clear both markers and connecting lines from previous renders
  if (markersGroup) markersGroup.clearLayers();
  if (linesGroup) linesGroup.clearLayers();

  const redDefaultIcon = L.divIcon({
    className: 'red-pin-filter',
    html: `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" style="width:25px;height:41px;"/>`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    shadowSize: [41, 41]
  });


  currentShowData.schools.forEach((school) => {
    // Check school coordinates
    if (school.lat && school.lng) {
      const schoolMarker = L.marker([school.lat, school.lng], {icon: redDefaultIcon}).bindPopup(`<b>${school.name}</b>`);
      markersGroup.addLayer(schoolMarker);

      // Loop through assigned volunteers
      school.volunteers.forEach((vol) => {
        if (vol.lat && vol.lng) {
          // Add Volunteer Marker
          const volMarker = L.marker([vol.lat, vol.lng]).bindPopup(`<b>${vol.name}</b> (Volunteer)`);
          markersGroup.addLayer(volMarker);

          // 2. Draw connecting line between Volunteer and School
          const line = L.polyline(
            [
              [vol.lat, vol.lng],     // Start: Volunteer coordinates
              [school.lat, school.lng] // End: School coordinates
            ],
            {
              color: '#0066ff', // Line color
              weight: 2,        // Line thickness
              opacity: 0.3
            }
          );

          linesGroup.addLayer(line);
        }
      });
    }
  });
}

watch(
  // FIX: also watch groupedAssignments, so the map redraws when data loads or after Run (not only on a dropdown change)
  [selectedShow, groupedAssignments],
  () => {
    renderMapElements();
  },
  { deep: true } // Ensures updates trigger when pushing or modifying array items
);

loadData();
</script>


<template>
  <section>
    <PageHeader title="Allocation" icon="bi-grid-3x3-gap" />
    <FeaturePlaceholder feature="Feature 1b – Smart Allocation (coordinator board)" owner="Fanny" :todos="todos" />
    <!-- Suggested layout: toolbar (event, run, filters, board/map toggle, publish) above a responsive grid of school cards -->
     
      
  </section>
  <BaseMap :zoom="12" @ready="onMapReady"/>
  <body>
    <!-- <p>{{ groupedAssignments }}</p> -->
    <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">{{ errorMessage }}</div>
    <div v-if="notice" class="alert alert-success py-2" role="status">{{ notice }}</div>
    <div v-if="runningAlloc" class="alert alert-info py-2" role="alert" >
            Allocating...
    </div>
    <button class="btn btn-brand btn-lg w-100 mt-2 tap-target" :disabled="runningAlloc" @click = "runAllocation(false)">
        Run Allocations
     </button>
     <button class="btn btn-outline-danger btn-sm mt-2" :disabled="runningAlloc" data-testid="alloc-reset" @click="runAllocation(true)">
        Reset everything (erases accepted)
     </button> <br>

     <label for="show"> Select show:</label>
     <select name="show" id="show" class="form-select" v-model="selectedShow" data-testid="alloc-event-select">
       <option v-for="show in shows" :value="show">{{ show }}</option>
     </select>
     <!-- NEW: publish button for the show selected above. Disabled when nothing is waiting, so it cannot be pressed by accident. -->
     <button class="btn btn-success btn-sm mt-2" :disabled="publishing || draftCount === 0" data-testid="alloc-publish" @click="publishShow">
        Publish {{ selectedShow }} <span class="badge text-bg-light">{{ draftCount }} unpublished</span>
     </button>
     <input type="text" class=" form-control my-2" placeholder="School search" v-model="searchbar">
    <div class="row" >
        
    <div v-if="groupedAssignments[selectedShow]" class="col-12 col-lg-9">
      <span v-for="school in groupedAssignments[selectedShow].schools">
      <div class="card text-start my-2" v-if="searchbar == '' || school.name.toUpperCase().includes(searchbar.toUpperCase())">
        <div class="card-body">
          <h4 class="card-title">{{school.name}} </h4>
          <p class="card-text">
            Reporting time: {{school.reportingTime}} <br>
            Capacity: {{filledCount(school)}}/{{school.p5Classes}}
          </p>

          <div v-for="volunteer in school.volunteers" class="border border-1 rounded p-2 m-1 d-flex justify-content-between">
            <span>
              <!-- NEW: "Draft" = not published yet, volunteers cannot see it. Colours: red = Declined, dark = Withdrawn (they had none before). -->
              <span v-if="!volunteer.published" class="badge text-bg-light border me-1">Draft</span>
              <span class="badge rounded-pill" 
              :class="{'text-bg-warning':volunteer.status == 'Pending','text-bg-success':volunteer.status == 'Accepted','text-bg-danger':volunteer.status == 'Declined','text-bg-dark':volunteer.status == 'Withdrawn'}"> 
              {{  volunteer.status }} 
              </span>
              {{  volunteer.name }} ({{ volunteer.phone }}) 
            </span>
            <span> Distance: {{ volunteer.distance }}</span>
          </div>
        </div>
      </div>
      </span>
    </div>
    <p v-else> There are no assignments.</p>
    <div v-if="groupedAssignments[selectedShow]" class="col-12 col-lg-3">

    <div class="card text-start my-2">
      <div class="card-body">
        <h4 class="card-title pb-2">Unassigned Volunteers</h4>
        <p class="card-text">
          <div v-for="volunteer in groupedAssignments[selectedShow].unassigned" class="bg-body border border-1 rounded p-2 m-1 d-flex justify-content-between"> 
            {{ volunteer.name }} ({{ volunteer.phone }})
          </div>
        </p>
      </div>
    </div>
    </div>
    
   
    </div>

  </body>
</template>