import { defineStore } from 'pinia'
import { ref } from 'vue'

export const MAX_EVENTS = 50 // events kept per show
const KEY = 'hq-zone-events' // localStorage key

// Reads what was saved before the page was refreshed
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

// Zone alert history for the Live Board bell list.
// Kept in Pinia while the app runs, and copied to localStorage so it survives
// refreshes and closing the tab. Cleared on logout (using AppNavbar.vue).
export const useZoneEventsStore = defineStore('zoneEvents', () => {
  const saved = load()
  const byShow = ref(saved.byShow ?? {}) // show name -> events, newest first
  const unreadByShow = ref(saved.unreadByShow ?? {}) // show name -> events not yet seen
  const owner = ref(saved.owner ?? null) // id of the user this history belongs to
  let seq = saved.seq ?? 0 // keeps event ids unique, even after a refresh

  // Copies the current state to localStorage
  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ owner: owner.value, byShow: byShow.value, unreadByShow: unreadByShow.value, seq }),
      )
    } catch {
      // storage full or blocked: the list still works until the page is refreshed
    }
  }

  // Adds an event to the top of a show's list (keeps the newest MAX_EVENTS)
  function add(show, event, unread = true) {
    const list = byShow.value[show] ?? []
    byShow.value[show] = [{ id: ++seq, at: Date.now(), ...event }, ...list].slice(0, MAX_EVENTS)
    if (unread) unreadByShow.value[show] = (unreadByShow.value[show] ?? 0) + 1
    save()
  }

  // The admin opened the panel: nothing is unread for this show any more
  function markRead(show) {
    unreadByShow.value[show] = 0
    save()
  }

  // Called after login or session restore. If the history belongs to a different
  // user, it is dropped, so one person never sees another's alerts.
  function setOwner(id) {
    if (owner.value !== id) {
      byShow.value = {}
      unreadByShow.value = {}
      owner.value = id
    }
    save()
  }

  // Forget everything (called on logout)
  function clear() {
    byShow.value = {}
    unreadByShow.value = {}
    owner.value = null
    try {
      localStorage.removeItem(KEY)
    } catch {
      // nothing to do
    }
  }

  return { byShow, unreadByShow, add, markRead, setOwner, clear }
})