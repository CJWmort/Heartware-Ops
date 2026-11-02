<!-- The page shown for any unknown address (404). -->

<script setup>
// Reads who is logged in so the "Back to home" button goes to the right start page for their role.

import { useAuthStore } from '@/services/auth'
import { landingFor } from '@/router/landing'

const auth = useAuthStore()
</script>

<template>
  <!-- A short message with a link back home. -->
  <div class="text-center py-5" data-testid="not-found">
    <p class="display-4 fw-bold text-danger mb-0">404</p>
    <h1 class="h4">We couldn't find that page</h1>
    <RouterLink :to="landingFor(auth.role)" class="btn btn-brand mt-3">Back to home</RouterLink>
  </div>
</template>
