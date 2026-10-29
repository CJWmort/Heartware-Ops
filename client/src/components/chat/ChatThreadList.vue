<script setup>
import { computed, ref } from 'vue'
import { formatChatTime, useChatStore } from '@/services/chat'

const chat = useChatStore()
const query = ref('')

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? chat.threads.filter((t) => (t.name || '').toLowerCase().includes(q)) : chat.threads
})
</script>

<template>
  <div class="d-flex flex-column h-100">
    <header class="chat-head d-flex align-items-center justify-content-between px-3 py-2">
      <h2 class="h6 mb-0">Messages</h2>
      <button type="button" class="btn-close" aria-label="Close chat" @click="chat.close()"></button>
    </header>

    <div class="p-2 border-bottom">
      <input
        v-model="query"
        type="search"
        class="form-control form-control-sm"
        placeholder="Find a volunteer"
        aria-label="Find a volunteer"
      />
    </div>

    <p v-if="chat.error" class="text-danger small px-3 pt-2 mb-0" role="alert">{{ chat.error }}</p>

    <ul class="list-unstyled mb-0 overflow-auto flex-grow-1">
      <li v-for="t in rows" :key="t.volunteerId">
        <button
          type="button"
          class="thread-row w-100 text-start d-flex align-items-center gap-2 px-3 py-2"
          @click="chat.selectThread(t.volunteerId)"
        >
          <span class="presence" :class="{ on: chat.isOnline(t.volunteerId) }">
            <span class="visually-hidden">{{ chat.isOnline(t.volunteerId) ? 'Online' : 'Offline' }}</span>
          </span>

          <span class="flex-grow-1 min-w-0">
            <span class="d-flex justify-content-between gap-2">
              <span class="text-truncate" :class="t.unreadAdmin ? 'fw-bold' : 'fw-semibold'">
                {{ t.name }}
              </span>
              <span v-if="t.lastAt" class="small text-body-secondary flex-none">
                {{ formatChatTime(t.lastAt) }}
              </span>
            </span>
            <span class="d-flex justify-content-between align-items-center gap-2">
              <span
                class="preview text-truncate"
                :class="t.lastText ? 'text-body-secondary' : 'text-body-tertiary fst-italic'"
              >
                {{ t.lastText || 'No messages yet' }}
              </span>
              <span
                v-if="t.unreadAdmin > 0"
                class="badge rounded-pill bg-danger flex-none"
                :aria-label="`${t.unreadAdmin} unread`"
              >
                {{ t.unreadAdmin > 99 ? '99+' : t.unreadAdmin }}
              </span>
            </span>
          </span>
        </button>
      </li>
      <!-- FIX (C21): say "Loading..." until the first load has finished, so "No volunteers yet." does not flash -->
      <li v-if="!chat.threadsLoaded && !rows.length" class="text-body-secondary small text-center p-4">
        Loading volunteers…
      </li>
      <li v-else-if="!rows.length" class="text-body-secondary small text-center p-4">
        {{ query ? 'No volunteers match that name.' : 'No volunteers yet.' }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.chat-head {
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.thread-row {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--bs-border-color-translucent, rgb(0 0 0 / 0.1));
}
.thread-row:hover,
.thread-row:focus-visible {
  background: var(--bs-tertiary-bg, #f8f9fa);
}
.presence {
  flex: none;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #adb5bd; /* offline */
}
.presence.on {
  background: #198754; /* online */
}
.preview {
  font-size: 0.8125rem;
}
.min-w-0 {
  min-width: 0; /* lets the preview text shorten with "…" instead of widening the row */
}
.flex-none {
  flex: none;
}
</style>
