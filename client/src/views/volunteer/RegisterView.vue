<!-- The volunteer sign-up page (F1) with email code check, postal code lookup (OneMap), password
     rules and a pass-style preview. -->

<script setup>
// Validates every field live, looks up the address from the postal code, checks the password rules,
// sends and verifies the email code, and submits the account.

import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import MapNotice from '@/components/map/MapNotice.vue'

const route = useRoute()

const submitted = ref(false)
const name = ref('')
const email = ref('')
const phone = ref('')
const postalCode = ref('')
const address = ref('')
const password = ref('')
const confirmPassword = ref('')
const consent = ref(false)

const showPassword = ref(false)
const showConfirmPassword = ref(false)

const errors = ref({})
const notice = ref(null)
let noticeTimer = null

// showError(text, title) - fills the popup (error type, warning icon, title "Unable to sign up" unless
// another is given) and (re)starts the 5 second hide timer. dismissNotice() = the X button;
// onBeforeUnmount clears the timer.
function showError(text, title = 'Unable to sign up') {
  notice.value = { type: 'error', icon: 'bi-exclamation-triangle-fill', title, text }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = null), 5000)
}
// The X button
function dismissNotice() {
  clearTimeout(noticeTimer)
  notice.value = null
}
// onBeforeUnmount - cancel the notice timer when leaving the page.
onBeforeUnmount(() => clearTimeout(noticeTimer))
const loading = ref(false)

const phoneRegex = /^[689]\d{7}$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com']

const domainTypos = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
}

// emailError() - returns '' when the email is fine, otherwise a message that says exactly what is
// wrong. 1) empty 2) spaces 3) count of "@" (none or more than one) 4) nothing before or after "@" 5)
// a known typo domain gives "Did you mean @gmail.com?" 6) a domain with no dot is matched against the
// common providers (e.g. "@gmail" suggests gmail.com) 7) finally the regex check.
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
    const match = emailDomains.find((d) => d.startsWith(lower))
    if (match) return `Did you mean @${match}?`
    return `"@${domain}" is incomplete. It needs an ending like .com, e.g. @gmail.com.`
  }

  if (!emailRegex.test(value)) return 'Enter a valid email address, e.g. name@gmail.com.'
  return ''
}

// domainSuggestions (computed) - the quick-pick domain buttons shown while the person types after the
// "@": only domains starting with what is typed so far (and not an exact match). Empty for empty text,
// spaces, two "@" or nothing before "@".
const domainSuggestions = computed(() => {
  const value = email.value.trim()
  if (!value || /\s/.test(value)) return []

  const parts = value.split('@')
  if (parts.length > 2 || !parts[0]) return []

  const typed = (parts[1] || '').toLowerCase()
  return emailDomains.filter((d) => d.startsWith(typed) && d !== typed)
})

// pickDomain(domain) - keeps the text before "@", adds the chosen domain and checks the field straight
// away (turns green).
function pickDomain(domain) {
  const user = email.value.trim().split('@')[0]
  email.value = user + '@' + domain
  touch('email')
}

const postalStatus = ref('idle')
const postalPreview = ref('')

const passwordRules = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p) => /\d/.test(p) },
  { label: 'One special character (e.g. ! @ # $ %)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
]

// passwordChecks (computed) - re-tests every rule whenever the password changes, giving [{ label, met
// }].
const passwordChecks = computed(() =>
  passwordRules.map((rule) => ({ label: rule.label, met: rule.test(password.value) })),
)

const rules = {
  name: () => (name.value.trim() ? '' : 'Enter your name.'),
  email: emailError,
  // address (validator) - error text for the address box: nothing if an address was found; a "try
  // again later" message if OneMap failed; otherwise ask for the postal code.
  address: () => {
    if (address.value.trim()) return ''
    if (postalStatus.value === 'error')
      return 'We can\'t look up your address right now. Please tap "Try again" or come back in a few minutes.'
    return 'Enter your postal code to fill in your address.'
  },
  // postalCode (validator) - must be exactly 6 digits; shows a special message when the lookup said
  // the code does not exist.
  postalCode: () => {
    if (!/^\d{6}$/.test(postalCode.value.trim())) return 'Enter a 6-digit postal code.'
    if (postalStatus.value === 'notfound')
      return "This postal code doesn't exist in Singapore. Please check it."
    return ''
  },
  // phone (validator) - must be an 8-digit Singapore number starting with 6, 8 or 9 (spaces ignored).
  phone: () =>
    phoneRegex.test(phone.value.replace(/\s+/g, ''))
      ? ''
      : 'Enter an 8-digit Singapore number starting with 6, 8 or 9.',
  // password (validator) - required, no spaces, and every rule in the checklist must be met.
  password: () => {
    if (!password.value) return 'Password is required.'
    if (/\s/.test(password.value)) return 'Password cannot contain spaces.'
    return passwordChecks.value.every((check) => check.met)
      ? ''
      : 'Your password does not meet all the requirements below.'
  },
  // confirmPassword (validator) - must equal the password.
  confirmPassword: () =>
    confirmPassword.value === password.value ? '' : 'Passwords do not match.',
}

// validateField(field) - runs one rule and stores or removes that field's error.
function validateField(field) {
  const message = rules[field]()
  if (message) errors.value[field] = message
  else delete errors.value[field]
}

// validate() - clears all errors, validates every field and returns true only if there are none.
function validate() {
  errors.value = {}
  Object.keys(rules).forEach(validateField)
  return Object.keys(errors.value).length === 0
}

const fields = { name, email, address, postalCode, phone, password, confirmPassword }

const touched = ref({})

// touch(field) - mark as touched and validate it (called on blur).
function touch(field) {
  touched.value[field] = true
  validateField(field)
}

// isChecked(field) - should this field be judged yet? (after leaving it, or after pressing Sign up).
function isChecked(field) {
  return submitted.value || touched.value[field]
}

// isOk(field) - checked and no error: shows the green tick (Bootstrap is-valid).
function isOk(field) {
  return isChecked(field) && !errors.value[field]
}

// Whenever anything is typed, re-check every field that is already being checked. (Re-checking all of
// them means "Confirm password" updates when "Password" changes.) Whenever any field changes,
// re-validate every field already being checked (so "Confirm password" updates when "Password"
// changes).
watch(Object.values(fields), () => {
  Object.keys(fields).forEach((field) => {
    if (isChecked(field)) validateField(field)
  })
})

let postalTimer = null

// clearAddress() - the postal code changed, so empty the locked address, its preview and its error (no
// red "required" while still typing).
function clearAddress() {
  address.value = ''
  postalPreview.value = ''
  delete touched.value.address
  delete errors.value.address
}

// lookupPostal(code) - 1) show loading 2) ask our server (which asks OneMap) for the address of the
// code 3) ignore the answer if the code changed meanwhile 4) found: store and show the address, tick
// the address and postal code fields 5) error: 404 means "notfound" (red message), anything else means
// "error" (OneMap unreachable, show a Try again link).
async function lookupPostal(code) {
  postalStatus.value = 'loading'
  try {
    const response = await axios.get('/api/users/postal-lookup', { params: { postalCode: code } })
    if (postalCode.value.trim() !== code) return

    postalStatus.value = 'found'
    postalPreview.value = response.data.address
    address.value = response.data.address
    touch('address')
    touch('postalCode')
  } catch (error) {
    if (postalCode.value.trim() !== code) return
    postalStatus.value = error.response?.status === 404 ? 'notfound' : 'error'
    touch('postalCode')
  }
}

// watch(postalCode) - 1) cancel the pending lookup 2) clear the old address 3) if it is not 6 digits
// go back to idle 4) otherwise show loading and look the code up after 400 ms of no typing (debounce).
watch(postalCode, (value) => {
  clearTimeout(postalTimer)
  clearAddress()

  const code = value.trim()
  if (!/^\d{6}$/.test(code)) {
    postalStatus.value = 'idle'
    return
  }

  postalStatus.value = 'loading'
  postalTimer = setTimeout(() => lookupPostal(code), 400)
})

// retryPostal() - the "Try again" link: look the current 6-digit code up again.
function retryPostal() {
  const code = postalCode.value.trim()
  if (/^\d{6}$/.test(code)) lookupPostal(code)
}

const fieldNames = Object.keys(fields)

// filledCount (computed) - how many fields are not empty AND pass their rule.
const filledCount = computed(() => {
  let count = 0
  fieldNames.forEach((field) => {
    const isEmpty = fields[field].value.trim() === ''
    const isValid = rules[field]() === ''
    if (!isEmpty && isValid) count++
  })
  return count
})

// progress (computed) - filledCount as a percent (1 of 7 = 14, 7 of 7 = 100).
const progress = computed(() => Math.round((filledCount.value / fieldNames.length) * 100))

// fieldsLeft and canSubmit (computed) - the Sign up button is on only when every field is done,
// consent is ticked, the postal lookup is not running and nothing is loading.
const fieldsLeft = computed(() => fieldNames.length - filledCount.value)
// canSubmit (computed) - the Sign up button is enabled only when no required field is left, consent is
// ticked, the postal lookup is not running and nothing is loading.
const canSubmit = computed(
  () =>
    fieldsLeft.value === 0 && consent.value && postalStatus.value !== 'loading' && !loading.value,
)

const step = ref('form')
const otpCode = ref('')
const otpInput = ref(null)
const otpNotice = ref('')
const devCode = ref('')
const sending = ref(false)
const resendIn = ref(0)
let resendTimer = null

// startResendTimer(seconds) - sets resendIn and counts down once a second until 0.
function startResendTimer(seconds) {
  clearInterval(resendTimer)
  resendIn.value = seconds
  resendTimer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0) clearInterval(resendTimer)
  }, 1000)
}
// onBeforeUnmount - stop the resend countdown timer.
onBeforeUnmount(() => clearInterval(resendTimer))

// sendCode() - asks the server to email a 6-digit code (also sends the phone so the server can reject
// a number already registered); keeps a dev code if the server returns one and starts the resend
// countdown (server value or 60 s).
async function sendCode() {
  const response = await axios.post('/api/users/otp/request', {
    email: email.value.trim(),
    phone: phone.value.replace(/\s+/g, ''),
  })
  devCode.value = response.data.devCode || ''
  startResendTimer(response.data.resendInSeconds || 60)
}

// register() - step 1, Sign up pressed. 1) mark submitted 2) if the postal lookup is still running ask
// them to wait 3) validate everything 4) show loading 5) send the code 6) clear the code box, switch
// to the 'otp' step and put the cursor in the code box 7) on error show the server's message 8) always
// stop loading.
async function register() {
  submitted.value = true
  if (postalStatus.value === 'loading') {
    showError('Still checking your postal code. Try again in a second.')
    return
  }
  if (postalStatus.value === 'error') {
    showError(
      'Our address service is not responding right now. Please press "Try again" under the postal code, or come back in a few minutes.',
      'Address lookup unavailable',
    )
    return
  }
  if (!validate()) return

  loading.value = true
  try {
    await sendCode()
    otpCode.value = ''
    otpNotice.value = ''
    step.value = 'otp'
    await nextTick()
    otpInput.value?.focus()
  } catch (error) {
    showError(error.response?.data?.message || 'Could not send the code. Try again.')
  } finally {
    loading.value = false
  }
}

// resend() - the Resend code button: send a new code, clear the box and show "A new code is on its
// way."; on error show the message.
async function resend() {
  otpNotice.value = ''
  sending.value = true
  try {
    await sendCode()
    otpCode.value = ''
    otpNotice.value = 'A new code is on its way.'
    otpInput.value?.focus()
  } catch (error) {
    showError(error.response?.data?.message || 'Could not send the code. Try again.', 'Verification failed')
  } finally {
    sending.value = false
  }
}

// backToForm() - "Change email": stop the countdown and return to the form with the details kept.
function backToForm() {
  clearInterval(resendTimer)
  resendIn.value = 0
  step.value = 'form'
}

// verifyAndCreate() - step 2. 1) the code must be 6 digits 2) POST /otp/verify (the server uses the
// code up and remembers the email as verified) 3) POST /api/users to create the account (name, email,
// postal code, address, phone, password, role volunteer, consent) 4) POST /api/users/login so they are
// logged in 5) full page load to ?redirect= or "/" so the navbar picks up the user (the router then
// moves a logged-in person to their own page) 6) on error show the message 7) always stop loading.
async function verifyAndCreate() {
  otpNotice.value = ''

  if (!/^\d{6}$/.test(otpCode.value.trim())) {
    showError('Enter the 6-digit code from the email.', 'Verification failed')
    return
  }

  loading.value = true
  try {
    await axios.post('/api/users/otp/verify', {
      email: email.value.trim(),
      code: otpCode.value.trim(),
    })

    const body = {
      name: name.value.trim(),
      email: email.value.trim(),
      postalCode: postalCode.value.trim(),
      address: address.value.trim(),
      phone: phone.value.replace(/\s+/g, ''),
      password: password.value,
      role: 'volunteer',
      locationConsent: consent.value,
    }
    await axios.post('/api/users', body)

    await axios.post('/api/users/login', { email: email.value.trim(), password: password.value })

    const target = route.query.redirect
    const safeRedirect = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : '/'
    window.location.assign(safeRedirect)
  } catch (error) {
    showError(error.response?.data?.message || 'Something went wrong. Try again.', 'Verification failed')
  } finally {
    loading.value = false
  }
}

// isDone(field) - same test as the progress bar (not empty and passes its rule); used by the live
// pass. Same "done" test the progress bar uses: not empty AND passes its rule
function isDone(field) {
  return fields[field].value.trim() !== '' && rules[field]() === ''
}

// initials (computed) - the first letters of the first two words of the name, in capitals ("Tan Wei
// Ming" gives "TW").
const initials = computed(() =>
  name.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join(''),
)

// phoneDisplay (computed) - "91234567" shown as "+65 9123 4567" on the pass.
const phoneDisplay = computed(() => {
  const digits = phone.value.replace(/\s+/g, '')
  if (!digits) return ''
  return `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`.trim()
})

// passwordStrength (computed) - how many of the 5 rules are met (0-5), used by the strength bar;
// strengthLabel maps it to "Too weak", "Weak", "Okay", "Almost there" or "Strong".
const passwordStrength = computed(() => passwordChecks.value.filter((check) => check.met).length)
// strengthLabel (computed) - the word under the strength bar (Too weak, Weak, Okay, Almost there,
// Strong) for the current score.
const strengthLabel = computed(
  () => ['Too weak', 'Too weak', 'Weak', 'Okay', 'Almost there', 'Strong'][passwordStrength.value],
)

// passReady (computed) - the pass shows its "Ready" stamp once every field is done and consent is
// ticked.
const passReady = computed(() => fieldsLeft.value === 0 && consent.value)

const otpFocused = ref(false)
// otpDigits (computed) - the 6 boxes of the code input: each typed digit, empty for the rest.
const otpDigits = computed(() => Array.from({ length: 6 }, (_, i) => otpCode.value[i] || ''))
</script>

<template>
  <!-- The step-by-step form, the password checklist, the code boxes and the volunteer pass
       preview. -->
  <div class="reg-wrap">
    <div class="reg-card card-hw">
      <div class="row g-0">
        <aside class="col-12 col-lg-5 reg-panel" aria-hidden="true">
          <div class="reg-panel-deco"></div>
          <div class="reg-panel-inner">
            <div class="pass-holder">
              <div class="lanyard"></div>
              <div
                class="pass"
                :class="{ 'is-ready': passReady && step === 'form', 'is-otp': step === 'otp' }"
              >
                <div class="pass-head">
                  <span class="pass-slot"></span>
                  <span class="pass-brand"><i class="bi bi-heart-fill"></i> Heartware Ops</span>
                  <span class="pass-kind">Volunteer</span>
                </div>

                <div class="pass-person">
                  <span class="pass-avatar" :class="{ 'has-initials': initials }">
                    <template v-if="initials">{{ initials }}</template>
                    <i v-else class="bi bi-person-fill"></i>
                  </span>
                  <span class="pass-who">
                    <span class="pass-name" :class="{ 'is-empty': !name.trim() }">{{
                      name.trim() || 'Your name'
                    }}</span>
                    <span class="pass-role">Show-day volunteer</span>
                  </span>
                </div>

                <dl class="pass-rows">
                  <div class="pass-row" :class="{ 'is-done': isDone('email') }">
                    <dt><i class="bi bi-envelope"></i>Email</dt>
                    <dd>{{ email.trim() || '—' }}</dd>
                    <i class="bi bi-check-circle-fill pass-tick"></i>
                  </div>
                  <div class="pass-row" :class="{ 'is-done': isDone('phone') }">
                    <dt><i class="bi bi-telephone"></i>Phone</dt>
                    <dd>{{ phoneDisplay || '—' }}</dd>
                    <i class="bi bi-check-circle-fill pass-tick"></i>
                  </div>
                  <div
                    class="pass-row"
                    :class="{ 'is-done': isDone('postalCode') && isDone('address') }"
                  >
                    <dt><i class="bi bi-geo-alt"></i>Home</dt>
                    <dd>
                      <template v-if="address">
                        <span :key="address" class="pass-drop-in">{{ address }}</span>
                        <span class="pass-sub">Singapore {{ postalCode }}</span>
                      </template>
                      <template v-else-if="postalStatus === 'loading'"
                        >Finding your address…</template
                      >
                      <template v-else>—</template>
                    </dd>
                    <i class="bi bi-check-circle-fill pass-tick"></i>
                  </div>
                  <div
                    class="pass-row"
                    :class="{ 'is-done': isDone('password') && isDone('confirmPassword') }"
                  >
                    <dt><i class="bi bi-shield-lock"></i>Password</dt>
                    <dd>{{ password ? '••••••••' : '—' }}</dd>
                    <i class="bi bi-check-circle-fill pass-tick"></i>
                  </div>
                  <div class="pass-row" :class="{ 'is-done': consent }">
                    <dt><i class="bi bi-broadcast"></i>Location</dt>
                    <dd>{{ consent ? 'Agreed' : 'Not agreed yet' }}</dd>
                    <i class="bi bi-check-circle-fill pass-tick"></i>
                  </div>
                </dl>

                <div class="pass-foot">
                  <span class="pass-dots">
                    <span
                      v-for="field in fieldNames"
                      :key="field"
                      class="pass-dot"
                      :class="{ 'is-done': isDone(field) }"
                    ></span>
                  </span>
                  <span class="pass-count">{{ filledCount }} of {{ fieldNames.length }}</span>
                  <span v-if="step === 'otp'" key="otp" class="pass-stamp is-otp">
                    <i class="bi bi-envelope-check"></i> Check email
                  </span>
                  <span v-else-if="passReady" key="ready" class="pass-stamp">
                    <i class="bi bi-check2-circle"></i> Ready
                  </span>
                </div>
              </div>
            </div>

            <p class="pass-note">
              <template v-if="step === 'otp'">Last step: type in the code we emailed you.</template>
              <template v-else-if="passReady">All set. Press Sign up to get your code.</template>
              <template v-else>
                Your pass fills in as you type. Finish all {{ fieldNames.length }} fields to get it
                stamped.
              </template>
            </p>
          </div>

          <div class="wave wave-x">
            <svg class="wave-back" viewBox="0 0 60 800" preserveAspectRatio="none">
              <path
                d="M0,0 L34,0 C34,40.5 58,49.5 58,90 C58,139.5 22,150.5 22,200 C22,245 52,255 52,300 C52,345 34,355 34,400 C34,440.5 58,449.5 58,490 C58,539.5 22,550.5 22,600 C22,645 52,655 52,700 C52,745 34,755 34,800 L0,800 Z"
              />
            </svg>
            <svg class="wave-front" viewBox="0 0 60 800" preserveAspectRatio="none">
              <path
                d="M0,0 L18,0 C18,49.5 50,60.5 50,110 C50,159.5 8,170.5 8,220 C8,260.5 36,269.5 36,310 C36,350.5 18,359.5 18,400 C18,449.5 50,460.5 50,510 C50,559.5 8,570.5 8,620 C8,660.5 36,669.5 36,710 C36,750.5 18,759.5 18,800 L0,800 Z"
              />
            </svg>
          </div>
          <div class="wave wave-y">
            <svg class="wave-back" viewBox="0 0 800 60" preserveAspectRatio="none">
              <path
                d="M0,0 L0,34 C40.5,34 49.5,58 90,58 C139.5,58 150.5,22 200,22 C245,22 255,52 300,52 C345,52 355,34 400,34 C440.5,34 449.5,58 490,58 C539.5,58 550.5,22 600,22 C645,22 655,52 700,52 C745,52 755,34 800,34 L800,0 Z"
              />
            </svg>
            <svg class="wave-front" viewBox="0 0 800 60" preserveAspectRatio="none">
              <path
                d="M0,0 L0,18 C49.5,18 60.5,50 110,50 C159.5,50 170.5,8 220,8 C260.5,8 269.5,36 310,36 C350.5,36 359.5,18 400,18 C449.5,18 460.5,50 510,50 C559.5,50 570.5,8 620,8 C660.5,8 669.5,36 710,36 C750.5,36 759.5,18 800,18 L800,0 Z"
              />
            </svg>
          </div>
        </aside>

        <div class="col-12 col-lg-7 reg-main">
          <div class="reg-main-inner">
            <h1 class="reg-title">Sign up to volunteer</h1>
            <p class="reg-sub">Create your Heartware Ops account.</p>

            <div class="reg-steps">
              <span class="reg-step" :class="step === 'form' ? 'is-current' : 'is-done'">
                <span class="reg-step-num">
                  <i v-if="step === 'otp'" class="bi bi-check-lg"></i>
                  <template v-else>1</template>
                </span>
                Your details
              </span>
              <span
                class="reg-step-line"
                :class="{ 'is-full': step === 'otp' || progress === 100 }"
                role="progressbar"
                aria-label="Form completion"
                :aria-valuenow="step === 'otp' ? 100 : progress"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span :style="{ width: (step === 'otp' ? 100 : progress) + '%' }"></span>
              </span>
              <span class="reg-step" :class="{ 'is-current': step === 'otp' }">
                <span class="reg-step-num">2</span>
                Verify email
              </span>
            </div>
            <div v-if="step === 'form'" class="reg-progress-text">
              <span>{{ filledCount }} of {{ fieldNames.length }} fields done</span>
              <span>{{ progress }}%</span>
            </div>

            <div v-if="step === 'otp'" class="reg-otp" data-testid="reg-otp">
              <div class="otp-intro">
                <span class="otp-icon" aria-hidden="true"
                  ><i class="bi bi-envelope-check"></i
                ></span>
                <div>
                  <h2 class="otp-title">Verify your email</h2>
                  <p class="text-muted-hw mb-0">
                    We emailed a 6-digit code to <strong class="text-break">{{ email }}</strong
                    >. If you can't see it, check your spam folder.
                  </p>
                </div>
              </div>

              <div v-if="otpNotice" class="alert alert-success py-2" role="status">
                {{ otpNotice }}
              </div>

              <div v-if="devCode" class="alert alert-info py-2 small" data-testid="reg-otp-dev">
                <i class="bi bi-tools me-1"></i>Test mode – no email sent. Your code is
                <strong data-testid="reg-otp-dev-code">{{ devCode }}</strong>
              </div>

              <form @submit.prevent="verifyAndCreate" novalidate>
                <label for="otpCode" class="form-label">Verification code</label>
                <div class="otp-boxes">
                  <span
                    v-for="(digit, i) in otpDigits"
                    :key="i"
                    class="otp-box"
                    :class="{
                      'is-filled': digit,
                      'is-active': otpFocused && i === Math.min(otpCode.length, 5),
                    }"
                    aria-hidden="true"
                    >{{ digit }}</span
                  >
                  <input
                    id="otpCode"
                    ref="otpInput"
                    v-model="otpCode"
                    type="text"
                    inputmode="numeric"
                    maxlength="6"
                    autocomplete="one-time-code"
                    class="otp-input"
                    data-testid="reg-otp-code"
                    @focus="otpFocused = true"
                    @blur="otpFocused = false"
                  />
                </div>
                <div class="form-text mb-3">The code expires after 10 minutes.</div>

                <button
                  type="submit"
                  class="btn btn-brand btn-lg w-100 tap-target reg-submit"
                  :disabled="loading"
                  data-testid="reg-otp-submit"
                >
                  <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                  {{ loading ? 'Creating account…' : 'Verify & create account' }}
                </button>
              </form>

              <div class="d-flex flex-wrap justify-content-between gap-2 mt-3">
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 link-brand"
                  @click="backToForm"
                  data-testid="reg-otp-back"
                >
                  <i class="bi bi-arrow-left me-1"></i>Change email
                </button>
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 link-brand"
                  :disabled="resendIn > 0 || sending"
                  @click="resend"
                  data-testid="reg-otp-resend"
                >
                  <i class="bi bi-arrow-clockwise me-1"></i
                  >{{ resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code' }}
                </button>
              </div>
            </div>

            <div v-else>

              <form @submit.prevent="register" novalidate>
                <fieldset class="reg-section">
                  <legend
                    class="reg-section-title"
                    :class="{ 'is-done': isDone('name') && isDone('email') && isDone('phone') }"
                  >
                    <span class="reg-section-icon"
                      ><i class="bi bi-person"></i><i class="bi bi-check-lg"></i
                    ></span>
                    About you
                  </legend>

                  <div class="mb-3">
                    <label for="name" class="form-label">Name</label>
                    <div class="field">
                      <i class="bi bi-person field-icon" aria-hidden="true"></i>
                      <input
                        id="name"
                        v-model="name"
                        type="text"
                        class="form-control form-control-lg"
                        :class="{ 'is-invalid': errors.name, 'is-valid': isOk('name') }"
                        @blur="touch('name')"
                        data-testid="reg-name"
                        autocomplete="name"
                      />
                      <div class="invalid-feedback">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.name }}
                      </div>
                    </div>
                  </div>

                  <div class="mb-3">
                    <label for="email" class="form-label">Email</label>
                    <div class="field">
                      <i class="bi bi-envelope field-icon" aria-hidden="true"></i>
                      <input
                        id="email"
                        v-model="email"
                        type="email"
                        class="form-control form-control-lg"
                        :class="{ 'is-invalid': errors.email, 'is-valid': isOk('email') }"
                        @blur="touch('email')"
                        data-testid="reg-email"
                        autocomplete="email"
                      />
                      <div class="invalid-feedback" data-testid="reg-email-error">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.email }}
                      </div>
                    </div>

                    <div v-if="domainSuggestions.length" class="d-flex flex-wrap gap-2 mt-2">
                      <button
                        v-for="domain in domainSuggestions"
                        :key="domain"
                        type="button"
                        class="btn btn-sm chip"
                        @mousedown.prevent
                        @click="pickDomain(domain)"
                      >
                        @{{ domain }}
                      </button>
                    </div>
                  </div>

                  <div class="mb-1">
                    <label for="phone" class="form-label">Phone number</label>
                    <div class="input-group input-group-lg has-validation">
                      <span class="input-group-text">+65</span>
                      <input
                        id="phone"
                        v-model="phone"
                        type="tel"
                        inputmode="numeric"
                        maxlength="8"
                        placeholder="91234567"
                        class="form-control"
                        :class="{ 'is-invalid': errors.phone, 'is-valid': isOk('phone') }"
                        @blur="touch('phone')"
                        data-testid="reg-phone"
                        autocomplete="tel-national"
                      />
                      <div class="invalid-feedback" data-testid="reg-phone-error">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.phone }}
                      </div>
                    </div>
                  </div>
                </fieldset>

                <fieldset class="reg-section">
                  <legend
                    class="reg-section-title"
                    :class="{ 'is-done': isDone('postalCode') && isDone('address') }"
                  >
                    <span class="reg-section-icon"
                      ><i class="bi bi-geo-alt"></i><i class="bi bi-check-lg"></i
                    ></span>
                    Where you live
                  </legend>

                  <div class="mb-3">
                    <label for="postalCode" class="form-label">Postal code</label>
                    <div class="field">
                      <i class="bi bi-mailbox field-icon" aria-hidden="true"></i>
                      <input
                        id="postalCode"
                        v-model="postalCode"
                        type="text"
                        inputmode="numeric"
                        maxlength="6"
                        placeholder="560123"
                        class="form-control form-control-lg"
                        :class="{ 'is-invalid': errors.postalCode, 'is-valid': isOk('postalCode') }"
                        @blur="touch('postalCode')"
                        autocomplete="postal-code"
                        data-testid="reg-postal"
                      />
                      <div class="invalid-feedback">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.postalCode }}
                      </div>
                    </div>

                    <div
                      v-if="postalStatus !== 'idle' && postalStatus !== 'notfound'"
                      class="postal-status"
                      :class="'is-' + postalStatus"
                      data-testid="reg-postal-preview"
                    >
                      <template v-if="postalStatus === 'loading'">
                        <span class="spinner-border spinner-border-sm"></span> Looking up address…
                      </template>
                      <template v-else-if="postalStatus === 'found'">
                        <i class="bi bi-geo-alt-fill"></i> Found: {{ postalPreview }}
                      </template>
                      <template v-else>
                        <i class="bi bi-wifi-off"></i> Our address service isn't responding right now, so we can't fill in your address. Please try again in a few minutes.
                        <button
                          type="button"
                          class="btn btn-link btn-sm p-0 align-baseline link-warning"
                          @click="retryPostal"
                        >
                          Try again
                        </button>
                      </template>
                    </div>
                  </div>

                  <div class="mb-1">
                    <label for="address" class="form-label">
                      Address <i class="bi bi-lock-fill label-lock" aria-hidden="true"></i>
                    </label>
                    <div class="field">
                      <i class="bi bi-house-door field-icon" aria-hidden="true"></i>
                      <input
                        id="address"
                        :value="address"
                        type="text"
                        readonly
                        placeholder="Fills in from your postal code"
                        class="form-control form-control-lg address-locked"
                        :class="{ 'is-invalid': errors.address, 'is-valid': isOk('address') }"
                        aria-describedby="address-help"
                        data-testid="reg-address"
                        autocomplete="off"
                      />
                      <span
                        v-if="address"
                        :key="address"
                        class="addr-shine"
                        aria-hidden="true"
                      ></span>
                      <div class="invalid-feedback">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.address }}
                      </div>
                    </div>
                    <div id="address-help" class="form-text">
                      To change it, change your postal code.
                    </div>
                  </div>
                </fieldset>

                <fieldset class="reg-section">
                  <legend
                    class="reg-section-title"
                    :class="{ 'is-done': isDone('password') && isDone('confirmPassword') }"
                  >
                    <span class="reg-section-icon"
                      ><i class="bi bi-key"></i><i class="bi bi-check-lg"></i
                    ></span>
                    Your password
                  </legend>

                  <div class="mb-3">
                    <label for="password" class="form-label">Password</label>
                    <div class="input-group input-group-lg has-validation">
                      <input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        class="form-control"
                        :class="{ 'is-invalid': errors.password, 'is-valid': isOk('password') }"
                        @blur="touch('password')"
                        data-testid="reg-password"
                        autocomplete="new-password"
                      />
                      <button
                        type="button"
                        class="btn btn-eye rounded-end"
                        :aria-label="showPassword ? 'Hide password' : 'Show password'"
                        @click="showPassword = !showPassword"
                      >
                        <i class="bi" :class="showPassword ? 'bi-eye' : 'bi-eye-slash'"></i>
                      </button>
                      <div class="invalid-feedback" data-testid="reg-password-error">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.password }}
                      </div>
                    </div>

                    <div
                      v-if="password"
                      class="strength"
                      :class="'lvl-' + passwordStrength"
                      aria-hidden="true"
                    >
                      <span class="strength-bar">
                        <span
                          v-for="n in passwordRules.length"
                          :key="n"
                          :class="{ on: n <= passwordStrength }"
                        ></span>
                      </span>
                      <span class="strength-label">{{ strengthLabel }}</span>
                    </div>

                    <ul class="rules list-unstyled" data-testid="reg-password-rules">
                      <li
                        v-for="check in passwordChecks"
                        :key="check.label"
                        :class="{ 'is-met': check.met }"
                      >
                        <i class="bi" :class="check.met ? 'bi-check-circle-fill' : 'bi-circle'"></i>
                        {{ check.label }}
                      </li>
                    </ul>
                  </div>

                  <div class="mb-1">
                    <label for="confirmPassword" class="form-label">Confirm password</label>
                    <div class="input-group input-group-lg has-validation">
                      <input
                        id="confirmPassword"
                        v-model="confirmPassword"
                        :type="showConfirmPassword ? 'text' : 'password'"
                        class="form-control"
                        :class="{
                          'is-invalid': errors.confirmPassword,
                          'is-valid': isOk('confirmPassword'),
                        }"
                        @blur="touch('confirmPassword')"
                        data-testid="reg-confirm-password"
                        autocomplete="new-password"
                      />
                      <button
                        type="button"
                        class="btn btn-eye rounded-end"
                        :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
                        @click="showConfirmPassword = !showConfirmPassword"
                      >
                        <i class="bi" :class="showConfirmPassword ? 'bi-eye' : 'bi-eye-slash'"></i>
                      </button>
                      <div class="invalid-feedback" data-testid="reg-confirm-password-error">
                        <i class="bi bi-x-circle-fill"></i> {{ errors.confirmPassword }}
                      </div>
                      <div class="valid-feedback">
                        <i class="bi bi-check-circle-fill"></i> Passwords match
                      </div>
                    </div>
                  </div>
                </fieldset>

                <label class="consent-card" :class="{ 'is-on': consent }">
                  <span class="consent-icon" aria-hidden="true"
                    ><i class="bi bi-broadcast"></i
                  ></span>
                  <span class="consent-text">
                    <span class="consent-title">Location Sharing</span>
                    <span class="consent-desc">
                      I agree that Heartware Ops can collect my device's location for live
                      monitoring.
                    </span>
                  </span>
                  <span class="form-check form-switch consent-switch">
                    <input
                      id="locationConsent"
                      v-model="consent"
                      type="checkbox"
                      role="switch"
                      class="form-check-input"
                      data-testid="reg-consent"
                    />
                  </span>
                </label>

                <button
                  type="submit"
                  class="btn btn-brand btn-lg w-100 mt-4 tap-target reg-submit"
                  :class="{ 'is-ready': canSubmit }"
                  :disabled="!canSubmit"
                  data-testid="reg-submit"
                >
                  <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                  {{ loading ? 'Sending code…' : 'Sign up' }}
                </button>

                <p
                  v-if="!canSubmit && !loading"
                  class="small text-muted-hw text-center mt-2 mb-0"
                  data-testid="reg-submit-hint"
                >
                  <template v-if="postalStatus === 'loading'">Checking your postal code…</template>
                  <template v-else-if="fieldsLeft === 0 && !consent"
                    >Turn on location sharing to sign up.</template
                  >
                  <template v-else>
                    Complete {{ fieldsLeft }} more {{ fieldsLeft === 1 ? 'field' : 'fields' }} to
                    sign up.
                  </template>
                </p>
              </form>
            </div>

            <p class="text-center text-muted-hw mt-4 mb-0">
              Already have an account?
              <RouterLink to="/login" class="link-brand fw-semibold">Log in</RouterLink>
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="notice-host">
      <MapNotice :notice="notice" @close="dismissNotice" />
    </div>
  </div>
</template>

<style scoped>
/* Styles for the form, the checklist, the code boxes and the pass. */

.reg-wrap {
  padding-bottom: 1.5rem;
}

.reg-card {
  --wave: 30px;
  --panel: var(--hw-red);
  --panel-soft: rgb(255 45 65 / 0.5);
  --ease: cubic-bezier(0.76, 0, 0.24, 1);
  --bounce: cubic-bezier(0.3, 1.6, 0.5, 1);
  --field-bg: rgb(140 155 190 / 0.1);
  --field-border: rgb(140 155 190 / 0.22);
  --bs-border-radius-lg: 0.9rem;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  overflow: clip;
  max-width: var(--hw-content-w);
  margin-inline: auto;
  border-radius: 1.25rem;
  box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.75);
}

.reg-panel {
  position: relative;
  z-index: 1;
  background: var(--panel);
  color: #fff;
}
.reg-panel-deco {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.reg-panel-deco::before {
  content: '';
  position: absolute;
  width: 340px;
  aspect-ratio: 1;
  left: 0;
  bottom: 0;
  transform: translate(-45%, 45%);
  border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 0 0 40px rgb(255 255 255 / 0.03);
}
.reg-panel-inner {
  position: relative;
  padding: 1.1rem 1rem 1.2rem;
}

.pass-holder {
  position: relative;
  width: 100%;
  max-width: 340px;
  margin-inline: auto;
}
.lanyard {
  display: none;
}
.pass {
  position: relative;
  background: #fff;
  color: #1f2430;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 22px 44px -18px rgb(70 0 12 / 0.65);
}
.pass.is-ready {
  animation: thunk 0.45s var(--bounce) 0.2s;
}
.pass-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  background: #14213d;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}
.pass-slot {
  display: none;
}
.pass-brand i {
  color: #ff4d5e;
}
.pass-kind {
  font-weight: 600;
  opacity: 0.75;
}
.pass-person {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem 0.9rem 0.6rem;
}
.pass-avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.9rem;
  height: 2.9rem;
  border-radius: 50%;
  background: #ffe9ec;
  color: var(--hw-red);
  font-weight: 800;
  font-size: 1.05rem;
  transition:
    background-color 0.25s ease,
    color 0.25s ease;
}
.pass-avatar.has-initials {
  background: var(--hw-red);
  color: #fff;
  animation: pop 0.35s var(--bounce);
}
.pass-who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pass-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
  color: #14213d;
}
.pass-name.is-empty {
  color: #a2a9b6;
  font-weight: 700;
}
.pass-role {
  font-size: 0.78rem;
  color: #6b7280;
}

.pass-rows {
  display: none;
  margin: 0;
  padding: 0.1rem 0.9rem 0.4rem;
}
.pass-row {
  display: grid;
  grid-template-columns: 5.4rem 1fr auto;
  align-items: start;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-top: 1px dashed #e3e6ee;
  font-size: 0.85rem;
}
.pass-row dt {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-weight: 600;
  color: #6b7280;
  transition: color 0.2s ease;
}
.pass-row dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: #1f2430;
}
.pass-row.is-done dt {
  color: #1f2430;
}
.pass-sub {
  display: block;
  font-size: 0.78rem;
  color: #6b7280;
}
.pass-drop-in {
  display: block;
  animation: drop-in 0.5s var(--bounce);
}
.pass-tick {
  color: var(--hw-success);
  opacity: 0;
  transform: scale(0.3);
  transition:
    opacity 0.2s ease,
    transform 0.35s var(--bounce);
}
.pass-row.is-done .pass-tick {
  opacity: 1;
  transform: none;
}

.pass-foot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.6rem;
  padding: 0.55rem 0.9rem;
  background: #f6f7fb;
  border-top: 1px solid #e9ecf2;
}
.pass-dots {
  display: flex;
  gap: 0.35rem;
}
.pass-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 2px solid #cfd5df;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}
.pass-dot.is-done {
  background: var(--hw-success);
  border-color: var(--hw-success);
  animation: pop 0.35s var(--bounce);
}
.pass-count {
  font-size: 0.8rem;
  font-weight: 700;
  color: #6b7280;
}
.pass.is-ready .pass-count,
.pass.is-otp .pass-count {
  visibility: hidden;
}
.pass-stamp {
  --rot: -6deg;
  position: absolute;
  right: 0.7rem;
  top: 50%;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.5rem;
  border: 2px solid var(--hw-success);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.9);
  color: var(--hw-success);
  font-size: 0.85rem;
  font-weight: 800;
  pointer-events: none;
  transform: translateY(-50%) rotate(var(--rot));
  animation: stamp 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
}
.pass-stamp.is-otp {
  border-color: #14213d;
  color: #14213d;
}
.pass-note {
  display: none;
}

.wave {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}
.wave svg {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}
.wave .wave-front {
  fill: var(--panel);
}
.wave .wave-back {
  fill: var(--panel-soft);
}
.wave-x {
  display: none;
}
.wave-y {
  left: 0;
  right: 0;
  top: 100%;
  height: var(--wave);
}
.wave-y svg {
  width: 200%;
  height: 100%;
  animation: flow-x 9s linear infinite;
}
.wave-y .wave-back {
  animation-duration: 14s;
  animation-direction: reverse;
}

.reg-main {
  position: relative;
  z-index: 0;
}
.reg-main-inner {
  max-width: 500px;
  margin-inline: auto;
  padding: calc(1.5rem + var(--wave)) 1.25rem 2rem;
}
.reg-title {
  margin-bottom: 0.35rem;
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: var(--hw-heading);
}
.reg-sub {
  margin-bottom: 1.5rem;
  color: var(--hw-muted);
}

.reg-steps {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.reg-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--hw-muted);
}
.reg-step-num {
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  border: 2px solid rgb(140 155 190 / 0.35);
  font-size: 0.85rem;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}
.reg-step.is-current {
  color: var(--hw-text);
}
.reg-step.is-current .reg-step-num {
  border-color: var(--hw-red);
  background: var(--hw-red);
  color: #fff;
  box-shadow: 0 0 0 4px rgb(214 0 28 / 0.2);
}
.reg-step.is-done .reg-step-num {
  border-color: var(--hw-success);
  background: var(--hw-success);
  color: #fff;
}
.reg-step-line {
  flex: 1;
  height: 6px;
  border-radius: 99px;
  background: rgb(140 155 190 / 0.18);
  overflow: hidden;
}
.reg-step-line > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--hw-red);
  transition:
    width 0.5s var(--ease),
    background-color 0.3s ease;
}
.reg-step-line.is-full > span {
  background: var(--hw-success);
}
.reg-progress-text {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1.75rem;
  font-size: 0.85rem;
  color: var(--hw-muted);
}

.reg-section {
  min-width: 0;
  margin: 0 0 1.75rem;
  padding: 0;
  border: 0;
}
.reg-section-title {
  float: none;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: auto;
  margin-bottom: 0.9rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.reg-section-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.6rem;
  background: rgb(214 0 28 / 0.15);
  color: var(--hw-landing-accent);
  font-size: 0.95rem;
  transition: background-color 0.3s ease;
}
.reg-section-icon > i {
  grid-area: 1 / 1;
  transition:
    opacity 0.2s ease,
    transform 0.35s var(--bounce);
}
.reg-section-icon > i + i {
  opacity: 0;
  transform: scale(0.3);
}
.reg-section-title.is-done .reg-section-icon {
  background: rgb(26 127 75 / 0.22);
  color: var(--bs-success-text-emphasis);
}
.reg-section-title.is-done .reg-section-icon > i:first-child {
  opacity: 0;
  transform: scale(0.3);
}
.reg-section-title.is-done .reg-section-icon > i + i {
  opacity: 1;
  transform: none;
}

.form-label {
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
}
.reg-main .form-control,
.reg-main .input-group-text {
  background-color: var(--field-bg);
  border-color: var(--field-border);
  color: var(--hw-text);
}
.reg-main .form-control-lg,
.reg-main .input-group-lg > .form-control,
.reg-main .input-group-lg > .input-group-text {
  padding-block: 0.8rem;
  font-size: 1.05rem;
}
.reg-main .input-group-text {
  background-color: rgb(140 155 190 / 0.16);
  font-weight: 600;
}
.form-control:focus:not(.is-valid):not(.is-invalid) {
  border-color: var(--hw-red);
  box-shadow: 0 0 0 0.2rem rgb(214 0 28 / 0.15);
}
.field {
  position: relative;
}
.field > .form-control {
  padding-left: 2.8rem;
}
.field-icon {
  position: absolute;
  top: 1.65rem;
  left: 1rem;
  z-index: 5;
  transform: translateY(-50%);
  color: var(--hw-muted);
  pointer-events: none;
  transition: color 0.2s ease;
}
.field:focus-within .field-icon {
  color: var(--hw-landing-accent);
}
.field:has(.is-valid) .field-icon {
  color: var(--bs-success-text-emphasis);
}
.field:has(.is-invalid) .field-icon {
  color: var(--bs-danger-text-emphasis);
}

.chip {
  border: 1px solid var(--field-border);
  border-radius: 99px;
  background: var(--field-bg);
  color: var(--hw-text);
  font-weight: 500;
}
.chip:hover,
.chip:focus-visible {
  border-color: var(--hw-red);
  background: rgb(214 0 28 / 0.22);
  color: #fff;
}

.postal-status {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.55rem;
  padding: 0.3rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.85rem;
  animation: fade-up 0.3s ease;
}
.postal-status.is-loading {
  background: rgb(140 155 190 / 0.12);
  color: var(--hw-muted);
}
.postal-status.is-found {
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}
.postal-status.is-error {
  background: var(--bs-warning-bg-subtle);
  color: var(--bs-warning-text-emphasis);
}

.label-lock {
  margin-left: 0.2rem;
  font-size: 0.8rem;
  color: var(--hw-muted);
}
.address-locked {
  border-style: dashed;
  cursor: not-allowed;
}
.address-locked.is-valid {
  border-style: solid;
}
.reg-main .address-locked {
  background-color: rgb(140 155 190 / 0.05);
}
.addr-shine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3.3rem;
  border-radius: var(--bs-border-radius-lg);
  background: linear-gradient(100deg, transparent 30%, rgb(117 183 152 / 0.35) 50%, transparent 70%)
    no-repeat;
  background-size: 250% 100%;
  pointer-events: none;
  animation: shine 0.9s ease-out forwards;
}

.btn-eye {
  border: 1px solid var(--field-border);
  background: var(--field-bg);
  color: var(--hw-muted);
}
.btn-eye:hover,
.btn-eye:focus-visible {
  background: rgb(140 155 190 / 0.2);
  color: var(--hw-text);
}
.btn-eye.rounded-end {
  border-top-right-radius: var(--bs-border-radius-lg) !important;
  border-bottom-right-radius: var(--bs-border-radius-lg) !important;
}

.strength {
  --lvl: var(--hw-danger);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.6rem;
}
.strength.lvl-3 {
  --lvl: var(--hw-warning);
}
.strength.lvl-4 {
  --lvl: #9bbf3a;
}
.strength.lvl-5 {
  --lvl: var(--hw-success);
}
.strength-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  flex: 1;
  gap: 4px;
}
.strength-bar > span {
  height: 5px;
  border-radius: 99px;
  background: rgb(140 155 190 / 0.2);
  transition: background-color 0.3s ease;
}
.strength-bar > span.on {
  background: var(--lvl);
}
.strength-label {
  min-width: 6.5rem;
  text-align: right;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--lvl);
}

.rules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.3rem 1rem;
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
}
.rules li {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  color: var(--hw-muted);
  transition: color 0.2s ease;
}
.rules li > i {
  margin-top: 0.05rem;
}
.rules li.is-met {
  color: var(--bs-success-text-emphasis);
}
.rules li.is-met > i {
  animation: pop 0.35s var(--bounce);
}

.consent-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid var(--field-border);
  border-radius: 1rem;
  background: rgb(140 155 190 / 0.06);
  cursor: pointer;
  transition:
    border-color 0.25s ease,
    background-color 0.25s ease;
}
.consent-card.is-on {
  border-color: rgb(117 183 152 / 0.6);
  background: rgb(26 127 75 / 0.12);
}
.consent-card:focus-within {
  border-color: var(--hw-red);
}
.consent-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: rgb(214 0 28 / 0.15);
  color: var(--hw-landing-accent);
  transition:
    background-color 0.25s ease,
    color 0.25s ease;
}
.consent-card.is-on .consent-icon {
  background: rgb(26 127 75 / 0.22);
  color: var(--bs-success-text-emphasis);
}
.consent-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.consent-title {
  font-weight: 700;
  color: var(--hw-text);
}
.consent-desc {
  font-size: 0.82rem;
  color: var(--hw-muted);
}
.consent-switch {
  flex: none;
  margin: 0;
  font-size: 1.3rem;
}
.consent-switch .form-check-input {
  cursor: pointer;
}
.consent-switch .form-check-input:checked {
  background-color: var(--hw-success);
  border-color: var(--hw-success);
}

.reg-submit {
  --bs-btn-disabled-bg: rgb(140 155 190 / 0.18);
  --bs-btn-disabled-border-color: transparent;
  --bs-btn-disabled-color: var(--hw-muted);
  --bs-btn-disabled-opacity: 1;
  border-radius: 50rem;
  font-weight: 600;
}
.reg-submit:not(:disabled) {
  box-shadow: 0 12px 26px -12px rgb(214 0 28 / 0.8);
}
.reg-submit.is-ready {
  animation: ready-glow 1.1s ease-out;
}

.reg-otp {
  margin-top: 1.75rem;
}
.otp-intro {
  display: flex;
  gap: 0.9rem;
  margin-bottom: 1.25rem;
}
.otp-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: rgb(214 0 28 / 0.15);
  color: var(--hw-landing-accent);
  font-size: 1.3rem;
}
.otp-title {
  margin-bottom: 0.25rem;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.otp-boxes {
  position: relative;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5rem;
}
.otp-box {
  display: grid;
  place-items: center;
  height: 3.6rem;
  border: 1.5px solid rgb(140 155 190 / 0.3);
  border-radius: 0.9rem;
  background: var(--field-bg);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--hw-text);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.otp-box.is-filled {
  border-color: rgb(140 155 190 / 0.6);
  animation: pop 0.25s var(--bounce);
}
.otp-box.is-active {
  border-color: var(--hw-red);
  box-shadow: 0 0 0 0.2rem rgb(214 0 28 / 0.2);
}
.otp-box.is-active:empty::after {
  content: '';
  width: 2px;
  height: 1.6rem;
  background: var(--hw-text);
  animation: blink 1s step-end infinite;
}
.otp-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  opacity: 0;
  font-size: 16px;
  cursor: text;
}

.link-brand {
  color: var(--hw-landing-accent);
  text-decoration: none;
}
.link-brand:hover {
  color: var(--hw-red);
  text-decoration: underline;
}

@media (min-width: 992px) {
  .reg-card {
    --wave: 48px;
  }
  .reg-panel-inner {
    position: sticky;
    top: 4.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5.5rem 2.5rem 3rem;
  }
  .pass-holder {
    animation: pass-drop 1.1s var(--ease) both;
    transform-origin: 50% -60px;
  }
  .lanyard {
    display: block;
    position: absolute;
    left: 50%;
    bottom: calc(100% - 8px);
    width: 30px;
    height: 100vh;
    transform: translateX(-50%);
    background: linear-gradient(90deg, #8f0013, #b40019 50%, #8f0013);
    border-inline: 1px dashed rgb(255 255 255 / 0.35);
  }
  .lanyard::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -6px;
    width: 46px;
    height: 18px;
    transform: translateX(-50%);
    border-radius: 6px;
    background: linear-gradient(#eef0f4, #b9c0cc);
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.3);
  }
  .pass-head {
    padding-top: 1.4rem;
  }
  .pass-slot {
    display: block;
    position: absolute;
    top: 0.45rem;
    left: 50%;
    width: 46px;
    height: 8px;
    margin-left: -23px;
    border-radius: 6px;
    background: rgb(255 255 255 / 0.22);
  }
  .pass-person {
    padding: 1rem 1.1rem 0.7rem;
  }
  .pass-avatar {
    width: 3.4rem;
    height: 3.4rem;
    font-size: 1.2rem;
  }
  .pass-name {
    font-size: 1.3rem;
  }
  .pass-rows {
    display: block;
    padding-inline: 1.1rem;
  }
  .pass-foot {
    padding-inline: 1.1rem;
  }
  .pass-stamp {
    --rot: -9deg;
    padding: 0.2rem 0.65rem;
    border-width: 3px;
    font-size: 1.05rem;
  }
  .pass-note {
    display: block;
    max-width: 30ch;
    margin: 1.5rem auto 0;
    text-align: center;
    font-weight: 500;
    color: rgb(255 255 255 / 0.9);
  }

  .wave-y {
    display: none;
  }
  .wave-x {
    display: block;
    top: 0;
    bottom: 0;
    left: 100%;
    width: var(--wave);
  }
  .wave-x svg {
    width: 100%;
    height: 200%;
    animation: flow-y 10s linear infinite;
  }
  .wave-x .wave-back {
    animation-duration: 15s;
    animation-direction: reverse;
  }

  .reg-main-inner {
    padding: 3rem 2.75rem 3rem calc(2.25rem + var(--wave));
  }
}

@keyframes pop {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes stamp {
  0% {
    opacity: 0;
    transform: translateY(-50%) rotate(var(--rot)) scale(2.2);
  }
  60% {
    opacity: 1;
    transform: translateY(-50%) rotate(var(--rot)) scale(0.92);
  }
  100% {
    opacity: 1;
    transform: translateY(-50%) rotate(var(--rot)) scale(1);
  }
}
@keyframes thunk {
  0%,
  100% {
    transform: none;
  }
  40% {
    transform: scale(0.97);
  }
}
@keyframes pass-drop {
  0% {
    opacity: 0;
    transform: translateY(-40px) rotate(-6deg);
  }
  55% {
    opacity: 1;
    transform: translateY(0) rotate(3deg);
  }
  78% {
    transform: rotate(-1.2deg);
  }
  100% {
    transform: none;
  }
}
@keyframes drop-in {
  0% {
    opacity: 0;
    transform: translateY(-8px);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
@keyframes fade-up {
  0% {
    opacity: 0;
    transform: translateY(4px);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
@keyframes shine {
  0% {
    background-position: 120% 0;
    opacity: 1;
  }
  100% {
    background-position: -40% 0;
    opacity: 0;
  }
}
@keyframes ready-glow {
  0% {
    box-shadow: 0 0 0 0 rgb(214 0 28 / 0.6);
  }
  100% {
    box-shadow: 0 0 0 14px rgb(214 0 28 / 0);
  }
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
@keyframes flow-x {
  to {
    transform: translateX(-50%);
  }
}
@keyframes flow-y {
  to {
    transform: translateY(-50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reg-card *,
  .reg-card *::before,
  .reg-card *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}

.notice-host {
  --notice-top: 72px;
  position: fixed;
  inset: 0;
  z-index: 1150;
  pointer-events: none;
}
.notice-host :deep(.notice-wrap) {
  left: 12px;
  right: 12px;
  justify-content: center;
}
</style>
