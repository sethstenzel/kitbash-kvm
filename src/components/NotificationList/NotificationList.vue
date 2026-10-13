<script lang="ts" setup>
import {toRefs} from 'vue'
import type {INotification} from '@/components/NotificationList/notification-list'
import NotifyItem from '@/components/NotificationList/NotifyItem.vue'

const props = defineProps<{
  notifications: INotification[]
}>()
const {notifications} = toRefs(props)

const removeNotification = (id: number) => {
  const index = notifications.value.findIndex((n) => n.id === id)
  if (index !== -1) {
    notifications.value.splice(index, 1)
  }
}
</script>

<template>
  <div class="notification-list scrollbar-mini" tabindex="-1">
    <TransitionGroup name="list" tag="div" class="notification-container">
      <NotifyItem
        v-for="item in notifications"
        :key="item.id"
        :item="item"
        @remove="removeNotification(item.id)"
      />
    </TransitionGroup>
  </div>
</template>

<style lang="scss" scoped>
.notification-list {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  // Starts below the command bar so a docked (full-width) bar's buttons stay clickable
  padding: 62px 14px 14px;
  width: 340px;
  max-width: calc(100vw - 28px);
  z-index: 1000;
  overflow: hidden;
  pointer-events: none;
  outline: none;
  caret-color: transparent;

  button {
    pointer-events: auto;
  }

  .notification-container {
    position: relative;
    list-style-type: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}

.list-move, /* Apply transition to moving elements */
.list-enter-active,
.list-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(24px) scale(0.98);
}

/* Ensure leaving elements are removed from layout flow
   so that the moving animation can be calculated correctly. */
.list-leave-active {
  position: absolute;
}
</style>
