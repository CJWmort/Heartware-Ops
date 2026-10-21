// Navbar links per role. Add a link here when you add a page.
export const NAV_LINKS = {
  volunteer: [
    { to: '/volunteer/assignment', label: 'My assignment', icon: 'bi-geo-alt', testid: 'nav-my-assignment' },
    { to: '/volunteer/tracking', label: 'Event day', icon: 'bi-signpost-split', testid: 'nav-tracking' },
    { to: '/volunteer/report', label: 'Report', icon: 'bi-exclamation-triangle', testid: 'nav-report' },
    { to: '/volunteer/badges', label: 'Badges', icon: 'bi-award', testid: 'nav-badges' },
  ],
  admin: [
    { to: '/admin/allocation', label: 'Allocation', icon: 'bi-grid-3x3-gap', testid: 'nav-allocation' },
    { to: '/admin/live', label: 'Live board', icon: 'bi-broadcast', testid: 'nav-hq-live' },
    { to: '/admin/incidents', label: 'Incidents', icon: 'bi-bell', testid: 'nav-hq-incidents' },
    { to: '/admin/badges', label: 'Badges', icon: 'bi-award', testid: 'nav-badge-awards' },
  ]
}
