<script setup>
// Feature 5 – "Give a badge" form on the coordinator page — owner: Hanafi
// Layout and CSS: AI-generated (declared in README.txt). Logic in the TODOs below: Hanafi.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import PageLoading from '@/components/common/PageLoading.vue' // NEW: fading "Fetching..." overlay
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

const manualBadges = computed(() => badges.value.filter(badge => badge.awardType === 'manual'))
const autoBadges = computed(() => badges.value.filter(badge => badge.awardType === 'auto'))

const badgeOptions = computed(() => [
    { label: 'Thank-you badges', options: manualBadges.value.map(b => ({ value: b.code, label: b.name })) },
    { label: 'Missed by the app', options: autoBadges.value.map(b => ({ value: b.code, label: b.name })) },
])

const showOptions = computed(() => shows.value.map(s => ({ value: s.name, label: s.name })))

watch(badgeCode, (v) => saveFilter('awards-badge', v))
watch(event, (v) => saveFilter('awards-event', v))

const badgeMenuOpen = ref(false)
const eventMenuOpen = ref(false)
const badgeEl = ref(null)
const eventEl = ref(null)

const badgeFlat = computed(() => badgeOptions.value.flatMap((g) => g.options))

function labelFor(options, value) {
    return options.find((o) => o.value === value)?.label ?? ''
}

function chooseBadge(v) {
    badgeMenuOpen.value = false
    badgeCode.value = v
}

function chooseEvent(v) {
    eventMenuOpen.value = false
    event.value = v
}

function onDocPointerDown(e) {
    if (badgeMenuOpen.value && badgeEl.value && !badgeEl.value.contains(e.target)) badgeMenuOpen.value = false
    if (eventMenuOpen.value && eventEl.value && !eventEl.value.contains(e.target)) eventMenuOpen.value = false
}

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

        // FIX (C3): `?.name ?? 'a volunteer'` so an id missing from the loaded list can't throw.
        // The badges are already saved at this point, so a lookup problem must not show an error.
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

function closeIfOutside(e) {
    if (!pickerEl.value?.contains(e.target)) open.value = false
}

function onPickerKeydown(e) {
    if (e.key === 'Escape') open.value = false
}

onMounted(() => {
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onPickerKeydown)
    document.addEventListener('focusin', closeIfOutside)
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', closeIfOutside)
    document.removeEventListener('pointerdown', onDocPointerDown)
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

    <!-- NEW: box with a contained overlay. No <Transition> on this box on purpose: if the box faded out while the content
         appeared, both would take up space for 0.5s and the content would jump. -->
    <div v-if="loading" class="loading-area"><PageLoading contained text="Fetching Badges and Volunteers..." /></div>

    <div v-if="!loading && loadError" class="alert alert-danger d-flex align-items-start gap-2 mb-0" role="alert">
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ loadError }}</div>
    </div>

    <form v-else-if="!loading" novalidate @submit.prevent="submitAward">
      <div class="row g-4">
        <div class="col-lg-5">
          <label for="award-badge" class="form-label field-label">Badge</label>
          <div
          ref="badgeEl"
          class="show-select"
          :class="{ open: badgeMenuOpen }"
          @keydown.esc="badgeMenuOpen = false"
        >
          <button
            id="award-badge"
            type="button"
            class="show-btn"
            aria-haspopup="listbox"
            :aria-expanded="badgeMenuOpen"
            aria-label="Choose a badge"
            data-testid="awards-badge-select"
            @click="badgeMenuOpen = !badgeMenuOpen"
          >
            <i class="bi bi-award" aria-hidden="true"></i>
            <span class="show-name" :class="{ 'is-placeholder': !labelFor(badgeFlat, badgeCode) }">{{ labelFor(badgeFlat, badgeCode) || 'Choose a badge' }}</span>
            <i class="bi bi-chevron-down show-chevron" :class="{ open: badgeMenuOpen }" aria-hidden="true"></i>
          </button>
          <Transition name="menu">
            <div v-if="badgeMenuOpen" class="show-menu filter-menu" role="listbox">
              <template v-for="group in badgeOptions" :key="group.label">
                <div class="show-group">{{ group.label }}</div>
                <button
                  v-for="opt in group.options"
                  :key="opt.value"
                  type="button"
                  class="show-option"
                  :class="{ active: opt.value === badgeCode }"
                  role="option"
                  :aria-selected="opt.value === badgeCode"
                  @click="chooseBadge(opt.value)"
                >
                  <span>{{ opt.label }}</span>
                  <i v-if="opt.value === badgeCode" class="bi bi-check-lg" aria-hidden="true"></i>
                </button>
              </template>
            </div>
          </Transition>
        </div>

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
          <div
          ref="eventEl"
          class="show-select"
          :class="{ open: eventMenuOpen }"
          @keydown.esc="eventMenuOpen = false"
        >
          <button
            id="award-event"
            type="button"
            class="show-btn"
            aria-haspopup="listbox"
            :aria-expanded="eventMenuOpen"
            aria-label="Choose a show"
            data-testid="awards-event-select"
            @click="eventMenuOpen = !eventMenuOpen"
          >
            <i class="bi bi-calendar-event" aria-hidden="true"></i>
            <span class="show-name" :class="{ 'is-placeholder': !labelFor(showOptions, event) }">{{ labelFor(showOptions, event) || 'Choose a show' }}</span>
            <i class="bi bi-chevron-down show-chevron" :class="{ open: eventMenuOpen }" aria-hidden="true"></i>
          </button>
          <Transition name="menu">
            <div v-if="eventMenuOpen" class="show-menu filter-menu" role="listbox">
              <button
                v-for="(opt, i) in showOptions"
                :key="opt.value"
                type="button"
                class="show-option"
                :class="{ active: opt.value === event }"
                :style="{ '--i': i }"
                role="option"
                :aria-selected="opt.value === event"
                @click="chooseEvent(opt.value)"
              >
                <span>{{ opt.label }}</span>
                <i v-if="opt.value === event" class="bi bi-check-lg" aria-hidden="true"></i>
              </button>
            </div>
          </Transition>
        </div>
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

.show-select {
  position: relative;
  width: 100%;
  max-width: 100%;
  z-index: 20;
}
.show-select.open {
  z-index: 30;
}
.show-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  background: var(--hw-bg);
  color: var(--bs-secondary-color);
  font-weight: 600;
  text-align: left;
  transition: background-color 0.15s;
}
.show-btn:hover {
  background: var(--bs-secondary-bg);
}
.show-btn:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}
.show-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hw-text);
}
.show-name.is-placeholder {
  color: var(--hw-muted);
  font-weight: 500;
}
.show-chevron {
  flex: 0 0 auto;
  font-size: 0.7rem;
  transition: transform 0.25s ease;
}
.show-chevron.open {
  transform: rotate(180deg);
}
.show-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 100%;
  max-width: min(360px, calc(100vw - 24px));
  padding: 6px;
  background: var(--hw-surface);
  color: var(--hw-text);
  border: 1px solid var(--bs-border-color);
  border-radius: 14px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.22);
}
.filter-menu {
  max-height: 260px;
  overflow-y: auto;
}
.show-group {
  padding: 8px 12px 4px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hw-muted);
}
.show-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font-size: 0.9rem;
  text-align: left;
  overflow-wrap: anywhere;
  animation: option-in 0.2s ease both;
  animation-delay: calc(var(--i) * 30ms);
}
.show-option:hover {
  background: var(--hw-bg);
}
.show-option.active {
  background: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  font-weight: 600;
}
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform-origin: top left;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.95);
}
@keyframes option-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .show-option {
    animation: none;
  }
  .menu-enter-active,
  .menu-leave-active,
  .show-chevron {
    transition: none;
  }
}
</style>