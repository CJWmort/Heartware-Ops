// Tests the "stale allocations" fix in accounts-controller: unticking a show must be refused if the volunteer ACCEPTED it,
// and must delete their Pending/Reserve rows otherwise.
const Module = require('module'); const path = require('path'); const assert = require('assert');
const S = path.resolve(__dirname, '..');
let user = { availableShows: ['NE Show 1', 'NE Show 2'] }; let accepted = []; let deleted = null; let saved = null;
const stubs = {
  '../models/account-model': { findById: async () => user, updateAvailableShows: async (id, shows) => { saved = shows; return { availableShows: shows }; }, removeAvailableShows: async (id, shows) => { saved = shows; return {}; } },
  '../models/assignments-model': { acceptedShowsAmong: async (id, shows) => accepted.filter((s) => shows.includes(s)), deleteOpenForShows: async (id, shows) => { deleted = shows; } },
  '../services/onemap': {}, bcrypt: {}, '../utils/otp': {},
  '../sockets': { disconnectUser() {} }, // NEW: accounts-controller now imports sockets (logout closes live connections); a test must not load real socket.io
};
const orig = Module._load; Module._load = function (req, ...r) { return stubs[req] || orig(req, ...r); };
const ctl = require(path.join(S, 'controllers/accounts-controller.js'));
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
  console.log('ALL AVAILABILITY CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
