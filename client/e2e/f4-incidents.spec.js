// Feature 4 – Incident Reporting & HQ Alerts (Wei Ming)
import { test, expect } from '@playwright/test'
import { loginAs, logout } from './helpers'

test.use({
  geolocation: { latitude: 1.304, longitude: 103.8746 }, // National Stadium
  permissions: ['geolocation'],
})

test.describe('F4 Incidents', () => {
  test.fixme('volunteer reports a delayed bus in one tap', async ({ page }) => {
    await loginAs(page, 'volunteer')
    await page.goto('/me/report')
    await page.getByTestId('incident-type-BUS_DELAYED').click()
    await page.getByTestId('incident-note').fill('Stuck on PIE, ETA +15 min')
    await page.getByTestId('incident-submit').click()
    await expect(page.getByTestId('incident-success')).toBeVisible()
  })

  test.fixme('HQ acknowledges then resolves the incident', async ({ page }) => {
    await loginAs(page, 'hq')
    await page.goto('/hq/incidents')
    const card = page.getByTestId('queue-new').locator('[data-testid^="incident-card-"]').first()
    await expect(card).toContainText(/bus delayed/i)
    await card.getByTestId('incident-ack').click()
    const ackCard = page.getByTestId('queue-acknowledged').locator('[data-testid^="incident-card-"]').first()
    await ackCard.getByTestId('incident-resolve').click()
    // Resolve should ask for a note before it moves
    await expect(page.getByTestId('queue-resolved')).toContainText(/bus delayed/i)
    await logout(page)
  })

  test.fixme('overdue group appears in the alerts panel', async ({ page }) => {
    // Needs the simulation script to leave a group "stuck" (see server/scripts/simulate-pings.js)
    await loginAs(page, 'hq')
    await page.goto('/hq/incidents')
    await expect(page.getByTestId('alerts-panel').locator('[data-testid^="alert-"]')).not.toHaveCount(0)
  })
})
