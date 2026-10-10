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

onMounted(loadVolunteerData)

// Load Data
async function loadVolunteerData() {
    errorMessage.value = '';

    try{
        const response = await axios.get(volunteerDataURL);
        volData.value = response.data;
        volAvailableShows.value = volData.value.availableShows;
    } catch (error) {
        errorMessage.value = "Failed to load data."
    }
}

// Add availability of Volunteer who did not choose a show during registration
async function updateAvailableShows() {
    errorMessage.value = '';

    const shows = ["NE Show 2", "NE Show 3"];

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

    const shows = ["NE Show 2"];

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
    <p>{{ volData }}</p>
    <p>Available shows: {{ volAvailableShows }}</p>
    <button @click='updateAvailableShows'>Add</button>
    <button @click='removeAvailableShows'>Remove</button>
  </section>
</template>
