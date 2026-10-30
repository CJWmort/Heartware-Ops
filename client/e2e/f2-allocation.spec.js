// Browser tests (Playwright) for feature F2: the Allocation board.

import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const SHOW = process.env.E2E_SHOW || 'NE Show 4'

const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/

let volunteerEmail = ''
let schoolName = ''

// On the admin board: open the show dropdown and pick our show
async function chooseShow(page) {
  await page.getByTestId('alloc-event-select').click()
  await page.getByRole('option', { name: SHOW }).click()
  await expect(page.getByTestId('alloc-event-select')).toContainText(SHOW)
}

// Logs in as the admin and opens the allocation board on our show
async function openAllocationBoard(page) {
  await loginWithCredentials(page, ACCOUNTS.admin)
  await page.goto('/admin/allocation')
  await chooseShow(page)
}

// Logs in as the volunteer picked in test 1 and returns their card for our show
async function openMyCard(page) {
  await loginWithCredentials(page, { email: volunteerEmail, password: DEMO_PASSWORD })
  await page.goto('/volunteer/assignment')
  return page.getByTestId('assignment-card').filter({ hasText: SHOW })
}

// F2 tests - the 5 browser tests for the admin Allocation board. They run one after another (serial)
// and set up their own data first.
test.describe('F2 Allocation', () => {
  test.describe.configure({ mode: 'serial' })

  // SETUP (not a test): start from a clean show so the tests give the same result every run. This
  // talks to the server directly instead of clicking, because it is preparation, not the thing being
  // tested.
  test.beforeAll(async ({ playwright }, testInfo) => {
    const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    const login = await api.post('/api/users/login', {
      data: { email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
    expect(login.ok(), 'admin login failed: is the server running and is the admin seeded?').toBeTruthy()
    const reset = await api.post('/api/assignments/run', { data: { reset: true, show: SHOW } })
    expect(reset.ok(), `could not reset ${SHOW}`).toBeTruthy()
    await api.dispose()
  })

  // TEST 1 – Admin presses Allocate and gets a DRAFT to review
  test('admin allocates the show and gets drafts to review', async ({ page }) => {
    test.setTimeout(60 * 1000)
    await openAllocationBoard(page)

    await page.getByTestId('alloc-run').click()
    await page.getByTestId('confirm-ok').click()
    await expect(page.getByTestId('notice')).toContainText(/allocation done/i, { timeout: 45 * 1000 })
    await expect(page.getByTestId('alloc-draft-count')).toHaveText(/^[1-9]\d*$/)

    const response = await page.request.get('/api/assignments')
    const rows = await response.json()
    const mine = rows.find(
      (row) => row.show === SHOW && row.school && row.status === 'Pending' && DEMO_EMAIL.test(row.volunteer?.email || ''),
    )
    expect(mine, `no demo volunteer was given a place in ${SHOW}: is seed:volunteers done?`).toBeTruthy()
    volunteerEmail = mine.volunteer.email
    schoolName = mine.school.name
  })

  // TEST 2 – Until the admin publishes, the volunteer must NOT see their school or an Accept button
  test('a draft allocation is hidden from the volunteer', async ({ page }) => {
    const card = await openMyCard(page)
    await expect(card.getByTestId('assignment-status')).toHaveText(/awaiting allocation/i)
    await expect(card.getByTestId('assignment-accept')).toHaveCount(0)
  })

  // TEST 3 – Admin presses Publish; the drafts are released
  test('admin publishes the allocation', async ({ page }) => {
    await openAllocationBoard(page)

    await page.getByTestId('alloc-publish').click()
    await page.getByTestId('confirm-ok').click()
    await expect(page.getByTestId('notice')).toContainText(/is now visible to volunteers/i)
    await expect(page.getByTestId('alloc-publish')).toBeDisabled()
  })

  // TEST 4 – The volunteer now sees a Pending offer with a school, and accepts it
  test('volunteer sees the published place and accepts it', async ({ page }) => {
    const card = await openMyCard(page)
    await expect(card.getByTestId('assignment-status')).toHaveText(/pending/i)
    await expect(card.getByTestId('assignment-school')).toContainText(schoolName)

    await card.getByTestId('assignment-accept').click()
    await expect(card.getByTestId('assignment-status')).toHaveText(/accepted/i)
    await expect(card.getByTestId('assignment-withdraw')).toBeVisible()
    await expect(card.getByTestId('assignment-accept')).toHaveCount(0)
  })

  // TEST 5 – A volunteer who accepted a show cannot quietly drop it by unticking it in Change
  // Availability.
  test('an accepted show cannot be removed from availability', async ({ page }) => {
    const card = await openMyCard(page)
    await expect(card.getByTestId('assignment-status')).toHaveText(/accepted/i)

    await page.getByTestId('change-availability').click()
    const modal = page.getByTestId('availability-modal')
    await expect(modal).toBeVisible()
    await expect(page.getByTestId(`availability-${SHOW}`)).toHaveCount(0)
    await expect(page.getByTestId(`availability-locked-${SHOW}`)).toContainText(/accepted/i)
    await page.getByTestId('availability-save').click()
    await expect(modal).toBeHidden()

    await page.reload()
    await expect(page.getByTestId('assignment-card').filter({ hasText: SHOW }).getByTestId('assignment-status')).toHaveText(
      /accepted/i,
    )
  })
})