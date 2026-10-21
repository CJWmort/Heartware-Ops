<script setup>
// Feature 1b – Smart Allocation (volunteer side) — owner: Fanny
// CHANGED: this page used to hard-code 3 shows with 2026 dates and never asked the server for the volunteer's
// allocation, so every show said "Awaiting allocation" forever. It now uses useMyAssignment() (services/assignment.js),
// which loads the real shows (4 shows, 2027 dates), the volunteer's PUBLISHED assignments, and handles
// accept / decline / withdraw. Keeping that logic in the service keeps this file about the screen only.
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useMyAssignment, showStatus, statusClass, formatDate } from '@/services/assignment'

const {
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
</script>

<template>
  <section>
    <PageHeader title="My Assignment" icon="bi-geo-alt" />
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

    <!-- One row per show from the database. The row shows the school only once the admin has published the allocation. -->
    <div class="card shadow-sm" data-testid="assignment-card">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="text-center">S/N</th>
              <th scope="col" class="text-center">Show</th>
              <th scope="col" class="text-center">Reporting Date</th>
              <th scope="col" class="text-center">Reporting Time</th>
              <th scope="col" class="text-center">Reporting Location</th>
              <th scope="col" class="text-center">Status</th>
              <th scope="col" class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <!-- declined / withdrawn rows are greyed out: the volunteer is no longer going -->
            <tr
              v-for="(show, index) in shows"
              :key="show._id || show.name"
              :class="{ 'row-left': !show.assignment && show.withdrawal }"
            >
              <td class="text-center text-muted">{{ index + 1 }}</td>
              <td class="text-center fw-semibold">{{ show.name }}</td>
              <td class="text-center">{{ formatDate(show.date) }}</td>
              <td class="text-center">{{ show.assignment?.school?.reportingTime || show.withdrawal?.reportingTime || '—' }}</td>
              <td class="text-center" data-testid="assignment-school">
                <template v-if="show.assignment?.school">
                  {{ show.assignment.school.name }}
                  <div class="small text-muted">{{ show.assignment.school.address }}</div>
                </template>
                <!-- declined / withdrawn: the assignment was deleted, so show where they were going from the log -->
                <template v-else-if="show.withdrawal">
                  {{ show.withdrawal.reportingLocation || '—' }}
                  <div v-if="show.withdrawal.reason" class="small">Reason: {{ show.withdrawal.reason }}</div>
                </template>
                <template v-else>—</template>
              </td>
              <td class="text-center">
                <span
                  class="badge rounded-pill"
                  :class="statusClass(showStatus(show, volAvailableShows))"
                  data-testid="assignment-status"
                >
                  {{ showStatus(show, volAvailableShows) }}
                </span>
              </td>
              <!-- Action column. Which buttons appear depends on the status:
                   Pending  -> Accept / Decline (volunteer has not answered yet)
                   Accepted -> "Withdraw" (pull out; the place is reopened)
                   Declined / Withdrawn -> no button: the answer is final (there is no Undo)
                   anything else (reserve, not available) -> nothing to do -->
              <td class="text-center text-nowrap">
                <template v-if="show.assignment?.status === 'Pending'">
                  <button
                    type="button"
                    class="btn btn-sm btn-success me-1"
                    :disabled="acceptingId === show.assignment._id"
                    data-testid="assignment-accept"
                    @click="acceptShow(show)"
                  >
                    <span
                      v-if="acceptingId === show.assignment._id"
                      class="spinner-border spinner-border-sm me-1"
                      aria-hidden="true"
                    ></span>
                    Accept
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    data-testid="assignment-decline"
                    @click="openDeclineModal(show)"
                  >
                    Decline
                  </button>
                </template>
                <button
                  v-else-if="show.assignment?.status === 'Accepted'"
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  data-testid="assignment-withdraw"
                  @click="openWithdrawModal(show)"
                >
                  Withdraw
                </button>

                <span v-else class="text-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
                {{ pullOutMode === 'decline' ? 'Decline' : 'Withdraw from' }} {{ withdrawShow.name }}?
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
                    <div v-if="show.withdrawal" class="small text-danger" :data-testid="`availability-locked-${show.name}`">
                      {{ show.withdrawal.status === 'Declined' ? 'You declined this show' : 'You withdrew from this show' }}
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
/* Grey out every cell of a declined / withdrawn row (Bootstrap colours each cell, so the row needs this) */
.row-left > td {
  color: var(--bs-secondary-color);
}
</style>
