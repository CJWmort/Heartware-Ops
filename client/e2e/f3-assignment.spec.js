// Feature 3 – Assignment  (the volunteer's "My assignment" page: MyAssignmentView.vue)
// 5 end-to-end tests. Feature 2 already covered "accept" and "an accepted show can't be removed",
// so these cover the rest of the page: what the card shows, Directions, declining, and what a decline locks.
//
// This file builds its OWN data, so it can run without Feature 2. Before the tests start, a setup step
// (not one of the 5 tests) resets the show, allocates it, publishes it, and picks three demo volunteers
// who each got a pending place:
//   volunteer A -> tests 1 and 2 (only look, change nothing)
//   volunteer B -> tests 3 and 4 (declines; a decline is permanent, so B is used up after this)
//   volunteer C -> test 5        (unticks / re-ticks the show)
//
// What must be running first (same as Feature 2): the SERVER, the seeded admin, the schools and the demo volunteers.
// WARNING: the show used below is RESET (every assignment in it is erased). Set E2E_SHOW to choose another show.
// Run just this file:  pnpm exec playwright test f3-assignment
import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const SHOW = process.env.E2E_SHOW || 'NE Show 4'
const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/ // only demo accounts (their password is known)

// A short, fixed route (Tampines -> Paya Lebar) in the same "encoded polyline" format OneMap returns.
// Test 2 hands this to the page instead of asking the real OneMap (see the comment there).
const ROUTE_GEOMETRY = '_rfG_aoyRnn@nfD~tCffF'

// The three volunteers picked in the setup step
let volunteerA = ''
let volunteerB = ''
let volunteerC = ''
let schoolNameA = '' // the school volunteer A was given, so test 1 can check the page shows THIS school

// Logs in as the given volunteer, opens the Assignment page, and returns their card for our show
async function openMyCard(page, email) {
  await loginWithCredentials(page, { email, password: DEMO_PASSWORD })
  await page.goto('/volunteer/assignment')
  // There is one card per show, so pick ours by the show name written on it
  return page.getByTestId('assignment-card').filter({ hasText: SHOW })
}

test.describe('F3 Assignment', () => {
  test.describe.configure({ mode: 'serial' }) // run in order (tests 3 and 4 share volunteer B)

  // SETUP (not a test): give the volunteers something to respond to. It talks to the server directly
  // because it is preparation, not the thing being tested.
  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120 * 1000) // allocating hundreds of volunteers takes a while
    const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    const login = await api.post('/api/users/login', {
      data: { email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
    expect(login.ok(), 'admin login failed: is the server running and is the admin seeded?').toBeTruthy()

    // Same three steps an admin does on the Allocation page: reset -> allocate -> publish
    const steps = [
      ['reset', '/api/assignments/run', { reset: true, show: SHOW }],
      ['allocate', '/api/assignments/run', { reset: false, show: SHOW }],
      ['publish', '/api/assignments/publish', { show: SHOW }],
    ]
    for (const [what, path, data] of steps) {
      const response = await api.post(path, { data })
      expect(response.ok(), `could not ${what} ${SHOW}`).toBeTruthy()
    }

    // Pick 3 demo volunteers who have a pending place. They must have a home AND school location,
    // because the Directions button (test 2) only appears when both are known.
    const rows = await (await api.get('/api/assignments')).json()
    const picks = rows
      .filter(
        (row) =>
          row.show === SHOW &&
          row.status === 'Pending' &&
          row.published &&
          row.school &&
          typeof row.school.lat === 'number' &&
          typeof row.volunteer?.lat === 'number' &&
          DEMO_EMAIL.test(row.volunteer?.email || ''),
      )
      .slice(0, 3)
    expect(picks, `need 3 demo volunteers with a place in ${SHOW}: is seed:volunteers done?`).toHaveLength(3)
    ;[volunteerA, volunteerB, volunteerC] = picks.map((row) => row.volunteer.email)
    schoolNameA = picks[0].school.name
    await api.dispose()
  })

  // TEST 1 – The card shows everything a volunteer needs to answer
  test('a pending offer shows the show, the school and the Accept / Decline buttons', async ({ page }) => {
    const card = await openMyCard(page, volunteerA)
    await expect(card.getByTestId('assignment-status')).toHaveText(/pending/i)
    // The field always holds its "Reporting location" label, so check for the real school name from the server
    await expect(card.getByTestId('assignment-school')).toContainText(schoolNameA)
    await expect(card.getByTestId('assignment-accept')).toBeVisible()
    await expect(card.getByTestId('assignment-decline')).toBeVisible()
  })

  // TEST 2 – Directions popup draws a route and follows the travel mode
  test('the Directions popup shows the route and changes with the travel mode', async ({ page }) => {
    // The real route comes from OneMap (an outside service with a usage limit that can be slow or down).
    // A test that needs it would fail for reasons that are not our bug, so we answer the request ourselves:
    // 10 min / 3.1 km by car, 30 min / 2.4 km on foot. The page still has to draw and read it correctly.
    await page.route('**/api/users/route**', (route) => {
      const walking = new URL(route.request().url()).searchParams.get('routeType') === 'walk'
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          route_geometry: ROUTE_GEOMETRY,
          route_summary: { total_time: walking ? 1800 : 600, total_distance: walking ? 2400 : 3100 },
        },
      })
    })

    const card = await openMyCard(page, volunteerA)
    await card.getByTestId('assignment-directions').click()
    const modal = page.getByTestId('directions-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText(/directions to/i)
    await expect(modal).toContainText(SHOW)

    // Default mode is Drive
    await expect(page.getByTestId('route-summary')).toContainText('10 min')
    await expect(page.getByTestId('route-summary')).toContainText('3.1 km')
    await expect(page.getByTestId('route-google-maps')).toHaveAttribute('href', /travelmode=driving/)

    // Switch to Walk: the page asks again and the numbers and the Google Maps link change
    await page.getByTestId('route-mode-walk').click()
    await expect(page.getByTestId('route-summary')).toContainText('30 min')
    await expect(page.getByTestId('route-summary')).toContainText('2.4 km')
    await expect(page.getByTestId('route-google-maps')).toHaveAttribute('href', /travelmode=walking/)
  })

  // TEST 3 – Declining: you can back out first, and after declining the answer is final
  test('declining asks first, then records the reason and removes the buttons', async ({ page }) => {
    const card = await openMyCard(page, volunteerB)
    const modal = page.getByTestId('pullout-modal')

    await test.step('"Keep my slot" backs out and changes nothing', async () => {
      await card.getByTestId('assignment-decline').click()
      await expect(modal).toBeVisible()
      await page.getByTestId('pullout-cancel').click()
      await expect(modal).toBeHidden()
      await expect(card.getByTestId('assignment-status')).toHaveText(/pending/i)
    })

    await test.step('declining with a reason is final', async () => {
      await card.getByTestId('assignment-decline').click()
      await page.getByTestId('pullout-reason').fill('E2E test: cannot make it')
      await page.getByTestId('pullout-confirm').click()
      await expect(modal).toBeHidden()
      await expect(card.getByTestId('assignment-status')).toHaveText(/declined/i)
      await expect(card).toContainText('E2E test: cannot make it') // the reason is shown on the card
      // No Undo: no button of any kind is left
      await expect(card.getByTestId('assignment-accept')).toHaveCount(0)
      await expect(card.getByTestId('assignment-decline')).toHaveCount(0)
      await expect(card.getByTestId('assignment-withdraw')).toHaveCount(0)
    })
  })

  // TEST 4 – After declining, the show is locked in Change Availability
  test('a declined show is locked in Change Availability', async ({ page }) => {
    await openMyCard(page, volunteerB)
    await page.getByTestId('change-availability').click()
    await expect(page.getByTestId('availability-modal')).toBeVisible()
    await expect(page.getByTestId(`availability-locked-${SHOW}`)).toContainText(/you declined this show/i)
    await expect(page.getByTestId(`availability-${SHOW}`)).toBeDisabled() // cannot be ticked again
  })

  // TEST 5 – Unticking a show cancels its pending offer; ticking it again does not bring the offer back
  test('unticking a show removes its pending offer', async ({ page }) => {
    const card = await openMyCard(page, volunteerC)
    await expect(card.getByTestId('assignment-status')).toHaveText(/pending/i)

    await test.step('untick the show and save', async () => {
      await page.getByTestId('change-availability').click()
      await page.getByTestId(`availability-${SHOW}`).uncheck()
      await page.getByTestId('availability-save').click()
      await expect(page.getByTestId('availability-modal')).toBeHidden() // closes itself when saving worked
      await expect(card.getByTestId('assignment-status')).toHaveText(/not available/i)
      await expect(card.getByTestId('assignment-accept')).toHaveCount(0) // the offer is gone
    })

    await test.step('tick it again: available once more, but the old offer is not restored', async () => {
      await page.getByTestId('change-availability').click()
      await page.getByTestId(`availability-${SHOW}`).check()
      await page.getByTestId('availability-save').click()
      await expect(page.getByTestId('availability-modal')).toBeHidden()
      await expect(card.getByTestId('assignment-status')).not.toHaveText(/not available/i)
      await expect(card.getByTestId('assignment-accept')).toHaveCount(0) // allocation has to be run again for a new offer
    })
  })
})
