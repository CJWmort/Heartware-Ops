// The My Assignment service: the API calls for the volunteer's profile, shows and assignments, helpers
// to format dates and statuses, and the useMyAssignment() function that holds the page's state.

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { connectSocket } from '@/services/socket'
import axios from 'axios'

const volunteerDataURL = '/api/users/me'
const showsDataURL = '/api/shows'
const myAssignmentsURL = '/api/assignments/me'

// addFriendlyMessage(error) - puts a readable text on error.friendlyMessage: the server's message,
// else the error's own text, else a generic sentence. Every API function below uses it.
function addFriendlyMessage(error) {
  error.friendlyMessage =
    error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error
}

// getMyProfile() - GET /api/users/me (the logged-in volunteer, including availableShows and
// withdrawnShows). Returns the data or throws an error with friendlyMessage.
export async function getMyProfile() {
  try {
    const { data } = await axios.get(volunteerDataURL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getShows() - GET /api/shows: every show with its date and venue, earliest first.
export async function getShows() {
  try {
    const { data } = await axios.get(showsDataURL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// getMyAssignments() - GET /api/assignments/me: this volunteer's published assignments with the school
// filled in.
export async function getMyAssignments() {
  try {
    const { data } = await axios.get(myAssignmentsURL, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// acceptAssignment(assignmentId) - PATCH .../accept; the returned assignment is now "Accepted".
export async function acceptAssignment(assignmentId) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/accept`, {}, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// declineAssignment(assignmentId, reason) - PATCH .../decline with an optional reason; the server
// deletes the pending row and logs it.
export async function declineAssignment(assignmentId, reason) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/decline`, { reason }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// withdrawAssignment(assignmentId, reason) - PATCH .../withdraw with an optional reason (for an
// already accepted place).
export async function withdrawAssignment(assignmentId, reason) {
  try {
    const { data } = await axios.patch(`/api/assignments/${assignmentId}/withdraw`, { reason }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// setAvailableShows(availableShows) - PUT /api/users/me: replaces the volunteer's whole list of ticked
// shows.
export async function setAvailableShows(availableShows) {
  try {
    const { data } = await axios.put(volunteerDataURL, { availableShows }, { timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// removeAvailableShows(shows) - DELETE /api/users/me with the shows to untick (axios sends a DELETE
// body through the "data" option).
export async function removeAvailableShows(shows) {
  try {
    const { data } = await axios.delete(volunteerDataURL, { data: { availableShows: shows }, timeout: 15000 })
    return data
  } catch (error) {
    throw addFriendlyMessage(error)
  }
}

// formatDate(date) - "2027-06-27" -> "27 June 2027" (English, Singapore style).
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
}

// formatDeadline(date) - "27 Oct, 11:14 am" in Singapore time, for the "Respond by" line on a pending
// offer.
export function formatDeadline(date) {
  return new Date(date).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Singapore',
  })
}

// showStatus(show, availableShows) - works out the label of a show card. 1) it has an assignment ->
// that status (Pending / Accepted) 2) it has a decline/withdraw log -> Declined / Withdrawn 3) the
// volunteer is not available for it -> "Not available" 4) they are on the reserve list -> "On reserve
// list" 5) otherwise "Awaiting allocation".
export function showStatus(show, availableShows) {
  if (show.assignment) return show.assignment.status
  if (show.withdrawal) return show.withdrawal.status
  if (!availableShows.includes(show.name)) return 'Not available'
  if (show.onReserve) return 'On reserve list'
  return 'Awaiting allocation'
}

// statusClass(status) - BOOTSTRAP: picks the Bootstrap "text-bg-*" badge colour for a status: grey
// (text-bg-secondary) for Not available / On reserve list, light blue (text-bg-info) for Awaiting
// allocation, green (text-bg-success) Accepted, red (text-bg-danger) Declined, dark (text-bg-dark)
// Withdrawn, yellow (text-bg-warning) for Pending. Change the colours of the status badges here.
export function statusClass(status) {
  if (status === 'Not available' || status === 'On reserve list') return 'text-bg-secondary'
  if (status === 'Awaiting allocation') return 'text-bg-info'
  if (status === 'Accepted') return 'text-bg-success'
  if (status === 'Declined') return 'text-bg-danger'
  if (status === 'Withdrawn') return 'text-bg-dark'
  return 'text-bg-warning'
}

// useMyAssignment() - the page's state and actions for the My Assignment page (called once per page so
// each page has its own copy). Returns the refs, computed values and functions the page uses.
export function useMyAssignment() {
  const volData = ref(null)
  const volAvailableShows = ref([])
  const shows = ref([])
  const errorMessage = ref('')
  const loaded = ref(false)
  const loading = ref(true)

  // hasNoAvailability - true once data has loaded and the volunteer has ticked no show yet.
  const hasNoAvailability = computed(() => loaded.value && volAvailableShows.value.length === 0)

  // loadData(silent) - loads everything the page needs. 1) a normal load clears the error message 2)
  // fetch profile, shows and assignments at the same time 3) save the profile and available shows 4)
  // attach to each show: its assignment (only if it has a school), its latest decline/withdraw log,
  // and whether the volunteer is on the reserve list 5) mark loaded 6) an error is shown only for a
  // normal load (a silent refresh just retries next time) 7) always clear "loading" so the overlay can
  // never get stuck.
  async function loadData(silent = false) {
    if (!silent) errorMessage.value = ''

    try {
      const [profile, showList, assignments] = await Promise.all([getMyProfile(), getShows(), getMyAssignments()])

      volData.value = profile
      volAvailableShows.value = profile.availableShows || []

      const withdrawnShows = profile.withdrawnShows || []
      shows.value = showList.map(s => ({
        ...s,
        assignment: assignments.find(a => a.show === s.name && a.school) || null,
        withdrawal: withdrawnShows.findLast(w => w.show === s.name) || null,
        onReserve: assignments.some(a => a.show === s.name && !a.school),
      }))
      loaded.value = true
    } catch (error) {
      if (!silent) errorMessage.value = error.friendlyMessage
    } finally {
      loading.value = false
    }
  }

  const acceptingId = ref(null)

  // acceptShow(show) - 1) clear the error and mark this assignment as being accepted (spinner on its
  // button), 2) call the server, 3) replace the assignment with the accepted one and reload the data
  // quietly; on failure show the message and reload as well so the page matches the server.
  async function acceptShow(show) {
    errorMessage.value = ''
    acceptingId.value = show.assignment._id

    try {
      show.assignment = await acceptAssignment(show.assignment._id)
      await loadData(true)
    } catch (error) {
      errorMessage.value = error.friendlyMessage
      await loadData(true)
    }

    acceptingId.value = null
  }

  const pullOutMode = ref('withdraw')
  const withdrawShow = ref(null)
  const withdrawReason = ref('')
  const withdrawing = ref(false)
  const withdrawError = ref('')

  // openDeclineModal(show) - opens the shared popup in "decline" mode for a pending offer: remember
  // the mode and the show, clear the reason and any error.
  function openDeclineModal(show) {
    pullOutMode.value = 'decline'
    withdrawShow.value = show
    withdrawReason.value = ''
    withdrawError.value = ''
  }

  // openWithdrawModal(show) - same popup in "withdraw" mode for an already accepted place.
  function openWithdrawModal(show) {
    pullOutMode.value = 'withdraw'
    withdrawShow.value = show
    withdrawReason.value = ''
    withdrawError.value = ''
  }

  // closeWithdrawModal() - closes the popup (no show selected).
  function closeWithdrawModal() {
    withdrawShow.value = null
  }

  // confirmWithdraw() - 1) clear the error and show the spinner 2) choose decline or withdraw endpoint
  // from the popup mode 3) send the reason 4) reload the page data (the assignment is gone, so the
  // Declined/Withdrawn log shows) 5) close the popup 6) on error show the message inside the popup 7)
  // stop the spinner.
  async function confirmWithdraw() {
    withdrawError.value = ''
    withdrawing.value = true

    try {
      const show = withdrawShow.value
      const send = pullOutMode.value === 'decline' ? declineAssignment : withdrawAssignment
      await send(show.assignment._id, withdrawReason.value)
      await loadData()
      closeWithdrawModal()
    } catch (error) {
      withdrawError.value = error.friendlyMessage
    }

    withdrawing.value = false
  }

  const showAvailabilityModal = ref(false)
  const selectedShows = ref([])
  const saving = ref(false)
  const modalError = ref('')

  // openAvailabilityModal() - opens the "Change availability" popup: copy the current list into the
  // ticked boxes, clear any error, show the popup.
  function openAvailabilityModal() {
    selectedShows.value = [...volAvailableShows.value]
    modalError.value = ''
    showAvailabilityModal.value = true
  }

  // closeAvailabilityModal() - hides the popup.
  function closeAvailabilityModal() {
    showAvailabilityModal.value = false
  }

  // saveAvailability() - 1) show the spinner 2) send the ticked shows 3) reload page data once (a
  // newly ticked published show now shows "On reserve list" or a school; unticked shows lose their
  // Accept button) 4) close the popup 5) on error show the server's reason (e.g. "You have accepted a
  // place in...") or a generic message 6) stop the spinner.
  async function saveAvailability() {
    modalError.value = ''
    saving.value = true

    try {
      await setAvailableShows(selectedShows.value)
      await loadData()
      closeAvailabilityModal()
    } catch (error) {
      modalError.value = error.response?.data?.message || 'Failed to save your availability. Please try again.'
    }

    saving.value = false
  }

  let timer = null
  let socket = null
  let pending = false

  // busy - true while a popup is open or an action is in progress. Auto-refresh waits while busy so
  // cards do not change under the volunteer's finger.
  const busy = computed(() => !!(withdrawShow.value || showAvailabilityModal.value || acceptingId.value || withdrawing.value || saving.value))

  // refreshIfIdle() - 1) tab hidden or busy -> remember to refresh later (pending = true) 2) otherwise
  // clear pending and reload quietly.
  function refreshIfIdle() {
    if (document.visibilityState !== 'visible' || busy.value) {
      pending = true
      return
    }
    pending = false
    loadData(true)
  }

  // A refresh that waited for a popup to close runs as soon as it closes When "busy" turns false and a
  // refresh was waiting, run it now.
  watch(busy, (isBusy) => {
    if (!isBusy && pending) refreshIfIdle()
  })

  // On mount: refresh when the tab becomes visible again, every 60 seconds, and instantly when the
  // server announces "assignments:updated" over the live socket.
  onMounted(() => {
    document.addEventListener('visibilitychange', refreshIfIdle)
    timer = setInterval(refreshIfIdle, 60000)
    socket = connectSocket()
    socket.on('assignments:updated', refreshIfIdle)
  })
  // onUnmounted - remove the tab listener, stop the timer and stop listening for live assignment
  // updates.
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', refreshIfIdle)
    clearInterval(timer)
    socket?.off('assignments:updated', refreshIfIdle)
  })

  return {
    volData, volAvailableShows, shows, errorMessage, loaded, loading, hasNoAvailability, loadData,
    showAvailabilityModal, selectedShows, saving, modalError,
    openAvailabilityModal, closeAvailabilityModal, saveAvailability,
    acceptingId, acceptShow,
    pullOutMode, withdrawShow, withdrawReason, withdrawing, withdrawError,
    openDeclineModal, openWithdrawModal, closeWithdrawModal, confirmWithdraw,
  }
}
