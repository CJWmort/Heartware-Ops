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

// NEW: decline a pending assignment (status: Pending -> Declined).
// Before this, a volunteer who could not go had no way to give the place back.
export async function declineAssignment(assignmentId, reason) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/decline`, { reason }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// NEW (undo): take back a declined / withdrawn place. Declined -> Pending, Withdrawn -> Accepted.
// The server answers 409 with a friendly message if the place was already given to someone else.
export async function undoAssignment(assignmentId) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/undo`, {}, { timeout: 15000 })
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
  if (show.onReserve) return 'On reserve list' // NEW: allocated but no school place was free (a published Reserve row)
  return 'Awaiting allocation'
}

// Bootstrap badge colour for each status
export function statusClass(status) {
  if (status === 'Not available' || status === 'On reserve list') return 'text-bg-secondary' // grey: nothing for the volunteer to do'
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
        onReserve: assignments.some(a => a.show === s.name && !a.school), // allocated, but no school free for them
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

  // ===== Undo (change of mind) =====
  // NEW: lets a volunteer reverse a Decline / "Can't make it" while the place is still free.
  const undoingId = ref(null) // assignment being restored (disables its button so it cannot be double-clicked)

  async function undoShow(show) {
    errorMessage.value = ''
    undoingId.value = show.assignment._id

    try {
      show.assignment = await undoAssignment(show.assignment._id) // new status comes back (Pending or Accepted)
    } catch (error) {
      // e.g. 409 "place already given to another volunteer": show the message, leave the row as it was
      errorMessage.value = error.friendlyMessage
    }

    undoingId.value = null
  }

  // ===== Decline / pull out popup (one popup, two modes) =====
  // NEW: one popup serves two actions. Pending -> "decline", Accepted -> "withdraw" (they call different endpoints).
  const pullOutMode = ref('withdraw') // 'decline' (Pending) or 'withdraw' (Accepted)
  const withdrawShow = ref(null) // show being pulled out of (popup is open when set)
  const withdrawReason = ref('')
  const withdrawing = ref(false)
  const withdrawError = ref('')

  function openDeclineModal(show) {
    pullOutMode.value = 'decline' // remember the mode so confirmWithdraw() calls the right endpoint'
    withdrawShow.value = show
    withdrawReason.value = ''
    withdrawError.value = ''
  }

  function openWithdrawModal(show) {
    pullOutMode.value = 'withdraw'
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
      // pick the endpoint that matches the popup mode (decline = not accepted yet, withdraw = already accepted)
      const send = pullOutMode.value === 'decline' ? declineAssignment : withdrawAssignment
      show.assignment = await send(show.assignment._id, withdrawReason.value) // updated status comes back
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
      // NEW: show the server's reason when it has one (e.g. "You have accepted a place in NE Show 2. Press Can't make it first..."),
      // otherwise the generic text
      modalError.value = error.response?.data?.message || 'Failed to save your availability. Please try again.'
    }

    saving.value = false
  }

  return {
    volData, volAvailableShows, shows, errorMessage, loaded, hasNoAvailability, loadData,
    showAvailabilityModal, selectedShows, saving, modalError,
    openAvailabilityModal, closeAvailabilityModal, saveAvailability,
    acceptingId, acceptShow,
    undoingId, undoShow,
    pullOutMode, withdrawShow, withdrawReason, withdrawing, withdrawError,
    openDeclineModal, openWithdrawModal, closeWithdrawModal, confirmWithdraw,
  }
}
