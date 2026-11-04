// Browser tests (Playwright) for feature F5: Incidents.

import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const SHOW = process.env.E2E_SHOW || 'NE Show 4'
const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/

const TAMPINES = { latitude: 1.3496, longitude: 103.9568 }
test.use({ geolocation: TAMPINES, permissions: ['geolocation'] })

const RUN = Date.now()
const REPORT_NOTE = `E2E ${RUN} bus stuck on the expressway`
const RESOLVE_NOTE = `E2E ${RUN} bus replaced, group moving again`
const LIVE_NOTE = `E2E ${RUN} second report sent while HQ page was open`

let volunteer = { email: '', name: '', school: '' }

const CARDS = '[data-testid^="incident-card-"]'

// pickIncidentShow(page) - picks the test show (SHOW) in the Incidents page's show dropdown and
// checks it is selected. The page only lists one NE Show's incidents at a time and a fresh browser
// starts on NE Show 1, so without this the test's incident would not be in the list. Same steps as
// F4 uses for the Live board's show dropdown.
async function pickIncidentShow(page) {
  await page.getByTestId('inc-show-select').click()
  await page.getByRole('option', { name: SHOW }).click()
  await expect(page.getByTestId('inc-show-select')).toContainText(SHOW)
}

// Opens the admin Incidents page, picks the test show (see pickIncidentShow) and searches for one
// incident by its note. The page is a map with a list ("menu") on top; the search box filters that list.
async function openIncidentsAndSearch(page, note) {
  await loginWithCredentials(page, ACCOUNTS.admin)
  await page.goto('/admin/incidents')
  await pickIncidentShow(page)
  await page.getByTestId('inc-search').fill(note)
}

// F5 tests - the 5 browser tests for reporting incidents and the admin Incident Queue. They run one
// after another (serial) and set up their own data first.
test.describe('F5 Incidents', () => {
  test.describe.configure({ mode: 'serial' })

  // SETUP (not a test): one volunteer with an ACCEPTED place. Talks to the server directly because it
  // is preparation.
  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120 * 1000)
    const baseURL = testInfo.project.use.baseURL
    const admin = await playwright.request.newContext({ baseURL })
    const login = await admin.post('/api/users/login', {
      data: { email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
    expect(login.ok(), 'admin login failed: is the server running and is the admin seeded?').toBeTruthy()

    const steps = [
      ['reset', '/api/assignments/run', { reset: true, show: SHOW }],
      ['allocate', '/api/assignments/run', { reset: false, show: SHOW }],
      ['publish', '/api/assignments/publish', { show: SHOW }],
    ]
    for (const [what, path, data] of steps) {
      const response = await admin.post(path, { data })
      expect(response.ok(), `could not ${what} ${SHOW}`).toBeTruthy()
    }

    const rows = await (await admin.get('/api/assignments')).json()
    const pick = rows.find(
      (row) =>
        row.show === SHOW && row.status === 'Pending' && row.published && row.school && DEMO_EMAIL.test(row.volunteer?.email || ''),
    )
    expect(pick, `need a demo volunteer with a place in ${SHOW}: is seed:volunteers done?`).toBeTruthy()

    const volunteerApi = await playwright.request.newContext({ baseURL })
    await volunteerApi.post('/api/users/login', { data: { email: pick.volunteer.email, password: DEMO_PASSWORD } })
    const accepted = await volunteerApi.patch(`/api/assignments/${pick._id}/accept`)
    expect(accepted.ok(), `could not accept for ${pick.volunteer.email}`).toBeTruthy()
    await volunteerApi.dispose()

    volunteer = { email: pick.volunteer.email, name: pick.volunteer.name, school: pick.school.name }
    await admin.dispose()
  })

  // TEST 1 – A volunteer sends an incident report from the Event day page (on a phone-sized screen the
  // bottom sheet is pulled up first; wider screens have no handle)
  test('a volunteer can report a delayed bus and sees that HQ was notified', async ({ page }) => {
    await page.route('**/api/incidents/where*', (route) =>
      route.fulfill({ json: { address: 'E2E test address, Singapore' } }),
    )

    await loginWithCredentials(page, { email: volunteer.email, password: DEMO_PASSWORD })
    await page.goto('/volunteer/tracking')
    if (page.viewportSize().width < 992) await page.getByTestId('sheet-toggle').click()
    await page.getByTestId('incident-open').click()

    await page.getByTestId('incident-type-BUS_DELAYED').click()
    await expect(page.getByTestId('incident-submit')).toBeDisabled()
    await page.getByTestId('incident-note').fill(REPORT_NOTE)
    await expect(page.getByTestId('incident-submit')).toBeEnabled()
    await page.getByTestId('incident-submit').click()

    await expect(page.getByText('Report sent!')).toBeVisible()
    await page.getByTestId('confirm-ok').click()
    await expect(page.getByText('Report sent!')).toBeHidden()
  })

  // TEST 2 – HQ sees the report in the list, with the volunteer's school (this also guards the old
  // "Unknown school" bug)
  test('the report appears on the HQ list as New, with the right school', async ({ page }) => {
    await openIncidentsAndSearch(page, REPORT_NOTE)

    const card = page.locator(CARDS)
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Bus Delayed')
    await expect(card).toContainText('New')
    await expect(card).toContainText(volunteer.school)
    await expect(card).not.toContainText('Unknown school')
  })

  // TEST 3 – HQ opens the incident and acknowledges it
  test('HQ can open the incident and acknowledge it', async ({ page }) => {
    await openIncidentsAndSearch(page, REPORT_NOTE)
    await page.locator(CARDS).click()

    const focus = page.getByTestId('inc-focus-card')
    await expect(focus).toContainText(REPORT_NOTE)
    await expect(focus).toContainText(volunteer.name)

    await page.getByTestId('incident-ack').click()
    await expect(page.getByTestId('notice').filter({ hasText: 'Acknowledged' })).toBeVisible()
    await expect(page.getByTestId('incident-ack')).toHaveCount(0)
    await expect(page.getByTestId('incident-resolve')).toBeVisible()
  })

  // TEST 4 – HQ resolves it; a note on how it was resolved is required
  test('HQ must write a note to resolve the incident, then it is closed', async ({ page }) => {
    await openIncidentsAndSearch(page, REPORT_NOTE)
    await page.locator(CARDS).click()
    await page.getByTestId('incident-resolve').click()

    await expect(page.getByTestId('confirm-ok')).toBeDisabled()
    await page.getByTestId('confirm-input').fill(RESOLVE_NOTE)
    await expect(page.getByTestId('confirm-ok')).toBeEnabled()
    await page.getByTestId('confirm-ok').click()

    await expect(page.getByTestId('notice').filter({ hasText: 'Resolved' })).toBeVisible()
    const focus = page.getByTestId('inc-focus-card')
    await expect(focus).toContainText(RESOLVE_NOTE)
    await expect(page.getByTestId('incident-ack')).toHaveCount(0)
    await expect(page.getByTestId('incident-resolve')).toHaveCount(0)
  })

  // TEST 5 – A report that arrives while HQ has the page open shows up by itself (live update, no
  // reload). HQ picks the test show and waits for its list, then searches for the note of the report
  // about to be sent (nothing matches); the volunteer sends it for the same show and the matching card
  // must appear without reloading.
  test('a new report appears on an open HQ page without reloading', async ({ page, playwright }, testInfo) => {
    await loginWithCredentials(page, ACCOUNTS.admin)
    const listLoaded = page.waitForResponse(
      (r) =>
        /\/api\/incidents(\?|$)/.test(r.url()) &&
        r.request().method() === 'GET' &&
        new URL(r.url()).searchParams.get('show') === SHOW,
    )
    await page.goto('/admin/incidents')
    await pickIncidentShow(page)
    await listLoaded
    await expect(page.getByTestId('stat-new')).toBeVisible()
    await page.getByTestId('inc-search').fill(LIVE_NOTE)
    await expect(page.locator(CARDS)).toHaveCount(0)

    const volunteerApi = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    await volunteerApi.post('/api/users/login', { data: { email: volunteer.email, password: DEMO_PASSWORD } })
    const sent = await volunteerApi.post('/api/incidents', {
      data: { type: 'BUS_DELAYED', severity: 'medium', note: LIVE_NOTE, school: volunteer.school, show: SHOW, lat: TAMPINES.latitude, lng: TAMPINES.longitude },
    })
    expect(sent.ok(), 'could not send the second report').toBeTruthy()
    await volunteerApi.dispose()

    await expect(page.locator(CARDS)).toHaveCount(1, { timeout: 15 * 1000 })
  })
})