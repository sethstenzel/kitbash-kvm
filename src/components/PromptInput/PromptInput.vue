<script setup lang="ts">
import {ref, toRefs, defineProps, defineEmits, watch} from 'vue'
import {useVModel} from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    title?: string
    value: string
    modelValue?: boolean
    closeOnClickOutside?: boolean
    type: 'input' | 'textarea'
    inputProps?: any
    validator?: (value: string) => any
  }>(),
  {
    value: '',
    modelValue: false,
    closeOnClickOutside: false,
  },
)
const emit = defineEmits(['confirm', 'cancel', 'update:modelValue'])
const mVisible = useVModel(props, 'modelValue', emit)

const formRef = ref()
const inputRef = ref()
const inputText = ref(props.value)
watch(mVisible, (val) => {
  if (val) {
    setTimeout(() => {
      inputRef.value.focus()
    })
  } else {
    emit('cancel')
  }
})

const handleConfirm = async () => {
  if (props.validator) {
    const error = await props.validator(inputText.value)
    if (error) {
      throw new Error(error)
    }
  }
  emit('confirm', inputText.value)
  mVisible.value = false
}

const handleOutsideClick = () => {
  if (props.closeOnClickOutside) {
    mVisible.value = false
  }
}
</script>

<template>
  <transition name="fade">
    <div class="popup-window" @keydown.stop @keyup.stop @click="handleOutsideClick" v-if="mVisible">
      <form
        ref="formRef"
        @submit.prevent="handleConfirm"
        @click.stop
        class="popup-content panel-blur-bg"
      >
        <div v-if="title" class="popup-title">{{ title }}</div>

        <textarea
          v-if="type === 'textarea'"
          ref="inputRef"
          class="themed-input"
          v-bind="inputProps"
          v-model="inputText"
          required
        />
        <input
          v-else
          ref="inputRef"
          class="themed-input"
          v-bind="inputProps"
          v-model="inputText"
          required
        />

        <div class="flex-row-center-gap">
          <button class="themed-button blue" type="submit">OK</button>
          <button type="button" class="themed-button" @click="mVisible = false">Cancel</button>
        </div>
      </form>
    </div>
  </transition>
</template>

<style scoped lang="scss">
.popup-window {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  padding: 20px;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;

  .popup-content {
    padding: 24px;
    border-radius: 16px;
    width: fit-content;
    min-width: 350px;
    max-width: 500px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5),
                0 0 0 1px rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.1);

    .popup-title {
      font-size: 18px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin-bottom: 4px;
    }

    input,
    textarea {
      min-height: 40px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.5;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

      &:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.3);
      }
    }

    textarea {
      min-height: 120px;
      resize: vertical;
    }

    button {
      height: 40px;
      padding: 0 20px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;

      &:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      &:active {
        transform: translateY(0);
      }
    }

    .flex-row-center-gap {
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
  }
}
</style>
