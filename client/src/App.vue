<script setup>
import AppNavbar from '@/components/AppNavbar.vue'
</script>

<template>
  <AppNavbar />
  <main class="app-main">
    <div class="container py-4">
      <RouterView />
    </div>
  </main>
  <footer class="app-footer text-center small py-3">
    IS216 G5T1 · Built for Heartware NDP volunteers
  </footer>
</template>
