<script setup lang="ts">
import {ref, watch} from 'vue'
import {useVModel} from '@vueuse/core'
import type {IMacro} from '@/stores/macros'

interface Props {
  visible: boolean
  macro?: IMacro | null
}

const emit = defineEmits(['update:visible', 'save'])
const props = withDefaults(defineProps<Props>(), {
  visible: false,
  macro: null,
})

const mVisible = useVModel(props, 'visible', emit)

const macroName = ref('')
const macroMessage = ref('')
const nameError = ref('')

watch(mVisible, (val) => {
  if (val) {
    if (props.macro) {
      // Editing existing macro
      macroName.value = props.macro.name
      macroMessage.value = props.macro.message
    } else {
      // Creating new macro
      macroName.value = ''
      macroMessage.value = ''
    }
    nameError.value = ''
  }
})

const validateName = () => {
  nameError.value = ''
  if (!macroName.value.trim()) {
    nameError.value = 'Name is required'
    return false
  }
  if (macroName.value.length > 30) {
    nameError.value = 'Name must be 30 characters or less'
    return false
  }
  return true
}

const handleSave = () => {
  if (!validateName()) {
    return
  }
  if (!macroMessage.value.trim()) {
    window.$notification({
      type: 'warning',
      message: 'Macro message cannot be empty',
      timeout: 3000,
    })
    return
  }

  emit('save', {
    name: macroName.value.trim(),
    message: macroMessage.value,
  })
  mVisible.value = false
}

const handleCancel = () => {
  mVisible.value = false
}
</script>

<template>
  <transition name="fade">
    <div class="macro-dialog" v-if="mVisible" @keydown.stop @keyup.stop>
      <div class="macro-backdrop" @click="handleCancel"></div>

      <div class="macro-panel panel-blur-bg">
        <div class="macro-header">
          <h3>
            <span class="mdi mdi-script-text-play"></span>
            {{ macro ? 'Edit Macro' : 'Add Macro' }}
          </h3>
          <button class="btn-close" @click="handleCancel">
            <span class="mdi mdi-close"></span>
          </button>
        </div>

        <div class="macro-content">
          <div class="form-group">
            <label class="form-label">
              <span class="mdi mdi-tag"></span>
              Macro Name
              <span class="char-count">{{ macroName.length }}/30</span>
            </label>
            <input
              v-model="macroName"
              type="text"
              class="themed-input"
              :class="{'input-error': nameError}"
              placeholder="Enter macro name (max 30 chars)"
              maxlength="30"
              @input="validateName"
            />
            <span v-if="nameError" class="error-message">{{ nameError }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">
              <span class="mdi mdi-text"></span>
              Macro Message
              <span class="help-text">Use |||COMMAND||| syntax for special keys</span>
            </label>
            <textarea
              v-model="macroMessage"
              class="themed-input"
              rows="8"
              placeholder="Example: sudo apt update|||ENTER|||"
            ></textarea>
          </div>

          <div class="info-box">
            <span class="mdi mdi-information-outline"></span>
            <div class="info-content">
              <strong>Command Key Syntax:</strong>
              <ul>
                <li>Special keys: |||ENTER|||, |||TAB|||, |||ESC|||</li>
                <li>Modifiers: |||CTRL+C|||, |||ALT+F4|||, |||SHIFT+TAB|||</li>
                <li>Function keys: |||F1|||, |||F2|||, ... |||F12|||</li>
                <li>Delay: |||DELAY=3||| (wait 3 seconds before continuing)</li>
              </ul>
            </div>
          </div>

          <div class="button-group">
            <button class="themed-button blue" @click="handleSave">
              <span class="mdi mdi-content-save"></span>
              Save
            </button>
            <button class="themed-button" @click="handleCancel">
              <span class="mdi mdi-close"></span>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped lang="scss">
.macro-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  .macro-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
  }

  .macro-panel {
    position: relative;
    width: 100%;
    max-width: 550px;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
  }

  .macro-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      display: flex;
      align-items: center;
      gap: 10px;

      .mdi {
        font-size: 22px;
        color: #ffa01e;
      }
    }

    .btn-close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      font-size: 24px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
    }
  }

  .macro-content {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .form-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.9);

      .mdi {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.6);
      }

      .char-count {
        margin-left: auto;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        font-weight: 400;
      }

      .help-text {
        margin-left: auto;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        font-weight: 400;
      }
    }

    .themed-input {
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

      &.input-error {
        border-color: #f44336;
        box-shadow: 0 0 0 2px rgba(244, 67, 54, 0.2);
      }
    }

    textarea.themed-input {
      resize: vertical;
      font-family: 'Courier New', monospace;
    }

    .error-message {
      font-size: 12px;
      color: #f44336;
      margin-top: -4px;
    }
  }

  .info-box {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(33, 150, 243, 0.1);
    border: 1px solid rgba(33, 150, 243, 0.3);
    border-radius: 8px;
    font-size: 13px;

    .mdi {
      font-size: 20px;
      color: #2196f3;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .info-content {
      flex: 1;
      color: rgba(255, 255, 255, 0.8);

      strong {
        display: block;
        margin-bottom: 8px;
        color: rgba(255, 255, 255, 0.95);
      }

      ul {
        margin: 0;
        padding-left: 20px;
        list-style-type: disc;

        li {
          margin: 4px 0;
          color: rgba(255, 255, 255, 0.7);
        }
      }
    }
  }

  .button-group {
    display: flex;
    gap: 12px;
    justify-content: flex-end;

    button {
      height: 40px;
      padding: 0 20px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;

      .mdi {
        font-size: 18px;
      }

      &:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      &:active {
        transform: translateY(0);
      }
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
