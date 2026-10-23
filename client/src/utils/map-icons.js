// Shared Leaflet icons + tooltip helpers. The CSS for these classes lives in
// src/assets/map-ui.css (imported by BaseMap), so any view using BaseMap can
// call these and get the same look.
import L from 'leaflet'

/* ---------------------------- markers ---------------------------- */

// Round badge with a person icon. status: 'live' | 'stale' | 'offline'
export function createVolIcon(status) {
  return L.divIcon({
    className: 'vol-marker',
    html: `<div class="vol-dot ${status}"><i class="bi bi-person-fill"></i></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -18],
  })
}

// Rounded indigo badge with a graduation cap (a school)
//   dimmed : true gives the lighter indigo used for schools that are not the focused one (Allocation board)
export function createSchoolIcon({ dimmed = false } = {}) {
  return L.divIcon({
    className: 'school-marker',
    html: `<div class="school-badge${dimmed ? ' dimmed' : ''}"><i class="bi bi-mortarboard-fill"></i></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    tooltipAnchor: [0, -20],
  })
}

// Red location pin resting on a small grey dot (a destination)
export function createDestIcon() {
  return L.divIcon({
    className: 'dest-marker',
    html: `
      <div class="dest-pin">
        <span class="dest-dot"></span>
        <i class="bi bi-geo-alt-fill"></i>
      </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 32], // the pin tip / grey dot is the real location
    tooltipAnchor: [0, -34],
  })
}

// Blue dot with a hidden heading cone (the user)
export function createDotIcon() {
  return L.divIcon({
    className: 'me-dot',
    html: `
      <div class="me-dot-wrap">
        <div class="me-dot-cone"></div>
        <div class="me-dot-core"></div>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    tooltipAnchor: [0, -14],
  })
}

// "xx min" pill shown on a route line
export function createRouteLabelIcon(minutes) {
  return L.divIcon({
    className: 'route-label',
    html: `<div class="route-label-pill">${Number(minutes)} min</div>`,
    iconSize: [0, 0], // the pill centres itself with CSS
  })
}

// Round pin for an incident (Incident Queue): a solid-colour badge with the incident type's icon, styled like createVolIcon.
//   icon     : a Bootstrap icon class, e.g. 'bi-exclamation-circle-fill'
//   severity : 'high' | 'medium' | 'low'  -> red / amber / blue
//   status   : 'resolved' always shows green, whatever the severity; 'new' (not acknowledged yet) makes the pin pulse
//   selected : true adds a ring around the pin (the incident chosen in the list)
//   dimmed   : true gives a lighter shade (an incident that is not the focused one, as with the dimmed school pins)
// The colours live in src/assets/map-ui.css (.incident-pin).
export function createIncidentIcon({ icon, severity, status, selected = false, dimmed = false }) {
  const colour = status === 'resolved' ? 'severity-resolved' : `severity-${severity}`
  return L.divIcon({
    className: `incident-pin ${colour}${status === 'new' ? ' is-new' : ''}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`, // is-new = not acknowledged yet: the pin pulses
    html: `<i class="bi ${icon}"></i>`,
    iconSize: [34, 34], // same size as the volunteer badge
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -18], // lifts the hover card above the pin
  })
}

/* ---------------------------- tooltips --------------------------- */

// Tooltip card: icon badge + title. Built with the DOM so names can't inject HTML.
// tone picks the badge colour: me | dest | school | live | stale | offline
export function tipCard({ icon, tone, title }) {
  const el = document.createElement('div')
  el.className = 'tip'

  const badge = document.createElement('div')
  badge.className = `tip-icon ${tone}`
  const i = document.createElement('i')
  i.className = `bi ${icon}`
  badge.appendChild(i)

  const t = document.createElement('div')
  t.className = 'tip-title'
  t.textContent = title

  el.append(badge, t)
  return el
}

export const volTip = (v) => tipCard({ icon: 'bi-person-fill', tone: v.status, title: v.name })
export const schoolTip = (s) =>
  tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: s.name || 'School' })

// Attaches a tooltip card to a marker, replacing any it already has.
// pinned = stays open until rebound; otherwise hover/tap only.
export function bindTip(marker, content, { pinned = false, direction = 'top' } = {}) {
  marker.unbindTooltip()
  marker.bindTooltip(content, {
    className: 'hq-tip',
    direction,
    offset: [0, direction === 'bottom' ? 26 : -6], // keeps the card clear of the marker
    opacity: 1,
    permanent: pinned,
  })
  if (pinned) marker.openTooltip()
}