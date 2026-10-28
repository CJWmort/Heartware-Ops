<script setup>
// Feature 1b – Smart Allocation (volunteer side) — owner: Fanny
// CHANGED: this page used to hard-code 3 shows with 2026 dates and never asked the server for the volunteer's
// allocation, so every show said "Awaiting allocation" forever. It now uses useMyAssignment() (services/assignment.js),
// which loads the real shows (4 shows, 2027 dates), the volunteer's PUBLISHED assignments, and handles
// accept / decline / withdraw. Keeping that logic in the service keeps this file about the screen only.
import { computed, onMounted, ref } from 'vue'
import PageLoading from '@/components/common/PageLoading.vue' // NEW: fading "Fetching..." overlay
import SchoolRouteMap from '@/components/map/SchoolRouteMap.vue'
import {
  useMyAssignment,
  showStatus,
  statusClass,
  formatDate,
  formatDeadline,
} from '@/services/assignment' // CHANGED: formatDeadline added

const {
  volData,
  volAvailableShows,
  shows,
  errorMessage,
  loading, // NEW: true until the first load finishes
  hasNoAvailability,
  loadData,
  showAvailabilityModal,
  selectedShows,
  saving,
  modalError,
  openAvailabilityModal,
  closeAvailabilityModal,
  saveAvailability,
  acceptingId,
  acceptShow,
  pullOutMode,
  withdrawShow,
  withdrawReason,
  withdrawing,
  withdrawError,
  openDeclineModal,
  openWithdrawModal,
  closeWithdrawModal,
  confirmWithdraw,
} = useMyAssignment()

onMounted(loadData)

function rowStatus(show) {
  if (!selectedShows.value.includes(show.name)) return 'Not available'
  const st = showStatus(show, volAvailableShows.value)
  return st === 'Not available' ? 'Awaiting allocation' : st
}

function rowTone(show) {
  if (!selectedShows.value.includes(show.name)) return 'tone-info'
  const st = rowStatus(show)
  if (st === 'Awaiting allocation') return 'tone-info'
  if (st === 'Pending') return 'tone-warning'
  return 'tone-muted'
}

function lockInfo(show) {
  if (show.assignment?.status === 'Accepted')
    return { text: 'You have accepted a place in this show', tone: 'success', icon: 'bi-lock-fill' }
  if (show.withdrawal)
    return {
      text: show.withdrawal.status === 'Declined' ? 'You declined this show' : 'You withdrew from this show',
      tone: 'danger',
      icon: 'bi-slash-circle-fill',
    }
  return null
}

// ===== Directions popup (map from home to the school) =====
const directionsShow = ref(null) // show whose directions are open (popup is open when set)

// Home location from the volunteer's account (saved when they registered)
const home = computed(() => {
  const v = volData.value
  return typeof v?.lat === 'number' && typeof v?.lng === 'number'
    ? { lat: v.lat, lng: v.lng }
    : null
})

// Directions only make sense when both ends have a location
function canShowDirections(show) {
  const school = show.assignment?.school
  return !!home.value && typeof school?.lat === 'number' && typeof school?.lng === 'number'
}

// Left edge of each card follows the status: amber = needs an answer, green = confirmed, grey = nothing to do
function edgeColour(status) {
  if (status === 'Pending') return 'var(--hw-warning)'
  if (status === 'Accepted') return 'var(--hw-success)'
  return 'var(--hw-muted)'
}

// Date tile on each card: "SAT" / "27" / "JUN 2027"
function datePart(date, part) {
  const d = new Date(date)
  if (part === 'weekday') return d.toLocaleDateString('en-SG', { weekday: 'short' })
  if (part === 'day') return d.getDate()
  return d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })
}
</script>

<template>
  <section class="assign-page" :class="{ 'is-loading': loading }">
    <Transition name="loading-fade">
      <PageLoading v-if="loading" contained text="Fetching Your Shows..." />
    </Transition>
    <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

    <div
      v-if="hasNoAvailability"
      class="alert alert-info d-flex align-items-center"
      role="alert"
      data-testid="no-availability"
    >
      <i class="bi bi-info-circle me-2"></i>
      You haven't indicated any available shows yet. Click
      <strong class="mx-1">Change Availability</strong> to choose your shows.
    </div>

    <div class="d-flex justify-content-end mb-3">
      <button
        type="button"
        class="btn btn-brand"
        data-testid="change-availability"
        @click="openAvailabilityModal"
      >
        <i class="bi bi-calendar-check me-1"></i> Change Availability
      </button>
    </div>

    <div class="assignment-list">
      <article
        v-for="show in shows"
        :key="show._id || show.name"
        class="assignment-card card-hw"
        :class="{ 'is-left': !show.assignment && show.withdrawal }"
        :style="{ '--edge': edgeColour(showStatus(show, volAvailableShows)) }"
        data-testid="assignment-card"
      >
        <header class="card-top">
          <div class="date-tile" :aria-label="formatDate(show.date)">
            <span class="date-weekday">{{ datePart(show.date, 'weekday') }}</span>
            <span class="date-day">{{ datePart(show.date, 'day') }}</span>
            <span class="date-month">{{ datePart(show.date, 'month') }}</span>
          </div>
          <div class="card-title">
            <h2 class="h5 mb-1">{{ show.name }}</h2>
            <span
              class="badge rounded-pill"
              :class="statusClass(showStatus(show, volAvailableShows))"
              data-testid="assignment-status"
            >
              {{ showStatus(show, volAvailableShows) }}
            </span>
          </div>
          <div v-if="show.assignment" class="card-actions">
            <button
              v-if="canShowDirections(show)"
              type="button"
              class="btn btn-outline-primary rounded-pill"
              data-testid="assignment-directions"
              @click="directionsShow = show"
            >
              <i class="bi bi-sign-turn-right me-1" aria-hidden="true"></i>Directions
            </button>
            <template v-if="show.assignment.status === 'Pending'">
              <button
                type="button"
                class="btn btn-success rounded-pill"
                :disabled="acceptingId === show.assignment._id"
                data-testid="assignment-accept"
                @click="acceptShow(show)"
              >
                <span
                  v-if="acceptingId === show.assignment._id"
                  class="spinner-border spinner-border-sm me-1"
                  aria-hidden="true"
                ></span>
                <i v-else class="bi bi-check-lg me-1" aria-hidden="true"></i>Accept
              </button>
              <button
                type="button"
                class="btn btn-outline-danger rounded-pill"
                data-testid="assignment-decline"
                @click="openDeclineModal(show)"
              >
                Decline
              </button>
            </template>
            <button
              v-else-if="show.assignment.status === 'Accepted'"
              type="button"
              class="btn btn-outline-danger rounded-pill"
              data-testid="assignment-withdraw"
              @click="openWithdrawModal(show)"
            >
              Withdraw
            </button>
          </div>
        </header>

        <div class="details">
          <div class="detail">
            <span class="detail-icon" aria-hidden="true"><i class="bi bi-clock"></i></span>
            <span class="detail-body">
              <small class="detail-label">Reporting time</small>
              <span class="detail-value">{{
                show.assignment?.school?.reportingTime || show.withdrawal?.reportingTime || '—'
              }}</span>
            </span>
          </div>
          <div class="detail">
            <span class="detail-icon" aria-hidden="true"><i class="bi bi-geo-alt"></i></span>
            <span class="detail-body" data-testid="assignment-school">
              <small class="detail-label">Reporting location</small>
              <template v-if="show.assignment?.school">
                <span class="detail-value">{{ show.assignment.school.name }}</span>
                <small class="detail-sub">{{ show.assignment.school.address }}</small>
              </template>
              <template v-else-if="show.withdrawal">
                <span class="detail-value">{{ show.withdrawal.reportingLocation || '—' }}</span>
                <small v-if="show.withdrawal.reason" class="detail-sub"
                  >Reason: {{ show.withdrawal.reason }}</small
                >
              </template>
              <span v-else class="detail-value">—</span>
            </span>
          </div>
        </div>

      </article>
    </div>

    <!-- Decline / pull out popup. ONE popup for both actions: the wording and the endpoint change with pullOutMode.
         The reason is optional and limited to 300 characters (the server enforces the same limit). -->
    <template v-if="withdrawShow">
      <Teleport to="body">
      <div
        class="modal d-block hw-modal"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pullout-title"
        data-testid="pullout-modal"
        @click.self="closeWithdrawModal"
      >
        <!-- CHANGED: removed "modal-dialog-centered" so this popup opens at the TOP centre, not the middle of the screen -->
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <!-- CHANGED: the Accepted wording was "Pull out of ...?". It now uses the same words as the row button
                   ("Withdraw") so the volunteer sees one name for one action. Decline wording is unchanged. -->
              <h5 class="modal-title" id="pullout-title">
                {{ pullOutMode === 'decline' ? 'Decline' : 'Withdraw from' }}
                {{ withdrawShow.name }}?
              </h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Close"
                :disabled="withdrawing"
                @click="closeWithdrawModal"
              ></button>
            </div>
            <div class="modal-body">
              <p class="text-muted">
                {{
                  pullOutMode === 'decline'
                    ? 'Your slot will be given to someone else.'
                    : 'You already accepted this show. Your slot will be given to someone else.'
                }}
              </p>
              <label for="pullout-reason" class="form-label">Reason (optional)</label>
              <textarea
                id="pullout-reason"
                v-model="withdrawReason"
                class="form-control"
                rows="3"
                maxlength="300"
                data-testid="pullout-reason"
              ></textarea>
              <div v-if="withdrawError" class="alert alert-danger mt-3 mb-0" role="alert">
                {{ withdrawError }}
              </div>
            </div>
            <div class="modal-footer">
              <!-- E2E: data-testid="pullout-cancel" lets the Assignment test press "Keep my slot" without relying on its wording -->
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="withdrawing"
                data-testid="pullout-cancel"
                @click="closeWithdrawModal"
              >
                Keep my slot
              </button>
              <!-- CHANGED: confirm button text was "Pull out"; now matches the row button, "Withdraw". -->
              <button
                type="button"
                class="btn btn-danger"
                :disabled="withdrawing"
                data-testid="pullout-confirm"
                @click="confirmWithdraw"
              >
                <span
                  v-if="withdrawing"
                  class="spinner-border spinner-border-sm me-1"
                  aria-hidden="true"
                ></span>
                {{ pullOutMode === 'decline' ? 'Decline' : 'Withdraw' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show hw-backdrop"></div>
      </Teleport>
    </template>

    <!-- Directions popup: map with the route from home to the school (components/map/SchoolRouteMap.vue).
         The map is only created while the popup is open, so the page does not load OneMap tiles it does not show. -->
    <template v-if="directionsShow">
      <Teleport to="body">
      <div
        class="modal d-block hw-modal"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directions-title"
        data-testid="directions-modal"
        @click.self="directionsShow = null"
        @keydown.esc="directionsShow = null"
      >
        <!-- CHANGED: removed "modal-dialog-centered" so this popup opens at the TOP centre, not the middle of the screen -->
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <div>
                <h5 class="modal-title" id="directions-title">
                  <i class="bi bi-sign-turn-right me-1"></i> Directions to
                  {{ directionsShow.assignment.school.name }}
                </h5>
                <small class="text-muted-hw">
                  {{ directionsShow.name }} · {{ formatDate(directionsShow.date) }}
                  <template v-if="directionsShow.assignment.school.reportingTime">
                    · report at {{ directionsShow.assignment.school.reportingTime }}
                  </template>
                </small>
              </div>
              <button
                type="button"
                class="btn-close"
                aria-label="Close"
                @click="directionsShow = null"
              ></button>
            </div>
            <div class="modal-body">
              <SchoolRouteMap :home="home" :school="directionsShow.assignment.school" />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show hw-backdrop"></div>
      </Teleport>
    </template>

    <!-- Change Availability popup -->
    <template v-if="showAvailabilityModal">
      <Teleport to="body">
      <div
        class="modal d-block hw-modal"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-title"
        data-testid="availability-modal"
        @click.self="closeAvailabilityModal"
        @keydown.esc="closeAvailabilityModal"
      >
        <!-- CHANGED: removed "modal-dialog-centered" so this popup opens at the TOP centre, not the middle of the screen -->
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="availability-title">
                <i class="bi bi-calendar-check me-1"></i> Change Availability
              </h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Close"
                :disabled="saving"
                @click="closeAvailabilityModal"
              ></button>
            </div>

            <div class="modal-body">
              <p class="avail-intro">Tick the shows you are available for.</p>

              <div class="avail-list">
                <template v-for="show in shows" :key="show._id || show.name">
                  <div v-if="lockInfo(show)" class="avail-row is-locked" :class="lockInfo(show).tone">
                    <span class="avail-lock" aria-hidden="true"><i class="bi" :class="lockInfo(show).icon"></i></span>
                    <div class="avail-text">
                      <div class="avail-name">{{ show.name }}</div>
                      <div class="avail-date"><i class="bi bi-calendar3" aria-hidden="true"></i>{{ formatDate(show.date) }}</div>
                      <div class="avail-note" :data-testid="`availability-locked-${show.name}`">
                        {{ lockInfo(show).text }}
                      </div>
                    </div>
                    <span class="badge rounded-pill avail-pill" :class="statusClass(showStatus(show, volAvailableShows))">
                      {{ showStatus(show, volAvailableShows) }}
                    </span>
                  </div>

                  <label
                    v-else
                    class="avail-row"
                    :class="[rowTone(show), { checked: selectedShows.includes(show.name) }]"
                  >
                    <input
                      class="avail-check"
                      type="checkbox"
                      :value="show.name"
                      v-model="selectedShows"
                      :data-testid="`availability-${show.name}`"
                    />
                    <div class="avail-text">
                      <div class="avail-name">{{ show.name }}</div>
                      <div class="avail-date"><i class="bi bi-calendar3" aria-hidden="true"></i>{{ formatDate(show.date) }}</div>
                    </div>
                    <span class="badge rounded-pill avail-pill" :class="statusClass(rowStatus(show))">
                      {{ rowStatus(show) }}
                    </span>
                  </label>
                </template>
              </div>

              <div v-if="modalError" class="alert alert-danger mt-3 mb-0" role="alert">
                {{ modalError }}
              </div>
            </div>

            <div class="modal-footer">
              <span class="avail-count me-auto">{{ selectedShows.length }} of {{ shows.length }} selected</span>
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="saving"
                @click="closeAvailabilityModal"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-brand"
                :disabled="saving"
                data-testid="availability-save"
                @click="saveAvailability"
              >
                <span
                  v-if="saving"
                  class="spinner-border spinner-border-sm me-1"
                  aria-hidden="true"
                ></span>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show hw-backdrop"></div>
      </Teleport>
    </template>
  </section>
</template>

<style scoped>
.assign-page {
  position: relative;
  width: 100%;
}
.assign-page.is-loading {
  min-height: calc(100vh - 128px);
}

.hw-modal {
  z-index: 1300;
  overflow-y: auto;
  --bs-modal-border-radius: 18px;
  --bs-modal-inner-border-radius: 18px;
  --hw-footer-bg: #eef1f7;
  --hw-footer-line: #dde2ec;
}
[data-bs-theme='dark'] .hw-modal {
  --hw-footer-bg: #1b2440;
  --hw-footer-line: rgb(255 255 255 / 0.1);
}
.hw-backdrop {
  z-index: 1290;
  background: #0b1020;
}
.hw-modal .modal-dialog {
  animation: hw-modal-in 0.22s ease-out;
}
.hw-modal .modal-content {
  border: 0;
  border-radius: 18px;
  background: var(--hw-surface);
  color: var(--hw-text);
  box-shadow: 0 24px 60px rgb(11 16 32 / 0.35);
  overflow: hidden;
}
.hw-modal .modal-header {
  padding: 1.1rem 1.4rem;
  border-bottom: 1px solid var(--bs-border-color);
}
.hw-modal .modal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.hw-modal .modal-title .bi {
  color: var(--hw-red);
}
.hw-modal .modal-body {
  padding: 1.25rem 1.4rem;
}
.hw-modal .modal-header {
  background: var(--hw-surface);
}
.hw-modal .modal-footer {
  padding: 1rem 1.4rem;
  border-top: 1px solid var(--hw-footer-line);
  background: var(--hw-footer-bg);
  border-radius: 0 0 18px 18px;
  gap: 0.6rem;
}
.hw-modal .modal-footer .btn {
  margin: 0;
  padding: 0.5rem 1.3rem;
  border-radius: 999px;
  font-weight: 600;
}
.avail-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--hw-muted);
}
[data-bs-theme='dark'] .hw-modal .btn-close {
  filter: invert(1) grayscale(1);
}

.avail-intro {
  margin: 0 0 1rem;
  color: var(--hw-muted);
}
.avail-list {
  display: grid;
  gap: 10px;
}
.avail-row {
  --tone: #0dcaf0;
  --tone-soft: rgb(13 202 240 / 0.12);
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
  padding: 14px 16px;
  border: 1.5px solid var(--bs-border-color);
  border-radius: 16px;
  background: var(--hw-surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}
.avail-row.tone-warning {
  --tone: #ffc107;
  --tone-soft: rgb(255 193 7 / 0.14);
}
.avail-row.tone-muted {
  --tone: #8a93a5;
  --tone-soft: rgb(138 147 165 / 0.14);
}
.avail-row:hover:not(.is-locked) {
  border-color: var(--tone);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgb(20 33 61 / 0.08);
}
.avail-row.checked {
  border-color: var(--tone);
  background: var(--tone-soft);
}
.avail-row.is-locked {
  cursor: default;
  background: var(--hw-bg);
}
.avail-row.is-locked.success {
  border-color: rgb(26 127 75 / 0.35);
}
.avail-row.is-locked.danger {
  border-color: rgb(200 30 30 / 0.3);
}
.avail-text {
  flex: 1 1 auto;
  min-width: 0;
}
.avail-pill {
  flex: 0 0 auto;
  font-size: 0.72rem;
}
.avail-name {
  font-weight: 700;
  color: var(--hw-heading);
}
.avail-date {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
  font-size: 0.82rem;
  color: var(--hw-muted);
}
.avail-note {
  margin-top: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}
.avail-row.success .avail-note {
  color: var(--hw-success);
}
.avail-row.danger .avail-note {
  color: var(--hw-danger);
}
.avail-lock {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 0.8rem;
  color: #fff;
}
.avail-row.success .avail-lock {
  background: var(--hw-success);
}
.avail-row.danger .avail-lock {
  background: var(--hw-danger);
}

.avail-check {
  appearance: none;
  -webkit-appearance: none;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  margin: 0;
  border: 2px solid #b8bfcc;
  border-radius: 8px;
  background: var(--hw-surface) center / 16px no-repeat;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    transform 0.15s;
}
.avail-row:hover .avail-check {
  border-color: var(--tone);
}
.avail-check:checked {
  border-color: var(--tone);
  background-color: var(--tone);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5l3 3 6-6.5'/%3E%3C/svg%3E");
  transform: scale(1.05);
}
.avail-row.tone-info .avail-check:checked,
.avail-row.tone-warning .avail-check:checked {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23102a35' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5l3 3 6-6.5'/%3E%3C/svg%3E");
}
.avail-check:active {
  transform: scale(0.92);
}
.avail-check:focus-visible {
  outline: 3px solid var(--tone-soft);
  outline-offset: 2px;
}

@keyframes hw-modal-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hw-modal .modal-dialog {
    animation: none;
  }
  .avail-row,
  .avail-check {
    transition: none;
  }
}

.assignment-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
.assignment-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-left: 5px solid var(--edge, var(--hw-muted));
}

.card-top {
  display: flex;
  align-items: center;
  gap: 16px;
}
.card-title {
  min-width: 0;
}
.card-title h2 {
  color: var(--hw-heading);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.card-title .badge {
  padding: 0.4em 0.8em;
  font-weight: 600;
}

.date-tile {
  flex: 0 0 auto;
  width: 64px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--hw-surface);
  border: 1px solid var(--bs-border-color);
  box-shadow: 0 2px 6px rgb(20 33 61 / 0.08);
  text-align: center;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.date-weekday {
  padding: 4px 0;
  background: var(--hw-red);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
}
.date-day {
  padding-top: 4px;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--hw-heading);
  font-variant-numeric: tabular-nums;
}
.date-month {
  padding-bottom: 6px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hw-muted);
}

.details {
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1.4fr);
  gap: 12px;
}
.detail {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--hw-bg);
}
.detail-icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(214 0 28 / 0.1);
  color: var(--hw-red);
}
.detail-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.detail-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hw-muted);
}
.detail-value {
  font-weight: 600;
  color: var(--hw-heading);
  overflow-wrap: anywhere;
}
.detail-sub {
  margin-top: 2px;
  color: var(--hw-muted);
  overflow-wrap: anywhere;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}
.card-actions .btn {
  min-width: 0;
  font-weight: 600;
}

.assignment-card.is-left {
  color: var(--hw-muted);
}
.assignment-card.is-left .card-title h2,
.assignment-card.is-left .date-day,
.assignment-card.is-left .detail-value {
  color: var(--hw-muted);
}
.assignment-card.is-left .date-weekday {
  background: var(--hw-muted);
}
.assignment-card.is-left .detail-icon {
  background: rgb(107 114 128 / 0.12);
  color: var(--hw-muted);
}

@media (max-width: 575.98px) {
  .assignment-card {
    padding: 16px;
  }
  .details {
    grid-template-columns: minmax(0, 1fr);
  }
  .card-top {
    flex-wrap: wrap;
  }
  .card-actions {
    width: 100%;
    margin-left: 0;
  }
  .card-actions .btn {
    flex: 1;
  }
}
</style>