<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useChatStore } from '@/services/chat'
import ChatThreadList from './ChatThreadList.vue'
import ChatConversation from './ChatConversation.vue'

const chat = useChatStore()
const panel = ref(null) // the panel element, used to tell inside clicks from outside clicks

// This component only exists while someone is logged in (see AppNavbar), so mounting = log in, unmounting = log out.
// That is what opens and closes the live connection.
onMounted(() => {
  chat.start()
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onPointerDown)
})
onUnmounted(() => {
  chat.stop()
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onPointerDown)
})

// Click or tap anywhere outside the open panel closes it. pointerdown covers mouse, touch and pen.
// The navbar chat button is skipped: it has its own toggle, and closing here first would make it re-open.
function onPointerDown(e) {
  if (!chat.isOpen || !panel.value) return
  const path = e.composedPath()
  if (path.includes(panel.value)) return
  if (path.some((el) => el.dataset?.chatToggle !== undefined)) return
  chat.close()
}

function onKeydown(e) {
  if (e.key === 'Escape' && chat.isOpen) chat.close()
}
</script>

<template>
  <!-- Teleport puts the panel at the end of <body> so the navbar's stacking can't clip it -->
  <Teleport to="body">
    <Transition name="chat-pop">
      <section
        v-if="chat.isOpen"
        ref="panel"
        class="chat-panel"
        role="dialog"
        aria-label="Chat"
        data-testid="chat-panel"
      >
        <!-- HQ sees the list of volunteers first; volunteers go straight to their one chat -->
        <ChatThreadList v-if="chat.isAdmin && chat.activeId === null" />
        <ChatConversation v-else />
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.chat-panel {
  position: fixed;
  top: 3.75rem; /* just under the navbar */
  right: 1rem;
  width: min(24rem, calc(100vw - 2rem));
  height: min(34rem, calc(100vh - 5rem));
  display: flex;
  flex-direction: column;
  background: var(--bs-body-bg, #fff);
  border: 1px solid var(--bs-border-color, #dee2e6);
  border-radius: 0.75rem;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.22);
  overflow: hidden;
  z-index: 1190; /* the navbar is 1200 */
}

/* Phones: use the whole screen under the navbar */
@media (max-width: 575.98px) {
  .chat-panel {
    top: 3.5rem;
    right: 0;
    left: 0;
    bottom: 0;
    width: auto;
    height: auto;
    border-radius: 0;
    border-width: 1px 0 0;
  }
}

/* Opening and closing: a short fade, skipped for people who turned animations off */
.chat-pop-enter-active,
.chat-pop-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.chat-pop-enter-from,
.chat-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .chat-pop-enter-active,
  .chat-pop-leave-active {
    transition: none;
  }
}
</style>
