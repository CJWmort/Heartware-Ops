// The Vite build settings: the Vue plugin, the "@" shortcut for the src folder and the proxy that
// sends /api and socket calls to the server while developing.

import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// plugins - the Vue plugin always; Vue DevTools only for normal development, not when Playwright
// starts the dev server (PLAYWRIGHT=1, set in playwright.config.js), so its floating pill cannot
// cover buttons the end-to-end tests click.
export default defineConfig({
  plugins: [vue(), ...(process.env.PLAYWRIGHT ? [] : [vueDevTools()])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/socket.io': { target: 'http://localhost:8000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.spec.js'],
  },
})
