<script setup>
// Feature 1b – Smart Allocation (volunteer side) — owner: Fanny
// Spec: docs/FEATURES.md   ·   API calls + page logic: src/services/assignment.js   ·   Tests: e2e/
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useMyAssignment, showStatus, statusClass, formatDate } from '@/services/assignment'

const {
    volAvailableShows, shows, errorMessage, hasNoAvailability, loadData,
    showAvailabilityModal, selectedShows, saving, modalError,
    openAvailabilityModal, closeAvailabilityModal, saveAvailability,
    acceptingId, acceptShow,
    withdrawShow, withdrawReason, withdrawing, withdrawError,
    openWithdrawModal, closeWithdrawModal, confirmWithdraw,
} = useMyAssignment()

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="My Assignment" icon="bi-geo-alt" />
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
              <th scope="col" class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(show, index) in shows" :key="show.name">
              <td class="text-center text-muted">{{ index + 1 }}</td>
              <td class="fw-semibold">{{ show.name }}</td>
              <td>{{ formatDate(show.date) }}</td>
              <td>{{ show.assignment?.school.reportingTime || '—' }}</td>
              <td data-testid="assignment-school">
                <template v-if="show.assignment">
                  <div class="fw-semibold">{{ show.assignment.school.name }}</div>
                  <small class="text-muted">
                    {{ show.assignment.school.address }}, S{{ show.assignment.school.postalCode }}
                    · {{ show.assignment.distance }} km away
                  </small>
                </template>
                <template v-else>—</template>
              </td>
              <td class="text-center">
                <span class="badge rounded-pill" :class="statusClass(showStatus(show, volAvailableShows))" data-testid="assignment-status">
                  {{ showStatus(show, volAvailableShows) }}
                </span>
              </td>
              <td class="text-center">
                <button v-if="show.assignment?.status === 'Pending'" type="button" class="btn btn-success btn-sm"
                        :disabled="acceptingId === show.assignment._id" data-testid="assignment-accept" @click="acceptShow(show)">
                  <span v-if="acceptingId === show.assignment._id" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                  <i v-else class="bi bi-check-lg me-1"></i>Accept
                </button>
                <template v-else-if="show.assignment?.status === 'Accepted'">
                  <div class="text-success small mb-1">
                    <i class="bi bi-check-circle-fill me-1"></i>Confirmed
                  </div>
                  <button type="button" class="btn btn-outline-danger btn-sm" data-testid="assignment-withdraw" @click="openWithdrawModal(show)">
                    <i class="bi bi-box-arrow-right me-1"></i>Pull out
                  </button>
                </template>
                <span v-else class="text-muted">—</span>
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
                    <small class="text-muted">{{ formatDate(show.date) }}</small>
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

    <!-- Pull out popup (confirm step) -->
    <template v-if="withdrawShow">
      <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="withdraw-title"
           data-testid="withdraw-modal" @click.self="closeWithdrawModal" @keydown.esc="closeWithdrawModal">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title text-danger" id="withdraw-title">
                <i class="bi bi-exclamation-triangle me-1"></i> Pull out of {{ withdrawShow.name }}?
              </h5>
              <button type="button" class="btn-close" aria-label="Close" :disabled="withdrawing" @click="closeWithdrawModal"></button>
            </div>

            <div class="modal-body">
              <p class="mb-3">
                You confirmed <strong>{{ withdrawShow.assignment.school.name }}</strong> on
                <strong>{{ formatDate(withdrawShow.date) }}</strong>. If you pull out, you will no longer be
                assigned to this school and you can't undo this here.
              </p>

              <label for="withdraw-reason" class="form-label">Reason <span class="text-muted">(optional)</span></label>
              <textarea id="withdraw-reason" class="form-control" rows="3" maxlength="300"
                        placeholder="e.g. Unwell, family emergency" v-model="withdrawReason" data-testid="withdraw-reason"></textarea>

              <div v-if="withdrawError" class="alert alert-danger mt-3 mb-0" role="alert">{{ withdrawError }}</div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="withdrawing" @click="closeWithdrawModal">Keep my slot</button>
              <button type="button" class="btn btn-danger" :disabled="withdrawing" data-testid="withdraw-confirm" @click="confirmWithdraw">
                <span v-if="withdrawing" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                Pull out
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show"></div>
    </template>

  </section>
</template>
