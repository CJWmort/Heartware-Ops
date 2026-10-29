import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js' // only used by the phone navbar menu (collapse); popups and dropdowns are Vue-only
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia' // Function used to create a state management container

import App from './App.vue'
import router from './router'
import axios from 'axios'
import { useAuthStore } from '@/services/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// handle an expired login. A session lasts 8 hours; before this, a volunteer whose session ran out kept
// seeing a page full of "Please log in" errors because the app still believed they were logged in
// (auth.restore() only asks the server once per page load).
// Now ANY 401 answer from the API clears the saved user and sends them to the login page, then back to where they were.
axios.interceptors.response.use(
  (response) => response, // good answers pass straight through
  (error) => {
    const url = error.config?.url || ''
    // These two legitimately answer 401 ("wrong password", "nobody logged in yet"), so they must NOT trigger a redirect
    // (only the GET of /me is the "who am I?" check; PUT/DELETE /me are real actions, so a 401 there means the session expired)
    const expected =
      url.includes('/api/users/login') || (error.config?.method === 'get' && url.endsWith('/api/users/me'))
    if (error.response?.status === 401 && !expected) {
      const auth = useAuthStore()
      if (auth.user) {
        auth.user = null // forget the stale user so the router guard treats them as a guest
        const here = router.currentRoute.value.fullPath
        router.push({ name: 'login', query: { redirect: here } })
      }
    }
    return Promise.reject(error) // still let the calling page show its own message if it wants to
  },
)

window.addEventListener('vite:preloadError', () => window.location.reload())

app.mount('#app')
