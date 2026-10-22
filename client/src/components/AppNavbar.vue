<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import { NAV_LINKS } from '@/router/nav-links'

const auth = useAuthStore()
const router = useRouter()

const links = computed(() => NAV_LINKS[auth.role] ?? [])

const menu = ref(null) // the collapsible menu element
const toggler = ref(null) // the burger button

// Close the mobile menu by clicking the burger, but only if the menu is open
function closeMenu() {
  if (menu.value?.classList.contains('show')) toggler.value?.click()
}

// Close the menu when any link or button inside it is clicked
function onMenuClick(e) {
  if (e.target.closest('a, button')) closeMenu()
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark sticky-top app-navbar" data-testid="navbar">
    <div class="container">
      <RouterLink
        class="navbar-brand fw-semibold d-flex align-items-center gap-2"
        to="/"
        @click="closeMenu"
      >
        <i class="bi bi-heart-fill text-danger" aria-hidden="true"></i>
        Heartware Ops
      </RouterLink>

      <button
        ref="toggler"
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

      <div id="mainNav" ref="menu" class="collapse navbar-collapse" @click="onMenuClick">
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
              Log Out
            </button>
          </template>
          <template v-else>
            <RouterLink class="btn btn-outline-light btn-sm" to="/login" data-testid="nav-login">
              Log In
            </RouterLink>
            <RouterLink class="btn btn-brand btn-sm" to="/register" data-testid="nav-register">
              Sign-up
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
  z-index: 1200;
}
.nav-link.router-link-active {
  color: #fff;
  font-weight: 600;
}

/* Below lg the menu is collapsed: overlap navlinks over the page */
@media (max-width: 991.98px) {
  .navbar-collapse {
    position: absolute;
    top: 100%; /* directly under the navbar */
    left: 0;
    right: 0;
    padding: 0.75rem 1rem 1rem;
    background: var(--hw-navy);
    box-shadow: 0 6px 12px rgb(0 0 0 / 0.25);
  }
}
</style>
