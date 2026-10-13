<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import './kb-menu.scss'

// Themed replacement for <select> in dialogs, using the command bar's menu panel
// Two roots (button + teleported menu): attributes like class go on the button
defineOptions({inheritAttrs: false})

export interface SelectOption {
  value: any
  label: string
  // Muted text on the right, e.g. a count
  hint?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: any
    options: SelectOption[]
    placeholder?: string
    ariaLabel?: string
  }>(),
  {placeholder: 'Select…'},
)
const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)
const triggerRef = ref<HTMLElement>()
const menuRef = ref<HTMLElement>()
const menuStyle = ref<Record<string, string>>({})

const GAP = 6
const EDGE = 8

const current = computed(() => props.options.find((o) => o.value === props.modelValue))

const position = () => {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu) return
  const t = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - t.bottom - GAP - EDGE
  const spaceAbove = t.top - GAP - EDGE
  const dropUp = spaceBelow < Math.min(menu.scrollHeight, 220) && spaceAbove > spaceBelow
  menuStyle.value = {
    left: `${t.left}px`,
    width: `${t.width}px`,
    maxWidth: 'none',
    maxHeight: `${Math.max(120, Math.min(360, dropUp ? spaceAbove : spaceBelow))}px`,
    ...(dropUp ? {bottom: `${window.innerHeight - t.top + GAP}px`} : {top: `${t.bottom + GAP}px`}),
  }
}

const close = () => {
  isOpen.value = false
}

const toggle = async () => {
  if (isOpen.value) {
    close()
    return
  }
  isOpen.value = true
  await nextTick()
  position()
  menuRef.value?.querySelector<HTMLElement>('.dropdown-option.selected')?.scrollIntoView({block: 'nearest'})
}

const select = (option: SelectOption) => {
  close()
  if (option.value === props.modelValue) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

const handleOutsideClick = (e: MouseEvent) => {
  const target = e.target as Node
  if (!triggerRef.value?.contains(target) && !menuRef.value?.contains(target)) {
    close()
  }
}

// Capture phase on document, and stopped, so Esc closes only this menu and not the dialog it's in
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    triggerRef.value?.focus()
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeydown, true)
    window.addEventListener('resize', close)
  } else {
    document.removeEventListener('mousedown', handleOutsideClick)
    document.removeEventListener('keydown', handleKeydown, true)
    window.removeEventListener('resize', close)
  }
})
onBeforeUnmount(close)
</script>

<template>
  <button
    ref="triggerRef"
    v-bind="$attrs"
    type="button"
    class="kb-select"
    :class="{open: isOpen}"
    :aria-label="ariaLabel"
    aria-haspopup="listbox"
    :aria-expanded="isOpen"
    @click.stop="toggle"
  >
    <span class="kb-select-label" :class="{placeholder: !current}">{{ current?.label ?? placeholder }}</span>
    <span v-if="current?.hint" class="kb-select-hint">{{ current.hint }}</span>
    <svg class="kb-select-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M3.5 6L8 10.5L12.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>

  <Teleport to="body">
    <Transition name="dropdown-fade">
      <div v-if="isOpen" ref="menuRef" class="action-dropdown-menu kb-select-menu" :style="menuStyle" role="listbox" @click.stop>
        <div class="dropdown-body">
          <div
            v-for="option in options"
            :key="String(option.value)"
            class="dropdown-option"
            :class="{selected: option.value === modelValue}"
            role="option"
            :aria-selected="option.value === modelValue"
            :title="option.label"
            @click="select(option)"
          >
            <span class="dropdown-check" aria-hidden="true">
              <svg v-if="option.value === modelValue" viewBox="0 0 16 16" width="14" height="14">
                <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="dropdown-label">{{ option.label }}</span>
            <span v-if="option.hint" class="dropdown-hint">{{ option.hint }}</span>
          </div>
          <div v-if="!options.length" class="dropdown-empty">{{ placeholder }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.kb-select {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.92);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.25);
  }

  &.open,
  &:focus-visible {
    outline: none;
    border-color: #2a7bb0;
    box-shadow: 0 0 0 2px rgba(42, 123, 176, 0.35);
  }
}

.kb-select-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
}

.kb-select-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.kb-select-chevron {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.6);
  transition: transform 0.15s ease;

  .open & {
    transform: rotate(180deg);
  }
}
</style>
