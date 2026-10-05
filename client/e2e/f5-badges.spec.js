// Feature 5 – Recognition & Badge Studio (Hanafi)
import { test, expect } from '@playwright/test'
import { loginAs, logout } from './helpers'

test.describe('F5 Badges', () => {
  test.fixme('changing the colour updates the preview immediately', async ({ page }) => {
    await loginAs(page, 'volunteer')
    await page.goto('/me/badge-studio')
    await page.getByTestId('studio-primary-color').fill('#0055aa')
    await expect(page.getByTestId('studio-preview').locator('[data-part="primary"]')).toHaveAttribute(
      'fill',
      '#0055aa',
    )
  })

  test.fixme('ribbon text is limited to 20 characters with a live counter', async ({ page }) => {
    await loginAs(page, 'volunteer')
    await page.goto('/me/badge-studio')
    await page.getByTestId('studio-ribbon').fill('This text is definitely too long')
    await expect(page.getByTestId('studio-ribbon')).toHaveValue(/^.{0,20}$/)
    await expect(page.getByTestId('studio-ribbon-count')).toContainText('20/20')
  })

  test.fixme('locking in places an order and freezes the design', async ({ page }) => {
    await loginAs(page, 'volunteer')
    await page.goto('/me/badge-studio')
    await page.getByTestId('studio-lock').click()
    await page.getByTestId('order-address').fill('Blk 201 Tampines St 21')
    await page.getByTestId('order-submit').click()
    await expect(page.getByTestId('studio-ribbon')).toBeDisabled()
    await page.goto('/me/badges')
    await expect(page.getByTestId('order-status')).toContainText(/placed/i)
  })

  test.fixme('coordinator custom award appears on the volunteer badge wall', async ({ page }) => {
    await loginAs(page, 'coordinator')
    await page.goto('/admin/badges')
    await page.getByTestId('awards-badge-select').selectOption({ label: 'Heart of Gold' })
    await page.getByTestId('awards-volunteer-search').fill('volunteer1')
    // ...select the volunteer from the results
    await page.getByTestId('awards-message').fill('Thank you for staying calm today!')
    await page.getByTestId('awards-submit').click()
    await logout(page)

    await loginAs(page, 'volunteer')
    await page.goto('/me/badges')
    await page.getByTestId('badge-HEART_OF_GOLD').click()
    await expect(page.getByTestId('badge-modal')).toContainText('Thank you for staying calm today!')
  })
})
