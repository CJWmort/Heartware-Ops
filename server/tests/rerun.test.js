// Server test that re-running the allocation keeps accepted people and does not create duplicates.

const Module = require('module'); const path = require('path'); const assert = require('assert');
const S = path.resolve(__dirname, '..');
let store = []; let nextId = 1; let invalid = []; let vols = {}; let schools = {};
// ok(r) - true when the fake response has status 200.
const ok = (r) => r.code === 200;
const fake = {
  SHOWS: ['NE Show 1','NE Show 2','NE Show 3','NE Show 4'],
  publishedShows: async () => [],
  findKept: async () => store.filter(a => ['Accepted','Declined','Withdrawn'].includes(a.status)).map(a => ({ volunteer: a.volunteer, school: a.school, show: a.show, status: a.status })),
  deleteReplaceable: async (shows) => { store = store.filter(a => !(['Pending','Reserve'].includes(a.status) && shows.includes(a.show))); },
  deleteAll: async (show) => { store = show ? store.filter(a => a.show !== show) : []; },
  findOverduePending: async () => [],
  validateMany: () => invalid,
  // createMany(rows) - fake model method: throws a duplicate error if a volunteer already has a row
  // for that show, otherwise adds the rows to the fake store as Pending.
  createMany: async (rows) => {
    for (const r of rows) { if (store.some(a => String(a.volunteer) === String(r.volunteer) && a.show === r.show)) throw new Error('E11000 duplicate key ' + r.volunteer + ' ' + r.show); }
    rows.forEach(r => store.push({ _id: 'a' + nextId++, status: 'Pending', ...r }));
  },
  retrieveAll: async () => store,
};
// emit() / config() / greedyByPair() - fake helpers that do nothing.
const stubs = { 'mongoose': { Types: { ObjectId: { isValid: () => true } } }, '../sockets': { emit() {} },  '../models/shows-model': {},  '../models/assignments-model': fake,
  '../models/account-model': { findVolunteersByShow: async (s) => vols[s] || [] }, '../models/schools-model': { findByShow: async (s) => schools[s] || [] },
  // config() / greedyByPair() - fake helpers that do nothing.
  'dotenv': { config() {} }, '../utils/greedy': { greedyByPair() {} } };
const orig = Module._load;
// Module._load - swaps in the fake modules (stubs) and loads the real scarcityFirst and haversine
// helpers; everything else loads normally.
Module._load = function (req, parent, ...r) { if (stubs[req]) return stubs[req];
  if (req === '../utils/scarcityFirst') return orig(path.join(S,'utils/scarcityFirst.js'), parent, ...r);
  if (req === './haversine') return orig(path.join(S,'utils/haversine.js'), parent, ...r); return orig(req, parent, ...r); };
const ctl = require(path.join(S, 'controllers/assignments-controller.js'));
// res() - builds a fake response recording the status code and JSON body (status and json are the
// recording helpers).
const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; return o; };
// run(body) - calls the allocation controller with a body and returns the fake response.
const run = async (body = {}) => { const r = res(); await ctl.runAssignments({ body }, r); return r; };
// V(n, lat) - builds a fake volunteer at a latitude.
const V = (n, lat) => ({ _id: 'v' + n, name: 'Vol' + n, lat, lng: 103.8 });
// SC(n, lat, slots) - builds a fake school at a latitude with a number of places.
const SC = (n, lat, slots) => ({ _id: 's' + n, name: 'Sch' + n, lat, lng: 103.8, p5Classes: slots, show: 'NE Show 1' });
// rows(show) - the fake store rows for one show.
const rows = (show = 'NE Show 1') => store.filter(a => a.show === show);
// of(v, show) - the row of one volunteer in a show.
const of = (v, show = 'NE Show 1') => rows(show).find(a => a.volunteer === v);
(async () => {
  vols['NE Show 1'] = [V(1,1.31), V(2,1.32), V(3,1.40)]; schools['NE Show 1'] = [SC(1,1.31,1), SC(2,1.40,1)];
  assert.ok(ok(await run())); assert.equal(rows().length, 3);
  assert.equal(rows().filter(a => a.status === 'Pending').length, 2); assert.equal(rows().filter(a => a.status === 'Reserve').length, 1);
  console.log('A ok  first run: 2 assigned (Pending) + 1 reserve');
  const v1 = of('v1'); v1.status = 'Accepted'; const v1Id = v1._id, v1School = v1.school;
  vols['NE Show 1'].push(V(4,1.41), V(5,1.311));
  assert.ok(ok(await run()));
  assert.equal(of('v1')._id, v1Id); assert.equal(of('v1').status, 'Accepted'); assert.equal(String(of('v1').school), String(v1School));
  console.log('B1 ok accepted volunteer: same record, same school, still Accepted');
  // bySchool(id) - the Pending or Accepted rows held by one school.
  const bySchool = (id) => rows().filter(a => String(a.school) === id && ['Pending','Accepted'].includes(a.status));
  assert.ok(bySchool('s1').length <= 1 && bySchool('s2').length <= 1); console.log('B2 ok no school over capacity (accepted place not given away)');
  assert.equal(rows().filter(a => a.volunteer === 'v1').length, 1); console.log('B3 ok accepted volunteer has exactly one row (no duplicate)');
  assert.equal(rows().length, 5); console.log('B4 ok every available volunteer has exactly one row');
  const before = JSON.stringify(rows().map(a => [a.volunteer, String(a.school), a.status]).sort());
  assert.ok(ok(await run())); assert.equal(JSON.stringify(rows().map(a => [a.volunteer, String(a.school), a.status]).sort()), before);
  console.log('C ok  running again with no changes gives the same result, no duplicates');
  const pend = rows().find(a => a.status === 'Pending'); const pv = pend.volunteer; pend.status = 'Declined';
  assert.ok(ok(await run())); assert.equal(rows().filter(a => a.volunteer === pv).length, 1); assert.equal(of(pv).status, 'Declined');
  console.log('D1 ok declined volunteer keeps the Declined row and is NOT re-assigned to this show');
  const open = rows().filter(a => a.status === 'Pending').length + rows().filter(a => a.status === 'Accepted').length;
  assert.equal(open, 2); console.log('D2 ok both schools still staffed by the other volunteers');
  vols['NE Show 2'] = [V(1,1.31), V(2,1.32)]; schools['NE Show 2'] = [{ ...SC(3,1.33,1), show: 'NE Show 2' }];
  assert.ok(ok(await run())); assert.ok(of('v1','NE Show 2')); assert.equal(of('v1').status, 'Accepted');
  console.log('E ok  accepted in Show 1 does not block them from Show 2');
  store = []; vols = { 'NE Show 1': [V(1,1.31), V(2,1.32), V(3,1.33)] }; schools = { 'NE Show 1': [SC(1,1.31,2)] };
  await run(); const a1 = store.find(a => a.school === 's1'); a1.status = 'Accepted';
  await run(); const filled = store.filter(a => a.school === 's1' && ['Accepted','Pending'].includes(a.status)).length;
  assert.equal(filled, 2); console.log('F ok  school with 2 places and 1 accepted gets exactly 1 more (total 2, not 3)');
  assert.ok(ok(await run({ reset: true }))); assert.equal(store.filter(a => a.status === 'Accepted').length, 0); console.log('G ok  reset:true erases accepted and starts fresh');
  const snap = JSON.stringify(store); invalid = ['bad']; const r = await run(); assert.equal(r.code, 500); assert.equal(JSON.stringify(store), snap);
  console.log('H ok  invalid record -> 500 and nothing was deleted'); invalid = [];
  const acc = store.find(a => a.status === 'Pending'); acc.status = 'Accepted'; await run({ reset: 'true' }); assert.ok(store.some(a => a.status === 'Accepted')); console.log('I ok  only boolean true triggers a reset');
  store = []; vols = { 'NE Show 1': [V(1,1.31), V(2,1.32)], 'NE Show 2': [V(1,1.31), V(2,1.32)] };
  schools = { 'NE Show 1': [SC(1,1.31,1)], 'NE Show 2': [{ ...SC(3,1.33,1), show: 'NE Show 2' }] };
  assert.ok(ok(await run())); const show1Before = JSON.stringify(rows('NE Show 1'));
  vols['NE Show 2'].push(V(9,1.34)); assert.ok(ok(await run({ show: 'NE Show 2' })));
  assert.equal(JSON.stringify(rows('NE Show 1')), show1Before); assert.equal(rows('NE Show 2').length, 3);
  console.log('J1 ok  allocating NE Show 2 only leaves NE Show 1 rows identical');
  assert.ok(ok(await run({ reset: true, show: 'NE Show 2' }))); assert.equal(JSON.stringify(rows('NE Show 1')), show1Before);
  console.log('J2 ok  resetting NE Show 2 only does not erase NE Show 1');
  assert.equal((await run({ show: 'NE Show 9' })).code, 400); console.log('J3 ok  unknown show -> 400');
  console.log('ALL RE-RUN CHECKS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
