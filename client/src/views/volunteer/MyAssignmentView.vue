<script setup>
// Feature 1b – Smart Allocation (volunteer side) — owner: Fanny
// CHANGED: this page used to hard-code 3 shows with 2026 dates and never asked the server for the volunteer's
// allocation, so every show said "Awaiting allocation" forever. It now uses useMyAssignment() (services/assignment.js),
// which loads the real shows (4 shows, 2027 dates), the volunteer's PUBLISHED assignments, and handles
// accept / decline / withdraw. Keeping that logic in the service keeps this file about the screen only.
import { computed, onMounted, ref } from 'vue'
import SchoolRouteMap from '@/components/map/SchoolRouteMap.vue'
import { useMyAssignment, showStatus, statusClass, formatDate } from '@/services/assignment'

const {
  volData,
  volAvailableShows,
  shows,
  errorMessage,
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

// ===== Directions popup (map from home to the school) =====
const directionsShow = ref(null) // show whose directions are open (popup is open when set)

// Home location from the volunteer's account (saved when they registered)
const home = computed(() => {
  const v = volData.value
  return typeof v?.lat === 'number' && typeof v?.lng === 'number' ? { lat: v.lat, lng: v.lng } : null
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
  <section>
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

    <!-- One card per show, one card per row: date tile | show + details | status + buttons.
         On phones the parts stack. Same card style as the other pages (card-hw, text-muted-hw, pill badges). -->
    <div class="assignment-list">
      <!-- declined / withdrawn cards are greyed out: the volunteer is no longer going -->
      <article
        v-for="show in shows"
        :key="show._id || show.name"
        class="assignment-card card-hw"
        :class="{ 'is-left': !show.assignment && show.withdrawal }"
        :style="{ '--edge': edgeColour(showStatus(show, volAvailableShows)) }"
        data-testid="assignment-card"
      >
        <div class="date-tile" :aria-label="formatDate(show.date)">
          <span class="date-weekday">{{ datePart(show.date, 'weekday') }}</span>
          <span class="date-day">{{ datePart(show.date, 'day') }}</span>
          <span class="date-month">{{ datePart(show.date, 'month') }}</span>
        </div>

        <div class="card-main">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <h2 class="h5 mb-0">{{ show.name }}</h2>
            <span
              class="badge rounded-pill"
              :class="statusClass(showStatus(show, volAvailableShows))"
              data-testid="assignment-status"
            >
              {{ showStatus(show, volAvailableShows) }}
            </span>
          </div>

          <div class="details">
            <div class="detail">
              <i class="bi bi-clock" aria-hidden="true"></i>
              <span>
                <small class="d-block text-muted-hw">Reporting time</small>
                {{ show.assignment?.school?.reportingTime || show.withdrawal?.reportingTime || '—' }}
              </span>
            </div>
            <div class="detail">
              <i class="bi bi-geo-alt" aria-hidden="true"></i>
              <span data-testid="assignment-school">
                <small class="d-block text-muted-hw">Reporting location</small>
                <template v-if="show.assignment?.school">
                  {{ show.assignment.school.name }}
                  <small class="d-block text-muted-hw">{{ show.assignment.school.address }}</small>
                  <button
                    v-if="canShowDirections(show)"
                    type="button"
                    class="btn btn-sm btn-outline-primary mt-2"
                    data-testid="assignment-directions"
                    @click="directionsShow = show"
                  >
                    <i class="bi bi-sign-turn-right me-1" aria-hidden="true"></i>Directions
                  </button>
                </template>
                <!-- declined / withdrawn: the assignment was deleted, so show where they were going from the log -->
                <template v-else-if="show.withdrawal">
                  {{ show.withdrawal.reportingLocation || '—' }}
                  <small v-if="show.withdrawal.reason" class="d-block">Reason: {{ show.withdrawal.reason }}</small>
                </template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
        </div>

        <!-- Actions. Which buttons appear depends on the status:
             Pending  -> Accept / Decline (volunteer has not answered yet)
             Accepted -> "Withdraw" (pull out; the place is reopened)
             Declined / Withdrawn / reserve / not available -> no buttons (nothing to do; there is no Undo) -->
        <div v-if="show.assignment?.status === 'Pending'" class="card-actions">
          <button
            type="button"
            class="btn btn-success"
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
            class="btn btn-outline-danger"
            data-testid="assignment-decline"
            @click="openDeclineModal(show)"
          >
            Decline
          </button>
        </div>
        <div v-else-if="show.assignment?.status === 'Accepted'" class="card-actions">
          <button
            type="button"
            class="btn btn-outline-danger"
            data-testid="assignment-withdraw"
            @click="openWithdrawModal(show)"
          >
            Withdraw
          </button>
        </div>
      </article>
    </div>

    <!-- Decline / pull out popup. ONE popup for both actions: the wording and the endpoint change with pullOutMode.
         The reason is optional and limited to 300 characters (the server enforces the same limit). -->
    <template v-if="withdrawShow">
      <div
        class="modal d-block"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pullout-title"
        data-testid="pullout-modal"
        @click.self="closeWithdrawModal"
      >
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
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="withdrawing"
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
      <div class="modal-backdrop fade show"></div>
    </template>

    <!-- Directions popup: map with the route from home to the school (components/map/SchoolRouteMap.vue).
         The map is only created while the popup is open, so the page does not load OneMap tiles it does not show. -->
    <template v-if="directionsShow">
      <div
        class="modal d-block"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directions-title"
        data-testid="directions-modal"
        @click.self="directionsShow = null"
        @keydown.esc="directionsShow = null"
      >
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <div>
                <h5 class="modal-title" id="directions-title">
                  <i class="bi bi-sign-turn-right me-1"></i> Directions to {{ directionsShow.assignment.school.name }}
                </h5>
                <small class="text-muted-hw">
                  {{ directionsShow.name }} · {{ formatDate(directionsShow.date) }}
                  <template v-if="directionsShow.assignment.school.reportingTime">
                    · report at {{ directionsShow.assignment.school.reportingTime }}
                  </template>
                </small>
              </div>
              <button type="button" class="btn-close" aria-label="Close" @click="directionsShow = null"></button>
            </div>
            <div class="modal-body">
              <SchoolRouteMap :home="home" :school="directionsShow.assignment.school" />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show"></div>
    </template>

    <!-- Change Availability popup -->
    <template v-if="showAvailabilityModal">
      <div
        class="modal d-block"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-title"
        data-testid="availability-modal"
        @click.self="closeAvailabilityModal"
        @keydown.esc="closeAvailabilityModal"
      >
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
              <p class="text-muted mb-3">Tick the shows you are available for.</p>

              <div class="list-group">
                <!-- a show the volunteer declined / withdrew from is locked: that answer is final -->
                <label
                  v-for="show in shows"
                  :key="show._id || show.name"
                  class="list-group-item list-group-item-action d-flex align-items-center gap-3"
                  :class="{ disabled: show.withdrawal }"
                >
                  <input
                    class="form-check-input m-0"
                    type="checkbox"
                    :value="show.name"
                    v-model="selectedShows"
                    :disabled="!!show.withdrawal"
                    :data-testid="`availability-${show.name}`"
                  />
                  <div>
                    <div class="fw-semibold">{{ show.name }}</div>
                    <small class="text-muted">{{ formatDate(show.date) }}</small>
                    <div
                      v-if="show.withdrawal"
                      class="small text-danger"
                      :data-testid="`availability-locked-${show.name}`"
                    >
                      {{
                        show.withdrawal.status === 'Declined'
                          ? 'You declined this show'
                          : 'You withdrew from this show'
                      }}
                    </div>
                  </div>
                </label>
              </div>

              <div v-if="modalError" class="alert alert-danger mt-3 mb-0" role="alert">
                {{ modalError }}
              </div>
            </div>

            <div class="modal-footer">
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
      <div class="modal-backdrop fade show"></div>
    </template>
  </section>
</template>

<style scoped>
/* One card per row */
.assignment-list {
  display: grid;
  gap: 12px;
}
/* Card: date tile | show + details | buttons. Stacks on phones (see the media query below). */
.assignment-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px 20px;
  padding: 16px 20px;
  border-left: 4px solid var(--edge, var(--hw-muted)); /* colour set per card from its status */
}

/* Calendar-style date tile */
.date-tile {
  width: 76px;
  border-radius: calc(var(--hw-radius) - 0.25rem);
  background: var(--hw-bg);
  text-align: center;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.date-weekday,
.date-month {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hw-muted);
}
.date-day {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--hw-red);
  font-variant-numeric: tabular-nums;
}

.card-main {
  min-width: 0;
  display: grid;
  gap: 10px;
}
.card-main h2 {
  color: var(--hw-heading);
}
/* Time and location side by side; location takes the spare width */
.details {
  display: grid;
  grid-template-columns: minmax(120px, auto) minmax(0, 1fr);
  gap: 8px 24px;
}
.detail {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
}
.detail .bi {
  color: var(--hw-muted);
  margin-top: 2px;
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 130px;
}

/* Declined / withdrawn: greyed out, the volunteer is no longer going (the status badge keeps its colour) */
.assignment-card.is-left {
  color: var(--hw-muted);
}
.assignment-card.is-left .card-main h2,
.assignment-card.is-left .date-day {
  color: var(--hw-muted);
}

/* Phones: date tile and text side by side, buttons full width underneath */
@media (max-width: 767.98px) {
  .assignment-card {
    grid-template-columns: auto minmax(0, 1fr);
    padding: 14px 16px;
  }
  .date-tile {
    width: 64px;
  }
  .details {
    grid-template-columns: minmax(0, 1fr);
  }
  .card-actions {
    grid-column: 1 / -1;
    flex-direction: row;
  }
  .card-actions .btn {
    flex: 1;
  }
}
</style>
