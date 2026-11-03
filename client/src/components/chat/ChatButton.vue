<!-- The Chat button in the navbar with its red unread-count badge. -->

<script setup>
// Reads the unread count and button label from the chat store.

import { computed } from 'vue'
import { useChatStore } from '@/services/chat'

defineProps({ showLabel: { type: Boolean, default: false } })

const chat = useChatStore()

// badge (computed) - the text on the red unread bubble: the number, or "99+" above 99.
const badge = computed(() => (chat.unreadTotal > 99 ? '99+' : String(chat.unreadTotal)))
// label (computed) - the screen-reader text of the button: "Chat" or "Chat, 3 unread".
const label = computed(() => (chat.unreadTotal > 0 ? `Chat, ${chat.unreadTotal} unread` : 'Chat'))
</script>

<template>
  <!-- A button that opens the chat panel and shows the unread count. -->
  <button
    type="button"
    data-chat-toggle
    class="btn border-0 text-white btn-sm position-relative d-inline-flex align-items-center chat-btn"
    :aria-label="label"
    :aria-expanded="chat.isOpen"
    aria-haspopup="dialog"
    @click="chat.toggle()"
  >
    <span class="position-relative d-inline-flex">
      <i :class="['bi', 'bi-chat-dots', { 'fs-5': !showLabel }]" aria-hidden="true"></i>

      <span
        v-if="chat.unreadTotal > 0"
        class="chat-badge position-absolute top-0 start-100 badge rounded-pill bg-danger"
        :class="{ 'chat-badge-sm': showLabel }"
      >
        {{ badge }}
      </span>
    </span>

    <span v-if="showLabel" class="ms-1">Chat</span>
  </button>
</template>

<style scoped>
/* Styles for the chat button and its badge. */

.chat-badge {
  transform: translate(-50%, -35%);
}
.chat-badge-sm {
  transform: translate(-60%, -30%);
  font-size: 0.6rem;
  padding: 0.2em 0.4em;
  line-height: 1;
}
.chat-btn:hover,
.chat-btn:focus-visible {
  opacity: 0.75;
}
</style>