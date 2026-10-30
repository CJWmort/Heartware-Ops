<!-- Admin form on the Badge Awards page for giving a chosen badge to one or many volunteers with a
     thank-you message. -->

<script setup>
// Loads badges, shows and volunteers; handles searching and picking volunteers, validates the form,
// sends the award and shows which volunteers already had the badge.

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import PageLoading from '@/components/common/PageLoading.vue'
import AppDropdown from '@/components/common/AppDropdown.vue'
import { listBadges, listVolunteers, awardBadge } from '@/services/badges.js'
import { getShows } from '@/services/assignment.js'
import { getSavedFilter, saveFilter } from '@/services/selected-show'

const badges = ref([])
const volunteers = ref([])
const shows = ref([])
const loading = ref(true)
const loadError = ref('')

const badgeCode = ref(getSavedFilter('awards-badge'))
const event = ref(getSavedFilter('awards-event'))
const search = ref('')
const picked = ref([])
const message = ref('')

const sending = ref(false)
const formError = ref('')
const successText = ref('')

// loadData() - 1) fetch badges, volunteers and shows together 2) store them 3) if the remembered show
// no longer exists use the first show 4) if the remembered badge no longer exists clear it 5) on error
// show a message 6) always stop loading.
async function loadData() {
    try {
        const [badgeList, volunteerList, showList] = await Promise.all([listBadges(), listVolunteers(), getShows()])
        badges.value = badgeList
        volunteers.value = volunteerList
        shows.value = showList

        if (!shows.value.some((s) => s.name === event.value)) event.value = shows.value[0]?.name || ''
        if (!badges.value.some((b) => b.code === badgeCode.value)) badgeCode.value = ''
  } catch (e) {
    loadError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

// manualBadges / autoBadges (computed) - badges split by awardType: "manual" thank-you badges and
// "auto" badges that the app normally gives.
const manualBadges = computed(() => badges.value.filter(badge => badge.awardType === 'manual'))
// autoBadges (computed) - only the badges that are awarded automatically.
const autoBadges = computed(() => badges.value.filter(badge => badge.awardType === 'auto'))

// badgeOptions (computed) - grouped dropdown entries: "Thank-you badges" and "Missed by the app".
// showOptions (computed) - the show names for the second dropdown.
const badgeOptions = computed(() => [
    { label: 'Thank-you badges', options: manualBadges.value.map(b => ({ value: b.code, label: b.name })) },
    { label: 'Missed by the app', options: autoBadges.value.map(b => ({ value: b.code, label: b.name })) },
])

// showOptions (computed) - the shows as dropdown options.
const showOptions = computed(() => shows.value.map(s => ({ value: s.name, label: s.name })))

// Save the chosen badge and show whenever they change.
watch(badgeCode, (v) => saveFilter('awards-badge', v))
// watch(event) - remember the chosen show.
watch(event, (v) => saveFilter('awards-event', v))

// selectedBadge (computed) - the full badge object of badgeCode, or null (drives the preview).
const selectedBadge = computed(() => {
    const badge = badges.value.find(badge => badge.code === badgeCode.value)
    return badge ? badge : null
})

// results (computed) - volunteers whose name or email contains the typed text (not case sensitive), at
// most 8; empty list when nothing is typed.
const results = computed(() => search.value ? volunteers.value.filter(volunteer =>
        volunteer.name.toLowerCase().includes(search.value.toLowerCase()) || volunteer.email.toLowerCase().includes(search.value.toLowerCase())
    ).slice(0,8) : []
)

// isPicked(volunteer) - true if this volunteer is already ticked.
function isPicked(volunteer) {
    return picked.value.some(vol => vol._id === volunteer._id)
}

// togglePick(volunteer) - tick the volunteer, or untick if already ticked.
function togglePick(volunteer) {
    if (isPicked(volunteer)) {
        picked.value = picked.value.filter(vol => vol._id !== volunteer._id)
    } else {
        picked.value.push(volunteer)
    }
}

// canSubmit (computed) - true when a badge, a show and at least one volunteer are chosen and nothing
// is sending.
const canSubmit = computed(() => badgeCode.value && event.value && picked.value.length !== 0 && !sending.value ? true : false)

// submitAward() - 1) clear the old messages 2) show "sending" 3) collect the picked ids 4) send badge,
// show and note to the server 5) look up the names of volunteers who already had the badge (skipped)
// in the loaded list 6) build the success sentence (how many given and who already had it) 7) clear
// the picked list and the note 8) on error show the message 9) always stop sending.
async function submitAward() {
    formError.value = ''
    successText.value = ''
    sending.value = true
    try {
        const ids = picked.value.map(vol => vol._id)
        const result = await awardBadge(ids, badgeCode.value, event.value, message.value)

        const skippedNames = result.skipped.map(id => volunteers.value.find(vol => vol._id === id)?.name ?? 'a volunteer')
        successText.value = `${selectedBadge.value.name} given to ${result.given.length} volunteer(s).` + (skippedNames.length ? ` Already had it for ${event.value}: ${skippedNames.join(', ')}.` : '')

        picked.value = []
        message.value = ''
    } catch (e) {
        formError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
        console.error(e)
    } finally {
        sending.value = false
    }
}

const pickerEl = ref(null)
const open = ref(false)

// closeIfOutside(e) - close the results panel when a press or focus lands outside the picker.
function closeIfOutside(e) {
    if (!pickerEl.value?.contains(e.target)) open.value = false
}

// onPickerKeydown(e) - Escape closes the results panel.
function onPickerKeydown(e) {
    if (e.key === 'Escape') open.value = false
}

// onMounted - listen on the whole page for pointerdown, keydown and focusin so the volunteer picker
// can close itself.
onMounted(() => {
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', onPickerKeydown)
    document.addEventListener('focusin', closeIfOutside)
})

// onBeforeUnmount - remove those listeners.
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', closeIfOutside)
    document.removeEventListener('keydown', onPickerKeydown)
    document.removeEventListener('focusin', closeIfOutside)
})

// Also load the data once the component is mounted.
onMounted(loadData)
</script>

<template>
  <!-- The form: badge and show dropdowns, the volunteer search with chips, the message box and
       the Send button with its result messages. -->
  <div class="card-hw award-card" data-testid="awards-form">
    <div class="section-head">
      <span class="head-icon" aria-hidden="true"><i class="bi bi-award"></i></span>
      <div class="min-w-0">
        <h2 class="section-title">Give a badge</h2>
        <div class="small text-muted-hw">Thank a volunteer, or give a badge the app missed.</div>
      </div>
    </div>

    <div v-if="loading" class="loading-area"><PageLoading contained text="Fetching Badges and Volunteers..." /></div>

    <div v-if="!loading && loadError" class="alert alert-danger d-flex align-items-start gap-2 mb-0" role="alert">
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ loadError }}</div>
    </div>

    <form v-else-if="!loading" novalidate @submit.prevent="submitAward">
      <div class="row g-4">
        <div class="col-lg-5">
          <label for="award-badge" class="form-label field-label">Badge</label>
          <AppDropdown
            v-model="badgeCode"
            :groups="badgeOptions"
            icon="bi-award"
            placeholder="Choose a badge"
            button-id="award-badge"
            aria-label="Choose a badge"
            testid="awards-badge-select"
            grow
          />

          <div v-if="selectedBadge" class="badge-preview">
            <span class="medal" aria-hidden="true"><i :class="['bi', selectedBadge.icon]"></i></span>
            <div class="min-w-0">
              <div class="fw-semibold">{{ selectedBadge.name }}</div>
              <div class="small text-muted-hw">{{ selectedBadge.description }}</div>
              <span v-if="selectedBadge.awardType === 'auto'" class="auto-note">
                <i class="bi bi-info-circle me-1" aria-hidden="true"></i>Normally given by the app
              </span>
            </div>
          </div>

          <label for="award-event" class="form-label field-label mt-3">For which show</label>
          <AppDropdown
            v-model="event"
            :options="showOptions"
            icon="bi-calendar-event"
            placeholder="Choose a show"
            button-id="award-event"
            aria-label="Choose a show"
            testid="awards-event-select"
            grow
          />
        </div>

        <div class="col-lg-7">
          <div class="d-flex justify-content-between align-items-baseline">
            <label for="award-search" class="form-label field-label">Volunteers</label>
            <span v-if="picked.length" class="small text-muted-hw">{{ picked.length }} selected</span>
          </div>

          <div class="picker" ref="pickerEl">
            <div class="search-wrap">
              <i class="bi bi-search" aria-hidden="true"></i>
              <input id="award-search" v-model="search" type="search" class="form-control" autocomplete="off"
                    placeholder="Search by name or email" data-testid="awards-volunteer-search" @focus="open = true" @input="open = true" />
            </div>

            <ul v-if="open && results.length" class="results" aria-label="Matching volunteers">
              <li v-for="v in results" :key="v._id">
                <button type="button" class="result" :class="{ 'is-picked': isPicked(v) }" :aria-pressed="isPicked(v)"
                        data-testid="awards-volunteer-result" @click="togglePick(v)">
                  <span class="tick" aria-hidden="true"><i class="bi bi-check-lg"></i></span>
                  <span class="min-w-0 text-start">
                    <span class="d-block fw-semibold text-truncate">{{ v.name }}</span>
                    <span class="d-block small text-muted-hw text-truncate">{{ v.email }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <div v-else-if="open && search.trim()" class="results results-empty">No volunteer matches “{{ search.trim() }}”.</div>
          </div>

          <div v-if="picked.length === 0" class="small text-muted-hw mt-2">Type a name or email, then tap each person to add them.</div>

          <div v-if="picked.length" class="chips" aria-label="Selected volunteers">
            <span v-for="p in picked" :key="p._id" class="chip" data-testid="awards-picked">
              {{ p.name }}
              <button type="button" class="chip-x" :aria-label="'Remove ' + p.name" @click="togglePick(p)">
                <i class="bi bi-x" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        </div>

        <div class="col-12">
          <div class="d-flex justify-content-between align-items-baseline">
            <label for="award-message" class="form-label field-label">Thank-you note <span class="fw-normal text-muted-hw">(optional)</span></label>
            <span class="small text-muted-hw">{{ message.length }}/300</span>
          </div>
          <textarea id="award-message" v-model="message" class="form-control" rows="3" maxlength="300"
                    placeholder="e.g. Thank you for staying calm when the bus broke down!" data-testid="awards-message"></textarea>
          <div class="small text-muted-hw mt-1">The volunteer sees this when they open the badge.</div>
        </div>

        <div class="col-12">
          <div v-if="formError" class="alert alert-danger d-flex align-items-start gap-2" role="alert" data-testid="awards-error">
            <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
            <div>{{ formError }}</div>
          </div>
          <div v-if="successText" class="alert alert-success d-flex align-items-start gap-2" role="status" data-testid="awards-success">
            <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
            <div>{{ successText }}</div>
          </div>

          <button type="submit" class="btn btn-brand px-4" :disabled="!canSubmit" data-testid="awards-submit">
            <span v-if="sending" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            <i v-else class="bi bi-send me-2" aria-hidden="true"></i>Give badge<template v-if="picked.length > 1"> to {{ picked.length }} volunteers</template>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* Styles for the form, the volunteer picker list and the chips. */

.award-card {
  --tint: rgb(20 33 61 / 0.08);
  --accent: var(--hw-red);
  --panel: var(--hw-surface);
  --panel-shadow: 0 12px 28px rgb(20 33 61 / 0.18);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
[data-bs-theme='dark'] .award-card {
  --tint: rgb(255 255 255 / 0.07);
  --accent: var(--hw-landing-accent);
  --panel: #1c2540;
  --panel-shadow: 0 12px 28px rgb(0 0 0 / 0.55);
}
@media (min-width: 992px) {
  .award-card {
    padding: 1.5rem;
  }
}

.section-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem 1rem;
  margin-bottom: 1.25rem;
}
.head-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 0.6rem;
  background: rgb(214 0 28 / 0.12);
  color: var(--accent);
  font-size: 1.15rem;
}
.section-title {
  margin: 0 0 0.15rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.min-w-0 {
  min-width: 0;
}
.field-label {
  margin-bottom: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hw-muted);
}

.badge-preview {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-top: 0.75rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.6rem;
  background: var(--tint);
}
.medal {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: #fff;
  font-size: 1.2rem;
  background: radial-gradient(circle at 32% 28%, #ff5a68 0%, var(--hw-red) 55%, var(--hw-red-dark) 100%);
  box-shadow: 0 0 0 3px rgb(214 0 28 / 0.15);
}
.auto-note {
  display: inline-flex;
  align-items: center;
  margin-top: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--hw-muted);
}

.search-wrap {
  position: relative;
}
.search-wrap > i {
  position: absolute;
  left: 0.8rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--hw-muted);
  pointer-events: none;
}
.search-wrap .form-control {
  padding-left: 2.3rem;
}
.picker {
  position: relative;
}
.results {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 18rem;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  background: var(--panel);
  border: 1px solid var(--bs-border-color);
  border-radius: 0.6rem;
  box-shadow: var(--panel-shadow);
}
.results-empty {
  padding: 0.6rem 0.75rem;
  font-size: 0.875rem;
  color: var(--hw-muted);
}
.result {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--hw-text);
  transition: background-color 0.15s;
}
.result:hover {
  background: var(--tint);
}
.result:focus-visible {
  outline: 2px solid var(--hw-heading);
  outline-offset: -2px;
}
.tick {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1.5px solid var(--bs-border-color);
  border-radius: 6px;
  color: transparent;
  font-size: 0.9rem;
}
.result.is-picked .tick {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.2rem 0.25rem 0.2rem 0.7rem;
  border-radius: 999px;
  background: var(--tint);
  color: var(--hw-heading);
  font-size: 0.85rem;
  font-weight: 600;
}
.chip-x {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--hw-muted);
}
.chip-x:hover {
  background: var(--tint);
  color: var(--hw-heading);
}

.award-card .btn-brand {
  --bs-btn-disabled-bg: var(--hw-red);
  --bs-btn-disabled-border-color: var(--hw-red);
  --bs-btn-disabled-color: #fff;
}

@media (max-width: 575.98px) {
  .award-card .btn-brand {
    width: 100%;
  }
}
</style>
