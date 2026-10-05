// Feature 2 – Open Slot Replacement (Yap)
// This is the "must work convincingly" demo flow for the progress pitch.
import { test, expect } from '@playwright/test'
import { loginAs, logout } from './helpers'

test.describe('F2 Open Slot Replacement', () => {
  test.fixme('drop-out → claim → approve → new assignment', async ({ page }) => {
    // 1. Volunteer A drops out with MC
    await loginAs(page, 'volunteer')
    await page.goto('/me/open-slots')
    await page.getByTestId('dropout-open').click()
    await page.getByTestId('dropout-reason').selectOption('MC')
    await page.getByTestId('dropout-submit').click()
    await logout(page)

    // 2. Volunteer B sees the open slot and claims it
    await loginAs(page, 'volunteer2')
    await page.goto('/me/open-slots')
    const card = page.getByTestId('open-slot-card').first()
    await expect(card.getByTestId('open-slot-countdown')).toBeVisible()
    await card.getByTestId('open-slot-claim').click()
    await expect(card).toContainText(/waiting for coordinator/i)
    await logout(page)

    // 3. Coordinator widens the radius and approves B
    await loginAs(page, 'coordinator')
    await page.goto('/admin/replacements')
    await page.getByTestId('repl-open-list').locator('[data-testid^="repl-slot-"]').first().click()
    await page.getByTestId('repl-radius').fill('10')
    await page.getByTestId('repl-approve').first().click()
    await page.getByTestId('repl-history').click()
    await expect(page.getByTestId('repl-history')).toContainText(/approve/i)
  })
})
