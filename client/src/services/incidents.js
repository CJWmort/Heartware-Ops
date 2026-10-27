// axios calls for Wei Ming (F4). Each returns the response data (or throws – show error.friendlyMessage).
import axios from 'axios'

const BASE_URL = '/api/incidents'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

export async function listTemplates() {
  try {
    const { data } = await axios.get(`${BASE_URL}/templates`, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function getAddressAt(lat, lng) {
  try {
    const { data } = await axios.get(`${BASE_URL}/where`, { params: { lat, lng }, timeout: 15000 })
    return data.address
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function reportIncident(payload) {
  try {
    const { data } = await axios.post(BASE_URL, payload, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

export async function listIncidents(status) {
  try {
    const { data } = await axios.get(BASE_URL, { params: { status }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

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
