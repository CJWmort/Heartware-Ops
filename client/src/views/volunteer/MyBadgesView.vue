<script setup>
// Feature 5 – Badge wall — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { ref } from 'vue'
// TODO(Hanafi): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Grid of earned badges (getMyBadges); locked/greyed ones you have not earned (listBadges)',
  'Click a badge → modal with description, event and thank-you message',
  'Button to the Badge Studio; order status tracker (getMyOrders): Placed → In production → Shipped → Delivered',
  'data-testids: badge-wall, badge-<code>, badge-modal, order-status',
]

// TEMP: shaped like GET /api/badges and GET /api/badges/me.
// Replace with listBadges() / getMyBadges() and DELETE before the PR.
const badges = ref([
  { code: 'FULL_ROUTE', name: 'Full Route Completed', description: 'Checked in at all 6 checkpoints.', icon: 'bi-flag-fill' },
  { code: 'ON_TIME', name: 'On-Time Every Checkpoint', description: 'No overdue alerts for your group.', icon: 'bi-stopwatch-fill' },
  { code: 'STAND_IN_HERO', name: 'Stand-in Hero', description: 'Stepped in to fill an open slot.', icon: 'bi-lightning-charge-fill' },
  { code: 'HEART_OF_GOLD', name: 'Heart of Gold', description: 'Special thanks from the Heartware team.', icon: 'bi-heart-fill' },
  { code: 'CALM_UNDER_PRESSURE', name: 'Calm Under Pressure', description: 'Handled an incident with care.', icon: 'bi-shield-check' },
])

const myAwards = ref([
  {
    badge: { code: 'HEART_OF_GOLD', name: 'Heart of Gold', description: 'Special thanks from the Heartware team.', icon: 'bi-heart-fill' },
    event: { name: 'NE Show 1' },
    message: 'Thank you for staying calm today!',
  },
  {
    badge: { code: 'STAND_IN_HERO', name: 'Stand-in Hero', description: 'Stepped in to fill an open slot.', icon: 'bi-lightning-charge-fill' },
    event: { name: 'NE Show 1' },
  },
])

function awardFor(code) {
  return myAwards.value.find(a => a.badge.code === code)
}

const selected = ref(null)


</script>

<template>
  <section>
    <PageHeader title="My badges" icon="bi-award" />
    <div class="row g-3" data-testid="badge-wall">
      <div v-for="b in badges" :key="b.code" :data-testid="'badge-' + b.code" class="col-6 col-md-4 col-lg-3" @click="selected = b">
        <div class="card card-body text-center" :class="awardFor(b.code) ? '' : 'opacity-50'">
          <i :class="'bi ' + b.icon + ' fs-1'"></i>
          <div class="mt-2">{{ b.name }}</div>
        </div>
      </div>
    </div>

    <div v-if="selected" class="modal d-block" tabindex="-1" data-testid="badge-modal">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i :class="'bi ' + selected.icon + ' me-2'"></i>{{selected.name}}
            </h5>
            <button type="button" class="btn-close" aria-label="Close" @click="selected = null"></button>
          </div>
          <div class="modal-body">
            {{selected.description}}
            <div v-if="awardFor(selected.code)">
              Earned at {{awardFor(selected.code).event.name}}
              <div v-if="awardFor(selected.code).message" class="fst-italic mt-2">{{awardFor(selected.code).message}}</div>
            </div>
            <div v-else>Not earned yet</div>
          
          </div>
        </div>
      </div>
    </div>
    <div v-if="selected" class="modal-backdrop show"></div>
  </section>
</template>
