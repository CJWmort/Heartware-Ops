<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { NAV_LINKS } from '@/router/nav-links'

const auth = useAuthStore()
const router = useRouter()

const links = computed(() => NAV_LINKS[auth.role] ?? [])

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark app-navbar" data-testid="navbar">
    <div class="container">
      <RouterLink class="navbar-brand fw-semibold d-flex align-items-center gap-2" to="/">
        <i class="bi bi-heart-fill text-danger" aria-hidden="true"></i>
        Heartware Ops
      </RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#mainNav"
        aria-controls="mainNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
        data-testid="nav-toggle"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div id="mainNav" class="collapse navbar-collapse">
        <ul class="navbar-nav me-auto">
          <li v-for="link in links" :key="link.to" class="nav-item">
            <RouterLink class="nav-link" :to="link.to" :data-testid="link.testid">
              <i :class="['bi', link.icon, 'me-1']" aria-hidden="true"></i>{{ link.label }}
            </RouterLink>
          </li>
        </ul>

        <div class="d-flex align-items-center gap-2">
          <template v-if="auth.isLoggedIn">
            <span class="navbar-text small" data-testid="nav-user-name">
              {{ auth.user.name }} <span class="badge text-bg-light ms-1">{{ auth.role }}</span>
            </span>
            <button class="btn btn-outline-light btn-sm" data-testid="nav-logout" @click="logout">
              Log out
            </button>
          </template>
          <template v-else>
            <RouterLink class="btn btn-outline-light btn-sm" to="/login" data-testid="nav-login">
              Log in
            </RouterLink>
            <RouterLink class="btn btn-brand btn-sm" to="/register" data-testid="nav-register">
              Volunteer sign-up
            </RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.app-navbar {
  background: var(--hw-navy);
}
.nav-link.router-link-active {
  color: #fff;
  font-weight: 600;
}
</style>
