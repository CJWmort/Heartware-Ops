// Tests the REAL undoMine() from the model file, using an in-memory fake of the database collection.
const Module = require('module'); const path = require('path'); const assert = require('assert');
const S = path.resolve(__dirname, '..');
let rows = []; const schools = { s1: { _id: 's1', p5Classes: 2 } }; let lastUpdate = null;
const match = (r, f) => Object.entries(f).every(([k, v]) => {
  if (k === '_id' && v && v.$ne) return r._id !== v.$ne;
  if (v && v.$in) return v.$in.includes(r[k]);
  if (v && v.$ne !== undefined) return r[k] !== v.$ne && !(v.$ne === null && r[k] == null);
  return String(r[k]) === String(v);
});
const Assignments = {
  // return a COPY, like a real database does (a fetched document is not the stored row, so later updates do not change it)
  findOne: async (f) => { const r = rows.find((x) => match(x, f)); return r ? { ...r } : null; },
  countDocuments: async (f) => rows.filter((r) => match(r, f)).length,
  updateOne: async (f, u) => { const r = rows.find((x) => match(x, f)); if (r) Object.assign(r, u.$set); return {}; },
  findOneAndUpdate: (f, u) => { const r = rows.find((x) => match(x, f)); if (r) { lastUpdate = u; Object.assign(r, u.$set); if (u.$unset) delete r.withdrawReason; } return { populate: async () => r || null }; },
};
class Schema { constructor() {} path() { return { enumValues: [] }; } index() {} pre() {} }
Schema.Types = { ObjectId: 'oid' };
const stubs = { mongoose: { Schema, model: () => Assignments, Types: {} }, './schools-model': { findById: async (id) => schools[id] || null }, './account-model': {} };
const orig = Module._load; Module._load = function (req, ...r) { return stubs[req] || orig(req, ...r); };
const M = require(path.join(S, 'models/assignments-model.js'));
const mk = (id, vol, status, extra = {}) => ({ _id: id, volunteer: vol, show: 'NE Show 1', school: 's1', status, published: true, ...extra });
(async () => {
  rows = [mk('a', 'v1', 'Declined', { withdrawReason: 'Exam' })];
  let r = await M.undoMine('a', 'v1'); assert.equal(r.assignment.status, 'Pending'); assert.equal(r.assignment.withdrawReason, undefined);
  console.log('1 ok  Declined -> Pending, reason cleared');
  rows = [mk('a', 'v1', 'Withdrawn', { withdrawReason: 'MC' })];
  r = await M.undoMine('a', 'v1'); assert.equal(r.assignment.status, 'Accepted'); console.log('2 ok  Withdrawn -> Accepted');
  rows = [mk('a', 'v1', 'Declined'), mk('b', 'v2', 'Accepted'), mk('c', 'v3', 'Pending')];
  r = await M.undoMine('a', 'v1'); assert.equal(r.problem, 'full'); assert.equal(rows[0].status, 'Declined'); console.log('3 ok  school full (2 of 2 held by others) -> refused, row unchanged');
  rows = [mk('a', 'v1', 'Declined'), mk('b', 'v2', 'Accepted'), mk('c', 'v3', 'Declined'), mk('d', 'v4', 'Reserve', { school: null })];
  r = await M.undoMine('a', 'v1'); assert.ok(r.assignment); console.log('4 ok  other Declined / Reserve rows do not hold a place -> allowed');
  rows = [mk('a', 'v1', 'Declined')]; r = await M.undoMine('a', 'someone-else'); assert.equal(r.problem, 'notfound'); console.log('5 ok  not your row -> notfound');
  rows = [mk('a', 'v1', 'Declined', { published: false })]; r = await M.undoMine('a', 'v1'); assert.equal(r.problem, 'notfound'); console.log('6 ok  unpublished draft -> notfound');
  rows = [mk('a', 'v1', 'Pending')]; r = await M.undoMine('a', 'v1'); assert.equal(r.problem, 'notfound'); rows = [mk('a', 'v1', 'Accepted')]; r = await M.undoMine('a', 'v1'); assert.equal(r.problem, 'notfound'); console.log('7 ok  Pending / Accepted rows have nothing to undo');
  rows = [mk('a', 'v1', 'Declined', { school: null })]; r = await M.undoMine('a', 'v1'); assert.equal(r.problem, 'notfound'); console.log('8 ok  row without a school -> notfound');
  rows = [mk('a', 'v1', 'Declined'), mk('b', 'v2', 'Pending', { show: 'NE Show 2' }), mk('c', 'v3', 'Accepted', { show: 'NE Show 2' })];
  r = await M.undoMine('a', 'v1'); assert.ok(r.assignment); console.log('9 ok  places held in a DIFFERENT show are not counted');
  // race: the pre-check sees a free place, but by the time we save, another volunteer has also taken one
  const realCount = Assignments.countDocuments; let n = 0;
  Assignments.countDocuments = async () => (++n === 1 ? 0 : 3); // 1st count (before save) = free, 2nd (after save) = over capacity of 2
  rows = [mk('a', 'v1', 'Declined', { withdrawReason: 'Exam' })];
  r = await M.undoMine('a', 'v1'); assert.equal(r.problem, 'full'); assert.equal(rows[0].status, 'Declined'); assert.equal(rows[0].withdrawReason, 'Exam');
  Assignments.countDocuments = realCount; console.log('11 ok race: over capacity after saving -> rolled back to Declined with the reason kept');
  // controller mapping
  const stubs2 = { mongoose: { Types: { ObjectId: { isValid: (x) => x !== 'bad' } } }, '../models/assignments-model': { undoMine: async (id) => id === 'full' ? { problem: 'full' } : id === 'nf' ? { problem: 'notfound' } : { assignment: { status: 'Pending' } } }, '../models/account-model': {}, '../models/schools-model': {}, dotenv: { config() {} }, '../utils/greedy': {} };
  Module._load = function (req, ...a) { if (stubs2[req]) return stubs2[req]; if (req === '../utils/scarcityFirst') return () => {}; return orig(req, ...a); };
  delete require.cache[path.join(S, 'controllers/assignments-controller.js')];
  const ctl = require(path.join(S, 'controllers/assignments-controller.js'));
  const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; return o; };
  for (const [id, code] of [['bad', 400], ['full', 409], ['nf', 404], ['ok', 200]]) { const o = res(); await ctl.undoMyAssignment({ params: { id }, session: { userId: 'v1' } }, o); assert.equal(o.code, code, id); }
  console.log('10 ok controller: invalid id 400, full 409, notfound 404, success 200');
  console.log('ALL UNDO CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
