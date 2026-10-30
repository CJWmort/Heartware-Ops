// Keeps track of which volunteers are online (counting every open tab).

const counts = new Map();

// connected(userId) - adds 1 to this person's open-connection count; returns true if it is their FIRST
// connection (they just came online).
function connected(userId) {
  const id = String(userId);
  const n = (counts.get(id) || 0) + 1;
  counts.set(id, n);
  return n === 1;
}

// disconnected(userId) - subtracts 1; when it reaches 0 the person is removed and true is returned
// (they just went offline).
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

// isOnline(userId) - true if the person has at least one open connection.
const isOnline = (userId) => counts.has(String(userId));
// onlineIds() - the list of everyone currently online.
const onlineIds = () => [...counts.keys()];

module.exports = { connected, disconnected, isOnline, onlineIds };
