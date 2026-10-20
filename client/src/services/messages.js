// axios calls for the HQ <-> volunteer chat. Each returns the response data (or throws – show error.friendlyMessage).
import axios from 'axios'
const BASE_URL = '/api/messages'

// Turns an axios error into text we can show the user
function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

// volunteerId is only needed when HQ is reading a chat; volunteers leave it out
export async function listMessages(volunteerId) {
  try {
    const { data } = await axios.get(BASE_URL, { params: { volunteerId }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function sendMessage(text, volunteerId) {
  try {
    const { data } = await axios.post(BASE_URL, { text, volunteerId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// HQ only: every volunteer with their latest message
export async function listThreads() {
  try {
    const { data } = await axios.get(`${BASE_URL}/threads`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
