// Who is online right now. Lives in server memory only (it resets when the server restarts,
// and browsers announce themselves again when they reconnect).
// We COUNT connections per person so closing one browser tab doesn't mark them offline.
// Only volunteers are tracked, because only HQ sees online/offline.
const counts = new Map(); // volunteerId (string) -> number of open sockets

// Returns true when this is their FIRST connection (they just came online)
function connected(userId) {
  const id = String(userId);
  const n = (counts.get(id) || 0) + 1;
  counts.set(id, n);
  return n === 1;
}

// Returns true when this was their LAST connection (they just went offline)
function disconnected(userId) {
  const id = String(userId);
  const n = (counts.get(id) || 0) - 1;
  if (n <= 0) {
    counts.delete(id);
    return true;
  }
  counts.set(id, n);
  return false;
}

const isOnline = (userId) => counts.has(String(userId));
const onlineIds = () => [...counts.keys()];

module.exports = { connected, disconnected, isOnline, onlineIds };
