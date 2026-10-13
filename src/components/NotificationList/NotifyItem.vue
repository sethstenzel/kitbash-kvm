<script lang="ts" setup="">
import type {INotification} from '@/components/NotificationList/notification-list'
import {onBeforeUnmount, onMounted, ref} from 'vue'

const props = defineProps<{
  item: INotification
}>()
const emit = defineEmits(['remove'])

const TICK_MS = 10
const countdownMax = ref(0)
const countdownPercent = ref(100)
const isIn = ref(false)
let remaining = 0
let timer: ReturnType<typeof setInterval> | undefined

const stopTimer = () => {
  clearInterval(timer)
  timer = undefined
}

onMounted(() => {
  const timeout = props.item.timeout
  if (timeout && timeout > 0) {
    countdownMax.value = timeout
    remaining = timeout
    timer = setInterval(() => {
      // Paused while hovered
      if (isIn.value) {
        return
      }
      remaining -= TICK_MS
      countdownPercent.value = (remaining / countdownMax.value) * 100
      if (remaining <= 0) {
        stopTimer()
        emit('remove')
      }
    }, TICK_MS)
  }
})

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="notification-item" @mouseenter="isIn = true" @mouseleave="isIn = false">
    <div class="notification-item-inner panel-blur-bg">
      <div class="message-type" :class="item.type">{{ item.type }}</div>
      <div class="message-content" v-if="item.html" v-html="item.html"></div>
      <div class="message-content" v-else>{{ item.message }}</div>
      <div class="message-description" v-if="item.description">{{ item.description }}</div>
      <button class="btn-close" @click="emit('remove')">×</button>

      <div v-if="countdownMax" class="countdown-bar">
        <div class="bar-inner" :style="{width: `${countdownPercent}%`}"></div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.notification-item {
  user-select: none;
  pointer-events: auto;
  width: 100%;

  .notification-item-inner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-radius: 5px;
    overflow: hidden;

    .btn-close {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: inherit;
      position: absolute;
      top: 0;
      right: 0;
      user-select: none;
    }

    .countdown-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 1px;
      overflow: hidden;
      .bar-inner {
        width: 0;
        height: 100%;
        background-color: gray;
      }
    }
  }

  .message-type {
    text-transform: capitalize;
    font-weight: bold;
    font-size: 12px;
    &.info {
      color: #1e90ff; // DodgerBlue
    }

    &.warning {
      color: #ffcc00; // Amber
    }

    &.success {
      color: #4caf50; // MediumSeaGreen
    }

    &.error {
      color: #f44336; // Red
    }
  }

  .message-description {
    word-break: break-word;
    font-size: 12px;
    opacity: 0.75;
  }

  .message-content {
    word-break: break-word;
    :deep(a) {
      color: #1e90ff;
    }
  }
}
</style>
