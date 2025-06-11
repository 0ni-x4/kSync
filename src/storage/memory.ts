import type { KSyncEvent, KSyncStorage } from '../types';

export interface MemoryStorageOptions {
  maxEvents?: number;      // Maximum events to store (default: 10000)
  maxMemoryMB?: number;    // Maximum memory usage in MB (default: 50)
  trimOnLimit?: boolean;   // Trim old events when limit reached (default: true)
  compressionEnabled?: boolean; // Enable compression for large events (default: false)
}

export class MemoryStorage implements KSyncStorage {
  private events: KSyncEvent[] = [];
  private options: Required<MemoryStorageOptions>;
  private memoryUsageBytes = 0;

  constructor(options: MemoryStorageOptions = {}) {
    this.options = {
      maxEvents: options.maxEvents ?? 10000,
      maxMemoryMB: options.maxMemoryMB ?? 50,
      trimOnLimit: options.trimOnLimit ?? true,
      compressionEnabled: options.compressionEnabled ?? false
    };
  }

  async getEvents(fromVersion?: number): Promise<KSyncEvent[]> {
    if (fromVersion === undefined) {
      return [...this.events];
    }
    return this.events.filter(event => event.version > fromVersion);
  }

  async storeEvent(event: KSyncEvent): Promise<void> {
    await this.storeEvents([event]);
  }

  async storeEvents(events: KSyncEvent[]): Promise<void> {
    // Calculate memory usage of new events
    const newEventSize = this.calculateEventSize(events);
    
    // Check memory limits before adding
    if (this.memoryUsageBytes + newEventSize > this.options.maxMemoryMB * 1024 * 1024) {
      if (this.options.trimOnLimit) {
        await this.trimToFitMemory(newEventSize);
      } else {
        throw new Error(`Memory limit exceeded: ${this.options.maxMemoryMB}MB`);
      }
    }

    this.events.push(...events);
    this.memoryUsageBytes += newEventSize;
    
    // Check event count limits
    if (this.events.length > this.options.maxEvents) {
      if (this.options.trimOnLimit) {
        const eventsToRemove = this.events.length - this.options.maxEvents;
        const removedEvents = this.events.splice(0, eventsToRemove);
        this.memoryUsageBytes -= this.calculateEventSize(removedEvents);
      } else {
        throw new Error(`Event limit exceeded: ${this.options.maxEvents} events`);
      }
    }
  }

  async saveEvents(events: KSyncEvent[]): Promise<void> {
    return this.storeEvents(events);
  }

  async loadEvents(): Promise<KSyncEvent[]> {
    return [...this.events];
  }

  async getLastVersion(): Promise<number> {
    if (this.events.length === 0) return 0;
    return Math.max(...this.events.map(e => e.version));
  }

  async clear(): Promise<void> {
    this.events = [];
    this.memoryUsageBytes = 0;
  }

  // Get storage statistics
  getStats() {
    return {
      eventCount: this.events.length,
      memoryUsageBytes: this.memoryUsageBytes,
      memoryUsageMB: this.memoryUsageBytes / (1024 * 1024),
      memoryUtilization: (this.memoryUsageBytes / (this.options.maxMemoryMB * 1024 * 1024)) * 100,
      maxEvents: this.options.maxEvents,
      maxMemoryMB: this.options.maxMemoryMB
    };
  }

  private calculateEventSize(events: KSyncEvent[]): number {
    // Rough estimation of memory usage
    return events.reduce((total, event) => {
      const eventString = JSON.stringify(event);
      return total + (eventString.length * 2); // UTF-16 uses 2 bytes per character
    }, 0);
  }

  private async trimToFitMemory(requiredBytes: number): Promise<void> {
    const targetMemory = (this.options.maxMemoryMB * 1024 * 1024) - requiredBytes;
    
    while (this.memoryUsageBytes > targetMemory && this.events.length > 0) {
      const removedEvent = this.events.shift()!;
      this.memoryUsageBytes -= this.calculateEventSize([removedEvent]);
    }
  }
} 