<script setup>
// ---------------------------------------------------------------------------------------------------
// AppDropdown: the project's reusable custom dropdown (same look and animation as the old "show-select").
//
// How to use it in any page:
//   <AppDropdown v-model="sortBy" :options="sortOptions" icon="bi-sort-down" aria-label="Sort incidents" />
//   - v-model  : the currently chosen option's `value` (the parent owns the state; this component only edits it)
//   - options  : [{ value: 'newest', label: 'Newest first' }, ...]
// ---------------------------------------------------------------------------------------------------
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' }, // the selected option's value (works with v-model)
  options: { type: Array, required: true }, // list of { value, label }
  icon: { type: String, default: '' }, // optional Bootstrap icon class on the button, e.g. 'bi-tag'
  ariaLabel: { type: String, default: 'Choose an option' }, // spoken by screen readers (the button shows no label text)
  testid: { type: String, default: '' }, // becomes data-testid on the button so the E2E tests can find it
  grow: { type: Boolean, default: false }, // true = stretch to fill the free space in a flex row
  menuEnd: { type: Boolean, default: false }, // true = open the menu aligned to the right edge instead of the left
  optionTestidPrefix: { type: String, default: '' }, // e.g. 'alloc-show-option-' gives each option data-testid 'alloc-show-option-1', '-2', ...
})

// "update:modelValue" is the event name that v-model listens for on a component
const emit = defineEmits(['update:modelValue'])

const open = ref(false) // is the menu showing?
const rootEl = ref(null) // the wrapper element, used to tell whether a click happened inside or outside

// The text on the button: the label of the option whose value matches (empty string if nothing matches)
const currentLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? '',
)

// Picking an option: close the menu, then tell the parent the new value
function choose(value) {
  open.value = false
  emit('update:modelValue', value)
}

// Close when the user taps anywhere outside this dropdown. This also means opening another
// dropdown closes this one, so only one menu is ever open at a time.
function onDocPointerDown(e) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target)) open.value = false
}

// Register the outside-click listener once when the component appears, and remove it when it goes
// away (otherwise the listener would leak after leaving the page).
// The `true` means "capture phase": we hear the click before any other element (e.g. the Leaflet map) can stop it,
// so tapping the map still closes an open menu. The same `true` must be used when removing the listener.
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown, true))
</script>

<template>
  <!-- @keydown.esc closes the menu from the keyboard. The "open" class lifts this dropdown above its neighbours. -->
  <div
    ref="rootEl"
    class="show-select"
    :class="{ open, 'show-select-grow': grow }"
    @keydown.esc="open = false"
  >
    <button
      type="button"
      class="show-btn"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      :data-testid="testid || null"
      @click="open = !open"
    >
      <!-- v-if: the icon is optional -->
      <i v-if="icon" class="bi" :class="icon" aria-hidden="true"></i>
      <span class="show-name">{{ currentLabel }}</span>
      <!-- the chevron flips upside down while the menu is open -->
      <i class="bi bi-chevron-down show-chevron" :class="{ open }" aria-hidden="true"></i>
    </button>

    <Transition name="menu">
      <div v-if="open" class="show-menu filter-menu" :class="{ 'menu-end': menuEnd }" role="listbox">
        <!-- "--i" is the option's position; the CSS uses it to stagger the fade-in one after another -->
        <button
          v-for="(opt, i) in options"
          :key="opt.value === '' ? 'all' : opt.value"
          type="button"
          class="show-option"
          :class="{ active: opt.value === modelValue }"
          :style="{ '--i': i }"
          role="option"
          :aria-selected="opt.value === modelValue"
          :data-testid="optionTestidPrefix ? optionTestidPrefix + (i + 1) : null"
          @click="choose(opt.value)"
        >
          <span>{{ opt.label }}</span>
          <i v-if="opt.value === modelValue" class="bi bi-check-lg" aria-hidden="true"></i>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Wrapper: positioned so the menu can sit directly under the button */
.show-select {
  position: relative;
  flex: 0 0 auto;
  max-width: 100%;
  z-index: 20; /* keeps the open menu above the chips and cards underneath */
}
.show-select.open {
  z-index: 30;
}
/* "grow" variant: fills the free space in a flex row, and the menu is as wide as the button */
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
  transition: background-color 0.15s;
}
.show-btn:hover {
  background: var(--bs-secondary-bg);
}
/* Long labels are cut with "..." instead of stretching the button */
.show-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hw-text);
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
  max-width: min(320px, calc(100vw - 24px)); /* never wider than a phone screen */
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
/* A long list scrolls inside the menu instead of running off the screen */
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
.show-option:hover {
  background: var(--hw-bg);
}
.show-option.active {
  background: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  font-weight: 600;
}
/* The menu grows out of the button */
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
/* Options fade in one after another */
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
/* Respect users who ask their device for less motion */
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
