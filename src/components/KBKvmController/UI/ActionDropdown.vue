<script setup lang="ts">
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {ref, computed, onBeforeUnmount, nextTick, watch} from 'vue'
import './kb-menu.scss'

export interface DropdownOption {
  value?: any
  label: string
  disabled?: boolean
  hidden?: boolean
  separator?: boolean
  group?: boolean | string
  // Muted text shown to the right of the label
  hint?: string
  // Shown as a sub-menu next to this item
  children?: DropdownOption[]
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
const subRef = ref<HTMLElement>()
const menuStyle = ref<Record<string, string>>({})
const subStyle = ref<Record<string, string>>({})
// Index (in visibleOptions) of the item whose sub-menu is open
const openParent = ref<number | null>(null)

const MENU_GAP = 8
const VIEWPORT_MARGIN = 8
const SUBMENU_GAP = 4
// Grace period so the pointer can travel diagonally from a parent item onto its sub-menu
const SUBMENU_CLOSE_DELAY_MS = 220

// Old option lists used a dashed label as a divider
const isSeparator = (o: DropdownOption) => o.separator || /^-{3,}$/.test(o.label)
const isParent = (o: DropdownOption) => !!o.children
const visibleOptions = computed(() => props.options.filter((o) => !o.hidden))
const subOptions = computed(() =>
  openParent.value === null
    ? []
    : (visibleOptions.value[openParent.value]?.children ?? []).filter((o) => !o.hidden),
)
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

/* ---------- sub-menus ---------- */

let subCloseTimer: ReturnType<typeof setTimeout> | null = null
const cancelSubClose = () => {
  if (subCloseTimer) {
    clearTimeout(subCloseTimer)
    subCloseTimer = null
  }
}
const scheduleSubClose = () => {
  cancelSubClose()
  subCloseTimer = setTimeout(() => (openParent.value = null), SUBMENU_CLOSE_DELAY_MS)
}

const positionSub = (row: HTMLElement) => {
  const sub = subRef.value
  if (!sub) return
  const r = row.getBoundingClientRect()
  const menuRect = menuRef.value?.getBoundingClientRect() ?? r
  const width = sub.offsetWidth
  // Right of the menu, or flipped to its left when there's no room
  let left = menuRect.right + SUBMENU_GAP
  if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, menuRect.left - SUBMENU_GAP - width)
  }
  const maxHeight = window.innerHeight - 2 * VIEWPORT_MARGIN
  const height = Math.min(sub.scrollHeight, maxHeight)
  const top = Math.min(
    Math.max(VIEWPORT_MARGIN, r.top - 7),
    window.innerHeight - VIEWPORT_MARGIN - height,
  )
  subStyle.value = {left: `${left}px`, top: `${top}px`, maxHeight: `${maxHeight}px`}
}

const openSub = async (index: number, row: HTMLElement) => {
  cancelSubClose()
  if (openParent.value === index) return
  openParent.value = index
  await nextTick()
  positionSub(row)
}

const handleRowEnter = (index: number, option: DropdownOption, e: MouseEvent) => {
  if (isParent(option)) {
    void openSub(index, e.currentTarget as HTMLElement)
  } else if (openParent.value !== null) {
    scheduleSubClose()
  }
}

/* ---------- open / select ---------- */

const close = () => {
  cancelSubClose()
  openParent.value = null
  isOpen.value = false
}

const toggle = async () => {
  if (props.disabled) return
  if (isOpen.value) {
    close()
    return
  }
  isOpen.value = true
  await nextTick()
  positionMenu()
  menuRef.value
    ?.querySelector<HTMLElement>('.dropdown-option.selected')
    ?.scrollIntoView({block: 'nearest'})
}

const select = (option: DropdownOption, index: number, e: MouseEvent) => {
  if (option.disabled || isSeparator(option)) return
  // Parent items open their sub-menu on click too (touch screens have no hover)
  if (isParent(option)) {
    void openSub(index, e.currentTarget as HTMLElement)
    return
  }
  if (option.value === undefined) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  close()
}

const handleOutsideClick = (e: MouseEvent) => {
  const target = e.target as Node
  if (
    !triggerRef.value?.contains(target) &&
    !menuRef.value?.contains(target) &&
    !subRef.value?.contains(target)
  ) {
    close()
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  // Esc closes an open sub-menu first, then the menu
  if (openParent.value !== null) {
    openParent.value = null
  } else {
    close()
  }
}

const handleResize = () => {
  openParent.value = null
  positionMenu()
}

// Only listen while open
watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeydown)
    window.addEventListener('resize', handleResize)
  } else {
    document.removeEventListener('mousedown', handleOutsideClick)
    document.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('resize', handleResize)
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
          <div class="dropdown-body" @scroll="openParent = null">
            <template v-for="(option, i) in visibleOptions" :key="i">
              <div v-if="isSeparator(option)" class="dropdown-separator" role="separator"></div>
              <div
                v-else-if="option.value === undefined && !isParent(option)"
                class="dropdown-group-header"
              >
                {{ option.label }}
              </div>
              <div
                v-else
                class="dropdown-option"
                :class="{
                  disabled: option.disabled,
                  selected: isSelected(option),
                  parent: isParent(option),
                  expanded: openParent === i,
                }"
                role="menuitem"
                :aria-haspopup="isParent(option) ? 'menu' : undefined"
                :aria-expanded="isParent(option) ? openParent === i : undefined"
                :title="option.label"
                @mouseenter="handleRowEnter(i, option, $event)"
                @mouseleave="isParent(option) && scheduleSubClose()"
                @click="select(option, i, $event)"
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
                <svg
                  v-if="isParent(option)"
                  class="dropdown-chevron"
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3.5L10.5 8L6 12.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
            </template>
            <div v-if="!visibleOptions.length" class="dropdown-empty">{{ placeholder }}</div>
          </div>
        </div>
      </Transition>

      <!-- Sub-menu of the hovered/clicked parent item -->
      <div
        v-if="isOpen && openParent !== null"
        ref="subRef"
        class="action-dropdown-menu dropdown-submenu"
        :style="subStyle"
        role="menu"
        @click.stop
        @mouseenter="cancelSubClose"
        @mouseleave="scheduleSubClose"
      >
        <div class="dropdown-body">
          <template v-for="(option, i) in subOptions" :key="i">
            <div v-if="isSeparator(option)" class="dropdown-separator" role="separator"></div>
            <div
              v-else
              class="dropdown-option"
              :class="{disabled: option.disabled, selected: isSelected(option)}"
              role="menuitem"
              :title="option.label"
              @click="select(option, i, $event)"
            >
              <span class="dropdown-label">{{ option.label }}</span>
              <span v-if="option.hint" class="dropdown-hint">{{ option.hint }}</span>
            </div>
          </template>
          <div v-if="!subOptions.length" class="dropdown-empty">Empty</div>
        </div>
      </div>
    </Teleport>
  </button>
</template>

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
