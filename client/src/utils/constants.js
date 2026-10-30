// Shared fixed values: the Singapore map centre, the journey stages, the schedule and other limits.

export const JOURNEY_STAGES = Object.freeze([
  { stage: 1, label: 'Reached allocated school', short: 'At school', leg: 'out' },
  { stage: 2, label: 'Departed from school', short: 'Left school', leg: 'out' },
  { stage: 3, label: 'Reached pick-up-drop-off', short: 'At pick-up-drop-off', leg: 'out' },
  { stage: 4, label: 'Reached Padang', short: 'At Padang', leg: 'out' },
  { stage: 5, label: 'Leaving Padang', short: 'Leaving Padang', leg: 'back' },
  { stage: 6, label: 'Reached pick-up-drop-off', short: 'At pick-up-drop-off', leg: 'back' },
  { stage: 7, label: 'Reached school', short: 'Back at school', leg: 'back' },
  { stage: 8, label: 'Dismissal', short: 'Dismissed', leg: 'back' },
])

export const VENUES = Object.freeze({
  'National Stadium': { lat: 1.304, lng: 103.8746 },
  Padang: { lat: 1.2905591, lng: 103.8529176 },
})

export const SINGAPORE_CENTER = Object.freeze({ lat: 1.3521, lng: 103.8198 })

export const DROP_OUT_REASONS = Object.freeze(['MC', 'Urgent matter', 'Other'])

export const BADGE_SHAPES = Object.freeze(['circle', 'shield', 'star', 'hexagon'])

export const PING_INTERVAL_MS = 5 * 60 * 1000

export const INNER_RING = [
  [1.2826302, 103.8517394],
  [1.2875542, 103.846014],
  [1.295837, 103.8520753],
  [1.2929087, 103.8558573],
]

export const OUTER_RING = [
  [1.2804977, 103.8401127],
  [1.2740599, 103.8515496],
  [1.2776243, 103.8580942],
  [1.286238, 103.8608515],
  [1.2943018, 103.8610339],
  [1.3000683, 103.8641882],
  [1.30705, 103.8769575],
  [1.3206354, 103.8714838],
  [1.3289828, 103.8644242],
  [1.3190782, 103.8544142],
  [1.3108053, 103.8448548],
  [1.3030258, 103.841368],
  [1.2993912, 103.8428164],
  [1.2885891, 103.8413266],
]
