// Server test for the demo volunteer generator.

const assert = require('assert');
const { buildVolunteers, EMAIL_PATTERN, SHOWS } = require('../scripts/seed-volunteers.js');
const t0 = Date.now(); const v = buildVolunteers(400); console.log('built', v.length, 'in', Date.now() - t0, 'ms');
// uniq(f) - how many different values the function f gives across all seeded volunteers.
const uniq = (f) => new Set(v.map(f)).size;
assert.equal(v.length, 400);
assert.equal(uniq(x => x.name), 400, 'names unique'); assert.equal(uniq(x => x.email), 400, 'emails unique'); assert.equal(uniq(x => x.phone), 400, 'phones unique');
assert.equal(uniq(x => x.lat + ',' + x.lng), 400, 'positions unique'); console.log('1 ok  400 unique names, emails, phones and map positions');
assert.ok(v.every(x => /^[689]\d{7}$/.test(x.phone))); assert.ok(v.every(x => /^\d{6}$/.test(x.postalCode))); assert.ok(v.every(x => EMAIL_PATTERN.test(x.email)));
assert.ok(v.every(x => x.role === 'volunteer' && x.address && x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng))); console.log('2 ok  every field matches the Account schema rules (phone, postal code, required fields)');
// km(a, b) - distance in kilometres between two points (haversine formula); r converts degrees to
// radians.
const km = (a, b) => { const R = 6371, r = d => d * Math.PI / 180, dl = r(b.lat - a.lat), dg = r(b.lng - a.lng); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
let min = Infinity; for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) min = Math.min(min, km(v[i], v[j]));
assert.ok(min * 1000 >= 40); console.log('3 ok  closest two volunteers are', Math.round(min * 1000), 'm apart (rule: at least 40 m)');
const lats = v.map(x => x.lat), lngs = v.map(x => x.lng);
console.log('   lat', Math.min(...lats), '-', Math.max(...lats), '| lng', Math.min(...lngs), '-', Math.max(...lngs));
assert.ok(Math.min(...lats) > 1.2 && Math.max(...lats) < 1.47 && Math.min(...lngs) > 103.6 && Math.max(...lngs) < 104.04);
const per = SHOWS.map(s => v.filter(x => x.availableShows.includes(s)).length); console.log('4  per show', per); assert.ok(per.every(n => n === 300)); assert.ok(v.every(x => x.availableShows.length === 3));
// regions: split island into 3 x 3 grid, every cell should have volunteers
const cell = x => Math.min(2, Math.floor((x.lat - 1.2) / 0.09)) + ',' + Math.min(2, Math.floor((x.lng - 103.6) / 0.15)); const cells = {}; v.forEach(x => cells[cell(x)] = (cells[cell(x)] || 0) + 1); console.log('5  spread over 3x3 grid of the island:', cells);
const again = buildVolunteers(400); assert.deepStrictEqual(again.map(x => x.email + x.name + x.lat), v.map(x => x.email + x.name + x.lat)); console.log('6 ok  re-running gives identical accounts (so upsert never duplicates)');
const small = buildVolunteers(10); assert.equal(small.length, 10); assert.equal(buildVolunteers(1).length, 1); console.log('7 ok  --count works for small numbers');
console.log('sample:', JSON.stringify(v[0]), '\n        ', JSON.stringify(v[1]));
console.log('ALL SEED CHECKS PASSED');
