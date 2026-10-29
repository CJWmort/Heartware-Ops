// Pretends the DEMO volunteers have opened the app and answered their allocation (accept / decline / pull out).
// Run with:  pnpm run simulate:responses                              (70% accept, 10% decline, rest stay Pending)
//            pnpm run simulate:responses --accept=80 --decline=5      (your own percentages)
//            pnpm run simulate:responses --show="NE Show 2"           (only one show)
//            pnpm run simulate:responses --withdraw=5                 (5% of the accepted volunteers then pull out)
//            pnpm run simulate:responses --reset                      (accepted answers go back to Pending; declines and
//                                                                      pull-outs are deleted like in the real app, so press
//                                                                      "Run Allocations" to fill those places again)
//            add --seed=7 for a different (but repeatable) random pick
//
// WHY this exists: with 400 volunteers nobody is going to click Accept 300 times. This lets you test what happens
// after answers come in: the green/red/dark badges, the capacity count, a re-run that keeps accepted volunteers, etc.
//
// SAFETY RULES (declines and pull-outs use the real Assignments.declineMine / withdrawMine, so the row is deleted,
// logged in the volunteer's history and the place goes to the nearest reserve, exactly like the real buttons):
//  - Only DEMO volunteers (demo.volunteerNNN@demo.sg) are touched, never a real account.
//  - Only PUBLISHED assignments can be answered (press "Publish" on the admin board first), exactly like a real volunteer.
//  - Only Pending -> Accepted / Declined, and Accepted -> Withdrawn. Every update re-checks the old status, so a row that
//    changed in the meantime is skipped instead of overwritten.

const path = require('path')
const { EMAIL_PATTERN } = require('./seed-volunteers.js') // the same pattern that identifies demo accounts

const DECLINE_REASONS = ['Family commitment', 'Exam clash', 'Out of town', 'Work conflict', 'Not feeling well']
const WITHDRAW_REASONS = ['MC', 'Urgent matter', 'Family emergency', 'Work called me in']

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

// Seeded random numbers (same idea as seed-volunteers.js): same --seed gives the same people answering the same way
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

function shuffle(list, random) {
  const copy = list.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const pick = (list, random) => list[Math.floor(random() * list.length)]

// ---------------------------------------------------------------------------------------------
// The decision logic (pure function: no database, easy to test)
//   pending  = published Pending rows   [{ _id }]
//   accepted = published Accepted rows  [{ _id }]  (already accepted before this run)
// Returns which rows to accept / decline / withdraw, with a reason where the real app asks for one.
// ---------------------------------------------------------------------------------------------
function planResponses(pending, accepted, { acceptPct, declinePct, withdrawPct }, random) {
  // Shuffle first so WHO answers is random, then cut the list by percentage
  const order = shuffle(pending, random)
  const acceptCount = Math.round((order.length * acceptPct) / 100)
  const declineCount = Math.min(order.length - acceptCount, Math.round((order.length * declinePct) / 100))

  const toAccept = order.slice(0, acceptCount)
  const toDecline = order.slice(acceptCount, acceptCount + declineCount).map((row) => ({
    _id: row._id,
    reason: pick(DECLINE_REASONS, random),
  }))
  // everything left over stays Pending, like volunteers who have not opened the app yet

  // Withdrawing is a percentage of everyone who is Accepted AFTER the step above (old and new accepts together),
  // because a volunteer can accept and later change their mind
  const everyoneAccepted = accepted.concat(toAccept)
  const withdrawCount = Math.round((everyoneAccepted.length * withdrawPct) / 100)
  const toWithdraw = shuffle(everyoneAccepted, random)
    .slice(0, withdrawCount)
    .map((row) => ({ _id: row._id, reason: pick(WITHDRAW_REASONS, random) }))

  return { toAccept, toDecline, toWithdraw }
}

// ---------------------------------------------------------------------------------------------
// Command line options
// ---------------------------------------------------------------------------------------------
function readOptions(argv) {
  const num = (name, fallback) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`))
    return arg ? Number(arg.split('=')[1]) : fallback
  }
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
  // Catch typos early, before anything is written
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

// ---------------------------------------------------------------------------------------------
// Database part
// ---------------------------------------------------------------------------------------------
async function main() {
  const options = readOptions(process.argv.slice(2))

  require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
  if (process.env.NODE_ENV === 'production' && !options.force) {
    console.error('Refusing to touch a PRODUCTION database. Add --force if you really mean it.')
    process.exit(1)
  }

  const mongoose = require('mongoose')
  const { connect, disconnect } = require('./_connect')
  const AccountModel = require('../models/account-model') // registers "Account"
  const AssignmentModel = require('../models/assignments-model') // registers "Assignments" and its SHOWS list
  const Shows = require('../models/shows-model')
  const { replaceFromReserve } = require('../utils/reserve-replacement')
  const Account = mongoose.model('Account')
  const Assignments = mongoose.model('Assignments')

  if (options.show && !Assignments.schema.path('show').enumValues.includes(options.show)) {
    throw new Error(`Unknown show "${options.show}". Use e.g. --show="NE Show 2"`)
  }

  await connect()

  // Only demo volunteers are ever touched
  const demo = await Account.find({ email: { $regex: EMAIL_PATTERN } }).select('_id')
  const ids = demo.map((d) => d._id)
  if (ids.length === 0) {
    console.log('No demo volunteers found. Run "pnpm run seed:volunteers" first.')
    await disconnect()
    return
  }

  // Limit to one show if asked; rows without a school (Reserve) have nothing to answer, so they are never included
  const base = { volunteer: { $in: ids }, school: { $ne: null }, published: true }
  if (options.show) base.show = options.show

  // ----- --reset: put every answer back to Pending so the test can be repeated -----
  if (options.reset) {
    const result = await Assignments.updateMany(
      { ...base, status: { $in: ['Accepted', 'Declined', 'Withdrawn'] } },
      { $set: { status: 'Pending' }, $unset: { withdrawReason: '' } } // clear the reason too
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

  // bulkWrite sends everything in one go. Each update re-checks the OLD status (and published), the same guard the real
  // endpoints use, so a row that changed meanwhile is skipped rather than overwritten.
  const operations = plan.toAccept.map((r) => ({
    updateOne: { filter: { _id: r._id, status: 'Pending', published: true }, update: { $set: { status: 'Accepted' } } },
  }))
  const first = operations.length ? await Assignments.bulkWrite(operations) : { modifiedCount: 0 }

  const touchedShows = new Set()
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
  // Withdrawals run AFTER the accepts, so people who just accepted can also pull out
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

module.exports = { planResponses } // exported so the decision logic can be tested without a database

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
