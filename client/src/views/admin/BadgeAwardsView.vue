<script setup>
// Feature 5 – Awards + orders (coordinator) — owner: Hanafi
// Layout and CSS: AI-generated (declared in README.txt). Logic in the functions below: Hanafi.
import { ref, onMounted } from 'vue'
import { listAllOrders, updateOrderStatus } from '@/services/badges.js'
import { timeAgo } from '@/utils/time.js'
import BadgeAwardForm from '@/components/badges/BadgeAwardForm.vue'
import BadgeAutoAwards from '@/components/badges/BadgeAutoAwards.vue'

const statusSteps = ['placed', 'in_production', 'shipped', 'delivered']
const statusLabels = { placed: 'Placed', in_production: 'In production', shipped: 'Shipped', delivered: 'Delivered' }
const statusIcons = { placed: 'bi-receipt', in_production: 'bi-tools', shipped: 'bi-truck', delivered: 'bi-house-check-fill' }

const orders = ref([])
const loading = ref(true)
const error = ref('') 
const actionError = ref('') 
const savingId = ref(null) 

async function loadOrders() {
    loading.value = true
    error.value = ''
    try {
       const order = await listAllOrders()
       orders.value = order
    } catch (e) {
        error.value = e.friendlyMessage || 'Something went wrong. Please try again.'
        console.error(e)
    } finally {
        loading.value = false
    }
}

function nextStatus(order) {
    const current = statusSteps.indexOf(order.status)   
    const next = statusSteps[current + 1]      
    return next ? next : null            
}

async function advance(order) {
    const target = nextStatus(order) 
    savingId.value = order._id            
    actionError.value = ''          
    try {
        const updated = await updateOrderStatus(savingId.value, target)   
        order.status = updated.status                   
    } catch (e) {
        await loadOrders()                           
        actionError.value = e.friendlyMessage || 'Something went wrong. Please try again.'
        console.error(e)               
    } finally {
        savingId.value = null                  
  }
}

onMounted(loadOrders)
</script>

<template>
  <section class="awards-page">
    <BadgeAutoAwards />

    <!-- Badge orders -->
    <BadgeAwardForm />
    <div class="card-hw orders-card" data-testid="orders-card">
      <div class="section-head">
        <div class="d-flex align-items-start gap-3 min-w-0">
          <span class="head-icon" aria-hidden="true"><i class="bi bi-box-seam"></i></span>
          <div class="min-w-0">
            <h2 class="section-title">
              Badge Orders <span v-if="!loading && !error" class="section-count">{{ orders.length }}</span>
            </h2>
            <div class="small text-muted-hw">Move each order on as the badge is made, posted and received.</div>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-quiet" :disabled="loading" data-testid="orders-refresh" @click="loadOrders">
          <i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Refresh
        </button>
      </div>

      <div v-if="actionError" class="alert alert-warning d-flex align-items-start gap-2 mb-3" role="alert" data-testid="orders-error">
        <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
        <div class="flex-grow-1">{{ actionError }}</div>
        <button type="button" class="btn-close btn-close-sm" aria-label="Dismiss" @click="actionError = ''"></button>
      </div>

      <div v-if="loading" class="text-center text-muted-hw py-5">
        <div class="spinner-border" aria-hidden="true"></div>
        <div class="mt-2">Loading orders...</div>
      </div>

      <div v-else-if="error" class="alert alert-danger d-flex align-items-start gap-2 mb-0" role="alert">
        <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
        <div>{{ error }}</div>
      </div>

      <div v-else-if="orders.length === 0" class="empty-state">
        <i class="bi bi-inbox" aria-hidden="true"></i>
        <div>
          <div class="fw-semibold">No badge orders yet</div>
          <div class="small text-muted-hw">When a volunteer locks in their badge design, the order shows up here.</div>
        </div>
      </div>

      <table v-else class="orders-table" data-testid="orders-table">
        <thead>
          <tr>
            <th scope="col">Volunteer</th>
            <th scope="col">Badge</th>
            <th scope="col">Deliver to</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="visually-hidden">Next step</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order._id" data-testid="orders-row">
            <td data-label="Volunteer">
              <div class="fw-semibold text-truncate">{{ order.volunteer?.name || 'Deleted account' }}</div>
              <div class="small text-muted-hw text-truncate">{{ order.volunteer?.email || '—' }}</div>
            </td>

            <td data-label="Badge">
              <div class="d-flex align-items-center gap-2">
                <span class="snapshot-dots" aria-hidden="true">
                  <span :style="{ background: order.designSnapshot?.primaryColor }"></span>
                  <span :style="{ background: order.designSnapshot?.secondaryColor }"></span>
                </span>
                <div class="min-w-0">
                  <div class="text-capitalize">{{ order.designSnapshot?.shape }} · {{ order.designSnapshot?.emblem }}</div>
                  <div v-if="order.designSnapshot?.ribbonText" class="small text-muted-hw text-truncate">
                    “{{ order.designSnapshot.ribbonText }}”
                  </div>
                </div>
              </div>
            </td>

            <td data-label="Deliver to">
              <div>{{ order.address?.line1 }}<template v-if="order.address?.unit">, {{ order.address.unit }}</template></div>
              <div class="small text-muted-hw">Singapore {{ order.address?.postalCode }}</div>
            </td>

            <td data-label="Status">
              <span class="status-pill" :class="'is-' + order.status" data-testid="orders-status">
                <i :class="['bi', statusIcons[order.status]]" aria-hidden="true"></i>{{ statusLabels[order.status] || order.status }}
              </span>
              <span class="mini-steps" aria-hidden="true">
                <span v-for="(step, i) in statusSteps" :key="step" :class="{ on: i <= statusSteps.indexOf(order.status) }"></span>
              </span>
              <div class="small text-muted-hw mt-1">Ordered {{ timeAgo(order.createdAt) }}</div>
            </td>

            <td class="action-cell">
              <button v-if="nextStatus(order)" type="button" class="btn btn-sm btn-step" :disabled="savingId === order._id"
                      data-testid="orders-advance" @click="advance(order)">
                <span v-if="savingId === order._id" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                <i v-else class="bi bi-arrow-right-circle me-1" aria-hidden="true"></i>Mark as {{ (statusLabels[nextStatus(order)] || '').toLowerCase() }}
              </button>
              <span v-else class="done-note"><i class="bi bi-check2-all me-1" aria-hidden="true"></i>Complete</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
/* ---------- Colours that change in dark mode (same idea as main.css and the volunteer badge pages) ---------- */
.awards-page {
  --tint: rgb(20 33 61 / 0.08); /* soft fill behind pills, count bubbles and hovered rows */
  --line: rgb(20 33 61 / 0.1); /* thin lines between rows */
  --amber: #8a5a00; /* in production */
  --blue: #1d5fbf; /* shipped */
  --green: var(--hw-success); /* delivered */
}
[data-bs-theme='dark'] .awards-page {
  --tint: rgb(255 255 255 / 0.07);
  --line: rgb(255 255 255 / 0.08);
  --amber: #f2b84b; /* brighter versions: the light-mode ones are too dark to read on navy */
  --blue: #7fb2ff;
  --green: #4cc38a;
}

/* ---------- Card + heading ---------- */
.orders-card {
  padding: 1.25rem;
}
@media (min-width: 992px) {
  .orders-card {
    padding: 1.5rem;
  }
}
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
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
  color: var(--hw-red);
  font-size: 1.15rem;
}
[data-bs-theme='dark'] .head-icon {
  color: var(--hw-landing-accent); /* the brighter red, readable on navy */
}
.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.15rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.section-count {
  display: inline-grid;
  place-items: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: var(--tint);
  font-size: 0.8rem;
  font-weight: 700;
}
.min-w-0 {
  min-width: 0; /* lets long names shrink and truncate inside flex rows */
}

/* Quiet secondary button (Refresh): visible, but doesn't compete with the row buttons */
.btn-quiet {
  --bs-btn-color: var(--hw-text);
  --bs-btn-border-color: var(--bs-border-color);
  --bs-btn-hover-color: var(--hw-text);
  --bs-btn-hover-bg: var(--tint);
  --bs-btn-hover-border-color: var(--bs-border-color);
  --bs-btn-active-bg: var(--tint);
  --bs-btn-disabled-color: var(--hw-muted);
  --bs-btn-disabled-border-color: var(--bs-border-color);
}

/* ---------- Empty state ---------- */
.empty-state {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border: 1.5px dashed var(--bs-border-color);
  border-radius: var(--hw-radius);
}
.empty-state > i {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--hw-muted);
}

/* ---------- Table ---------- */
.orders-table {
  width: 100%;
  border-collapse: collapse;
}
.orders-table th {
  padding: 0 0.75rem 0.6rem;
  border-bottom: 1px solid var(--bs-border-color);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hw-muted);
  text-align: left;
  white-space: nowrap;
}
.orders-table td {
  padding: 0.85rem 0.75rem;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
  max-width: 220px; /* long emails / addresses truncate instead of stretching the table */
}
.orders-table tbody tr:last-child td {
  border-bottom: 0;
}
.orders-table tbody tr {
  transition: background-color 0.15s;
}
.orders-table tbody tr:hover {
  background: var(--tint);
}
.orders-table th:first-child,
.orders-table td:first-child {
  padding-left: 0.25rem;
}
.action-cell {
  text-align: right;
  white-space: nowrap;
}

/* Badge colours, shown as two overlapping dots (same as the volunteer's "My orders" card) */
.snapshot-dots {
  display: inline-flex;
  flex-shrink: 0;
}
.snapshot-dots span {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--hw-surface);
  box-shadow: 0 0 0 1px var(--bs-border-color);
}
.snapshot-dots span + span {
  margin-left: -7px;
}

/* ---------- Status: icon + words + colour (colour never carries the meaning alone) ---------- */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: var(--tint);
  color: var(--hw-heading);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}
.status-pill.is-in_production {
  color: var(--amber);
}
.status-pill.is-shipped {
  color: var(--blue);
}
.status-pill.is-delivered {
  color: var(--green);
}
.mini-steps {
  display: flex;
  gap: 3px;
  width: 84px;
  margin-top: 0.45rem;
}
.mini-steps span {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--tint);
}
.mini-steps span.on {
  background: var(--hw-muted);
}
.is-delivered + .mini-steps span.on {
  background: var(--green);
}

/* ---------- Row button: one clear next step ---------- */
.btn-step {
  --bs-btn-color: var(--hw-heading);
  --bs-btn-border-color: var(--bs-border-color);
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: var(--hw-red);
  --bs-btn-hover-border-color: var(--hw-red);
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: var(--hw-red-dark);
  --bs-btn-active-border-color: var(--hw-red-dark);
  --bs-btn-disabled-color: var(--hw-muted);
  --bs-btn-disabled-border-color: var(--bs-border-color);
  font-weight: 600;
}
.btn-step:focus-visible {
  outline: 2px solid var(--hw-heading);
  outline-offset: 2px;
}
.done-note {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--green);
}

/* ---------- Phones: each row becomes a small card, with the column name written beside each value ---------- */
@media (max-width: 767.98px) {
  .orders-table thead {
    position: absolute; /* hidden, but screen readers still get the column names */
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .orders-table,
  .orders-table tbody,
  .orders-table tr,
  .orders-table td {
    display: block;
    width: 100%;
    max-width: none;
  }
  .orders-table tbody tr {
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--bs-border-color);
    border-radius: var(--hw-radius);
  }
  .orders-table tbody tr + tr {
    margin-top: 0.75rem;
  }
  .orders-table tbody tr:hover {
    background: transparent;
  }
  .orders-table td,
  .orders-table th:first-child,
  .orders-table td:first-child {
    padding: 0.4rem 0;
    border-bottom: 0;
  }
  .orders-table td[data-label] {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    column-gap: 0.75rem;
    row-gap: 0.15rem; /* lines inside one cell stay close together (proximity) */
    align-items: start;
  }
  /* everything in a cell sits in the right-hand column, under each other; the label sits on the left */
  .orders-table td[data-label] > * {
    grid-column: 2;
    justify-self: start;
    max-width: 100%;
  }
  .orders-table td[data-label] .text-truncate {
    white-space: normal; /* phones: wrap long names and emails instead of cutting them off */
    overflow-wrap: anywhere;
  }
  .orders-table td[data-label]::before {
    content: attr(data-label);
    padding-top: 0.15rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--hw-muted);
  }
  .action-cell {
    margin-top: 0.4rem;
    padding-top: 0.75rem !important;
    border-top: 1px solid var(--line) !important;
    text-align: left;
  }
  .action-cell .btn-step {
    width: 100%; /* big tap target on phones */
    padding-block: 0.5rem;
  }
}
</style>