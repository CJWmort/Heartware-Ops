// Shared helpers for the E2E tests (every feature file imports from here).
// The accounts come from our seed scripts:
//   cd server && pnpm run seed:volunteers   -> demo.volunteer001@demo.sg ... (password DemoPass123!)
//   cd server && ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm run seed:admin   -> the admin (coordinator)
// If you created a different admin, set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD before running Playwright.
import { expect } from '@playwright/test'

export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD || 'DemoPass123!'

export const ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@heartware.sg',
    password: process.env.E2E_ADMIN_PASSWORD || 'ChangeMe123!',
  },
  volunteer: { email: 'demo.volunteer001@demo.sg', password: DEMO_PASSWORD },
}

// Logs in through the real login form with ANY email + password.
// It waits until we have left /login instead of waiting for one particular page, so it keeps working
// wherever the app sends a user after login.
export async function loginWithCredentials(page, { email, password }) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).not.toHaveURL(/\/login/)
}
