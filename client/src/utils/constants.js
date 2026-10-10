// Shared values. Keep in sync with server/utils/constants.js

export const ROLES = Object.freeze({
  VOLUNTEER: 'volunteer',
  COORDINATOR: 'coordinator',
  HQ: 'hq',
})

export const CHECKPOINTS = Object.freeze([
  'BOARDED_OUTBOUND',
  'DEPARTED_SCHOOL',
  'ARRIVED_VENUE',
  'SEATED',
  'BOARDED_RETURN',
  'BACK_AT_PUDO',
])

export const CHECKPOINT_LABELS = Object.freeze({
  BOARDED_OUTBOUND: 'Boarded bus',
  DEPARTED_SCHOOL: 'Departed school',
  ARRIVED_VENUE: 'Arrived at venue',
  SEATED: 'Seated',
  BOARDED_RETURN: 'Boarded for return',
  BACK_AT_PUDO: 'Back at PUDO',
})

export const VENUES = Object.freeze({
  'National Stadium': { lat: 1.304, lng: 103.8746 },
  Padang: { lat: 1.2932, lng: 103.852 },
})

export const SINGAPORE_CENTER = Object.freeze({ lat: 1.3521, lng: 103.8198 })

export const DROP_OUT_REASONS = Object.freeze(['MC', 'Urgent matter', 'Other'])

export const BADGE_SHAPES = Object.freeze(['circle', 'shield', 'star', 'hexagon'])

export const PING_INTERVAL_MS = 5 * 60 * 1000
