// Small helper that gives the home page for each role (guest, volunteer, admin).

// landingFor(role) - the page a logged-in person starts on: volunteer -> /volunteer/assignment, admin
// -> /admin/allocation, anything else (guest) -> "/".
export function landingFor(role) {
  if (role === 'volunteer') return '/volunteer/assignment'
  if (role === 'admin') return '/admin/allocation'
  return '/'
}
