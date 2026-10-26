// Feature 1 – Home, Login & Register  (HomeView.vue, LoginView.vue, RegisterView.vue)
// 5 end-to-end tests. Each one acts like a real visitor in a real browser.
//
// What must be running first:
//   - the SERVER with OTP_MOCK=true in server/config.env (so the email code is shown on the page)
//   - an admin account made with `pnpm run seed:admin`, and E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD set to it
//   - the demo volunteers from `pnpm run seed:volunteers` (test 2 uses demo.volunteer001)
// Playwright starts the Vue dev server itself. Tests 1 and 4 do NOT need the server at all.
// Run just this file:  pnpm run test:e2e -- f1-home-login-register
import { test, expect } from '@playwright/test'
import { ACCOUNTS } from './helpers'

// ---------------------------------------------------------------------------
// Small helpers used only by this file
// ---------------------------------------------------------------------------

// The address our fake OneMap answer returns for postal code 520201.
const TAMPINES_ADDRESS = 'BLK 201 TAMPINES STREET 21 SINGAPORE 520201'

// OneMap is an outside website with a usage limit and it can be slow or down.
// A test that depends on it would fail for reasons that are not our bug ("flaky"),
// so we intercept the browser's postal-lookup request and answer it ourselves.
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

// Proves we are logged in: the navbar shows a Logout button.
// On a phone the navbar is collapsed, so we open the menu first.
async function expectLoggedIn(page) {
  await expect(page.getByTestId('navbar')).toBeVisible()
  const toggle = page.getByTestId('nav-toggle')
  if (await toggle.isVisible()) await toggle.click()
  await expect(page.getByTestId('nav-logout')).toBeVisible()
}

// Makes details for a brand-new volunteer. The server rejects an email or phone that is
// already registered, so BOTH must be different on every run to keep the test repeatable.
function newVolunteer() {
  const stamp = Date.now()
  // Singapore mobile numbers are 8 digits starting with 6, 8 or 9 (that is the form's rule)
  const phone = '9' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
  return {
    name: 'E2E Volunteer',
    email: `e2e-${stamp}@test.sg`,
    phone,
    postal: '520201',
    password: 'Password123!', // meets every rule: 8+ chars, upper, lower, number, special
  }
}

// Fills every field on the Register form with valid data.
// Pass { consent: false } to leave the location-sharing switch OFF.
async function fillRegisterForm(page, v, { consent = true } = {}) {
  await page.getByTestId('reg-name').fill(v.name)
  await page.getByTestId('reg-email').fill(v.email)
  await page.getByTestId('reg-phone').fill(v.phone)
  await page.getByTestId('reg-postal').fill(v.postal)
  // The address box fills itself after the (mocked) lookup, so wait for it before moving on
  await expect(page.getByTestId('reg-address')).toHaveValue(TAMPINES_ADDRESS)
  await page.getByTestId('reg-password').fill(v.password)
  await page.getByTestId('reg-confirm-password').fill(v.password)
  if (consent) await page.getByTestId('reg-consent').check()
}

// ---------------------------------------------------------------------------
// The 5 tests
// ---------------------------------------------------------------------------

test.describe('F1 Home, Login & Register', () => {
  // TEST 1 – Home page: the two big buttons lead to the right pages
  test('home page buttons lead a guest to Register and Login', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('cta-register').click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByTestId('reg-submit')).toBeVisible() // the Register form really loaded

    await page.goBack() // browser Back button -> home page again
    await page.getByTestId('cta-login').click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('login-submit')).toBeVisible() // the Login form really loaded
  })

  // TEST 2 – Login: bad logins are refused with a message and nobody gets in
  test('wrong password shows an error popup and stays on the login page', async ({ page }) => {
    await page.goto('/login')

    await test.step('wrong password is rejected by the server', async () => {
      await submitLogin(page, { email: ACCOUNTS.volunteer.email, password: 'definitely-not-the-password' })
      await expect(page.getByTestId('notice')).toContainText(/unable to log in/i)
      await expect(page).toHaveURL(/\/login$/) // still on the login page, not logged in
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
    await page.goto('/admin/allocation') // admin-only page, and we are not logged in
    await expect(page).toHaveURL(/\/login\?redirect=/) // guard sent us to login and remembered where we were going

    await submitLogin(page, ACCOUNTS.admin)

    await expect(page).toHaveURL(/\/admin\/allocation$/) // ...and login sent us back there
    await expectLoggedIn(page)
  })

  // TEST 4 – Register: the form refuses bad input and will not let you sign up until it is all valid
  test('register form shows field errors and keeps Sign up disabled until consent is given', async ({ page }) => {
    await mockPostalLookup(page)
    await page.goto('/register')

    await test.step('bad email, phone and password each show their own message', async () => {
      // .blur() = click away from the box; the form checks a field when you leave it
      await page.getByTestId('reg-email').fill('kuah@') // nothing after the @
      await page.getByTestId('reg-email').blur()
      await expect(page.getByTestId('reg-email-error')).toContainText(/email provider/i)

      await page.getByTestId('reg-phone').fill('51234567') // must start with 6, 8 or 9
      await page.getByTestId('reg-phone').blur()
      await expect(page.getByTestId('reg-phone-error')).toContainText(/starting with 6, 8 or 9/i)

      await page.getByTestId('reg-password').fill('abc') // too short, no capital, no number...
      await page.getByTestId('reg-password').blur()
      await expect(page.getByTestId('reg-password-error')).toContainText(/requirements/i)
      await expect(page.getByTestId('reg-password-rules')).toBeVisible() // the checklist of rules

      await page.getByTestId('reg-confirm-password').fill('xyz') // does not match the password
      await page.getByTestId('reg-confirm-password').blur()
      await expect(page.getByTestId('reg-confirm-password-error')).toContainText(/do not match/i)
    })

    await test.step('Sign up stays disabled and the hint says how many fields are left', async () => {
      await expect(page.getByTestId('reg-submit')).toBeDisabled()
      await expect(page.getByTestId('reg-submit-hint')).toContainText(/more field/i)
    })

    await test.step('with every field valid but consent OFF, Sign up is still disabled', async () => {
      await fillRegisterForm(page, newVolunteer(), { consent: false }) // fill() replaces the bad values above
      await expect(page.getByTestId('reg-submit')).toBeDisabled()
      await expect(page.getByTestId('reg-submit-hint')).toContainText(/location sharing/i)
    })

    await test.step('turning consent ON enables Sign up', async () => {
      await page.getByTestId('reg-consent').check()
      await expect(page.getByTestId('reg-submit')).toBeEnabled()
    })
  })

  // TEST 5 – Register happy path: sign up -> type the emailed code -> account exists and we are logged in
  test('a new volunteer can sign up with the email code and ends up logged in', async ({ page }) => {
    await mockPostalLookup(page) // only OneMap is faked; the code, account and login below are all REAL server calls
    await page.goto('/register')
    await fillRegisterForm(page, newVolunteer())
    await page.getByTestId('reg-submit').click()

    // Step 2 of the form: the code screen
    await expect(page.getByTestId('reg-otp')).toBeVisible()
    // With OTP_MOCK=true the server returns the code and the page prints it. No real email is needed.
    const devCode = page.getByTestId('reg-otp-dev-code')
    test.skip(!(await devCode.isVisible()), 'needs OTP_MOCK=true on the server (the code is not shown otherwise)')
    await page.getByTestId('reg-otp-code').fill((await devCode.innerText()).trim())
    await page.getByTestId('reg-otp-submit').click()

    // The page reloads itself after creating the account, so wait until we have left /register
    await page.waitForURL((url) => !url.pathname.startsWith('/register'))
    await expectLoggedIn(page)
  })
})
