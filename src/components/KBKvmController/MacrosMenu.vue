<script lang="ts" setup>
import {ref, computed} from 'vue'
import ActionDropdown from '@/components/KBKvmController/UI/ActionDropdown.vue'
import {useMacrosStore} from '@/stores/macros'
import {useSettingsStore} from '@/stores/settings'
import {isSerialConnected} from '@/components/KBKvmController/utils/serial-io'
import {sendAdvancedText} from '@/components/KBKvmController/utils/send-text'

const macrosStore = useMacrosStore()
const settingsStore = useSettingsStore()
const selectedMacro = ref('')

const hasMacros = computed(() => macrosStore.macros.length > 0)
const macroOptions = computed(() =>
  macrosStore.macros.map((m) => ({value: m.id, label: m.name}))
)

const handleMacroSelect = async () => {
  const macroId = selectedMacro.value
  selectedMacro.value = ''
  if (!macroId) {
    return
  }

  const macro = macrosStore.macros.find((m) => m.id === macroId)
  if (!macro) {
    window.$notification({
      type: 'error',
      message: 'Macro not found',
      timeout: 3000,
    })
    return
  }

  if (!isSerialConnected()) {
    window.$notification({
      type: 'error',
      message: 'Serial port not connected',
      timeout: 3000,
    })
    return
  }

  try {
    const done = await sendAdvancedText(macro.message, settingsStore.advancedTextEscapeStyle, {
      legacyMacroSyntax: true,
    })
    if (done) {
      window.$notification({
        type: 'success',
        message: `Executed macro: ${macro.name}`,
        timeout: 2000,
      })
    }
  } catch (error: any) {
    console.error('Macro execution error:', error)
    window.$notification({
      type: 'error',
      message: `Failed to execute macro: ${error.message}`,
      timeout: 3000,
    })
  }
}
</script>

<template>
  <ActionDropdown
    icon="macros"
    :title="hasMacros ? 'Macros' : 'No macros configured. Add macros in Settings.'"
    placeholder="Select Macro..."
    :options="macroOptions"
    :disabled="!hasMacros"
    v-model="selectedMacro"
    @change="handleMacroSelect"
  />
</template>
