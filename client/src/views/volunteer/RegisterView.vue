<script setup>
// Feature 1a – Registration — owner: Kuah
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()


const submitted = ref(false)
const name = ref('')
const email = ref('')
const phone = ref('')
const postalCode = ref('')
const address = ref('')
const password = ref('')
const confirmPassword = ref('')
// NEW (spec: consent before tracking): the volunteer must agree to share their live location on event day.
// Sign up stays disabled until ticked, and the server also refuses an account without it.
const consent = ref(false)

const showPassword = ref(false)
const showConfirmPassword = ref(false)

const errors = ref({})
const serverError = ref('')
const loading = ref(false)

const phoneRegex = /^[689]\d{7}$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------- Email: helpful error messages ----------
// Common email providers, used for the quick-pick buttons and for "did you mean…?"
const emailDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com']

// Common spelling mistakes -> the correct domain
const domainTypos = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com',
}

// Returns '' if the email is fine, otherwise a message saying exactly what's wrong
function emailError() {
  const value = email.value.trim()

  if (!value) return 'Enter your email address.'
  if (/\s/.test(value)) return 'Email cannot contain spaces.'

  const atCount = value.split('@').length - 1
  if (atCount === 0) return 'Missing "@". An email looks like name@gmail.com.'
  if (atCount > 1) return 'An email can only have one "@".'

  const [user, domain] = value.split('@')
  if (!user) return 'Add your name before the "@", e.g. kuah@gmail.com.'
  if (!domain) return 'Add your email provider after the "@", e.g. @gmail.com.'

  const lower = domain.toLowerCase()
  if (domainTypos[lower]) return `Did you mean @${domainTypos[lower]}?`

  if (!domain.includes('.')) {
    // e.g. "kuah@gmail" -> suggest "@gmail.com"
    const match = emailDomains.find((d) => d.startsWith(lower))
    if (match) return `Did you mean @${match}?`
    return `"@${domain}" is incomplete. It needs an ending like .com, e.g. @gmail.com.`
  }

  if (!emailRegex.test(value)) return 'Enter a valid email address, e.g. name@gmail.com.'
  return ''
}

// ---------- Email: quick-pick domain buttons ----------
// Shows the buttons while the user is still typing the part after "@".
// If they've typed "kuah@g", only domains starting with "g" are shown.
const domainSuggestions = computed(() => {
  const value = email.value.trim()
  if (!value || /\s/.test(value)) return []

  const parts = value.split('@')
  if (parts.length > 2 || !parts[0]) return []   // two @'s, or nothing before @

  const typed = (parts[1] || '').toLowerCase()      // what's after @ ('' if no @ yet)
  return emailDomains.filter((d) => d.startsWith(typed) && d !== typed)
})

// Clicking a button: keep what's before "@" and add the chosen domain
function pickDomain(domain) {
  const user = email.value.trim().split('@')[0]
  email.value = user + '@' + domain
  touch('email') // check it straight away -> turns green
}

// OneMap result for the postal code (declared here because the postal code rule below uses it)
const postalStatus = ref('idle')    // 'idle' | 'loading' | 'found' | 'notfound' | 'error'
const postalPreview = ref('')       // the address OneMap found

// ---------- Password requirements ----------
// Each rule has a label (shown in the checklist) and a test (true = met).
const passwordRules = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p) => /\d/.test(p) },
  { label: 'One special character (e.g. ! @ # $ %)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
]

// computed: re-checks every rule each time the password changes -> [{ label, met }, ...]
const passwordChecks = computed(() =>
  passwordRules.map((rule) => ({ label: rule.label, met: rule.test(password.value) })),
)

const rules = {
  name: () => (name.value.trim() ? '' : 'Enter your name.'),
  email: emailError,
  address: () => (address.value.trim() ? '' : 'Enter your address.'),
  postalCode: () => {
    if (!/^\d{6}$/.test(postalCode.value.trim())) return 'Enter a 6-digit postal code.'
    // OneMap checked it and there is no such place -> not a real Singapore postal code
    if (postalStatus.value === 'notfound') return "This postal code doesn't exist in Singapore. Please check it."
    return ''
  },
  phone: () =>
    phoneRegex.test(phone.value.replace(/\s+/g, ''))
      ? ''
      : 'Enter an 8-digit Singapore number starting with 6, 8 or 9.',
  password: () => {
    if (!password.value) return 'Password is required.'
    if (/\s/.test(password.value)) return 'Password cannot contain spaces.'
    return passwordChecks.value.every((check) => check.met)
      ? ''
      : 'Your password does not meet all the requirements below.'
  },
  confirmPassword: () =>
    confirmPassword.value === password.value ? '' : 'Passwords do not match.',
}

function validateField(field) {
  const message = rules[field]()
  if (message) errors.value[field] = message
  else delete errors.value[field]
}

function validate() {
  errors.value = {}
  Object.keys(rules).forEach(validateField)
  return Object.keys(errors.value).length === 0
}

const fields = { name, email, address, postalCode, phone, password, confirmPassword }

// ---------- Green tick / red box per field ----------
// "touched" remembers which fields the user has already typed in and left.
// We only show green/red on those, so the form isn't all red when the page opens.
const touched = ref({})

// Runs when the user clicks/tabs out of a field (@blur in the template)
function touch(field) {
  touched.value[field] = true
  validateField(field)
}

// Should this field be checked yet? (after leaving it, or after pressing Sign up)
function isChecked(field) {
  return submitted.value || touched.value[field]
}

// true -> show green border + tick (Bootstrap "is-valid")
function isOk(field) {
  return isChecked(field) && !errors.value[field]
}

// Whenever anything is typed, re-check every field that is already being checked.
// (Re-checking all of them means "Confirm password" updates when "Password" changes.)
watch(Object.values(fields), () => {
  Object.keys(fields).forEach((field) => {
    if (isChecked(field)) validateField(field)
  })
})

// ---------- OneMap: postal code <-> address ----------
// Uses our server (which uses onemap.js), because OneMap needs a secret login:
//   GET /api/users/postal-lookup?postalCode=560123   -> { address }
//   GET /api/users/address-search?q=ang mo kio       -> [{ address, postal }, ...]
const addressSuggestions = ref([])  // list shown under the Address box
let postalTimer = null              // for debouncing (waiting until the user stops typing)
let addressTimer = null

// When WE fill a box from code, its watcher would start a search we don't want.
// These flags tell the watcher "skip this one change".
let skipPostalSearch = false
let skipAddressSearch = false

// Fill the Address box from code (without starting an address search)
function setAddressFromOneMap(newAddress) {
  if (address.value !== newAddress) {
    skipAddressSearch = true
    address.value = newAddress
  }
  touch('address') // show its green tick
}

// 1) Postal code typed -> fill in the address
watch(postalCode, (value) => {
  clearTimeout(postalTimer) // cancel the lookup we were waiting to do

  if (skipPostalSearch) {
    skipPostalSearch = false
    return
  }

  const code = value.trim()
  if (!/^\d{6}$/.test(code)) {
    postalStatus.value = 'idle' // not 6 digits yet – nothing to show
    return
  }

  postalStatus.value = 'loading'

  // Debounce: only look up once the user has stopped typing for 400 ms
  postalTimer = setTimeout(async () => {
    try {
      const response = await axios.get('/api/users/postal-lookup', { params: { postalCode: code } })
      if (postalCode.value.trim() !== code) return // user changed it while we were waiting

      postalStatus.value = 'found'
      postalPreview.value = response.data.address
      setAddressFromOneMap(response.data.address)
      touch('postalCode') // real postal code -> green tick
    } catch (error) {
      if (postalCode.value.trim() !== code) return
      // 404 = OneMap has no such postal code; anything else = couldn't reach OneMap
      postalStatus.value = error.response?.status === 404 ? 'notfound' : 'error'
      touch('postalCode') // 'notfound' -> red box + error message
    }
  }, 400)
})

// 2) Address typed -> show matching places (each has a postal code)
watch(address, (value) => {
  clearTimeout(addressTimer)

  if (skipAddressSearch) {
    skipAddressSearch = false
    addressSuggestions.value = []
    return
  }

  const text = value.trim()
  if (text.length < 3) {
    addressSuggestions.value = [] // too short to search
    return
  }

  addressTimer = setTimeout(async () => {
    try {
      const response = await axios.get('/api/users/address-search', { params: { q: text } })
      if (address.value.trim() !== text) return // user kept typing – ignore old results
      addressSuggestions.value = response.data
    } catch {
      addressSuggestions.value = [] // OneMap down – user can still type it in themselves
    }
  }, 400)
})

// Clicking a suggestion -> fill BOTH boxes
function pickAddress(place) {
  setAddressFromOneMap(place.address)

  if (postalCode.value !== place.postal) {
    skipPostalSearch = true // we already know the address, no need to look it up again
    postalCode.value = place.postal
  }
  postalStatus.value = 'found'
  postalPreview.value = place.address
  touch('postalCode')

  addressSuggestions.value = []
}

// Leaving the Address box: check it and hide the suggestion list
function onAddressBlur() {
  touch('address')
  addressSuggestions.value = []
}

// ---------- Progress bar ----------
// A field counts as "done" when it is not empty AND passes its rule above,
// so typing "abc" into Email won't count until it's a real email.
const fieldNames = Object.keys(fields) // 7 fields

const filledCount = computed(() => {
  let count = 0
  fieldNames.forEach((field) => {
    const isEmpty = fields[field].value.trim() === ''
    const isValid = rules[field]() === ''
    if (!isEmpty && isValid) count++
  })
  return count
})

// e.g. 1 of 7 filled -> 14%, 7 of 7 -> 100%
const progress = computed(() => Math.round((filledCount.value / fieldNames.length) * 100))

// ---------- Sign up button on/off ----------
// computed = re-calculated automatically whenever any field changes (Vue reactivity),
// so the button switches itself on the moment the last field becomes valid.
const fieldsLeft = computed(() => fieldNames.length - filledCount.value)
const canSubmit = computed(
  () => fieldsLeft.value === 0 && consent.value && postalStatus.value !== 'loading' && !loading.value,
)

// ---------- Email verification (6-digit code) ----------
const step = ref('form')      // 'form' = fill in details, 'otp' = type the emailed code
const otpCode = ref('')
const otpInput = ref(null)    // the code <input>, so we can put the cursor in it
const otpError = ref('')
const otpNotice = ref('')
const devCode = ref('')       // only filled in test mode (OTP_MOCK=true): no real email sent
const sending = ref(false)    // true while the server is sending the email
const resendIn = ref(0)       // seconds until "Resend code" can be pressed again
let resendTimer = null

function startResendTimer(seconds) {
  clearInterval(resendTimer)
  resendIn.value = seconds
  resendTimer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0) clearInterval(resendTimer)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(resendTimer)) // stop the timer if the user leaves the page

// Ask the server to email a code
async function sendCode() {
  const response = await axios.post('/api/users/otp/request', {
    email: email.value.trim(),
    phone: phone.value.replace(/\s+/g, ''), // so the server can check it isn't already registered
  })
  devCode.value = response.data.devCode || ''
  startResendTimer(response.data.resendInSeconds || 60)
}

// Step 1: "Sign up" pressed -> check the form, then email the code
async function register() {
  serverError.value = ''
  submitted.value = true
  if (postalStatus.value === 'loading') {
    serverError.value = 'Still checking your postal code. Try again in a second.'
    return
  }
  if (!validate()) return

  loading.value = true
  try {
    await sendCode()
    otpCode.value = ''
    otpError.value = ''
    otpNotice.value = ''
    step.value = 'otp'
    await nextTick()         // wait for the code box to appear...
    otpInput.value?.focus()  // ...then put the cursor in it
  } catch (error) {
    serverError.value = error.response?.data?.message || 'Could not send the code. Try again.'
  } finally {
    loading.value = false
  }
}

// "Resend code"
async function resend() {
  otpError.value = ''
  otpNotice.value = ''
  sending.value = true
  try {
    await sendCode()
    otpCode.value = ''
    otpNotice.value = 'A new code is on its way.'
    otpInput.value?.focus()
  } catch (error) {
    otpError.value = error.response?.data?.message || 'Could not send the code. Try again.'
  } finally {
    sending.value = false
  }
}

// "Change email" -> back to the form, details still filled in
function backToForm() {
  clearInterval(resendTimer)
  resendIn.value = 0
  step.value = 'form'
}

// Step 2: "Verify & create account" pressed
async function verifyAndCreate() {
  otpError.value = ''
  otpNotice.value = ''

  if (!/^\d{6}$/.test(otpCode.value.trim())) {
    otpError.value = 'Enter the 6-digit code from the email.'
    return
  }

  loading.value = true
  try {
    // 1) Check the code
    await axios.post('/api/users/otp/verify', { email: email.value.trim(), code: otpCode.value.trim() })

    // 2) Create the account
    const body = {
      name: name.value.trim(),
      email: email.value.trim(),
      postalCode: postalCode.value.trim(),
      address: address.value.trim(),
      phone: phone.value.replace(/\s+/g, ''),
      password: password.value,
      role: 'volunteer',
      locationConsent: consent.value, // NEW: server stores the time the volunteer agreed
    }
    await axios.post('/api/users', body)

    // 3) Log the new volunteer in straight away (same endpoint the Login page uses)
    await axios.post('/api/users/login', { email: email.value.trim(), password: password.value })

    // Full page load so the navbar picks up the logged-in user
    window.location.assign(route.query.redirect || '/')
  } catch (error) {
    otpError.value = error.response?.data?.message || 'Something went wrong. Try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section>
    <PageHeader title="Volunteer sign-up" icon="bi-person-plus" />
  </section>

  <div class="container py-5">
    <div class="row justify-content-center">
      <div class="col-12 col-md-8 col-lg-5">
        <div class="card-hw p-4 p-md-5">
          <h1 class="h3 fw-bold mb-1" style="color: var(--hw-navy)">Sign up to volunteer</h1>
          <p class="text-muted-hw mb-4">Create your Heartware Ops account.</p>

          <!-- ================= STEP 2: type the emailed code ================= -->
          <div v-if="step === 'otp'" data-testid="reg-otp">
            <p class="small text-uppercase fw-semibold text-muted-hw mb-1">Step 2 of 2</p>
            <h2 class="h5 mb-1"><i class="bi bi-envelope-check me-2"></i>Verify your email</h2>
            <p class="text-muted-hw">
              We emailed a 6-digit code to <strong class="text-break">{{ email }}</strong>.
              If you can't see it, check your spam folder.
            </p>

            <div v-if="otpError" class="alert alert-danger py-2" role="alert" data-testid="reg-otp-error">
              {{ otpError }}
            </div>
            <div v-else-if="otpNotice" class="alert alert-success py-2" role="status">
              {{ otpNotice }}
            </div>

            <!-- Test mode only (OTP_MOCK=true): no email is sent, so show the code here -->
            <div v-if="devCode" class="alert alert-info py-2 small" data-testid="reg-otp-dev">
              <i class="bi bi-tools me-1"></i>Test mode – no email sent. Your code is
              <strong data-testid="reg-otp-dev-code">{{ devCode }}</strong>
            </div>

            <form @submit.prevent="verifyAndCreate" novalidate>
              <label for="otpCode" class="form-label fw-semibold">Verification code</label>
              <input id="otpCode" ref="otpInput" v-model="otpCode" type="text"
                     inputmode="numeric" maxlength="6" placeholder="000000"
                     autocomplete="one-time-code"
                     class="form-control form-control-lg text-center fw-semibold"
                     style="letter-spacing: 0.5em"
                     data-testid="reg-otp-code" />
              <div class="form-text mb-3">The code expires after 10 minutes.</div>

              <button type="submit" class="btn btn-brand btn-lg w-100 tap-target" :disabled="loading"
                      data-testid="reg-otp-submit">
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ loading ? 'Creating account…' : 'Verify & create account' }}
              </button>
            </form>

            <div class="d-flex flex-wrap justify-content-between gap-2 mt-3">
              <button type="button" class="btn btn-link btn-sm p-0 link-brand" @click="backToForm"
                      data-testid="reg-otp-back">
                <i class="bi bi-arrow-left me-1"></i>Change email
              </button>
              <button type="button" class="btn btn-link btn-sm p-0 link-brand"
                      :disabled="resendIn > 0 || sending" @click="resend"
                      data-testid="reg-otp-resend">
                {{ resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code' }}
              </button>
            </div>
          </div>

          <!-- ================= STEP 1: the form ================= -->
          <div v-else>
          <p class="small text-uppercase fw-semibold text-muted-hw mb-1">Step 1 of 2</p>

          <!-- Progress bar (Bootstrap) – width is bound to the computed "progress" -->
          <div class="mb-4">
            <div class="d-flex justify-content-between small mb-1">
              <span class="fw-semibold">{{ filledCount }} of {{ fieldNames.length }} fields done</span>
              <span class="fw-semibold">{{ progress }}%</span>
            </div>
            <div class="progress" role="progressbar" aria-label="Form completion"
                 :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"
                 style="height: 10px">
              <div class="progress-bar"
                   :class="progress === 100 ? 'bg-success' : 'bg-brand'"
                   :style="{ width: progress + '%' }"></div>
            </div>
          </div>

          <div v-if="serverError" class="alert alert-danger py-2" role="alert" data-testid="reg-error">
            {{ serverError }}
          </div>

          <form @submit.prevent="register" novalidate>
            <!-- Name -->
            <div class="mb-3">
              <label for="name" class="form-label fw-semibold">Name</label>
              <input id="name" v-model="name" type="text"
                     class="form-control form-control-lg"
                     :class="{ 'is-invalid': errors.name, 'is-valid': isOk('name') }"
                     @blur="touch('name')" data-testid="reg-name" autocomplete="name" />
              <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.name }}</div>
              <div class="valid-feedback"><i class="bi bi-check-circle-fill"></i> Looks good!</div>
            </div>

            <!-- Email -->
            <div class="mb-3">
              <label for="email" class="form-label fw-semibold">Email</label>
              <input id="email" v-model="email" type="email"
                     class="form-control form-control-lg"
                     :class="{ 'is-invalid': errors.email, 'is-valid': isOk('email') }"
                     @blur="touch('email')" data-testid="reg-email" autocomplete="email" />
              <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.email }}</div>
              <div class="valid-feedback"><i class="bi bi-check-circle-fill"></i> Looks good!</div>

              <!-- Quick-pick buttons: one per suggested domain (v-for = list rendering) -->
              <div v-if="domainSuggestions.length" class="d-flex flex-wrap gap-2 mt-2">
                <button v-for="domain in domainSuggestions" :key="domain"
                        type="button"
                        class="btn btn-sm btn-outline-secondary rounded-pill"
                        @mousedown.prevent
                        @click="pickDomain(domain)">
                  @{{ domain }}
                </button>
              </div>
            </div>

            <!-- Phone (input-group: feedback goes INSIDE) -->
            <div class="mb-3">
              <label for="phone" class="form-label fw-semibold">Phone number</label>
              <div class="input-group input-group-lg has-validation">
                <span class="input-group-text">+65</span>
                <input id="phone" v-model="phone" type="tel" inputmode="numeric"
                       maxlength="8" placeholder="91234567" class="form-control"
                       :class="{ 'is-invalid': errors.phone, 'is-valid': isOk('phone') }"
                       @blur="touch('phone')" data-testid="reg-phone" autocomplete="tel-national" />
                <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.phone }}</div>
                <div class="valid-feedback"><i class="bi bi-check-circle-fill"></i> Looks good!</div>
              </div>
            </div>

            <!-- Postal code (moved ABOVE address: type postal -> address fills itself) -->
            <div class="mb-3">
              <label for="postalCode" class="form-label fw-semibold">Postal code</label>
              <input id="postalCode" v-model="postalCode" type="text"
                     inputmode="numeric" maxlength="6" placeholder="560123"
                     class="form-control form-control-lg"
                     :class="{ 'is-invalid': errors.postalCode, 'is-valid': isOk('postalCode') }"
                     @blur="touch('postalCode')" autocomplete="postal-code"
                     data-testid="reg-postal" />
              <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.postalCode }}</div>

              <!-- OneMap result under the postal box -->
              <div v-if="postalStatus !== 'idle' && postalStatus !== 'notfound'" class="small mt-1" data-testid="reg-postal-preview">
                <span v-if="postalStatus === 'loading'" class="text-muted">
                  <span class="spinner-border spinner-border-sm me-1"></span> Looking up address…
                </span>
                <span v-else-if="postalStatus === 'found'" class="text-success">
                  <i class="bi bi-geo-alt-fill"></i> Found: {{ postalPreview }}
                </span>
                <span v-else class="text-warning">
                  <i class="bi bi-wifi-off"></i> Couldn't reach OneMap. Please type your address below.
                </span>
              </div>
            </div>

            <!-- Address: fills in from the postal code, OR type it and pick from the list -->
            <div class="mb-3">
              <label for="address" class="form-label fw-semibold">Address</label>
              <input id="address" v-model="address" type="text"
                     placeholder="123 Ang Mo Kio Ave 3"
                     class="form-control form-control-lg"
                     :class="{ 'is-invalid': errors.address, 'is-valid': isOk('address') }"
                     @blur="onAddressBlur" data-testid="reg-address" autocomplete="off" />
              <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.address }}</div>

              <!-- OneMap suggestions: click one to fill in the address AND postal code -->
              <div v-if="addressSuggestions.length" class="list-group mt-1 shadow-sm" data-testid="reg-address-suggestions">
                <button v-for="place in addressSuggestions" :key="place.address + place.postal"
                        type="button"
                        class="list-group-item list-group-item-action small"
                        @mousedown.prevent
                        @click="pickAddress(place)">
                  <i class="bi bi-geo-alt text-muted me-1"></i>
                  {{ place.address }} <span class="text-muted">S({{ place.postal }})</span>
                </button>
              </div>

              <div v-else class="valid-feedback"><i class="bi bi-check-circle-fill"></i> Looks good!</div>
            </div>

            <!-- Password (input-group: feedback goes INSIDE) -->
            <div class="mb-3">
              <label for="password" class="form-label fw-semibold">Password</label>
              <div class="input-group input-group-lg has-validation">
                <input id="password" v-model="password"
                       :type="showPassword ? 'text' : 'password'"
                       class="form-control"
                       :class="{ 'is-invalid': errors.password, 'is-valid': isOk('password') }"
                       @blur="touch('password')" data-testid="reg-password" autocomplete="new-password" />
                <button type="button" class="btn btn-outline-secondary border rounded-end"
                        :aria-label="showPassword ? 'Hide password' : 'Show password'"
                        @click="showPassword = !showPassword">
                  <i class="bi" :class="showPassword ? 'bi-eye' : 'bi-eye-slash'"></i>
                </button>
                <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.password }}</div>
                <div class="valid-feedback"><i class="bi bi-check-circle-fill"></i> Looks good!</div>
              </div>

              <!-- Password checklist: each rule turns green with a tick once it's met -->
              <ul class="list-unstyled small mt-2 mb-0" data-testid="reg-password-rules">
                <li v-for="check in passwordChecks" :key="check.label"
                    :class="check.met ? 'text-success' : 'text-muted-hw'">
                  <i class="bi me-1" :class="check.met ? 'bi-check-circle-fill' : 'bi-circle'"></i>
                  {{ check.label }}
                </li>
              </ul>
            </div>

            <!-- Confirm password (input-group: feedback goes INSIDE) -->
            <div class="mb-3">
              <label for="confirmPassword" class="form-label fw-semibold">Confirm password</label>
              <div class="input-group input-group-lg has-validation">
                <input id="confirmPassword" v-model="confirmPassword"
                       :type="showConfirmPassword ? 'text' : 'password'"
                       class="form-control"
                       :class="{ 'is-invalid': errors.confirmPassword, 'is-valid': isOk('confirmPassword') }"
                       @blur="touch('confirmPassword')" autocomplete="new-password" />
                <button type="button" class="btn btn-outline-secondary border rounded-end"
                        :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
                        @click="showConfirmPassword = !showConfirmPassword">
                  <i class="bi" :class="showConfirmPassword ? 'bi-eye' : 'bi-eye-slash'"></i>
                </button>
                <div class="invalid-feedback"><i class="bi bi-x-circle-fill"></i> {{ errors.confirmPassword }}</div>
                <div class="valid-feedback"><i class="bi bi-check-circle-fill"></i> Looks good!</div>
              </div>
            </div>

            <!-- NEW: location consent. Required, so the button below stays disabled until it is ticked. -->
            <div class="form-check mb-3">
              <input id="locationConsent" v-model="consent" type="checkbox" class="form-check-input"
                     data-testid="reg-consent" />
              <label for="locationConsent" class="form-check-label small">
                I agree that Heartware Ops can collect my phone's location on event day so coordinators can see my
                progress and keep everyone safe. I can stop sharing at any time by closing the Event day page.
              </label>
            </div>

            <button type="submit" class="btn btn-brand btn-lg w-100 mt-2 tap-target" :disabled="!canSubmit"
                    data-testid="reg-submit">
              <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
              {{ loading ? 'Sending code…' : 'Sign up' }}
            </button>

            <!-- Tells the user WHY the button is still greyed out -->
            <p v-if="!canSubmit && !loading" class="small text-muted-hw text-center mt-2 mb-0" data-testid="reg-submit-hint">
              <template v-if="postalStatus === 'loading'">Checking your postal code…</template>
              <!-- all fields done but the box is not ticked: say so, otherwise the greyed button looks broken -->
              <template v-else-if="fieldsLeft === 0 && !consent">Tick the location consent box to sign up.</template>
              <template v-else>
                Complete {{ fieldsLeft }} more {{ fieldsLeft === 1 ? 'field' : 'fields' }} to sign up.
              </template>
            </p>
          </form>
          </div>
          <!-- ================= end of STEP 1 ================= -->

          <p class="text-center text-muted-hw mt-4 mb-0">
            Already have an account?
            <RouterLink to="/login" class="link-brand fw-semibold">Log in</RouterLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-control:focus:not(.is-valid):not(.is-invalid) {
  border-color: var(--hw-red);
  box-shadow: 0 0 0 0.2rem rgb(214 0 28 / 0.15);
}

.link-brand {
  color: var(--hw-red);
  text-decoration: none;
}
.link-brand:hover {
  color: var(--hw-red-dark);
  text-decoration: underline;
}

.bg-brand {
  background-color: var(--hw-red);
}
</style>