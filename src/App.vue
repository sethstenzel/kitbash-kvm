<script lang="ts" setup>
import KBKvmController from '@/components/KBKvmController/index.vue'
import {addNotification} from '@/components/NotificationList/notification-list'
import {useSettingsStore} from '@/stores/settings'

window.$notification = addNotification
useSettingsStore().migrate()
</script>

<template>
  <KBKvmController />
</template>
