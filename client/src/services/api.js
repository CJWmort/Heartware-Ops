// One shared axios instance for talking to OUR server.
// Every request automatically gets the login token; a 401 logs the user out.
// Owner: Kuah (app shell)
import axios from 'axios'

const TOKEN_KEY = 'hw_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked (private mode) – the user just has to log in again next visit
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null)
      // Hard redirect keeps this file independent of the router/store
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
    }
    // Give every page the same friendly message shape: error.friendlyMessage
    error.friendlyMessage =
      error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
    return Promise.reject(error)
  },
)

export default api
