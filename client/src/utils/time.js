// Small date helpers (generic, reusable by any feature).

// "just now", "5 min ago", "2 h ago", "3 d ago"
export function timeAgo(date, now = Date.now()) {
  const seconds = Math.round((now - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

// "14:05" in Singapore time
export function clockTime(date) {
  return new Date(date).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore',
  })
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore',
  })
}
