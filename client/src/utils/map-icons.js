// Builds the Leaflet pins (volunteer, school, destination, dots, route label and incident) and their
// hover cards.

import L from 'leaflet'

// createVolIcon(status) - round volunteer marker. Builds a Leaflet divIcon whose HTML is <div
// class="vol-dot live|stale|offline"> holding a Bootstrap Icon (bi-person-fill). CUSTOM CSS:
// .vol-marker / .vol-dot (+ .live .stale .offline colours) are defined in assets/map-ui.css.
export function createVolIcon(status) {
  return L.divIcon({
    className: 'vol-marker',
    html: `<div class="vol-dot ${status}"><i class="bi bi-person-fill"></i></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -18],
  })
}

// createSchoolIcon({ dimmed }) - indigo school badge with a graduation-cap icon. CUSTOM CSS:
// .school-marker / .school-badge (+ .dimmed for the lighter shade) in assets/map-ui.css.
export function createSchoolIcon({ dimmed = false } = {}) {
  return L.divIcon({
    className: 'school-marker',
    html: `<div class="school-badge${dimmed ? ' dimmed' : ''}"><i class="bi bi-mortarboard-fill"></i></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    tooltipAnchor: [0, -20],
  })
}

// createDestIcon() - red location pin on a grey dot (a destination such as Padang). iconAnchor is the
// pin tip so the tip sits on the real coordinate. CUSTOM CSS: .dest-marker / .dest-pin / .dest-dot in
// assets/map-ui.css.
export function createDestIcon() {
  return L.divIcon({
    className: 'dest-marker',
    html: `
      <div class="dest-pin">
        <span class="dest-dot"></span>
        <i class="bi bi-geo-alt-fill"></i>
      </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 32],
    tooltipAnchor: [0, -34],
  })
}

// createDotIcon() - blue "you are here" dot with a hidden heading cone. CUSTOM CSS: .me-dot,
// .me-dot-wrap, .me-dot-cone, .me-dot-core in assets/map-ui.css (TrackingView rotates the cone).
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

// createRouteLabelIcon(minutes) - the "xx min" pill drawn on a route line. Number() guarantees only a
// number is written into the HTML. CUSTOM CSS: .route-label / .route-label-pill.
export function createRouteLabelIcon(minutes) {
  return L.divIcon({
    className: 'route-label',
    html: `<div class="route-label-pill">${Number(minutes)} min</div>`,
    iconSize: [0, 0],
  })
}

// createIncidentIcon({ icon, severity, status, selected, dimmed }) - round incident pin. 1) colour
// class = severity-resolved when resolved, otherwise severity-high / medium / low 2) add is-new
// (pulses) when not yet acknowledged, is-selected (ring), is-dimmed (lighter) 3) inside it a Bootstrap
// Icon. CUSTOM CSS: .incident-pin and its modifiers in assets/map-ui.css.
export function createIncidentIcon({ icon, severity, status, selected = false, dimmed = false }) {
  const colour = status === 'resolved' ? 'severity-resolved' : `severity-${severity}`
  return L.divIcon({
    className: `incident-pin ${colour}${status === 'new' ? ' is-new' : ''}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`,
    html: `<i class="bi ${icon}"></i>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -18],
  })
}

// tipCard({ icon, tone, title }) - builds the small hover card with the DOM (not an HTML string) so a
// name can never inject HTML. 1) .tip wrapper 2) .tip-icon + tone colour with a Bootstrap Icon 3)
// .tip-title text. CUSTOM CSS: .tip, .tip-icon, .tip-title (assets/map-ui.css).
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

// volTip(v) - tooltip card for a volunteer: person icon, colour from their status, their name.
export const volTip = (v) => tipCard({ icon: 'bi-person-fill', tone: v.status, title: v.name })
// schoolTip(s) - tooltip card for a school: graduation-cap icon, school colour, school name (or
// "School").
export const schoolTip = (s) =>
  tipCard({ icon: 'bi-mortarboard-fill', tone: 'school', title: s.name || 'School' })

// bindTip(marker, content, { pinned, direction }) - attaches a tooltip card to a map marker. 1) remove
// any tooltip it already has 2) bind the new one with CSS class "hq-tip" (CUSTOM CSS in map-ui.css) 3)
// offset it so it clears the marker 4) pinned = stays open permanently, otherwise hover/tap only.
export function bindTip(marker, content, { pinned = false, direction = 'top' } = {}) {
  marker.unbindTooltip()
  marker.bindTooltip(content, {
    className: 'hq-tip',
    direction,
    offset: [0, direction === 'bottom' ? 26 : -6],
    opacity: 1,
    permanent: pinned,
  })
  if (pinned) marker.openTooltip()
}