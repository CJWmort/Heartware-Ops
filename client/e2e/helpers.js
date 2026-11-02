// Shared helpers for the browser tests (log in, set up data, fake the location and so on).

import { expect } from '@playwright/test'

export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD || 'DemoPass123!'

export const ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@gmail.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'admin123',
  },
  volunteer: { email: 'demo.volunteer001@demo.sg', password: DEMO_PASSWORD },
}

// loginWithCredentials(page, account) - logs in through the real login form: 1) open /login 2) type
// the email and password into the fields found by their test ids 3) click Sign in 4) wait until the
// address is no longer /login (so it works wherever the app sends the user afterwards).
export async function loginWithCredentials(page, { email, password }) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).not.toHaveURL(/\/login/)
}
