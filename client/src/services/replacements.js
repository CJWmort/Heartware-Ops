// API calls for Yap (F2). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function dropOut(slotId, reason, note) {
  const { data } = await api.post('/replacements/drop-out', { slotId, reason, note })
  return data
}

export async function markNoShow(slotId) {
  const { data } = await api.post('/replacements/no-show', { slotId })
  return data
}

export async function listOpenSlots() {
  const { data } = await api.get('/replacements/open')
  return data
}

export async function claimSlot(replacementId) {
  const { data } = await api.post(`/replacements/${replacementId}/claim`, {})
  return data
}

export async function listCandidates(replacementId, radiusKm) {
  const { data } = await api.get(`/replacements/${replacementId}/candidates`, { params: { radiusKm } })
  return data
}

export async function approveClaim(replacementId, volunteerId) {
  const { data } = await api.post(`/replacements/${replacementId}/approve`, { volunteerId })
  return data
}

export async function requestSwap(mySlotId, otherSlotId) {
  const { data } = await api.post('/replacements/swaps', { mySlotId, otherSlotId })
  return data
}

export async function decideSwap(swapId, decision) {
  const { data } = await api.patch(`/replacements/swaps/${swapId}`, { decision })
  return data
}

export async function getHistory(eventId) {
  const { data } = await api.get('/replacements/history', { params: { eventId } })
  return data
}
