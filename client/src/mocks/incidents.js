// MOCK DATA for Feature 4 (HQ incident queue) – use while the real API isn't ready.
// Shape matches GET /api/incidents and GET /api/incidents/alerts (docs/API.md),
// with slot → school populated. Delete the import from your page once the API works.
// AI-generated mock data (allowed by course policy) – logged in README.txt.

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString()

// A tiny inline image so the photo thumbnail has something to show (no internet needed)
const SAMPLE_PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#cfd8e3"/><text x="80" y="66" font-size="14" text-anchor="middle" fill="#475569" font-family="sans-serif">photo</text></svg>',
  )

export const mockIncidents = [
  {
    _id: 'inc-001',
    type: 'STUDENT_UNWELL',
    severity: 'high',
    status: 'new',
    note: 'Student feeling dizzy after walking from the bus. Teacher is with her.',
    photoUrl: null,
    location: { type: 'Point', coordinates: [103.8746, 1.304] }, // [lng, lat] – National Stadium
    createdAt: minutesAgo(2),
    reporter: { name: 'Wei Ling Tan', phone: '91234567' },
    slot: { _id: 'slot-11', busNo: 'B03', className: '5B', school: { name: 'Tampines Mock Primary School' } },
    history: [{ status: 'new', at: minutesAgo(2) }],
  },
  {
    _id: 'inc-002',
    type: 'BUS_DELAYED',
    severity: 'medium',
    status: 'new',
    note: 'Stuck on PIE near Eunos, ETA +15 min.',
    photoUrl: null,
    location: { type: 'Point', coordinates: [103.9012, 1.3297] },
    createdAt: minutesAgo(6),
    reporter: { name: 'Arjun Kumar', phone: '98765432' },
    slot: { _id: 'slot-24', busNo: 'B01', className: '5A', school: { name: 'Bedok Mock Primary School' } },
    history: [{ status: 'new', at: minutesAgo(6) }],
  },
  {
    _id: 'inc-003',
    type: 'LOST_ITEM',
    severity: 'low',
    status: 'new',
    note: 'Blue water bottle left at the seating area, section 112.',
    photoUrl: SAMPLE_PHOTO,
    location: { type: 'Point', coordinates: [103.8749, 1.3043] },
    createdAt: minutesAgo(11),
    reporter: { name: 'Siti Rahman', phone: '90001111' },
    slot: { _id: 'slot-37', busNo: 'B02', className: '5C', school: { name: 'Woodlands Mock Primary School' } },
    history: [{ status: 'new', at: minutesAgo(11) }],
  },
  {
    _id: 'inc-004',
    type: 'OTHER',
    severity: 'medium',
    status: 'new',
    note: 'Gate C entry queue very long, groups waiting outside.',
    photoUrl: null,
    location: null, // volunteer denied GPS – your page should handle "no location"
    createdAt: minutesAgo(14),
    reporter: { name: 'Marcus Lim', phone: '93332222' },
    slot: { _id: 'slot-08', busNo: 'B04', className: '5D', school: { name: 'Punggol Mock Primary School' } },
    history: [{ status: 'new', at: minutesAgo(14) }],
  },
  {
    _id: 'inc-005',
    type: 'STUDENT_UNWELL',
    severity: 'high',
    status: 'acknowledged',
    note: 'Nosebleed, first aid applied. Monitoring.',
    photoUrl: null,
    location: { type: 'Point', coordinates: [103.852, 1.2932] }, // Padang
    createdAt: minutesAgo(25),
    reporter: { name: 'Nurul Ismail', phone: '94445555' },
    slot: { _id: 'slot-52', busNo: 'B01', className: '5E', school: { name: 'Yishun Mock Primary School' } },
    history: [
      { status: 'new', at: minutesAgo(25) },
      { status: 'acknowledged', at: minutesAgo(22), note: 'Medic dispatched to section 3' },
    ],
  },
  {
    _id: 'inc-006',
    type: 'BUS_DELAYED',
    severity: 'medium',
    status: 'acknowledged',
    note: 'Driver took wrong exit, rerouting now.',
    photoUrl: null,
    location: { type: 'Point', coordinates: [103.7637, 1.359] },
    createdAt: minutesAgo(31),
    reporter: { name: 'Ethan Goh', phone: '95556666' },
    slot: { _id: 'slot-61', busNo: 'B02', className: '5A', school: { name: 'Bukit Batok Mock Primary School' } },
    history: [
      { status: 'new', at: minutesAgo(31) },
      { status: 'acknowledged', at: minutesAgo(29) },
    ],
  },
  {
    _id: 'inc-007',
    type: 'LOST_ITEM',
    severity: 'low',
    status: 'resolved',
    note: 'Student lost EZ-Link card on bus.',
    photoUrl: null,
    location: { type: 'Point', coordinates: [103.8454, 1.3691] },
    createdAt: minutesAgo(58),
    reporter: { name: 'Priya Nair', phone: '96667777' },
    slot: { _id: 'slot-15', busNo: 'B03', className: '5C', school: { name: 'Ang Mo Kio Mock Primary School' } },
    history: [
      { status: 'new', at: minutesAgo(58) },
      { status: 'acknowledged', at: minutesAgo(55) },
      { status: 'resolved', at: minutesAgo(40), note: 'Card found under seat by driver, returned.' },
    ],
  },
  {
    _id: 'inc-008',
    type: 'OTHER',
    severity: 'low',
    status: 'resolved',
    note: 'Need 2 extra ponchos for students – light rain.',
    photoUrl: SAMPLE_PHOTO,
    location: { type: 'Point', coordinates: [103.8743, 1.3038] },
    createdAt: minutesAgo(72),
    reporter: { name: 'Hui Min Ong', phone: '97778888' },
    slot: { _id: 'slot-29', busNo: 'B01', className: '5B', school: { name: 'Sengkang Mock Primary School' } },
    history: [
      { status: 'new', at: minutesAgo(72) },
      { status: 'acknowledged', at: minutesAgo(70) },
      { status: 'resolved', at: minutesAgo(61), note: 'Ponchos handed over at Gate B.' },
    ],
  },
]

export const mockAlerts = [
  {
    _id: 'alert-001',
    missedCheckpoint: 'ARRIVED_VENUE',
    dueAt: minutesAgo(9),
    status: 'open',
    slot: { _id: 'slot-44', busNo: 'B02', className: '5D', school: { name: 'Sembawang Mock Primary School' } },
  },
  {
    _id: 'alert-002',
    missedCheckpoint: 'DEPARTED_SCHOOL',
    dueAt: minutesAgo(21),
    status: 'open',
    slot: { _id: 'slot-70', busNo: 'B01', className: '5A', school: { name: 'Choa Chu Kang Mock Primary School' } },
  },
  {
    _id: 'alert-003',
    missedCheckpoint: 'SEATED',
    dueAt: minutesAgo(4),
    status: 'acknowledged',
    slot: { _id: 'slot-24', busNo: 'B01', className: '5A', school: { name: 'Bedok Mock Primary School' } },
  },
]

// Same as server/data/incident-templates.json – for offline use only.
// Once the server is running, load them with listTemplates() from '@/services/incidents'.
export const mockTemplates = [
  { type: 'STUDENT_UNWELL', label: 'Student unwell', icon: 'bi-bandaid-fill', defaultSeverity: 'high' },
  { type: 'BUS_DELAYED', label: 'Bus delayed', icon: 'bi-bus-front-fill', defaultSeverity: 'medium' },
  { type: 'LOST_ITEM', label: 'Lost item', icon: 'bi-bag-x-fill', defaultSeverity: 'low' },
  { type: 'OTHER', label: 'Something else', icon: 'bi-exclamation-circle-fill', defaultSeverity: 'medium' },
]
