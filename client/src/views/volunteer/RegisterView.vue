<script setup>
// Feature 1a – Registration — owner: Kuah
// Spec: docs/FEATURES.md   ·   API calls: src/services/   ·   Tests: e2e/
import PageHeader from '@/components/PageHeader.vue'
import FeaturePlaceholder from '@/components/FeaturePlaceholder.vue'
import { ref, watch } from 'vue'
import axios from 'axios'

// TODO(Kuah): build this page, then delete FeaturePlaceholder below.
const todos = [
  'Multi-step form: details → available show dates → location consent → review',
  'Postal code: live OneMap preview "📍 Found: …" (services/onemap.js, debounced)',
  'Show dates as clickable chips (listEvents from services/volunteers.js)',
  'Block submit until consent is ticked; show a clear message why',
  'On submit: auth.register(payload) then go to /me/assignment',
  'data-testids: reg-name, reg-email, reg-password, reg-postal, reg-postal-preview, reg-date-<n>, reg-consent, reg-submit, reg-error',
]

const submitted = ref(false)
const name = ref('');
const email = ref('');
const phone = ref('');
const postalCode = ref('')
const address = ref('');
const password = ref('');
const confirmPassword = ref('');

const showPassword = ref(false)
const showConfirmPassword = ref(false)

const errors = ref({})
const serverError = ref('')
const loading = ref(false)

const phoneRegex = /^[689]\d{7}$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const rules = {
  name: () => (name.value.trim() ? '' : 'Enter your name.'),
  email: () => (emailRegex.test(email.value.trim()) ? '' : 'Enter a valid email address.'),
  address: () => (address.value.trim() ? '' : 'Enter your address.'),
  postalCode: () => (/^\d{6}$/.test(postalCode.value.trim()) ? '' : 'Enter a 6-digit postal code.'),
  phone: () =>
    phoneRegex.test(phone.value.replace(/\s+/g, ''))
      ? ''
      : 'Enter an 8-digit Singapore number starting with 6, 8 or 9.',
  password: () => (password.value.trim() ? '' : 'Password is required.'),
  confirmPassword: () =>
    confirmPassword.value === password.value ? '' : 'Passwords do not match.'
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

// Re-check a field every time it changes, but only after the first submit attempt
const fields = { name, email, address, postalCode, phone, password, confirmPassword }

Object.entries(fields).forEach(([field, source]) => {
  watch(source, () => {
    if (submitted.value) validateField(field)
  })
})

// Watch for any changes to any fields and update error message accordingly
watch([name, email, address, postalCode, phone, password, confirmPassword], () => {
  if (submitted.value) validate()
})

async function register() {
  serverError.value = ''
  submitted.value = true
  if (!validate()) return

  loading.value = true
  try {
    const body = {
      name: name.value.trim(),
      email: email.value.trim(),
      postalCode: postalCode.value.trim(),
      address: address.value.trim(),
      phone: phone.value.replace(/\s+/g, ''),
      password: password.value,
      role: "volunteer"
    }
    await axios.post('/api/users', body)

    console.log('Success! User created')
  } catch (error) {
    serverError.value = error.response?.data?.message || 'Could not create your account. Try again.'
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <section>
    <PageHeader title="Volunteer sign-up" icon="bi-person-plus" />
    <FeaturePlaceholder feature="Feature 1a – Registration" owner="Kuah" :todos="todos" />
    <!-- Suggested layout: step progress bar on top, one card per step, Back / Next buttons -->
  </section>

  <div class="container py-5">
  <div class="row justify-content-center">
    <div class="col-12 col-md-8 col-lg-5">
      <div class="card-hw p-4 p-md-5">
        <h1 class="h3 fw-bold mb-1" style="color: var(--hw-navy)">Sign up to volunteer</h1>
        <p class="text-muted-hw mb-4">Create your Heartware Ops account.</p>

        <div v-if="serverError" class="alert alert-danger py-2" role="alert">
          {{ serverError }}
        </div>

        <form @submit.prevent="register" novalidate>
          <div class="mb-3">
            <label for="name" class="form-label fw-semibold">Name</label>
            <input id="name" v-model="name" type="text"
                   class="form-control form-control-lg"
                   :class="{ 'is-invalid': errors.name }" autocomplete="name" />
            <div class="invalid-feedback">{{ errors.name }}</div>
          </div>

          <div class="mb-3">
            <label for="email" class="form-label fw-semibold">Email</label>
            <input id="email" v-model="email" type="email"
                   class="form-control form-control-lg"
                   :class="{ 'is-invalid': errors.email }" autocomplete="email" />
            <div class="invalid-feedback">{{ errors.email }}</div>
          </div>

          <div class="mb-3">
            <label for="phone" class="form-label fw-semibold">Phone number</label>
            <div class="input-group input-group-lg has-validation">
              <span class="input-group-text">+65</span>
              <input id="phone" v-model="phone" type="tel" inputmode="numeric"
                     maxlength="8" placeholder="91234567" class="form-control"
                     :class="{ 'is-invalid': errors.phone }" autocomplete="tel-national" />
              <div class="invalid-feedback">{{ errors.phone }}</div>
            </div>
          </div>

          <div class="mb-3">
            <label for="address" class="form-label fw-semibold">Address</label>
            <input id="address" v-model="address" type="text"
                   class="form-control form-control-lg"
                   :class="{ 'is-invalid': errors.address }" autocomplete="street-address" />
            <div class="invalid-feedback">{{ errors.address }}</div>
          </div>

          <div class="mb-3">
            <label for="postalCode" class="form-label fw-semibold">Postal code</label>
            <input id="postalCode" v-model="postalCode" type="text"
                  inputmode="numeric" maxlength="6" placeholder="560123"
                  class="form-control form-control-lg"
                  :class="{ 'is-invalid': errors.postalCode }"
                  autocomplete="postal-code" />
            <div class="invalid-feedback">{{ errors.postalCode }}</div>
          </div>

          <div class="row">
            <div class="mb-3">
              <label for="password" class="form-label fw-semibold">Password</label>
              <div class="input-group input-group-lg has-validation">
                <input id="password" v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      class="form-control"
                      :class="{ 'is-invalid': errors.password }"
                      autocomplete="new-password" />
                <button type="button" class="btn btn-outline-secondary"
                        :aria-label="showPassword ? 'Hide password' : 'Show password'"
                        @click="showPassword = !showPassword">
                  <i class="bi" :class="showPassword ? 'bi-eye' : 'bi-eye-slash'"></i>
                </button>
                <div class="invalid-feedback">{{ errors.password }}</div>
              </div>
            </div>

            <div class="mb-3">
              <label for="confirmPassword" class="form-label fw-semibold">Confirm password</label>
              <div class="input-group input-group-lg has-validation">
                <input id="confirmPassword" v-model="confirmPassword"
                      :type="showConfirmPassword ? 'text' : 'password'"
                      class="form-control"
                      :class="{ 'is-invalid': errors.confirmPassword }"
                      autocomplete="new-password" />
                <button type="button" class="btn btn-outline-secondary"
                        :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
                        @click="showConfirmPassword = !showConfirmPassword">
                  <i class="bi" :class="showConfirmPassword ? 'bi-eye' : 'bi-eye-slash'"></i>
                </button>
                <div class="invalid-feedback">{{ errors.confirmPassword }}</div>
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-brand btn-lg w-100 mt-2 tap-target" :disabled="loading">
            {{ loading ? 'Creating account…' : 'Sign up' }}
          </button>
        </form>

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
.form-control:focus {
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
</style>