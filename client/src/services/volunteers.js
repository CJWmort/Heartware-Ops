// API calls for Kuah (F1a). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function getMyProfile() {
  const { data } = await api.get('/volunteers/me')
  return data
}

export async function updateMyProfile(changes) {
  const { data } = await api.patch('/volunteers/me', changes)
  return data
}

export async function listVolunteers(params = {}) {
  const { data } = await api.get('/volunteers', { params })
  return data
}

export async function listSchools(params = {}) {
  const { data } = await api.get('/schools', { params })
  return data
}

export async function listEvents() {
  const { data } = await api.get('/events')
  return data
}
