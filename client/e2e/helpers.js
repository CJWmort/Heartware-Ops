// Shared helpers for E2E tests.
// Demo accounts come from `cd server && npm run seed:demo`.
import { expect } from '@playwright/test'

export const DEMO_PASSWORD = 'Password123!'

export const ACCOUNTS = {
  coordinator: 'coordinator@demo.sg',
  hq: 'hq@demo.sg',
  volunteer: 'volunteer1@demo.sg',
  volunteer2: 'volunteer2@demo.sg',
}

// Logs in through the real login form. Usage: await loginAs(page, 'coordinator')
export async function loginAs(page, who) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(ACCOUNTS[who])
  await page.getByTestId('login-password').fill(DEMO_PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('dashboard')).toBeVisible()
}

export async function logout(page) {
  // On small screens the logout button is inside the collapsed menu
  const toggle = page.getByTestId('nav-toggle')
  if (await toggle.isVisible()) await toggle.click()
  await page.getByTestId('nav-logout').click()
}
