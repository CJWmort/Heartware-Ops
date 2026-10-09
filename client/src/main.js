import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js' // navbar collapse, dropdowns, modals
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia' // Function used to create a state management container

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
