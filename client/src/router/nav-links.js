// Navbar links per role. Add a link here when you add a page.
export const NAV_LINKS = {
  volunteer: [
    { to: '/me/assignment', label: 'My assignment', icon: 'bi-geo-alt', testid: 'nav-my-assignment' },
    { to: '/me/open-slots', label: 'Open slots', icon: 'bi-megaphone', testid: 'nav-open-slots' },
    { to: '/me/tracking', label: 'Event day', icon: 'bi-signpost-split', testid: 'nav-tracking' },
    { to: '/me/report', label: 'Report', icon: 'bi-exclamation-triangle', testid: 'nav-report' },
    { to: '/me/badges', label: 'Badges', icon: 'bi-award', testid: 'nav-badges' },
  ],
  coordinator: [
    { to: '/admin/allocation', label: 'Allocation', icon: 'bi-grid-3x3-gap', testid: 'nav-allocation' },
    { to: '/admin/replacements', label: 'Replacements', icon: 'bi-arrow-left-right', testid: 'nav-replacements' },
    { to: '/hq/live', label: 'Live board', icon: 'bi-broadcast', testid: 'nav-hq-live' },
    { to: '/hq/incidents', label: 'Incidents', icon: 'bi-bell', testid: 'nav-hq-incidents' },
    { to: '/admin/badges', label: 'Badges', icon: 'bi-award', testid: 'nav-badge-awards' },
  ],
  hq: [
    { to: '/hq/live', label: 'Live board', icon: 'bi-broadcast', testid: 'nav-hq-live' },
    { to: '/hq/incidents', label: 'Incidents', icon: 'bi-bell', testid: 'nav-hq-incidents' },
  ],
}
