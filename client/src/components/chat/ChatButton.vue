<script setup>
import { computed } from 'vue'
import { useChatStore } from '@/services/chat'

const chat = useChatStore()

const badge = computed(() => (chat.unreadTotal > 99 ? '99+' : String(chat.unreadTotal)))
const label = computed(() => (chat.unreadTotal > 0 ? `Chat, ${chat.unreadTotal} unread` : 'Chat'))
</script>

<template>
  <!-- Classes passed in from the navbar (d-lg-none etc.) land on this button -->
  <button
    type="button"
    data-chat-toggle
    class="btn border-0 text-white btn-sm position-relative d-inline-flex align-items-center chat-btn"
    :aria-label="label"
    :aria-expanded="chat.isOpen"
    aria-haspopup="dialog"
    @click="chat.toggle()"
  >
    <!-- fs-5 = slightly larger icon so it reads as clearly as the text links -->
    <i class="bi bi-chat-dots-fill fs-5" aria-hidden="true"></i>
    <span
      v-if="chat.unreadTotal > 0"
      class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
    >
      {{ badge }}
    </span>
  </button>
</template>

<style scoped>
/* Without the box there is no hover cue, so fade the icon slightly on hover/keyboard focus */
.chat-btn:hover,
.chat-btn:focus-visible {
  opacity: 0.75;
}
</style>
