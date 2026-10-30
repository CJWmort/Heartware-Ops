// Creates and closes the single Socket.IO connection that gives live updates.

import { io } from 'socket.io-client'
import axios from 'axios'

let socket = null

// connectSocket() - gives the app ONE shared live connection. 1) already connected -> return it 2)
// read VITE_SOCKET_URL: set = connect straight to the backend and fetch a short-lived token
// (/api/socket-token) as the login proof 3) not set in production = use plain HTTP polling through the
// Vercel rewrite 4) addTrailingSlash:false so the Vercel rewrite matches 5) create and return the
// socket.
export function connectSocket() {
  if (socket) return socket
  const url = import.meta.env.VITE_SOCKET_URL || undefined
  const direct = Boolean(url)
  const options = { withCredentials: true, addTrailingSlash: false }
  if (direct) {
    // options.auth - before connecting, fetch a short-lived token from the server and send it; if that
    // fails connect without it.
    options.auth = async (cb) => {
      try {
        const { data } = await axios.get('/api/socket-token')
        cb({ token: data.token })
      } catch {
        cb({})
      }
    }
  } else if (import.meta.env.PROD) {
    options.transports = ['polling']
  }
  socket = io(url, options)
  return socket
}

// disconnectSocket() - closes the shared connection and forgets it so the next connectSocket() creates
// a fresh one.
export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}