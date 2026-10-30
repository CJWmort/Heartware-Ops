<!-- The top navigation bar for guests, volunteers and admins: logo, links, Chat button, and the
     phone menu with the red initials circle. -->

<script setup>
// Works out the initials and the links for the user's role, controls the phone menu (open, close,
// outside tap) and logs out.

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/services/auth'
import { NAV_LINKS } from '@/router/nav-links'
import { landingFor } from '@/router/landing'
import logoUrl from '@/assets/heartware-logo.png'
import ChatButton from '@/components/chat/ChatButton.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// initials (computed) - 1) take the logged-in user's name (or empty text) 2) trim it and split on
// spaces 3) drop empty pieces 4) keep the first two words 5) take the first letter of each in capitals
// 6) join them: "Emma Smith Danna" gives "ES". Shown in the red circle.
const initials = computed(() =>
  (auth.user?.name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join(''),
)

// links (computed) - the menu links for the current role from router/nav-links.js (a guest or unknown
// role gets none).
const links = computed(() => NAV_LINKS[auth.role] ?? [])

const menu = ref(null)
const toggler = ref(null)
const bar = ref(null)
const menuOpen = ref(false)

// onMenuShow / onMenuHide - set menuOpen when Bootstrap's collapse starts opening or closing.
const onMenuShow = () => (menuOpen.value = true)
// onMenuHide - the phone menu closed: set menuOpen to false.
const onMenuHide = () => (menuOpen.value = false)

// closeMenu() - closes the phone menu by clicking the toggler, but only if the menu currently has
// Bootstrap's "show" class (i.e. it is open).
function closeMenu() {
  if (menu.value?.classList.contains('show')) toggler.value?.click()
}

// onMenuClick(e) - clicking any link or button inside the menu closes the menu.
function onMenuClick(e) {
  if (e.target.closest('a, button')) closeMenu()
}

// onDocumentPointerDown(e) - runs on every press anywhere on the page. 1) do nothing if the menu is
// closed 2) read the path of elements under the finger 3) ignore presses on the toggler, on any link,
// or inside the menu 4) otherwise close the menu 5) if the press was outside the navbar bar too,
// swallow the click that follows so it does not trigger a button underneath.
function onDocumentPointerDown(e) {
  if (!menu.value?.classList.contains('show')) return
  const path = e.composedPath()
  if (toggler.value && path.includes(toggler.value)) return
  if (path.some((el) => el.tagName === 'A')) return
  if (menu.value && path.includes(menu.value)) return
  closeMenu()
  if (!(bar.value && path.includes(bar.value))) swallowNextClick()
}

// swallowNextClick() - blocks the very next click once. 1) block() cancels the click and stops it
// spreading 2) a timer removes the blocker after 800 ms 3) cleanup() removes both listeners and the
// timer 4) the blocker also removes itself when the touch turns into a scroll (pointercancel).
function swallowNextClick() {
  // block(e) - swallows the next click (so the tap that closed the menu does not also press something
  // underneath) and then cleans up.
  const block = (e) => {
    e.preventDefault()
    e.stopPropagation()
    cleanup()
  }
  const timer = setTimeout(() => cleanup(), 800)
  // cleanup() - removes the click and pointercancel listeners and the timer.
  function cleanup() {
    document.removeEventListener('click', block, true)
    document.removeEventListener('pointercancel', cleanup, true)
    clearTimeout(timer)
  }
  document.addEventListener('click', block, true)
  document.addEventListener('pointercancel', cleanup, true)
}
// Add the document pointerdown listener when the navbar appears and remove it when it goes away.
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
// onUnmounted - stop listening for pointer presses on the page.
onUnmounted(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

// watch(menu) - the menu exists only while logged in, so it can appear or vanish after mount. Whenever
// the element changes: remove the show/hide listeners from the old element, add them to the new one,
// and reset menuOpen if it is gone.
watch(menu, (el, oldEl) => {
  oldEl?.removeEventListener('show.bs.collapse', onMenuShow)
  oldEl?.removeEventListener('hide.bs.collapse', onMenuHide)
  el?.addEventListener('show.bs.collapse', onMenuShow)
  el?.addEventListener('hide.bs.collapse', onMenuHide)
  if (!el) menuOpen.value = false
})

// logout() - 1) ask the auth store to log out (clears the user and alert history, closes the chat
// socket, tells the server), 2) go to the login page, 3) always clear the loggingOut flag so the
// router guard returns to normal.
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
  <!-- The navbar markup: logo link, collapsible link list, guest buttons, chat button and the
       user menu. -->
  <nav class="navbar navbar-expand-lg navbar-dark sticky-top app-navbar" data-testid="navbar">
    <div class="nav-backdrop" :class="{ 'is-open': menuOpen }" aria-hidden="true"></div>

    <div ref="bar" class="container flex-nowrap">
      <RouterLink
        class="navbar-brand fw-semibold d-flex align-items-center gap-2"
        :to="landingFor(auth.role)"
        aria-label="Heartware Ops"
        @click="closeMenu"
      >
        <img :src="logoUrl" alt="" class="nav-logo" aria-hidden="true" />
        <span class="d-none d-sm-inline">Heartware Ops</span>
      </RouterLink>

      <ul v-if="auth.isLoggedIn" class="navbar-nav flex-row ms-auto d-lg-none nav-icon-row">
        <li v-for="link in links" :key="link.to" class="nav-item">
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
      <ChatButton
        v-if="auth.isLoggedIn"
        class="d-lg-none me-2 nav-chat-mobile"
        data-testid="nav-chat-mobile"
      />

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
        <ul class="navbar-nav me-auto nav-menu-links">
          <li v-for="link in links" :key="link.to" class="nav-item">
            <RouterLink class="nav-link" :to="link.to" :data-testid="link.testid">
              <i :class="['bi', link.icon, 'me-1']" aria-hidden="true"></i>{{ link.label }}
            </RouterLink>
          </li>
          <li class="nav-item d-none d-lg-flex align-items-center">
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

    <ChatPanel v-if="auth.isLoggedIn" />
  </nav>
</template>

<style scoped>
/* Navbar colours (#070b1a), the icons-only layout on phones (down to 393px), and the initials
   circle. */

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
.nav-plain-btn:hover,
.nav-plain-btn:focus-visible {
  opacity: 0.75;
}
.nav-logout-btn {
  --bs-btn-hover-color: var(--hw-navy);
  --bs-btn-focus-shadow-rgb: 255, 255, 255;
  --bs-btn-active-color: var(--hw-navy);
}
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
.nav-icon-row .nav-link {
  font-size: 1.25rem;
  padding-top: 0.4rem;
  padding-bottom: 0.4rem;
}
.nav-chat-mobile {
  --bs-btn-padding-y: 0.4rem;
}

.nav-chat-desktop {
  --bs-btn-font-size: 1rem;
  --bs-btn-padding-y: 0.5rem;
  --bs-btn-padding-x: var(
    --bs-navbar-nav-link-padding-x
  );
  color: var(
    --bs-navbar-color
  ) !important;
}

@media (max-width: 392px) {
  .nav-icon-row {
    display: none;
  }
  .nav-chat-mobile {
    margin-left: auto;
  }
}

@media (min-width: 393px) and (max-width: 991.98px) {
  .nav-menu-links {
    display: none;
  }
}
.nav-link.router-link-active {
  color: #fff;
  font-weight: 600;
}

@media (max-width: 991.98px) {
  .navbar-collapse {
    position: absolute;
    top: calc(
      100% - 1px
    );
    left: 0;
    right: 0;
    padding: calc(0.75rem + 1px) 1rem 1rem;
    background: var(--hw-navy);
    box-shadow: 0 6px 12px rgb(0 0 0 / 0.25);
  }

  .nav-backdrop {
    position: absolute;
    top: calc(100% + 1px);
    left: 0;
    right: 0;
    height: 0;
    background: rgb(0 0 0 / 0.25);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(2px);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s ease,
      height 0s linear 0.2s;
  }
  .nav-backdrop.is-open {
    height: calc(100vh - 100% - 1px);
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.2s ease;
  }

  .nav-actions {
    border-top: 1px solid rgb(255 255 255 / 0.2);
  }
}

@media (min-width: 992px) {
  .nav-backdrop {
    display: none;
  }
}
</style>
