// axios calls + page logic for Fanny (F1b, volunteer side). API functions return the response data
// (or throw – show error.friendlyMessage). useMyAssignment() holds the state for MyAssignmentView.vue.
// Contract: docs/API.md
import { ref, computed, onMounted, onUnmounted } from 'vue' // CHANGED: lifecycle hooks added for the auto-refresh
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

// NEW: "27 Oct, 11:14 am" in Singapore time, for the "Respond by" line on a Pending offer
export function formatDeadline(date) {
  return new Date(date).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Singapore', // always Singapore time, whatever the volunteer's device is set to
  })
}

// Work out a show's status from assignment + withdrawal log + availability
export function showStatus(show, availableShows) {
  if (show.assignment) return show.assignment.status // 'Pending' | 'Accepted'
  if (show.withdrawal) return show.withdrawal.status // 'Declined' | 'Withdrawn' (assignment was deleted, only the log is left)
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
  // CHANGED: loadData(silent). A silent refresh (used by the timer and after Accept) keeps any error message the
  // volunteer is reading and ignores a failed refresh, so a brief network blip does not flash an error at them.
  async function loadData(silent = false) {
    if (!silent) errorMessage.value = ''

    try {
      const [profile, showList, assignments] = await Promise.all([getMyProfile(), getShows(), getMyAssignments()])

      volData.value = profile
      volAvailableShows.value = profile.availableShows || []

      // Attach the volunteer's assignment to its show (skip ones whose school no longer exists),
      // and their latest decline / withdraw log for that show (from withdrawnShows on their account)
      const withdrawnShows = profile.withdrawnShows || []
      shows.value = showList.map(s => ({
        ...s,
        assignment: assignments.find(a => a.show === s.name && a.school) || null,
        withdrawal: withdrawnShows.findLast(w => w.show === s.name) || null,
        onReserve: assignments.some(a => a.show === s.name && !a.school), // allocated, but no school free for them
      }))
      loaded.value = true
    } catch (error) {
      if (!silent) errorMessage.value = error.friendlyMessage // a silent refresh just tries again next time
    }
  }

  // ===== Accept assignment =====
  const acceptingId = ref(null) // assignment being accepted (shows a spinner on its button)

  async function acceptShow(show) {
    errorMessage.value = ''
    acceptingId.value = show.assignment._id

    try {
      show.assignment = await acceptAssignment(show.assignment._id) // updated status comes back
      await loadData(true) // NEW: other shows may have changed too, so refresh every card (quietly)
    } catch (error) {
      errorMessage.value = error.friendlyMessage
    }

    acceptingId.value = null
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
      await send(show.assignment._id, withdrawReason.value)
      await loadData() // the assignment is gone now, so reload to show the Declined / Withdrawn log
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
      await loadData() // FIX: reload, because the server deletes Pending rows of unticked shows (and may fill reserves); the page showed stale Accept buttons
    } catch (error) {
      // NEW: show the server's reason when it has one (e.g. "You have accepted a place in NE Show 2. Press Withdraw first..."),
      // otherwise the generic text
      modalError.value = error.response?.data?.message || 'Failed to save your availability. Please try again.'
    }

    saving.value = false
  }

  // ===== Auto-refresh =====
  // NEW: keep the page fresh. Another show being published, a replacement from Reserve, or an offer lapsing after
  // 24h all happen on the server; without this the page only showed them after a manual reload.
  // (placed here, after the refs above are declared, because the checks below read them)
  let timer = null
  function refreshIfIdle() {
    if (document.visibilityState !== 'visible') return // tab in the background: skip
    // do not swap the cards underneath a popup or a click that is in progress
    if (withdrawShow.value || showAvailabilityModal.value || acceptingId.value || withdrawing.value || saving.value) return
    loadData(true)
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', refreshIfIdle) // volunteer comes back to this tab
    timer = setInterval(refreshIfIdle, 60000) // and every 60 seconds while it stays open
  })
  onUnmounted(() => { // stop when they leave the page, otherwise it would keep polling
    document.removeEventListener('visibilitychange', refreshIfIdle)
    clearInterval(timer)
  })

  return {
    volData, volAvailableShows, shows, errorMessage, loaded, hasNoAvailability, loadData,
    showAvailabilityModal, selectedShows, saving, modalError,
    openAvailabilityModal, closeAvailabilityModal, saveAvailability,
    acceptingId, acceptShow,
    pullOutMode, withdrawShow, withdrawReason, withdrawing, withdrawError,
    openDeclineModal, openWithdrawModal, closeWithdrawModal, confirmWithdraw,
  }
}
