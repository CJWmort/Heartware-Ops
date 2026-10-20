// Tests middleware/rate-limit.js: allows up to `max` requests per window, then answers 429, then recovers.
const path = require('path'); const assert = require('assert');
const rateLimit = require(path.resolve(__dirname, '../middleware/rate-limit.js'));
const mkRes = () => { const r = { code: 200, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.set = (k, v) => { r.headers[k] = v; return r; }; return r; };
const hit = (mw, ip) => { const res = mkRes(); let passed = false; mw({ ip }, res, () => { passed = true; }); return { passed, res }; };

const mw = rateLimit({ windowMs: 200, max: 3, message: 'slow down' });
for (let i = 0; i < 3; i++) assert.ok(hit(mw, '1.1.1.1').passed, 'request ' + (i + 1) + ' should pass');
let r = hit(mw, '1.1.1.1'); assert.equal(r.passed, false); assert.equal(r.res.code, 429); assert.equal(r.res.body.message, 'slow down'); assert.ok(Number(r.res.headers['Retry-After']) >= 1);
console.log('1 ok  3 allowed, 4th gets 429 with message and Retry-After');
assert.ok(hit(mw, '2.2.2.2').passed); console.log('2 ok  a different visitor is not affected');
setTimeout(() => {
  assert.ok(hit(mw, '1.1.1.1').passed); console.log('3 ok  after the window the visitor can try again');
  assert.equal(hit(rateLimit({ windowMs: 1000, max: 0 }), 'x').res.body.message, 'Too many requests. Please wait a few minutes and try again.');
  console.log('4 ok  default message used when none is given'); console.log('ALL RATE-LIMIT CHECKS PASSED');
}, 260);
