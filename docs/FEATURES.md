# Feature specs

Each feature lists: who uses it, the screens, the API endpoints it needs, and the **acceptance tests** (these become the Playwright tests in `client/e2e/`).

Roles in the app:

| Role | Who | What they do |
|---|---|---|
| `volunteer` | Heartware volunteers | Register, see assignment, claim slots, check in, report incidents, design badge |
| `coordinator` | Heartware staff (before the event) | Run allocation, handle replacements, award badges |
| `hq` | Control HQ staff (on the day) | Watch the live map, triage incidents and alerts |

Checkpoints (same order everywhere – see `utils/constants.js`):
`BOARDED_OUTBOUND → DEPARTED_SCHOOL → ARRIVED_VENUE → SEATED → BOARDED_RETURN → BACK_AT_PUDO`

---

## Feature 1a — Registration (Kuah) + app shell

**User stories**
- As a volunteer, I sign up with my name, email, phone, postal code and available show dates.
- As a volunteer, I must tick an explicit consent box explaining how my location is used before I can submit.
- As the system, I convert the postal code to coordinates **once** via OneMap and store them.
- As a coordinator, I see all primary schools already loaded from data.gov.sg (no manual entry).

**Screens:** `RegisterView` (multi-step form: details → availability → consent → review), `LoginView`, navbar + role-based routing.

**Endpoints:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `GET/PATCH /api/volunteers/me`, `GET /api/volunteers`, `GET /api/schools`

**Interactive touches:** postal-code field shows a live "📍 Found: Blk 123 Tampines St 11" preview from OneMap as you type; availability as clickable date chips; step progress bar.

**Acceptance tests (`e2e/f1a-registration.spec.js`)**
- Submitting without consent is blocked with a visible message.
- An invalid postal code shows an error; a valid one shows the resolved address.
- After registering, the user lands on their dashboard and the navbar shows their name.
- A volunteer cannot open `/admin/*` pages (redirected).

---

## Feature 1b — Smart Allocation (Fanny)

**User stories**
- As a coordinator, I run the allocation for a show date. One volunteer per bus, one bus per P5 class.
- The algorithm is **scarcity-first**: schools with the fewest nearby available volunteers are filled first.
- As a coordinator, I review the result on a board, **drag and drop** volunteers between slots, and see warnings (too far, not available that date, double-booked).
- As a coordinator, I switch to a **map view**: schools coloured red/amber/green by % slots filled, lines from volunteer to school.
- As a coordinator, I **publish** the allocation.
- As a volunteer, I see my school, bus, class, venue and contacts, and **accept or decline**. Coordinators see responses live.

**Screens:** `AllocationBoardView` (board + map toggle, filters, publish button), `MyAssignmentView`.

**Endpoints:** `POST /api/allocations/run`, `GET /api/allocations`, `PATCH /api/allocations/slots/:slotId`, `POST /api/allocations/publish`, `GET /api/allocations/me`, `POST /api/allocations/slots/:slotId/respond`

**Acceptance tests (`e2e/f1b-allocation.spec.js`)**
- Running allocation on seeded data fills slots and shows a coverage summary.
- Dragging a volunteer to another slot updates the board; a far-away move shows a warning badge.
- Publishing makes the assignment visible on the volunteer's `MyAssignmentView`.
- Volunteer clicks Accept → coordinator board shows the slot as accepted.

**Unit tests:** `src/utils/__tests__/haversine.spec.js` (already written – make them pass).

---

## Feature 2 — Open Slot Replacement (Yap)

**User stories**
- As a volunteer, I tap **"I can't make it"**, pick a reason (MC / urgent matter / other). My slot becomes an **open slot**. Nobody else is reshuffled.
- As a coordinator, I can mark a volunteer as **no-show**, which also opens the slot.
- As a nearby available volunteer, I see the open slot as a **card with a countdown** and tap **Claim**.
- As a coordinator, I see the open slot on a **map with a radius slider**; candidate pins appear/disappear as I drag it. I compare claimants **side by side** (distance, past reliability, badges) and **approve** one. The allocation republishes automatically.
- As a volunteer, I can request a **swap** with another volunteer (coordinator approves).
- Every change is in an **audit history**.

**Screens:** `OpenSlotsView` (volunteer), `ReplacementView` (coordinator: open slots list, map + radius slider, compare panel, history tab).

**Endpoints:** `POST /api/replacements/drop-out`, `POST /api/replacements/no-show`, `GET /api/replacements/open`, `POST /api/replacements/:id/claim`, `GET /api/replacements/:id/candidates?radiusKm=`, `POST /api/replacements/:id/approve`, `POST /api/replacements/swaps`, `PATCH /api/replacements/swaps/:id`, `GET /api/replacements/history`

**Acceptance tests (`e2e/f2-replacement.spec.js`)** — this is the **"one thing that must work convincingly"** demo flow:
- Volunteer A drops out (MC) → slot appears in the coordinator's open list.
- Volunteer B sees the card and claims it.
- Coordinator increases the radius → more candidate pins; approves B → B's `MyAssignmentView` shows the new school.
- History tab lists drop-out, claim and approval in order.

---

## Feature 3 — Live Movement Tracking (Chin)

**User stories**
- As a volunteer on the day, I see a big step-by-step checkpoint tracker and tap to check in at each checkpoint (records time + location).
- While the tracking page is open, my location is sent every **5 minutes** (screen wake lock keeps it alive).
- As HQ, I see every group on a **Leaflet map** with a progress bar per group and a filter by venue/status.
- As a developer, I can run a **simulation script** to fake 50+ groups moving so the map can be demoed without phones.

**Screens:** `TrackingView` (volunteer), `HqLiveBoardView` (HQ map + group list).

**Endpoints:** `GET /api/tracking/checkpoints`, `POST /api/tracking/check-ins`, `POST /api/tracking/pings`, `GET /api/tracking/live`, `GET /api/tracking/groups/:slotId/timeline`

**Acceptance tests (`e2e/f3-tracking.spec.js`)** (Playwright can fake geolocation – see the spec file)
- Checking in "Boarded" moves the tracker to the next step and disables going back.
- Checkpoints cannot be skipped out of order.
- HQ board shows the group's marker and its latest checkpoint after check-in.

---

## Feature 4 — Incident Reporting & HQ Alerts (Wei Ming)

**User stories**
- As a volunteer, I report an incident in **one tap** from templates (Student unwell, Bus delayed, Lost item, Other), optionally add a note and photo. My location and group are attached automatically.
- As HQ, I see incidents in a **triage queue** (columns or tabs: New → Acknowledged → Resolved), sorted by severity and time, and move them along.
- As HQ, I get an **automatic alert** when a group misses a checkpoint by its expected time — something a Telegram chat cannot detect.
- **Bonus:** new incidents and alerts appear instantly via **WebSockets** (Socket.IO), with a toast + sound.

**Screens:** `ReportIncidentView` (volunteer), `IncidentQueueView` (HQ queue + alerts panel).

**Endpoints:** `GET /api/incidents/templates`, `POST /api/incidents`, `GET /api/incidents`, `PATCH /api/incidents/:id/status`, `GET /api/incidents/alerts`, `PATCH /api/incidents/alerts/:id/acknowledge`
**Socket events:** `incident:new`, `incident:updated`, `alert:new`, `tracking:update`

**Acceptance tests (`e2e/f4-incidents.spec.js`)**
- Tapping "Bus delayed" + submit shows a success state for the volunteer.
- The incident appears in HQ's New column; Acknowledge moves it to Acknowledged; Resolve requires a note.
- A seeded overdue group appears in the alerts panel.

---

## Feature 5 — Recognition & Badge Studio (Hanafi)

**User stories**
- After the event, badges are **auto-awarded** from real data: "Full Route Completed" (all 6 checkpoints), "On-Time Every Checkpoint", "Stand-in Hero" (approved replacement).
- As a coordinator, I award a **custom badge** with a thank-you message to one or many volunteers.
- As a volunteer, I see my **badge wall** and open each badge to read the message.
- As a volunteer, I **design my physical badge** in the Badge Studio: shape, colours, emblem, ribbon text — with a **live SVG preview** that updates as I change options.
- I **lock in** my design, confirm my delivery address, and **track** the order (Placed → In production → Shipped → Delivered).

**Screens:** `MyBadgesView`, `BadgeStudioView`, `BadgeAwardsView` (coordinator).

**Endpoints:** `GET /api/badges`, `POST /api/badges/auto-award`, `POST /api/badges/award`, `GET /api/badges/me`, `GET/PUT /api/badges/design/me`, `POST /api/badges/orders`, `GET /api/badges/orders/me`, `PATCH /api/badges/orders/:id/status`

**Acceptance tests (`e2e/f5-badges.spec.js`)**
- Changing the colour picker updates the preview's fill immediately.
- Ribbon text is limited to 20 characters with a live counter.
- Lock-in shows a confirmation and the order appears with status "Placed"; design can no longer be edited.
- Coordinator awards a custom badge → it appears on the volunteer's badge wall with the message.
