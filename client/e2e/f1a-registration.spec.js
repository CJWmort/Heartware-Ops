// Feature 1a – Registration (Kuah)
// Remove `.fixme` from each test once the feature works. Requires: server running + seed:demo.
import { test, expect } from '@playwright/test'

test.describe('F1a Registration', () => {
  test.fixme('blocks submission without location consent', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('reg-name').fill('Test Volunteer')
    await page.getByTestId('reg-email').fill(`e2e-${Date.now()}@test.sg`)
    await page.getByTestId('reg-password').fill('Password123!')
    await page.getByTestId('reg-postal').fill('520201')
    // ...pick a date, go to the consent step, DON'T tick consent
    await page.getByTestId('reg-submit').click()
    await expect(page.getByTestId('reg-error')).toContainText(/consent/i)
  })

  test.fixme('valid postal code shows the OneMap address preview', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('reg-postal').fill('520201')
    await expect(page.getByTestId('reg-postal-preview')).toContainText(/tampines/i)
  })

  test.fixme('invalid postal code shows an error', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('reg-postal').fill('000000')
    await expect(page.getByTestId('reg-postal-preview')).toContainText(/not found/i)
  })

  test.fixme('successful sign-up logs the volunteer in', async ({ page: _page }) => {
    // Fill every step with valid data, tick consent, submit
    // await expect(page).toHaveURL(/\/me\/assignment/)
  })
})
