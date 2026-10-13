<script setup lang="ts">
import KbIcon from '@/components/KBKvmController/UI/KbIcon.vue'
import {ref, computed, onMounted, onBeforeUnmount, nextTick} from 'vue'

export interface DropdownOption {
  value?: any
  label: string
  disabled?: boolean
  hidden?: boolean
  separator?: boolean
  group?: string
}

const props = withDefaults(
  defineProps<{
    icon: string
    title?: string
    placeholder?: string
    options: DropdownOption[]
    disabled?: boolean
    modelValue?: any
  }>(),
  {
    placeholder: 'Select...',
    disabled: false,
  },
)

const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)
const triggerRef = ref<HTMLElement>()
const dropdownRef = ref<HTMLElement>()
const dropUp = ref(false)

const visibleOptions = computed(() => props.options.filter(o => !o.hidden))
const hasValue = computed(() => props.modelValue !== '' && props.modelValue !== undefined && props.modelValue !== null)

const toggle = async () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    positionDropdown()
  }
}

const positionDropdown = () => {
  if (!triggerRef.value || !dropdownRef.value) return
  const triggerRect = triggerRef.value.getBoundingClientRect()
  const dropdownHeight = dropdownRef.value.offsetHeight
  const spaceBelow = window.innerHeight - triggerRect.bottom
  dropUp.value = spaceBelow < dropdownHeight + 8 && triggerRect.top > dropdownHeight + 8
}

const select = (option: DropdownOption) => {
  if (option.disabled || option.separator || option.value === undefined) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  isOpen.value = false
}

const handleOutsideClick = (e: MouseEvent) => {
  if (!triggerRef.value?.contains(e.target as Node) && !dropdownRef.value?.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') isOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    ref="triggerRef"
    class="action-dropdown"
    :class="{open: isOpen, activated: hasValue, disabled}"
    :title="title"
    @click.stop="toggle"
  >
    <KbIcon :name="icon" />

    <Teleport to="body">
      <Transition name="dropdown-fade">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="action-dropdown-menu"
          :class="{dropup: dropUp}"
          :style="{
            left: triggerRef ? triggerRef.getBoundingClientRect().left + 'px' : '0',
            top: dropUp
              ? (triggerRef ? triggerRef.getBoundingClientRect().top - 8 + 'px' : '0')
              : (triggerRef ? triggerRef.getBoundingClientRect().bottom + 8 + 'px' : '0'),
          }"
          @click.stop
        >
          <template v-for="(option, i) in visibleOptions" :key="i">
            <div v-if="option.separator" class="dropdown-separator"></div>
            <div
              v-else-if="option.value === undefined"
              class="dropdown-group-header"
            >{{ option.label }}</div>
            <div
              v-else
              class="dropdown-option"
              :class="{disabled: option.disabled}"
              @click="select(option)"
            >{{ option.label }}</div>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss">
/* Global — needed because dropdown is teleported to body */
.action-dropdown-menu {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  max-width: 320px;
  max-height: 320px;
  overflow-y: auto;
  background: rgba(18, 21, 33, 0.97);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 6px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;

  &.dropup {
    transform: translateY(-100%);
  }

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }

  .dropdown-option {
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
      background: rgba(79, 142, 247, 0.2);
      color: #fff;
    }

    &:active {
      background: rgba(79, 142, 247, 0.35);
    }

    &.disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }
  }

  .dropdown-separator {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 5px 4px;
  }

  .dropdown-group-header {
    padding: 6px 12px 3px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.35);
    cursor: default;
  }
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>

<style lang="scss" scoped>
.action-dropdown {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: translateY(0);
  }

  &.open {
    background: rgba(79, 142, 247, 0.15);
    color: #4f8ef7;
  }

  &.activated::after {
    background-color: #4caf50;
    box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
  }

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: currentColor;
    border-radius: 10px;
    pointer-events: none;
    transition: all 0.3s ease;
  }

  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  .mdi {
    font-size: 22.5px;
    pointer-events: none;
  }
}
</style>
