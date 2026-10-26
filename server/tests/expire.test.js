// Tests for the 24-hour expiry of unanswered Pending offers (utils/expire-pending.js).
const Module = require('module'); const path = require('path'); const assert = require('assert'); const fs = require('fs');
const S = path.resolve(__dirname, '..');
const SHOW = 'NE Show 1'; const PAST = new Date(Date.now() - 3600 * 1000); const FUTURE = new Date(Date.now() + 3600 * 1000);
let store = []; let logged = []; let failLog = false;
const vols = { v1: { lat: 1.31, lng: 103.8 }, v2: { lat: 1.32, lng: 103.8 } };
const school = { _id: 's1', name: 'Sch1', lat: 1.31, lng: 103.8, p5Classes: 1, show: SHOW, reportingTime: '1:30pm' };
const withToObject = (o) => Object.defineProperty(o, 'toObject', { value() { return { ...this }; }, enumerable: false });
const isOverdue = (a) => a.status === 'Pending' && a.published && a.expiresAt && a.expiresAt < new Date();
const fake = {
  findOverduePending: async () => store.filter(isOverdue).map((a) => ({ _id: a._id })),
  deleteIfOverdue: async (id) => { const i = store.findIndex((a) => a._id === id && isOverdue(a)); if (i < 0) return null;
    const [row] = store.splice(i, 1); return withToObject({ ...row, school }); },
  restore: async (o) => { store.push(o); },
  // used by the real reserve-replacement.js
  publishedShows: async () => [...new Set(store.filter((a) => a.published).map((a) => a.show))],
  findOpenPlaces: async () => { const held = store.filter((a) => a.school === 's1' && ['Pending', 'Accepted'].includes(a.status)).length;
    return school.p5Classes - held > 0 ? [{ school, open: school.p5Classes - held }] : []; },
  findReserves: async (show) => store.filter((a) => a.show === show && a.status === 'Reserve').map((a) => ({ rowId: a._id, name: a.name, ...vols[a.volunteer] })),
  fillFromReserve: async (rowId, schoolId, d) => { const row = store.find((a) => a._id === rowId && a.status === 'Reserve'); if (!row) return { problem: 'taken' };
    Object.assign(row, { school: schoolId, status: 'Pending', published: true, distance: d, fromReserve: true, expiresAt: FUTURE }); return { assignment: row }; },
};
const stubs = { '../models/assignments-model': fake, '../models/shows-model': { findByName: async () => ({ _id: 'sh1', date: '2027-07-03' }) },
  '../models/account-model': { logWithdrawnShow: async (id, entry) => { if (failLog) throw new Error('boom'); logged.push({ id, ...entry }); } } };
const orig = Module._load;
Module._load = function (req, parent, ...r) { if (stubs[req]) return stubs[req];
  if (req === './haversine') return orig(path.join(S, 'utils/haversine.js'), parent, ...r); return orig(req, parent, ...r); };
const { expireOverduePending } = require(path.join(S, 'utils/expire-pending.js'));
const row = (o) => withToObject({ show: SHOW, published: true, ...o });
(async () => {
  // E1: overdue Pending is deleted + logged as Declined, and the nearest reserve takes the place
  store = [row({ _id: 'a1', volunteer: 'v1', name: 'V1', school: 's1', status: 'Pending', expiresAt: PAST }),
           row({ _id: 'a2', volunteer: 'v2', name: 'V2', school: null, status: 'Reserve' })];
  assert.equal(await expireOverduePending(), 1);
  assert.ok(!store.some((a) => a.volunteer === 'v1'));
  assert.equal(logged.length, 1); assert.equal(logged[0].status, 'Declined'); assert.match(logged[0].reason, /24 hours/); assert.equal(logged[0].reportingLocation, 'Sch1');
  const v2 = store.find((a) => a.volunteer === 'v2'); assert.equal(v2.status, 'Pending'); assert.equal(v2.fromReserve, true);
  console.log('E1 ok  overdue offer lapses (logged as Declined, reason given) and the nearest reserve takes the place');
  // E2: nothing else is touched
  store = [row({ _id: 'b1', volunteer: 'v1', school: 's1', status: 'Pending', expiresAt: FUTURE }),
           row({ _id: 'b2', volunteer: 'v2', school: 's1', status: 'Accepted', expiresAt: PAST }),
           row({ _id: 'b3', volunteer: 'v3', school: 's1', status: 'Pending' }),
           row({ _id: 'b4', volunteer: 'v4', school: 's1', status: 'Pending', expiresAt: PAST, published: false })];
  logged = []; const snap = JSON.stringify(store);
  assert.equal(await expireOverduePending(), 0); assert.equal(JSON.stringify(store), snap); assert.equal(logged.length, 0);
  console.log('E2 ok  not-yet-due, Accepted, no-deadline and draft rows are untouched');
  // E4: running twice does nothing the second time
  store = [row({ _id: 'c1', volunteer: 'v1', school: 's1', status: 'Pending', expiresAt: PAST })]; logged = [];
  assert.equal(await expireOverduePending(), 1); const after1 = JSON.stringify(store);
  assert.equal(await expireOverduePending(), 0); assert.equal(JSON.stringify(store), after1); assert.equal(logged.length, 1);
  console.log('E4 ok  running the sweep twice does nothing the second time');
  // E5: if logging fails the offer is put back, nobody loses a place
  store = [row({ _id: 'd1', volunteer: 'v1', school: 's1', status: 'Pending', expiresAt: PAST })]; logged = []; failLog = true;
  const origErr = console.error; console.error = () => {};
  assert.equal(await expireOverduePending(), 0); console.error = origErr; failLog = false;
  assert.equal(store.length, 1); assert.equal(store[0].status, 'Pending');
  console.log('E5 ok  logging failure puts the row back');
  // E3: static checks on the model source (deadline set on publish and on replacement)
  const m = fs.readFileSync(path.join(S, 'models/assignments-model.js'), 'utf8');
  const fn = (name) => { const a = m.indexOf('exports.' + name + ' ='); return m.slice(a, m.indexOf('\n};', a)); };
  assert.ok(/expiresAt: pendingDeadline\(\)/.test(fn('publish')) && /status: "Pending"/.test(fn('publish')), 'publish gives Pending rows a deadline');
  assert.ok(/expiresAt: pendingDeadline\(\)/.test(fn('fillFromReserve')), 'a replacement gets a fresh deadline');
  assert.ok(/PENDING_HOURS = 24/.test(m));
  console.log('E3 ok  model: publish and fillFromReserve set a 24h deadline');
  console.log('ALL EXPIRY CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
