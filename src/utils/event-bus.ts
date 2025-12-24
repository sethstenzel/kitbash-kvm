class EventBus {
  private events: {[key: string]: Function[]} = {}

  // Register event listener
  on(event: string, listener: Function): void {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(listener)
  }

  // Trigger event
  emit(event: string, data?: any): void {
    if (this.events[event]) {
      this.events[event].forEach((listener) => listener(data))
    }
  }

  // Remove event listener
  off(event: string, listener: Function): void {
    if (!this.events[event]) return

    this.events[event] = this.events[event].filter((l) => l !== listener)
  }
}

// Export event bus instance
export const eventBus = new EventBus()
