<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/services/auth'
import { NAV_LINKS } from '@/router/nav-links'

const auth = useAuthStore()

// '??' logical operator that returns its right-hand side operand 
// when its left-hand side operand is null or undefined
const links = computed(() => NAV_LINKS[auth.role] ?? []) 

const features = [
  { icon: 'bi-person-plus', title: 'Smart allocation', text: 'Volunteers matched to schools, remote schools first.' },
  { icon: 'bi-megaphone', title: 'Open slots', text: 'Drop-outs become slots that nearby volunteers can claim.' },
  { icon: 'bi-broadcast', title: 'Live tracking', text: 'Every P5 group on one map, checkpoint by checkpoint.' },
  { icon: 'bi-bell', title: 'Incidents & alerts', text: 'One-tap reports and automatic missed-checkpoint alerts.' },
  { icon: 'bi-award', title: 'Badge Studio', text: 'Earn badges and design your own physical badge.' },
]

</script>

<template>
  <!-- Logged in: quick links for your role -->
  <section v-if="auth.isLoggedIn" data-testid="dashboard">
    <h1 class="h3 mb-1">Hi, {{ auth.user.name }}</h1>
    <p class="text-muted-hw mb-4">What would you like to do?</p>
    <div class="row g-3">
      <div v-for="link in links" :key="link.to" class="col-12 col-sm-6 col-lg-4">
        <RouterLink :to="link.to" class="card card-hw h-100 text-decoration-none text-reset">
          <div class="card-body d-flex align-items-center gap-3">
            <i :class="['bi', link.icon, 'fs-3 text-danger']" aria-hidden="true"></i>
            <span class="fw-semibold">{{ link.label }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- Guest: landing page -->
  <section v-else data-testid="landing">
    <div class="row align-items-center g-4 py-4">
      <div class="col-lg-7">
        <h1 class="display-6 fw-bold">Every P5 group, safely there and back.</h1>
        <p class="lead text-muted-hw">
          Heartware volunteers accompany Primary 5 students to the National Day NE Shows. This app
          allocates volunteers, fills drop-outs fast, and gives HQ a live picture on the day.
        </p>
        <div class="d-flex flex-wrap gap-2">
          <RouterLink to="/register" class="btn btn-brand btn-lg" data-testid="cta-register">
            Sign up to volunteer
          </RouterLink>
          <RouterLink to="/login" class="btn btn-outline-secondary btn-lg" data-testid="cta-login">
            Log in
          </RouterLink>
        </div>
      </div>
    </div>
    <div class="row g-3 mt-2">
      <div v-for="f in features" :key="f.title" class="col-12 col-sm-6 col-lg">
        <div class="card card-hw h-100">
          <div class="card-body">
            <i :class="['bi', f.icon, 'fs-3 text-danger']" aria-hidden="true"></i>
            <h2 class="h6 mt-2">{{ f.title }}</h2>
            <p class="small text-muted-hw mb-0">{{ f.text }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
