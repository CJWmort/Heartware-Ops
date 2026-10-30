// The API calls for chat messages, the admin inbox, the unread count and the read state.

import axios from 'axios'
const BASE_URL = '/api/messages'

// addFriendlyMessage(error) - puts a readable text on error.friendlyMessage.
function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

// listMessages(volunteerId) - GET a chat's messages (volunteers omit the id).
export async function listMessages(volunteerId) {
  try {
    const { data } = await axios.get(BASE_URL, { params: { volunteerId }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// sendMessage(text, volunteerId) - POST a new chat message and return it.
export async function sendMessage(text, volunteerId) {
  try {
    const { data } = await axios.post(BASE_URL, { text, volunteerId }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// listThreads() - HQ only: GET every volunteer with latest message and unread count.
export async function listThreads() {
  try {
    const { data } = await axios.get(`${BASE_URL}/threads`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getUnreadCount() - GET the unread number for the navbar badge.
export async function getUnreadCount() {
  try {
    const { data } = await axios.get(`${BASE_URL}/unread`, { timeout: 15000 })
    return data.unread
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getReadState(volunteerId) - GET when each side last read the chat (for "Seen").
export async function getReadState(volunteerId) {
  try {
    const { data } = await axios.get(`${BASE_URL}/read-state`, { params: { volunteerId }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
