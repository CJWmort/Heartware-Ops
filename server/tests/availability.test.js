// Server test for the availability endpoints, using fake modules.

const Module = require('module'); const path = require('path'); const assert = require('assert');
const S = path.resolve(__dirname, '..');
let user = { availableShows: ['NE Show 1', 'NE Show 2'] }; let accepted = []; let deleted = null; let saved = null;
let published = []; let reserved = null; let refilled = [];
const stubs = {
  '../models/account-model': { findById: async () => user, updateAvailableShows: async (id, shows) => { saved = shows; return { name: 'Ann', availableShows: shows }; }, removeAvailableShows: async (id, shows) => { saved = shows; return {}; } },
  '../models/assignments-model': { acceptedShowsAmong: async (id, shows) => accepted.filter((s) => shows.includes(s)), deleteOpenForShows: async (id, shows) => { deleted = shows; },
    publishedShows: async () => published, addToReserve: async (id, name, shows, published) => { reserved = { id, name, shows, published }; } },
  '../utils/reserve-replacement': { replaceFromReserve: async (show) => { refilled.push(show); return []; } },
  '../services/onemap': {}, bcrypt: {}, '../utils/otp': {},
  // disconnectUser() - fake socket helper that does nothing, so the test never needs a real
  // connection.
  '../sockets': { disconnectUser() {} },
};
// Module._load - swaps in the fake modules (stubs) whenever the code under test requires them;
// anything else loads normally.
const orig = Module._load; Module._load = function (req, ...r) { return stubs[req] || orig(req, ...r); };
const ctl = require(path.join(S, 'controllers/accounts-controller.js'));
// o.status / o.json - fake response helpers: status stores the code and json stores the body so the
// test can check them.
const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; return o; };
(async () => {
  let o = res(); await ctl.updateMe({ session: { userId: 'u' }, body: { availableShows: ['NE Show 1'] } }, o);
  assert.equal(o.code, 200); assert.deepEqual(deleted, ['NE Show 2']); assert.deepEqual(saved, ['NE Show 1']); console.log('1 ok  unticking Show 2 deletes its open rows and saves');
  deleted = null; saved = null; accepted = ['NE Show 2'];
  o = res(); await ctl.updateMe({ session: { userId: 'u' }, body: { availableShows: ['NE Show 1'] } }, o);
  assert.equal(o.code, 409); assert.match(o.body.message, /NE Show 2/); assert.equal(deleted, null); assert.equal(saved, null); console.log('2 ok  accepted show -> 409, nothing deleted, nothing saved');
  deleted = null; o = res(); await ctl.updateMe({ session: { userId: 'u' }, body: { availableShows: ['NE Show 1', 'NE Show 2', 'NE Show 3'] } }, o);
  assert.equal(o.code, 200); assert.equal(deleted, null); console.log('3 ok  only ADDING shows touches no allocations');
  accepted = []; o = res(); await ctl.removeMyShows({ session: { userId: 'u' }, body: { availableShows: ['NE Show 2', 'NE Show 4'] } }, o);
  assert.deepEqual(deleted, ['NE Show 2'], 'NE Show 4 was never ticked, so it is not "removed"'); console.log('4 ok  DELETE /me only treats really-ticked shows as removed');
  accepted = ['NE Show 1']; o = res(); await ctl.removeMyShows({ session: { userId: 'u' }, body: { availableShows: ['NE Show 1'] } }, o); assert.equal(o.code, 409); console.log('5 ok  DELETE /me also refuses accepted shows');
  o = res(); await ctl.updateMe({ session: { userId: 'u' }, body: { availableShows: 'x' } }, o); assert.equal(o.code, 400); console.log('6 ok  bad input -> 400');
  user = { availableShows: ['NE Show 1'] }; published = ['NE Show 2']; reserved = null; refilled = [];
  o = res(); await ctl.updateMe({ session: { userId: 'u' }, body: { availableShows: ['NE Show 1', 'NE Show 2', 'NE Show 3'] } }, o);
  assert.equal(o.code, 200);
  assert.deepEqual(reserved, { id: 'u', name: 'Ann', shows: ['NE Show 2', 'NE Show 3'], published: ['NE Show 2'] });
  assert.ok(refilled.includes('NE Show 2')); assert.ok(!refilled.includes('NE Show 3'));
  console.log('7 ok  newly ticked shows -> reserve list (published + draft); only the published show is refilled');
  reserved = null; o = res(); await ctl.updateMe({ session: { userId: 'u' }, body: { availableShows: ['NE Show 1'] } }, o);
  assert.equal(o.code, 200); assert.equal(reserved, null);
  console.log('8 ok  no newly ticked show -> nobody added to a reserve list');
  console.log('ALL AVAILABILITY CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
