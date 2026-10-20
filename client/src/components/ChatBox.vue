<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '@/services/auth'
import { connectSocket } from '@/services/socket'
import { listMessages, sendMessage } from '@/services/messages'

// PROPS: volunteers use <ChatBox /> with nothing. HQ uses <ChatBox :volunteer-id="id" /> to choose the chat.
const props = defineProps({
  volunteerId: { type: String, default: null },
  title: { type: String, default: 'Chat with HQ' },
})

const auth = useAuthStore()
const messages = ref([]) // every message in this conversation
const draft = ref('') // what the user is typing
const sending = ref(false) // stops double-sends while waiting for the server
const errorMessage = ref('')
const listEl = ref(null) // the scrolling box, so we can scroll to the newest message

// Which conversation are we in? HQ: the volunteer they picked. Volunteer: their own id.
const threadId = computed(() => props.volunteerId ?? auth.user?._id)

// Scroll to the bottom after Vue has drawn the new bubble (nextTick = "wait until the screen updated")
async function scrollToBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function loadMessages() {
  errorMessage.value = ''
  try {
    messages.value = await listMessages(props.volunteerId ?? undefined)
    scrollToBottom()
  } catch (error) {
    errorMessage.value = error.friendlyMessage
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return // ignore empty text or a double click
  sending.value = true
  errorMessage.value = ''
  try {
    await sendMessage(text, props.volunteerId ?? undefined)
    draft.value = '' // the bubble itself appears via the socket event below, so we don't add it here
  } catch (error) {
    errorMessage.value = error.friendlyMessage // draft is kept so the user can retry
  } finally {
    sending.value = false
  }
}

// Runs when the server pushes a new message through the socket
function onNewMessage(msg) {
  if (msg.thread !== threadId.value) return // HQ gets every chat's messages; only show this one's
  if (messages.value.some((m) => m._id === msg._id)) return // already have it, avoid duplicates
  messages.value.push(msg)
  scrollToBottom()
}

const isMine = (msg) => msg.sender === auth.user?._id // decides left or right bubble
const formatTime = (date) =>
  new Date(date).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore',
  })

let socket = null
onMounted(() => {
  loadMessages()
  socket = connectSocket()
  socket.on('message:new', onNewMessage)
  socket.on('connect', loadMessages) // after a dropped connection (bad signal), reload what we missed
})
onUnmounted(() => {
  socket?.off('message:new', onNewMessage) // clean up, otherwise handlers pile up each time the page opens
  socket?.off('connect', loadMessages)
})

// HQ clicks a different volunteer -> load that conversation
watch(() => props.volunteerId, loadMessages)
</script>

<template>
  <div class="card card-hw" data-testid="chat-box">
    <div class="card-header fw-semibold">{{ title }}</div>

    <div ref="listEl" class="card-body overflow-auto" style="height: 360px">
      <p v-if="!messages.length" class="text-muted-hw text-center mt-4">
        No messages yet. Say hello!
      </p>

      <div
        v-for="msg in messages"
        :key="msg._id"
        class="d-flex mb-2"
        :class="isMine(msg) ? 'justify-content-end' : 'justify-content-start'"
      >
        <!-- {{ }} escapes the text, so a message like "<script>" is shown as text and can't run -->
        <div
          class="px-3 py-2 rounded-3"
          :class="isMine(msg) ? 'bg-primary text-white' : 'bg-light border'"
          style="max-width: 80%"
        >
          <div class="small opacity-75">
            {{ msg.senderRole === 'admin' ? 'HQ' : 'Volunteer' }} · {{ formatTime(msg.createdAt) }}
          </div>
          <div style="white-space: pre-wrap">{{ msg.text }}</div>
        </div>
      </div>
    </div>

    <div class="card-footer">
      <div v-if="errorMessage" class="alert alert-danger py-1 small mb-2">{{ errorMessage }}</div>
      <!-- <form> means pressing Enter sends the message -->
      <form class="d-flex gap-2" @submit.prevent="send">
        <input
          v-model="draft"
          class="form-control"
          maxlength="1000"
          placeholder="Type a message…"
          data-testid="chat-input"
        />
        <button
          class="btn btn-primary"
          :disabled="sending || !draft.trim()"
          data-testid="chat-send"
        >
          Send
        </button>
      </form>
    </div>
  </div>
</template>
