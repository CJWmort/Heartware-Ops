<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const isDev = import.meta.env.DEV

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(route.query.redirect || '/')
  } catch (err) {
    error.value = err.friendlyMessage || 'Login failed'
  } finally {
    loading.value = false
  }
}

// DEVELOPMENT ONLY – lets teammates open their pages before real login is finished.
function devLogin(role) {
  auth.devLoginAs(role)
  router.push(route.query.redirect || '/')
}
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <div class="card card-hw">
        <div class="card-body p-4">
          <h1 class="h4 mb-3">Log in</h1>

          <div v-if="error" class="alert alert-danger py-2" role="alert" data-testid="login-error">
            {{ error }}
          </div>

          <form novalidate @submit.prevent="submit">
            <div class="mb-3">
              <label for="email" class="form-label">Email</label>
              <input id="email" v-model.trim="email" type="email" class="form-control"
                autocomplete="email" required data-testid="login-email" />
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Password</label>
              <input id="password" v-model="password" type="password" class="form-control"
                autocomplete="current-password" required data-testid="login-password" />
            </div>
            <button type="submit" class="btn btn-brand w-100" :disabled="loading" data-testid="login-submit">
              <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              Log in
            </button>
          </form>

          <p class="small text-center mt-3 mb-0">
            New volunteer? <RouterLink to="/register">Sign up here</RouterLink>
          </p>
        </div>
      </div>

      <!-- Only visible in `npm run dev`; never in the deployed build -->
      <div v-if="isDev" class="card card-hw mt-3 border border-info" data-testid="dev-login">
        <div class="card-body small">
          <p class="fw-semibold mb-2"><i class="bi bi-tools me-1"></i>Dev shortcut (no server needed)</p>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-outline-info btn-sm" data-testid="dev-login-volunteer" @click="devLogin('volunteer')">Volunteer</button>
            <button class="btn btn-outline-info btn-sm" data-testid="dev-login-coordinator" @click="devLogin('coordinator')">Coordinator</button>
            <button class="btn btn-outline-info btn-sm" data-testid="dev-login-hq" @click="devLogin('hq')">HQ</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
