// axios calls for Chin (F3). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import axios from 'axios'

const BASE_URL = '/api/tracking'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function listCheckpoints() {
  try {
    const { data } = await axios.get(`${BASE_URL}/checkpoints`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function checkIn(slotId, checkpoint, lat, lng) {
  try {
    const { data } = await axios.post(`${BASE_URL}/check-ins`, { slotId, checkpoint, lat, lng }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function sendPing(slotId, lat, lng, accuracy) {
  try {
    const { data } = await axios.post(`${BASE_URL}/pings`, { slotId, lat, lng, accuracy }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getLiveBoard(eventId) {
  try {
    const { data } = await axios.get(`${BASE_URL}/live`, { params: { eventId }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getGroupTimeline(slotId) {
  try {
    const { data } = await axios.get(`${BASE_URL}/groups/${slotId}/timeline`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
