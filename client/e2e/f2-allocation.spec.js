// Feature 2 – Allocation  (admin: AllocationBoardView.vue, volunteer: MyAssignmentView.vue)
// 5 end-to-end tests that follow ONE story, in order:
//   1 admin allocates -> 2 volunteer cannot see the draft -> 3 admin publishes
//   -> 4 volunteer accepts -> 5 volunteer cannot drop the show they accepted
// Because each test builds on the one before, they run in "serial" mode: if one fails, the rest are skipped
// (their result would be meaningless).
//
// What must be running first (same as Feature 1):
//   - the SERVER (cd server && pnpm run dev) with the demo volunteers (pnpm run seed:volunteers) and schools loaded
//   - an admin account, using the details in helpers.js (or E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)
// WARNING: before the tests start, the show used below is RESET, which erases every assignment in it,
// including accepted ones. Use a test database, or leave E2E_SHOW at its default and do not use that show for demos.
// Run just this file:  pnpm exec playwright test f2-allocation
import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

// The one show these tests work on. Change it with E2E_SHOW if you want a different one.
const SHOW = process.env.E2E_SHOW || 'NE Show 4'

// Only demo accounts (password known) are used as test volunteers
const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/

// Shared between the tests below. Test 1 finds a volunteer who got a place, and tests 2, 4 and 5 log in as them.
let volunteerEmail = ''
let schoolName = '' // the school that volunteer was given, so test 4 can check the page shows THIS school

// ---------------------------------------------------------------------------
// Small helpers used only by this file
// ---------------------------------------------------------------------------

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
  // There is one card per show, so pick ours by the show name written on it
  return page.getByTestId('assignment-card').filter({ hasText: SHOW })
}

// ---------------------------------------------------------------------------
// Setup + the 5 tests
// ---------------------------------------------------------------------------

test.describe('F2 Allocation', () => {
  test.describe.configure({ mode: 'serial' }) // run in order, stop after the first failure

  // SETUP (not a test): start from a clean show so the tests give the same result every run.
  // This talks to the server directly instead of clicking, because it is preparation, not the thing being tested.
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
    test.setTimeout(60 * 1000) // matching hundreds of volunteers takes longer than the normal 30 s limit
    await openAllocationBoard(page)

    await page.getByTestId('alloc-run').click()
    await page.getByTestId('confirm-ok').click() // "Allocate NE Show X?" confirmation card
    await expect(page.getByTestId('notice')).toContainText(/allocation done/i, { timeout: 45 * 1000 })
    // The number on the Publish button is how many unpublished drafts exist. It must be 1 or more.
    await expect(page.getByTestId('alloc-draft-count')).toHaveText(/^[1-9]\d*$/)

    // Ask the server who got a place (page.request shares this browser's admin login) and remember one demo volunteer
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
    await page.getByTestId('confirm-ok').click() // "Publish NE Show X?" confirmation card
    await expect(page.getByTestId('notice')).toContainText(/is now visible to volunteers/i)
    // Nothing is left to publish, so the button is disabled
    await expect(page.getByTestId('alloc-publish')).toBeDisabled()
  })

  // TEST 4 – The volunteer now sees a Pending offer with a school, and accepts it
  test('volunteer sees the published place and accepts it', async ({ page }) => {
    const card = await openMyCard(page)
    await expect(card.getByTestId('assignment-status')).toHaveText(/pending/i)
    // The field always contains its "Reporting location" label, so "not empty" would pass even with no school.
    // Check for the real school name that the server gave this volunteer instead.
    await expect(card.getByTestId('assignment-school')).toContainText(schoolName)

    await card.getByTestId('assignment-accept').click()
    await expect(card.getByTestId('assignment-status')).toHaveText(/accepted/i)
    await expect(card.getByTestId('assignment-withdraw')).toBeVisible() // Accepted offers a Withdraw button instead
    await expect(card.getByTestId('assignment-accept')).toHaveCount(0)
  })

  // TEST 5 – A volunteer who accepted a show cannot quietly drop it by unticking it in Change Availability.
  // (The checkbox CAN be unticked; the server refuses on Save and the popup shows why.)
  test('an accepted show cannot be removed from availability', async ({ page }) => {
    const card = await openMyCard(page)
    await expect(card.getByTestId('assignment-status')).toHaveText(/accepted/i)

    await page.getByTestId('change-availability').click()
    const modal = page.getByTestId('availability-modal')
    await expect(modal).toBeVisible()
    await page.getByTestId(`availability-${SHOW}`).uncheck()
    await page.getByTestId('availability-save').click()

    // The popup stays open and shows the server's reason (a red alert inside the popup)
    await expect(modal.getByRole('alert')).toContainText(/accepted/i)
    await expect(modal.getByRole('alert')).toContainText(SHOW)

    // Nothing was deleted: after a reload the place is still Accepted
    await page.reload()
    await expect(page.getByTestId('assignment-card').filter({ hasText: SHOW }).getByTestId('assignment-status')).toHaveText(
      /accepted/i,
    )
  })
})
