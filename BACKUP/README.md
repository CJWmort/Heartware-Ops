# Heartware NDP Volunteer Ops (IS216 G5T1)

A web app that helps Heartware allocate volunteers to primary schools for the National Day NE Shows, replace volunteers who drop out, track student groups on the day, handle incidents, and thank volunteers with badges afterwards.

> **Starter repo:** the folder structure, config, app shell and placeholder pages were generated as boilerplate.
> Every feature's real logic is still to be written by its owner. Look for `TODO` comments.

---

## 1. Features and owners

| # | Feature | Owner | Main folders |
|---|---|---|---|
| 1a | Registration (volunteer sign-up, OneMap geocoding, MOE schools seed) + app shell | Kuah Kuay Zen | `client/src/views/volunteer/RegisterView.vue`, `server/controllers/auth-controller.js`, `server/controllers/volunteers-controller.js`, `server/scripts/seed-schools.js` |
| 1b | Smart Allocation (scarcity-first algorithm, drag-and-drop board, publish, accept/decline) | Fanny Lin | `client/src/views/admin/AllocationBoardView.vue`, `client/src/views/volunteer/MyAssignmentView.vue`, `server/controllers/allocations-controller.js`, `server/utils/haversine.js` |
| 2 | Open Slot Replacement (claimable cards, radius map, swaps) | Yap Wei-Jian | `client/src/views/volunteer/OpenSlotsView.vue`, `client/src/views/admin/ReplacementView.vue`, `server/controllers/replacements-controller.js` |
| 3 | Live Movement Tracking (check-ins, location polling, HQ map) | Chin Jun Wen | `client/src/views/volunteer/TrackingView.vue`, `client/src/views/admin/HqLiveBoardView.vue`, `server/controllers/tracking-controller.js`, `server/scripts/simulate-pings.js` |
| 4 | Incident Reporting & HQ Alerts (+ WebSockets bonus) | Tan Wei Ming | `client/src/views/volunteer/ReportIncidentView.vue`, `client/src/views/admin/IncidentQueueView.vue`, `server/controllers/incidents-controller.js`, `server/sockets/` |
| 5 | Recognition & Badge Studio | Hanafi Sani | `client/src/views/volunteer/BadgeStudioView.vue`, `client/src/views/volunteer/MyBadgesView.vue`, `client/src/views/admin/BadgeAwardsView.vue`, `server/controllers/badges-controller.js` + deployment |

The full spec for each feature (user stories, screens, API endpoints, acceptance tests) is in [`docs/FEATURES.md`](docs/FEATURES.md).

**Using AI?** Start every chat with your feature's prompt from [`docs/ai-prompts/`](docs/ai-prompts/README.md) so we all stay aligned and within the course AI rules.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Vite), Vue Router, Pinia, Bootstrap 5, Bootstrap Icons, Axios, Leaflet (maps) |
| Backend | Node.js, Express 5, Mongoose, Socket.IO (bonus) |
| Database | MongoDB Atlas |
| External APIs | OneMap (geocoding postal codes), data.gov.sg (MOE school directory) |
| Testing | Playwright (E2E), Vitest (unit) |
| Hosting | Vercel (client), Render (server), MongoDB Atlas (database) |

---

## 3. Folder structure

```
heartware/
├── client/                 Vue 3 single-page app (what users see)
│   ├── src/
│   │   ├── views/          One page per screen (volunteer/, admin/)
│   │   ├── components/     Reusable pieces (navbar, cards, maps)
│   │   ├── router/         Which URL shows which page, and who can see it
│   │   ├── stores/         Pinia stores (shared state such as the logged-in user)
│   │   ├── services/       Code that talks to our server and external APIs
│   │   └── utils/          Small helper functions
│   └── e2e/                Playwright end-to-end tests, one file per feature
├── server/                 Express API (data + business logic)
│   ├── models/             Mongoose schemas (shape of each MongoDB collection)
│   ├── routes/             URL → controller mapping
│   ├── controllers/        The actual logic for each endpoint
│   ├── middleware/         Login checks, role checks, error handling
│   ├── sockets/            Socket.IO live updates (bonus)
│   ├── scripts/            Seed + simulation scripts
│   └── data/               Mock data for demos and tests
├── docs/                   Feature specs, API contract, timeline
└── .github/                PR template, issue templates, CI workflow
```

---

## 4. First-time setup (do this once)

You need: **Node.js 22+**, **Git**, and **VS Code**. Check with `node -v` and `git -v`.

```bash
# 1. Clone the repo
git clone https://github.com/<your-org>/heartware.git
cd heartware

# 2. Install server packages
cd server
npm install
cp config.env.example config.env      # Windows: copy config.env.example config.env
#    → open config.env and paste the MongoDB Atlas connection string (ask in the group chat)

# 3. Install client packages
cd ../client
npm install
cp .env.example .env                  # Windows: copy .env.example .env
npx playwright install                # downloads browsers for E2E tests (first time only)
```

## 5. Running the app every day

Open **two terminals**:

```bash
# Terminal 1 – server (http://localhost:8000)
cd server
npm run dev

# Terminal 2 – client (http://localhost:5173)
cd client
npm run dev
```

Seed the database (once, after the scripts are implemented):

```bash
cd server
npm run seed:schools     # loads MOE primary schools from data.gov.sg
npm run seed:demo        # loads mock volunteers + demo accounts
npm run simulate         # fakes volunteer movement for the HQ map
```

## 6. Running tests

```bash
cd client
npm run test:unit        # Vitest unit tests (e.g. haversine distance)
npm run test:e2e         # Playwright E2E tests (starts the dev server for you)
npx playwright show-report   # open the HTML report after a run
```

E2E tests use `data-testid="..."` attributes as selectors. Please add one to every button, input and card you want tested. Never select by text or CSS class.

## 7. How we work with GitHub

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version:

1. Never push straight to `main`.
2. `git checkout -b feature/<number>-<short-name>` (e.g. `feature/4-incident-queue`).
3. Commit small, push, open a Pull Request, get **one** teammate to review, then merge.
