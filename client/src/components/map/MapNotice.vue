<script setup>
// Popup card for info + error messages. Put it inside .map-stage.
//   <MapNotice :notice="notice" @close="dismissNotice" />
//   notice = { type: 'error' | 'info', icon: 'bi-...', title, text } or null
// Per-view position: set --notice-top on .map-stage (default 56px). Always centred sideways (top-centre).
defineProps({
  notice: { type: Object, default: null },
  closable: { type: Boolean, default: true },
})
defineEmits(['close'])
</script>

<template>
  <div class="notice-wrap">
    <!-- E2E: data-testid="notice" below lets Playwright find this popup (Login + Register error tests use it).
         This comment sits outside <Transition> on purpose: Transition wants exactly ONE element inside it. -->
    <Transition name="notice">
      <div
        v-if="notice"
        :key="notice.type + notice.text"
        data-testid="notice"
        class="notice"
        :class="notice.type"
        :role="notice.type === 'error' ? 'alert' : 'status'"
      >
        <div class="notice-icon" aria-hidden="true"><i class="bi" :class="notice.icon"></i></div>
        <div class="notice-body">
          <div class="notice-title">{{ notice.title }}</div>
          <div class="notice-text">{{ notice.text }}</div>
        </div>
        <button v-if="closable" type="button" class="notice-close" aria-label="Dismiss message" @click="$emit('close')">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.notice-wrap {
  position: absolute;
  top: var(--notice-top, 56px); /* top-centre: this distance from the top keeps it clear of the navbar */
  left: 12px;
  right: 12px;
  z-index: 1150; /* above the loading overlay so errors stay visible */
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.notice {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 420px;
  padding: 10px 8px 10px 12px;
  background: #fff;
  color: #1f2430; /* CHANGED: dark text on this fixed-white panel; without it the text follows the dark theme and turns pale */
  border-radius: 14px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
}
.notice.error { border: 1px solid #f5c2c0; }
.notice-icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0fe;
  color: #1a73e8;
  font-size: 1.1rem;
}
.notice.error .notice-icon { background: #fce8e6; color: #d93025; }
.notice-body { flex: 1 1 auto; min-width: 0; }
.notice-title { font-size: 0.9rem; font-weight: 600; line-height: 1.2; }
.notice-text { margin-top: 2px; font-size: 0.8rem; line-height: 1.3; color: #666; }
.notice-close {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #777;
}
.notice-close:hover { background: #f1f3f6; }

.notice-enter-active,
.notice-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.notice-enter-from,
.notice-leave-to { transform: translateY(-12px); opacity: 0; }

/* CHANGED: take the leaving notice out of the row while it fades out.
   Before, "Allocating..." (leaving) and "Allocation done" (entering) sat side by side in the centred row,
   so the new card started right of centre and slid left when the old one vanished.
   With position: absolute the old card fades out in place (still centred) and the new card appears centred straight away. */
.notice-leave-active { position: absolute; }

/* CHANGED: removed the old desktop (min-width: 992px) rule that moved this popup to the top-right.
   .notice-wrap above already centres it sideways (left/right 12px + justify-content: center), so it is top-centre on every screen size. */
</style>
