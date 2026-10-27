<script setup>
// Feature 5 – "Auto-awards" card on the coordinator page — owner: Hanafi
// Layout and CSS: AI-generated (declared in README.txt). Logic in the TODOs below: Hanafi.
import { ref, computed, onMounted } from 'vue'
import PageLoading from '@/components/common/PageLoading.vue' // NEW: fading "Fetching..." overlay
import { listBadges, autoAward } from '@/services/badges.js'
import { getShows, formatDate } from '@/services/assignment.js'

const shows = ref([]) // every show: [{ name: 'NE Show 1', date: '2027-06-27' }, ...]
const badges = ref([]) // every badge from badges.json
const loading = ref(true)
const loadError = ref('')

const event = ref('') // the show picked in the dropdown, e.g. 'NE Show 1'
const sending = ref(false)
const runError = ref('')
const result = ref(null) // the server's reply: { given: { FULL_ROUTE: 2, EARLY_BIRD: 0, SUPER_SUB: 1 }, skipped: 3 }
const ranFor = ref('') // which show `result` belongs to

async function loadData() {
  try {
    const [badgeList, showList] = await Promise.all([listBadges(), getShows()])
    badges.value = badgeList
    shows.value = showList

    event.value = shows.value[0]?.name
  } catch (e) {
    loadError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

const autoBadges = computed(() => badges.value.filter((badge) => badge.awardType === 'auto'))

const canRun = computed(() => (event.value && !sending.value ? true : false))

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

const resultShown = computed(() => (result.value && ranFor.value === event.value ? true : false))

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

onMounted(loadData)
</script>

<template>
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

    <!-- NEW: box with a contained overlay. No <Transition> on this box on purpose: if the box faded out while the content
         appeared, both would take up space for 0.5s and the content would jump. -->
    <div v-if="loading" class="loading-area"><PageLoading contained text="Fetching Shows..." /></div>

    <div
      v-if="!loading && loadError"
      class="alert alert-danger d-flex align-items-start gap-2 mb-0"
      role="alert"
    >
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ loadError }}</div>
    </div>

    <div v-else-if="!loading" class="row g-4">
      <!-- Left: the one decision (which show) and the one action (run), with its result right underneath -->
      <div class="col-md-5 col-lg-4">
        <label for="auto-show" class="form-label field-label">For which show</label>
        <select id="auto-show" v-model="event" class="form-select" data-testid="awards-auto-show">
          <option v-for="s in shows" :key="s.name" :value="s.name">
            {{ s.name }}<template v-if="s.date"> · {{ formatDate(s.date) }}</template>
          </option>
        </select>

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
            class="btn-close btn-close-sm"
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

      <!-- Right: what the app checks, and how many of each the last run gave (count sits next to its own badge) -->
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
/* ---------- Colours that change in dark mode (same idea as main.css and the other badge cards) ---------- */
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
  --accent: var(--hw-landing-accent); /* brighter red, readable on navy */
  --green: #4cc38a; /* the light-mode green is too dark to read on navy */
  --green-tint: rgb(76 195 138 / 0.14);
}
@media (min-width: 992px) {
  .auto-card {
    padding: 1.5rem;
  }
}

/* ---------- Heading (same look as the other two cards on this page) ---------- */
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

/* ---------- Left column: show + run ---------- */
.run-btn {
  width: 100%;
  margin-top: 0.75rem;
  font-weight: 600;
}
/* main.css gives .btn-brand no "disabled" colours: keep it red, just faded (same fix as the Give-a-badge form) */
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

/* ---------- Right column: the three rules as one grouped list (common region) ---------- */
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
/* Same red medal as the Give-a-badge preview, so a badge looks the same everywhere (similarity) */
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
  flex: 1 1 12rem; /* when there is no room for the count beside it, the count drops to the next line */
}
.rule-name {
  font-weight: 600;
  color: var(--hw-heading);
}

/* Result per badge: icon + words + colour (colour never carries the meaning alone) */
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

/* ---------- Phones ---------- */
@media (max-width: 575.98px) {
  .rule {
    padding: 0.75rem 0.85rem;
  }
  .count-pill {
    margin-left: calc(
      40px + 0.85rem
    ); /* line the count up under the badge name, not under the medal */
  }
}
</style>
