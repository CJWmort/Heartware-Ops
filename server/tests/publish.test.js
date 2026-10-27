const Module = require('module'); const path = require('path'); const assert = require('assert'); const fs = require('fs');
const S = path.resolve(__dirname, '..'); const calls = [];
const fake = { SHOWS: ['NE Show 1','NE Show 2','NE Show 3','NE Show 4'], publish: async (show) => { calls.push(show); return { modifiedCount: show ? 3 : 12 }; } };
const stubs = { 'mongoose': { Types: { ObjectId: { isValid: () => true } } }, '../sockets': { emit() {} }, /* live updates: not needed in a test */ '../models/shows-model': {}, /* FIX: shows-model was added later and crashed on the stubbed mongoose */ '../models/assignments-model': fake, '../models/account-model': {}, '../models/schools-model': {}, 'dotenv': { config() {} }, '../utils/greedy': {} };
const orig = Module._load;
Module._load = function (req, parent, ...r) { if (stubs[req]) return stubs[req]; if (req === '../utils/scarcityFirst') return () => {}; return orig(req, parent, ...r); };
const ctl = require(path.join(S, 'controllers/assignments-controller.js'));
const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; return o; };
(async () => {
  let r = res(); await ctl.publishAssignments({ body: { show: 'NE Show 9' } }, r); assert.equal(r.code, 400); assert.deepEqual(calls, []); console.log('1 ok  unknown show -> 400, nothing published');
  r = res(); await ctl.publishAssignments({ body: { show: '  NE Show 1 ' } }, r); assert.equal(r.code, 200); assert.deepEqual(calls, ['NE Show 1']); assert.deepEqual(r.body, { published: 3, show: 'NE Show 1' }); console.log('2 ok  one show (spaces trimmed) -> publishes that show, reports count');
  r = res(); await ctl.publishAssignments({ body: {} }, r); assert.equal(calls.at(-1), null); assert.equal(r.body.show, 'all'); console.log('3 ok  no show -> publishes all shows');
  r = res(); await ctl.publishAssignments({}, r); assert.equal(r.code, 200); console.log('4 ok  no body at all does not crash');
  r = res(); await ctl.publishAssignments({ body: { show: 5 } }, r); assert.equal(r.code, 200); assert.equal(calls.at(-1), null); console.log('5 ok  non-text show ignored (treated as all)');
  // static checks on the model source: volunteers can only see / answer PUBLISHED rows
  const m = fs.readFileSync(path.join(S, 'models/assignments-model.js'), 'utf8');
  const fn = (name) => { const a = m.indexOf('exports.' + name + ' ='); /* FIX: ' =' so 'publish' no longer matches 'publishedShows' */ return m.slice(a, m.indexOf('\n};', a)); };
  for (const n of ['findMine', 'acceptMine', 'declineMine']) assert.ok(/published: true/.test(fn(n)), n + ' must require published: true');
  assert.ok(!/published/.test(fn('withdrawMine')), 'withdraw is for accepted rows, which were already published');
  assert.ok(/\$ne: true/.test(fn('publish')) && /\$set: \{ published: true \}/.test(fn('publish')));
  assert.ok(/default: false/.test(m.slice(m.indexOf('published: {'), m.indexOf('published: {') + 80)));
  console.log('6 ok  model: findMine/accept/decline require published:true; publish catches old rows ($ne true); default is false');
  console.log('ALL PUBLISH CHECKS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
