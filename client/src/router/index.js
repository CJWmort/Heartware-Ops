import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'

const VOLUNTEER = ['volunteer']
const ADMIN = ['admin']

const routes = [
  // ---- Anyone
  { path: '/', name: 'home', component: HomeView, meta: { public: true, title: 'Home' } },

  // ---- Guests only
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
        path: 'open-slots', // F2 – Yap
        name: 'volunteer-open-slots',
        component: () => import('@/views/volunteer/OpenSlotsView.vue'),
        meta: { title: 'Open slots' },
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
        path: 'replacements', // F2 – Yap
        name: 'admin-replacements',
        component: () => import('@/views/admin/ReplacementView.vue'),
        meta: { title: 'Replacements' },
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
  await auth.restore() // asks the server once, then reuses the answer

  const { guestOnly, public: isPublic, roles } = to.meta

  if (guestOnly) return auth.isLoggedIn ? { name: 'home' } : true
  if (isPublic) return true
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (roles && !roles.includes(auth.role)) return { name: 'home' }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Heartware'} · Heartware Volunteer Ops`
})

export default router