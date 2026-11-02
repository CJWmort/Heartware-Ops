// Browser tests (Playwright) for feature F6: Badges.

import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/

const DESIGN = { shape: 'shield', emblem: 'trophy', primary: '#0055aa', secondary: '#ffcc00', ribbon: 'E2E badge' }
const THANK_YOU = 'E2E thank you for staying calm today!'

let volunteer = { email: '', name: '' }

// Opens the Badge Studio as our volunteer
async function openStudio(page) {
  await loginWithCredentials(page, { email: volunteer.email, password: DEMO_PASSWORD })
  await page.goto('/volunteer/badge-studio')
  await expect(page.getByTestId('studio-preview')).toBeVisible()
}

// Opens a SECOND browser window logged in as our volunteer, so one test can use admin and volunteer
// side by side
async function volunteerWindow(browser, testInfo) {
  const context = await browser.newContext(testInfo.project.use)
  const page = await context.newPage()
  await loginWithCredentials(page, { email: volunteer.email, password: DEMO_PASSWORD })
  return { context, page }
}

// Opens the admin "Badges & orders" page
async function openAdminBadges(page) {
  await loginWithCredentials(page, ACCOUNTS.admin)
  await page.goto('/admin/badges')
}

// The admin table row that belongs to our volunteer (the table lists everybody's orders, so we pick
// ours by email)
function ourOrderRow(page) {
  return page.getByTestId('orders-row').filter({ hasText: volunteer.email })
}

// F6 tests - the 5 browser tests for the Badge Studio, orders and admin awards. They run one after
// another (serial) and set up their own data first.
test.describe('F6 Badges', () => {
  test.describe.configure({ mode: 'serial' })

  // SETUP (not a test): find a demo volunteer who has not ordered a badge yet.
  test.beforeAll(async ({ playwright }, testInfo) => {
    const admin = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    const login = await admin.post('/api/users/login', {
      data: { email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
    expect(login.ok(), 'admin login failed: is the server running and is the admin seeded?').toBeTruthy()

    const everyone = await (await admin.get('/api/badges/volunteers')).json()
    const orders = await (await admin.get('/api/badges/orders')).json()
    const alreadyOrdered = new Set(orders.map((order) => order.volunteer?.email))
    const free = everyone.find((v) => DEMO_EMAIL.test(v.email) && !alreadyOrdered.has(v.email))
    expect(free, 'every demo volunteer has already ordered a badge: run seed:volunteers or use a fresh database').toBeTruthy()
    volunteer = { email: free.email, name: free.name }
    await admin.dispose()
  })

  // TEST 1 – The live preview follows every change
  test('the Badge Studio preview updates live and the ribbon text stops at 20 characters', async ({ page }) => {
    await openStudio(page)
    const preview = page.getByTestId('studio-preview')

    await page.locator('label[for="shape-hexagon"]').click()
    await page.locator('label[for="emblem-star"]').click()
    await expect(preview).toHaveAttribute('aria-label', /hexagon badge with a star emblem/)

    await page.getByTestId('studio-primary-color').fill('#00aa55')
    await page.getByTestId('studio-secondary-color').fill('#112233')
    await expect(preview.locator('[data-part="primary"]')).toHaveAttribute('fill', '#00aa55')
    await expect(preview.locator('[data-part="secondary"]')).toHaveAttribute('fill', '#112233')

    await page.getByTestId('studio-ribbon').pressSequentially('ABCDEFGHIJKLMNOPQRSTUVWXY')
    await expect(page.getByTestId('studio-ribbon')).toHaveValue('ABCDEFGHIJKLMNOPQRST')
    await expect(page.getByTestId('studio-ribbon-count')).toHaveText('20/20')
    await expect(preview).toContainText('ABCDEFGHIJKLMNOPQRST')
  })

  // TEST 2 – Save keeps the design, even after a reload
  test('saving the design keeps it after a reload', async ({ page }) => {
    await openStudio(page)
    await page.locator(`label[for="shape-${DESIGN.shape}"]`).click()
    await page.locator(`label[for="emblem-${DESIGN.emblem}"]`).click()
    await page.getByTestId('studio-primary-color').fill(DESIGN.primary)
    await page.getByTestId('studio-secondary-color').fill(DESIGN.secondary)
    await page.getByTestId('studio-ribbon').fill(DESIGN.ribbon)
    await page.getByTestId('studio-save').click()
    await expect(page.getByText('Design saved!').first()).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('studio-ribbon')).toHaveValue(DESIGN.ribbon)
    await expect(page.getByTestId(`studio-shape-${DESIGN.shape}`)).toBeChecked()
    await expect(page.getByTestId(`studio-emblem-${DESIGN.emblem}`)).toBeChecked()
    await expect(page.getByTestId('studio-primary-color')).toHaveValue(DESIGN.primary)
    await expect(page.getByTestId('studio-secondary-color')).toHaveValue(DESIGN.secondary)
  })

  // Test 3 - ordering needs a valid address (postal code and unit) and then locks the design for good,
  // so it can no longer be changed.
  test('ordering needs a valid address and then locks the design for good', async ({ page }) => {
    await openStudio(page)
    await page.getByTestId('studio-lock').click()

    const submit = page.getByTestId('order-submit')
    await expect(submit).toBeDisabled()
    await expect(page.getByTestId('order-address')).toHaveAttribute('readonly', '')

    await page.getByTestId('order-postal').fill('000000')
    await expect(page.getByText("This postal code doesn't exist in Singapore.")).toBeVisible()
    await expect(page.getByTestId('order-address')).toHaveValue('')
    await page.getByTestId('order-unit').fill('#05-123')
    await expect(submit).toBeDisabled()

    await page.getByTestId('order-postal').fill('520201')
    await expect(page.getByTestId('order-address')).not.toHaveValue('')
    await expect(submit).toBeEnabled()

    await page.getByTestId('order-unit').fill('')
    await expect(submit).toBeDisabled()
    await page.getByTestId('order-unit').fill('38A')
    await expect(submit).toBeEnabled()
    await submit.click()

    await expect(page.getByTestId('studio-locked')).toBeVisible()
    await expect(page.getByTestId('order-status').first()).toHaveText('Placed')

    await page.reload()
    await expect(page.getByTestId('studio-locked')).toBeVisible()
    await expect(page.getByTestId('studio-ribbon')).toHaveCount(0)
  })

  // TEST 4 – HQ moves the order step by step until it is delivered
  test('HQ can move the order from Placed to Delivered and the volunteer sees it', async ({ page, browser }, testInfo) => {
    await openAdminBadges(page)
    const row = ourOrderRow(page)
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('orders-status')).toContainText('Placed')

    for (const label of ['In production', 'Shipped', 'Delivered']) {
      await row.getByTestId('orders-advance').click()
      await expect(row.getByTestId('orders-status')).toContainText(label)
    }
    await expect(row).toContainText('Complete')
    await expect(row.getByTestId('orders-advance')).toHaveCount(0)

    const { context, page: volPage } = await volunteerWindow(browser, testInfo)
    await volPage.goto('/volunteer/badge-studio')
    await expect(volPage.getByTestId('order-status').first()).toHaveText('Delivered')
    await context.close()
  })

  // TEST 5 – HQ gives a thank-you badge and it appears on the volunteer's badge wall
  test('a badge given by HQ shows up as earned, with the thank-you note', async ({ page, browser }, testInfo) => {
    const { context, page: volPage } = await volunteerWindow(browser, testInfo)
    await volPage.goto('/volunteer/badges')
    await volPage.getByTestId('badge-HEART_OF_GOLD').click()
    await expect(volPage.getByTestId('badge-modal')).toContainText('Not earned yet')
    await volPage.getByTestId('badge-modal-close').click()

    await openAdminBadges(page)
    const form = page.getByTestId('awards-form')
    await expect(form).toBeVisible()
    await form.getByTestId('awards-badge-select').click()
    await form.getByRole('option', { name: 'Heart of Gold' }).click()
    const show = (await form.getByTestId('awards-event-select').innerText()).trim()

    // giveBadge() - the admin finds the volunteer by email in the award form, picks them, types the
    // thank-you message and sends the badge.
    const giveBadge = async () => {
      await form.getByTestId('awards-volunteer-search').fill(volunteer.email)
      await form.getByTestId('awards-volunteer-result').filter({ hasText: volunteer.email }).click()
      await form.getByTestId('awards-message').fill(THANK_YOU)
      await form.getByTestId('awards-submit').click()
    }
    await giveBadge()
    await expect(form.getByTestId('awards-success')).toContainText('Heart of Gold given to 1 volunteer(s)')

    await giveBadge()
    await expect(form.getByTestId('awards-success')).toContainText(`Already had it for ${show}`)

    await volPage.reload()
    await expect(volPage.getByText('1 badge earned')).toBeVisible()
    await volPage.getByTestId('badge-HEART_OF_GOLD').click()
    const modal = volPage.getByTestId('badge-modal')
    await expect(modal).toContainText(`Earned at ${show}`)
    await expect(modal).toContainText(THANK_YOU)
    await context.close()
  })
})