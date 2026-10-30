// Server test that open places in a published show are topped up from the reserve list.

const Module = require('module'); const path = require('path'); const assert = require('assert');
const S = path.resolve(__dirname, '..');
let store = []; let nextId = 1; let vols = {}; let schools = {};
const SHOW = 'NE Show 1';
// ok(r) - true when the fake response has status 200.
const ok = (r) => r.code === 200;
// volOf(id) - finds a fake volunteer by id.
const volOf = (id) => Object.values(vols).flat().find((v) => String(v._id) === String(id));
const fake = {
  SHOWS: ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4'],
  publishedShows: async () => [...new Set(store.filter((a) => a.published).map((a) => a.show))],
  findKept: async () => store.filter((a) => ['Accepted', 'Declined', 'Withdrawn'].includes(a.status)),
  deleteReplaceable: async (shows) => { store = store.filter((a) => !(['Pending', 'Reserve'].includes(a.status) && shows.includes(a.show))); },
  deleteAll: async (show) => { store = show ? store.filter((a) => a.show !== show) : []; },
  findOverduePending: async () => [],
  validateMany: () => [],
  // createMany(rows) - fake model method: throws a duplicate error if a volunteer already has a row
  // for that show, otherwise adds the rows to the fake store as Pending.
  createMany: async (rows) => {
    for (const r of rows) if (store.some((a) => String(a.volunteer) === String(r.volunteer) && a.show === r.show)) throw new Error('E11000 duplicate ' + r.volunteer);
    rows.forEach((r) => store.push({ _id: 'a' + nextId++, status: 'Pending', ...r }));
  },
  retrieveAll: async () => store,
  volunteerIdsWithRow: async (show) => [...new Set(store.filter((a) => a.show === show).map((a) => a.volunteer))],
  // findOpenPlaces(show) - fake model method: each school of the show with how many places are still
  // free; full schools are dropped.
  findOpenPlaces: async (show) => (schools[show] || [])
    .map((school) => ({ school, open: school.p5Classes - store.filter((a) => a.show === show && String(a.school) === school._id && ['Pending', 'Accepted'].includes(a.status)).length }))
    .filter((p) => p.open > 0),
  // findReserves(show) - fake model method: the Reserve rows of the show with each volunteer's name
  // and position.
  findReserves: async (show) => store.filter((a) => a.show === show && a.status === 'Reserve')
    .map((a) => ({ rowId: a._id, name: a.name, lat: volOf(a.volunteer).lat, lng: volOf(a.volunteer).lng })),
  // fillFromReserve(rowId, schoolId, distanceKm) - fake model method: moves a Reserve volunteer into
  // the school as a Pending offer, or reports "taken" if the row is no longer a reserve.
  fillFromReserve: async (rowId, schoolId, distanceKm) => {
    const row = store.find((a) => a._id === rowId && a.status === 'Reserve'); if (!row) return { problem: 'taken' };
    Object.assign(row, { school: schoolId, status: 'Pending', published: true, distance: distanceKm, fromReserve: true });
    return { assignment: row };
  },
};
// emit() - fake live-event sender that does nothing.
const stubs = { mongoose: { Types: { ObjectId: { isValid: () => true } } }, '../sockets': { emit() {} },  '../models/shows-model': {}, '../models/assignments-model': fake,
  '../models/account-model': { findVolunteersByShow: async (s) => vols[s] || [] }, '../models/schools-model': { findByShow: async (s) => schools[s] || [] },
  // config() / greedyByPair() - fake helpers that do nothing.
  dotenv: { config() {} }, '../utils/greedy': { greedyByPair() {} } };
const orig = Module._load;
// Module._load - swaps in the fake modules (stubs) and loads the real scarcityFirst and haversine
// helpers; everything else loads normally.
Module._load = function (req, parent, ...r) { if (stubs[req]) return stubs[req];
  if (req === '../utils/scarcityFirst') return orig(path.join(S, 'utils/scarcityFirst.js'), parent, ...r);
  if (req === './haversine') return orig(path.join(S, 'utils/haversine.js'), parent, ...r); return orig(req, parent, ...r); };
const ctl = require(path.join(S, 'controllers/assignments-controller.js'));
// res() - builds a fake response recording the status code and JSON body (status and json are the
// recording helpers).
const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; return o; };
// run(body) - calls the allocation controller with a body and returns the fake response.
const run = async (body = {}) => { const r = res(); await ctl.runAssignments({ body }, r); return r; };
// V(n, lat) - builds a fake volunteer at a latitude.
const V = (n, lat) => ({ _id: 'v' + n, name: 'Vol' + n, lat, lng: 103.8 });
// rows() - the fake store rows for the test show.
const rows = () => store.filter((a) => a.show === SHOW);
// of(v) - the row of one volunteer.
const of = (v) => rows().find((a) => a.volunteer === v);
(async () => {
  vols[SHOW] = [V(1, 1.31), V(2, 1.32), V(3, 1.9)]; schools[SHOW] = [{ _id: 's1', name: 'Sch1', lat: 1.31, lng: 103.8, p5Classes: 2, show: SHOW }];
  store = [{ _id: 'a0', volunteer: 'v1', school: 's1', name: 'Vol1', show: SHOW, status: 'Accepted', published: true }];
  const r1 = await run(); assert.ok(ok(r1));
  assert.equal(of('v1').status, 'Accepted'); assert.equal(of('v1')._id, 'a0');
  assert.equal(of('v2').status, 'Pending'); assert.equal(of('v2').fromReserve, true); assert.equal(of('v3').status, 'Reserve');
  assert.deepEqual(r1.body.toppedUp[SHOW], { added: 2, placed: 1 });
  console.log('K1 ok  late volunteer placed in the open place (nearest first), the other waits on Reserve, accepted row untouched');
  const before = JSON.stringify(store); const r2 = await run(); assert.ok(ok(r2));
  assert.equal(JSON.stringify(store), before); assert.equal(r2.body.toppedUp[SHOW].added, 0);
  console.log('K2 ok  running again adds nobody and creates no duplicate rows');
  store = [{ _id: 'a0', volunteer: 'v1', school: 's1', name: 'Vol1', show: SHOW, status: 'Accepted', published: true },
           { _id: 'a9', volunteer: 'v9', school: 's1', name: 'Vol9', show: SHOW, status: 'Pending', published: true }];
  vols[SHOW] = [V(1, 1.31), V(9, 1.32), V(2, 1.33)];
  const r3 = await run(); assert.ok(ok(r3));
  assert.equal(of('v2').status, 'Reserve'); assert.equal(of('v1').status, 'Accepted'); assert.equal(of('v9').status, 'Pending');
  assert.deepEqual(r3.body.toppedUp[SHOW], { added: 1, placed: 0 });
  console.log('K3 ok  no open place: late volunteer waits on Reserve and nobody already placed is moved');
  const r4 = await run({ reset: true, show: SHOW }); assert.ok(ok(r4)); assert.deepEqual(r4.body.toppedUp, {});
  console.log('K4 ok  reset does not top up');
  console.log('ALL TOP-UP CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
