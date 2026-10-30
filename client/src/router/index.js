// The page map: which URL shows which page, who is allowed to open it (guest, volunteer, admin), and
// the redirect rules run before and after each page change.

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import { landingFor } from './landing'
import HomeView from '@/views/HomeView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { public: true, title: 'Home' } },

  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guestOnly: true, title: 'Log in' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/volunteer/RegisterView.vue'),
    meta: { guestOnly: true, title: 'Volunteer sign-up' },
  },

  {
    path: '/volunteer',
    meta: { roles: ['volunteer'] },
    children: [
      { path: '', redirect: { name: 'volunteer-assignment' } },
      {
        path: 'assignment',
        name: 'volunteer-assignment',
        component: () => import('@/views/volunteer/MyAssignmentView.vue'),
        meta: { title: 'My assignment' },
      },
      {
        path: 'tracking',
        name: 'volunteer-tracking',
        component: () => import('@/views/volunteer/TrackingView.vue'),
        meta: { title: 'Event day' },
      },
      { path: 'report', redirect: '/volunteer/tracking' },
      {
        path: 'badges',
        name: 'volunteer-badges',
        component: () => import('@/views/volunteer/MyBadgesView.vue'),
        meta: { title: 'My badges' },
      },
      {
        path: 'badge-studio',
        name: 'volunteer-badge-studio',
        component: () => import('@/views/volunteer/BadgeStudioView.vue'),
        meta: { title: 'Badge Studio' },
      },
    ],
  },

  {
    path: '/admin',
    meta: { roles: ['admin'] },
    children: [
      { path: '', redirect: { name: 'admin-allocation' } },
      {
        path: 'allocation',
        name: 'admin-allocation',
        component: () => import('@/views/admin/AllocationBoardView.vue'),
        meta: { title: 'Allocation' },
      },
      {
        path: 'live',
        name: 'admin-live',
        component: () => import('@/views/admin/HqLiveBoardView.vue'),
        meta: { title: 'Live board' },
      },
      {
        path: 'incidents',
        name: 'admin-incidents',
        component: () => import('@/views/admin/IncidentQueueView.vue'),
        meta: { title: 'Incidents & alerts' },
      },
      {
        path: 'badges',
        name: 'admin-badges',
        component: () => import('@/views/admin/BadgeAwardsView.vue'),
        meta: { title: 'Badges & orders' },
      },
    ],
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true, title: 'Not found' },
  },
]

// router - creates the page router with history mode, the route list above, and every page change
// scrolling to the top.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// Vue.js beforeEach Guard: Runs before every navigation and decides whether to allow it. Navigation
// guard (runs before EVERY page change). Step by step: 1. Ask the server who is logged in (only the
// first time per page load - auth.restore). 2. Read the route labels: guestOnly, public, roles. 3.
// Guest-only page (login/register): a logged-in person is sent to their own landing page, a guest may
// enter. 4. A logged-in person opening "/" (Home) is sent to their own landing page. 5. Public page:
// allow. 6. Not logged in: send to /login with ?redirect=<the page they wanted>. 7. Wrong role (e.g. a
// volunteer opening /admin): send to their own landing page. 8. Otherwise allow.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()

  const { guestOnly, public: isPublic, roles } = to.meta

  if (guestOnly) return auth.isLoggedIn ? landingFor(auth.role) : true

  if (to.name === 'home' && auth.isLoggedIn) return landingFor(auth.role)

  if (isPublic) return true

  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }

  if (roles && !roles.includes(auth.role)) return landingFor(auth.role)
  return true
})

// Runs after a navigation succeeds and sets the browser tab text. Routes with no title displays
// "Heartware" After every successful navigation set the browser tab title to "<page title> · Heartware
// Volunteer Ops".
router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Heartware'} · Heartware Volunteer Ops`
})

export default router
