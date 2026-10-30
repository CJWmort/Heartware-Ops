// Browser tests (Playwright) for feature F1: Home, Login and Register.

import { test, expect } from '@playwright/test'
import { ACCOUNTS } from './helpers'

const TAMPINES_ADDRESS = 'BLK 201 TAMPINES STREET 21 SINGAPORE 520201'

// OneMap is an outside website with a usage limit and it can be slow or down. A test that depends on
// it would fail for reasons that are not our bug ("flaky"), so we intercept the browser's
// postal-lookup request and answer it ourselves.
async function mockPostalLookup(page) {
  await page.route('**/api/users/postal-lookup**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: { address: TAMPINES_ADDRESS } }),
  )
}

// Types into the REAL login form and presses the button (same steps as a user).
async function submitLogin(page, { email, password }) {
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
}

// Proves we are logged in: the navbar shows a Logout button. On a phone the navbar is collapsed, so we
// open the menu first.
async function expectLoggedIn(page) {
  await expect(page.getByTestId('navbar')).toBeVisible()
  const toggle = page.getByTestId('nav-toggle')
  if (await toggle.isVisible()) await toggle.click()
  await expect(page.getByTestId('nav-logout')).toBeVisible()
}

// Makes details for a brand-new volunteer. The server rejects an email or phone that is already
// registered, so BOTH must be different on every run to keep the test repeatable.
function newVolunteer() {
  const stamp = Date.now()
  const phone = '9' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
  return {
    name: 'E2E Volunteer',
    email: `e2e-${stamp}@test.sg`,
    phone,
    postal: '520201',
    password: 'Password123!',
  }
}

// Fills every field on the Register form with valid data. Pass { consent: false } to leave the
// location-sharing switch OFF.
async function fillRegisterForm(page, v, { consent = true } = {}) {
  await page.getByTestId('reg-name').fill(v.name)
  await page.getByTestId('reg-email').fill(v.email)
  await page.getByTestId('reg-phone').fill(v.phone)
  await page.getByTestId('reg-postal').fill(v.postal)
  await expect(page.getByTestId('reg-address')).toHaveValue(TAMPINES_ADDRESS)
  await page.getByTestId('reg-password').fill(v.password)
  await page.getByTestId('reg-confirm-password').fill(v.password)
  if (consent) await page.getByTestId('reg-consent').check()
}

// F1 tests - the 5 browser tests for Home, Login and Register: home buttons lead to the right pages,
// login errors, successful login, register checks and so on.
test.describe('F1 Home, Login & Register', () => {
  // TEST 1 – Home page: the two big buttons lead to the right pages
  test('home page buttons lead a guest to Register and Login', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('cta-register').click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByTestId('reg-submit')).toBeVisible()

    await page.goBack()
    await page.getByTestId('cta-login').click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  // TEST 2 – Login: bad logins are refused with a message and nobody gets in
  test('wrong password shows an error popup and stays on the login page', async ({ page }) => {
    await page.goto('/login')

    await test.step('wrong password is rejected by the server', async () => {
      await submitLogin(page, { email: ACCOUNTS.volunteer.email, password: 'definitely-not-the-password' })
      await expect(page.getByTestId('notice')).toContainText(/unable to log in/i)
      await expect(page).toHaveURL(/\/login$/)
    })

    await test.step('empty fields are caught before asking the server', async () => {
      await page.getByTestId('login-email').fill('')
      await page.getByTestId('login-password').fill('')
      await page.getByTestId('login-submit').click()
      await expect(page.getByTestId('notice')).toContainText(/enter your email and password/i)
    })
  })

  // TEST 3 – Login + route guard: a guest sent to /login is returned to the page they wanted
  test('after logging in, the guest returns to the page they first asked for', async ({ page }) => {
    await page.goto('/admin/allocation')
    await expect(page).toHaveURL(/\/login\?redirect=/)

    await submitLogin(page, ACCOUNTS.admin)

    await expect(page).toHaveURL(/\/admin\/allocation$/)
    await expectLoggedIn(page)
  })

  // TEST 4 – Register: the form refuses bad input and will not let you sign up until it is all valid
  test('register form shows field errors and keeps Sign up disabled until consent is given', async ({ page }) => {
    await mockPostalLookup(page)
    await page.goto('/register')

    await test.step('bad email, phone and password each show their own message', async () => {
      await page.getByTestId('reg-email').fill('kuah@')
      await page.getByTestId('reg-email').blur()
      await expect(page.getByTestId('reg-email-error')).toContainText(/email provider/i)

      await page.getByTestId('reg-phone').fill('51234567')
      await page.getByTestId('reg-phone').blur()
      await expect(page.getByTestId('reg-phone-error')).toContainText(/starting with 6, 8 or 9/i)

      await page.getByTestId('reg-password').fill('abc')
      await page.getByTestId('reg-password').blur()
      await expect(page.getByTestId('reg-password-error')).toContainText(/requirements/i)
      await expect(page.getByTestId('reg-password-rules')).toBeVisible()

      await page.getByTestId('reg-confirm-password').fill('xyz')
      await page.getByTestId('reg-confirm-password').blur()
      await expect(page.getByTestId('reg-confirm-password-error')).toContainText(/do not match/i)
    })

    await test.step('Sign up stays disabled and the hint says how many fields are left', async () => {
      await expect(page.getByTestId('reg-submit')).toBeDisabled()
      await expect(page.getByTestId('reg-submit-hint')).toContainText(/more field/i)
    })

    await test.step('with every field valid but consent OFF, Sign up is still disabled', async () => {
      await fillRegisterForm(page, newVolunteer(), { consent: false })
      await expect(page.getByTestId('reg-submit')).toBeDisabled()
      await expect(page.getByTestId('reg-submit-hint')).toContainText(/location sharing/i)
    })

    await test.step('turning consent ON enables Sign up', async () => {
      await page.getByTestId('reg-consent').check()
      await expect(page.getByTestId('reg-submit')).toBeEnabled()
    })
  })

  // TEST 5 – Register happy path: sign up -> type the emailed code -> account exists and we are logged
  // in
  test('a new volunteer can sign up with the email code and ends up logged in', async ({ page }) => {
    await mockPostalLookup(page)
    await page.goto('/register')
    await fillRegisterForm(page, newVolunteer())
    await page.getByTestId('reg-submit').click()

    await expect(page.getByTestId('reg-otp')).toBeVisible()
    const devCode = page.getByTestId('reg-otp-dev-code')
    test.skip(!(await devCode.isVisible()), 'needs OTP_MOCK=true on the server (the code is not shown otherwise)')
    await page.getByTestId('reg-otp-code').fill((await devCode.innerText()).trim())
    await page.getByTestId('reg-otp-submit').click()

    await page.waitForURL((url) => !url.pathname.startsWith('/register'))
    await expectLoggedIn(page)
  })
})
