// The API calls for incident types, address lookup, reporting incidents and the admin queue.

import axios from 'axios'

const BASE_URL = '/api/incidents'

// addFriendlyMessage(error) - puts a readable text on error.friendlyMessage: the server's message,
// else the error text, else a generic sentence.
function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

// listTemplates() - GET the ready-made incident types (15 s timeout); on error rethrow with
// friendlyMessage.
export async function listTemplates() {
  try {
    const { data } = await axios.get(`${BASE_URL}/templates`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getAddressAt(lat, lng) - GET the street address for GPS coordinates and return it (or null).
export async function getAddressAt(lat, lng) {
  try {
    const { data } = await axios.get(`${BASE_URL}/where`, { params: { lat, lng }, timeout: 15000 })
    return data.address
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// reportIncident(payload) - POST a new incident and return the saved incident.
export async function reportIncident(payload) {
  try {
    const { data } = await axios.post(BASE_URL, payload, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// listIncidents(status) - GET incidents, optionally only one status (admin).
export async function listIncidents(status) {
  try {
    const { data } = await axios.get(BASE_URL, { params: { status }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// updateIncidentStatus(incidentId, status, note) - PATCH an incident to its next status with an
// optional note and return it.
export async function updateIncidentStatus(incidentId, status, note) {
  try {
    const { data } = await axios.patch(
      `${BASE_URL}/${incidentId}/status`,
      { status, note },
      { timeout: 15000 },
    )
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}
