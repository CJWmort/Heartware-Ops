<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { connectSocket } from '@/services/socket'
import { listThreads } from '@/services/messages'
import ChatBox from '@/components/ChatBox.vue'

const threads = ref([]) // [{ volunteerId, name, lastText, lastAt }]
const selectedId = ref(null) // which volunteer HQ is chatting with

async function loadThreads() {
  try {
    threads.value = await listThreads()
  } catch {
    /* the list just stays as it was */
  }
}

let socket = null
onMounted(() => {
  loadThreads()
  socket = connectSocket()
  socket.on('message:new', loadThreads) // a new message moves that chat to the top of the list
})
onUnmounted(() => socket?.off('message:new', loadThreads))
</script>

<template>
  <div class="row g-3">
    <div class="col-12 col-md-4">
      <div class="list-group" style="max-height: 420px; overflow-y: auto">
        <button
          v-for="t in threads"
          :key="t.volunteerId"
          class="list-group-item list-group-item-action"
          :class="{ active: t.volunteerId === selectedId }"
          @click="selectedId = t.volunteerId"
        >
          <div class="fw-semibold">{{ t.name }}</div>
          <div class="small text-truncate">{{ t.lastText || 'No messages yet' }}</div>
        </button>
      </div>
    </div>
    <div class="col-12 col-md-8">
      <!-- :key forces a fresh ChatBox per volunteer so the old conversation never flashes -->
      <ChatBox
        v-if="selectedId"
        :key="selectedId"
        :volunteer-id="selectedId"
        title="Chat with volunteer"
      />
      <p v-else class="text-muted-hw">Pick a volunteer to start chatting.</p>
    </div>
  </div>
</template>
