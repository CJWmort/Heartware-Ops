// API calls for Kuah (F1a). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function register(payload) {
  const { data } = await api.post('/auth/register', payload)
  return data
}

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me')
  return data
}
