// axios calls for Kuah (F1a). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
// BASE_URL is just '/api' here because this file calls three resources: /volunteers, /schools and /events.
import axios from 'axios'

const BASE_URL = '/api'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function getMyProfile() {
  try {
    const { data } = await axios.get(`${BASE_URL}/volunteers/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function updateMyProfile(changes) {
  try {
    const { data } = await axios.patch(`${BASE_URL}/volunteers/me`, changes, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listVolunteers(params = {}) {
  try {
    const { data } = await axios.get(`${BASE_URL}/volunteers`, { params, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listSchools(params = {}) {
  try {
    const { data } = await axios.get(`${BASE_URL}/schools`, { params, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listEvents() {
  try {
    const { data } = await axios.get(`${BASE_URL}/events`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
