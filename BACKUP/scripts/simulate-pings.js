// Fakes volunteers moving from their school to the venue so the HQ map can be demoed
// without 60 phones.  Owner: Chin (F3)        Run with:  npm run simulate
//
// Suggested approach:
// 1. Load published/accepted slots for one event (populate school).
// 2. Venue coordinates: National Stadium ≈ (1.3040, 103.8746), Padang ≈ (1.2932, 103.8520).
// 3. Every few seconds, for each slot, move a little further along a straight line
//    school → venue (linear interpolation), save a LocationPing and update slot.lastLocationAt.
// 4. At the right fractions of the trip, create CheckIn docs (BOARDED_OUTBOUND, DEPARTED_SCHOOL,
//    ARRIVED_VENUE ...) and update slot.lastCheckpoint.
// 5. Leave 2–3 groups "stuck" on purpose so Feature 4's overdue alerts have something to show.
// 6. Ctrl+C to stop.

const { connect, disconnect } = require('./_connect')
// const { Slot, LocationPing, CheckIn } = require('../models')
// const { toPoint } = require('../utils/geo')
// const { CHECKPOINTS } = require('../utils/constants')

async function main() {
  await connect()

  // TODO(Chin): steps 1–6 above
  console.log('simulate-pings is not implemented yet – see the comments in this file.')

  await disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
