<script setup>
// Feature 5 – Badge Studio — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { ref, computed } from 'vue'
const colour = ref('#d6001c')
const shape = ref('circle')
const ribbonText = ref('')
const secondaryColour = ref('#ffffff')
function contrastColour(hex) {
  const red = parseInt(hex.slice(1,3), 16)
  const green = parseInt(hex.slice(3,5), 16)
  const blue = parseInt(hex.slice(5,7), 16)
  const brightness = 0.299 * red + 0.587 * green + 0.114 * blue  
  return brightness > 128 ? '#000000' : '#ffffff'
}

const textColour = computed(() => contrastColour(secondaryColour.value))
const emblemColour = computed(() => contrastColour(colour.value))

const emblem = ref('heart')
const emblems = [
  { key: 'heart',    label: 'Heart',    icon: 'bi-heart-fill',         glyph: '\uF415' },
  { key: 'star',     label: 'Star',     icon: 'bi-star-fill',          glyph: '\uF586' },
  { key: 'crescent', label: 'Crescent', icon: 'bi-moon-stars-fill',    glyph: '\uF495' },
  { key: 'trophy',   label: 'Trophy',   icon: 'bi-trophy-fill',        glyph: '\uF5E6' },
  { key: 'smile',    label: 'Smile',    icon: 'bi-emoji-smile-fill',   glyph: '\uF324' },
  { key: 'balloon',  label: 'Balloon',  icon: 'bi-balloon-heart-fill', glyph: '\uF707' },
]
const selectedEmblem = computed(() => emblems.find(e => e.key === emblem.value) || emblems[0])

const ribbonFontSize = computed(() => Math.min(16, 180/(ribbonText.value.length)))
</script>

<template>
  <RouterLink to="/volunteer/badges" class="btn btn-outline-secondary"><i class="bi bi-arrow-left me-1"></i>Back</RouterLink>
  <section>
    <div class="row g-4">
      <!-- LEFT: preview -->
      <div class="col-12 col-md-6">
        <div class="card sticky-md-top bg-secondary-subtle" style="top: 1rem">
          <div class="card-body text-center">
            <svg viewBox="0 0 200 200" style="width: 100%; height: auto; max-width: 500px" data-testid="studio-preview">
              <polygon data-part="primary" v-if="shape === 'hexagon'" points="180,100 140,169.3 60,169.3 20,100 60,30.7 140,30.7" :fill="colour" />
              <polygon data-part="primary" v-else-if="shape === 'star'" points="100,5 128.2,61.2 190.4,70.6 145.7,114.8 155.8,176.9 100,148 44.2,176.9 54.3,114.8 9.6,70.6 71.8,61.2" :fill="colour" />
              <path data-part="primary" v-else-if="shape === 'shield'" d="M 25 22 L 175 22 L 175 95 Q 175 155 100 182 Q 25 155 25 95 Z" :fill="colour" />
              <circle data-part="primary" v-else cx="100" cy="100" r="80" :fill="colour" />
              <rect data-part="secondary" x="0" y="125" width="200" height="30" rx="4" :fill="secondaryColour" />
              <text x="100" y="145" text-anchor="middle" :font-size="ribbonFontSize" :fill="textColour">{{ ribbonText }}</text>
              <text x="100" y="112" text-anchor="middle" font-size="50" font-family="bootstrap-icons" :fill="emblemColour">{{ selectedEmblem.glyph }}</text>
            </svg>
          </div>
        </div>
      </div>

      <!-- RIGHT: controls -->
      <div class="col-12 col-md-6">
        <div class="card">
          <div class="card-body">
            <div class="mb-3">
              <div class="form-label">Shape</div>
              <label class="me-3"><input class="form-check-input me-1" type="radio" value="circle" v-model="shape" data-testid="studio-shape-circle" /> Circle</label>
              <label class="me-3"><input class="form-check-input me-1" type="radio" value="hexagon" v-model="shape" data-testid="studio-shape-hexagon" /> Hexagon</label>
              <label class="me-3"><input class="form-check-input me-1" type="radio" value="star" v-model="shape" data-testid="studio-shape-star" /> Star</label>
              <label class="me-3"><input class="form-check-input me-1" type="radio" value="shield" v-model="shape" data-testid="studio-shape-shield" /> Shield</label>
            </div>
            <div class="mb-3">
              <label for="primary-colour" class="form-label">Badge colour</label>
              <input id="primary-colour" class="form-control form-control-color" type="color" v-model="colour" data-testid="studio-primary-color" />
            </div>
            <div class="mb-3">
              <label for="ribbon-colour" class="form-label">Ribbon colour</label>
              <input id="ribbon-colour" class="form-control form-control-color" type="color" v-model="secondaryColour" data-testid="studio-secondary-color" />
            </div>
            <div class="mb-3">
              <div class="form-label">Emblem</div>
              <label v-for="e in emblems" :key="e.key" class="me-3">
                <input type="radio" class="form-check-input me-1" :value="e.key" v-model="emblem" :data-testid="'studio-emblem-' + e.key" /> {{ e.label }}
                <i :class="'bi ' + e.icon"></i>
              </label>
            </div>
            <div class="mb-3">
              <label for="ribbon-text" class="form-label">Ribbon text</label>
              <input id="ribbon-text" class="form-control" type="text" v-model="ribbonText" data-testid="studio-ribbon" maxlength="20" />
              <span class="form-text d-block" data-testid="studio-ribbon-count">{{ ribbonText.length }}/20</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>