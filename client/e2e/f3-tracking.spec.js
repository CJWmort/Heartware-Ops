// Feature 3 – Live Movement Tracking (Chin)
// Playwright can fake GPS: see `use` below.
import { test, expect } from '@playwright/test'
import { loginAs, logout } from './helpers'

test.use({
  geolocation: { latitude: 1.3496, longitude: 103.9568 }, // Tampines
  permissions: ['geolocation'],
})

test.describe('F3 Tracking', () => {
  test.fixme('checking in moves to the next checkpoint', async ({ page }) => {
    await loginAs(page, 'volunteer')
    await page.goto('/me/tracking')
    await page.getByTestId('checkpoint-BOARDED_OUTBOUND').click()
    await expect(page.getByTestId('checkpoint-next')).toHaveAttribute(
      'data-checkpoint',
      'DEPARTED_SCHOOL',
    )
  })

  test.fixme('cannot skip ahead to a later checkpoint', async ({ page }) => {
    await loginAs(page, 'volunteer')
    await page.goto('/me/tracking')
    await expect(page.getByTestId('checkpoint-SEATED')).toBeDisabled()
  })

  test.fixme('HQ board shows the group after a check-in', async ({ page }) => {
    await loginAs(page, 'hq')
    await page.goto('/hq/live')
    await expect(page.getByTestId('hq-map')).toBeVisible()
    await expect(page.getByTestId('hq-group-list')).toContainText(/boarded/i)
    await logout(page)
  })
})
