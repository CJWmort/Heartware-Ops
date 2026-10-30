// Remembers the chosen show and the dropdown filters in the browser, so a page opens the way you left
// it.

const KEY = 'selected-show'

// getSavedShow() - the NE Show picked earlier in this browser tab (sessionStorage), or "" if none or
// storage is blocked.
export function getSavedShow() {
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

// saveShow(show) - remember the picked show for this tab (ignored if storage is blocked).
export function saveShow(show) {
  try {
    if (show) sessionStorage.setItem(KEY, show)
  } catch {
  }
}

const FILTER_PREFIX = 'hw-filter:'

// getSavedFilter(key, fallback) - a remembered page filter from localStorage, or the fallback.
export function getSavedFilter(key, fallback = '') {
  try {
    return localStorage.getItem(FILTER_PREFIX + key) ?? fallback
  } catch {
    return fallback
  }
}

// saveFilter(key, value) - remember a page filter (stored under the prefix "hw-filter:").
export function saveFilter(key, value) {
  try {
    localStorage.setItem(FILTER_PREFIX + key, value ?? '')
  } catch {
  }
}

// clearSavedShow() - on login/logout: forget the picked show (sessionStorage) and every saved filter
// (localStorage) so nothing carries over to the next person.
export function clearSavedShow() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(FILTER_PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
  }
}