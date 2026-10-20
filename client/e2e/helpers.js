// Shared helpers for E2E tests.
// FIX: this file pointed at accounts from an old "seed:demo" script that no longer exists (coordinator@demo.sg etc.),
// so every login failed. It now uses the accounts our real seed scripts create:
//   cd server && pnpm run seed:volunteers   -> demo.volunteer001@demo.sg ... (password DemoPass123!)
//   cd server && ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm run seed:admin   -> the coordinator
// Tell the tests which admin you created by setting E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD before running Playwright.
import { expect } from '@playwright/test'

export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD || 'DemoPass123!'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'ChangeMe123!'

export const ACCOUNTS = {
  // the app's coordinator role is called "admin"; 'coordinator' and 'hq' stay as aliases because the spec files use those words
  admin: { email: process.env.E2E_ADMIN_EMAIL || 'admin@heartware.sg', password: ADMIN_PASSWORD },
  coordinator: { email: process.env.E2E_ADMIN_EMAIL || 'admin@heartware.sg', password: ADMIN_PASSWORD },
  hq: { email: process.env.E2E_ADMIN_EMAIL || 'admin@heartware.sg', password: ADMIN_PASSWORD },
  volunteer: { email: 'demo.volunteer001@demo.sg', password: DEMO_PASSWORD },
  volunteer2: { email: 'demo.volunteer002@demo.sg', password: DEMO_PASSWORD },
}

// A native confirm()/prompt() box (the admin board and incident queue use them) blocks Playwright unless it is answered.
// Call this once at the start of a test; "yes" to every confirm, and `promptText` for prompt() boxes.
export function acceptDialogs(page, promptText = 'E2E test note') {
  page.on('dialog', (dialog) => dialog.accept(dialog.type() === 'prompt' ? promptText : undefined))
}

// Logs in through the real login form. Usage: await loginAs(page, 'coordinator')
export async function loginAs(page, who) {
  await page.goto('/login')
  const account = ACCOUNTS[who]
  await page.getByTestId('login-email').fill(account.email)
  await page.getByTestId('login-password').fill(account.password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('dashboard')).toBeVisible()
}

export async function logout(page) {
  // On small screens the logout button is inside the collapsed menu
  const toggle = page.getByTestId('nav-toggle')
  if (await toggle.isVisible()) await toggle.click()
  await page.getByTestId('nav-logout').click()
}
