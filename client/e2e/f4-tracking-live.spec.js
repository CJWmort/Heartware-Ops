// Browser tests (Playwright) for feature F4: Tracking and the HQ Live Board.

import { test, expect } from '@playwright/test'
import { ACCOUNTS, DEMO_PASSWORD, loginWithCredentials } from './helpers'

const SHOW = process.env.E2E_SHOW || 'NE Show 4'
const DEMO_EMAIL = /^demo\.volunteer\d+@demo\.sg$/

const TAMPINES = { latitude: 1.3496, longitude: 103.9568 }
const PADANG = { latitude: 1.2905591, longitude: 103.8529176 }

test.use({ geolocation: TAMPINES, permissions: ['geolocation'] })

let volunteerA = { email: '', name: '', school: '' }
let volunteerB = { email: '', name: '', school: '' }

// Opens the volunteer's Event day page and pulls up the bottom sheet. The checkpoint buttons live
// inside that sheet, and it starts collapsed (only a thin handle shows).
async function openTrackingPage(page, volunteer) {
  await loginWithCredentials(page, { email: volunteer.email, password: DEMO_PASSWORD })
  await page.goto('/volunteer/tracking')
  await page.getByTestId('sheet-toggle').click()
  await expect(page.getByTestId('journey-count')).toBeVisible()
}

// Opens the admin Live board on our show
async function openLiveBoard(page) {
  await loginWithCredentials(page, ACCOUNTS.admin)
  await page.goto('/admin/live')
  await page.getByTestId('hq-show-select').click()
  await page.getByRole('option', { name: SHOW }).click()
  await expect(page.getByTestId('hq-show-select')).toContainText(SHOW)
}

// Types a volunteer's name in the board's search box and clicks the match, so their card opens
async function selectOnBoard(page, volunteer) {
  await page.getByTestId('hq-search').fill(volunteer.name)
  const match = page.getByTestId('hq-result').filter({ hasText: volunteer.name })
  await expect(match).toBeVisible()
  await match.click()
}

// Sends a volunteer's location to the server the same way their phone does (PUT /api/locations/me).
// The server accepts at most one update per volunteer every 5 seconds (it answers 429 otherwise), so
// we keep trying until it says OK.
async function sendLocation(api, position) {
  await expect
    .poll(
      async () =>
        (await api.put('/api/locations/me', { data: { lat: position.latitude, lng: position.longitude, accuracy: 10 } })).status(),
      { timeout: 20 * 1000, intervals: [1000] },
    )
    .toBe(200)
}

// F4 tests - the 5 browser tests for Live monitoring (HQ Live Board) and the volunteer Tracking page.
// They run one after another (serial) and set up their own data first.
test.describe('F4 Live monitoring & tracking', () => {
  test.describe.configure({ mode: 'serial' })

  // SETUP (not a test): make two volunteers who have an ACCEPTED place. Talks to the server directly
  // because it is preparation. (Accepting itself is already tested in Feature 2.)
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
    const picks = rows
      .filter(
        (row) =>
          row.show === SHOW && row.status === 'Pending' && row.published && row.school && DEMO_EMAIL.test(row.volunteer?.email || ''),
      )
      .slice(0, 2)
    expect(picks, `need 2 demo volunteers with a place in ${SHOW}: is seed:volunteers done?`).toHaveLength(2)

    for (const row of picks) {
      const volunteerApi = await playwright.request.newContext({ baseURL })
      await volunteerApi.post('/api/users/login', { data: { email: row.volunteer.email, password: DEMO_PASSWORD } })
      const accepted = await volunteerApi.patch(`/api/assignments/${row._id}/accept`)
      expect(accepted.ok(), `could not accept for ${row.volunteer.email}`).toBeTruthy()
      await volunteerApi.dispose()
    }
    // info(row) - picks the volunteer's email, name and school name out of an assignment row.
    const info = (row) => ({ email: row.volunteer.email, name: row.volunteer.name, school: row.school.name })
    volunteerA = info(picks[0])
    volunteerB = info(picks[1])
    await admin.dispose()
  })

  // TEST 1 – The Event day page loads the volunteer's school and starts sharing their location
  test('the Event day page shows my school, my journey and that I am sharing my location', async ({ page }) => {
    await openTrackingPage(page, volunteerA)
    await expect(page.getByTestId('track-school')).toContainText(volunteerA.school)
    await expect(page.getByTestId('journey-count')).toHaveText('0/8')
    await expect(page.getByTestId('journey-next')).toContainText('Reached allocated school')
    await expect(page.getByTestId('share-status')).toHaveText(/sharing location/i, { timeout: 20 * 1000 })
  })

  // TEST 2 – Clocking a checkpoint moves the journey forward
  test('clocking a checkpoint moves the journey to the next one', async ({ page }) => {
    await openTrackingPage(page, volunteerA)
    await page.getByTestId('journey-next').click()

    await expect(page.getByTestId('journey-count')).toHaveText('1/8')
    await expect(page.getByTestId('journey-next')).toContainText('Departed from school')
    await expect(page.getByTestId('journey-undo')).toContainText('Reached allocated school')
  })

  // TEST 3 – Undo works, and finishing all 8 checkpoints ends the day
  test('undo steps back one checkpoint and all 8 checkpoints end the day', async ({ page }) => {
    await openTrackingPage(page, volunteerB)

    await test.step('clock one checkpoint, then undo it', async () => {
      await page.getByTestId('journey-next').click()
      await expect(page.getByTestId('journey-count')).toHaveText('1/8')
      await page.getByTestId('journey-undo').click()
      await expect(page.getByTestId('journey-count')).toHaveText('0/8')
    })

    await test.step('clock all 8 checkpoints in order', async () => {
      for (let done = 1; done <= 8; done++) {
        await page.getByTestId('journey-next').click()
        await expect(page.getByTestId('journey-count')).toHaveText(`${done}/8`)
      }
      await expect(page.getByTestId('journey-complete')).toBeVisible()
      await expect(page.getByTestId('journey-next')).toHaveCount(0)
    })
  })

  // TEST 4 – HQ sees the volunteer's checkpoint on the Live board
  test('the Live board shows the checkpoint the volunteer has reached', async ({ page }) => {
    await openLiveBoard(page)
    await selectOnBoard(page, volunteerA)

    await expect(page.getByTestId('vol-card-stage')).toContainText('At school')
    await expect(page.getByTestId('vol-card-stage')).toContainText('1/8')
  })

  // TEST 5 – HQ gets a zone alert when a volunteer arrives at the Padang
  test('the Live board raises an alert when a volunteer enters the inner ring', async ({ page, playwright }, testInfo) => {
    test.setTimeout(90 * 1000)
    const volunteerApi = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL })
    await volunteerApi.post('/api/users/login', { data: { email: volunteerA.email, password: DEMO_PASSWORD } })

    await sendLocation(volunteerApi, TAMPINES)
    await openLiveBoard(page)
    await selectOnBoard(page, volunteerA)
    await expect(page.getByTestId('vol-card-status')).toContainText(/live/i)

    await sendLocation(volunteerApi, PADANG)

    await expect(page.getByTestId('hq-zone-count-inner')).toHaveText(/^[1-9]\d*$/, { timeout: 20 * 1000 })
    await page.getByTestId('hq-bell').click()
    const event = page.getByTestId('hq-event').filter({ hasText: volunteerA.name })
    await expect(event.first()).toContainText(/entered the inner ring/i)
    await volunteerApi.dispose()
  })
})
