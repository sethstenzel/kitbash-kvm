type Listener = (data?: any) => void

class EventBus {
  private events: {[key: string]: Listener[]} = {}

  // Register event listener; returns a function that removes it
  on(event: string, listener: Listener): () => void {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(listener)
    return () => this.off(event, listener)
  }

  // Trigger event
  emit(event: string, data?: any): void {
    // Copy so listeners that call off() during emit don't skip siblings
    const listeners = this.events[event]
    if (listeners) {
      listeners.slice().forEach((listener) => listener(data))
    }
  }

  // Remove event listener
  off(event: string, listener: Listener): void {
    if (!this.events[event]) return

    this.events[event] = this.events[event].filter((l) => l !== listener)
    if (!this.events[event].length) {
      delete this.events[event]
    }
  }
}

// Export event bus instance
export const eventBus = new EventBus()
