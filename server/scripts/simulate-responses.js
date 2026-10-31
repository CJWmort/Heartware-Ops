// Script that pretends demo volunteers accept, decline or withdraw so the allocation board can be
// tried out.
// HOW TO RUN (from the server folder):
//   pnpm run simulate:responses                          -> 70% accept, 10% decline
//   pnpm run simulate:responses -- --accept=80 --decline=10 --withdraw=5
//   pnpm run simulate:responses -- --show="NE Show 2"    -> only that show
//   pnpm run simulate:responses -- --reset               -> puts answers back to Pending
//   --seed=N picks a different (but repeatable) set of people. --force allows production.
// Before this: seed:volunteers, then Run Allocations and press "Publish" on the admin board.

const path = require('path')
const { EMAIL_PATTERN } = require('./seed-volunteers.js')

const DECLINE_REASONS = ['Family commitment', 'Exam clash', 'Out of town', 'Work conflict', 'Not feeling well']
const WITHDRAW_REASONS = ['MC', 'Urgent matter', 'Family emergency', 'Work called me in']

// makeRandom(seed) - seeded random-number generator (same seed = same people answering).
function makeRandom(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// shuffle(list, random) - shuffled copy of a list.
function shuffle(list, random) {
  const copy = list.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// pick(list, random) - one random item from a list.
const pick = (list, random) => list[Math.floor(random() * list.length)]

// planResponses(pending, accepted, pcts, random) - decides who answers how (no database). 1) shuffle
// the Pending rows 2) first acceptPct% accept, next declinePct% decline (with a random reason), the
// rest stay Pending 3) withdrawPct% of everyone accepted (old + new) withdraw with a reason 4) return
// { toAccept, toDecline, toWithdraw }.
function planResponses(pending, accepted, { acceptPct, declinePct, withdrawPct }, random) {
  const order = shuffle(pending, random)
  const acceptCount = Math.round((order.length * acceptPct) / 100)
  const declineCount = Math.min(order.length - acceptCount, Math.round((order.length * declinePct) / 100))

  const toAccept = order.slice(0, acceptCount)
  const toDecline = order.slice(acceptCount, acceptCount + declineCount).map((row) => ({
    _id: row._id,
    reason: pick(DECLINE_REASONS, random),
  }))

  const everyoneAccepted = accepted.concat(toAccept)
  const withdrawCount = Math.round((everyoneAccepted.length * withdrawPct) / 100)
  const toWithdraw = shuffle(everyoneAccepted, random)
    .slice(0, withdrawCount)
    .map((row) => ({ _id: row._id, reason: pick(WITHDRAW_REASONS, random) }))

  return { toAccept, toDecline, toWithdraw }
}

// readOptions(argv) - reads --accept, --decline, --withdraw, --seed, --show, --reset, --force; rejects
// values outside 0 to 100 and accept + decline above 100.
function readOptions(argv) {
  // num(name, fallback) - reads a --name=number option, or returns the fallback.
  const num = (name, fallback) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`))
    return arg ? Number(arg.split('=')[1]) : fallback
  }
  // text(name) - reads a --name=text option (quotes removed), or an empty string.
  const text = (name) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`))
    return arg ? arg.slice(name.length + 3).replace(/^"|"$/g, '').trim() : ''
  }
  const options = {
    acceptPct: num('accept', 70),
    declinePct: num('decline', 10),
    withdrawPct: num('withdraw', 0),
    seed: num('seed', 1),
    show: text('show'),
    reset: argv.includes('--reset'),
    force: argv.includes('--force'),
  }
  for (const key of ['acceptPct', 'declinePct', 'withdrawPct']) {
    if (!Number.isFinite(options[key]) || options[key] < 0 || options[key] > 100) {
      throw new Error(`--${key.replace('Pct', '')} must be a number from 0 to 100`)
    }
  }
  if (options.acceptPct + options.declinePct > 100) {
    throw new Error('--accept and --decline together cannot be more than 100 (they share the same volunteers)')
  }
  return options
}

// main() - 1) read the options, refuse production unless --force, 2) find the demo volunteers only, 3)
// --reset puts answered rows back to Pending, 4) otherwise load the published Pending and Accepted
// demo rows and make some of the volunteers accept, decline or withdraw, 5) fill the gaps from the
// reserve list, 6) print a summary and disconnect.
async function main() {
  const options = readOptions(process.argv.slice(2))

  require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
  if (process.env.NODE_ENV === 'production' && !options.force) {
    console.error('Refusing to touch a PRODUCTION database. Add --force if you really mean it.')
    process.exit(1)
  }

  const mongoose = require('mongoose')
  const { connect, disconnect } = require('./_connect')
  const AccountModel = require('../models/account-model')
  const AssignmentModel = require('../models/assignments-model')
  const Shows = require('../models/shows-model')
  const { replaceFromReserve } = require('../utils/reserve-replacement')
  const Account = mongoose.model('Account')
  const Assignments = mongoose.model('Assignments')

  if (options.show && !Assignments.schema.path('show').enumValues.includes(options.show)) {
    throw new Error(`Unknown show "${options.show}". Use e.g. --show="NE Show 2"`)
  }

  await connect()

  const demo = await Account.find({ email: { $regex: EMAIL_PATTERN } }).select('_id')
  const ids = demo.map((d) => d._id)
  if (ids.length === 0) {
    console.log('No demo volunteers found. Run "pnpm run seed:volunteers" first.')
    await disconnect()
    return
  }

  const base = { volunteer: { $in: ids }, school: { $ne: null }, published: true }
  if (options.show) base.show = options.show

  if (options.reset) {
    const result = await Assignments.updateMany(
      { ...base, status: { $in: ['Accepted', 'Declined', 'Withdrawn'] } },
      { $set: { status: 'Pending' }, $unset: { withdrawReason: '' } }
    )
    console.log(`Reset ${result.modifiedCount} answers back to Pending${options.show ? ` (${options.show})` : ''}.`)
    await disconnect()
    return
  }

  const pending = await Assignments.find({ ...base, status: 'Pending' }).select('_id volunteer').lean()
  const accepted = await Assignments.find({ ...base, status: 'Accepted' }).select('_id volunteer').lean()
  if (pending.length === 0 && accepted.length === 0) {
    console.log('Nothing to answer. Run the allocation, then press "Publish" on the admin board (volunteers only see published rows).')
    await disconnect()
    return
  }

  const plan = planResponses(pending, accepted, options, makeRandom(options.seed))
  const ownerOf = new Map([...pending, ...accepted].map((r) => [String(r._id), r.volunteer]))

  const operations = plan.toAccept.map((r) => ({
    updateOne: { filter: { _id: r._id, status: 'Pending', published: true }, update: { $set: { status: 'Accepted' } } },
  }))
  const first = operations.length ? await Assignments.bulkWrite(operations) : { modifiedCount: 0 }

  const touchedShows = new Set()
  // leave(r, status) - makes a demo volunteer decline or withdraw: updates the assignment row, then
  // records the withdrawn show on the account and returns 1 (0 if the row could not be changed).
  async function leave(r, status) {
    const volunteer = ownerOf.get(String(r._id))
    const row = status === 'Declined'
      ? await AssignmentModel.declineMine(r._id, volunteer)
      : await AssignmentModel.withdrawMine(r._id, volunteer)
    if (!row) return 0
    try {
      const show = await Shows.findByName(row.show)
      await AccountModel.logWithdrawnShow(volunteer, {
        showId: show?._id,
        show: row.show,
        reportingDate: show?.date,
        reportingTime: row.school?.reportingTime,
        reportingLocation: row.school?.name,
        status,
        reason: r.reason,
      })
    } catch (error) {
      const restored = row.toObject()
      restored.school = row.school?._id
      await AssignmentModel.restore(restored)
      throw error
    }
    touchedShows.add(row.show)
    return 1
  }

  let declined = 0
  for (const r of plan.toDecline) declined += await leave(r, 'Declined')
  let withdrawn = 0
  for (const r of plan.toWithdraw) withdrawn += await leave(r, 'Withdrawn')

  let refilled = 0
  for (const show of touchedShows) refilled += (await replaceFromReserve(show)).length

  console.log(`Answered for ${pending.length} pending demo assignments${options.show ? ` in ${options.show}` : ''}:`)
  console.log(`  accepted  ${plan.toAccept.length}`)
  console.log(`  declined  ${declined}`)
  console.log(`  left Pending  ${pending.length - plan.toAccept.length - plan.toDecline.length}`)
  console.log(`  pulled out after accepting  ${withdrawn}`)
  console.log(`  places refilled from the reserve list  ${refilled}`)
  console.log(`(${first.modifiedCount + declined + withdrawn} rows changed in the database)`)
  console.log('Now refresh the admin board, or press "Run Allocations" to see accepted volunteers keep their school.')
  await disconnect()
}

module.exports = { planResponses }

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
