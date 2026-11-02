<!-- The volunteer Badge Studio (F6): design your own badge (colour, emblem, ribbon text), save it
     and order it for delivery. -->

<script setup>
// Holds the design choices, saves the design, checks the delivery address against OneMap using the
// postal code, places the order and locks the page, warns about unsaved changes, and updates the
// order status live when HQ moves an order (socket "orders:updated").

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { onBeforeRouteLeave } from 'vue-router'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageLoading from '@/components/common/PageLoading.vue'
import { getMyDesign, getMyOrders, saveMyDesign, placeOrder } from '@/services/badges.js'
import { timeAgo } from '@/utils/time.js'
import { connectSocket } from '@/services/socket'

const colour = ref('#d6001c')
const shape = ref('circle')
const ribbonText = ref('')
const locked = ref(false)
const secondaryColour = ref('#ffffff')
// contrastColour(hex) - picks black or white text that stays readable on a background colour. 1) read
// the red, green and blue parts of "#rrggbb" 2) brightness = 0.299 red + 0.587 green + 0.114 blue (the
// standard "how bright does it look" weights) 3) over 128 means light, so use black; otherwise white.
function contrastColour(hex) {
  const red = parseInt(hex.slice(1, 3), 16)
  const green = parseInt(hex.slice(3, 5), 16)
  const blue = parseInt(hex.slice(5, 7), 16)
  const brightness = 0.299 * red + 0.587 * green + 0.114 * blue
  return brightness > 128 ? '#000000' : '#ffffff'
}

// textColour (computed) - ribbon text colour, chosen to contrast with the ribbon. emblemColour (below)
// does the same for the symbol on the badge colour.
const textColour = computed(() => contrastColour(secondaryColour.value))
// emblemColour (computed) - a readable colour for the emblem drawn on the chosen badge colour.
const emblemColour = computed(() => contrastColour(colour.value))

const emblem = ref('heart')
const emblems = [
  { key: 'heart', label: 'Heart', icon: 'bi-heart-fill', glyph: '\uF415' },
  { key: 'star', label: 'Star', icon: 'bi-star-fill', glyph: '\uF586' },
  { key: 'crescent', label: 'Crescent', icon: 'bi-moon-stars-fill', glyph: '\uF495' },
  { key: 'trophy', label: 'Trophy', icon: 'bi-trophy-fill', glyph: '\uF5E6' },
  { key: 'smile', label: 'Smile', icon: 'bi-emoji-smile-fill', glyph: '\uF324' },
  { key: 'balloon', label: 'Balloon', icon: 'bi-balloon-heart-fill', glyph: '\uF707' },
]
// selectedEmblem (computed) - the emblem object for the chosen key (falls back to Heart).
const selectedEmblem = computed(() => emblems.find((e) => e.key === emblem.value) || emblems[0])
// ribbonFontSize (computed) - shrinks the ribbon text as it gets longer: 180 divided by the length,
// but never above 16. (Empty text gives Infinity, so 16 is used.)
const ribbonFontSize = computed(() => Math.min(16, 180 / ribbonText.value.length))

const errorMessage = ref('')
const successMessage = ref('')

const orders = ref([])
const loading = ref(true)
const showOrderForm = ref(false)
const addressLine1 = ref('')
const unit = ref('')
const postalCode = ref('')
const postalStatus = ref('idle')
let postalTimer = null
const submitting = ref(false)
const statusLabels = {
  placed: 'Placed',
  in_production: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
}
const shapes = [
  { key: 'circle', label: 'Circle' },
  { key: 'hexagon', label: 'Hexagon' },
  { key: 'star', label: 'Star' },
  { key: 'shield', label: 'Shield' },
]
const statusSteps = ['placed', 'in_production', 'shipped', 'delivered']
// unitOk (computed) - true when the unit box has 1 to 20 characters.
const unitOk = computed(() => unit.value.trim().length > 0 && unit.value.trim().length <= 20)
// hasActiveOrder (computed) - true when any order is still on its way (placed, in production or
// shipped); the orders card then moves to the top of the page.
const hasActiveOrder = computed(() =>
  orders.value.some(
    (order) =>
      order.status === 'placed' || order.status === 'in_production' || order.status === 'shipped',
  ),
)

// orderInfoMissing (computed) - true until OneMap has confirmed the postal code, the address is filled
// and a unit is typed; this disables Place order.
const orderInfoMissing = computed(
  () => postalStatus.value !== 'found' || !addressLine1.value || !unitOk.value,
)

// lookupPostal(code) - asks our server (which asks OneMap) for the address of this postal code and
// fills the locked address box. Old answers are ignored if the user has typed something else
// meanwhile; on failure it records the problem for the message under the box.
async function lookupPostal(code) {
  postalStatus.value = 'loading'
  try {
    const { data } = await axios.get('/api/users/postal-lookup', {
      params: { postalCode: code },
      timeout: 15000,
    })
    if (postalCode.value.trim() !== code) return
    addressLine1.value = data.address
    postalStatus.value = 'found'
  } catch (error) {
    if (postalCode.value.trim() !== code) return
    postalStatus.value = error.response?.status === 404 ? 'notfound' : 'error'
  }
}

// retryPostal() - the Try again link: repeats the lookup if the postal code is still 6 digits.
function retryPostal() {
  const code = postalCode.value.trim()
  if (/^\d{6}$/.test(code)) lookupPostal(code)
}

// watch(postalCode) - when the postal code changes, clear the address; if it is 6 digits wait 400 ms
// and then look it up, otherwise go back to idle.
watch(postalCode, (value) => {
  clearTimeout(postalTimer)
  addressLine1.value = ''
  const code = value.trim()
  if (!/^\d{6}$/.test(code)) {
    postalStatus.value = 'idle'
    return
  }
  postalStatus.value = 'loading'
  postalTimer = setTimeout(() => lookupPostal(code), 400)
})

// stepIndex(status) - position of a status in the four steps (0 to 3), or -1 if unknown. Used to
// colour the progress tracker.
function stepIndex(status) {
  return statusSteps.indexOf(status)
}

// designFromPage() - gathers the controls into the object the server expects (shape, primaryColor,
// secondaryColor, emblem, ribbonText).
function designFromPage() {
  return {
    shape: shape.value,
    primaryColor: colour.value,
    secondaryColor: secondaryColour.value,
    emblem: emblem.value,
    ribbonText: ribbonText.value,
  }
}

const savedDesign = ref(null)
// hasUnsavedChanges (computed) - true when the page is not locked and the design on screen differs
// from the last saved design.
const hasUnsavedChanges = computed(
  () =>
    !locked.value &&
    savedDesign.value !== null &&
    JSON.stringify(designFromPage()) !== savedDesign.value,
)

let successTimer = null
// showSuccess(text) - shows a green message and hides it again after 5 seconds.
function showSuccess(text) {
  successMessage.value = text
  clearTimeout(successTimer)
  successTimer = setTimeout(() => (successMessage.value = ''), 5000)
}

// save() - the Save design button: clear messages, send the design to the server, remember it as saved
// so the "Unsaved changes" note disappears and show "Design saved!"; on error show the friendly
// message.
async function save() {
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const design = designFromPage()
    await saveMyDesign(design)
    savedDesign.value = JSON.stringify(design)
    showSuccess('Design saved!')
  } catch (error) {
    errorMessage.value = error.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(error)
  }
}

// placeMyOrder() - the Place order button: clear messages and set submitting, save the design first so
// the order matches it, place the order with the unit and postal code, put the new order at the top of
// the list, lock the page and close the form, show "Order placed!" and scroll to the top; on error
// show the message.
async function placeMyOrder() {
  errorMessage.value = ''
  successMessage.value = ''
  submitting.value = true
  try {
    const design = designFromPage()
    await saveMyDesign(design)
    savedDesign.value = JSON.stringify(design)

    const newOrder = await placeOrder({
      line1: addressLine1.value,
      unit: unit.value.trim(),
      postalCode: postalCode.value,
    })

    orders.value.unshift(newOrder)

    locked.value = true
    showOrderForm.value = false
    showSuccess('Order placed!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    errorMessage.value = error.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(error)
  } finally {
    submitting.value = false
  }
}

// onMounted (load) - fetch my saved design and my orders together. If a design exists copy it into the
// controls (including locked). Always remember the loaded design as the saved one and stop loading, so
// a failed load does not trigger the unsaved warning.
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
    savedDesign.value = JSON.stringify(designFromPage())
    loading.value = false
  }
})

const leaveDialog = ref(null)
let answerLeave = null

// onBeforeRouteLeave - when the volunteer tries to leave the page with unsaved changes, show the
// ConfirmDialog and return a Promise that is settled by their answer (true leaves, false stays).
// Logging out (route name login) is always allowed.
onBeforeRouteLeave((to) => {
  if (!hasUnsavedChanges.value) return true
  if (to.name === 'login') return true
  leaveDialog.value = {
    title: 'Leave without saving?',
    text: "Your badge design has changes you haven't saved. If you leave now, they'll be lost.",
    confirmText: 'Leave',
    cancelText: 'Stay',
    danger: true,
    icon: 'bi-exclamation-circle-fill',
  }
  return new Promise((resolve) => (answerLeave = resolve))
})

// onLeaveAnswer(leave) - the ConfirmDialog answer: close it and resolve the waiting navigation with
// true or false.
function onLeaveAnswer(leave) {
  leaveDialog.value = null
  answerLeave?.(leave)
  answerLeave = null
}

// warnBeforeUnload(event) - the browser's own "Leave site?" prompt for a tab close or refresh with
// unsaved changes. It is added on mount and removed on unmount (below).
function warnBeforeUnload(event) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}
let socket = null
// refreshOrders() - reloads my orders in the background when HQ changes an order (socket
// "orders:updated"), the connection comes back or the tab becomes visible. 1) skip while the tab is
// hidden or an order is being placed 2) fetch my orders 3) on failure only log it.
async function refreshOrders() {
  if (document.visibilityState !== 'visible' || submitting.value) return
  try {
    orders.value = await getMyOrders()
  } catch (error) {
    console.error(error)
  }
}
// onMounted - 1) start warning the user before they close the tab with unsaved changes 2) connect the
// socket 3) refresh my orders on "orders:updated", on reconnect and when the tab becomes visible.
onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  socket = connectSocket()
  socket.on('orders:updated', refreshOrders)
  socket.io.on('reconnect', refreshOrders)
  document.addEventListener('visibilitychange', refreshOrders)
})
// onBeforeUnmount - stop that warning, cancel the success and postal timers, and remove the live
// order listeners.
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  clearTimeout(successTimer)
  clearTimeout(postalTimer)
  socket?.off('orders:updated', refreshOrders)
  socket?.io.off('reconnect', refreshOrders)
  document.removeEventListener('visibilitychange', refreshOrders)
})
</script>

<template>
  <!-- The live badge preview, the design controls, the order form with the locked address box
       and the list of past orders. -->
  <section class="studio" :class="{ 'is-locked': locked, 'is-loading': loading }">
    <div
      v-if="errorMessage"
      class="alert alert-danger d-flex align-items-start gap-2"
      role="alert"
      data-testid="studio-error"
    >
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ errorMessage }}</div>
    </div>

    <Transition name="loading-fade">
      <PageLoading v-if="loading" contained text="Fetching Your Design..." />
    </Transition>

    <div v-if="!loading" class="d-flex flex-column gap-4">
      <div class="row g-4">
        <div class="col-12 col-md-6 col-lg-5 preview-col">
          <div class="card-hw preview-card">
            <div class="preview-stage">
              <svg
                viewBox="0 0 200 200"
                class="preview-svg"
                role="img"
                :aria-label="`Preview: ${shape} badge with a ${emblem} emblem`"
                data-testid="studio-preview"
              >
                <polygon
                  data-part="primary"
                  v-if="shape === 'hexagon'"
                  points="180,100 140,169.3 60,169.3 20,100 60,30.7 140,30.7"
                  :fill="colour"
                />
                <polygon
                  data-part="primary"
                  v-else-if="shape === 'star'"
                  points="100,5 128.2,61.2 190.4,70.6 145.7,114.8 155.8,176.9 100,148 44.2,176.9 54.3,114.8 9.6,70.6 71.8,61.2"
                  :fill="colour"
                />
                <path
                  data-part="primary"
                  v-else-if="shape === 'shield'"
                  d="M 25 22 L 175 22 L 175 95 Q 175 155 100 182 Q 25 155 25 95 Z"
                  :fill="colour"
                />
                <circle data-part="primary" v-else cx="100" cy="100" r="80" :fill="colour" />
                <rect
                  data-part="secondary"
                  x="0"
                  y="125"
                  width="200"
                  height="30"
                  rx="4"
                  :fill="secondaryColour"
                />
                <text
                  x="100"
                  y="145"
                  text-anchor="middle"
                  font-weight="600"
                  :font-size="ribbonFontSize"
                  :fill="textColour"
                >
                  {{ ribbonText }}
                </text>
                <text
                  x="100"
                  y="112"
                  text-anchor="middle"
                  font-size="50"
                  font-family="bootstrap-icons"
                  :fill="emblemColour"
                >
                  {{ selectedEmblem.glyph }}
                </text>
              </svg>
            </div>
            <div class="preview-caption">
              <template v-if="locked"
                ><i class="bi bi-lock-fill me-1" aria-hidden="true"></i>Your ordered
                design</template
              >
              <template v-else
                ><i class="bi bi-eye me-1" aria-hidden="true"></i>Live preview</template
              >
            </div>
          </div>
        </div>

        <div class="col-12 col-md-6 col-lg-7">
          <div
            v-if="locked"
            class="card-hw summary-card p-3 p-lg-4 h-100"
            data-testid="studio-summary"
          >
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
              <dd>
                <i :class="['bi', selectedEmblem.icon, 'spec-icon']" aria-hidden="true"></i
                >{{ selectedEmblem.label }}
              </dd>
              <dt>Badge colour</dt>
              <dd>
                <span class="swatch" :style="{ background: colour }" aria-hidden="true"></span
                ><span class="font-monospace text-uppercase small fw-normal text-muted-hw">{{
                  colour
                }}</span>
              </dd>
              <dt>Ribbon colour</dt>
              <dd>
                <span
                  class="swatch"
                  :style="{ background: secondaryColour }"
                  aria-hidden="true"
                ></span
                ><span class="font-monospace text-uppercase small fw-normal text-muted-hw">{{
                  secondaryColour
                }}</span>
              </dd>
              <dt>Ribbon text</dt>
              <dd>
                <template v-if="ribbonText">"{{ ribbonText }}"</template>
                <span v-else class="fw-normal text-muted-hw">None</span>
              </dd>
            </dl>
          </div>

          <template v-else>
            <div class="card-hw p-3 p-lg-4">
              <fieldset>
                <div class="studio-group">
                  <div id="shape-label" class="group-label">Shape</div>
                  <div
                    class="tile-grid tile-grid-4"
                    role="radiogroup"
                    aria-labelledby="shape-label"
                  >
                    <template v-for="s in shapes" :key="s.key">
                      <input
                        :id="'shape-' + s.key"
                        class="btn-check"
                        type="radio"
                        name="shape"
                        :value="s.key"
                        v-model="shape"
                        :data-testid="'studio-shape-' + s.key"
                      />
                      <label class="option-tile" :for="'shape-' + s.key">
                        <svg viewBox="0 0 200 200" class="tile-shape" aria-hidden="true">
                          <polygon
                            v-if="s.key === 'hexagon'"
                            points="180,100 140,169.3 60,169.3 20,100 60,30.7 140,30.7"
                            :fill="colour"
                          />
                          <polygon
                            v-else-if="s.key === 'star'"
                            points="100,5 128.2,61.2 190.4,70.6 145.7,114.8 155.8,176.9 100,148 44.2,176.9 54.3,114.8 9.6,70.6 71.8,61.2"
                            :fill="colour"
                          />
                          <path
                            v-else-if="s.key === 'shield'"
                            d="M 25 22 L 175 22 L 175 95 Q 175 155 100 182 Q 25 155 25 95 Z"
                            :fill="colour"
                          />
                          <circle v-else cx="100" cy="100" r="80" :fill="colour" />
                        </svg>
                        <span>{{ s.label }}</span>
                      </label>
                    </template>
                  </div>
                </div>

                <div class="studio-group">
                  <div class="group-label">Colours</div>
                  <div class="row g-2">
                    <div class="col-6">
                      <label for="primary-colour" class="colour-field">
                        <input
                          id="primary-colour"
                          class="form-control form-control-color"
                          type="color"
                          v-model="colour"
                          data-testid="studio-primary-color"
                        />
                        <span>
                          <span class="d-block small fw-semibold">Badge</span>
                          <span class="d-block small text-muted-hw font-monospace text-uppercase">{{
                            colour
                          }}</span>
                        </span>
                      </label>
                    </div>
                    <div class="col-6">
                      <label for="ribbon-colour" class="colour-field">
                        <input
                          id="ribbon-colour"
                          class="form-control form-control-color"
                          type="color"
                          v-model="secondaryColour"
                          data-testid="studio-secondary-color"
                        />
                        <span>
                          <span class="d-block small fw-semibold">Ribbon</span>
                          <span class="d-block small text-muted-hw font-monospace text-uppercase">{{
                            secondaryColour
                          }}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div class="studio-group">
                  <div id="emblem-label" class="group-label">Emblem</div>
                  <div
                    class="tile-grid tile-grid-6"
                    role="radiogroup"
                    aria-labelledby="emblem-label"
                  >
                    <template v-for="e in emblems" :key="e.key">
                      <input
                        :id="'emblem-' + e.key"
                        class="btn-check"
                        type="radio"
                        name="emblem"
                        :value="e.key"
                        v-model="emblem"
                        :data-testid="'studio-emblem-' + e.key"
                      />
                      <label class="option-tile" :for="'emblem-' + e.key">
                        <i :class="['bi', e.icon, 'tile-icon']" aria-hidden="true"></i>
                        <span>{{ e.label }}</span>
                      </label>
                    </template>
                  </div>
                </div>

                <div class="studio-group">
                  <div class="d-flex justify-content-between align-items-baseline">
                    <label for="ribbon-text" class="group-label">Ribbon text</label>
                    <span class="small text-muted-hw" data-testid="studio-ribbon-count"
                      >{{ ribbonText.length }}/20</span
                    >
                  </div>
                  <input
                    id="ribbon-text"
                    class="form-control"
                    type="text"
                    v-model="ribbonText"
                    placeholder="Your name or a short message"
                    data-testid="studio-ribbon"
                    maxlength="20"
                  />
                </div>
              </fieldset>

              <div class="action-bar">
                <button
                  v-if="!showOrderForm"
                  type="button"
                  class="btn btn-brand px-4"
                  data-testid="studio-lock"
                  @click="showOrderForm = true"
                >
                  <i class="bi bi-bag-check me-2" aria-hidden="true"></i>Continue to order
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  data-testid="studio-save"
                  @click="save"
                >
                  <i class="bi bi-cloud-arrow-up me-2" aria-hidden="true"></i>Save design
                </button>
                <span
                  v-if="hasUnsavedChanges"
                  class="unsaved-note"
                  role="status"
                  data-testid="studio-unsaved"
                >
                  <i class="bi bi-pencil-fill me-1" aria-hidden="true"></i>Unsaved changes
                </span>
                <span v-else-if="successMessage" class="save-note" role="status">
                  <i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i
                  >{{ successMessage }}
                </span>
              </div>
            </div>

            <div v-if="showOrderForm" class="card-hw p-3 p-lg-4 mt-3" data-testid="order-form">
              <h2 class="h6 mb-1">
                <i class="bi bi-truck me-2" aria-hidden="true"></i>Where should we send your badge?
              </h2>
              <p class="small text-muted-hw mb-3">
                You're ordering the badge in the preview<span class="d-md-none"> above</span
                ><span class="d-none d-md-inline"> on the left</span>.
                <strong class="text-body">Once you place the order, your design is locked.</strong>
              </p>

              <div class="mb-3">
                <label for="order-postal" class="form-label small fw-semibold">Postal code</label>
                <input
                  id="order-postal"
                  class="form-control"
                  :class="{
                    'is-invalid': postalStatus === 'notfound' || postalStatus === 'error',
                    'is-valid': postalStatus === 'found',
                  }"
                  type="text"
                  v-model="postalCode"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="e.g. 520201"
                  autocomplete="postal-code"
                  aria-describedby="order-postal-help"
                  data-testid="order-postal"
                />
                <div id="order-postal-help" class="small mt-1" data-testid="order-postal-status">
                  <span v-if="postalStatus === 'loading'" class="text-muted-hw">
                    <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span
                    >Checking your postal code...
                  </span>
                  <span v-else-if="postalStatus === 'notfound'" class="text-danger"
                    >This postal code doesn't exist in Singapore. Please check it.</span
                  >
                  <span v-else-if="postalStatus === 'error'" class="text-danger">
                    We can't check your postal code right now.
                    <a href="#" @click.prevent="retryPostal" data-testid="order-postal-retry"
                      >Try again</a
                    >
                  </span>
                </div>
              </div>
              <div class="mb-3">
                <label for="order-line1" class="form-label small fw-semibold">Address</label>
                <input
                  id="order-line1"
                  class="form-control"
                  type="text"
                  v-model="addressLine1"
                  readonly
                  placeholder="This will be updated once postal code is verified"
                  autocomplete="address-line1"
                  data-testid="order-address"
                />
              </div>
              <div class="mb-4">
                <label for="order-unit" class="form-label small fw-semibold">Unit number</label>
                <input
                  id="order-unit"
                  class="form-control"
                  type="text"
                  v-model="unit"
                  maxlength="20"
                  placeholder="e.g. #01-234/38A"
                  autocomplete="address-line2"
                  data-testid="order-unit"
                />
              </div>

              <div class="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn btn-brand px-4"
                  :disabled="submitting || orderInfoMissing"
                  @click="placeMyOrder"
                  data-testid="order-submit"
                  aria-describedby="order-submit-hint"
                >
                  <span
                    v-if="submitting"
                    class="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                  ></span>
                  {{ submitting ? 'Placing order...' : 'Place order' }}
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  :disabled="submitting"
                  @click="showOrderForm = false"
                  data-testid="order-cancel"
                >
                  Cancel
                </button>
                <div
                  v-if="!submitting && orderInfoMissing"
                  id="order-submit-hint"
                  class="order-hint w-100"
                  data-testid="order-hint"
                >
                  <i class="bi bi-info-circle me-1" aria-hidden="true"></i>Enter a valid postal code
                  and your unit number to place your order.
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div
        class="card-hw p-3 p-lg-4"
        :class="{ 'order-first': hasActiveOrder }"
        data-testid="order-list"
      >
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
            <div class="small text-muted-hw">
              When your design is ready, choose Continue to order.
            </div>
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
                  <div class="fw-semibold text-capitalize">
                    {{ order.designSnapshot?.shape }} · {{ order.designSnapshot?.emblem }}
                  </div>
                  <div class="small text-muted-hw">
                    Ordered {{ timeAgo(order.createdAt) }} · {{ order.address.line1 }}
                  </div>
                </div>
              </div>
              <span class="status-pill" data-testid="order-status">{{
                statusLabels[order.status] || order.status
              }}</span>
            </div>

            <ol
              class="tracker"
              :aria-label="'Order progress: ' + (statusLabels[order.status] || order.status)"
            >
              <li
                v-for="(step, i) in statusSteps"
                :key="step"
                :style="{ '--i': i }"
                :class="{
                  done: i < stepIndex(order.status) || order.status === 'delivered',
                  current: i === stepIndex(order.status) && order.status !== 'delivered',
                }"
              >
                <span class="dot" aria-hidden="true"></span>
                <span class="step-label">{{ statusLabels[step] }}</span>
              </li>
            </ol>
          </li>
        </ul>
      </div>
    </div>
    <ConfirmDialog :dialog="leaveDialog" @answer="onLeaveAnswer" />
  </section>
</template>

<style scoped>
/* Styles for the badge preview and the design controls. */

.studio {
  position: relative;
  --studio-navbar-h: 56px;
  --tint: rgb(20 33 61 / 0.08);
  --dash: #c3c8d2;
  --hover-bg: #fafbfd;
  --pulse: rgb(20 33 61 / 0.35);
  --glow: #ffffff;
}
[data-bs-theme='dark'] .studio {
  --tint: rgb(255 255 255 / 0.08);
  --dash: #4a5570;
  --hover-bg: rgb(255 255 255 / 0.04);
  --pulse: rgb(230 234 242 / 0.35);
  --glow: #24304d;
}

.preview-card {
  overflow: hidden;
}
.preview-stage {
  display: grid;
  place-items: center;
  padding: 1.75rem;
  background: radial-gradient(circle at 50% 42%, var(--glow) 0%, var(--hw-bg) 72%);
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

.studio.is-loading {
  min-height: calc(100vh - 128px);
}
.studio.is-locked .preview-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.studio.is-locked .preview-stage {
  flex: 1;
}
.studio.is-locked .preview-svg {
  max-width: 240px;
}
.studio .btn-outline-secondary {
  --bs-btn-color: var(--hw-text);
  --bs-btn-border-color: var(--hw-muted);
  --bs-btn-hover-color: var(--hw-text);
  --bs-btn-hover-bg: rgb(255 255 255 / 0.08);
  --bs-btn-hover-border-color: var(--hw-text);
  --bs-btn-active-color: var(--hw-text);
  --bs-btn-active-bg: rgb(255 255 255 / 0.12);
  --bs-btn-active-border-color: var(--hw-text);
  --bs-btn-disabled-color: var(--hw-muted);
  --bs-btn-disabled-border-color: var(--bs-border-color);
}
.studio .btn-brand {
  --bs-btn-disabled-bg: rgb(255 255 255 / 0.06);
  --bs-btn-disabled-border-color: transparent;
  --bs-btn-disabled-color: var(--hw-muted);
  --bs-btn-disabled-opacity: 0.55;
}
.order-hint {
  font-size: 0.85rem;
  color: var(--hw-muted);
}

.studio-group + .studio-group {
  margin-top: 1.5rem;
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
  transition:
    border-color 0.15s,
    background-color 0.15s,
    box-shadow 0.15s;
}
.option-tile:hover {
  border-color: var(--dash);
  background: var(--hover-bg);
}
.tile-shape {
  width: 36px;
  height: 36px;
}
.tile-icon {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--hw-heading);
}
.btn-check:checked + .option-tile {
  border-color: var(--hw-red);
  background: rgb(214 0 28 / 0.05);
  box-shadow: inset 0 0 0 1px var(--hw-red);
  font-weight: 600;
}
.btn-check:checked + .option-tile::after {
  content: '\f26a';
  font-family: 'bootstrap-icons';
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 0.85rem;
  line-height: 1;
  color: var(--hw-red);
}
.btn-check:focus-visible + .option-tile {
  outline: 2px solid var(--hw-heading);
  outline-offset: 2px;
}

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
.unsaved-note {
  font-size: 0.875rem;
  color: var(--hw-muted);
}
@media (max-width: 575.98px) {
  .action-bar .btn {
    flex: 1 1 auto;
  }
}

.locked-note {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.6rem;
  background: var(--tint);
  color: var(--hw-heading);
}
.locked-note > i {
  font-size: 1.25rem;
  line-height: 1.2;
}
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
  color: var(--hw-heading);
}
.swatch {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 0.4rem;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
}

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
  background: var(--tint);
  color: var(--hw-heading);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

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
  border: 2px solid var(--dash);
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
  content: '\f26e';
  font-family: 'bootstrap-icons';
  font-size: 0.75rem;
  line-height: 1;
  color: #fff;
}
.tracker li.current .dot {
  border-color: var(--hw-heading);
  background: var(--hw-heading);
  box-shadow: 0 0 0 4px var(--tint);
}
.tracker li.current .step-label {
  font-weight: 600;
}

@media (prefers-reduced-motion: no-preference) {
  .tracker li.done::after,
  .tracker li.current::after {
    animation: tracker-fill 0.3s ease-out both;
    animation-delay: calc((var(--i) - 1) * 0.3s);
  }
  .tracker li.done .dot {
    animation: tracker-dot-in 0.3s ease-out both;
    animation-delay: calc(var(--i) * 0.3s);
  }
  .tracker li.current .dot {
    animation:
      tracker-dot-in 0.3s ease-out both,
      tracker-pulse 2s ease-out infinite;
    animation-delay: calc(var(--i) * 0.3s), calc(var(--i) * 0.3s + 0.3s);
  }
}
@keyframes tracker-fill {
  from {
    transform: scaleX(0);
  }
}
@keyframes tracker-dot-in {
  0% {
    border-color: var(--dash);
    background: var(--hw-surface);
  }
  60% {
    transform: scale(1.25);
  }
}
@keyframes tracker-pulse {
  0% {
    box-shadow: 0 0 0 0 var(--pulse);
  }
  70% {
    box-shadow: 0 0 0 10px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
</style>
