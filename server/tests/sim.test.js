// Server test for the response simulator.

const assert = require('assert');
const { planResponses } = require('../scripts/simulate-responses.js');
// rows(n, p) - builds n fake rows with ids like r0, r1...
const rows = (n, p = 'r') => Array.from({ length: n }, (_, i) => ({ _id: p + i }));
// rnd(seed) - a seeded random-number generator that always gives the same sequence for the same seed,
// so the test is repeatable.
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
let p = planResponses(rows(1000), [], { acceptPct: 70, declinePct: 10, withdrawPct: 0 }, rnd(1));
assert.equal(p.toAccept.length, 700); assert.equal(p.toDecline.length, 100); assert.equal(p.toWithdraw.length, 0);
const a = new Set(p.toAccept.map(x => x._id)), d = new Set(p.toDecline.map(x => x._id)); assert.ok([...a].every(x => !d.has(x))); console.log('1 ok  1000 pending -> 700 accept, 100 decline, 200 stay Pending, nobody in both lists');
assert.ok(p.toDecline.every(x => x.reason)); console.log('2 ok  every decline carries a reason');
p = planResponses(rows(100), rows(100, 'old'), { acceptPct: 50, declinePct: 0, withdrawPct: 10 }, rnd(2));
assert.equal(p.toWithdraw.length, 15); assert.ok(p.toWithdraw.every(x => x.reason)); assert.equal(new Set(p.toWithdraw.map(x => x._id)).size, 15);
assert.ok(p.toWithdraw.some(x => x._id.startsWith('old')) || p.toWithdraw.some(x => x._id.startsWith('r'))); console.log('3 ok  withdraw 10% of (100 old + 50 new accepted) = 15, unique, with reasons');
const acc = new Set([...rows(100, 'old'), ...p.toAccept].map(x => x._id)); assert.ok(p.toWithdraw.every(x => acc.has(x._id))); console.log('4 ok  nobody is withdrawn who was not accepted');
const x1 = planResponses(rows(50), [], { acceptPct: 60, declinePct: 20, withdrawPct: 0 }, rnd(5)), x2 = planResponses(rows(50), [], { acceptPct: 60, declinePct: 20, withdrawPct: 0 }, rnd(5)), x3 = planResponses(rows(50), [], { acceptPct: 60, declinePct: 20, withdrawPct: 0 }, rnd(6));
assert.deepStrictEqual(x1, x2); assert.notDeepStrictEqual(x1.toAccept, x3.toAccept); console.log('5 ok  same seed = same answers, different seed = different people');
p = planResponses([], [], { acceptPct: 70, declinePct: 10, withdrawPct: 5 }, rnd(1)); assert.deepStrictEqual([p.toAccept.length, p.toDecline.length, p.toWithdraw.length], [0, 0, 0]);
p = planResponses(rows(10), [], { acceptPct: 100, declinePct: 0, withdrawPct: 0 }, rnd(1)); assert.equal(p.toAccept.length, 10);
p = planResponses(rows(10), [], { acceptPct: 0, declinePct: 100, withdrawPct: 0 }, rnd(1)); assert.equal(p.toDecline.length, 10);
p = planResponses(rows(3), [], { acceptPct: 50, declinePct: 50, withdrawPct: 0 }, rnd(1)); assert.ok(p.toAccept.length + p.toDecline.length <= 3); console.log('6 ok  empty list, 100% accept, 100% decline and rounding never exceed the rows available');
console.log('ALL SIMULATE CHECKS PASSED');
