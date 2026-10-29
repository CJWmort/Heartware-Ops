<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import { NAV_LINKS } from '@/router/nav-links'
import { landingFor } from '@/router/landing' // NEW: where the "Heartware Ops" logo link goes for each role
import logoUrl from '@/assets/heartware-logo.png'
import ChatButton from '@/components/chat/ChatButton.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute() // used so the guest buttons hide the one for the page you are already on

// Example: "Emma Smith Danna" = "ES": first letters of the first two words (same rule as the pass avatar in RegisterView)
const initials = computed(() =>
  (auth.user?.name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join(''),
)

const links = computed(() => NAV_LINKS[auth.role] ?? [])

const menu = ref(null) // the collapsible menu element
const toggler = ref(null) // the burger button
const bar = ref(null) // the navbar's own row (brand, chat icon, burger, menu)
const menuOpen = ref(false) // true while the phone menu is expanded (drives the blur overlay)

// Bootstrap fires these on the menu element when it starts opening / closing
const onMenuShow = () => (menuOpen.value = true)
const onMenuHide = () => (menuOpen.value = false)

// Close the mobile menu by clicking the burger, but only if the menu is open
function closeMenu() {
  if (menu.value?.classList.contains('show')) toggler.value?.click()
}

// Close the menu when any link or button inside it is clicked
function onMenuClick(e) {
  if (e.target.closest('a, button')) closeMenu()
}

function onDocumentPointerDown(e) {
  if (!menu.value?.classList.contains('show')) return
  const path = e.composedPath()
  if (toggler.value && path.includes(toggler.value)) return
  if (path.some((el) => el.tagName === 'A')) return
  if (menu.value && path.includes(menu.value)) return
  closeMenu()
  if (!(bar.value && path.includes(bar.value))) swallowNextClick()
}

// Blocks the very next click from reaching anything (capture phase, so it runs before any button's own handler).
// It removes itself after one click, if the press turns into a scroll/drag (pointercancel), or after a short timeout.
function swallowNextClick() {
  const block = (e) => {
    e.preventDefault()
    e.stopPropagation()
    cleanup()
  }
  const timer = setTimeout(() => cleanup(), 800)
  function cleanup() {
    document.removeEventListener('click', block, true)
    document.removeEventListener('pointercancel', cleanup, true)
    clearTimeout(timer)
  }
  document.addEventListener('click', block, true)
  document.addEventListener('pointercancel', cleanup, true)
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

// The menu only exists while logged in (guests get plain buttons instead), so it can appear or disappear
// after the navbar is mounted (log in / log out without a page reload). Watch the element and
// attach / detach the open + close listeners as it comes and goes.
watch(menu, (el, oldEl) => {
  oldEl?.removeEventListener('show.bs.collapse', onMenuShow)
  oldEl?.removeEventListener('hide.bs.collapse', onMenuHide)
  el?.addEventListener('show.bs.collapse', onMenuShow)
  el?.addEventListener('hide.bs.collapse', onMenuHide)
  if (!el) menuOpen.value = false // menu gone: make sure the blur goes too
})

async function logout() {
  await auth.logout()
  try {
    await router.push({ name: 'login' })
  } finally {
    auth.loggingOut = false
  }
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark sticky-top app-navbar" data-testid="navbar">
    <!-- Blur layer over the page while the phone menu is open (hidden on desktop in the CSS below).
         Pressing it counts as pressing "anywhere else", so onDocumentPointerDown collapses the menu. -->
    <div class="nav-backdrop" :class="{ 'is-open': menuOpen }" aria-hidden="true"></div>

    <!-- flex-nowrap: Bootstrap lets this row wrap below 992px, which pushed the avatar to a second line. Keep everything on one line. -->
    <div ref="bar" class="container flex-nowrap">
      <!-- CHANGED: the logo link goes to the person's own page (volunteer -> Assignment, admin -> Allocation).
           A guest (not logged in) still goes to the Home page. -->
      <RouterLink
        class="navbar-brand fw-semibold d-flex align-items-center gap-2"
        :to="landingFor(auth.role)"
        aria-label="Heartware Ops"
        @click="closeMenu"
      >
        <img :src="logoUrl" alt="" class="nav-logo" aria-hidden="true" />
        <!-- d-none d-sm-inline: the name is hidden below 576px (phones) to free room for the icons, only the logo shows.
             aria-label above keeps the link readable for screen readers. -->
        <span class="d-none d-sm-inline">Heartware Ops</span>
      </RouterLink>

      <!-- NEW: phone-only icon row. d-lg-none = visible below the "lg" breakpoint, hidden on desktop.
     The same links (from nav-links.js) are used, so nothing is duplicated by hand. -->
      <ul v-if="auth.isLoggedIn" class="navbar-nav flex-row ms-auto d-lg-none nav-icon-row">
        <li v-for="link in links" :key="link.to" class="nav-item">
          <!-- aria-label + title: the label is hidden visually, but screen readers and long-press still show it -->
          <RouterLink
            class="nav-link px-2"
            :to="link.to"
            :aria-label="link.label"
            :title="link.label"
            :data-testid="link.testid + '-mobile'"
          >
            <i :class="['bi', link.icon]" aria-hidden="true"></i>
          </RouterLink>
        </li>
      </ul>
      <!-- phone layout. The menu is collapsed there, so the chat button sits beside the burger and stays visible. -->
      <!-- nav-chat-mobile: lets the CSS push the chat button to the right when the icon row is hidden (392px and under) -->
      <ChatButton
        v-if="auth.isLoggedIn"
        class="d-lg-none me-2 nav-chat-mobile"
        data-testid="nav-chat-mobile"
      />

      <!-- Avatar + collapsible menu: logged-in users only. Guests get plain buttons (further down). -->
      <button
        v-if="auth.isLoggedIn"
        ref="toggler"
        class="navbar-toggler"
        :class="{ 'nav-avatar-toggler': auth.isLoggedIn && initials }"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#mainNav"
        aria-controls="mainNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
        data-testid="nav-toggle"
      >
        <!-- logged in: the user's initials replace the dropdown icon. Guests keep the burger. -->
        <span v-if="auth.isLoggedIn && initials" class="nav-avatar" aria-hidden="true">
          {{ initials }}
        </span>
        <span v-else class="navbar-toggler-icon"></span>
      </button>

      <div
        v-if="auth.isLoggedIn"
        id="mainNav"
        ref="menu"
        class="collapse navbar-collapse"
        @click="onMenuClick"
      >
        <!-- nav-menu-links: hidden by CSS only between 393px and the desktop layout (the icon row shows the links there) -->
        <ul class="navbar-nav me-auto nav-menu-links">
          <li v-for="link in links" :key="link.to" class="nav-item">
            <RouterLink class="nav-link" :to="link.to" :data-testid="link.testid">
              <i :class="['bi', link.icon, 'me-1']" aria-hidden="true"></i>{{ link.label }}
            </RouterLink>
          </li>
          <!-- MOVED: desktop chat button now sits right after the last link (Badges) instead of next to the name.
               d-none d-lg-flex = desktop only; phones keep their own chat button in the bar (nav-chat-mobile). -->
          <li class="nav-item d-none d-lg-flex align-items-center">
            <!-- show-label: prints the word "Chat" next to the icon, like the other links -->
            <ChatButton show-label class="nav-chat-desktop" data-testid="nav-chat" />
          </li>
        </ul>

        <div
          class="nav-actions d-flex align-items-center gap-3 mt-3 pt-3 mt-lg-0 pt-lg-0"
          :class="{ 'justify-content-between justify-content-lg-start': auth.isLoggedIn }"
        >
          <template v-if="auth.isLoggedIn">
            <span
              class="navbar-text small py-0 d-flex align-items-center gap-2"
              data-testid="nav-user-name"
            >
              {{ auth.user.name }} <span class="badge text-bg-light">{{ auth.role }}</span>
            </span>

            <button
              class="btn btn-outline-light btn-sm nav-logout-btn"
              data-testid="nav-logout"
              @click="logout"
            >
              Log Out
            </button>
          </template>
        </div>
      </div>

      <!-- Guests: Log In / Sign-up sit directly on the navbar at every screen size (no burger, no menu).
           On /login only Sign-up shows, on /register only Log In shows (you are already on the other page). -->
      <div v-else-if="auth.ready && route.name && !auth.loggingOut" class="ms-auto d-flex align-items-center gap-2 gap-sm-3">
        <RouterLink
          v-if="route.name !== 'login'"
          class="btn btn-outline-light btn-sm nav-plain-btn"
          to="/login"
          data-testid="nav-login"
        >
          Log In
        </RouterLink>
        <RouterLink
          v-if="route.name !== 'register'"
          class="btn btn-brand btn-sm"
          to="/register"
          data-testid="nav-register"
        >
          Sign-up
        </RouterLink>
      </div>
    </div>

    <!-- the chat panel. Only exists while logged in: logging in opens the live connection, logging out closes it. -->
    <ChatPanel v-if="auth.isLoggedIn" />
  </nav>
</template>

<style scoped>
.app-navbar {
  background: var(--hw-navy);
  z-index: 1200;
  top: -1px;
  padding-top: calc(var(--bs-navbar-padding-y) + 1px);
  box-shadow: 0 1px 0 var(--hw-navy);
}
.nav-logo {
  height: 1.6rem;
  width: auto;
  display: block;
}
/* Plain navbar buttons (Log In / Log Out): no frame, so fade slightly on hover/keyboard focus (matches the chat icon) */
.nav-plain-btn:hover,
.nav-plain-btn:focus-visible {
  opacity: 0.75;
}
/* Log Out: hover/focus fill uses the navbar colour for its text so it stays readable */
.nav-logout-btn {
  --bs-btn-hover-color: var(--hw-navy);
  --bs-btn-focus-shadow-rgb: 255, 255, 255;
  --bs-btn-active-color: var(--hw-navy);
}
/* Initials circle in place of the burger (same look as .pass-avatar in RegisterView: red circle, white bold initials) */
.nav-avatar-toggler {
  padding: 0;
  border: 0;
  border-radius: 50%;
}
.nav-avatar-toggler:focus {
  box-shadow: 0 0 0 0.2rem rgb(255 255 255 / 0.35);
}
.nav-avatar {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background: var(--hw-red);
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
  line-height: 1;
}
/* Phone icon row: same size as the chat icon (fs-5 = 1.25rem in ChatButton.vue) so all navbar icons match */
.nav-icon-row .nav-link {
  font-size: 1.25rem; /* icon size; the icons are <i> font glyphs, so font-size controls them */
  padding-top: 0.4rem; /* keeps the tap area tall enough for a thumb */
  padding-bottom: 0.4rem;
}
/* Phone chat button: same vertical padding as the link icons (.nav-icon-row .nav-link uses 0.4rem) */
.nav-chat-mobile {
  --bs-btn-padding-y: 0.4rem;
}

/* Desktop chat button: copy the look of the other navbar links (size, padding, colour) */
.nav-chat-desktop {
  --bs-btn-font-size: 1rem; /* links use 1rem; btn-sm used 0.875rem */
  --bs-btn-padding-y: 0.5rem; /* same as .nav-link */
  --bs-btn-padding-x: var(
    --bs-navbar-nav-link-padding-x
  ); /* same side padding as .nav-link (0.5rem) */
  color: var(
    --bs-navbar-color
  ) !important; /* same dimmed white as the links; !important needed to beat the .text-white class */
}

/* 392px and under: hide the icon row (the links move into the red-circle menu instead) */
@media (max-width: 392px) {
  .nav-icon-row {
    display: none;
  }
  /* the icon row used to push the chat button to the right (ms-auto), so the chat button does it itself now */
  .nav-chat-mobile {
    margin-left: auto;
  }
}

/* 393px up to the desktop layout (992px): the icon row shows the links, so hide the duplicate list in the menu */
@media (min-width: 393px) and (max-width: 991.98px) {
  .nav-menu-links {
    display: none;
  }
}
.nav-link.router-link-active {
  color: #fff;
  font-weight: 600;
}

/* Below lg the menu is collapsed: overlap navlinks over the page */
@media (max-width: 991.98px) {
  .navbar-collapse {
    position: absolute;
    top: calc(
      100% - 1px
    ); /* directly under the navbar, overlapping its edge by 1px so no hairline shows between them */
    left: 0;
    right: 0;
    padding: calc(0.75rem + 1px) 1rem 1rem;
    background: var(--hw-navy);
    box-shadow: 0 6px 12px rgb(0 0 0 / 0.25);
  }

  /* Blur layer: starts right under the navbar and covers the rest of the screen */
  .nav-backdrop {
    position: absolute;
    top: calc(100% + 1px); /* starts below the navbar's 1px edge shadow */
    left: 0;
    right: 0;
    height: 0; /* zero height while closed: no layer under the navbar and no extra page scroll */
    background: rgb(0 0 0 / 0.25); /* slight dim so the blur reads clearly */
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(2px);
    opacity: 0;
    pointer-events: none; /* lets clicks through while closed */
    transition:
      opacity 0.2s ease,
      height 0s linear 0.2s; /* collapse to 0 only after the fade-out ends */
  }
  .nav-backdrop.is-open {
    height: calc(100vh - 100% - 1px);
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.2s ease;
  }

  /* Phone menu: thin divider line above the user/actions group (light line on the navy background) */
  .nav-actions {
    border-top: 1px solid rgb(255 255 255 / 0.2);
  }
}

/* Desktop: the menu is never collapsed, so there is no blur */
@media (min-width: 992px) {
  .nav-backdrop {
    display: none;
  }
}
</style>