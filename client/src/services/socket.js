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
  // NEW: on the deployed site the connection goes through the Vercel rewrite, which does not forward WebSockets,
  // so use plain HTTP long-polling there. Locally (Vite proxy) the default is kept, so WebSocket still works.
  const transports =
    import.meta.env.PROD && !import.meta.env.VITE_SOCKET_URL ? ['polling'] : undefined
  // NEW: addTrailingSlash:false makes the client call "/socket.io?..." instead of "/socket.io/?...".
  // Vercel's "/socket.io/:path*" rewrite does not match the trailing-slash form, so it served index.html and live updates failed.
  socket = io(url, { withCredentials: true, addTrailingSlash: false, ...(transports && { transports }) })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
