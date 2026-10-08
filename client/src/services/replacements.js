// axios calls for Yap (F2). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import axios from 'axios'

const BASE_URL = '/api/replacements'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function dropOut(slotId, reason, note) {
  try {
    const { data } = await axios.post(`${BASE_URL}/drop-out`, { slotId, reason, note }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function markNoShow(slotId) {
  try {
    const { data } = await axios.post(`${BASE_URL}/no-show`, { slotId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listOpenSlots() {
  try {
    const { data } = await axios.get(`${BASE_URL}/open`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function claimSlot(replacementId) {
  try {
    const { data } = await axios.post(`${BASE_URL}/${replacementId}/claim`, {}, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listCandidates(replacementId, radiusKm) {
  try {
    const { data } = await axios.get(`${BASE_URL}/${replacementId}/candidates`, {
      params: { radiusKm },
      timeout: 15000,
    })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function approveClaim(replacementId, volunteerId) {
  try {
    const { data } = await axios.post(`${BASE_URL}/${replacementId}/approve`, { volunteerId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function requestSwap(mySlotId, otherSlotId) {
  try {
    const { data } = await axios.post(`${BASE_URL}/swaps`, { mySlotId, otherSlotId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function decideSwap(swapId, decision) {
  try {
    const { data } = await axios.patch(`${BASE_URL}/swaps/${swapId}`, { decision }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getHistory(eventId) {
  try {
    const { data } = await axios.get(`${BASE_URL}/history`, { params: { eventId }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
