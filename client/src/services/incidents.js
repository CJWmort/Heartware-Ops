// API calls for Wei Ming (F4). Each returns the response data (or throws – show error.friendlyMessage).
// Contract: docs/API.md
import api from './api'

export async function listTemplates() {
  const { data } = await api.get('/incidents/templates')
  return data
}

export async function reportIncident(payload) {
  const { data } = await api.post('/incidents', payload)
  return data
}

export async function listIncidents(status) {
  const { data } = await api.get('/incidents', { params: { status } })
  return data
}

export async function updateIncidentStatus(incidentId, status, note) {
  const { data } = await api.patch(`/incidents/${incidentId}/status`, { status, note })
  return data
}

export async function listAlerts(status) {
  const { data } = await api.get('/incidents/alerts', { params: { status } })
  return data
}

export async function acknowledgeAlert(alertId) {
  const { data } = await api.patch(`/incidents/alerts/${alertId}/acknowledge`, {})
  return data
}
