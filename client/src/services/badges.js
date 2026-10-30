// The API calls for badges, designs, orders, awards and the volunteer list.

import axios from 'axios'

const BASE_URL = '/api/badges'

// addFriendlyMessage(error) - puts a readable text on error.friendlyMessage.
function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

// listBadges() - GET the badge catalogue.
export async function listBadges() {
  try {
    const { data } = await axios.get(BASE_URL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// autoAward(event) - POST: admin hands out the automatic badges for one show; returns counts given and
// skipped.
export async function autoAward(event) {
  try {
    const { data } = await axios.post(`${BASE_URL}/auto-award`, { event }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// awardBadge(volunteerIds, badgeCode, event, message) - POST: admin gives one badge to one or many
// volunteers; returns { given, skipped }.
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

// getMyBadges() - GET the logged-in volunteer's awards.
export async function getMyBadges() {
  try {
    const { data } = await axios.get(`${BASE_URL}/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getMyDesign() - GET the volunteer's saved badge design (or null).
export async function getMyDesign() {
  try {
    const { data } = await axios.get(`${BASE_URL}/design/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// saveMyDesign(design) - PUT the badge design (shape, colours, emblem, ribbon text).
export async function saveMyDesign(design) {
  try {
    const { data } = await axios.put(`${BASE_URL}/design/me`, design, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// placeOrder(address) - POST the delivery address; the server orders the saved design and locks it.
export async function placeOrder(address) {
  try {
    const { data } = await axios.post(`${BASE_URL}/orders`, { address }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getMyOrders() - GET the volunteer's own orders.
export async function getMyOrders() {
  try {
    const { data } = await axios.get(`${BASE_URL}/orders/me`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// listAllOrders() - GET every order (admin).
export async function listAllOrders() {
  try {
    const { data } = await axios.get(`${BASE_URL}/orders`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// updateOrderStatus(orderId, status) - PATCH an order to its next status (admin).
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

// listVolunteers() - GET volunteer names and emails for the award form's search box (admin).
export async function listVolunteers() {
  try {
    const { data } = await axios.get(`${BASE_URL}/volunteers`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}