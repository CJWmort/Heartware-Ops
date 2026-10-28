// Navbar links per role. Add a link here when you add a page.
export const NAV_LINKS = {
  volunteer: [
    {
      to: '/volunteer/assignment',
      label: 'Assignment',
      icon: 'bi-clipboard-check' /* assigned school/show */,
      testid: 'nav-my-assignment',
    },
    {
      to: '/volunteer/tracking',
      label: 'Tracking',
      icon: 'bi-pin-map' /* journey between school and Padang */,
      testid: 'nav-tracking',
    },
    { to: '/volunteer/badges', label: 'Badges', icon: 'bi-award', testid: 'nav-badges' },
  ],
  admin: [
    {
      to: '/admin/allocation',
      label: 'Allocation',
      icon: 'bi-diagram-3' /* matching volunteers to schools */,
      testid: 'nav-allocation',
    },
    { to: '/admin/live', label: 'Live Monitoring', icon: 'bi-broadcast', testid: 'nav-hq-live' },
    { to: '/admin/incidents', label: 'Incidents', icon: 'bi-exclamation-triangle' /* incident alerts */, testid: 'nav-hq-incidents' },
    { to: '/admin/badges', label: 'Badges', icon: 'bi-trophy' /* admin awards badges */, testid: 'nav-badge-awards' },
  ],
}
