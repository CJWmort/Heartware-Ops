// Feature 1b – Smart Allocation (Fanny)
import { test, expect } from '@playwright/test'
import { loginAs, logout } from './helpers'

test.describe('F1b Allocation', () => {
  test.fixme('running allocation fills slots and shows coverage', async ({ page }) => {
    await loginAs(page, 'coordinator')
    await page.goto('/admin/allocation')
    await page.getByTestId('alloc-event-select').selectOption({ label: 'NE Show 1' })
    await page.getByTestId('alloc-run').click()
    await expect(page.getByTestId('alloc-summary')).toContainText(/filled/i)
  })

  test.fixme('moving a volunteer far away shows a warning', async ({ page }) => {
    await loginAs(page, 'coordinator')
    await page.goto('/admin/allocation')
    // Drag a volunteer chip from one school to a far school:
    // await page.getByTestId('alloc-volunteer-<id>').dragTo(page.getByTestId('alloc-slot-<id>'))
    await expect(page.getByTestId('alloc-warning').first()).toBeVisible()
  })

  test.fixme('published assignment is visible to the volunteer, who can accept it', async ({ page }) => {
    await loginAs(page, 'coordinator')
    await page.goto('/admin/allocation')
    await page.getByTestId('alloc-publish').click()
    await logout(page)

    await loginAs(page, 'volunteer')
    await page.goto('/me/assignment')
    await expect(page.getByTestId('assignment-school')).not.toBeEmpty()
    await page.getByTestId('assignment-accept').click()
    await expect(page.getByTestId('assignment-status')).toContainText(/accepted/i)
  })
})
