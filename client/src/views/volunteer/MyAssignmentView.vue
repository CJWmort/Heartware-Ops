<script setup>
// Feature 1b – Smart Allocation (volunteer side) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { computed, onMounted, ref } from 'vue';
import axios from 'axios';
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'

const API_URL = '/api/schools';
const volunteerDataURL = '/api/users/me'

const schools = ref([]);
const volData = ref([]);
const volAvailableShows = ref([]);
const errorMessage = ref('');
const loaded = ref(false); // true once volunteer data has arrived

// Shows listed in the assignment table (time and location filled in once allocated)
// allocation: null (not allocated yet) | 'pending' | 'accepted' | 'declined'
const shows = ref([
    { name: 'NE Show 1', date: '11 July 2026', time: '', location: '', allocation: null },
    { name: 'NE Show 2', date: '18 July 2026', time: '', location: '', allocation: null },
    { name: 'NE Show 3', date: '25 July 2026', time: '', location: '', allocation: null },
]);

// True when the volunteer has not picked any show yet
const hasNoAvailability = computed(() => loaded.value && (volAvailableShows.value || []).length === 0);

// Work out each row's status from availability + allocation
function showStatus(show) {
    if (!(volAvailableShows.value || []).includes(show.name)) return 'Not available';
    if (!show.allocation) return 'Awaiting allocation';
    if (show.allocation === 'accepted') return 'Accepted';
    if (show.allocation === 'declined') return 'Declined';
    return 'Pending';
}

// Bootstrap badge colour for each status
function statusClass(status) {
    if (status === 'Not available') return 'text-bg-secondary';
    if (status === 'Awaiting allocation') return 'text-bg-info';
    if (status === 'Accepted') return 'text-bg-success';
    if (status === 'Declined') return 'text-bg-danger';
    return 'text-bg-warning';
}

onMounted(loadVolunteerData)

// Load Data
async function loadVolunteerData() {
    errorMessage.value = '';

    try{
        const response = await axios.get(volunteerDataURL);
        volData.value = response.data;
        volAvailableShows.value = volData.value.availableShows || [];
        loaded.value = true;
    } catch (error) {
        errorMessage.value = "Failed to load data."
    }
}

// Add availability of Volunteer who did not choose a show during registration
async function updateAvailableShows() {
    errorMessage.value = '';

    const updatedShows = [];
    for (const s of volAvailableShows.value) {
        updatedShows.push(s);
    }

    for (const s of shows) {
        if (!updatedShows.includes(s)) {
            updatedShows.push(s);
        }
    }

    try{
        await axios.put(
            volunteerDataURL,
            {
                availableShows: updatedShows
            }
        );
        volAvailableShows.value = updatedShows;
    } catch (error) {
        errorMessage.value = "Failed to update available shows."
    }
}

// Remove availability of Volunteer
async function removeAvailableShows() {
    errorMessage.value = '';

    try{
        // axios.delete sends a body through the 'data' option
        const response = await axios.delete(
            volunteerDataURL,
            {
                data: { availableShows: shows }
            }
        );
        volAvailableShows.value = response.data.availableShows;
    } catch (error) {
        errorMessage.value = "Failed to update available shows."
    }
}


// ===== Change Availability popup =====
const showAvailabilityModal = ref(false);
const selectedShows = ref([]); // ticked checkboxes in the popup
const saving = ref(false);
const modalError = ref('');

function openAvailabilityModal() {
    selectedShows.value = [...volAvailableShows.value];
    modalError.value = '';
    showAvailabilityModal.value = true;
}

function closeAvailabilityModal() {
    showAvailabilityModal.value = false;
}

async function saveAvailability() {
    modalError.value = '';
    saving.value = true;

    try{
        await axios.put(volunteerDataURL, { availableShows: selectedShows.value });
        volAvailableShows.value = selectedShows.value;
        closeAvailabilityModal();
    } catch (error) {
        modalError.value = "Failed to save your availability. Please try again."
    }

    saving.value = false;
}


// Update status when Volunteer clicks Accept
// async function acceptAllocation() {
//     errorMessage.value = '';
    
//     try{
//         const response = await axios.put(API_URL);
//         schools.value = response.data;
//         console.log(schools.value)
        
//     } catch (error) {
//         errorMessage.value = "Failed to load data."
//     }
// }


// TODO(Fanny): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Load getMyAssignment() and show school, bus, class, venue, date, teacher contact',
  'Small map (BaseMap) with your home → school',
  'Accept / Decline buttons (respondToSlot) with a confirm step for Decline',
  '"I can\'t make it" button linking to Feature 2 drop-out (coordinate with Yap)',
  'Empty state when nothing is published yet',
  'data-testids: assignment-card, assignment-school, assignment-accept, assignment-decline, assignment-status',
]

</script>

<template>
  <section>
    <PageHeader title="My Assignment" icon="bi-geo-alt" />
    <!-- <FeaturePlaceholder feature="Feature 1b – Smart Allocation (volunteer side)" owner="Fanny" :todos="todos" /> -->
    <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

    <div v-if="hasNoAvailability" class="alert alert-info d-flex align-items-center" role="alert" data-testid="no-availability">
      <i class="bi bi-info-circle me-2"></i>
      You haven't indicated any available shows yet. Click <strong class="mx-1">Change Availability</strong> to choose your shows.
    </div>

    <div class="d-flex justify-content-end mb-3">
      <button type="button" class="btn btn-brand" data-testid="change-availability" @click="openAvailabilityModal">
        <i class="bi bi-calendar-check me-1"></i> Change Availability
      </button>
    </div>

    <div class="card shadow-sm" data-testid="assignment-card">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="text-center">S/N</th>
              <th scope="col">Show</th>
              <th scope="col">Reporting Date</th>
              <th scope="col">Reporting Time</th>
              <th scope="col">Reporting Location</th>
              <th scope="col" class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(show, index) in shows" :key="show.name">
              <td class="text-center text-muted">{{ index + 1 }}</td>
              <td class="fw-semibold">{{ show.name }}</td>
              <td>{{ show.date }}</td>
              <td>{{ show.time || '—' }}</td>
              <td>{{ show.location || '—' }}</td>
              <td class="text-center">
                <span class="badge rounded-pill" :class="statusClass(showStatus(show))" data-testid="assignment-status">
                  {{ showStatus(show) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Change Availability popup -->
    <template v-if="showAvailabilityModal">
      <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="availability-title"
           data-testid="availability-modal" @click.self="closeAvailabilityModal" @keydown.esc="closeAvailabilityModal">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="availability-title">
                <i class="bi bi-calendar-check me-1"></i> Change Availability
              </h5>
              <button type="button" class="btn-close" aria-label="Close" :disabled="saving" @click="closeAvailabilityModal"></button>
            </div>

            <div class="modal-body">
              <p class="text-muted mb-3">Tick the shows you are available for.</p>

              <div class="list-group">
                <label v-for="show in shows" :key="show.name"
                       class="list-group-item list-group-item-action d-flex align-items-center gap-3">
                  <input class="form-check-input m-0" type="checkbox" :value="show.name" v-model="selectedShows"
                         :data-testid="`availability-${show.name}`">
                  <div>
                    <div class="fw-semibold">{{ show.name }}</div>
                    <small class="text-muted">{{ show.date }}</small>
                  </div>
                </label>
              </div>

              <div v-if="modalError" class="alert alert-danger mt-3 mb-0" role="alert">{{ modalError }}</div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="closeAvailabilityModal">Cancel</button>
              <button type="button" class="btn btn-brand" :disabled="saving" data-testid="availability-save" @click="saveAvailability">
                <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show"></div>
    </template>

  </section>
</template>
