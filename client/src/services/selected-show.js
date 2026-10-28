// Remembers which NE Show the user picked, for the current browser session (this tab).
// Shared by the Allocation Board, HQ Live Map and Tracking page, so picking "NE Show 3" in one
// opens the others on "NE Show 3" too. sessionStorage is cleared when the tab closes, and we also
// clear it on login/logout so one person's choice never carries over to the next person.
const KEY = 'selected-show'

export function getSavedShow() {
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return '' // storage blocked (private mode etc.): just behave as if nothing was saved
  }
}

export function saveShow(show) {
  try {
    if (show) sessionStorage.setItem(KEY, show)
  } catch {
    /* ignore: remembering the show is a convenience, never required */
  }
}

const FILTER_PREFIX = 'hw-filter:'

export function getSavedFilter(key, fallback = '') {
  try {
    return localStorage.getItem(FILTER_PREFIX + key) ?? fallback
  } catch {
    return fallback
  }
}

export function saveFilter(key, value) {
  try {
    localStorage.setItem(FILTER_PREFIX + key, value ?? '')
  } catch {
    /* ignore */
  }
}

export function clearSavedShow() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(FILTER_PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}