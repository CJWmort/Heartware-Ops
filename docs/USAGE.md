# Feature guide

A walkthrough of every feature, who uses it, and how to try it. The coordinator role in the code is called **admin** in the app.

Pages are reached from the navbar after logging in. **Volunteers** land on _My assignment_. **Admins** land on _Allocation_.

> Volunteers can self-register on the live site. Admin access is not public, because the admin tools can reset data. See the [README](../README.md) for how to get a demo, or run the project locally and create your own admin with `pnpm run seed:admin` (see [TESTING.md](TESTING.md) and the README quick start).

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

## Suggested 10-minute walkthrough

1. Run the seed commands from the README (or use the live site).
2. Register a new volunteer (F1) and tick a show in **Change Availability** (F3).
3. As admin, **Allocate** then **Publish** (F2).
4. As the volunteer, **Accept** the place and open **Directions** (F3).
5. Open _Event day_, clock a few checkpoints (F4), and **Report an incident** (F5).
6. As admin, watch the _Live board_, then **Acknowledge** and **Resolve** the incident (F4, F5).
7. As the volunteer, design a badge and order it. As admin, mark it Delivered and give a badge (F6).

## Optional demo data

Run these in `server/`. The `--` before a flag is needed so pnpm passes the flag to the script.


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
