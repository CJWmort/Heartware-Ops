// Live chat state for the HQ <-> volunteer chat (navbar button + panel).
// REST calls (services/messages.js) load and save. The socket (services/socket.js) pushes live updates.
// Server events are listed at the top of sockets/chat.js on the backend.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/services/auth'
import { connectSocket, disconnectSocket } from '@/services/socket'
import {
  closeThread,
  getReadState,
  getUnreadCount,
  listMessages,
  listThreads,
  sendMessage,
} from '@/services/messages'

// "3:42 PM" for today, "12 Oct 3:42 PM" for older messages
export function formatChatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

export const useChatStore = defineStore('chat', () => {
  const auth = useAuthStore()

  // ---- state ----
  const isOpen = ref(false) // is the panel open
  const threads = ref([]) // admin only: every volunteer with their latest message and unread count
  const activeId = ref(null) // admin only: which volunteer's chat is open (null = showing the list)
  const messages = ref([]) // the open conversation, oldest first
  const unreadVolunteer = ref(0) // volunteer only: unread HQ messages
  const online = ref({}) // volunteerId -> true while that volunteer is online (admins see this)
  const typing = ref(null) // { role } while the other side is typing
  const otherReadAt = ref(null) // when the OTHER side last read this chat (drives "Seen")
  const loadingMessages = ref(false)
  const sending = ref(false)
  const error = ref('')
  const notice = ref('') // e.g. "this chat was closed"

  // ---- derived ----
  const isAdmin = computed(() => auth.role === 'admin')
  const myId = computed(() => String(auth.user?.id ?? auth.user?._id ?? ''))
  // Number on the navbar badge
  const unreadTotal = computed(() =>
    isAdmin.value
      ? threads.value.reduce((sum, t) => sum + (t.unreadAdmin || 0), 0)
      : unreadVolunteer.value,
  )
  const activeThread = computed(() => threads.value.find((t) => t.volunteerId === activeId.value) ?? null)

  // ---- plain variables (not shown on screen, so they don't need to be reactive) ----
  let socket = null
  let started = false
  let typingTimer = null
  let lastTypingSent = 0
  const lastReadSent = {} // conversation -> createdAt of the last message we told the server we read

  const isOnline = (volunteerId) => !!online.value[String(volunteerId)]

  // Is the person actually looking at a conversation right now?
  function viewing() {
    const inConversation = isAdmin.value ? activeId.value !== null : true
    return isOpen.value && inConversation && document.visibilityState === 'visible'
  }

  // Does an incoming event belong to the conversation on screen?
  // (A volunteer only ever receives their own chat; an admin receives every chat.)
  const matchesActive = (volunteerId) => (isAdmin.value ? activeId.value === String(volunteerId) : true)

  // HQ's list: newest chats first, volunteers with no chat yet at the bottom
  function sortThreads() {
    threads.value.sort(
      (a, b) => (b.lastAt ? +new Date(b.lastAt) : 0) - (a.lastAt ? +new Date(a.lastAt) : 0),
    )
  }

  // ---------- loading ----------
  async function loadThreads() {
    try {
      const data = await listThreads()
      threads.value = data.map((t) => ({
        ...t,
        volunteerId: String(t.volunteerId),
        unreadAdmin: t.unreadAdmin || 0,
      }))
      online.value = Object.fromEntries(threads.value.filter((t) => t.online).map((t) => [t.volunteerId, true]))
    } catch (e) {
      error.value = e.friendlyMessage
    }
  }

  async function loadUnread() {
    try {
      unreadVolunteer.value = await getUnreadCount()
    } catch {
      // the badge just stays as it was; not worth showing an error for
    }
  }

  async function loadConversation() {
    const id = activeId.value
    loadingMessages.value = true
    error.value = ''
    try {
      const [data, state] = await Promise.all([
        listMessages(isAdmin.value ? id : undefined),
        getReadState(isAdmin.value ? id : undefined).catch(() => null), // "Seen" is optional, never block the chat
      ])
      if (isAdmin.value && id !== activeId.value) return // admin switched chat while this was loading
      messages.value = data
      // The other side of a volunteer is HQ, and the other side of an admin is the volunteer
      const theirs = isAdmin.value ? state?.volunteerLastReadAt : state?.adminLastReadAt
      otherReadAt.value = theirs || null
      delete lastReadSent[isAdmin.value ? id : 'self']
      markRead()
    } catch (e) {
      error.value = e.friendlyMessage
    } finally {
      loadingMessages.value = false
    }
  }

  // Used on first start and after the socket reconnects (we may have missed events while offline)
  async function refresh() {
    if (isAdmin.value) await loadThreads()
    else await loadUnread()
    if (isOpen.value && (!isAdmin.value || activeId.value !== null)) await loadConversation()
  }

  // ---------- reading ----------
  // Tell the server "I have seen everything up to here" (clears the badge for this side)
  function markRead() {
    if (!viewing()) return
    const key = isAdmin.value ? activeId.value : 'self'
    const lastFromOther = [...messages.value].reverse().find((m) => m.senderRole !== auth.role)
    if (!lastFromOther || lastReadSent[key] === lastFromOther.createdAt) return
    lastReadSent[key] = lastFromOther.createdAt
    if (isAdmin.value) {
      if (activeThread.value) activeThread.value.unreadAdmin = 0
    } else {
      unreadVolunteer.value = 0
    }
    socket?.emit('read', {
      volunteerId: isAdmin.value ? activeId.value : undefined,
      upTo: lastFromOther.createdAt,
    })
  }

  // ---------- panel actions ----------
  async function open() {
    isOpen.value = true
    error.value = ''
    if (!isAdmin.value || activeId.value !== null) await loadConversation()
    else await loadThreads()
  }
  function close() {
    isOpen.value = false
  }
  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  async function selectThread(volunteerId) {
    activeId.value = String(volunteerId)
    messages.value = []
    otherReadAt.value = null
    typing.value = null
    notice.value = ''
    await loadConversation()
  }
  function backToList() {
    activeId.value = null
    messages.value = []
    otherReadAt.value = null
    typing.value = null
    notice.value = ''
    error.value = ''
  }

  // Send over REST. The saved message comes back right away; the socket copy is ignored (same _id).
  async function send(text) {
    const clean = text.trim()
    if (!clean || sending.value) return false
    sending.value = true
    error.value = ''
    try {
      addMessage(await sendMessage(clean, isAdmin.value ? activeId.value : undefined))
      notice.value = ''
      return true
    } catch (e) {
      error.value = e.friendlyMessage
      return false
    } finally {
      sending.value = false
    }
  }

  // Admin only: closes the open chat and deletes its whole history
  async function closeChat() {
    if (!activeId.value) return false
    const id = activeId.value
    try {
      await closeThread(id)
      onThreadClosed({ volunteerId: id })
      backToList()
      return true
    } catch (e) {
      error.value = e.friendlyMessage
      return false
    }
  }

  // Called on every keystroke; only tells the server about once every 2 seconds
  function notifyTyping() {
    if (!socket || Date.now() - lastTypingSent < 2000) return
    lastTypingSent = Date.now()
    socket.emit('typing', { volunteerId: isAdmin.value ? activeId.value : undefined })
  }

  // ---------- live events from the server ----------
  function addMessage(m) {
    if (!messages.value.some((x) => x._id === m._id)) messages.value.push(m)
  }

  function onMessageNew(m) {
    const vid = String(m.thread)
    const fromOther = m.senderRole !== auth.role
    if (matchesActive(vid)) addMessage(m)
    if (!fromOther) return
    typing.value = null
    if (viewing() && matchesActive(vid)) markRead()
    else if (!isAdmin.value) unreadVolunteer.value += 1 // admins get their counts from thread:updated
  }

  // A row of HQ's list changed (new message, read, etc.)
  function onThreadUpdated(summary) {
    if (!isAdmin.value) return
    const { online: _ignored, ...fields } = summary // online/offline comes from the presence events
    const vid = String(summary.volunteerId)
    const thread = threads.value.find((t) => t.volunteerId === vid)
    if (!thread) {
      loadThreads() // a volunteer we don't have yet
      return
    }
    Object.assign(thread, fields, { volunteerId: vid })
    if (viewing() && activeId.value === vid) thread.unreadAdmin = 0 // we are reading it right now
    sortThreads()
  }

  function onThreadClosed({ volunteerId }) {
    const vid = String(volunteerId)
    delete lastReadSent[vid]
    if (isAdmin.value) {
      const thread = threads.value.find((t) => t.volunteerId === vid)
      if (thread) Object.assign(thread, { lastText: '', lastAt: null, unreadAdmin: 0 })
      sortThreads()
      if (activeId.value === vid) {
        messages.value = []
        otherReadAt.value = null
        notice.value = 'This chat was closed. Send a message to start a new one.'
      }
    } else {
      delete lastReadSent.self
      messages.value = []
      otherReadAt.value = null
      unreadVolunteer.value = 0
      notice.value = 'HQ closed this chat. Send a message to start a new one.'
    }
  }

  // The other side is typing; hide the indicator again after 3 quiet seconds
  function onTyping({ volunteerId, role }) {
    if (!matchesActive(volunteerId)) return
    typing.value = { role }
    clearTimeout(typingTimer)
    typingTimer = setTimeout(() => (typing.value = null), 3000)
  }

  // The other side has read up to readAt. Our own read receipts (same role) are ignored.
  // (A volunteer gets only their own chat; an admin gets every chat, so matchesActive filters it.)
  function onReadUpdate({ volunteerId, role, readAt }) {
    if (role === auth.role || !matchesActive(volunteerId)) return
    const time = +new Date(readAt)
    if (Number.isNaN(time)) return
    if (!otherReadAt.value || time > +new Date(otherReadAt.value)) otherReadAt.value = readAt
  }

  function onPresenceUpdate({ volunteerId, online: isOn }) {
    if (isOn) online.value[String(volunteerId)] = true
    else delete online.value[String(volunteerId)]
  }
  function onPresenceList(ids) {
    online.value = Object.fromEntries(ids.map((id) => [String(id), true]))
  }

  const handlers = {
    'message:new': onMessageNew,
    'thread:updated': onThreadUpdated,
    'thread:closed': onThreadClosed,
    typing: onTyping,
    'read:update': onReadUpdate,
    'presence:update': onPresenceUpdate,
    'presence:list': onPresenceList,
  }

  // ---------- start / stop (tied to being logged in) ----------
  function start() {
    if (started) return
    started = true
    socket = connectSocket()
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler)
    socket.io.on('reconnect', refresh) // catch up on anything missed while offline
    document.addEventListener('visibilitychange', markRead) // coming back to the tab counts as reading
    refresh()
  }

  function stop() {
    if (!started) return
    started = false
    for (const [event, handler] of Object.entries(handlers)) socket?.off(event, handler)
    socket?.io.off('reconnect', refresh)
    document.removeEventListener('visibilitychange', markRead)
    disconnectSocket()
    socket = null
    clearTimeout(typingTimer)
    // Forget everything so the next person to log in on this browser starts clean
    isOpen.value = false
    threads.value = []
    activeId.value = null
    messages.value = []
    otherReadAt.value = null
    unreadVolunteer.value = 0
    online.value = {}
    typing.value = null
    error.value = ''
    notice.value = ''
    for (const key of Object.keys(lastReadSent)) delete lastReadSent[key]
  }

  return {
    isOpen,
    threads,
    activeId,
    activeThread,
    messages,
    otherReadAt,
    typing,
    loadingMessages,
    sending,
    error,
    notice,
    isAdmin,
    myId,
    unreadTotal,
    isOnline,
    toggle,
    close,
    selectThread,
    backToList,
    send,
    closeChat,
    notifyTyping,
    start,
    stop,
  }
})
