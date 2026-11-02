<!-- The volunteer's My Badges page (F6): the badges earned and the ones still locked. -->

<script setup>
// Loads the badge list and the volunteer's awards, splits them into earned and locked, and refreshes
// the awards live when HQ gives a badge (socket "badges:updated").

import { ref, onMounted, onUnmounted, computed } from 'vue'
import PageLoading from '@/components/common/PageLoading.vue'
import { listBadges, getMyBadges } from '@/services/badges'
import { connectSocket } from '@/services/socket'

const badges = ref([])
const myAwards = ref([])
const error = ref('')

// awardFor(code) - finds my award for a badge code, or undefined if I have not earned it. The popup
// and both lists use this to decide earned or locked.
function awardFor(code) {
  return myAwards.value.find(a => a.badge?.code === code)
}

const selected = ref(null)

// earnedBadges (computed) - all badges I have an award for.
const earnedBadges = computed(() => badges.value.filter(b => awardFor(b.code)))
// lockedBadges (computed) - all badges I do not have yet.
const lockedBadges = computed(() => badges.value.filter(b => !awardFor(b.code)))

const loading = ref(true)

// onMounted - load the badge list and the volunteer's awards together; if either fails show a friendly
// message, but still show whatever did load.
onMounted(async () => {
  const [listResult, awardsResult] = await Promise.allSettled([listBadges(), getMyBadges()])
  if (listResult.status === 'fulfilled') badges.value = listResult.value
  if (awardsResult.status === 'fulfilled') myAwards.value = awardsResult.value
  const failed = [listResult, awardsResult].find((r) => r.status === 'rejected')
  if (failed) {
    error.value = failed.reason?.friendlyMessage || 'Something went wrong. Please try again.'
    console.error(failed.reason)
  }
  loading.value = false
})

let socket = null
// refreshAwards() - reloads my awards in the background when HQ gives me a badge (socket
// "badges:updated"), the connection comes back or the tab becomes visible. 1) skip while the tab is
// hidden 2) fetch my awards 3) on failure only log it.
async function refreshAwards() {
  if (document.visibilityState !== 'visible') return
  try {
    myAwards.value = await getMyBadges()
  } catch (e) {
    console.error(e)
  }
}
// onMounted (second) - connect the socket and refresh my awards on "badges:updated", on reconnect and
// when the tab becomes visible.
onMounted(() => {
  socket = connectSocket()
  socket.on('badges:updated', refreshAwards)
  socket.io.on('reconnect', refreshAwards)
  document.addEventListener('visibilitychange', refreshAwards)
})
// onUnmounted - remove the three live listeners so a closed page no longer refreshes.
onUnmounted(() => {
  socket?.off('badges:updated', refreshAwards)
  socket?.io.off('reconnect', refreshAwards)
  document.removeEventListener('visibilitychange', refreshAwards)
})
</script>

<template>
  <!-- The earned badges with their message, the locked badges and the error message. -->
  <section class="badges-page" :class="{ 'is-loading': loading }" @keydown.esc="selected = null">
    <Transition name="loading-fade">
      <PageLoading v-if="loading" contained text="Fetching Your Badges..." />
    </Transition>
    <div v-if="error" class="alert alert-danger d-flex align-items-start gap-2" role="alert">
      <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
      <div>{{ error }}</div>
    </div>

    <template v-else-if="!loading">
      <div class="card-hw progress-card p-3 p-lg-4">
        <div class="progress-main">
          <div class="ring" role="img" :aria-label="`${earnedBadges.length} of ${badges.length} badges earned`">
            <svg viewBox="0 0 100 100" class="ring-svg" aria-hidden="true">
              <defs>
                <linearGradient id="ring-red" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#ff5a68" />
                  <stop offset="100%" stop-color="#a80016" />
                </linearGradient>
              </defs>
              <circle v-for="(b, i) in badges" :key="b.code" cx="50" cy="50" r="40" pathLength="100"
                      class="ring-seg" :class="{ filled: i < earnedBadges.length }" :style="{ '--i': i }"
                      :stroke-dasharray="`${100 / badges.length - 3} 100`"
                      :stroke-dashoffset="-(i * 100) / badges.length" />
            </svg>
            <div class="ring-label" aria-hidden="true">
              <span class="ring-number">{{ earnedBadges.length }}</span><span class="ring-total">/{{ badges.length }}</span>
            </div>
          </div>
          <div>
            <div class="progress-headline">
              {{ earnedBadges.length }} {{ earnedBadges.length === 1 ? 'badge' : 'badges' }} earned
            </div>
            <div class="small text-muted-hw">
              <template v-if="earnedBadges.length === 0">Your first badge comes after your NE Show.</template>
              <template v-else-if="lockedBadges.length === 0">Full set collected. Thank you!</template>
              <template v-else>{{ lockedBadges.length }} more to collect. Keep going!</template>
            </div>
          </div>
        </div>
        <RouterLink to="/volunteer/badge-studio" class="btn btn-brand" data-testid="badges-design-link">
          <i class="bi bi-palette me-2" aria-hidden="true"></i>Design my badge
        </RouterLink>
      </div>

      <div data-testid="badge-wall">
        <h2 class="section-title">Earned <span class="section-count">{{ earnedBadges.length }}</span></h2>
        <div v-if="earnedBadges.length === 0" class="empty-earned">
          <i class="bi bi-award" aria-hidden="true"></i>
          <div>
            <div class="fw-semibold">No badges yet</div>
            <div class="small text-muted-hw">Badges are given out after your NE Show. Here's what you can earn.</div>
          </div>
        </div>
        <div v-else class="badge-grid">
          <button v-for="(b, i) in earnedBadges" :key="b.code" type="button" class="badge-tile is-earned"
                  :style="{ '--i': i }" :data-testid="'badge-' + b.code" @click="selected = b">
            <span class="medal" aria-hidden="true"><i :class="['bi', b.icon]"></i></span>
            <span class="badge-name">{{ b.name }}</span>
            <span class="badge-state earned"><i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>Earned</span>
          </button>
        </div>

        <template v-if="lockedBadges.length > 0">
          <h2 class="section-title">Still to earn <span class="section-count">{{ lockedBadges.length }}</span></h2>
          <div class="badge-grid">
            <button v-for="b in lockedBadges" :key="b.code" type="button" class="badge-tile is-locked"
                    :data-testid="'badge-' + b.code" @click="selected = b">
              <span class="medal" aria-hidden="true">
                <i :class="['bi', b.icon]"></i>
                <span class="medal-lock"><i class="bi bi-lock-fill"></i></span>
              </span>
              <span class="badge-name">{{ b.name }}</span>
              <span class="badge-how">{{ b.description }}</span>
            </button>
          </div>
        </template>
      </div>
    </template>

    <Teleport to="body">
    <div v-if="selected" class="modal d-block hw-modal" tabindex="-1" role="dialog" aria-modal="true"
         aria-labelledby="badge-modal-title" data-testid="badge-modal" @click.self="selected = null">
      <div class="modal-dialog">
        <div class="modal-content badge-modal">
          <button type="button" class="btn-close" aria-label="Close" data-testid="badge-modal-close" @click="selected = null"></button>
          <div class="modal-body text-center px-4 pt-4 pb-4">
            <span class="medal medal-lg" :class="awardFor(selected.code) ? 'is-earned' : 'is-locked'" aria-hidden="true">
              <i :class="['bi', selected.icon]"></i>
              <span v-if="!awardFor(selected.code)" class="medal-lock"><i class="bi bi-lock-fill"></i></span>
            </span>
            <h2 id="badge-modal-title" class="h5 mt-3 mb-1">{{ selected.name }}</h2>
            <p class="text-muted-hw mb-3">{{ selected.description }}</p>

            <template v-if="awardFor(selected.code)">
              <span class="state-pill earned">
                <i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>Earned<template v-if="awardFor(selected.code).event"> at {{ awardFor(selected.code).event }}</template>
              </span>
              <figure v-if="awardFor(selected.code).message" class="thank-you mt-3 mb-0">
                <blockquote class="mb-1">{{ awardFor(selected.code).message }}</blockquote>
                <figcaption class="small text-muted-hw">From the Heartware team</figcaption>
              </figure>
            </template>
            <span v-else class="state-pill locked">
              <i class="bi bi-lock-fill me-1" aria-hidden="true"></i>Not earned yet
            </span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="selected" class="modal-backdrop show hw-backdrop"></div>
    </Teleport>
  </section>
</template>

<style scoped>
/* Styles for the badge tiles. */

.badges-page {
  position: relative;
  --tint: rgb(20 33 61 / 0.08);
  --dash: #c3c8d2;
}
.badges-page.is-loading {
  min-height: calc(100vh - 128px);
}
[data-bs-theme='dark'] .badges-page {
  --tint: rgb(255 255 255 / 0.08);
  --dash: #4a5570;
}

.progress-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  margin-bottom: 2rem;
}
.progress-main {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.ring {
  position: relative;
  flex-shrink: 0;
  width: 92px;
  height: 92px;
}
.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-seg {
  fill: none;
  stroke: var(--bs-border-color);
  stroke-width: 10;
}
.ring-seg.filled {
  stroke: url(#ring-red);
}
.ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding-top: 30px;
  line-height: 1;
}
.ring-number {
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.ring-total {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--hw-muted);
}
.progress-headline {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--hw-heading);
  line-height: 1.2;
  margin-bottom: 0.2rem;
}
@media (max-width: 575.98px) {
  .ring {
    width: 76px;
    height: 76px;
  }
  .ring-label {
    padding-top: 24px;
  }
  .ring-number {
    font-size: 1.5rem;
  }
  .progress-card .btn {
    width: 100%;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.9rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--hw-heading);
}
.section-count {
  display: inline-grid;
  place-items: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: var(--tint);
  font-size: 0.8rem;
  font-weight: 700;
}
.badge-grid + .section-title,
.empty-earned + .section-title {
  margin-top: 2.25rem;
}
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}
@media (min-width: 992px) {
  .badge-grid {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  }
}

.badge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 1.25rem 0.75rem 1rem;
  border: 1.5px solid var(--bs-border-color);
  border-radius: var(--hw-radius);
  background: var(--hw-surface);
  color: var(--hw-text);
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.badge-tile:hover {
  transform: translateY(-3px);
  box-shadow: var(--hw-shadow);
}
.badge-tile:focus-visible {
  outline: 2px solid var(--hw-heading);
  outline-offset: 2px;
}
.badge-tile.is-locked {
  border-style: dashed;
  border-color: var(--dash);
  background: transparent;
}
.badge-name {
  font-weight: 600;
  line-height: 1.25;
}
.badge-state,
.badge-how {
  font-size: 0.8rem;
  line-height: 1.35;
}
.badge-state.earned {
  color: var(--hw-success);
  font-weight: 600;
}
.badge-how {
  color: var(--hw-muted);
}

.medal {
  position: relative;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  font-size: 1.6rem;
  line-height: 1;
}
.is-earned .medal,
.medal.is-earned {
  overflow: hidden;
  color: #fff;
  background: radial-gradient(circle at 32% 28%, #ff5a68 0%, var(--hw-red) 55%, var(--hw-red-dark) 100%);
  box-shadow:
    0 0 0 4px rgb(214 0 28 / 0.12),
    0 6px 14px rgb(214 0 28 / 0.28);
}
.is-locked .medal,
.medal.is-locked {
  color: var(--hw-muted);
  background: var(--hw-surface);
  border: 2px dashed var(--dash);
}
.medal-lock {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--hw-heading);
  color: var(--hw-surface);
  font-size: 0.7rem;
  box-shadow: 0 0 0 2px var(--hw-surface);
}
.medal-lg {
  margin: 0 auto;
  width: 96px;
  height: 96px;
  font-size: 2.4rem;
}
.medal-lg .medal-lock {
  width: 30px;
  height: 30px;
  font-size: 0.85rem;
}
.empty-earned {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border: 1.5px dashed var(--bs-border-color);
  border-radius: var(--hw-radius);
}
.empty-earned > i {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--hw-muted);
}

.hw-modal {
  z-index: 1300;
  overflow-y: auto;
  --tint: rgb(20 33 61 / 0.08);
  --dash: #c3c8d2;
}
[data-bs-theme='dark'] .hw-modal {
  --tint: rgb(255 255 255 / 0.08);
  --dash: #4a5570;
}
.hw-backdrop {
  z-index: 1290;
}
.badge-modal {
  position: relative;
  border: 0;
  border-radius: var(--hw-radius);
  background: var(--hw-surface);
  box-shadow: 0 20px 50px rgb(20 33 61 / 0.25);
}
.badge-modal .btn-close {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  z-index: 1;
}
.state-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
}
.state-pill.earned {
  background: rgb(26 127 75 / 0.1);
  color: var(--hw-success);
}
.state-pill.locked {
  background: var(--tint);
  color: var(--hw-heading);
}
.thank-you {
  padding: 1rem 1.25rem;
  border-left: 3px solid var(--hw-red);
  border-radius: 0.5rem;
  background: var(--hw-bg);
  text-align: left;
}
.thank-you blockquote {
  font-style: italic;
}

.is-earned .medal::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 35%, rgb(255 255 255 / 0.55) 50%, transparent 65%);
  transform: translateX(-120%);
}

@media (prefers-reduced-motion: no-preference) {
  .ring-seg.filled {
    animation: ring-draw 0.45s ease-out both;
    animation-delay: calc(var(--i) * 0.15s + 0.1s);
  }
  .badge-tile.is-earned .medal {
    animation: medal-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    animation-delay: calc(var(--i) * 0.12s + 0.2s);
  }
  .badge-tile.is-earned .medal::after {
    animation: medal-shine 0.9s ease-in-out backwards;
    animation-delay: calc(var(--i) * 0.12s + 0.6s);
  }
  .badge-tile.is-earned:hover .medal::after {
    transform: translateX(120%);
    transition: transform 0.9s ease-in-out;
  }
  .badge-modal {
    animation: modal-in 0.2s ease-out;
  }
  .badge-modal .medal.is-earned {
    animation: medal-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
}
@media (prefers-reduced-motion: reduce) {
  .badge-tile,
  .badge-tile:hover {
    transition: none;
    transform: none;
  }
}
@keyframes ring-draw {
  from {
    stroke-dasharray: 0 100;
  }
}
@keyframes medal-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
}
@keyframes medal-shine {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
}
@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
</style>
