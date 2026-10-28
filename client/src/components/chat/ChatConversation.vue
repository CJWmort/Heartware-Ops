<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/services/auth'
import { formatChatTime, useChatStore } from '@/services/chat'

const chat = useChatStore()
const auth = useAuthStore()

const text = ref('')
const list = ref(null) // the scrolling message area
const input = ref(null) // the text box

// Who is on the other end
const title = computed(() => (chat.isAdmin ? chat.activeThread?.name || 'Volunteer' : 'HQ'))

const emptyText = computed(() =>
  chat.isAdmin
    ? `this is the beginning of your conversation with ${title.value}.`
    : 'this is the beginning of your conversation with HQ.',
)

const typingLabel = computed(() => {
  if (!chat.typing) return ''
  if (!chat.isAdmin) return 'HQ is typing...'
  return chat.typing.role === 'volunteer'
    ? `${title.value} is typing...`
    : 'Another admin is typing...'
})

// My own messages sit on the right. For admins "mine" means sent by ME, not by any admin.
function isMine(m) {
  return chat.myId ? String(m.sender) === chat.myId : m.senderRole === auth.role
}

// "Seen" goes only under MY latest message, and only once the other side has read up to it
const seenId = computed(() => {
  if (!chat.otherReadAt) return null
  const mine = chat.messages.filter(isMine)
  const last = mine[mine.length - 1]
  if (!last) return null
  return +new Date(last.createdAt) <= +new Date(chat.otherReadAt) ? last._id : null
})

function senderLabel(m) {
  if (!chat.isAdmin) return 'HQ'
  return m.senderRole === 'volunteer' ? chat.activeThread?.name || 'Volunteer' : 'Another admin'
}

// Show the sender's name only where the sender changes
function showLabel(i) {
  const m = chat.messages[i]
  if (isMine(m)) return false
  const prev = chat.messages[i - 1]
  return !prev || String(prev.sender) !== String(m.sender)
}

async function submit() {
  if (await chat.send(text.value)) {
    text.value = ''
    nextTick(() => input.value?.focus())
  }
}

function toBottom() {
  nextTick(() => {
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  })
}
watch(() => chat.messages.length, toBottom)
watch(
  () => chat.loadingMessages,
  (loading) => {
    if (!loading) toBottom()
  },
)
onMounted(() => {
  toBottom()
  input.value?.focus()
})
</script>

<template>
  <div class="d-flex flex-column h-100">
    <header class="chat-head d-flex align-items-center gap-2 px-2 py-2">
      <button
        v-if="chat.isAdmin"
        type="button"
        class="btn btn-sm btn-light"
        aria-label="Back to all chats"
        @click="chat.backToList()"
      >
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
      </button>

      <h2 class="h6 mb-0 flex-grow-1 text-truncate ps-1">
        <span
          v-if="chat.isAdmin && chat.activeId"
          class="presence me-2"
          :class="{ on: chat.isOnline(chat.activeId) }"
        >
          <span class="visually-hidden">{{
            chat.isOnline(chat.activeId) ? 'Online' : 'Offline'
          }}</span>
        </span>
        {{ title }}
      </h2>

      <button
        type="button"
        class="btn-close"
        aria-label="Close chat panel"
        @click="chat.close()"
      ></button>
    </header>

    <div
      ref="list"
      class="flex-grow-1 overflow-auto px-3 py-2"
      role="log"
      aria-live="polite"
      aria-label="Messages"
    >
      <div v-if="chat.loadingMessages" class="text-body-secondary small text-center my-3" role="status">
        <div class="spinner-border text-primary spinner-border-sm" aria-hidden="true"></div>
        <div class="mt-2">Loading messages…</div>
      </div>
      <p
        v-else-if="!chat.messages.length && !chat.notice"
        class="text-body-secondary small text-center my-3"
      >
        {{ emptyText }}
      </p>

      <div
        v-for="(m, i) in chat.messages"
        :key="m._id"
        class="msg"
        :class="isMine(m) ? 'mine' : 'theirs'"
      >
        <div v-if="showLabel(i)" class="msg-label">{{ senderLabel(m) }}</div>
        <div class="bubble">{{ m.text }}</div>
        <div class="msg-time">
          {{ formatChatTime(m.createdAt) }}
          <span v-if="m._id === seenId" class="msg-seen" data-testid="msg-seen">· Seen</span>
        </div>
      </div>

      <p v-if="chat.notice" class="alert alert-secondary py-2 small my-2">{{ chat.notice }}</p>
    </div>

    <!-- Fixed height so the layout doesn't jump when the indicator appears -->
    <div class="typing small text-body-secondary px-3" aria-live="polite">{{ typingLabel }}</div>

    <p v-if="chat.error" class="text-danger small px-3 mb-1" role="alert">{{ chat.error }}</p>

    <form
      class="d-flex align-items-end gap-2 p-2 border-top align-items-center"
      @submit.prevent="submit"
    >
      <textarea
        ref="input"
        v-model="text"
        class="form-control"
        rows="2"
        maxlength="1000"
        placeholder="Write a message"
        aria-label="Message"
        @keydown.enter.exact.prevent="submit"
        @input="chat.notifyTyping()"
      ></textarea>
      <button
        type="submit"
        class="btn btn-brand"
        aria-label="Send message"
        :disabled="!text.trim() || chat.sending"
      >
        <i class="bi bi-send-fill" aria-hidden="true"></i>
      </button>
    </form>
  </div>
</template>

<style scoped>
.chat-head {
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.presence {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #adb5bd; /* offline */
}
.presence.on {
  background: #198754; /* online */
}

.msg {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  margin-bottom: 0.5rem;
}
.msg.mine {
  align-items: flex-end;
  margin-left: auto;
}
.msg.theirs {
  align-items: flex-start;
}
.msg-label {
  margin: 0.25rem 0.25rem 0.125rem;
  font-size: 0.75rem;
  color: var(--bs-secondary-color, #6c757d);
}
.bubble {
  padding: 0.4rem 0.7rem;
  border-radius: 0.9rem;
  font-size: 0.9rem;
  line-height: 1.35;
  white-space: pre-wrap; /* keep line breaks the person typed */
  overflow-wrap: anywhere;
}
.mine .bubble {
  background: #ffffff;
  color: #0f1730;
  /* the panel is white too, so a thin border keeps the white bubble visible */
  border: 1px solid #d5dae6;
  border-bottom-right-radius: 0.25rem;
}
.theirs .bubble {
  background: var(--bs-tertiary-bg, #f1f3f5);
  color: var(--bs-body-color, #212529);
  border-bottom-left-radius: 0.25rem;
}
.msg-time {
  margin: 0.1rem 0.25rem 0;
  font-size: 0.7rem;
  color: var(--bs-secondary-color, #6c757d);
}
.msg-seen {
  font-weight: 600;
}
.typing {
  min-height: 1.25rem;
}
</style>