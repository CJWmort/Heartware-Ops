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
  'Padang': { lat: 1.2932, lng: 103.852 },
})

export const SINGAPORE_CENTER = Object.freeze({ lat: 1.3521, lng: 103.8198 })

export const DROP_OUT_REASONS = Object.freeze(['MC', 'Urgent matter', 'Other'])

export const BADGE_SHAPES = Object.freeze(['circle', 'shield', 'star', 'hexagon'])

export const PING_INTERVAL_MS = 5 * 60 * 1000

export const INNER_RING = [
  [1.2826302, 103.8517394],
  [1.2875542, 103.8460140],
  [1.2958370, 103.8520753],
  [1.2929087, 103.8558573],
]

export const OUTER_RING = [
  [1.2804977, 103.8401127],
  [1.2740599, 103.8515496],
  [1.2776243, 103.8580942],
  [1.2862380, 103.8608515],
  [1.2943018, 103.8610339],
  [1.3000683, 103.8641882],
  [1.3070500, 103.8769575],
  [1.3206354, 103.8714838],
  [1.3289828, 103.8644242],
  [1.3190782, 103.8544142],
  [1.3108053, 103.8448548],
  [1.3030258, 103.8413680],
  [1.2993912, 103.8428164],
  [1.2993912, 103.8428164],
  [1.2885891, 103.8413266]
]