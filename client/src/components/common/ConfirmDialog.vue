<!-- The shared confirmation pop-up (used for Allocate, Reset, Resolve and so on). It can also ask
     for a typed note. -->

<script setup>
// Tracks the note box, checks it is filled when required, answers with the note or null, focuses the
// Cancel button and handles the Escape key.

import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  dialog: { type: Object, default: null },
})
const emit = defineEmits(['answer'])

const cancelBtn = ref(null)
const okBtn = ref(null)
const inputEl = ref(null)
const text = ref('')

// canConfirm (computed) - false while a required text box is empty or only spaces; OK is disabled
// then.
const canConfirm = computed(() => !props.dialog?.input?.required || text.value.trim().length > 0)

// confirmOk() - 1) stop if OK is not allowed 2) tell the parent "answer = true", adding the trimmed
// text when the dialog has a text box.
function confirmOk() {
  if (!canConfirm.value) return
  emit('answer', true, props.dialog?.input ? text.value.trim() : undefined)
}

// watch(dialog) - each time a dialog opens or closes: 1) clear the typed text 2) when it opens, focus
// the text box (if any), otherwise the Cancel button (the safe choice) or OK.
watch(
  () => props.dialog,
  (d) => {
    text.value = ''
    if (d) nextTick(() => (d.input ? inputEl.value : cancelBtn.value || okBtn.value)?.focus())
  },
)

// onKeydown(e) - 1) Escape does nothing on purpose (user must press a button) 2) Tab / Shift+Tab are
// trapped: build the order text box, Cancel, OK (OK skipped while disabled), find the focused one,
// move to the next or previous and wrap round.
function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    const order = [inputEl.value, cancelBtn.value, canConfirm.value ? okBtn.value : null].filter(
      Boolean,
    )
    const at = order.indexOf(document.activeElement)
    const step = e.shiftKey ? -1 : 1
    order[(at + step + order.length) % order.length]?.focus()
  }
}
</script>

<template>
  <!-- The dark backdrop and the centred dialog with title, text, optional note box and the
       Cancel and Confirm buttons. -->
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="dialog" class="confirm-backdrop" @keydown="onKeydown" @click.self.stop>
        <div
          class="confirm-card"
          :class="{ danger: dialog.danger }"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-text"
        >
          <div class="confirm-head">
            <div class="confirm-icon" aria-hidden="true">
              <i
                class="bi"
                :class="
                  dialog.icon ||
                  (dialog.danger ? 'bi-exclamation-triangle-fill' : 'bi-question-circle-fill')
                "
              ></i>
            </div>
            <div class="confirm-body">
              <div id="confirm-title" class="confirm-title">{{ dialog.title }}</div>
              <div id="confirm-text" class="confirm-text">{{ dialog.text }}</div>
            </div>
          </div>
          <div v-if="dialog.input" class="confirm-field">
            <label v-if="dialog.input.label" for="confirm-input" class="confirm-label">{{
              dialog.input.label
            }}</label>
            <textarea
              id="confirm-input"
              ref="inputEl"
              v-model="text"
              class="confirm-input"
              rows="4"
              :placeholder="dialog.input.placeholder"
              :maxlength="dialog.input.maxlength || 500"
              data-testid="confirm-input"
            ></textarea>
          </div>
          <div class="confirm-actions">
            <button
              v-if="!dialog.hideCancel"
              ref="cancelBtn"
              type="button"
              class="confirm-btn cancel"
              data-testid="confirm-cancel"
              @click="emit('answer', false)"
            >
              {{ dialog.cancelText || 'Cancel' }}
            </button>
            <button
              ref="okBtn"
              type="button"
              class="confirm-btn ok"
              :disabled="!canConfirm"
              data-testid="confirm-ok"
              @click="confirmOk"
            >
              {{ dialog.confirmText || 'OK' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Styles for the backdrop and dialog; it sits on the top layer (z-index 2000). */

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 16px;
  overflow-y: auto;
  background: rgb(0 0 0 / 0.55);
}
.confirm-card {
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 16px;
  background: #fff;
  color: #1f2430;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.35);
}
.confirm-card.danger {
  border: 1px solid #f5c2c0;
}
.confirm-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.confirm-icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0fe;
  color: #1a73e8;
  font-size: 1.1rem;
}
.confirm-card.danger .confirm-icon {
  background: #fce8e6;
  color: #d93025;
}
.confirm-body {
  flex: 1 1 auto;
  min-width: 0;
}
.confirm-title {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
}
.confirm-text {
  margin-top: 4px;
  font-size: 0.875rem;
  line-height: 1.4;
  color: #666;
}
.confirm-field {
  margin-top: 12px;
}
.confirm-label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #444;
}
.confirm-input {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  background: #fff;
  color: #1f2430;
  font-size: 0.9rem;
  line-height: 1.4;
  resize: vertical;
  min-height: 90px;
  max-height: 40vh;
}
.confirm-input:focus {
  outline: 2px solid #1a73e8;
  outline-offset: 1px;
  border-color: #1a73e8;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.confirm-btn {
  min-width: 84px;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background-color 0.15s;
}
.confirm-btn:focus-visible {
  outline: 2px solid #1a73e8;
  outline-offset: 2px;
}
.confirm-btn.cancel {
  background: #f1f3f6;
  color: #444;
}
.confirm-btn.cancel:hover {
  background: #e4e7ec;
}
.confirm-btn.ok {
  background: #1a73e8;
  color: #fff;
}
.confirm-btn.ok:hover {
  background: #1765cc;
}
.confirm-btn.ok:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.confirm-card.danger .confirm-btn.ok {
  background: #d93025;
}
.confirm-card.danger .confirm-btn.ok:hover {
  background: #b9271e;
}

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.2s ease;
}
.confirm-enter-active .confirm-card,
.confirm-leave-active .confirm-card {
  transition: transform 0.2s ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
.confirm-enter-from .confirm-card,
.confirm-leave-to .confirm-card {
  transform: translateY(-12px);
}
@media (prefers-reduced-motion: reduce) {
  .confirm-enter-active,
  .confirm-leave-active,
  .confirm-enter-active .confirm-card,
  .confirm-leave-active .confirm-card {
    transition: none;
  }
}
</style>
