<script lang="ts" setup="">
import type {INotification} from '@/components/NotificationList/notification-list'
import {onBeforeUnmount, onMounted, ref} from 'vue'

const props = defineProps<{
  item: INotification
}>()
const emit = defineEmits(['remove'])

const TITLES: Record<INotification['type'], string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
}

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
  <div
    class="notification-item"
    :class="item.type"
    :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
    @mouseenter="isIn = true"
    @mouseleave="isIn = false"
  >
    <span class="type-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path v-if="item.type === 'success'" d="M5 12.5l4.5 4.5L19 7.5" />
        <path v-else-if="item.type === 'error'" d="M7 7l10 10M17 7L7 17" />
        <path v-else-if="item.type === 'warning'" d="M12 6v7.5M12 18h0" />
        <path v-else d="M12 11v7M12 6.5h0" />
      </svg>
    </span>

    <div class="notification-body">
      <div class="message-type">{{ TITLES[item.type] ?? item.type }}</div>
      <div class="message-content" v-if="item.html" v-html="item.html"></div>
      <div class="message-content" v-else>{{ item.message }}</div>
      <div class="message-description" v-if="item.description">{{ item.description }}</div>
    </div>

    <button class="btn-close" aria-label="Dismiss" @click="emit('remove')">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>

    <div v-if="countdownMax" class="countdown-bar">
      <div class="bar-inner" :style="{width: `${countdownPercent}%`}"></div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Same family as the command bar, dropdowns and tooltips: deep logo-blue glass
.notification-item {
  --accent: #5aa9dc;

  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 38px 13px 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: rgba(0, 50, 76, 0.95);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.3);
  color: #f4f7fa;
  pointer-events: auto;
  user-select: none;

  &.success {
    --accent: #38e070;
  }

  &.warning {
    --accent: #ffb020;
  }

  &.error {
    --accent: #ff3f1e;
  }

  // Type stripe
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--accent);
  }
}

.type-icon {
  display: flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 1px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent);
}

.notification-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.message-type {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.message-content {
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-line;
  word-break: break-word;
  color: rgba(255, 255, 255, 0.94);

  :deep(a) {
    color: #8fd0f5;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

.message-description {
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
  color: rgba(255, 255, 255, 0.62);
}

.btn-close {
  position: absolute;
  top: 9px;
  right: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 1px;
  }
}

.countdown-bar {
  position: absolute;
  left: 3px;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.06);

  .bar-inner {
    height: 100%;
    background: var(--accent);
    opacity: 0.7;
  }
}
</style>
