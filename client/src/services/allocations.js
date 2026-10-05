// API calls for Fanny (F1b). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function runAllocation(eventId) {
  const { data } = await api.post('/allocations/run', { eventId })
  return data
}

export async function getAllocation(eventId) {
  const { data } = await api.get('/allocations', { params: { eventId } })
  return data
}

export async function reassignSlot(slotId, volunteerId) {
  const { data } = await api.patch(`/allocations/slots/${slotId}`, { volunteerId })
  return data
}

export async function publishAllocation(eventId) {
  const { data } = await api.post('/allocations/publish', { eventId })
  return data
}

export async function getMyAssignment() {
  const { data } = await api.get('/allocations/me')
  return data
}

export async function respondToSlot(slotId, response) {
  const { data } = await api.post(`/allocations/slots/${slotId}/respond`, { response })
  return data
}
