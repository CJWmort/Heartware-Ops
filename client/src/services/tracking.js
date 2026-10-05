// API calls for Chin (F3). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function listCheckpoints() {
  const { data } = await api.get('/tracking/checkpoints')
  return data
}

export async function checkIn(slotId, checkpoint, lat, lng) {
  const { data } = await api.post('/tracking/check-ins', { slotId, checkpoint, lat, lng })
  return data
}

export async function sendPing(slotId, lat, lng, accuracy) {
  const { data } = await api.post('/tracking/pings', { slotId, lat, lng, accuracy })
  return data
}

export async function getLiveBoard(eventId) {
  const { data } = await api.get('/tracking/live', { params: { eventId } })
  return data
}

export async function getGroupTimeline(slotId) {
  const { data } = await api.get(`/tracking/groups/${slotId}/timeline`)
  return data
}
