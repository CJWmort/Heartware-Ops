// Server test that reporting an incident logs out correctly when needed and rejects bad input.

const Module = require('module'); const path = require('path'); const assert = require('assert'); const fs = require('fs');
const S = path.resolve(__dirname, '..');
const created = []; const closed = [];
const stubs = {
  mongoose: { isValidObjectId: () => true },
  '../models/incidents-model': { create: async (doc) => { created.push(doc); return { ...doc, _id: 'i1' }; } },
  // emit() - fake live-event sender that does nothing.
  '../sockets': { emit() {}, disconnectUser: (id) => closed.push(id) },
  '../services/onemap': { reverseGeocode: async () => 'Some address' },
  '../models/account-model': {}, '../utils/reserve-replacement': {}, bcrypt: {}, '../utils/otp': {}, '../models/assignments-model': {},
};
const orig = Module._load;
// Module._load - swaps in the fake modules (stubs) when the controller requires them; everything else
// loads normally.
Module._load = function (req, parent, ...r) { return stubs[req] ? stubs[req] : orig(req, parent, ...r); };
const incidents = require(path.join(S, 'controllers/incidents-controller.js'));
const accounts = require(path.join(S, 'controllers/accounts-controller.js'));
// res() - builds a fake response that records the status code, the JSON body and any cleared cookies
// (status, json and clearCookie are the recording helpers).
const res = () => { const o = { code: 200, cleared: [] }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; o.clearCookie = (n) => o.cleared.push(n); return o; };
// report(body) - files an incident as a logged-in test user and returns the fake response.
const report = async (body) => { const r = res(); await incidents.createIncident({ body, session: { userId: 'u1' } }, r); return r; };
(async () => {
  for (const [label, note] of [['missing', undefined], ['empty', ''], ['spaces only', '   '], ['not text', 123]]) {
    const r = await report({ type: 'x', severity: 'low', note }); assert.equal(r.code, 400, label); assert.equal(created.length, 0, label + ' must not be saved');
  }
  console.log('L1 ok  missing / empty / blank / non-text note -> 400 and nothing saved');
  const r = await report({ type: 'x', severity: 'low', note: '  Bus broke down  ' });
  assert.equal(r.code, 201); assert.equal(created[0].note, 'Bus broke down'); assert.equal(created[0].volunteer, 'u1');
  console.log('L2 ok  a real note is saved trimmed, with the reporter recorded');
  const out = res(); let destroyed = false;
  accounts.logout({ session: { userId: 'u9', destroy: (cb) => { destroyed = true; cb(); } } }, out);
  assert.ok(destroyed); assert.deepEqual(closed, ['u9']); assert.deepEqual(out.cleared, ['connect.sid']); assert.equal(out.body.message, 'Logged out');
  console.log('L3 ok  logout destroys the session AND closes that user\'s sockets');
  const out2 = res(); accounts.logout({ session: { destroy: (cb) => cb() } }, out2);
  assert.deepEqual(closed, ['u9']); assert.equal(out2.body.message, 'Logged out');
  console.log('L4 ok  logout without a userId closes nobody and still succeeds');
  const src = fs.readFileSync(path.join(S, 'sockets/index.js'), 'utf8');
  assert.ok(/io\.in\(`user:\$\{userId\}`\)\.disconnectSockets\(true\)/.test(src) && /module\.exports = \{[^}]*disconnectUser/.test(src));
  console.log('L5 ok  sockets: disconnectUser targets the "user:<id>" room and is exported');
  console.log('ALL INCIDENT / LOGOUT CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
