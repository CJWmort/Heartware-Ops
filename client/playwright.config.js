import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E tests – one spec file per feature in ./e2e
 * Before running: start the SERVER yourself (cd server && npm run dev) and seed demo data.
 * Playwright starts the Vue dev server for you.
 * Docs: https://playwright.dev/docs/intro
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Our tests share one database, so run them one at a time to keep them repeatable.
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },

  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    // Smallest screen the graders test (iPhone 6 = 375 x 667)
    {
      name: 'iphone-6',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true },
    },
  ],

  webServer: {
    command: process.env.CI ? 'npm run preview' : 'npm run dev',
    port: process.env.CI ? 4173 : 5173,
    reuseExistingServer: !process.env.CI,
  },
})
