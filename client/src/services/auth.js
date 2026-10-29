// Sends the request, saves the returned user in the shared store
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useZoneEventsStore } from '@/services/zone-events'
import { clearSavedShow } from '@/services/selected-show'
import axios from 'axios'

// Function used to create a global state management store in 'Pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) // Holds the logged-in user's data ({ _id, name, email, role }), or null for a guest.
  const ready = ref(false) // Records whether we've asked the server yet. It starts false and flips to true after the first check.

  const loggingOut = ref(false)

  const isLoggedIn = computed(() => !!user.value) // True when user has a value. !! turns the object into true and null into false.
  const role = computed(() => user.value?.role ?? null) // User's role, or null for a guest. The ?. stops it crashing when user is null.

  // 1. Sends the email and password to the server.
  // 2. Server checks for valid user email and password with bcrypt and creates a session.
  // 3. Browser stores the session cookie.
  // 4. Server replies with the user's safe details, which the 'store' saves in user.
  async function login(email, password) {
    const res = await axios.post('/api/users/login', { email, password })
    user.value = res.data
    ready.value = true
    clearSavedShow() // a fresh login never inherits someone else's show choice
    useZoneEventsStore().setOwner(user.value._id) // the history belongs to whoever just logged in
    return user.value
  }

  // Handles page refreshes on every navigation, but only the first call is handled.
  async function restore() {
    if (ready.value) return // Makes it ask the server only once per page load.
    const zoneEvents = useZoneEventsStore()
    try {
      const res = await axios.get('/api/users/me')
      user.value = res.data
      zoneEvents.setOwner(user.value._id)
    } catch (err) {
      user.value = null
      // The session has ended: forget the history. Other failures (such as the
      // server being down) keep it, so a network blip can't wipe it.
      if (err.response?.status === 401) zoneEvents.clear()
    } finally {
      ready.value = true
    }
  }

  // Tells the server to destroy the session, then clears user and the alert history
  async function logout() {
    loggingOut.value = true
    user.value = null
    useZoneEventsStore().clear()
    clearSavedShow() // the next person to log in starts fresh
    axios.post('/api/users/logout').catch((err) => {
      console.error('Logout request failed', err)
    })
  }

  // Allow other components to call the functions in here (auth.js)
  return { user, ready, loggingOut, isLoggedIn, role, login, restore, logout }
})