// axios calls for Fanny (F1b). Each returns the response data (or throws – show error.friendlyMessage).
import axios from 'axios'

const BASE_URL = '/api/allocations'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function runAllocation(eventId) {
  try {
    const { data } = await axios.post(`${BASE_URL}/run`, { eventId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getAllocation(eventId) {
  try {
    const { data } = await axios.get(BASE_URL, { params: { eventId }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function reassignSlot(slotId, volunteerId) {
  try {
    const { data } = await axios.patch(
      `${BASE_URL}/slots/${slotId}`,
      { volunteerId },
      { timeout: 15000 },
    )
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function publishAllocation(eventId) {
  try {
    const { data } = await axios.post(`${BASE_URL}/publish`, { eventId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getMyAssignment() {
  try {
    const { data } = await axios.get(`${BASE_URL}/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function respondToSlot(slotId, response) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/slots/${slotId}/respond`,
      { response },
      { timeout: 15000 },
    )
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
