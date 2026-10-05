// API calls for Hanafi (F5). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function listBadges() {
  const { data } = await api.get('/badges')
  return data
}

export async function autoAward(eventId) {
  const { data } = await api.post('/badges/auto-award', { eventId })
  return data
}

export async function awardBadge(volunteerIds, badgeId, message) {
  const { data } = await api.post('/badges/award', { volunteerIds, badgeId, message })
  return data
}

export async function getMyBadges() {
  const { data } = await api.get('/badges/me')
  return data
}

export async function getMyDesign() {
  const { data } = await api.get('/badges/design/me')
  return data
}

export async function saveMyDesign(design) {
  const { data } = await api.put('/badges/design/me', design)
  return data
}

export async function placeOrder(address) {
  const { data } = await api.post('/badges/orders', { address })
  return data
}

export async function getMyOrders() {
  const { data } = await api.get('/badges/orders/me')
  return data
}

export async function updateOrderStatus(orderId, status) {
  const { data } = await api.patch(`/badges/orders/${orderId}/status`, { status })
  return data
}
