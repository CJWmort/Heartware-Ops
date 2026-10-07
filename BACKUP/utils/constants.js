// Shared values. Keep in sync with client/src/utils/constants.js

const ROLES = Object.freeze({
  VOLUNTEER: 'volunteer',
  COORDINATOR: 'coordinator',
  HQ: 'hq',
})

// Order matters – volunteers must check in in this order.
const CHECKPOINTS = Object.freeze([
  'BOARDED_OUTBOUND',
  'DEPARTED_SCHOOL',
  'ARRIVED_VENUE',
  'SEATED',
  'BOARDED_RETURN',
  'BACK_AT_PUDO',
])

const VENUES = Object.freeze(['National Stadium', 'Padang'])

const SLOT_STATUS = Object.freeze([
  'unassigned', // no volunteer yet
  'proposed', // algorithm/coordinator picked someone, not published
  'published', // volunteer can see it
  'accepted',
  'declined',
  'vacant', // volunteer dropped out / no-show → see Replacement
])

const DROP_OUT_REASONS = Object.freeze(['MC', 'Urgent matter', 'No-show', 'Other'])

const INCIDENT_TYPES = Object.freeze(['STUDENT_UNWELL', 'BUS_DELAYED', 'LOST_ITEM', 'OTHER'])
const INCIDENT_STATUS = Object.freeze(['new', 'acknowledged', 'resolved'])
const SEVERITY = Object.freeze(['low', 'medium', 'high'])

const BADGE_SHAPES = Object.freeze(['circle', 'shield', 'star', 'hexagon'])
const ORDER_STATUS = Object.freeze(['placed', 'in-production', 'shipped', 'delivered'])

// How often the volunteer app sends location while tracking is open
const PING_INTERVAL_MS = 5 * 60 * 1000

module.exports = {
  ROLES,
  CHECKPOINTS,
  VENUES,
  SLOT_STATUS,
  DROP_OUT_REASONS,
  INCIDENT_TYPES,
  INCIDENT_STATUS,
  SEVERITY,
  BADGE_SHAPES,
  ORDER_STATUS,
  PING_INTERVAL_MS,
}
