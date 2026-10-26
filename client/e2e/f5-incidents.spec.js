// Feature 5 – Incidents (volunteer reports -> HQ handles it)
//   volunteer side: IncidentReportForm.vue (opened from TrackingView.vue)     admin side: IncidentQueueView.vue ("Incidents")
// One story across both sides, 5 end-to-end tests:
//   1 volunteer sends a report -> 2 it shows up on the admin list with the right school -> 3 admin acknowledges it
//   -> 4 admin resolves it (a note is required) -> 5 a new report appears on an already-open admin page with no reload
//
// Before the tests start, a setup step (not one of the 5 tests) resets and allocates the show, publishes it, and makes
// one demo volunteer ACCEPT their place (the report form lives on the Event day page, which needs an accepted place).
//
// What must be running first (same as Features 2-4): the SERVER, the seeded admin, the schools and demo volunteers.
// WARNING: the show used below is RESET (every assignment in it is erased). Set E2E_SHOW to choose another show.
// Incidents are never deleted by the app, so each run leaves a few behind. Every note in this file starts with "E2E".
// To clean up in MongoDB:  db.incidents.deleteMany({ note: /^E2E/ })
// Run just this file:  pnpm exec playwright test f5-incidents
import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const SHOW = process.env.E2E_SHOW || 'NE Show 4'
const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/ // only demo accounts (their password is known)

// A fake GPS position, so the report form has a location to send (any place in Singapore will do)
const TAMPINES = { latitude: 1.3496, longitude: 103.9568 }
test.use({ geolocation: TAMPINES, permissions: ['geolocation'] })

// Every note in this file includes this run number, so a search finds only THIS run's incident
// (old incidents from earlier runs stay in the database).
const RUN = Date.now()
const REPORT_NOTE = `E2E ${RUN} bus stuck on the expressway`
const RESOLVE_NOTE = `E2E ${RUN} bus replaced, group moving again`
const LIVE_NOTE = `E2E ${RUN} second report sent while HQ page was open`

// Filled in by the setup step
let volunteer = { email: '', name: '', school: '' }

// Every incident card on the admin page has a test id that starts with "incident-card-"
const CARDS = '[data-testid^="incident-card-"]'

// ---------------------------------------------------------------------------
// Small helpers used only by this file
// ---------------------------------------------------------------------------

// Opens the admin Incidents page and searches for one incident by its note.
// The page is a map with a list ("menu") on top; the search box filters that list.
async function openIncidentsAndSearch(page, note) {
  await loginWithCredentials(page, ACCOUNTS.admin)
  await page.goto('/admin/incidents')
  await page.getByTestId('inc-search').fill(note)
}

// Reads the number on a stat button (New / Acknowledged / Resolved). The button shows e.g. "3" then "New".
async function statCount(page, key) {
  return parseInt(await page.getByTestId(`stat-${key}`).innerText(), 10)
}

// ---------------------------------------------------------------------------
// Setup + the 5 tests
// ---------------------------------------------------------------------------

test.describe('F5 Incidents', () => {
  test.describe.configure({ mode: 'serial' }) // run in order (each test builds on the one before)

  // SETUP (not a test): one volunteer with an ACCEPTED place. Talks to the server directly because it is preparation.
  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120 * 1000) // allocating hundreds of volunteers takes a while
    const baseURL = testInfo.project.use.baseURL
    const admin = await playwright.request.newContext({ baseURL })
    const login = await admin.post('/api/users/login', {
      data: { email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
    })
    expect(login.ok(), 'admin login failed: is the server running and is the admin seeded?').toBeTruthy()

    // The same three steps an admin does on the Allocation page: reset -> allocate -> publish
    const steps = [
      ['reset', '/api/assignments/run', { reset: true, show: SHOW }],
      ['allocate', '/api/assignments/run', { reset: false, show: SHOW }],
      ['publish', '/api/assignments/publish', { show: SHOW }],
    ]
    for (const [what, path, data] of steps) {
      const response = await admin.post(path, { data })
      expect(response.ok(), `could not ${what} ${SHOW}`).toBeTruthy()
    }

    // Pick 1 demo volunteer with a pending place, log in as them and accept it
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

  // TEST 1 – A volunteer sends an incident report from the Event day page
  test('a volunteer can report a delayed bus and sees that HQ was notified', async ({ page }) => {
    // The form looks up a street address for the GPS position through OneMap (an outside service).
    // We answer it ourselves so the test does not depend on the internet.
    await page.route('**/api/incidents/where*', (route) =>
      route.fulfill({ json: { address: 'E2E test address, Singapore' } }),
    )

    await loginWithCredentials(page, { email: volunteer.email, password: DEMO_PASSWORD })
    await page.goto('/volunteer/tracking')
    await page.getByTestId('sheet-toggle').click() // the bottom sheet starts collapsed; the report button is inside it
    await page.getByTestId('incident-open').click()

    // Submit stays off until the volunteer has described the problem
    await page.getByTestId('incident-type-BUS_DELAYED').click()
    await expect(page.getByTestId('incident-submit')).toBeDisabled()
    await page.getByTestId('incident-note').fill(REPORT_NOTE)
    await expect(page.getByTestId('incident-submit')).toBeEnabled()
    await page.getByTestId('incident-submit').click()

    // A confirmation box appears; OK closes it
    await expect(page.getByText('Report sent!')).toBeVisible()
    await page.getByTestId('confirm-ok').click()
    await expect(page.getByText('Report sent!')).toBeHidden()
  })

  // TEST 2 – HQ sees the report in the list, with the volunteer's school (this also guards the old "Unknown school" bug)
  test('the report appears on the HQ list as New, with the right school', async ({ page }) => {
    await openIncidentsAndSearch(page, REPORT_NOTE)

    const card = page.locator(CARDS)
    await expect(card).toHaveCount(1) // the page loads in the background, so this waits for it
    await expect(card).toContainText('Bus Delayed')
    await expect(card).toContainText('New')
    await expect(card).toContainText(volunteer.school) // would say "Unknown school" if the form forgot to send it
    await expect(card).not.toContainText('Unknown school')
  })

  // TEST 3 – HQ opens the incident and acknowledges it
  test('HQ can open the incident and acknowledge it', async ({ page }) => {
    await openIncidentsAndSearch(page, REPORT_NOTE)
    await page.locator(CARDS).click() // opens the details card (the list folds away)

    const focus = page.getByTestId('inc-focus-card')
    await expect(focus).toContainText(REPORT_NOTE) // what the volunteer wrote
    await expect(focus).toContainText(volunteer.name) // who reported it

    await page.getByTestId('incident-ack').click()
    await expect(page.getByTestId('notice')).toContainText('Acknowledged') // the popup
    await expect(page.getByTestId('incident-ack')).toHaveCount(0) // already acknowledged
    await expect(page.getByTestId('incident-resolve')).toBeVisible() // the next step is now offered
  })

  // TEST 4 – HQ resolves it; a note on how it was resolved is required
  test('HQ must write a note to resolve the incident, then it is closed', async ({ page }) => {
    await openIncidentsAndSearch(page, REPORT_NOTE)
    await page.locator(CARDS).click()
    await page.getByTestId('incident-resolve').click()

    // The OK button stays off until a note is typed
    await expect(page.getByTestId('confirm-ok')).toBeDisabled()
    await page.getByTestId('confirm-input').fill(RESOLVE_NOTE)
    await expect(page.getByTestId('confirm-ok')).toBeEnabled()
    await page.getByTestId('confirm-ok').click()

    await expect(page.getByTestId('notice')).toContainText('Resolved')
    const focus = page.getByTestId('inc-focus-card')
    await expect(focus).toContainText(RESOLVE_NOTE) // the history shows how it was resolved
    await expect(page.getByTestId('incident-ack')).toHaveCount(0) // nothing left to do
    await expect(page.getByTestId('incident-resolve')).toHaveCount(0)
  })

  // TEST 5 – A report that arrives while HQ has the page open shows up by itself (live update, no reload)
  test('a new report appears on an open HQ page without reloading', async ({ page, playwright }, testInfo) => {
    await loginWithCredentials(page, ACCOUNTS.admin)
    // Wait until the page has really loaded the list, otherwise the counter still shows 0 and "before" would be wrong
    const listLoaded = page.waitForResponse(
      (r) => /\/api\/incidents(\?|$)/.test(r.url()) && r.request().method() === 'GET',
    )
    await page.goto('/admin/incidents')
    await listLoaded
    await expect(page.getByTestId('stat-new')).toBeVisible()
    const before = await statCount(page, 'new')

    // The volunteer sends a report straight to the server, the same call the form makes (POST /api/incidents)
    const volunteerApi = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    await volunteerApi.post('/api/users/login', { data: { email: volunteer.email, password: DEMO_PASSWORD } })
    const sent = await volunteerApi.post('/api/incidents', {
      data: { type: 'BUS_DELAYED', severity: 'medium', note: LIVE_NOTE, school: volunteer.school, lat: TAMPINES.latitude, lng: TAMPINES.longitude },
    })
    expect(sent.ok(), 'could not send the second report').toBeTruthy()
    await volunteerApi.dispose()

    // We never reload the page. The server pushes the news, so the New counter goes up by one...
    await expect.poll(() => statCount(page, 'new'), { timeout: 15 * 1000 }).toBe(before + 1)
    // ...and searching for the new note finds its card
    await page.getByTestId('inc-search').fill(LIVE_NOTE)
    await expect(page.locator(CARDS)).toHaveCount(1)
  })
})
