<!-- The floating chat window opened from the navbar. It shows the thread list (admin) or the
     conversation. -->

<script setup>
// Starts the chat store when the panel opens, stops it on leave, and closes the panel on an outside
// click or the Escape key.

import { onMounted, onUnmounted, ref } from 'vue'
import { useChatStore } from '@/services/chat'
import ChatThreadList from './ChatThreadList.vue'
import ChatConversation from './ChatConversation.vue'

const chat = useChatStore()
const panel = ref(null)

// This component only exists while someone is logged in (see AppNavbar), so mounting = log in,
// unmounting = log out. That is what opens and closes the live connection. On mount (= the user just
// logged in, because the navbar only shows this panel when logged in): start the chat store (opens the
// live socket) and listen for Escape and outside presses.
onMounted(() => {
  chat.start()
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onPointerDown)
})
// On unmount (= logout): stop the chat store (closes the socket and clears chat data) and remove the
// listeners.
onUnmounted(() => {
  chat.stop()
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onPointerDown)
})

// onPointerDown(e) - closes the panel when you press anywhere outside it. 1) do nothing when the panel
// is closed 2) press inside the panel -> do nothing 3) press on the navbar Chat button (marked
// data-chat-toggle) -> do nothing, because that button toggles by itself 4) otherwise close.
function onPointerDown(e) {
  if (!chat.isOpen || !panel.value) return
  const path = e.composedPath()
  if (path.includes(panel.value)) return
  if (path.some((el) => el.dataset?.chatToggle !== undefined)) return
  chat.close()
}

// onKeydown(e) - pressing Escape closes the open panel.
function onKeydown(e) {
  if (e.key === 'Escape' && chat.isOpen) chat.close()
}
</script>

<template>
  <!-- The panel container that swaps between the thread list and the conversation. -->
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
        <ChatThreadList v-if="chat.isAdmin && chat.activeId === null" />
        <ChatConversation v-else />
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Styles for the floating panel and its phone full-screen version. */

.chat-panel {
  position: fixed;
  top: 3.75rem;
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
  z-index: 1190;
}

@media (min-width: 992px) {
  .chat-panel {
    right: calc((100vw - min(100vw, var(--hw-content-w) + 24px)) / 2 + 12px);
  }
}

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