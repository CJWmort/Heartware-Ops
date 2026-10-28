<script setup>
import { computed } from 'vue'
import { useChatStore } from '@/services/chat'

defineProps({ showLabel: { type: Boolean, default: false } })

const chat = useChatStore()

const badge = computed(() => (chat.unreadTotal > 99 ? '99+' : String(chat.unreadTotal)))
const label = computed(() => (chat.unreadTotal > 0 ? `Chat, ${chat.unreadTotal} unread` : 'Chat'))
</script>

<template>
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
      <!-- fs-5 (bigger icon) only when there is no label; with a label the icon matches the other links' size -->
      <i :class="['bi', 'bi-chat-dots', { 'fs-5': !showLabel }]" aria-hidden="true"></i>

      <span
        v-if="chat.unreadTotal > 0"
        class="chat-badge position-absolute top-0 start-100 badge rounded-pill bg-danger"
      >
        {{ badge }}
      </span>
    </span>

    <!-- the text label, only shown when the parent passes show-label (desktop navbar). Outside the span above so the unread badge stays on the icon -->
    <span v-if="showLabel" class="ms-1">Chat</span>
  </button>
</template>

<style scoped>
/* Without the box there is no hover cue, so fade the icon slightly on hover/keyboard focus */
/* Pull the badge in so its centre lands near the icon's top-right corner */
.chat-badge {
  transform: translate(-50%, -35%);
}
.chat-btn:hover,
.chat-btn:focus-visible {
  opacity: 0.75;
}
</style>
