<script setup lang="ts">
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {ref, computed, onBeforeUnmount, nextTick, watch} from 'vue'

export interface DropdownOption {
  value?: any
  label: string
  disabled?: boolean
  hidden?: boolean
  separator?: boolean
  group?: boolean | string
  // Muted text shown to the right of the label
  hint?: string
}

const props = withDefaults(
  defineProps<{
    icon: string
    title?: string
    placeholder?: string
    options: DropdownOption[]
    disabled?: boolean
    modelValue?: any
    // Picker (shows the current value with a check) rather than a one-shot action menu
    selectable?: boolean
    // Render labels like 'Ctrl + Alt + Del' as key caps
    keycaps?: boolean
  }>(),
  {
    placeholder: 'Select...',
    disabled: false,
    selectable: false,
    keycaps: false,
  },
)

const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)
const triggerRef = ref<HTMLElement>()
const menuRef = ref<HTMLElement>()
const menuStyle = ref<Record<string, string>>({})

const MENU_GAP = 8
const VIEWPORT_MARGIN = 8

// Old option lists used a dashed label as a divider
const isSeparator = (o: DropdownOption) => o.separator || /^-{3,}$/.test(o.label)
const visibleOptions = computed(() => props.options.filter((o) => !o.hidden))
const hasValue = computed(
  () => props.modelValue !== '' && props.modelValue !== undefined && props.modelValue !== null,
)
const isSelected = (o: DropdownOption) => props.selectable && o.value === props.modelValue
const keycapsOf = (label: string) => label.split(/\s*\+\s*/)

const positionMenu = () => {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu) return
  const t = trigger.getBoundingClientRect()
  const width = menu.offsetWidth
  const spaceBelow = window.innerHeight - t.bottom - MENU_GAP - VIEWPORT_MARGIN
  const spaceAbove = t.top - MENU_GAP - VIEWPORT_MARGIN
  const dropUp = spaceBelow < Math.min(menu.scrollHeight, 240) && spaceAbove > spaceBelow
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, t.left + t.width / 2 - width / 2),
    window.innerWidth - width - VIEWPORT_MARGIN,
  )
  menuStyle.value = {
    left: `${left}px`,
    maxHeight: `${Math.max(120, Math.min(460, dropUp ? spaceAbove : spaceBelow))}px`,
    ...(dropUp
      ? {bottom: `${window.innerHeight - t.top + MENU_GAP}px`}
      : {top: `${t.bottom + MENU_GAP}px`}),
  }
}

const close = () => {
  isOpen.value = false
}

const toggle = async () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    positionMenu()
    menuRef.value?.querySelector<HTMLElement>('.dropdown-option.selected')?.scrollIntoView({block: 'nearest'})
  }
}

const select = (option: DropdownOption) => {
  if (option.disabled || isSeparator(option) || option.value === undefined) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  close()
}

const handleOutsideClick = (e: MouseEvent) => {
  const target = e.target as Node
  if (!triggerRef.value?.contains(target) && !menuRef.value?.contains(target)) {
    close()
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

// Only listen while open
watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeydown)
    window.addEventListener('resize', positionMenu)
  } else {
    document.removeEventListener('mousedown', handleOutsideClick)
    document.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('resize', positionMenu)
  }
})
onBeforeUnmount(close)
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="btn-no-style action-dropdown"
    :class="{open: isOpen, activated: selectable && hasValue}"
    :title="title"
    :disabled="disabled"
    :aria-label="title"
    aria-haspopup="menu"
    :aria-expanded="isOpen"
    @click.stop="toggle"
  >
    <KbIcon :name="icon" />
    <slot name="badge" />

    <Teleport to="body">
      <Transition name="dropdown-fade">
        <div
          v-if="isOpen"
          ref="menuRef"
          class="action-dropdown-menu"
          :style="menuStyle"
          role="menu"
          @click.stop
        >
          <div v-if="title" class="dropdown-header">
            <KbIcon :name="icon" :size="16" />
            <span>{{ title }}</span>
          </div>
          <div class="dropdown-body">
            <template v-for="(option, i) in visibleOptions" :key="i">
              <div v-if="isSeparator(option)" class="dropdown-separator" role="separator"></div>
              <div v-else-if="option.value === undefined" class="dropdown-group-header">
                {{ option.label }}
              </div>
              <div
                v-else
                class="dropdown-option"
                :class="{disabled: option.disabled, selected: isSelected(option)}"
                role="menuitem"
                :title="option.label"
                @click="select(option)"
              >
                <span v-if="selectable" class="dropdown-check" aria-hidden="true">
                  <svg v-if="isSelected(option)" viewBox="0 0 16 16" width="14" height="14">
                    <path
                      d="M3 8.5l3.2 3L13 4.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span v-if="keycaps" class="dropdown-keycaps">
                  <kbd v-for="(cap, j) in keycapsOf(option.label)" :key="j">{{ cap }}</kbd>
                </span>
                <span v-else class="dropdown-label">{{ option.label }}</span>
                <span v-if="option.hint" class="dropdown-hint">{{ option.hint }}</span>
              </div>
            </template>
            <div v-if="!visibleOptions.length" class="dropdown-empty">{{ placeholder }}</div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </button>
</template>

<style lang="scss">
/* Global — the menu is teleported to body. Matches the command bar: logo blue with light-white accents */
.action-dropdown-menu {
  --kb-accent: rgba(255, 255, 255, 0.9);
  --kb-accent-soft: rgba(255, 255, 255, 0.12);

  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  max-width: min(360px, calc(100vw - 16px));
  overflow: hidden;
  background: rgba(0, 66, 100, 0.97);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.55),
    0 2px 8px rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  user-select: none;

  .dropdown-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 9px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.12);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }

  .dropdown-body {
    overflow-y: auto;
    padding: 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.18) transparent;

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 6px;
    }
  }

  .dropdown-option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    padding: 6px 12px;
    border-radius: 7px;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 7px;
      bottom: 7px;
      width: 3px;
      border-radius: 3px;
      background: var(--kb-accent);
      opacity: 0;
      transition: opacity 0.12s ease;
    }

    &:hover {
      background: var(--kb-accent-soft);
      color: #fff;

      &::before {
        opacity: 1;
      }
    }

    &:active {
      background: rgba(255, 255, 255, 0.2);
    }

    &.selected {
      color: #fff;
      font-weight: 600;

      .dropdown-check {
        color: #fff;
      }
    }

    &.disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }
  }

  .dropdown-check {
    display: flex;
    flex: 0 0 14px;
    justify-content: center;
  }

  .dropdown-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-keycaps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;

    kbd {
      min-width: 22px;
      padding: 2px 7px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-bottom-width: 2px;
      background: rgba(255, 255, 255, 0.06);
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 600;
      line-height: 1.5;
      text-align: center;
      color: rgba(255, 255, 255, 0.92);
    }
  }

  .dropdown-hint {
    margin-left: auto;
    padding-left: 12px;
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
  }

  .dropdown-separator {
    height: 1px;
    margin: 6px 8px;
    background: rgba(255, 255, 255, 0.08);
  }

  .dropdown-group-header {
    padding: 10px 12px 4px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);

    &:first-child {
      padding-top: 4px;
    }
  }

  .dropdown-empty {
    padding: 10px 12px;
    color: rgba(255, 255, 255, 0.45);
  }
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>

<style lang="scss" scoped>
/* Base look comes from the command bar's .btn-no-style */
.action-dropdown {
  position: relative;
  cursor: pointer;

  &.open {
    background-color: rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
  }

  // Picker with a value: small accent bar under the icon
  &.activated::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 2px;
    height: 2px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.85);
    pointer-events: none;
  }
}
</style>
