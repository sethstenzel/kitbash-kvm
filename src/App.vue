<script lang="ts" setup>
import KBKvmController from '@/components/KBKvmController/index.vue'
import {addNotification} from '@/components/NotificationList/notification-list'
import {useSettingsStore} from '@/stores/settings'
import {useMacrosStore} from '@/stores/macros'

window.$notification = addNotification
useSettingsStore().migrate()
// Moves macros saved without a category (older versions) into the built-in Default category
useMacrosStore().normalize()
</script>

<template>
  <KBKvmController />
</template>
