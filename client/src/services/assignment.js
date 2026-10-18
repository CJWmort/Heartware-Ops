// axios calls + page logic for Fanny (F1b, volunteer side). API functions return the response data
// (or throw – show error.friendlyMessage). useMyAssignment() holds the state for MyAssignmentView.vue.
// Contract: docs/API.md
import { ref, computed } from 'vue'
import axios from 'axios'

const volunteerDataURL = '/api/users/me'
const showsDataURL = '/api/shows'
const myAssignmentsURL = '/api/assignments/me'

function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

// ===== API calls =====

// Logged in volunteer
export async function getMyProfile() {
  try {
    const { data } = await axios.get(volunteerDataURL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// All shows, earliest first
export async function getShows() {
  try {
    const { data } = await axios.get(showsDataURL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// Logged in volunteer's assignments (school filled in)
export async function getMyAssignments() {
  try {
    const { data } = await axios.get(myAssignmentsURL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// Accept one of the volunteer's assignments (status: Pending -> Accepted)
export async function acceptAssignment(assignmentId) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/accept`, {}, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// Pull out of an accepted assignment (status: Accepted -> Withdrawn)
export async function withdrawAssignment(assignmentId, reason) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/withdraw`, { reason }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// Replace the volunteer's whole list of available shows
export async function setAvailableShows(availableShows) {
  try {
    const { data } = await axios.put(volunteerDataURL, { availableShows }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// Remove some shows from the volunteer's available shows
// (axios.delete sends a body through the 'data' option)
export async function removeAvailableShows(shows) {
  try {
    const { data } = await axios.delete(volunteerDataURL, { data: { availableShows: shows }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// ===== Helpers =====

// "2027-06-27" -> "27 June 2027"
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Work out a show's status from assignment + availability
export function showStatus(show, availableShows) {
  if (show.assignment) return show.assignment.status // 'Pending' | 'Accepted' | 'Declined'
  if (!availableShows.includes(show.name)) return 'Not available'
  return 'Awaiting allocation'
}

// Bootstrap badge colour for each status
export function statusClass(status) {
  if (status === 'Not available') return 'text-bg-secondary'
  if (status === 'Awaiting allocation') return 'text-bg-info'
  if (status === 'Accepted') return 'text-bg-success'
  if (status === 'Declined') return 'text-bg-danger'
  if (status === 'Withdrawn') return 'text-bg-dark'
  return 'text-bg-warning'
}

// ===== Page state for MyAssignmentView.vue =====
// Called once per page, so each page gets its own copy of the state.
export function useMyAssignment() {
  const volData = ref(null)
  const volAvailableShows = ref([])
  const shows = ref([]) // from the shows collection, each with its assignment (or null)
  const errorMessage = ref('')
  const loaded = ref(false) // true once volunteer data has arrived

  // True when the volunteer has not picked any show yet
  const hasNoAvailability = computed(() => loaded.value && volAvailableShows.value.length === 0)

  // Load volunteer, shows and assignments together
  async function loadData() {
    errorMessage.value = ''

    try {
      const [profile, showList, assignments] = await Promise.all([getMyProfile(), getShows(), getMyAssignments()])

      volData.value = profile
      volAvailableShows.value = profile.availableShows || []

      // Attach the volunteer's assignment to its show (skip ones whose school no longer exists)
      shows.value = showList.map(s => ({
        ...s,
        assignment: assignments.find(a => a.show === s.name && a.school) || null,
      }))
      loaded.value = true
    } catch (error) {
      errorMessage.value = error.friendlyMessage
    }
  }

  // ===== Accept assignment =====
  const acceptingId = ref(null) // assignment being accepted (shows a spinner on its button)

  async function acceptShow(show) {
    errorMessage.value = ''
    acceptingId.value = show.assignment._id

    try {
      show.assignment = await acceptAssignment(show.assignment._id) // updated status comes back
    } catch (error) {
      errorMessage.value = error.friendlyMessage
    }

    acceptingId.value = null
  }

  // ===== Pull out popup =====
  const withdrawShow = ref(null) // show being pulled out of (popup is open when set)
  const withdrawReason = ref('')
  const withdrawing = ref(false)
  const withdrawError = ref('')

  function openWithdrawModal(show) {
    withdrawShow.value = show
    withdrawReason.value = ''
    withdrawError.value = ''
  }

  function closeWithdrawModal() {
    withdrawShow.value = null
  }

  async function confirmWithdraw() {
    withdrawError.value = ''
    withdrawing.value = true

    try {
      const show = withdrawShow.value
      show.assignment = await withdrawAssignment(show.assignment._id, withdrawReason.value) // updated status comes back
      closeWithdrawModal()
    } catch (error) {
      withdrawError.value = error.friendlyMessage
    }

    withdrawing.value = false
  }

  // ===== Change Availability popup =====
  const showAvailabilityModal = ref(false)
  const selectedShows = ref([]) // ticked checkboxes in the popup
  const saving = ref(false)
  const modalError = ref('')

  function openAvailabilityModal() {
    selectedShows.value = [...volAvailableShows.value]
    modalError.value = ''
    showAvailabilityModal.value = true
  }

  function closeAvailabilityModal() {
    showAvailabilityModal.value = false
  }

  async function saveAvailability() {
    modalError.value = ''
    saving.value = true

    try {
      await setAvailableShows(selectedShows.value)
      volAvailableShows.value = selectedShows.value
      closeAvailabilityModal()
    } catch (error) {
      modalError.value = 'Failed to save your availability. Please try again.'
    }

    saving.value = false
  }

  return {
    volData, volAvailableShows, shows, errorMessage, loaded, hasNoAvailability, loadData,
    showAvailabilityModal, selectedShows, saving, modalError,
    openAvailabilityModal, closeAvailabilityModal, saveAvailability,
    acceptingId, acceptShow,
    withdrawShow, withdrawReason, withdrawing, withdrawError,
    openWithdrawModal, closeWithdrawModal, confirmWithdraw,
  }
}
