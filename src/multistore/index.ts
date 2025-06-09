import { KSync } from '../core';
import { KSyncConfig, KSyncStorage, KSyncSync } from '../types';
import { DrizzleKSyncAdapter, DrizzleConfig } from '../drizzle';

export interface MultistoreConfig {
  stores: Record<string, KSyncConfig>;
  sharedSync?: boolean;
  globalConfig?: Partial<KSyncConfig>;
}

export interface CrossStoreQuery {
  stores: string[];
  query: string;
  params?: any[];
}

export class KSyncMultistore {
  private stores: Map<string, KSync> = new Map();
  private drizzleAdapters: Map<string, DrizzleKSyncAdapter> = new Map();
  private sharedSync?: KSyncSync;
  private isInitialized = false;

  constructor(private config: MultistoreConfig) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Multistore already initialized');
    }

    // Initialize shared sync if configured
    if (this.config.sharedSync && this.config.globalConfig?.serverUrl) {
      const { WebSocketSyncClient } = await import('../sync/websocket-client');
      this.sharedSync = new WebSocketSyncClient(this.config.globalConfig.serverUrl);
      await this.sharedSync.connect();
    }

    // Initialize individual stores
    for (const [storeName, storeConfig] of Object.entries(this.config.stores)) {
      const mergedConfig = {
        ...this.config.globalConfig,
        ...storeConfig,
        clientId: storeConfig.clientId || `${storeName}-${this.generateId()}`
      };

      const store = new KSync(mergedConfig);
      
      // Use shared sync if configured, otherwise individual sync
      const sync = this.config.sharedSync ? this.sharedSync : undefined;
      
      await store.initialize(undefined, sync);
      this.stores.set(storeName, store);

      // Create Drizzle adapter for each store
      const drizzleConfig: DrizzleConfig = {
        storeName,
        crdtMode: storeConfig.debug || false // Enable CRDT mode in debug
      };
      
      const adapter = new DrizzleKSyncAdapter(drizzleConfig);
      this.drizzleAdapters.set(storeName, adapter);

      // Sync events with Drizzle adapter
      this.syncStoreWithAdapter(storeName, store, adapter);
    }

    this.isInitialized = true;
  }

  // Get a specific store
  getStore(name: string): KSync {
    const store = this.stores.get(name);
    if (!store) {
      throw new Error(`Store '${name}' not found`);
    }
    return store;
  }

  // Get all store names
  getStoreNames(): string[] {
    return Array.from(this.stores.keys());
  }

  // Get Drizzle adapter for a store
  getDrizzle(storeName: string): DrizzleKSyncAdapter {
    const adapter = this.drizzleAdapters.get(storeName);
    if (!adapter) {
      throw new Error(`Drizzle adapter for store '${storeName}' not found`);
    }
    return adapter;
  }

  // Cross-store event sending
  async broadcast(eventType: string, data: any, excludeStores?: string[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [storeName, store] of this.stores) {
      if (excludeStores?.includes(storeName)) continue;
      
      promises.push(store.send(eventType, data));
    }

    await Promise.all(promises);
  }

  // Cross-store event listening
  onCrossStore(eventType: string, listener: (storeName: string, event: any) => void): void {
    for (const [storeName, store] of this.stores) {
      store.on(eventType, (event) => {
        listener(storeName, event);
      });
    }
  }

  // Cross-store query (simple version)
  async crossQuery(query: CrossStoreQuery): Promise<any[]> {
    const results: any[] = [];

    for (const storeName of query.stores) {
      const adapter = this.drizzleAdapters.get(storeName);
      if (!adapter) continue;

      // Simple implementation - extend based on needs
      const events = (adapter as any).events || [];
      const storeResults = events
        .filter((event: any) => event.type === query.query)
        .map((event: any) => ({ ...event.data, __store: storeName }));
      
      results.push(...storeResults);
    }

    return results;
  }

  // Store-to-store data sync
  async syncStores(fromStore: string, toStore: string, eventTypes?: string[]): Promise<void> {
    const source = this.stores.get(fromStore);
    const target = this.stores.get(toStore);

    if (!source || !target) {
      throw new Error(`Source or target store not found`);
    }

    const events = source.getEvents();
    const filteredEvents = eventTypes 
      ? events.filter(event => eventTypes.includes(event.type))
      : events;

    for (const event of filteredEvents) {
      await target.send(event.type, event.data);
    }
  }

  // Create a derived store (reads from multiple stores)
  createDerivedStore(name: string, sourceStores: string[], config?: Partial<KSyncConfig>): KSync {
    if (this.stores.has(name)) {
      throw new Error(`Store '${name}' already exists`);
    }

    const derivedConfig = {
      ...this.config.globalConfig,
      ...config,
      clientId: `${name}-derived-${this.generateId()}`
    };

    const derivedStore = new KSync(derivedConfig);
    this.stores.set(name, derivedStore);

    // Set up materialization from source stores
    derivedStore.defineMaterializer(name, (events) => {
      const allSourceEvents: any[] = [];
      
      for (const sourceName of sourceStores) {
        const sourceStore = this.stores.get(sourceName);
        if (sourceStore) {
          allSourceEvents.push(...sourceStore.getEvents());
        }
      }

      return allSourceEvents.sort((a, b) => a.timestamp - b.timestamp);
    });

    // Set up real-time sync from source stores
    for (const sourceName of sourceStores) {
      const sourceStore = this.stores.get(sourceName);
      if (sourceStore) {
        // Listen to all events from source and forward to derived
        sourceStore.on('*', async (event) => {
          await derivedStore.send(`${sourceName}:${event.type}`, {
            ...(event.data || {}),
            __sourceStore: sourceName,
            __originalEvent: event
          });
        });
      }
    }

    return derivedStore;
  }

  // Store statistics
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [storeName, store] of this.stores) {
      const events = store.getEvents();
      stats[storeName] = {
        eventCount: events.length,
        lastEventTime: events.length > 0 ? Math.max(...events.map(e => e.timestamp)) : null,
        eventTypes: [...new Set(events.map(e => e.type))].length
      };
    }

    return stats;
  }

  // Cleanup
  async close(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const store of this.stores.values()) {
      promises.push(store.close());
    }

    if (this.sharedSync) {
      promises.push(this.sharedSync.disconnect());
    }

    await Promise.all(promises);
    
    this.stores.clear();
    this.drizzleAdapters.clear();
    this.isInitialized = false;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private syncStoreWithAdapter(storeName: string, store: KSync, adapter: DrizzleKSyncAdapter): void {
    // Initial sync
    adapter.updateEvents(store.getEvents());

    // Set up real-time sync
    store.on('*', () => {
      adapter.updateEvents(store.getEvents());
    });
  }
}

// Factory function for easy multistore creation
export function createMultistore(config: MultistoreConfig): KSyncMultistore {
  return new KSyncMultistore(config);
}

// Type-safe store registry
export class TypedMultistore<T extends Record<string, any>> {
  constructor(private multistore: KSyncMultistore) {}

  store<K extends keyof T>(name: K): KSync {
    return this.multistore.getStore(name as string);
  }

  drizzle<K extends keyof T>(name: K): DrizzleKSyncAdapter {
    return this.multistore.getDrizzle(name as string);
  }

  async broadcast<K extends keyof T>(
    eventType: string, 
    data: any, 
    excludeStores?: K[]
  ): Promise<void> {
    return this.multistore.broadcast(
      eventType, 
      data, 
      excludeStores?.map(s => s as string)
    );
  }
}

// Helper for creating typed multistore
export function createTypedMultistore<T extends Record<string, any>>(
  config: MultistoreConfig
): TypedMultistore<T> {
  const multistore = createMultistore(config);
  return new TypedMultistore<T>(multistore);
} 