// Socket.IO client (BONUS – Feature 4, Wei Ming).
// Usage in a page:
//   import { connectSocket } from '@/services/socket'
//   const socket = connectSocket()
//   socket.on('incident:new', (incident) => { ... })
//   onUnmounted(() => socket.off('incident:new'))
import { io } from 'socket.io-client'
// FIX: removed `import { getToken } from './api'`. That file no longer exists, so importing this module crashed the
// build. The app uses cookie sessions (no token), so the browser's login cookie is sent instead (withCredentials).

let socket = null

export function connectSocket() {
  if (socket) return socket
  const url = import.meta.env.VITE_SOCKET_URL || undefined // undefined = same origin (Vite proxy)
  socket = io(url, { withCredentials: true })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
