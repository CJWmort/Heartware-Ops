// Socket.IO live updates – BONUS feature. Owner: Wei Ming (F4)
// Docs: https://socket.io/docs/v4/
//
// Server → client events we agreed on (see docs/API.md):
//   incident:new, incident:updated, alert:new, tracking:update
//
// From any controller you can broadcast with:
//   const { emit } = require('../sockets')
//   emit('incident:new', incident)

const { Server } = require('socket.io')

let io = null

function initSockets(httpServer) {
  const origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173').split(',')
  io = new Server(httpServer, { cors: { origin: origins } })

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id)

    // TODO(Wei Ming): check the JWT sent in socket.handshake.auth.token and
    // join HQ/coordinator users to an "hq" room, e.g. socket.join('hq').

    socket.on('disconnect', () => console.log('socket disconnected', socket.id))
  })

  // TODO(Wei Ming): optional – run the overdue-checkpoint check every minute here
  // with setInterval(...) and emit('alert:new', alert) for each new alert.

  return io
}

// Safe to call even if sockets are not running (e.g. in tests).
function emit(eventName, payload, room) {
  if (!io) return
  if (room) io.to(room).emit(eventName, payload)
  else io.emit(eventName, payload)
}

module.exports = { initSockets, emit }
