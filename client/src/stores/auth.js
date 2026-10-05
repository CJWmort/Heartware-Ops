// Who is logged in. Owner: Kuah (app shell)
// Use in any component:
//   import { useAuthStore } from '@/stores/auth'
//   const auth = useAuthStore()
//   auth.user?.name, auth.isLoggedIn, auth.role
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getToken, setToken } from '@/services/api'
import * as authApi from '@/services/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(getToken())
  const ready = ref(false) // true once we've tried to restore the session on page load

  const isLoggedIn = computed(() => !!user.value)
  const role = computed(() => user.value?.role ?? null)

  function setSession(newToken, newUser) {
    token.value = newToken
    user.value = newUser
    setToken(newToken)
  }

  async function login(email, password) {
    const data = await authApi.login(email, password) // { token, user }
    setSession(data.token, data.user)
    return data.user
  }

  async function register(payload) {
    const data = await authApi.register(payload) // { token, user }
    setSession(data.token, data.user)
    return data.user
  }

  // Called once by the router before the first page loads (restores login after refresh)
  async function restore() {
    if (ready.value) return
    try {
      if (token.value) {
        const data = await authApi.fetchMe()
        user.value = data.user ?? data
      }
    } catch {
      setSession(null, null)
    } finally {
      ready.value = true
    }
  }

  function logout() {
    setSession(null, null)
  }

  // DEVELOPMENT ONLY: pretend to be a role so you can build your pages before login works.
  // The router + LoginView only expose this when import.meta.env.DEV is true.
  function devLoginAs(devRole) {
    user.value = { _id: `dev-${devRole}`, name: `Dev ${devRole}`, email: `${devRole}@dev`, role: devRole }
    ready.value = true
  }

  return { user, token, ready, isLoggedIn, role, login, register, restore, logout, devLoginAs }
})
