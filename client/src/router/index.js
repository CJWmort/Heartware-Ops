import { createRouter, createWebHistory } from 'vue-router' // needed by createRouter() / createWebHistory() below
import { useAuthStore } from '@/services/auth'
import HomeView from '@/views/HomeView.vue'

const routes = [
  // ---- Anyone
  { path: '/', name: 'home', component: HomeView, meta: { public: true, title: 'Home' } },
  // 'path': URL that triggers this route
  // 'name': Nickname so code can just say 'router.push({ name: 'home' })', works even if path changes
  // 'component': The page to show
  // 'meta': Our own labels, read by the 'navigation guard' in Vue.js

  // ---- Guests only
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'), // load this file only when someone visits the page
    meta: { guestOnly: true, title: 'Log in' },
    // 'meta' is a free-form object attached to a route.
    // For us to put our own labels, and the code reads them later through 'to.meta'.
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/volunteer/RegisterView.vue'),
    meta: { guestOnly: true, title: 'Volunteer sign-up' },
  },

  // ---- Volunteer pages: /volunteer/...
  {
    path: '/volunteer',
    meta: { roles: ['volunteer'] }, // applies to every child below
    children: [
      { path: '', redirect: { name: 'volunteer-assignment' } },
      {
        path: 'assignment', // F1b – Fanny
        name: 'volunteer-assignment',
        component: () => import('@/views/volunteer/MyAssignmentView.vue'),
        meta: { title: 'My assignment' },
      },
      {
        path: 'tracking', // F3 – Chin
        name: 'volunteer-tracking',
        component: () => import('@/views/volunteer/TrackingView.vue'),
        meta: { title: 'Event day' },
      },
      {
        path: 'report', // F4 – Wei Ming
        name: 'volunteer-report',
        component: () => import('@/views/volunteer/ReportIncidentView.vue'),
        meta: { title: 'Report incident' },
      },
      {
        path: 'badges', // F5 – Hanafi
        name: 'volunteer-badges',
        component: () => import('@/views/volunteer/MyBadgesView.vue'),
        meta: { title: 'My badges' },
      },
      {
        path: 'badge-studio', // F5 – Hanafi
        name: 'volunteer-badge-studio',
        component: () => import('@/views/volunteer/BadgeStudioView.vue'),
        meta: { title: 'Badge Studio' },
      },
    ],
  },

  // ---- Admin pages: /admin/...
  {
    path: '/admin',
    meta: { roles: ['admin'] }, // applies to every child below
    children: [
      { path: '', redirect: { name: 'admin-allocation' } },
      {
        path: 'allocation', // F1b – Fanny
        name: 'admin-allocation',
        component: () => import('@/views/admin/AllocationBoardView.vue'),
        meta: { title: 'Allocation' },
      },
      {
        path: 'live', // F3 – Chin
        name: 'admin-live',
        component: () => import('@/views/admin/HqLiveBoardView.vue'),
        meta: { title: 'Live board' },
      },
      {
        path: 'incidents', // F4 – Wei Ming
        name: 'admin-incidents',
        component: () => import('@/views/admin/IncidentQueueView.vue'),
        meta: { title: 'Incidents & alerts' },
      },
      {
        path: 'badges', // F5 – Hanafi
        name: 'admin-badges',
        component: () => import('@/views/admin/BadgeAwardsView.vue'),
        meta: { title: 'Badges & orders' },
      },
    ],
  },

  // ---- Anything else
  {
    path: '/:pathMatch(.*)*', // Any URL that no routes matched will display 'Not Found' view
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true, title: 'Not found' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // Lets users use the browser's native back and forward buttons smoothly
  routes, // All the routes listed above
  scrollBehavior: () => ({ top: 0 }), // Scrolls to the top after each navigation
})

// Vue.js beforeEach Guard: Runs before every navigation and decides whether to allow it.
router.beforeEach(async (to) => {
  // 'to' is the page being opened
  const auth = useAuthStore()
  await auth.restore() // asks the server who is logged in once per page load

  // Pulls the labels out of the merged meta
  const { guestOnly, public: isPublic, roles } = to.meta

  // Check if user has role, if already logged in, go home. Otherwise allow.
  if (guestOnly) return auth.isLoggedIn ? { name: 'home' } : true

  // Allow everyone to access Home and 'not allowed' view
  if (isPublic) return true

  // If user is guest, go to /login, and remember where they were headed in ?redirect=...
  // so LoginView can send user back to that route they were trying to access after login.
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }

  // If user role is not on the allowed role list, go to home view.
  if (roles && !roles.includes(auth.role)) return { name: 'home' }
  return true
})

// Runs after a navigation succeeds and sets the browser tab text.
// Routes with no title displays "Heartware"
router.afterEach((to) => {
  // 'to.meta.title' defined in the 'meta' tags
  // '??' means "use the right side if the left is null or undefined"
  document.title = `${to.meta.title ?? 'Heartware'} · Heartware Volunteer Ops`
})

export default router
