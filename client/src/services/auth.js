// Sends the request, saves the returned user in the shared store
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

// Function used to create a global state management store in 'Pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) // Holds the logged-in user's data ({ _id, name, email, role }), or null for a guest.
  const ready = ref(false) // Records whether we've asked the server yet. It starts false and flips to true after the first check.

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
    return user.value
  }

  // Handles page refreshes on every navigation, but only the first call is handled.
  async function restore() {
    if (ready.value) return // Makes it ask the server only once per page load.
    try {
      const res = await axios.get('/api/users/me')
      user.value = res.data
    } catch {
      user.value = null
    } finally {
      ready.value = true
    }
  }

  // Tells the server to destroy the session, then clears user
  async function logout() {
    user.value = null  
    try {
      await axios.post('/api/users/logout')
    } catch (err) {
      console.error('Logout request failed', err)
    }
  }

  // Allow other components to call the functions in here (auth.js)
  return { user, ready, isLoggedIn, role, login, restore, logout }
})