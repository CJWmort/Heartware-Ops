// Which URL shows which page, and who is allowed to see it. Owner: Kuah (app shell)
//
// meta.roles  – only these roles may open the page (others are sent home)
// meta.public – no login needed
// meta.title  – browser tab title
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'

const VOLUNTEER = ['volunteer']
const COORDINATOR = ['coordinator']
const HQ = ['hq', 'coordinator']

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { public: true, title: 'Home' } },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, guestOnly: true, title: 'Log in' },
  },

  // ---- Feature 1a – Registration (Kuah)
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/volunteer/RegisterView.vue'),
    meta: { public: true, guestOnly: true, title: 'Volunteer sign-up' },
  },

  // ---- Volunteer pages
  {
    path: '/me/assignment', // F1b – Fanny
    name: 'my-assignment',
    component: () => import('@/views/volunteer/MyAssignmentView.vue'),
    meta: { roles: VOLUNTEER, title: 'My assignment' },
  },
  {
    path: '/me/open-slots', // F2 – Yap
    name: 'open-slots',
    component: () => import('@/views/volunteer/OpenSlotsView.vue'),
    meta: { roles: VOLUNTEER, title: 'Open slots' },
  },
  {
    path: '/me/tracking', // F3 – Chin
    name: 'tracking',
    component: () => import('@/views/volunteer/TrackingView.vue'),
    meta: { roles: VOLUNTEER, title: 'Event day' },
  },
  {
    path: '/me/report', // F4 – Wei Ming
    name: 'report-incident',
    component: () => import('@/views/volunteer/ReportIncidentView.vue'),
    meta: { roles: VOLUNTEER, title: 'Report incident' },
  },
  {
    path: '/me/badges', // F5 – Hanafi
    name: 'my-badges',
    component: () => import('@/views/volunteer/MyBadgesView.vue'),
    meta: { roles: VOLUNTEER, title: 'My badges' },
  },
  {
    path: '/me/badge-studio', // F5 – Hanafi
    name: 'badge-studio',
    component: () => import('@/views/volunteer/BadgeStudioView.vue'),
    meta: { roles: VOLUNTEER, title: 'Badge Studio' },
  },

  // ---- Coordinator pages
  {
    path: '/admin/allocation', // F1b – Fanny
    name: 'allocation-board',
    component: () => import('@/views/admin/AllocationBoardView.vue'),
    meta: { roles: COORDINATOR, title: 'Allocation' },
  },
  {
    path: '/admin/replacements', // F2 – Yap
    name: 'replacements',
    component: () => import('@/views/admin/ReplacementView.vue'),
    meta: { roles: COORDINATOR, title: 'Replacements' },
  },
  {
    path: '/admin/badges', // F5 – Hanafi
    name: 'badge-awards',
    component: () => import('@/views/admin/BadgeAwardsView.vue'),
    meta: { roles: COORDINATOR, title: 'Badges & orders' },
  },

  // ---- HQ pages (coordinators can see them too)
  {
    path: '/hq/live', // F3 – Chin
    name: 'hq-live',
    component: () => import('@/views/admin/HqLiveBoardView.vue'),
    meta: { roles: HQ, title: 'Live board' },
  },
  {
    path: '/hq/incidents', // F4 – Wei Ming
    name: 'hq-incidents',
    component: () => import('@/views/admin/IncidentQueueView.vue'),
    meta: { roles: HQ, title: 'Incidents & alerts' },
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true, title: 'Not found' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()

  if (to.meta.guestOnly && auth.isLoggedIn) return { name: 'home' }
  if (to.meta.public) return true
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return { name: 'home' }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Heartware'} · Heartware Volunteer Ops`
})

export default router
