<!-- The shared dropdown used on the Allocation, Incident Queue and Badges pages (and others). It
     replaces the browser's own select so every dropdown looks the same. -->

<script setup>
// Holds the open/closed state, works out the label of the chosen option, handles choosing, keyboard
// use and closing on an outside click.

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  icon: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Choose an option' },
  testid: { type: String, default: '' },
  grow: { type: Boolean, default: false },
  menuEnd: { type: Boolean, default: false },
  optionTestidPrefix: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  buttonId: { type: String, default: '' },
  groups: { type: Array, default: null },
})

const emit = defineEmits(['update:modelValue', 'open'])

const open = ref(false)
// watch(open) - when the menu opens, tell the page with an "open" event (optional: a page can listen
// to close its own other popups).
watch(open, (isOpen) => {
  if (isOpen) emit('open')
})
const rootEl = ref(null)

// allOptions (computed) - every option as one flat list (the groups are merged if grouped).
const allOptions = computed(() => (props.groups ? props.groups.flatMap((g) => g.options) : props.options))
// currentLabel (computed) - the label of the chosen option, or empty if none matches.
const currentLabel = computed(() => allOptions.value.find((o) => o.value === props.modelValue)?.label ?? '')

// rows (computed) - the rows to draw in the list: group headings and options, each option with its
// position index (used by the keyboard).
const rows = computed(() => {
  if (!props.groups) return props.options.map((opt, i) => ({ opt, i }))
  let i = 0
  return props.groups.flatMap((g) => [{ heading: g.label }, ...g.options.map((opt) => ({ opt, i: i++ }))])
})

// choose(value) - an option was picked: close the list and tell the parent the new value.
function choose(value) {
  open.value = false
  emit('update:modelValue', value)
}

// onDocPointerDown(e) - a click or tap anywhere: if it is outside this dropdown, close it.
function onDocPointerDown(e) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target)) open.value = false
}

// onMounted - start listening for clicks anywhere on the page.
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
// onUnmounted - stop listening for those clicks.
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown, true))
</script>

<template>
  <!-- A button showing the chosen label and the pop-up list of options (optionally in groups). -->
  <div
    ref="rootEl"
    class="show-select"
    :class="{ open, 'show-select-grow': grow }"
    @keydown.esc="open = false"
  >
    <button
      :id="buttonId || null"
      type="button"
      class="show-btn"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      :data-testid="testid || null"
      @click="open = !open"
    >
      <i v-if="icon" class="bi" :class="icon" aria-hidden="true"></i>
      <span class="show-name" :class="{ 'is-placeholder': !currentLabel }">{{ currentLabel || placeholder }}</span>
      <i class="bi bi-chevron-down show-chevron" :class="{ open }" aria-hidden="true"></i>
    </button>

    <Transition name="menu">
      <div v-if="open" class="show-menu filter-menu" :class="{ 'menu-end': menuEnd }" role="listbox">
        <template
          v-for="row in rows"
          :key="row.heading ? 'g-' + row.heading : row.opt.value === '' ? 'all' : row.opt.value"
        >
          <div v-if="row.heading" class="show-group">{{ row.heading }}</div>
          <button
            v-else
            type="button"
            class="show-option"
            :class="{ active: row.opt.value === modelValue }"
            :style="{ '--i': row.i }"
            role="option"
            :aria-selected="row.opt.value === modelValue"
            :data-testid="optionTestidPrefix ? optionTestidPrefix + (row.i + 1) : null"
            @click="choose(row.opt.value)"
          >
            <span>{{ row.opt.label }}</span>
            <i v-if="row.opt.value === modelValue" class="bi bi-check-lg" aria-hidden="true"></i>
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Styles for the dropdown button and its pop-up list, using the --hw-* colours. */

.show-select {
  position: relative;
  flex: 0 0 auto;
  max-width: 100%;
  z-index: 20;
}
.show-select.open {
  z-index: 30;
}
.show-select-grow {
  flex: 1 1 160px;
}
.show-select-grow .show-btn {
  width: 100%;
}
.show-select-grow .show-menu {
  min-width: 100%;
}
.show-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: var(--hw-bg);
  color: var(--bs-secondary-color);
  font-weight: 600;
  text-align: left;
  transition: background-color 0.15s;
}
.show-btn:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}
.show-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hw-text);
}
.show-name.is-placeholder {
  color: var(--hw-muted);
  font-weight: 500;
}
.show-group {
  padding: 8px 12px 4px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hw-muted);
}
.show-chevron {
  flex: 0 0 auto;
  font-size: 0.7rem;
  transition: transform 0.25s ease;
}
.show-chevron.open {
  transform: rotate(180deg);
}
.show-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 170px;
  max-width: min(320px, calc(100vw - 24px));
  padding: 6px;
  background: var(--hw-surface);
  color: var(--hw-text);
  border: 1px solid var(--bs-border-color);
  border-radius: 14px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.22);
}
.show-menu.menu-end {
  left: auto;
  right: 0;
}
.filter-menu {
  max-height: 260px;
  overflow-y: auto;
}
.show-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font-size: 0.9rem;
  text-align: left;
  overflow-wrap: anywhere;
  animation: option-in 0.2s ease both;
  animation-delay: calc(var(--i) * 30ms);
}
.show-option.active {
  background: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  font-weight: 600;
}
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform-origin: top left;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.95);
}
/* Hover colours only on devices with a real mouse, so on phones a tapped dropdown doesn't stay
   stuck in the darker hover colour. */
@media (hover: hover) {
  .show-btn:hover {
    background: var(--bs-secondary-bg);
  }
  .show-option:hover {
    background: var(--hw-bg);
  }
}
@keyframes option-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .show-option {
    animation: none;
  }
  .menu-enter-active,
  .menu-leave-active,
  .show-chevron {
    transition: none;
  }
}
</style>
