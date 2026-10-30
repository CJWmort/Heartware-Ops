<!-- Admin section on the Badge Awards page that hands out the automatic badges for one show in a
     single click. -->

<script setup>
// Loads the badge list and the shows, lets the admin pick a show, runs the automatic award on the
// server and shows how many badges were given.

import { ref, computed, onMounted, watch } from 'vue'
import PageLoading from '@/components/common/PageLoading.vue'
import AppDropdown from '@/components/common/AppDropdown.vue'
import { listBadges, autoAward } from '@/services/badges.js'
import { getShows, formatDate } from '@/services/assignment.js'
import { getSavedFilter, saveFilter } from '@/services/selected-show'

const shows = ref([])
const badges = ref([])
const loading = ref(true)
const loadError = ref('')

const event = ref(getSavedFilter('awards-auto-show'))
const sending = ref(false)
const runError = ref('')
const result = ref(null)
const ranFor = ref('')

// loadData() - 1) fetch the badge list and the show list together 2) store them 3) if the remembered
// show no longer exists choose the first show (or empty) 4) on error show a friendly message and log
// it 5) always stop loading.
async function loadData() {
  try {
    const [badgeList, showList] = await Promise.all([listBadges(), getShows()])
    badges.value = badgeList
    shows.value = showList

    if (!shows.value.some((s) => s.name === event.value)) event.value = shows.value[0]?.name || ''
  } catch (e) {
    loadError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

// showOptions (computed) - dropdown entries { value: show name, label: "NE Show 1 - 27 June 2027" }.
const showOptions = computed(() =>
  shows.value.map((s) => ({
    value: s.name,
    label: s.date ? `${s.name} · ${formatDate(s.date)}` : s.name,
  })),
)

// Whenever the chosen show changes, save it so the next visit starts on it.
watch(event, (v) => saveFilter('awards-auto-show', v))

// autoBadges (computed) - only the badges whose awardType is "auto" (the ones the app can check
// itself).
const autoBadges = computed(() => badges.value.filter((badge) => badge.awardType === 'auto'))

// canRun (computed) - true when a show is chosen and nothing is running.
const canRun = computed(() => (event.value && !sending.value ? true : false))

// runAuto() - 1) clear the old error and result 2) show "sending" 3) remember which show we ran for 4)
// ask the server to hand out the automatic badges for that show 5) keep the reply 6) on error show a
// message 7) always stop "sending".
async function runAuto() {
  runError.value = ''
  result.value = null
  sending.value = true
  try {
    ranFor.value = event.value

    const reply = await autoAward(ranFor.value)
    result.value = reply
  } catch (e) {
    runError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(e)
  } finally {
    sending.value = false
  }
}

// resultShown (computed) - the result is shown only while the dropdown still points at the show it was
// run for.
const resultShown = computed(() => (result.value && ranFor.value === event.value ? true : false))

// totalGiven (computed) - the sum of all the counts in result.given (0 when there is no result).
const totalGiven = computed(() => {
  if (!result.value) {
    return 0
  } else {
    let total = 0
    for (const count of Object.values(result.value.given)) {
      total += count
    }
    return total
  }
})

// onMounted - load the data when the section opens.
onMounted(loadData)
</script>

<template>
  <!-- The card with the show dropdown, the list of automatic badges, the Run button and the
       result summary. -->
  <div class="card-hw auto-card" data-testid="awards-auto">
    <div class="section-head">
      <span class="head-icon" aria-hidden="true"><i class="bi bi-stars"></i></span>
      <div class="min-w-0">
        <h2 class="section-title">Auto-awards</h2>
        <div class="small text-muted-hw">
          Give out every badge the app can check for, one show at a time.
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-area">
      <PageLoading contained text="Fetching Shows..." />
    </div>

    <div
      v-if="!loading && loadError"
      class="alert alert-danger d-flex align-items-start gap-2 mb-0"
      role="alert"
    >
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ loadError }}</div>
    </div>

    <div v-else-if="!loading" class="row g-4">
      <div class="col-md-5 col-lg-4">
        <label for="auto-show" class="form-label field-label">For which show</label>
        <AppDropdown
          v-model="event"
          :options="showOptions"
          icon="bi-calendar-event"
          placeholder="Choose a show"
          button-id="auto-show"
          aria-label="Choose a show"
          testid="awards-auto-show"
          grow
        />

        <button
          type="button"
          class="btn btn-brand run-btn"
          :disabled="!canRun"
          data-testid="awards-auto-run"
          @click="runAuto"
        >
          <span
            v-if="sending"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          ></span>
          <i v-else class="bi bi-stars me-2" aria-hidden="true"></i
          >{{ sending ? 'Checking check-ins...' : 'Run auto-awards' }}
        </button>

        <div class="safe-note">
          <i class="bi bi-shield-check" aria-hidden="true"></i>
          <span
            >Safe to run again: nobody gets the same badge twice for one show. Best run after the
            show ends.</span
          >
        </div>

        <div
          v-if="runError"
          class="alert alert-danger d-flex align-items-start gap-2 mt-3 mb-0"
          role="alert"
          data-testid="awards-auto-error"
        >
          <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
          <div class="flex-grow-1">{{ runError }}</div>
          <button
            type="button"
            class="btn-close"
            aria-label="Dismiss"
            @click="runError = ''"
          ></button>
        </div>

        <div
          v-if="resultShown"
          class="alert d-flex align-items-start gap-2 mt-3 mb-0"
          :class="totalGiven ? 'alert-success' : 'alert-secondary'"
          role="status"
          data-testid="awards-auto-result"
        >
          <i
            :class="['bi', totalGiven ? 'bi-check-circle-fill' : 'bi-info-circle-fill']"
            aria-hidden="true"
          ></i>
          <div>
            <strong>{{ ranFor }}:</strong>
            <template v-if="totalGiven">
              gave {{ totalGiven }} badge{{ totalGiven === 1 ? '' : 's' }}.
              {{ result.skipped ? `Skipped ${result.skipped} (already given).` : '' }}
            </template>
            <template v-else-if="result.skipped">
              nothing new. All {{ result.skipped }} badge{{ result.skipped === 1 ? '' : 's' }}
              earned so far had already been given.
            </template>
            <template v-else>
              no one qualifies yet. These badges come from check-ins, so run this again after the
              show.
            </template>
          </div>
        </div>
      </div>

      <div class="col-md-7 col-lg-8">
        <div class="form-label field-label" id="auto-rules-label">What the app checks</div>
        <ul class="rules" aria-labelledby="auto-rules-label">
          <li v-for="b in autoBadges" :key="b.code" class="rule" data-testid="awards-auto-rule">
            <span class="rule-medal" aria-hidden="true"><i :class="['bi', b.icon]"></i></span>
            <div class="rule-text min-w-0">
              <div class="rule-name">{{ b.name }}</div>
              <div class="small text-muted-hw">{{ b.description }}</div>
            </div>
            <span
              v-if="resultShown"
              class="count-pill"
              :class="{ 'is-zero': !result.given[b.code] }"
              :data-testid="'awards-auto-count-' + b.code"
            >
              <i
                :class="['bi', result.given[b.code] ? 'bi-plus-circle-fill' : 'bi-dash-circle']"
                aria-hidden="true"
              ></i>
              {{ result.given[b.code] ? result.given[b.code] + ' given' : 'None new' }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styles for the automatic awards card. */

.auto-card {
  --tint: rgb(20 33 61 / 0.08);
  --line: rgb(20 33 61 / 0.1);
  --accent: var(--hw-red);
  --green: var(--hw-success);
  --green-tint: rgb(26 127 75 / 0.12);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
[data-bs-theme='dark'] .auto-card {
  --tint: rgb(255 255 255 / 0.07);
  --line: rgb(255 255 255 / 0.08);
  --accent: var(--hw-landing-accent);
  --green: #4cc38a;
  --green-tint: rgb(76 195 138 / 0.14);
}
@media (min-width: 992px) {
  .auto-card {
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

.run-btn {
  width: 100%;
  margin-top: 0.75rem;
  font-weight: 600;
}
.auto-card .btn-brand {
  --bs-btn-disabled-bg: var(--hw-red);
  --bs-btn-disabled-border-color: var(--hw-red);
  --bs-btn-disabled-color: #fff;
}
.safe-note {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin-top: 0.7rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--hw-muted);
}
.safe-note > i {
  margin-top: 0.05rem;
  color: var(--green);
}

.rules {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--bs-border-color);
  border-radius: var(--hw-radius);
}
.rule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.85rem;
  padding: 0.85rem 1rem;
}
.rule + .rule {
  border-top: 1px solid var(--line);
}
.rule-medal {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  font-size: 1rem;
  background: radial-gradient(
    circle at 32% 28%,
    #ff5a68 0%,
    var(--hw-red) 55%,
    var(--hw-red-dark) 100%
  );
  box-shadow: 0 0 0 3px rgb(214 0 28 / 0.15);
}
.rule-text {
  flex: 1 1 12rem;
}
.rule-name {
  font-weight: 600;
  color: var(--hw-heading);
}

.count-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}
.count-pill.is-zero {
  background: var(--tint);
  color: var(--hw-muted);
  font-weight: 600;
}

@media (max-width: 575.98px) {
  .rule {
    padding: 0.75rem 0.85rem;
  }
  .count-pill {
    margin-left: calc(
      40px + 0.85rem
    );
  }
}
</style>
