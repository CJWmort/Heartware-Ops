import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // In development, calls to /api and /socket.io are forwarded to the Express server.
    // This means no CORS problems locally and the same code works when deployed.
    proxy: {
      '/api': 'http://localhost:8000',
      '/socket.io': { target: 'http://localhost:8000', ws: true },
    },
  },
  // Vitest (unit tests) settings
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.spec.js'],
  },
})
