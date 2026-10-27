<!--
  CheckpointDrill.vue
  A live "ops board": class groups move along the route through checkpoints.
  Press "Run the drill" and Group 3B misses CP3; the line under the board's
  header narrates how the ops room responds, step by step, until the group
  is checked back in.

  The parent can start it with a template ref:  drill.value.run()

  The checkpoints and the response steps below are sample content.
  Swap them for your team's real route and incident procedure.
-->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const checkpoints = [
  { id: 'CP1', name: 'Arrival gate', at: 8 },
  { id: 'CP2', name: 'Bag check', at: 29 },
  { id: 'CP3', name: 'Concourse', at: 50 },
  { id: 'CP4', name: 'Stand entry', at: 71 },
  { id: 'CP5', name: 'Seated', at: 92 },
]

const legend = [
  { status: 'ok', label: 'On route' },
  { status: 'missing', label: 'Missed a checkpoint' },
  { status: 'returning', label: 'Being walked back' },
  { status: 'cleared', label: 'Checked in' },
]

const MISS_GROUP = '3B'
const MISS_CP = 'CP3'
const SPEED = 1.6 // % of the route per second
const SIM_RATE = 20 // simulated seconds per real second
const IDLE_TEXT = 'Run the drill to see how the ops room responds.'

const groups = ref([
  { id: '1A', pos: 80, status: 'ok' },
  { id: '2C', pos: 58, status: 'ok' },
  { id: '3B', pos: 36, status: 'ok' },
  { id: '4D', pos: 14, status: 'ok' },
])

const phase = ref('idle') // idle | watching | alert | resolved
const update = ref({ id: 0, text: IDLE_TEXT, tone: 'info' }) // the latest ops update
const simSeconds = ref(9 * 3600 + 41 * 60)
const root = ref(null)

let rafId = 0
let lastTime = 0
let timers = []
let missedAt = 0
let nextId = 1
let reduceMotion = false
let observer = null

const busy = computed(() => phase.value === 'watching' || phase.value === 'alert')
const clock = computed(() => formatTime(simSeconds.value))
const onRoute = computed(() => groups.value.filter((g) => g.status !== 'missing').length)

const statusLabel = computed(() => {
  if (phase.value === 'watching') return `Watching Group ${MISS_GROUP}`
  if (phase.value === 'alert') return `Group ${MISS_GROUP} missed ${MISS_CP}`
  if (phase.value === 'resolved') return 'Incident closed'
  return 'All groups on route'
})

const runLabel = computed(() => (phase.value === 'resolved' ? 'Run it again' : 'Run the drill'))

function formatTime(total) {
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function wrap(pos) {
  return ((((pos - 3) % 94) + 94) % 94) + 3
}

// fade chips in and out at the ends of the route
function chipStyle(group) {
  const p = group.pos
  const opacity = p < 6 ? (p - 3) / 3 : p > 94 ? (97 - p) / 3 : 1
  return { left: p + '%', opacity: Math.max(0, Math.min(1, opacity)) }
}

function cpClass(cp) {
  if (cp.id !== MISS_CP) return {}
  return { 'is-alert': phase.value === 'alert', 'is-cleared': phase.value === 'resolved' }
}

// show a new ops update (a new id makes the old line fade out and the new one fade in)
function say(text, tone = 'info') {
  update.value = { id: nextId++, text, tone }
}

function later(ms, fn) {
  timers.push(setTimeout(fn, ms))
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

function run() {
  if (busy.value) return
  clearTimers()

  // shift the whole board so 3B is just before CP3
  const target = groups.value.find((g) => g.id === MISS_GROUP)
  const delta = 41 - target.pos
  groups.value.forEach((g) => {
    g.pos = wrap(g.pos + delta)
    g.status = 'ok'
  })

  phase.value = 'watching'
  say(`Drill started. Group ${MISS_GROUP} is heading for ${MISS_CP} Concourse.`)
}

function onMissed(group) {
  group.status = 'missing'
  phase.value = 'alert'
  missedAt = simSeconds.value
  say(`Group ${MISS_GROUP} missed ${MISS_CP}. No check-in in the expected window.`, 'alert')

  later(1300, () => say(`Ops room alerted. Group ${MISS_GROUP}'s buddy and the ${MISS_CP} marshal are pinged.`))
  later(2600, () => say('Buddy replies: took the wrong stairwell. Everyone is together.'))
  later(3900, () => {
    say(`${MISS_CP} marshal meets the group and walks them back.`)
    group.status = 'returning'
  })
}

function onResolved(group) {
  group.status = 'cleared'
  phase.value = 'resolved'
  const minutes = Math.max(1, Math.round((simSeconds.value - missedAt) / 60))
  say(`Group ${MISS_GROUP} checked in at ${MISS_CP}. Incident closed in ${minutes} min.`, 'ok')
  later(2500, () => {
    if (group.status === 'cleared') group.status = 'ok'
  })
}

function reset() {
  clearTimers()
  phase.value = 'idle'
  groups.value.forEach((g) => (g.status = 'ok'))
  say(IDLE_TEXT)
}

function tick(now) {
  rafId = requestAnimationFrame(tick)
  const dt = Math.min((now - (lastTime || now)) / 1000, 0.1)
  lastTime = now
  simSeconds.value += dt * SIM_RATE

  // with reduced motion, groups only move while the drill is running
  if (reduceMotion && phase.value === 'idle') return

  for (const g of groups.value) {
    if (g.status === 'missing') continue
    // a group being walked back moves a little faster
    const speed = g.status === 'returning' ? SPEED * 2.2 : SPEED
    g.pos = wrap(g.pos + speed * dt)

    if (g.id !== MISS_GROUP) continue
    if (phase.value === 'watching' && g.pos >= 45 && g.pos < 50) onMissed(g)
    else if (g.status === 'returning' && g.pos >= 50) onResolved(g)
  }
}

function startLoop() {
  if (rafId) return
  lastTime = 0
  rafId = requestAnimationFrame(tick)
}

function stopLoop() {
  cancelAnimationFrame(rafId)
  rafId = 0
}

defineExpose({ run })

onMounted(() => {
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // only animate while the board is on screen
  // (use the latest entry: the browser can deliver several at once while the page is loading)
  observer = new IntersectionObserver((entries) => (entries[entries.length - 1].isIntersecting ? startLoop() : stopLoop()))
  observer.observe(root.value)
})

onUnmounted(() => {
  stopLoop()
  clearTimers()
  observer?.disconnect()
})
</script>

<template>
  <div ref="root" class="board" :class="'phase-' + phase">
    <div class="board-head">
      <span class="status-dot" aria-hidden="true"></span>
      <strong class="status-text">{{ statusLabel }}</strong>
      <span class="board-meta ms-auto">
        <span class="d-none d-sm-inline">On route {{ onRoute }}/{{ groups.length }}</span>
        <span class="clock">{{ clock }}</span>
      </span>
    </div>

    <!-- the latest ops update, read out by screen readers as it changes -->
    <div class="update-wrap" aria-live="polite">
      <Transition name="update" mode="out-in">
        <p :key="update.id" class="update" :class="'tone-' + update.tone">{{ update.text }}</p>
      </Transition>
    </div>

    <div class="route" aria-hidden="true">
      <div class="route-line"></div>

      <div v-for="cp in checkpoints" :key="cp.id" class="cp" :class="cpClass(cp)" :style="{ left: cp.at + '%' }">
        <span class="cp-dot"></span>
        <span class="cp-id">{{ cp.id }}</span>
        <span class="cp-name d-none d-md-block">{{ cp.name }}</span>
      </div>

      <div
        v-for="group in groups"
        :key="group.id"
        class="chip"
        :class="['is-' + group.status, { 'is-target': group.id === MISS_GROUP && phase !== 'idle' }]"
        :style="chipStyle(group)"
      >
        {{ group.id }}
      </div>
    </div>

    <div class="board-foot mt-auto">
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-hw btn-shine px-4" :disabled="busy" @click="run">
          {{ runLabel }}
        </button>
        <button type="button" class="btn btn-ghost" :disabled="busy || phase === 'idle'" @click="reset">Reset</button>
      </div>
      <ul class="legend list-unstyled mb-0">
        <li v-for="item in legend" :key="item.status">
          <span class="key" :class="'key-' + item.status" aria-hidden="true"></span>{{ item.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* a faint grid, like an ops map */
.board {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  border: 1px solid rgba(244, 246, 251, 0.1);
  padding: 1rem 1.25rem;
  background:
    linear-gradient(rgba(244, 246, 251, 0.035) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgba(244, 246, 251, 0.035) 1px, transparent 1px) 0 0 / 32px 32px,
    #0f1730;
  transition: box-shadow 0.4s ease, border-color 0.4s ease;
}

.board.phase-alert {
  border-color: rgba(239, 51, 64, 0.6);
  box-shadow: 0 0 0 4px rgba(239, 51, 64, 0.12), 0 20px 60px -20px rgba(239, 51, 64, 0.5);
}

.board-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.18);
}

.phase-watching .status-dot {
  background: #ffc857;
  box-shadow: 0 0 0 4px rgba(255, 200, 87, 0.2);
}

.phase-alert .status-dot {
  background: #ef3340;
  animation: hw-beacon 1s ease-in-out infinite;
}

@keyframes hw-beacon {
  50% {
    box-shadow: 0 0 0 8px rgba(239, 51, 64, 0);
  }
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 51, 64, 0.6);
  }
}

.status-text {
  font-weight: 600;
}

.board-meta {
  display: flex;
  gap: 1rem;
  color: #a3adc8;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}

.clock {
  color: #ffc857;
  font-weight: 600;
}

/* Latest ops update */
.update-wrap {
  margin-top: 0.6rem;
  min-height: 1.6rem;
}

.update {
  margin: 0;
  padding: 0.1rem 0 0.1rem 0.7rem;
  border-left: 3px solid rgba(244, 246, 251, 0.2);
  font-size: 0.9rem;
  line-height: 1.35;
  color: #c9cfe2;
}

.update.tone-alert {
  border-left-color: #ef3340;
  color: #ffb3b9;
}

.update.tone-ok {
  border-left-color: #34d399;
  color: #a7f3d0;
}

.update-enter-active,
.update-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.update-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.update-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Route */
.route {
  position: relative;
  height: 124px;
  margin: 0.5rem 0.5rem 0.5rem;
}

.route-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 70px;
  height: 4px;
  border-radius: 4px;
  background: repeating-linear-gradient(90deg, rgba(244, 246, 251, 0.28) 0 14px, rgba(244, 246, 251, 0.08) 14px 24px);
  background-size: 24px 4px;
  animation: hw-flow 1.2s linear infinite;
}

@keyframes hw-flow {
  to {
    background-position: 24px 0;
  }
}

.cp {
  position: absolute;
  top: 70px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cp-dot {
  width: 18px;
  height: 18px;
  margin-top: -7px;
  border-radius: 50%;
  background: #0f1730;
  border: 3px solid #a3adc8;
  transition: border-color 0.3s ease, background 0.3s ease;
}

.cp-id {
  margin-top: 0.4rem;
  font-weight: 700;
  font-size: 0.78rem;
}

.cp-name {
  font-size: 0.72rem;
  color: #a3adc8;
  white-space: nowrap;
}

.cp.is-alert .cp-dot {
  border-color: #ef3340;
  background: #ef3340;
  animation: hw-beacon 1s ease-in-out infinite;
}

.cp.is-alert .cp-id {
  color: #ff8a94;
}

.cp.is-cleared .cp-dot {
  border-color: #34d399;
  background: #34d399;
}

/* Group chips */
.chip {
  position: absolute;
  top: 20px;
  transform: translateX(-50%);
  padding: 0.28rem 0.6rem;
  border-radius: 999px;
  background: #f4f6fb;
  color: #0a1024;
  font-weight: 700;
  font-size: 0.8rem;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.6);
  transition: transform 0.6s cubic-bezier(0.3, 1.4, 0.5, 1), background-color 0.3s ease, color 0.3s ease;
}

/* little stem from the chip down to the route line */
.chip::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 2px;
  height: 24px;
  margin-left: -1px;
  background: currentColor;
  opacity: 0.35;
  transition: opacity 0.3s ease;
}

.chip.is-target {
  outline: 2px solid #ffc857;
  outline-offset: 3px;
}

.chip.is-missing {
  background: #ef3340;
  color: #fff;
  transform: translate(-50%, -16px) rotate(-6deg);
  animation: hw-shake 0.5s ease 1, hw-beacon 1s ease-in-out 0.5s infinite;
}

.chip.is-missing::after {
  opacity: 0;
}

.chip.is-returning {
  background: #ffc857;
  color: #0a1024;
}

.chip.is-cleared {
  background: #34d399;
  color: #0a1024;
}

@keyframes hw-shake {
  20%,
  60% {
    margin-left: -4px;
  }
  40%,
  80% {
    margin-left: 4px;
  }
}

/* Buttons + legend share one row on laptops */
.board-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.25rem;
}

/* two short rows, so it sits beside the buttons without adding height */
.legend {
  display: grid;
  grid-template-columns: repeat(2, auto);
  gap: 0.2rem 0.9rem;
  font-size: 0.78rem;
  color: #a3adc8;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.key {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f4f6fb;
}

.key-missing {
  background: #ef3340;
}

.key-returning {
  background: #ffc857;
}

.key-cleared {
  background: #34d399;
}

@media (max-width: 575.98px) {
  .chip {
    font-size: 0.72rem;
    padding: 0.25rem 0.5rem;
  }
  .cp-id {
    font-size: 0.7rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-line,
  .chip.is-missing,
  .cp.is-alert .cp-dot,
  .phase-alert .status-dot {
    animation: none;
  }
  .chip,
  .update-enter-active,
  .update-leave-active {
    transition: none;
  }
}
</style>