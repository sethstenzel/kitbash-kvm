<script lang="ts" setup>
import KBKvmController from '@/components/KBKvmController/index.vue'
import {addNotification} from '@/components/NotificationList/notification-list'

window.$notification = addNotification
</script>

<template>
  <KBKvmController />
</template>
