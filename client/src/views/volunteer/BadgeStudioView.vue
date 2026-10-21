<script setup>
// Feature 5 – Badge Studio — owner: Hanafi
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import { ref, computed } from 'vue'
const colour = ref('#d6001c')
const shape = ref('circle')
const ribbonText = ref('')
const locked = ref(false)
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

const errorMessage = ref('')
const successMessage = ref('')

const orders = ref([])
const loading = ref(true)
const showOrderForm = ref(false)
const addressLine1 = ref('')
const unit = ref('')
const postalCode = ref('')
const submitting = ref(false)
const statusLabels = {
  placed: 'Placed', in_production: 'In production', shipped: 'Shipped', delivered: 'Delivered'
}
const shapes = [
  { key: 'circle',  label: 'Circle' },
  { key: 'hexagon', label: 'Hexagon' },
  { key: 'star',    label: 'Star' },
  { key: 'shield',  label: 'Shield' },
]
const statusSteps = ['placed', 'in_production', 'shipped', 'delivered']
const postalCodeOk = computed(() => postalCode.value.match(/^\d{6}$/) ? true : false)
const hasActiveOrder = computed (() => orders.value.some(order => order.status === 'placed' || order.status === 'in_production'  || order.status === 'shipped' ))

function stepIndex(status) {
  return statusSteps.indexOf(status)
}

function designFromPage() {
  return {
    shape: shape.value,
    primaryColor: colour.value,  
    secondaryColor: secondaryColour.value, 
    emblem: emblem.value,
    ribbonText: ribbonText.value, 
    }
}

async function save() {
  errorMessage.value = ''      
  successMessage.value = ''
  try {
    await saveMyDesign(designFromPage())
    successMessage.value = 'Design saved!'
  } catch (error) {
    errorMessage.value = error.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(error)
  }
}

async function placeMyOrder() {
  errorMessage.value = ''      
  successMessage.value = ''
  submitting.value = true
  try {
    await saveMyDesign(designFromPage())

    const newOrder = await placeOrder({
      line1:      addressLine1.value,
      unit:       unit.value,
      postalCode: postalCode.value,
    })

    orders.value.unshift(newOrder)

    locked.value = true
    showOrderForm.value = false
    successMessage.value = 'Order placed!'
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    errorMessage.value = error.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(error)
  } finally {
    submitting.value = false 
  }
}

onMounted(async () => {
  try {
    const [saved, order] = await Promise.all([getMyDesign(), getMyOrders()])
    if (saved) {                          
      colour.value = saved.primaryColor   
      shape.value = saved.shape
      ribbonText.value = saved.ribbonText
      secondaryColour.value = saved.secondaryColor
      emblem.value = saved.emblem
      locked.value = saved.locked
    }                         
    orders.value = order   
  } catch (error) {
    errorMessage.value = error.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(error)
  } finally {
    loading.value = false
  }
  
})
</script>

<template>
  <section class="studio" :class="{ 'is-locked': locked }">
    <PageHeader title="Badge Studio"
                :subtitle="locked ? 'Your badge is locked in. Track your order here.' : 'Design your badge, then lock it in to order it.'"
                icon="bi-palette">
      <template #actions>
        <RouterLink to="/volunteer/badges" class="btn btn-outline-secondary" data-testid="studio-back"><i class="bi bi-arrow-left me-1"></i>Back</RouterLink>
      </template>
    </PageHeader>
 
    <div v-if="errorMessage" class="alert alert-danger d-flex align-items-start gap-2" role="alert" data-testid="studio-error">
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ errorMessage }}</div>
    </div>
 
    <div v-if="loading" class="text-center text-muted-hw py-5">
      <div class="spinner-border" aria-hidden="true"></div>
      <div class="mt-2">Loading your design...</div>
    </div>
 
    <div v-else class="d-flex flex-column gap-4">
      <div class="row g-4" :class="{ 'align-items-start': !locked }">
        <!-- preview -->
        <div class="col-12 col-md-6 col-lg-5 preview-col">
          <div class="card-hw preview-card">
            <div class="preview-stage">
              <svg viewBox="0 0 200 200" class="preview-svg" role="img" :aria-label="`Preview: ${shape} badge with a ${emblem} emblem`" data-testid="studio-preview">
                <polygon data-part="primary" v-if="shape === 'hexagon'" points="180,100 140,169.3 60,169.3 20,100 60,30.7 140,30.7" :fill="colour" />
                <polygon data-part="primary" v-else-if="shape === 'star'" points="100,5 128.2,61.2 190.4,70.6 145.7,114.8 155.8,176.9 100,148 44.2,176.9 54.3,114.8 9.6,70.6 71.8,61.2" :fill="colour" />
                <path data-part="primary" v-else-if="shape === 'shield'" d="M 25 22 L 175 22 L 175 95 Q 175 155 100 182 Q 25 155 25 95 Z" :fill="colour" />
                <circle data-part="primary" v-else cx="100" cy="100" r="80" :fill="colour" />
                <rect data-part="secondary" x="0" y="125" width="200" height="30" rx="4" :fill="secondaryColour" />
                <text x="100" y="145" text-anchor="middle" font-weight="600" :font-size="ribbonFontSize" :fill="textColour">{{ ribbonText }}</text>
                <text x="100" y="112" text-anchor="middle" font-size="50" font-family="bootstrap-icons" :fill="emblemColour">{{ selectedEmblem.glyph }}</text>
              </svg>
            </div>
            <div class="preview-caption">
              <template v-if="locked"><i class="bi bi-lock-fill me-1" aria-hidden="true"></i>Your ordered design</template>
              <template v-else><i class="bi bi-eye me-1" aria-hidden="true"></i>Live preview</template>
            </div>
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
              <text x="100" y="145" text-anchor="middle" font-weight="600" :font-size="ribbonFontSize" :fill="textColour">{{ ribbonText }}</text>
              <text x="100" y="112" text-anchor="middle" font-size="50" font-family="bootstrap-icons" :fill="emblemColour">{{ selectedEmblem.glyph }}</text>
            </svg>
          </div>
          <div class="preview-caption">
            <template v-if="locked"><i class="bi bi-lock-fill me-1" aria-hidden="true"></i>Your ordered design</template>
            <template v-else><i class="bi bi-eye me-1" aria-hidden="true"></i>Live preview</template>
          </div>
        </div>
 
        <div class="col-12 col-md-6 col-lg-7">
          <!-- After ordering -->
          <div v-if="locked" class="card-hw summary-card p-3 p-lg-4 h-100" data-testid="studio-summary">
            <div class="locked-note mb-2" role="status" data-testid="studio-locked">
              <i class="bi bi-lock-fill" aria-hidden="true"></i>
              <div>
                <div class="fw-semibold">Your badge is locked in</div>
                <div class="small">You've ordered this design, so it can't be changed.</div>
              </div>
            </div>
            <dl class="spec-list mb-0">
              <dt>Shape</dt>
              <dd class="text-capitalize">{{ shape }}</dd>
              <dt>Emblem</dt>
              <dd><i :class="['bi', selectedEmblem.icon, 'spec-icon']" aria-hidden="true"></i>{{ selectedEmblem.label }}</dd>
              <dt>Badge colour</dt>
              <dd><span class="swatch" :style="{ background: colour }" aria-hidden="true"></span><span class="font-monospace text-uppercase small fw-normal text-muted-hw">{{ colour }}</span></dd>
              <dt>Ribbon colour</dt>
              <dd><span class="swatch" :style="{ background: secondaryColour }" aria-hidden="true"></span><span class="font-monospace text-uppercase small fw-normal text-muted-hw">{{ secondaryColour }}</span></dd>
              <dt>Ribbon text</dt>
              <dd>
                <template v-if="ribbonText">"{{ ribbonText }}"</template>
                <span v-else class="fw-normal text-muted-hw">None</span>
              </dd>
            </dl>
          </div>
 
          <!-- Before ordering -->
          <template v-else>
            <div class="card-hw p-3 p-lg-4">
              <fieldset>
                <div class="studio-group">
                  <div id="shape-label" class="group-label">Shape</div>
                  <div class="tile-grid tile-grid-4" role="radiogroup" aria-labelledby="shape-label">
                    <template v-for="s in shapes" :key="s.key">
                      <input :id="'shape-' + s.key" class="btn-check" type="radio" name="shape"
                             :value="s.key" v-model="shape" :data-testid="'studio-shape-' + s.key" />
                      <label class="option-tile" :for="'shape-' + s.key">
                        <svg viewBox="0 0 200 200" class="tile-shape" aria-hidden="true">
                          <polygon v-if="s.key === 'hexagon'" points="180,100 140,169.3 60,169.3 20,100 60,30.7 140,30.7" :fill="colour" />
                          <polygon v-else-if="s.key === 'star'" points="100,5 128.2,61.2 190.4,70.6 145.7,114.8 155.8,176.9 100,148 44.2,176.9 54.3,114.8 9.6,70.6 71.8,61.2" :fill="colour" />
                          <path v-else-if="s.key === 'shield'" d="M 25 22 L 175 22 L 175 95 Q 175 155 100 182 Q 25 155 25 95 Z" :fill="colour" />
                          <circle v-else cx="100" cy="100" r="80" :fill="colour" />
                        </svg>
                        <span>{{ s.label }}</span>
                      </label>
                    </template>
                  </div>
                </div>
 
                <!-- Colours -->
                <div class="studio-group">
                  <div class="group-label">Colours</div>
                  <div class="row g-2">
                    <div class="col-6">
                      <label for="primary-colour" class="colour-field">
                        <input id="primary-colour" class="form-control form-control-color" type="color" v-model="colour" data-testid="studio-primary-color" />
                        <span>
                          <span class="d-block small fw-semibold">Badge</span>
                          <span class="d-block small text-muted-hw font-monospace text-uppercase">{{ colour }}</span>
                        </span>
                      </label>
                    </div>
                    <div class="col-6">
                      <label for="ribbon-colour" class="colour-field">
                        <input id="ribbon-colour" class="form-control form-control-color" type="color" v-model="secondaryColour" data-testid="studio-secondary-color" />
                        <span>
                          <span class="d-block small fw-semibold">Ribbon</span>
                          <span class="d-block small text-muted-hw font-monospace text-uppercase">{{ secondaryColour }}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
 
                <!-- Emblems -->
                <div class="studio-group">
                  <div id="emblem-label" class="group-label">Emblem</div>
                  <div class="tile-grid tile-grid-6" role="radiogroup" aria-labelledby="emblem-label">
                    <template v-for="e in emblems" :key="e.key">
                      <input :id="'emblem-' + e.key" class="btn-check" type="radio" name="emblem"
                             :value="e.key" v-model="emblem" :data-testid="'studio-emblem-' + e.key" />
                      <label class="option-tile" :for="'emblem-' + e.key">
                        <i :class="['bi', e.icon, 'tile-icon']" aria-hidden="true"></i>
                        <span>{{ e.label }}</span>
                      </label>
                    </template>
                  </div>
                </div>
 
                <!-- Ribbon text -->
                <div class="studio-group">
                  <div class="d-flex justify-content-between align-items-baseline">
                    <label for="ribbon-text" class="group-label">Ribbon text</label>
                    <span class="small text-muted-hw" data-testid="studio-ribbon-count">{{ ribbonText.length }}/20</span>
                  </div>
                  <input id="ribbon-text" class="form-control" type="text" v-model="ribbonText"
                         placeholder="Your name or a short message" data-testid="studio-ribbon" maxlength="20" />
                </div>
              </fieldset>
 
              <!-- Actions -->
              <div class="action-bar">
                <button v-if="!showOrderForm" type="button" class="btn btn-brand px-4" data-testid="studio-lock" @click="showOrderForm = true">
                  <i class="bi bi-bag-check me-2" aria-hidden="true"></i>Lock in and order
                </button>
                <button type="button" class="btn btn-outline-secondary" data-testid="studio-save" @click="save">
                  <i class="bi bi-cloud-arrow-up me-2" aria-hidden="true"></i>Save
                </button>
                <span v-if="successMessage" class="save-note" role="status">
                  <i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>{{ successMessage }}
                </span>
              </div>
            </div>
 
            <!-- Order form -->
            <div v-if="showOrderForm" class="card-hw p-3 p-lg-4 mt-3" data-testid="order-form">
              <h2 class="h6 mb-1"><i class="bi bi-truck me-2" aria-hidden="true"></i>Where should we send your badge?</h2>
              <p class="small text-muted-hw mb-3">
                You're ordering the badge in the preview<span class="d-md-none"> above</span><span class="d-none d-md-inline"> on the left</span>.
                <strong class="text-body">Once you place the order, your design is locked.</strong>
              </p>
 
              <div class="mb-3">
                <label for="order-line1" class="form-label small fw-semibold">Address</label>
                <input id="order-line1" class="form-control" type="text" v-model="addressLine1"
                       placeholder="Blk 201 Tampines St 21" autocomplete="address-line1" data-testid="order-address" />
              </div>
              <div class="row g-3 mb-4">
                <div class="col-6">
                  <label for="order-unit" class="form-label small fw-semibold">Unit <span class="fw-normal text-muted-hw">(optional)</span></label>
                  <input id="order-unit" class="form-control" type="text" v-model="unit"
                         placeholder="#05-123" autocomplete="address-line2" data-testid="order-unit" />
                </div>
                <div class="col-6">
                  <label for="order-postal" class="form-label small fw-semibold">Postal code</label>
                  <input id="order-postal" class="form-control" :class="{ 'is-invalid': postalCode && !postalCodeOk }"
                         type="text" v-model="postalCode" inputmode="numeric" maxlength="6" placeholder="520201"
                         autocomplete="postal-code" aria-describedby="order-postal-help" data-testid="order-postal" />
                  <div id="order-postal-help" class="invalid-feedback">Postal codes have 6 digits.</div>
                </div>
              </div>
 
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-brand px-4" :disabled="submitting || !postalCodeOk || !addressLine1.trim()"
                        @click="placeMyOrder" data-testid="order-submit">
                  <span v-if="submitting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  {{ submitting ? 'Placing order...' : 'Place order' }}
                </button>
                <button type="button" class="btn btn-outline-secondary" :disabled="submitting" @click="showOrderForm = false" data-testid="order-cancel">Cancel</button>
              </div>
            </div>
          </template>
        </div>
      </div>
 
      <!-- Orders -->
      <div class="card-hw p-3 p-lg-4" :class="{ 'order-first': hasActiveOrder }" data-testid="order-list">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 class="h6 mb-0"><i class="bi bi-box-seam me-2" aria-hidden="true"></i>My orders</h2>
          <span v-if="locked && successMessage" class="save-note" role="status">
            <i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>{{ successMessage }}
          </span>
        </div>
 
        <div v-if="orders.length === 0" class="empty-orders">
          <i class="bi bi-bag" aria-hidden="true"></i>
          <div>
            <div class="fw-semibold">You haven't ordered a badge yet.</div>
            <div class="small text-muted-hw">When your design is ready, choose Lock in and order.</div>
          </div>
        </div>
 
        <ul v-else class="list-unstyled mb-0">
          <li v-for="order in orders" :key="order._id" class="order-item">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div class="d-flex align-items-center gap-3 min-w-0">
                <span class="snapshot-dots" aria-hidden="true">
                  <span :style="{ background: order.designSnapshot?.primaryColor }"></span>
                  <span :style="{ background: order.designSnapshot?.secondaryColor }"></span>
                </span>
                <div class="min-w-0">
                  <div class="fw-semibold text-capitalize">{{ order.designSnapshot?.shape }} · {{ order.designSnapshot?.emblem }}</div>
                  <div class="small text-muted-hw text-truncate">Ordered {{ timeAgo(order.createdAt) }} · {{ order.address.line1 }}</div>
                </div>
              </div>
              <span class="status-pill" data-testid="order-status">{{ statusLabels[order.status] || order.status }}</span>
            </div>
 
            <ol class="tracker" :aria-label="'Order progress: ' + (statusLabels[order.status] || order.status)">
              <li v-for="(step, i) in statusSteps" :key="step" :style="{ '--i': i }"
                :class="{ done: i < stepIndex(order.status) || order.status === 'delivered' , current: i === stepIndex(order.status) && order.status !== 'delivered' }">
                <span class="dot" aria-hidden="true"></span>
                <span class="step-label">{{ statusLabels[step] }}</span>
              </li>
            </ol>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
 
<style scoped>
.studio {
  --studio-navbar-h: 56px; 
}

/* ---------- Preview ---------- */
.preview-card {
  overflow: hidden;
}
.preview-stage {
  display: grid;
  place-items: center;
  padding: 1.75rem;
  background: radial-gradient(circle at 50% 42%, #ffffff 0%, var(--hw-bg) 72%);
}
.preview-svg {
  width: 100%;
  max-width: 340px;
  height: auto;
  filter: drop-shadow(0 10px 18px rgb(20 33 61 / 0.18));
}
.preview-caption {
  padding: 0.6rem 1rem;
  border-top: 1px solid var(--bs-border-color);
  font-size: 0.8rem;
  color: var(--hw-muted);
  text-align: center;
}
 
/* While designing, the preview stays in view as you scroll through the options.
   Once locked there is nothing to watch change, so it scrolls like normal content. */
@media (min-width: 768px) {
  .studio:not(.is-locked) .preview-card {
    position: sticky;
    top: calc(var(--studio-navbar-h) + 1rem);
  }
}
@media (max-width: 767.98px) {
  .studio:not(.is-locked) .preview-col {
    position: sticky;
    top: var(--studio-navbar-h);
    z-index: 5;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    background: var(--hw-bg);
  }
  .studio:not(.is-locked) .preview-stage {
    padding: 0.75rem;
  }
  .studio:not(.is-locked) .preview-svg {
    max-height: 22vh;
  }
  .studio:not(.is-locked) .preview-caption {
    display: none;
  }
}
 
/* Locked, side by side: preview and summary cards share one height (a tidy pair) */
.studio.is-locked .preview-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.studio.is-locked .preview-stage {
  flex: 1;
}
.studio.is-locked .preview-svg {
  max-width: 240px; /* smaller once locked: the summary and tracker matter more now */
}
 
/* main.css gives .btn-brand no disabled colours, so a disabled one turned into a grey
   outline that looked like Cancel (similarity). Keep it red, just faded. */
.studio .btn-brand {
  --bs-btn-disabled-bg: var(--hw-red);
  --bs-btn-disabled-border-color: var(--hw-red);
  --bs-btn-disabled-color: #fff;
}
 
/* ---------- Option groups ---------- */
.studio-group + .studio-group {
  margin-top: 1.5rem; /* bigger gap BETWEEN groups than inside them (proximity) */
}
.group-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--hw-muted);
}
 
/* Tiles: the real radio stays in the page (keyboard + tests), the label is what you see */
.tile-grid {
  display: grid;
  gap: 0.5rem;
}
.tile-grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.tile-grid-6 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (min-width: 992px) {
  .tile-grid-6 {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
.option-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 80px;
  padding: 0.6rem 0.25rem;
  border: 1.5px solid var(--bs-border-color);
  border-radius: 0.6rem;
  background: var(--hw-surface);
  font-size: 0.8rem;
  text-align: center;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
.option-tile:hover {
  border-color: #c3c8d2;
  background: #fafbfd;
}
.tile-shape {
  width: 36px;
  height: 36px;
}
.tile-icon {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--hw-navy);
}
/* Selected: border + tint + bold label + tick (not colour alone) */
.btn-check:checked + .option-tile {
  border-color: var(--hw-red);
  background: rgb(214 0 28 / 0.05);
  box-shadow: inset 0 0 0 1px var(--hw-red);
  font-weight: 600;
}
.btn-check:checked + .option-tile::after {
  content: '\f26a'; /* bi-check-circle-fill */
  font-family: 'bootstrap-icons';
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 0.85rem;
  line-height: 1;
  color: var(--hw-red);
}
.btn-check:focus-visible + .option-tile {
  outline: 2px solid var(--hw-navy);
  outline-offset: 2px;
}
 
/* Colour fields */
.colour-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1.5px solid var(--bs-border-color);
  border-radius: 0.6rem;
  cursor: pointer;
}
.colour-field .form-control-color {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0.2rem;
  border-radius: 0.5rem;
  flex-shrink: 0;
}
 
/* ---------- Actions ---------- */
.action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--bs-border-color);
}
.save-note {
  font-size: 0.875rem;
  color: var(--hw-success);
}
@media (max-width: 575.98px) {
  .action-bar .btn {
    flex: 1 1 auto; /* bigger targets on phones */
  }
}
 
/* ---------- Locked summary ---------- */
.locked-note {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.6rem;
  background: rgb(20 33 61 / 0.06);
  color: var(--hw-navy);
}
.locked-note > i {
  font-size: 1.25rem;
  line-height: 1.2;
}
/* Label on the left, value on the right, one thin line between rows */
.spec-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 1.5rem;
}
.spec-list dt,
.spec-list dd {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  margin: 0;
  border-bottom: 1px solid var(--bs-border-color);
}
.spec-list dt:last-of-type,
.spec-list dd:last-of-type {
  border-bottom: 0;
}
.spec-list dt {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--hw-muted);
}
.spec-list dd {
  gap: 0.6rem;
  font-weight: 600;
  min-width: 0;
}
.spec-icon {
  font-size: 1.1rem;
  line-height: 1;
  color: var(--hw-navy);
}
/* Full-strength colour (the ordered colour, not a faded one); the inner edge keeps white visible */
.swatch {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 0.4rem;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
}
 
/* ---------- Orders ---------- */
.empty-orders {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border: 1.5px dashed var(--bs-border-color);
  border-radius: 0.6rem;
}
.empty-orders > i {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--hw-muted);
}
.order-item + .order-item {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--bs-border-color);
}
.min-w-0 {
  min-width: 0;
}
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
.status-pill {
  flex-shrink: 0;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: rgb(20 33 61 / 0.08);
  color: var(--hw-navy);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
 
/* Tracker: four steps on one line (continuity); position + text carry the meaning */
.tracker {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}
.tracker li {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  text-align: center;
  color: var(--hw-muted);
}
/* The line into each step: a grey track (::before) with a green fill on top (::after) */
.tracker li::before,
.tracker li::after {
  content: '';
  position: absolute;
  top: 7px;
  right: 50%;
  width: 100%;
  height: 2px;
}
.tracker li::before {
  background: var(--bs-border-color);
}
.tracker li::after {
  background: var(--hw-success);
  transform: scaleX(0);
  transform-origin: left center;
}
.tracker li:first-child::before,
.tracker li:first-child::after {
  display: none;
}
.tracker li.done::after,
.tracker li.current::after {
  transform: scaleX(1);
}
.tracker .dot {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #c3c8d2;
  background: var(--hw-surface);
}
.tracker li.done,
.tracker li.current {
  color: var(--hw-text);
}
.tracker li.done .dot {
  border-color: var(--hw-success);
  background: var(--hw-success);
}
.tracker li.done .dot::after {
  content: '\f26e'; /* bi-check */
  font-family: 'bootstrap-icons';
  font-size: 0.75rem;
  line-height: 1;
  color: #fff;
}
.tracker li.current .dot {
  border-color: var(--hw-navy);
  background: var(--hw-navy);
  box-shadow: 0 0 0 4px rgb(20 33 61 / 0.15); /* the "you are here" ring when motion is off */
}
.tracker li.current .step-label {
  font-weight: 600;
}
 
/* Motion, only for people who haven't asked their device to reduce it.
   --i is the step's position (0 to 3), set in the template, so each step waits its turn. */
@media (prefers-reduced-motion: no-preference) {
  /* Once, on page load: each line fills left to right, then its dot lights up */
  .tracker li.done::after,
  .tracker li.current::after {
    animation: tracker-fill 0.3s ease-out both;
    animation-delay: calc((var(--i) - 1) * 0.3s);
  }
  .tracker li.done .dot {
    animation: tracker-dot-in 0.3s ease-out both;
    animation-delay: calc(var(--i) * 0.3s);
  }
  /* The current step keeps a soft pulse: "your badge is here right now" */
  .tracker li.current .dot {
    animation:
      tracker-dot-in 0.3s ease-out both,
      tracker-pulse 2s ease-out infinite;
    animation-delay:
      calc(var(--i) * 0.3s),
      calc(var(--i) * 0.3s + 0.3s);
  }
}
@keyframes tracker-fill {
  from {
    transform: scaleX(0);
  }
}
@keyframes tracker-dot-in {
  0% {
    border-color: #c3c8d2;
    background: var(--hw-surface);
  }
  60% {
    transform: scale(1.25);
  }
}
@keyframes tracker-pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(20 33 61 / 0.35);
  }
  70% {
    box-shadow: 0 0 0 10px rgb(20 33 61 / 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(20 33 61 / 0);
  }
}
</style>