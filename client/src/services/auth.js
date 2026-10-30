// The login state store (Pinia): login, restore the session on page load and logout.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useZoneEventsStore } from '@/services/zone-events'
import { clearSavedShow } from '@/services/selected-show'
import axios from 'axios'

// useAuthStore - the shared login state (a Pinia store). user is the logged-in account or null, ready
// says the first session check has finished, loggingOut is true during logout. It also has login,
// register, check-session and logout functions.
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const ready = ref(false)

  const loggingOut = ref(false)

  // isLoggedIn (computed) - true when a user is logged in.
  const isLoggedIn = computed(() => !!user.value)
  // role (computed) - "volunteer", "admin" or null.
  const role = computed(() => user.value?.role ?? null)

  // login(email, password) - 1) POST the credentials 2) the server checks them and sets the session
  // cookie 3) save the returned user 4) forget any show chosen by a previous person 5) tell the
  // zone-event history who owns it 6) return the user.
  async function login(email, password) {
    const res = await axios.post('/api/users/login', { email, password })
    user.value = res.data
    ready.value = true
    clearSavedShow()
    useZoneEventsStore().setOwner(user.value._id)
    return user.value
  }

  // restore() - runs on page load: 1) only the first call does anything 2) GET /api/users/me 3)
  // success -> save the user 4) a 401 -> no session: clear the alert history 5) any other failure
  // (server down) keeps the history 6) mark ready.
  async function restore() {
    if (ready.value) return
    const zoneEvents = useZoneEventsStore()
    try {
      const res = await axios.get('/api/users/me')
      user.value = res.data
      zoneEvents.setOwner(user.value._id)
    } catch (err) {
      user.value = null
      if (err.response?.status === 401) zoneEvents.clear()
    } finally {
      ready.value = true
    }
  }

  // logout() - 1) mark logging out and forget the user at once, 2) clear the alert history and the
  // saved show, 3) tell the server to destroy the session (a failure is only logged).
  async function logout() {
    loggingOut.value = true
    user.value = null
    useZoneEventsStore().clear()
    clearSavedShow()
    axios.post('/api/users/logout').catch((err) => {
      console.error('Logout request failed', err)
    })
  }

  return { user, ready, loggingOut, isLoggedIn, role, login, restore, logout }
})