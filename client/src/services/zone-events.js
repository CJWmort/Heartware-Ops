// The store (Pinia) that remembers the HQ zone arrival and departure alerts and their unread counts,
// saved in the browser per user.

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const MAX_EVENTS = 50
const KEY = 'hq-zone-events'

// load() - reads the saved alert history from localStorage; any problem -> an empty object.
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

// useZoneEventsStore - the HQ Live Board "bell list" of zone alerts. byShow = events per show (newest
// first), unreadByShow = unseen counts, owner = whose history this is. Copied to localStorage so it
// survives refreshes.
export const useZoneEventsStore = defineStore('zoneEvents', () => {
  const saved = load()
  const byShow = ref(saved.byShow ?? {})
  const unreadByShow = ref(saved.unreadByShow ?? {})
  const owner = ref(saved.owner ?? null)
  let seq = saved.seq ?? 0

  // save() - writes owner, byShow, unreadByShow and seq to localStorage (a full or blocked storage is
  // ignored).
  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ owner: owner.value, byShow: byShow.value, unreadByShow: unreadByShow.value, seq }),
      )
    } catch {
    }
  }

  // add(show, event, unread) - puts an event at the top of that show's list with a unique id and
  // timestamp, keeps only the newest 50, adds 1 to the unread count (unless unread = false), saves.
  function add(show, event, unread = true) {
    const list = byShow.value[show] ?? []
    byShow.value[show] = [{ id: ++seq, at: Date.now(), ...event }, ...list].slice(0, MAX_EVENTS)
    if (unread) unreadByShow.value[show] = (unreadByShow.value[show] ?? 0) + 1
    save()
  }

  // markRead(show) - sets that show's unread count to 0 and saves.
  function markRead(show) {
    unreadByShow.value[show] = 0
    save()
  }

  // setOwner(id) - if the stored history belongs to a different user, wipe it; then record the owner
  // and save.
  function setOwner(id) {
    if (owner.value !== id) {
      byShow.value = {}
      unreadByShow.value = {}
      owner.value = id
    }
    save()
  }

  // clear() - forget everything (logout): empty lists, no owner, delete the saved copy.
  function clear() {
    byShow.value = {}
    unreadByShow.value = {}
    owner.value = null
    try {
      localStorage.removeItem(KEY)
    } catch {
    }
  }

  return { byShow, unreadByShow, add, markRead, setOwner, clear }
})