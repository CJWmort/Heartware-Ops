// The chat state store (Pinia): threads, messages, unread counts, online and typing, with the socket
// events and REST calls that keep it live.

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/services/auth'
import { connectSocket, disconnectSocket } from '@/services/socket'
import {
  getReadState,
  getUnreadCount,
  listMessages,
  listThreads,
  sendMessage,
} from '@/services/messages'

// formatChatTime(value) - turns a timestamp into chat-bubble text. 1) empty value -> empty text 2)
// build a Date 3) format the time as "3:42 PM" 4) if the date is today return just the time 5)
// otherwise prefix the short date ("12 Oct 3:42 PM"). "3:42 PM" for today, "12 Oct 3:42 PM" for older
// messages
export function formatChatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

// useChatStore - the Pinia store behind the navbar Chat button and panel. It holds whether the panel
// is open, the admin's thread list, the open conversation, unread counters, who is online and who is
// typing, and it connects to the socket for live messages. The functions inside load, send, read and
// clean up.
export const useChatStore = defineStore('chat', () => {
  const auth = useAuthStore()

  const isOpen = ref(false)
  const threads = ref([])
  const activeId = ref(null)
  const messages = ref([])
  const unreadVolunteer = ref(0)
  const online = ref({})
  const typing = ref(null)
  const otherReadAt = ref(null)
  const loadingMessages = ref(false)
  const threadsLoaded = ref(false)
  const sending = ref(false)
  const error = ref('')

  // ---- derived ---- Derived values (computed): isAdmin = logged-in role is admin; myId = the user's
  // id as text; unreadTotal = number on the navbar badge (admin: sum of every thread's unread,
  // volunteer: own counter); activeThread = the list row of the open chat.
  const isAdmin = computed(() => auth.role === 'admin')
  // myId (computed) - the logged-in user's id as text.
  const myId = computed(() => String(auth.user?.id ?? auth.user?._id ?? ''))
  // Number on the navbar badge
  const unreadTotal = computed(() =>
    isAdmin.value
      ? threads.value.reduce((sum, t) => sum + (t.unreadAdmin || 0), 0)
      : unreadVolunteer.value,
  )
  // activeThread (computed) - the thread row of the conversation that is open, or null.
  const activeThread = computed(() => threads.value.find((t) => t.volunteerId === activeId.value) ?? null)

  let socket = null
  let started = false
  let typingTimer = null
  let lastTypingSent = 0
  const lastReadSent = {}

  // isOnline(volunteerId) - true while that volunteer is marked online (the green dot in the admin
  // list).
  const isOnline = (volunteerId) => !!online.value[String(volunteerId)]

  // viewing() - is the person really looking at a conversation? 1) admin: a thread must be selected,
  // volunteer: always yes 2) the panel must be open 3) the browser tab must be visible. Used so a
  // message is only marked "read" when it was actually seen. Is the person actually looking at a
  // conversation right now?
  function viewing() {
    const inConversation = isAdmin.value ? activeId.value !== null : true
    return isOpen.value && inConversation && document.visibilityState === 'visible'
  }

  // matchesActive(volunteerId) - does a live event belong to the chat on screen? A volunteer only gets
  // their own chat so always true; an admin compares with the selected thread.
  const matchesActive = (volunteerId) => (isAdmin.value ? activeId.value === String(volunteerId) : true)

  // sortThreads() - sorts the admin list by latest message time, newest first; threads with no
  // messages sink to the bottom.
  function sortThreads() {
    threads.value.sort(
      (a, b) => (b.lastAt ? +new Date(b.lastAt) : 0) - (a.lastAt ? +new Date(a.lastAt) : 0),
    )
  }

  // loadThreads() - 1) ask the server for every volunteer's thread summary 2) store them with ids as
  // text and unreadAdmin defaulting to 0 3) rebuild the "online" map from the rows flagged online 4)
  // on failure show the friendly error message.
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
    } finally {
      threadsLoaded.value = true
    }
  }

  // loadUnread() - volunteer only: fetch the unread count for the badge; a failure is ignored on
  // purpose (the badge just stays as it was).
  async function loadUnread() {
    try {
      unreadVolunteer.value = await getUnreadCount()
    } catch {
    }
  }

  // loadConversation() - 1) remember which thread we are loading and show the loading state 2) fetch
  // the messages and the read-state together (the read-state is optional: its failure becomes null) 3)
  // admin only: if the admin switched chat meanwhile, throw this result away 4) store the messages 5)
  // store when the OTHER side last read (drives "Seen") 6) forget the last read mark so markRead can
  // send again 7) call markRead() 8) on error show the message 9) always stop the loading state.
  async function loadConversation() {
    const id = activeId.value
    loadingMessages.value = true
    error.value = ''
    try {
      const [data, state] = await Promise.all([
        listMessages(isAdmin.value ? id : undefined),
        getReadState(isAdmin.value ? id : undefined).catch(() => null),
      ])
      if (isAdmin.value && id !== activeId.value) return
      messages.value = data
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

  // refresh() - catch-up used on first start and after the socket reconnects. 1) admin reloads the
  // thread list, volunteer reloads the unread count 2) if a conversation is open reload its messages
  // too. Used on first start and after the socket reconnects (we may have missed events while offline)
  async function refresh() {
    if (isAdmin.value) await loadThreads()
    else await loadUnread()
    if (isOpen.value && (!isAdmin.value || activeId.value !== null)) await loadConversation()
  }

  // markRead() - tells the server "I have seen everything". 1) stop unless viewing() 2) find the
  // newest message from the other side 3) stop if there is none or we already reported that one 4)
  // remember it 5) zero the local unread counter 6) send the socket event "read" with the timestamp.
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

  // open() - opens the panel. 1) set open and clear the error 2) volunteer (or admin with a thread
  // chosen) loads the conversation 3) admin with no thread chosen loads the thread list.
  async function open() {
    isOpen.value = true
    error.value = ''
    if (!isAdmin.value || activeId.value !== null) await loadConversation()
    else await loadThreads()
  }
  // openThread(volunteerId) - admin only: opens the panel straight on one volunteer's chat (the HQ map
  // "Chat" button). Loads the thread list too if empty, because the header name comes from it. Admin
  // only: open the panel straight on one volunteer's chat (used by the "Chat" button on the HQ map
  // card)
  async function openThread(volunteerId) {
    if (!isAdmin.value) return
    isOpen.value = true
    error.value = ''
    await Promise.all([selectThread(volunteerId), threads.value.length ? null : loadThreads()])
  }
  // close() - hides the panel (state is kept).
  function close() {
    isOpen.value = false
  }
  // toggle() - open if closed, close if open (the navbar Chat button).
  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  // selectThread(volunteerId) - admin picks a volunteer: store the id, clear old
  // messages/typing/notice, then load that conversation.
  async function selectThread(volunteerId) {
    activeId.value = String(volunteerId)
    messages.value = []
    otherReadAt.value = null
    typing.value = null
    await loadConversation()
  }
  // backToList() - admin goes back from a conversation to the list: clear the selection, messages,
  // typing, notice and error.
  function backToList() {
    activeId.value = null
    messages.value = []
    otherReadAt.value = null
    typing.value = null
    error.value = ''
  }

  // send(text) - 1) trim the text 2) ignore empty text or a send already in progress (returns false)
  // 3) show "sending" and clear the error 4) POST it, add the saved message to the list at once (the
  // socket copy has the same _id and is ignored) 5) clear the notice and return true 6) on error keep
  // the text for the user: show the message and return false 7) always stop "sending". Send over REST.
  // The saved message comes back right away; the socket copy is ignored (same _id).
  async function send(text) {
    const clean = text.trim()
    if (!clean || sending.value) return false
    sending.value = true
    error.value = ''
    try {
      addMessage(await sendMessage(clean, isAdmin.value ? activeId.value : undefined))
      return true
    } catch (e) {
      error.value = e.friendlyMessage
      return false
    } finally {
      sending.value = false
    }
  }

  // notifyTyping() - called on each keystroke. Sends the socket "typing" event at most once every 2
  // seconds. Called on every keystroke; only tells the server about once every 2 seconds
  function notifyTyping() {
    if (!socket || Date.now() - lastTypingSent < 2000) return
    lastTypingSent = Date.now()
    socket.emit('typing', { volunteerId: isAdmin.value ? activeId.value : undefined })
  }

  // addMessage(m) - pushes a message into the open conversation unless one with the same _id is
  // already there (prevents duplicates from REST + socket).
  function addMessage(m) {
    if (!messages.value.some((x) => x._id === m._id)) messages.value.push(m)
  }

  // onMessageNew(m) - socket event for a new message. 1) find which volunteer's thread it belongs to
  // 2) add it if that chat is on screen 3) if it was sent by me stop 4) clear the typing indicator 5)
  // if I am viewing that chat mark it read 6) else a volunteer's unread counter goes up by 1 (the
  // admin's counter comes from thread:updated).
  function onMessageNew(m) {
    const vid = String(m.thread)
    const fromOther = m.senderRole !== auth.role
    if (matchesActive(vid)) addMessage(m)
    if (!fromOther) return
    typing.value = null
    if (viewing() && matchesActive(vid)) markRead()
    else if (!isAdmin.value) unreadVolunteer.value += 1
  }

  // onThreadUpdated(summary) - admin only: a row of the list changed. 1) strip the "online" field
  // (presence events own that) 2) if the thread is unknown reload the whole list 3) otherwise merge
  // the new fields into the row 4) if that chat is open on screen set its unread to 0 5) re-sort.
  function onThreadUpdated(summary) {
    if (!isAdmin.value) return
    const { online: _ignored, ...fields } = summary
    const vid = String(summary.volunteerId)
    const thread = threads.value.find((t) => t.volunteerId === vid)
    if (!thread) {
      loadThreads()
      return
    }
    Object.assign(thread, fields, { volunteerId: vid })
    if (viewing() && activeId.value === vid) thread.unreadAdmin = 0
    sortThreads()
  }

  // onTyping({volunteerId, role}) - shows "typing..." for the other side and hides it again after 3
  // quiet seconds (the timer restarts on every event).
  function onTyping({ volunteerId, role }) {
    if (!matchesActive(volunteerId)) return
    typing.value = { role }
    clearTimeout(typingTimer)
    typingTimer = setTimeout(() => (typing.value = null), 3000)
  }

  // onReadUpdate({volunteerId, role, readAt}) - the other side read up to readAt. Ignore my own role,
  // other chats and invalid dates; only move "Seen" forward, never back.
  function onReadUpdate({ volunteerId, role, readAt }) {
    if (role === auth.role || !matchesActive(volunteerId)) return
    const time = +new Date(readAt)
    if (Number.isNaN(time)) return
    if (!otherReadAt.value || time > +new Date(otherReadAt.value)) otherReadAt.value = readAt
  }

  // onPresenceUpdate({volunteerId, online}) - marks one volunteer online/offline in the map.
  function onPresenceUpdate({ volunteerId, online: isOn }) {
    if (isOn) online.value[String(volunteerId)] = true
    else delete online.value[String(volunteerId)]
  }
  // onPresenceList(ids) - replaces the whole online map with the ids the server sends (sent on
  // connect).
  function onPresenceList(ids) {
    online.value = Object.fromEntries(ids.map((id) => [String(id), true]))
  }

  const handlers = {
    'message:new': onMessageNew,
    'thread:updated': onThreadUpdated,
    typing: onTyping,
    'read:update': onReadUpdate,
    'presence:update': onPresenceUpdate,
    'presence:list': onPresenceList,
  }

  // start() - runs once after login. 1) skip if already started 2) open the socket 3) attach every
  // handler 4) refresh on socket reconnect 5) mark read when the tab becomes visible 6) first
  // refresh().
  function start() {
    if (started) return
    started = true
    socket = connectSocket()
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler)
    socket.io.on('reconnect', refresh)
    document.addEventListener('visibilitychange', markRead)
    refresh()
  }

  // stop() - runs on logout: skip if not started, detach the socket handlers and listeners, close the
  // socket and reset every field so the next person on this browser starts clean.
  function stop() {
    if (!started) return
    started = false
    for (const [event, handler] of Object.entries(handlers)) socket?.off(event, handler)
    socket?.io.off('reconnect', refresh)
    document.removeEventListener('visibilitychange', markRead)
    disconnectSocket()
    socket = null
    clearTimeout(typingTimer)
    isOpen.value = false
    threads.value = []
    threadsLoaded.value = false
    activeId.value = null
    messages.value = []
    otherReadAt.value = null
    unreadVolunteer.value = 0
    online.value = {}
    typing.value = null
    error.value = ''
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
    threadsLoaded,
    sending,
    error,
    isAdmin,
    myId,
    unreadTotal,
    isOnline,
    toggle,
    close,
    openThread,
    selectThread,
    backToList,
    send,
    notifyTyping,
    start,
    stop,
  }
})
