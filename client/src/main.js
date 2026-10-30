// The starting point of the website: loads Bootstrap and our CSS, creates the Vue app with Pinia and
// the router, sets the axios settings and mounts the app.

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import axios from 'axios'
import { useAuthStore } from '@/services/auth'

// app - creates the Vue app from the root App component.
const app = createApp(App)

app.use(createPinia())
app.use(router)

// handle an expired login. A session lasts 8 hours; before this, a volunteer whose session ran out
// kept seeing a page full of "Please log in" errors because the app still believed they were logged in
// (auth.restore() only asks the server once per page load). Global axios response interceptor. It
// receives two functions: 1. (response) => response : successful answers pass straight through. 2.
// (error) => ... : runs for every failed request. It ignores the two requests that legitimately answer
// 401 (login, and the "who am I?" GET /me). For any other 401 (session expired) it clears the saved
// user and sends the person to the login page with ?redirect=<where they were>. The error is always
// re-thrown so the page can still show its own message. Now ANY 401 answer from the API clears the
// saved user and sends them to the login page, then back to where they were.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const expected =
      url.includes('/api/users/login') || (error.config?.method === 'get' && url.endsWith('/api/users/me'))
    if (error.response?.status === 401 && !expected) {
      const auth = useAuthStore()
      if (auth.user) {
        auth.user = null
        const here = router.currentRoute.value.fullPath
        router.push({ name: 'login', query: { redirect: here } })
      }
    }
    return Promise.reject(error)
  },
)

window.addEventListener('vite:preloadError', () => window.location.reload())

app.mount('#app')
