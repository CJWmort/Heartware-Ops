HEARTWARE VOLUNTEER OPS  (IS216 G5T1)
=====================================

LIVE APP
  URL: <PASTE THE DEPLOYED FRONTEND URL HERE>

DUMMY ACCOUNTS  (replace with the real ones before submitting)
  Admin      : <admin email>      / <password>
  Volunteer  : <volunteer email>  / <password>

WHAT'S IN THIS ZIP
  client/   Vue 3 + Bootstrap single-page app (built with Vite)
  server/   Express + MongoDB API (sessions, Socket.IO)
  The built site is in client/dist (index.html is the entry page).

RUN LOCALLY  (Node 22 or newer, pnpm installed)
  1. Database: create a MongoDB Atlas cluster and copy its connection string.
  2. server/config.env  (create it; never commit it):
         DB=<mongodb connection string>
         SECRET=<any long random text>
         ONEMAP_API_EMAIL=<your OneMap account email>
         ONEMAP_API_PASSWORD=<your OneMap account password>
         ONEMAP_BASE_URL=https://www.onemap.gov.sg
         BREVO_API_KEY=<optional locally; REQUIRED in production>
         BREVO_SENDER_EMAIL=<verified sender email>
         OTP_MOCK=true            (local only: shows the email code on the page)
  3. Start the server:
         cd server
         pnpm install
         pnpm run seed:shows
         ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='at-least-8-chars' pnpm run seed:admin
         pnpm run seed:volunteers      (optional: 400 DEMO volunteers around Singapore, password DemoPass123!)
         pnpm run seed:volunteers --remove   (deletes the demo volunteers and their assignments again)
         pnpm run simulate:responses   (demo volunteers accept/decline their PUBLISHED assignments; --reset undoes it)
         pnpm run dev                  (http://localhost:8000)
     Schools: the "schools" collection must be loaded (data in server/data/primary_schools.json;
     each school also needs a "show" and "reportingTime"). <TEAM: say how this is loaded>
  4. Start the client (new terminal):
         cd client
         pnpm install
         pnpm run dev                  (http://localhost:5173, forwards /api to the server)

DEPLOY
  Backend (Render/Railway): start command "node server.js". Set NODE_ENV=production,
  DB, SECRET, ONEMAP_*, BREVO_API_KEY, BREVO_SENDER_EMAIL, CLIENT_ORIGINS=<frontend URL>.
  Frontend (Vercel): edit client/vercel.json and replace YOUR-BACKEND-HOST with the backend host.

EXTERNAL APIs: OneMap (geocoding, routing, reverse geocoding), data.gov.sg (MOE schools dataset).
DATA STORE: MongoDB (Atlas).

NOTES ON THE ALLOCATION WORKFLOW
  1. Admin > Allocation > "Run Allocations" builds a DRAFT. Re-running is safe: volunteers who already
     accepted keep their school; only the open places are filled again.
  2. Admin reviews the draft (rows are tagged "Draft"), then presses "Publish <show>".
     Only then can volunteers see their school and accept / decline.
  3. Rows created before the publish feature existed have no "published" value; press Publish once to release them.
  4. "Reset everything" erases all assignments, including accepted ones. Use it only to start over.

NOTE ON client/vercel.json
  JSON files cannot hold comments, so: the first rule forwards every /api request from the Vercel site to your
  backend (replace YOUR-BACKEND-HOST). That keeps the browser talking to ONE origin, so the login cookie works
  without extra CORS or cookie settings. The second rule is the usual single-page-app fallback to index.html.
