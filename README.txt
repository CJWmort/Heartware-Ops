IS216 G5T1 – Heartware NDP Volunteer Ops
==========================================
(Submission README – keep this file updated. It must be in the final zip.)

LIVE APP URL
------------
Landing page: TODO https://<your-app>.vercel.app
API server:   TODO https://<your-api>.onrender.com

DEMO ACCOUNTS
-------------
Role          Username / Email               Password
Coordinator   TODO coordinator@demo.sg       TODO
HQ staff      TODO hq@demo.sg                TODO
Volunteer     TODO volunteer1@demo.sg        TODO

HOW TO SET UP AND RUN LOCALLY
-----------------------------
Requirements: Node.js 22 or newer.

1. Server
   cd server
   npm install
   copy config.env.example to config.env and fill in DB and JWT_SECRET
   npm run seed:schools
   npm run seed:demo
   npm run dev            -> http://localhost:8000

2. Client (new terminal)
   cd client
   npm install
   copy .env.example to .env
   npm run dev            -> http://localhost:5173

HOW TO RUN TESTS
----------------
   cd client
   npx playwright install      (first time only)
   npm run test:e2e            (end-to-end tests, one spec file per feature in client/e2e/)
   npm run test:unit           (unit tests)
   npx playwright show-report  (view results)

EXTERNAL APIS USED
------------------
- OneMap Search API (https://www.onemap.gov.sg) – converts volunteer postal codes to coordinates.
- data.gov.sg MOE General Information of Schools dataset – list of primary schools.
- TODO: list any other APIs

THIRD-PARTY LIBRARIES
---------------------
Vue 3, Vue Router, Pinia, Bootstrap 5, Bootstrap Icons, Axios, Leaflet, Express, Mongoose,
Socket.IO, Playwright, Vitest. TODO: add any others you install.

AI / LLM USAGE (required by course policy)
------------------------------------------
- Project starter scaffold (folder structure, config files, app shell/navigation, placeholder
  pages, Mongoose schema drafts, route/controller stubs, GitHub templates, test skeletons and
  mock data) was generated with Claude (Anthropic) as boilerplate.
- All feature business logic, backend endpoint logic and interactive features were written by
  the team.
- TODO: each member adds any further AI usage here (what + which file).
