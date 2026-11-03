# Heartware Ops (IS216 G5T1)

A web app that helps Heartware run the **NDP show volunteer programme**. Volunteers register and say when they are free, the app **automatically assigns each volunteer to a nearby primary school**, volunteers follow their route on show day, and the HQ team watches everything live.

- **Live app:** https://heartware-ops.vercel.app
- **Hero videos on the home page** (about volunteering for NDP Show Management):
  - Video 1: https://youtu.be/pSg-DubiZK0
  - Video 2: https://youtube.com/shorts/UxlLOv2rBpM
- **Course:** IS216 Web Application Development 2, Group 5 Team 1

## Features at a glance

| #   | Feature              | Who uses it       | What it does                                                                                                                                                                                                    |
| --- | -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Smart Registration   | Volunteer         | Email OTP stops fake sign-ups. The postal code is geocoded with OneMap so the address is accurate. A progress card tracks the form.                                                                             |
| F2  | Smart Allocation     | Admin             | The ScarcityFirst algorithm matches volunteers to schools by straight-line (haversine) distance, filling the hardest-to-staff school first. The admin reviews a draft and publishes it per show. Once a show is published, volunteers who join later go on the reserve list and open places are filled from it, nearest volunteer first. |
| F3  | Automated Assignment | Volunteer         | Submit availability, then accept, decline or withdraw. Directions via OneMap (drive or walk), with a Google Maps link as backup. A freed place goes to the nearest reserve.                                                     |
| F4  | Live Tracking        | Volunteer + Admin | Checkpoint-based journey tracking. The HQ live board shows volunteers on a map with zone alerts.                                                                                                                |
| F5  | Incident Reporting   | Volunteer + Admin | Volunteers report incidents. HQ triages them on a queue and map and chats with volunteers in real time.                                                                                                         |
| F6  | Badges               | Volunteer + Admin | Badge studio and orders, badge wall, and automatic awards (Full Route, Early Bird, Super Sub). Badge and order changes show up live.                                                                                                                             |

The coordinator role in the code is called **admin** in the app.

## Features and how to use them

Pages are reached from the navbar after logging in. **Volunteers** land on _My assignment_. **Admins** land on _Allocation_.

### Home page (everyone)

- Hero video player with two Heartware videos about volunteering for NDP Show Management (use the arrows or dots to switch).
- Feature cards explaining what the app does, and buttons to **Sign up to volunteer** or **Log in**.

### F1 Smart Registration (volunteer)

Pages: `/register`, `/login`

What it does:

- The postal code is checked with OneMap and the address is filled in, so allocation distances are accurate.
- A 6-digit email code (OTP) must be entered before the account is created, so fake emails cannot register.
- A progress card on the left tracks how much of the form is complete.
- Location sharing consent must be switched on before **Sign up** is enabled.

How to try it:

1. Open **Sign up to volunteer** and fill in name, email, phone, password and confirm password.
2. Enter a real Singapore postal code. A wrong one shows "This postal code doesn't exist in Singapore."
3. Switch on **Location Sharing**, then press **Sign up**.
4. Enter the code from the email. If `BREVO_API_KEY` is empty (local test mode) the code is shown on the page.
5. You are logged in and taken to _My assignment_. Log out and log back in on `/login` to test login, including the wrong-password error.

### F2 Smart Allocation (admin)

Page: _Allocation_

What it does:

- Builds the allocation for one show with **ScarcityFirst**: it finds the school that is hardest to staff (the one whose nearest free volunteers are furthest away, by haversine straight-line distance), gives it its nearest free volunteers, and repeats. Volunteers left over go on the **reserve list**. There is no distance limit in this step.
- A **Greedy** matcher (`server/utils/greedy.js`) is also in the code, but the allocation run does not call it at the moment.
- Allocation is a **draft** until the admin publishes it. Volunteers only see their school after **Publish**.
- Before Publish, volunteers wait for the admin to press **Allocate**. After a show is published, volunteers who tick it later join the reserve list, and any open place is filled from the reserve list, nearest volunteer first. Places with the fewest reserves within 10 km are filled first, so hard-to-reach schools are not left with only far-away people.
- Three number cards at the top (**Schools**, **Pending**, **Need volunteers**) double as filters. All filters (search, zone, time and the cards) combine, and **Clear all** resets them.

How to try it (needs several volunteers who have ticked the show; `pnpm run seed:volunteers` adds 400):

1. Log in as admin and pick a show in the show dropdown.
2. Press **Allocate** and confirm. Rows appear tagged _Draft_, grouped by school on the list and the map. Press the **Need volunteers** card to see only schools that are short.
3. Click a school to see its places filled and its volunteers. The _Unassigned volunteers_ panel lists anyone left over.
4. Press **Publish** (it shows how many drafts are waiting) and confirm. Re-running Allocate is safe: volunteers who already accepted keep their school.
5. **Reset** erases all assignments, including accepted ones. Use it only to start over.

### F3 Automated Assignment (volunteer)

Page: _My assignment_

What it does:

- The volunteer submits availability and the backend assigns a school automatically. Each card shows the show, school, reporting time, reporting location and status.
- Offers can be **Accepted** or **Declined** (with a reason). An accepted place can later be **withdrawn** (with a reason).
- **Directions** shows the route on a map with **Drive** and **Walk** modes. A **Google Maps** link is the backup in case OneMap is limited or down.
- A show that has been declined or withdrawn is locked in availability, so it cannot be ticked again. An accepted show cannot be unticked either (withdraw instead).
- If a volunteer withdraws, the freed place goes to the nearest reserve.

How to try it:

1. Log in as a volunteer and press **Change Availability**. Tick the shows you can attend and press **Save**.
2. Wait for the admin to Allocate and Publish (see F2). The card then shows the offer with **Accept** and **Decline**.
3. Press **Directions** and switch between Drive and Walk. Press the Google Maps link to open the backup.
4. Press **Decline**, confirm, and give a reason. The buttons disappear and the show is locked in _Change Availability_.
5. For an accepted place, press **Withdraw**, confirm and give a reason.

### F4 Live Tracking (volunteer and admin)

Pages: volunteer _Event day_, admin _Live board_

What it does:

- The volunteer's phone shares its location (if consent was given) and the volunteer clocks through **8 checkpoints**: reached school, departed school, reached pick-up/drop-off, reached Padang, leaving Padang, reached pick-up/drop-off, back at school, dismissal. **Undo** steps back one.
- The HQ Live board shows every volunteer on a map with the stage they have reached. Zones are Inner, Outer and Outside. A bell and a _Zone activity_ list raise an alert when a volunteer enters a ring.
- Location updates are limited to one every 5 seconds per volunteer.

How to try it:

1. As a volunteer with an accepted place, open _Event day_ and allow location access in the browser. It shows your school, your journey and that you are sharing your location.
2. On a phone, pull up the bottom sheet (on a wider screen the panel is already open) and press the next checkpoint button. The journey count moves forward. Press **Undo** to go back.
3. In another window, log in as admin, open _Live board_, pick the show, and search for the volunteer. Their card shows the checkpoint reached.
4. Watch the bell for zone alerts when a volunteer moves into the inner ring.

### F5 Incident Reporting (volunteer and admin)

Pages: volunteer _Event day_ (report form), admin _Incidents_ and the live chat

What it does:

- A volunteer reports an incident: choose a type (Student Unwell, Student Missing, Bus Delayed, Bus Breakdown, Items Missing, Others), add a note and send. The severity comes from the type, and the address is filled in from the volunteer's location.
- HQ sees new reports instantly (no reload) on a map and list with **New**, **Acknowledged** and **Resolved** counters.
- HQ **acknowledges** an incident, then **resolves** it. A resolving note is required.
- HQ and volunteers can chat in real time.

How to try it:

1. As a volunteer, press **Report an incident**, pick _Bus Delayed_, add a note and send. You see "Report sent!".
2. As admin, open _Incidents_. The report appears as **New** with the right school. Use the search box to find it; while searching, every status found in the results lights up on the counters.
3. Open the incident, press **Acknowledge**, then **Resolve** and write a note. The counters update.
4. Open the chat button to message the volunteer.
5. Demo data: `pnpm run seed:incidents` adds 60 incidents (assign volunteers to schools first).

### F6 Badges (volunteer and admin)

Pages: volunteer _Badge Studio_ and _My badges_, admin _Badges & orders_

What it does:

- **Badge Studio:** design a custom badge with an emblem (heart, star, crescent, trophy, smile, balloon), a shape (circle, hexagon, star, shield), colours and ribbon text (up to 20 characters). The preview updates live.
- A design can be saved, then **ordered** with a 6-digit postal code and a unit number (both required). The address is looked up from OneMap. Once ordered the design is locked for good.
- HQ moves each order one step at a time: **Placed**, **In production**, **Shipped**, **Delivered**. The volunteer sees the new status without reloading.
- **Auto awards:** Full Route Completed (all 8 checkpoints), Early Bird (first checkpoint at least 30 minutes before the school's reporting time), Super-Sub (filled a dropped place).
- **Manual awards:** HQ can give _Heart of Gold_ or _Calm Under Pressure_ with a thank-you note (up to 300 characters). The volunteer's _My badges_ page updates without reloading.
- _My badges_ shows what is earned and what is still to earn.

How to try it:

1. As a volunteer, open _Badge Studio_, change the emblem, shape, colours and ribbon. Press **Save** ("Design saved!") and reload to see it kept.
2. Enter the postal code and unit number and place the order ("Order placed!"). The design now shows as locked.
3. As admin, open _Badges & orders_, find the order and advance it step by step to **Delivered**. The volunteer sees the update under _My orders_.
4. As admin, use **Give badge** to award _Heart of Gold_ with a note. The volunteer's _My badges_ page shows "1 badge earned" and the note.

### Suggested 10-minute walkthrough for markers

1. Run the seed commands in _Run locally_ below (or use the live site and the test accounts).
2. Register a new volunteer (F1) and tick a show in **Change Availability** (F3).
3. As admin, **Allocate** then **Publish** (F2).
4. As the volunteer, **Accept** the place and open **Directions** (F3).
5. Open _Event day_, clock a few checkpoints (F4), and **Report an incident** (F5).
6. As admin, watch the _Live board_, then **Acknowledge** and **Resolve** the incident (F4, F5).
7. As the volunteer, design a badge and order it. As admin, mark it Delivered and give a badge (F6).

## Tech stack

- **Client:** Vue 3, Vite, Pinia, vue-router, Bootstrap 5.3, Bootstrap Icons, Leaflet
- **Server:** Node 22, Express 5, Mongoose, Socket.IO, express-session
- **Data:** MongoDB Atlas. The school list comes from the MOE schools dataset (data.gov.sg) and is stored in `server/data/primary_schools.json`, so it is not fetched while the app runs.
- **External services:** OneMap (postal code lookup, routing), Brevo (OTP emails), YouTube (home page videos)
- **Hosting:** Vercel (client), Render (server)

## Project layout

```
client/   Vue single-page app
server/   Express API
```

| Folder                                   | What is in it                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `client/src/views/`                      | One file per page: `HomeView`, `LoginView`, plus `volunteer/` and `admin/` pages                                      |
| `client/src/components/`                 | Reusable pieces grouped by area: `common` (navbar, dropdown, dialogs), `map`, `chat`, `incident`, `badges`, `landing` |
| `client/src/services/`                   | One file per feature holding the API and socket calls, plus the login state in `auth.js`                              |
| `client/src/router/`                     | URLs, role guards and navbar links                                                                                    |
| `client/src/utils/`                      | Shared helpers: constants, haversine distance, time, geolocation, YouTube                                             |
| `client/e2e/`                            | One Playwright spec per feature (F1 to F6)                                                                            |
| `server/routes`, `controllers`, `models` | The API: URL, logic and database model for each feature                                                               |
| `server/services/onemap.js`              | OneMap geocoding and routing                                                                                          |
| `server/sockets/`                        | Socket.IO chat and presence                                                                                           |
| `server/scripts/`                        | Seed and demo-data scripts                                                                                            |
| `server/data/`                           | Schools, badges, schedule and incident template data                                                                  |
| `server/tests/`                          | Server tests                                                                                                          |

## Test accounts

| Role             | Email                                                 | Password       |
| ---------------- | ----------------------------------------------------- | -------------- |
| Admin            | `admin@gmail.com`                                     | `admin123`     |
| Volunteer (demo) | `demo.volunteer001@demo.sg` (after `seed:volunteers`) | `DemoPass123!` |

> Do not leave real passwords in this file when the repo is public.

## Run locally

Needs **Node 22.18+** and **pnpm**. If you don't have pnpm, install it once with `npm install -g pnpm`
(or `corepack enable`).

The `node_modules` folders are not included in the submission. Install the packages for each part
yourself. The client and server each have their own `package.json` and `pnpm-lock.yaml`, and there
is nothing to install in the project root:

    cd server && pnpm install
    cd ../client && pnpm install

If the server fails with a `bcrypt` error, run `pnpm approve-builds` and then `pnpm rebuild bcrypt`
inside `server/`.

1. **Database.** Create a free MongoDB Atlas cluster and copy its connection string.
2. **Server settings.** Copy `server/config.env.example` to `server/config.env` and fill it in (never commit it). The main values are `DB`, `SECRET`, `ONEMAP_API_EMAIL`, `ONEMAP_API_PASSWORD`, `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`. Leave `BREVO_API_KEY` empty locally and the 6-digit sign-up code is shown on the page instead of emailed.
3. **Start the server.**
   ```bash
   cd server
   pnpm install
   pnpm run dev        # http://localhost:8000
   ```
   On Windows PowerShell, set the admin details like this instead: `$env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="at-least-8-chars"; pnpm run seed:admin`. Running it again with the same email resets that admin's password.
4. **Start the client** (new terminal).
   ```bash
   cd client
   pnpm install
   pnpm run dev        # http://localhost:5173 (forwards /api and /socket.io to the server)
   ```
   Other client commands: `pnpm run build` (production build into `dist/`), `pnpm run preview`, `pnpm run format`.
   Copy `client/.env.example` to `client/.env` only if you need it. `VITE_SOCKET_URL` must stay **empty**, both locally and on Vercel, because the proxy and rewrites already forward live updates. Setting it would bypass the login cookie and stop live updates.

### Optional demo data

Run these in `server/`. The `--` before a flag is needed so pnpm passes the flag to the script. As part of production, database already has seeded information.

| Command | What it does |
| ------- | ------------ |
| `pnpm run seed:schools -- --missing` | Keeps stored schools and adds any missing ones from `primary_schools.json`. |
| `pnpm run seed:schools -- --force` | Deletes all schools, then loads them again. |
| `pnpm run seed:volunteers` | Adds 400 demo volunteers around Singapore (`-- --count=50` for a different number, 1 to 1000). |
| `pnpm run seed:volunteers -- --remove` | Deletes the demo volunteers. |
| `pnpm run seed:incidents` | Adds 60 demo incidents (replacing old demo ones). Needs volunteers assigned to schools first. |
| `pnpm run seed:incidents -- --remove` | Deletes the demo incidents. |
| `pnpm run simulate:responses` | Demo volunteers answer their published offers (70% accept, 10% decline by default). Options: `--accept=80 --decline=10 --withdraw=5`, `--show="NE Show 2"`. |
| `pnpm run simulate:responses -- --reset` | Puts the demo answers back to Pending. |

## Tests

| What                              | Command                                    |
| --------------------------------- | ------------------------------------------ |
| Server tests (no database needed) | `cd server && pnpm test`                   |
| Client unit tests                 | `cd client && pnpm run test:unit -- --run` |
| End-to-end tests (Playwright)     | `cd client && pnpm run test:e2e`           |
| Lint                              | `cd client && pnpm run lint:oxlint`               |

### Running the end-to-end tests

There are 30 browser tests, 5 per feature (F1 to F6), in `client/e2e/`. Each feature file sets up its own data and runs in order. Every test runs on a desktop browser and on an iPhone-sized screen.

1. Start the server (`cd server && pnpm run dev`) with the database seeded: `seed:shows`, `seed:schools`, `seed:admin` and `seed:volunteers` (see _Run locally_ and _Optional demo data_).
2. Install the browser once: `cd client && pnpm install && pnpm exec playwright install chromium`.
3. Run `pnpm run test:e2e`. Playwright starts the client on http://localhost:5173 by itself.
4. Useful extras: `pnpm run test:e2e:ui` (watch the tests run), `pnpm exec playwright test e2e/f2-allocation.spec.js` (one feature), `pnpm exec playwright show-report` (open the HTML report).

The tests log in as the admin from `seed:admin`. By default they expect `admin@gmail.com` with password `admin123`. If you seeded a different admin, pass it in:

```bash
E2E_ADMIN_EMAIL=you@example.com E2E_ADMIN_PASSWORD='your-password' pnpm run test:e2e
```

They also use the demo volunteer `demo.volunteer001@demo.sg` (password `DemoPass123!`, or `E2E_DEMO_PASSWORD`).

Things to know before you run them:

- **No email code needed:** no test creates a new account, so the tests do not need the OTP email.
- **OneMap:** the browser's OneMap-based requests are faked in F1 (postal lookup), F3 (route) and F5 (incident address), so those tests do not depend on the outside website. The **server** still calls OneMap when the F6 ordering test places an order, so the server needs internet for that test.
- **Login limit:** the login rate limit is switched off in `server/routes/accounts-routes.js`, so the many test logins are not blocked.
- **They change the database.** F2 to F5 reset and re-allocate one show (`NE Show 4` by default, or set `E2E_SHOW`), which erases every assignment in it. Each F6 run orders a badge for one demo volunteer, and that volunteer's design stays locked for good (the app never deletes orders), so each run uses up one of the 400 demo volunteers. F5 leaves incidents behind (their notes start with "E2E"). Use a local or test database only. **Never run these tests against the deployed database.**

## Deploy

- **Server (Render):** start command `node server.js`. Set `NODE_ENV=production`, `NODE_VERSION=22`, `DB`, `SECRET`, `ONEMAP_*`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `CLIENT_ORIGINS=<frontend URL>`.
- **Client (Vercel):** root directory `client`, build command `pnpm run build`, output `dist`. `client/vercel.json` forwards `/api/*` and `/socket.io/*` to the Render server, so the browser talks to one origin and the login cookie works. Leave `VITE_SOCKET_URL` empty.

## Team

| Member        | Feature                  |
| ------------- | ------------------------ |
| Kuah Kuay Zen | F1 Smart Registration    |
| Fanny Lin     | F2 Smart Allocation      |
| Yap Wei-Jian  | F3 Automated Assignment  |
| Chin Jun Wen  | F4 Live Monitoring       |
| Tan Wei Ming  | F5 Incident Reports      |
| Hanafi Sani   | F6 Badges & Badge Studio |
