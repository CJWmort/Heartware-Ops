<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import AppNavbar from '@/components/AppNavbar.vue'

const route = useRoute()
const auth = useAuthStore()

// NEW: the guest landing page is full-width, so it must NOT sit inside Bootstrap's centred .container.
// Every other page (and the logged-in home dashboard) keeps the container exactly as before.
const isLanding = computed(() => route.name === 'home' && !auth.isLoggedIn)
</script>

<template>
  <AppNavbar />
  <main class="app-main">
    <RouterView v-if="isLanding" />
    <div v-else class="container py-4">
      <RouterView />
    </div>
  </main>
  <!-- <footer class="app-footer text-center small py-3">
    IS216 G5T1 · Built for Heartware NDP Volunteers
  </footer> -->
</template>
