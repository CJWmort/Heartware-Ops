<!-- One open conversation: the message bubbles, "Seen" marker, typing note and the box to send a
     new message. -->

<script setup>
// Builds the title and labels, sends messages, tells the server when you type, and keeps the view
// scrolled to the newest message.

import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/services/auth'
import { formatChatTime, useChatStore } from '@/services/chat'

const chat = useChatStore()
const auth = useAuthStore()

const text = ref('')
const list = ref(null)
const input = ref(null)

// title (computed) - the name in the header: admin sees the volunteer's name (or "Volunteer"); a
// volunteer sees "HQ".
const title = computed(() => (chat.isAdmin ? chat.activeThread?.name || 'Volunteer' : 'HQ'))

// emptyText (computed) - message shown when the chat has no messages yet.
const emptyText = computed(() =>
  chat.isAdmin
    ? `this is the beginning of your conversation with ${title.value}.`
    : 'this is the beginning of your conversation with HQ.',
)

// typingLabel (computed) - "HQ is typing...", "<name> is typing..." or "Another admin is typing..."
// depending on who is typing and who I am; empty when nobody is.
const typingLabel = computed(() => {
  if (!chat.typing) return ''
  if (!chat.isAdmin) return 'HQ is typing...'
  return chat.typing.role === 'volunteer'
    ? `${title.value} is typing...`
    : 'Another admin is typing...'
})

// isMine(m) - decides if a bubble goes on the right. If my id is known compare the message's sender id
// with it (so one admin's messages are not "mine" for another admin); otherwise compare roles.
function isMine(m) {
  return chat.myId ? String(m.sender) === chat.myId : m.senderRole === auth.role
}

// seenId (computed) - the _id of MY latest message if the other side has read up to it, else null.
// "Seen" is printed under only that message.
const seenId = computed(() => {
  if (!chat.otherReadAt) return null
  const mine = chat.messages.filter(isMine)
  const last = mine[mine.length - 1]
  if (!last) return null
  return +new Date(last.createdAt) <= +new Date(chat.otherReadAt) ? last._id : null
})

// senderLabel(m) - the small name above a bubble: volunteers see "HQ"; admins see the volunteer's name
// or "Another admin".
function senderLabel(m) {
  if (!chat.isAdmin) return 'HQ'
  return m.senderRole === 'volunteer' ? chat.activeThread?.name || 'Volunteer' : 'Another admin'
}

// showLabel(i) - show the sender name only above the first bubble of a run (not for mine, not when the
// previous message has the same sender).
function showLabel(i) {
  const m = chat.messages[i]
  if (isMine(m)) return false
  const prev = chat.messages[i - 1]
  return !prev || String(prev.sender) !== String(m.sender)
}

// submit() - 1) send the typed text through the chat store 2) if it was sent clear the box and put the
// cursor back in it 3) if it failed the text stays so nothing is lost.
async function submit() {
  if (await chat.send(text.value)) {
    text.value = ''
    nextTick(() => input.value?.focus())
  }
}

// toBottom() - after the DOM updates, scroll the message area to the newest message.
function toBottom() {
  nextTick(() => {
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  })
}
// Scroll to the bottom whenever a message is added and when loading finishes; on mount also scroll and
// focus the box.
watch(() => chat.messages.length, toBottom)
// watch(loadingMessages) - when loading finishes, scroll to the newest message.
watch(
  () => chat.loadingMessages,
  (loading) => {
    if (!loading) toBottom()
  },
)
// onMounted - scroll to the newest message and focus the text box.
onMounted(() => {
  toBottom()
  input.value?.focus()
})
</script>

<template>
  <!-- The header with the back button, the message list, the typing note and the message form. -->
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
        v-else-if="!chat.messages.length"
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
    </div>

    <div class="typing small text-body-secondary px-3" aria-live="polite">{{ typingLabel }}</div>

    <p v-if="chat.error" class="text-danger small px-3 mb-1" role="alert">{{ chat.error }}</p>

    <form
      class="d-flex gap-2 p-2 border-top align-items-center"
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
/* Styles for the bubbles, the list and the message box. */

.chat-head {
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.presence {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #adb5bd;
}
.presence.on {
  background: #198754;
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
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.mine .bubble {
  background: var(--hw-surface, #ffffff);
  color: var(--hw-text, #0f1730);
  border: 1px solid var(--bs-border-color, #d5dae6);
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
