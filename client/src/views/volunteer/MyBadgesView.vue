<script setup>
// Feature 5 – Badge wall — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { ref, onMounted } from 'vue'
import { listBadges, getMyBadges } from '@/services/badges'

const badges = ref([])
const myAwards = ref([])
const error = ref('')

onMounted(async () => {         
  try {
    badges.value = await listBadges() 
    myAwards.value = await getMyBadges()  
  } catch (e) {
    error.value = e.friendlyMessage          
  }
})

function awardFor(code) {
  return myAwards.value.find(a => a.badge.code === code)
}

const selected = ref(null)


</script>

<template>
  <RouterLink to="/volunteer/badge-studio" class="btn btn-brand"><i class="bi bi-palette me-1"></i>Design my badge</RouterLink>
  <section>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-else class="row g-3" data-testid="badge-wall">
      <div v-for="b in badges" :key="b.code" :data-testid="'badge-' + b.code" class="col-6 col-md-4 col-lg-3">
        <div class="card card-body text-center badge-tile" :class="awardFor(b.code) ? '' : 'opacity-50'" @click="selected = b">
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
              Earned at {{awardFor(selected.code).event}}
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

<style scoped>
.badge-tile {
  cursor: pointer;      
  transition: transform 0.3s, box-shadow 0.3s;    
}
.badge-tile:hover {
  transform: translateY(-4px);
  box-shadow: var(--hw-shadow);     
}
</style>
