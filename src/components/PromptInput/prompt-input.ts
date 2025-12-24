import {ref, createApp, h} from 'vue'
import PromptInput from './PromptInput.vue'

// Global state to track if any prompt is currently visible
export const isPromptVisible = ref(false)

export const createPrompt = async (
  initValue: string,
  title: string,
  props: any = {},
): Promise<string | null> => {
  return new Promise((resolve) => {
    const isVisible = ref(false)
    const app = createApp({
      setup() {
        const handleConfirm = (value: string) => {
          resolve(value)
          destroyPopup()
        }

        const handleCancel = () => {
          resolve(null)
          setTimeout(() => {
            destroyPopup()
          }, 310)
        }

        // Use render function instead of TSX
        return () => {
          return h(PromptInput, {
            value: initValue,
            title,
            modelValue: isVisible.value,
            'onUpdate:modelValue': (value: boolean) => {
              isVisible.value = value
              isPromptVisible.value = value
            },
            onConfirm: handleConfirm,
            onCancel: handleCancel,
            ...props,
          })
        }
      },
    })

    const popupContainer = document.createElement('div')
    document.body.appendChild(popupContainer)
    app.mount(popupContainer)
    isVisible.value = true
    isPromptVisible.value = true

    const destroyPopup = () => {
      app.unmount()
      document.body.removeChild(popupContainer)
      isPromptVisible.value = false
    }
  })
}
