import type { KSyncEvent, KSyncStorage } from '../types';

export class MemoryStorage implements KSyncStorage {
  private events: KSyncEvent[] = [];

  async getEvents(fromVersion?: number): Promise<KSyncEvent[]> {
    if (fromVersion === undefined) {
      return [...this.events];
    }
    return this.events.filter(event => event.version > fromVersion);
  }

  async storeEvent(event: KSyncEvent): Promise<void> {
    this.events.push(event);
  }

  async storeEvents(events: KSyncEvent[]): Promise<void> {
    this.events.push(...events);
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
  }
} 