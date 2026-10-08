// axios calls for Kuah (F1a). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import axios from 'axios'

const BASE_URL = '/api/auth'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function register(payload) {
  try {
    const { data } = await axios.post(`${BASE_URL}/register`, payload, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function login(email, password) {
  try {
    const { data } = await axios.post(`${BASE_URL}/login`, { email, password }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function fetchMe() {
  try {
    const { data } = await axios.get(`${BASE_URL}/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
