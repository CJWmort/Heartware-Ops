# Testing

| What                              | Command                                    |
| --------------------------------- | ------------------------------------------ |
| Server tests (no database needed) | `cd server && pnpm test`                   |
| Client unit tests                 | `cd client && pnpm run test:unit -- --run` |
| End-to-end tests (Playwright)     | `cd client && pnpm run test:e2e`           |
| Lint                              | `cd client && pnpm run lint:oxlint`        |

The server tests and the client unit tests run in CI on every push (see `.github/workflows/ci.yml`). The end-to-end tests need a seeded database, so they are run locally.

## Running the end-to-end tests

There are 30 browser tests, 5 per feature (F1 to F6), in `client/e2e/`. Each feature file sets up its own data and runs in order. Every test runs on a desktop browser and on an iPhone-sized screen.

**Credentials are never stored in the repo.** You choose them when you seed the database and pass them to the tests with environment variables.

1. **Use a local or test database** (see warning below). Put its connection string in `server/config.env`, and add `DEMO_PASSWORD=<a password you choose>` to the same file.
2. **Seed the database** from `server/`:
   ```bash
   pnpm run seed:shows
   pnpm run seed:schools
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-a-password' pnpm run seed:admin
   pnpm run seed:volunteers
   ```
   On Windows PowerShell, set variables like this instead: `$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="choose-a-password"; pnpm run seed:admin`.
3. **Start the server with the login limit switched off** (the E2E suite logs in many times):
   ```bash
   DISABLE_LOGIN_RATE_LIMIT=true pnpm run dev
   ```
   This flag is ignored when `NODE_ENV=production`.
4. **Install the browser once:** `cd client && pnpm install && pnpm exec playwright install chromium`.
5. **Run the tests**, passing the same credentials you seeded:
   ```bash
   E2E_ADMIN_EMAIL=admin@example.com \
   E2E_ADMIN_PASSWORD='choose-a-password' \
   E2E_DEMO_PASSWORD='the DEMO_PASSWORD you set' \
   pnpm run test:e2e
   ```
   Playwright starts the client on http://localhost:5173 by itself. Useful extras: `pnpm run test:e2e:ui` (watch the tests run), `pnpm exec playwright test e2e/f2-allocation.spec.js` (one feature), `pnpm exec playwright show-report` (open the HTML report).

## Things to know

- **No email code needed:** no test creates a new account, so the tests do not need the OTP email.
- **OneMap:** the browser's OneMap-based requests are faked in F1 (postal lookup), F3 (route) and F5 (incident address), so those tests do not depend on the outside website. The **server** still calls OneMap when the F6 ordering test places an order, so the server needs internet for that test.
- **Login limit:** it is switched off only when the server is started with `DISABLE_LOGIN_RATE_LIMIT=true` (step 3). It stays on in production.
- **They change the database.** F2 to F5 reset and re-allocate one show (`NE Show 4` by default, or set `E2E_SHOW`), which erases every assignment in it. Each F6 run orders a badge for one demo volunteer, and that volunteer's design stays locked for good (the app never deletes orders), so each run uses up one of the 400 demo volunteers. F5 leaves incidents behind (their notes start with "E2E"). Use a local or test database only. **Never run these tests against the deployed database.**

The E2E tests also log in as the demo volunteer `demo.volunteer001@demo.sg`, using the `DEMO_PASSWORD` you seeded.
