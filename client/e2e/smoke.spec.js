// App shell smoke tests – these pass already (no server needed).
import { test, expect } from '@playwright/test'

test.describe('App shell', () => {
  test('landing page shows the sign-up call to action', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('landing')).toBeVisible()
    await expect(page.getByTestId('cta-register')).toBeVisible()
  })

  test('protected page redirects a guest to login', async ({ page }) => {
    await page.goto('/admin/allocation')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('unknown URL shows the 404 page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.getByTestId('not-found')).toBeVisible()
  })

  test('a volunteer cannot open coordinator pages (dev login)', async ({ page }) => {
    await page.goto('/login')
    const devLogin = page.getByTestId('dev-login-volunteer')
    test.skip(!(await devLogin.isVisible()), 'dev login only exists in `npm run dev`')
    await devLogin.click()
    await expect(page.getByTestId('dashboard')).toBeVisible()
    // Client-side navigation keeps the dev session (a full reload would clear it)
    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin/allocation')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByTestId('dashboard')).toBeVisible()
  })
})
