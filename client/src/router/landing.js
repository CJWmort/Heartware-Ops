// NEW: where a logged-in person should land instead of the Home page.
// One small shared function, so LoginView.vue and the route guard in router/index.js always agree.
// Volunteers go to their Assignment page, admins go to the Allocation board, anyone else (not logged in) goes to Home.
export function landingFor(role) {
  if (role === 'volunteer') return '/volunteer/assignment' // route defined in router/index.js
  if (role === 'admin') return '/admin/allocation' // route defined in router/index.js
  return '/' // guests / unknown role: Home is the only page that makes sense
}
