// Socket.IO client (BONUS – Feature 4, Wei Ming).
// Usage in a page:
//   import { connectSocket } from '@/services/socket'
//   const socket = connectSocket()
//   socket.on('incident:new', (incident) => { ... })
//   onUnmounted(() => socket.off('incident:new'))
import { io } from 'socket.io-client'
import axios from 'axios'

let socket = null

export function connectSocket() {
  if (socket) return socket
  const url = import.meta.env.VITE_SOCKET_URL || undefined
  const direct = Boolean(url)
  const options = { withCredentials: true }
  if (direct) {
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

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}