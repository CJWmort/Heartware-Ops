// Feature 6 – Badges (Badge Studio, badge orders, badge awards)
//   volunteer side: BadgeStudioView.vue + MyBadgesView.vue     admin side: BadgeAwardsView.vue ("Badges & orders")
// One story with ONE demo volunteer, 5 end-to-end tests:
//   1 the Studio preview updates live -> 2 Save keeps the design -> 3 Lock in and order -> 4 HQ moves the order to
//   Delivered -> 5 HQ gives the volunteer a Heart of Gold badge and it shows on their badge wall
//
// IMPORTANT – this feature cannot be reset: once a volunteer orders a badge their design is locked FOREVER and the app
// never deletes orders. So the setup (not one of the 5 tests) picks a demo volunteer who has NO order yet, and every run
// uses up one of them (there are about 400). The same goes for the Heart of Gold badge in test 5.
//
// What must be running first: the SERVER, the seeded admin and the demo volunteers (seed:volunteers).
// Run just this file:  pnpm exec playwright test f6-badges
import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/ // only demo accounts (their password is known)

// The design the volunteer saves in test 2 and orders in test 3
const DESIGN = { shape: 'shield', emblem: 'trophy', primary: '#0055aa', secondary: '#ffcc00', ribbon: 'E2E badge' }
const THANK_YOU = 'E2E thank you for staying calm today!'

// Filled in by the setup step
let volunteer = { email: '', name: '' }

// ---------------------------------------------------------------------------
// Small helpers used only by this file
// ---------------------------------------------------------------------------

// Opens the Badge Studio as our volunteer
async function openStudio(page) {
  await loginWithCredentials(page, { email: volunteer.email, password: DEMO_PASSWORD })
  await page.goto('/volunteer/badge-studio')
  await expect(page.getByTestId('studio-preview')).toBeVisible() // the page loads the saved design in the background
}

// Opens a SECOND browser window logged in as our volunteer, so one test can use admin and volunteer side by side
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

// The admin table row that belongs to our volunteer (the table lists everybody's orders, so we pick ours by email)
function ourOrderRow(page) {
  return page.getByTestId('orders-row').filter({ hasText: volunteer.email })
}

// ---------------------------------------------------------------------------
// Setup + the 5 tests
// ---------------------------------------------------------------------------

test.describe('F6 Badges', () => {
  test.describe.configure({ mode: 'serial' }) // run in order (each test builds on the one before)

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

    // The shape / emblem choices are hidden radio buttons, so we tick them with force
    await page.getByTestId('studio-shape-hexagon').check({ force: true })
    await page.getByTestId('studio-emblem-star').check({ force: true })
    await expect(preview).toHaveAttribute('aria-label', /hexagon badge with a star emblem/)

    // Colour pickers: the preview's badge and ribbon take the new colours straight away
    await page.getByTestId('studio-primary-color').fill('#00aa55')
    await page.getByTestId('studio-secondary-color').fill('#112233')
    await expect(preview.locator('[data-part="primary"]')).toHaveAttribute('fill', '#00aa55')
    await expect(preview.locator('[data-part="secondary"]')).toHaveAttribute('fill', '#112233')

    // Ribbon text: typing 25 letters only keeps 20, the counter says 20/20 and the preview shows the 20
    await page.getByTestId('studio-ribbon').pressSequentially('ABCDEFGHIJKLMNOPQRSTUVWXY')
    await expect(page.getByTestId('studio-ribbon')).toHaveValue('ABCDEFGHIJKLMNOPQRST')
    await expect(page.getByTestId('studio-ribbon-count')).toHaveText('20/20')
    await expect(preview).toContainText('ABCDEFGHIJKLMNOPQRST')
  })

  // TEST 2 – Save keeps the design, even after a reload
  test('saving the design keeps it after a reload', async ({ page }) => {
    await openStudio(page)
    await page.getByTestId(`studio-shape-${DESIGN.shape}`).check({ force: true })
    await page.getByTestId(`studio-emblem-${DESIGN.emblem}`).check({ force: true })
    await page.getByTestId('studio-primary-color').fill(DESIGN.primary)
    await page.getByTestId('studio-secondary-color').fill(DESIGN.secondary)
    await page.getByTestId('studio-ribbon').fill(DESIGN.ribbon)
    await page.getByTestId('studio-save').click()
    await expect(page.getByText('Design saved!').first()).toBeVisible()

    // The design now comes back from the server, not from the page
    await page.reload()
    await expect(page.getByTestId('studio-ribbon')).toHaveValue(DESIGN.ribbon)
    await expect(page.getByTestId(`studio-shape-${DESIGN.shape}`)).toBeChecked()
    await expect(page.getByTestId(`studio-emblem-${DESIGN.emblem}`)).toBeChecked()
    await expect(page.getByTestId('studio-primary-color')).toHaveValue(DESIGN.primary)
    await expect(page.getByTestId('studio-secondary-color')).toHaveValue(DESIGN.secondary)
  })

  // TEST 3 – Lock in and order: the design can no longer be changed
  test('ordering needs a valid address and then locks the design for good', async ({ page }) => {
    await openStudio(page)
    await page.getByTestId('studio-lock').click()

    // "Place order" stays off until there is an address AND a 6-digit postal code
    const submit = page.getByTestId('order-submit')
    await expect(submit).toBeDisabled()
    await page.getByTestId('order-address').fill('Blk 201 Tampines St 21')
    await page.getByTestId('order-postal').fill('12')
    await expect(page.getByText('Postal codes have 6 digits.')).toBeVisible()
    await expect(submit).toBeDisabled()
    await page.getByTestId('order-postal').fill('520201')
    await expect(submit).toBeEnabled()
    await submit.click()

    // The design is now locked and the order shows as Placed
    await expect(page.getByTestId('studio-locked')).toBeVisible()
    await expect(page.getByTestId('order-status').first()).toHaveText('Placed')

    // After a reload it is still locked (it comes from the server), and the editing form is gone
    await page.reload()
    await expect(page.getByTestId('studio-locked')).toBeVisible()
    await expect(page.getByTestId('studio-ribbon')).toHaveCount(0)
  })

  // TEST 4 – HQ moves the order step by step until it is delivered
  test('HQ can move the order from Placed to Delivered and the volunteer sees it', async ({ page, browser }, testInfo) => {
    await openAdminBadges(page)
    const row = ourOrderRow(page)
    await expect(row).toHaveCount(1) // the table loads in the background, so this waits for it
    await expect(row.getByTestId('orders-status')).toContainText('Placed')

    // Each click offers only the NEXT step (the server refuses to skip one)
    for (const label of ['In production', 'Shipped', 'Delivered']) {
      await row.getByTestId('orders-advance').click()
      await expect(row.getByTestId('orders-status')).toContainText(label)
    }
    await expect(row).toContainText('Complete') // nothing left to do
    await expect(row.getByTestId('orders-advance')).toHaveCount(0)

    // The volunteer's own Studio shows the same status
    const { context, page: volPage } = await volunteerWindow(browser, testInfo)
    await volPage.goto('/volunteer/badge-studio')
    await expect(volPage.getByTestId('order-status').first()).toHaveText('Delivered')
    await context.close()
  })

  // TEST 5 – HQ gives a thank-you badge and it appears on the volunteer's badge wall
  test('a badge given by HQ shows up as earned, with the thank-you note', async ({ page, browser }, testInfo) => {
    // Before: the volunteer has not earned Heart of Gold yet
    const { context, page: volPage } = await volunteerWindow(browser, testInfo)
    await volPage.goto('/volunteer/badges')
    await volPage.getByTestId('badge-HEART_OF_GOLD').click()
    await expect(volPage.getByTestId('badge-modal')).toContainText('Not earned yet')
    await volPage.getByTestId('badge-modal-close').click()

    // HQ fills in the "Give a badge" form
    await openAdminBadges(page)
    const form = page.getByTestId('awards-form')
    await expect(form).toBeVisible()
    await form.getByTestId('awards-badge-select').click()
    await form.getByRole('option', { name: 'Heart of Gold' }).click()
    const show = (await form.getByTestId('awards-event-select').innerText()).trim() // the show the badge is "for"

    const giveBadge = async () => {
      await form.getByTestId('awards-volunteer-search').fill(volunteer.email)
      await form.getByTestId('awards-volunteer-result').filter({ hasText: volunteer.email }).click()
      await form.getByTestId('awards-message').fill(THANK_YOU)
      await form.getByTestId('awards-submit').click()
    }
    await giveBadge()
    await expect(form.getByTestId('awards-success')).toContainText('Heart of Gold given to 1 volunteer(s)')

    // The same badge for the same show cannot be given twice: HQ is told the volunteer already had it
    await giveBadge()
    await expect(form.getByTestId('awards-success')).toContainText(`Already had it for ${show}`)

    // After: the badge is earned, the counter went up and the popup shows the note
    await volPage.reload()
    await expect(volPage.getByText('1 badge earned')).toBeVisible()
    await volPage.getByTestId('badge-HEART_OF_GOLD').click()
    const modal = volPage.getByTestId('badge-modal')
    await expect(modal).toContainText(`Earned at ${show}`)
    await expect(modal).toContainText(THANK_YOU)
    await context.close()
  })
})