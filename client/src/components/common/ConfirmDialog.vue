<script setup>
// Custom replacement for the browser's confirm() window. Styled like MapNotice (the popup status card).
//   <ConfirmDialog :dialog="dialog" @answer="onAnswer" />
//   dialog = { title, text, confirmText?, cancelText?, danger?, icon?, input? } or null (null = closed)
//   @answer fires with true (OK) or false (Cancel).
// OPTIONAL TEXT BOX (replaces the browser's prompt()): add  input: { label?, placeholder?, required?, maxlength? }
//   to the dialog. A text area is shown, and @answer then fires with (true, theTypedText) on OK.
//   With required: true the OK button stays disabled until something (not just spaces) is typed.
// It is a MODAL: the dark backdrop covers the whole page and swallows every click, and Escape is ignored,
// so the only way out is the Cancel or OK button. Tab is kept inside the card.
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  dialog: { type: Object, default: null },
})
const emit = defineEmits(['answer'])

const cancelBtn = ref(null)
const okBtn = ref(null)
const inputEl = ref(null)
const text = ref('') // what the user typed (only used when dialog.input exists)

// OK is disabled while a required text box is empty.
const canConfirm = computed(() => !props.dialog?.input?.required || text.value.trim().length > 0)

function confirmOk() {
  if (!canConfirm.value) return
  emit('answer', true, props.dialog?.input ? text.value.trim() : undefined)
}

// When the card opens: clear the text box and focus it. Without a text box, focus Cancel (the safe choice)
// so Enter / Space can't confirm by accident.
watch(
  () => props.dialog,
  (d) => {
    text.value = ''
    if (d) nextTick(() => (d.input ? inputEl.value : cancelBtn.value || okBtn.value)?.focus())
  },
)

// Keyboard: Escape does nothing (the user must choose); Tab/Shift+Tab cycle between the two buttons only.
function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    // Focus order: text box (if any) -> Cancel -> OK (skipped while disabled) -> back to the start
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
  <Teleport to="body">
    <Transition name="confirm">
      <!-- Backdrop: darkens the page and blocks all clicks behind the card. Clicking it does nothing on purpose. -->
      <div v-if="dialog" class="confirm-backdrop" @keydown="onKeydown" @click.self.stop>
        <div
          class="confirm-card"
          :class="{ danger: dialog.danger }"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-text"
        >
          <div class="confirm-head align-items-center">
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
            <!-- v-if to check if hideCancel is true, then cancel button will not be displayed, used by incidentReportForm -->
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
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000; /* above the navbar, the floating panel (1100) and the popup notice (1150) */
  display: flex;
  align-items: flex-start; /* CHANGED: was "center". Puts the card at the top; justify-content: center below still centres it sideways */
  justify-content: center;
  padding: 72px 16px 16px; /* CHANGED: extra top space so the card sits just below the navbar */
  background: rgb(0 0 0 / 0.55);
}
.confirm-card {
  width: 100%;
  max-width: 420px;
  padding: 16px;
  background: #fff;
  color: #1f2430; /* fixed dark text on the fixed-white card, as in MapNotice */
  border-radius: 14px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.35);
}
.confirm-card.danger {
  border: 1px solid #f5c2c0;
}
.confirm-head {
  display: flex;
  align-items: flex-start;
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
