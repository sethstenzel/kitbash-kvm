<script lang="ts" setup>
import {ref, computed} from 'vue'
import ActionDropdown, {type DropdownOption} from '@/components/KBKvmController/UI/ActionDropdown.vue'
import {useMacrosStore, type IMacro} from '@/stores/macros'
import {useSettingsStore} from '@/stores/settings'
import {isSerialConnected} from '@/components/KBKvmController/utils/serial-io'
import {sendAdvancedText} from '@/components/KBKvmController/utils/send-text'

const macrosStore = useMacrosStore()
const settingsStore = useSettingsStore()
const selectedMacro = ref('')

const hasMacros = computed(() => macrosStore.macros.length > 0)
// Categories are parent items with their macros in a sub-menu; uncategorized macros follow
// them at the top level. Empty categories are left out.
const macroOptions = computed<DropdownOption[]>(() => {
  const toOption = (m: IMacro) => ({value: m.id, label: m.name})
  const categories = macrosStore.categories
    .map((c) => {
      const children = macrosStore.macros.filter((m) => m.categoryId === c.id).map(toOption)
      return {label: c.name, hint: String(children.length), children}
    })
    .filter((c) => c.children.length)
  const uncategorized = macrosStore.macros
    .filter((m) => !macrosStore.categoryById(m.categoryId))
    .map(toOption)
  if (categories.length && uncategorized.length) {
    return [...categories, {label: '', separator: true}, ...uncategorized]
  }
  return [...categories, ...uncategorized]
})

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
