<!-- The root component of the whole website: it holds the navbar and the page area where each page
     appears. -->

<script setup>
// Works out whether the guest landing page (home, not logged in) is showing, because that page uses
// the full screen width.

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import AppNavbar from '@/components/common/AppNavbar.vue'

const route = useRoute()
const auth = useAuthStore()

// isLanding: true only for a guest on the Home route. The landing page is full-width, so it must not
// be wrapped in Bootstrap's centred container.
const isLanding = computed(() => route.name === 'home' && !auth.isLoggedIn)
</script>

<template>
  <!-- The page frame: the top navbar, then the router-view; the guest landing page is drawn full
       width, every other page inside a Bootstrap container. -->
  <AppNavbar />
  <main class="app-main">
    <RouterView v-if="isLanding" />
    <div v-else class="container py-4">
      <RouterView />
    </div>
  </main>
</template>
