// The list of navbar links for each role, with their icons and labels.

export const NAV_LINKS = {
  volunteer: [
    {
      to: '/volunteer/assignment',
      label: 'Assignment',
      icon: 'bi-clipboard-check' ,
      testid: 'nav-my-assignment',
    },
    {
      to: '/volunteer/tracking',
      label: 'Tracking',
      icon: 'bi-pin-map' ,
      testid: 'nav-tracking',
    },
    { to: '/volunteer/badges', label: 'Badges', icon: 'bi-award', testid: 'nav-badges' },
  ],
  admin: [
    {
      to: '/admin/allocation',
      label: 'Allocation',
      icon: 'bi-diagram-3' ,
      testid: 'nav-allocation',
    },
    { to: '/admin/live', label: 'Live Monitoring', icon: 'bi-broadcast', testid: 'nav-hq-live' },
    { to: '/admin/incidents', label: 'Incidents', icon: 'bi-exclamation-triangle' , testid: 'nav-hq-incidents' },
    { to: '/admin/badges', label: 'Badges', icon: 'bi-trophy' , testid: 'nav-badge-awards' },
  ],
}
