// Basic API smoke tests using Node's built-in test runner.   Run with:  npm test
// Add your own tests here as you build endpoints (e.g. replacements.test.js).
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const app = require('../app')

let server
let baseUrl

before(async () => {
  server = app.listen(0) // random free port
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}/api`
})

after(() => server.close())

test('GET /api/health responds ok', async () => {
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'ok')
})

test('GET /api/tracking/checkpoints returns the 6 checkpoints in order', async () => {
  const res = await fetch(`${baseUrl}/tracking/checkpoints`)
  const body = await res.json()
  assert.equal(body.length, 6)
  assert.equal(body[0], 'BOARDED_OUTBOUND')
  assert.equal(body[5], 'BACK_AT_PUDO')
})

test('GET /api/incidents/templates returns templates', async () => {
  const res = await fetch(`${baseUrl}/incidents/templates`)
  const body = await res.json()
  assert.ok(body.some((t) => t.type === 'BUS_DELAYED'))
})

test('unknown route returns 404 JSON', async () => {
  const res = await fetch(`${baseUrl}/does-not-exist`)
  assert.equal(res.status, 404)
})
