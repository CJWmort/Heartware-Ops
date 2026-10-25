<script setup>
// Feature 5 – "Give a badge" form on the coordinator page — owner: Hanafi
// Layout and CSS: AI-generated (declared in README.txt). Logic in the TODOs below: Hanafi.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { listBadges, listVolunteers, awardBadge } from '@/services/badges.js'
import { getShows } from '@/services/assignment.js'

const badges = ref([]) 
const volunteers = ref([]) 
const shows = ref([]) 
const loading = ref(true)
const loadError = ref('')

const badgeCode = ref('') 
const event = ref('') 
const search = ref('') 
const picked = ref([]) 
const message = ref('')

const sending = ref(false)
const formError = ref('') 
const successText = ref('') 

async function loadData() {
    try {
        const [badgeList, volunteerList, showList] = await Promise.all([listBadges(), listVolunteers(), getShows()])
        badges.value = badgeList
        volunteers.value = volunteerList
        shows.value = showList

        event.value = shows.value[0]?.name
  } catch (e) {
    loadError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(e)         
  } finally {
    loading.value = false
  }
}

const manualBadges = computed(() => badges.value.filter(badge => badge.awardType === 'manual'))
const autoBadges = computed(() => badges.value.filter(badge => badge.awardType === 'auto'))

const selectedBadge = computed(() => {
    const badge = badges.value.find(badge => badge.code === badgeCode.value) 
    return badge ? badge : null
})

const results = computed(() => search.value ? volunteers.value.filter(volunteer => 
        volunteer.name.toLowerCase().includes(search.value.toLowerCase()) || volunteer.email.toLowerCase().includes(search.value.toLowerCase())
    ).slice(0,8) : []
)

function isPicked(volunteer) {
    return picked.value.some(vol => vol._id === volunteer._id)
}

function togglePick(volunteer) {
    if (isPicked(volunteer)) {
        picked.value = picked.value.filter(vol => vol._id !== volunteer._id)
    } else {
        picked.value.push(volunteer)
    }
}

const canSubmit = computed(() => badgeCode.value && event.value && picked.value.length !== 0 && !sending.value ? true : false)

async function submitAward() {
    formError.value = ''
    successText.value = ''
    sending.value = true
    try {
        const ids = picked.value.map(vol => vol._id)
        const result = await awardBadge(ids, badgeCode.value, event.value, message.value)

        const skippedNames = result.skipped.map(id => volunteers.value.find(vol => vol._id === id).name)
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

function closeIfOutside(e) {
    if (!pickerEl.value?.contains(e.target)) open.value = false
}

function onPickerKeydown(e) {
    if (e.key === 'Escape') open.value = false
}

onMounted(() => {
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', onPickerKeydown)
    document.addEventListener('focusin', closeIfOutside)
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', closeIfOutside)
    document.removeEventListener('keydown', onPickerKeydown)
    document.removeEventListener('focusin', closeIfOutside)
})

onMounted(loadData)         
</script>

<template>
  <div class="card-hw award-card" data-testid="awards-form">
    <div class="section-head">
      <span class="head-icon" aria-hidden="true"><i class="bi bi-award"></i></span>
      <div class="min-w-0">
        <h2 class="section-title">Give a badge</h2>
        <div class="small text-muted-hw">Thank a volunteer, or give a badge the app missed.</div>
      </div>
    </div>

    <div v-if="loading" class="text-center text-muted-hw py-4">
      <div class="spinner-border" aria-hidden="true"></div>
      <div class="mt-2">Loading badges and volunteers...</div>
    </div>

    <div v-else-if="loadError" class="alert alert-danger d-flex align-items-start gap-2 mb-0" role="alert">
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ loadError }}</div>
    </div>

    <form v-else novalidate @submit.prevent="submitAward">
      <div class="row g-4">
        <div class="col-lg-5">
          <label for="award-badge" class="form-label field-label">Badge</label>
          <select id="award-badge" v-model="badgeCode" class="form-select" data-testid="awards-badge-select">
            <option value="" disabled>Choose a badge</option>
            <optgroup label="Thank-you badges">
              <option v-for="b in manualBadges" :key="b.code" :value="b.code">{{ b.name }}</option>
            </optgroup>
            <optgroup label="Missed by the app">
              <option v-for="b in autoBadges" :key="b.code" :value="b.code">{{ b.name }}</option>
            </optgroup>
          </select>

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
          <select id="award-event" v-model="event" class="form-select" data-testid="awards-event-select">
            <option v-for="s in shows" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
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
/* ---------- Colours that change in dark mode (same idea as main.css) ---------- */
.award-card {
  --tint: rgb(20 33 61 / 0.08);
  --accent: var(--hw-red); /* ticks, focus edges */
  --panel: var(--hw-surface); /* the floating results panel */
  --panel-shadow: 0 12px 28px rgb(20 33 61 / 0.18);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
[data-bs-theme='dark'] .award-card {
  --tint: rgb(255 255 255 / 0.07);
  --accent: var(--hw-landing-accent); /* brighter red, readable on navy */
  /* In dark mode a shadow barely shows, so a raised panel is LIGHTER than the card instead (same "elevation" idea as main.css) */
  --panel: #1c2540;
  --panel-shadow: 0 12px 28px rgb(0 0 0 / 0.55);
}
@media (min-width: 992px) {
  .award-card {
    padding: 1.5rem;
  }
}

/* ---------- Heading (same look as the orders card) ---------- */
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

/* ---------- Badge preview ---------- */
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

/* ---------- Volunteer search ---------- */
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
/* The anchor. "position: relative" doesn't move this box; it only says
   "anything absolute inside me measures from MY edges" */
.picker {
  position: relative;
}
/* The floating panel. "position: absolute" takes it out of the normal flow,
   so it uses up no space and the Thank-you note below stays where it is */
.results {
  position: absolute;
  top: calc(100% + 0.35rem); /* 100% = the anchor's full height, so the panel starts just under the search box */
  left: 0;
  right: 0; /* left 0 + right 0 = exactly as wide as the search box */
  z-index: 20; /* above the note and the orders card; below the navbar (1200) */
  max-height: 18rem; /* about 5 people, then the panel scrolls instead of running down the page */
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  background: var(--panel); /* must be solid: a see-through panel would mix with the text under it */
  border: 1px solid var(--bs-border-color);
  border-radius: 0.6rem;
  box-shadow: var(--panel-shadow); /* the shadow is what makes it read as "floating above" */
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
/* Ticked: a filled box with a tick (shape, not only colour) */
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

/* ---------- Chips of who is selected ---------- */
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
  width: 24px; /* still a fair tap target inside a small chip */
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

/* main.css gives .btn-brand no "disabled" colours, so a greyed-out button looked like an outline button.
   Keep it red, just faded (Bootstrap fades disabled buttons), same fix as the Badge Studio */
.award-card .btn-brand {
  --bs-btn-disabled-bg: var(--hw-red);
  --bs-btn-disabled-border-color: var(--hw-red);
  --bs-btn-disabled-color: #fff;
}

@media (max-width: 575.98px) {
  .award-card .btn-brand {
    width: 100%; /* full-width button on phones */
  }
}
</style>