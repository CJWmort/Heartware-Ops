// axios calls for Hanafi (F5). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import axios from 'axios'

const BASE_URL = '/api/badges'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function listBadges() {
  try {
    const { data } = await axios.get(BASE_URL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function autoAward(event) {
  try {
    const { data } = await axios.post(`${BASE_URL}/auto-award`, { event }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function awardBadge(volunteerIds, badgeCode, event, message) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/award`,
      { volunteerIds, badgeCode, event, message },
      { timeout: 15000 },
    )
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getMyBadges() {
  try {
    const { data } = await axios.get(`${BASE_URL}/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getMyDesign() {
  try {
    const { data } = await axios.get(`${BASE_URL}/design/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function saveMyDesign(design) {
  try {
    const { data } = await axios.put(`${BASE_URL}/design/me`, design, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function placeOrder(address) {
  try {
    const { data } = await axios.post(`${BASE_URL}/orders`, { address }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getMyOrders() {
  try {
    const { data } = await axios.get(`${BASE_URL}/orders/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listAllOrders() {
  try {
    const { data } = await axios.get(`${BASE_URL}/orders`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function updateOrderStatus(orderId, status) {
  try {
    const { data } = await axios.patch(
      `${BASE_URL}/orders/${orderId}/status`,
      { status },
      { timeout: 15000 },
    )
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listVolunteers() {
  try {
    const { data } = await axios.get(`${BASE_URL}/volunteers`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}