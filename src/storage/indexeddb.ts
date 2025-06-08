import type { KSyncEvent, KSyncStorage } from '../types';

export class IndexedDBStorage implements KSyncStorage {
  private dbName = 'ksync-db';
  private storeName = 'events';
  private version = 1;
  private db?: IDBDatabase;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('version', 'version', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async getEvents(fromVersion?: number): Promise<KSyncEvent[]> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        let events = request.result as KSyncEvent[];
        
        if (fromVersion !== undefined) {
          events = events.filter(event => event.version > fromVersion);
        }
        
        // Sort by version
        events.sort((a, b) => a.version - b.version);
        resolve(events);
      };
    });
  }

  async storeEvent(event: KSyncEvent): Promise<void> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(event);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async storeEvents(events: KSyncEvent[]): Promise<void> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      let completed = 0;
      let hasError = false;
      
      for (const event of events) {
        const request = store.put(event);
        
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
        
        request.onsuccess = () => {
          completed++;
          if (completed === events.length && !hasError) {
            resolve();
          }
        };
      }
      
      if (events.length === 0) {
        resolve();
      }
    });
  }

  async getLastVersion(): Promise<number> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('version');
      const request = index.openCursor(null, 'prev'); // Get highest version
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value.version);
        } else {
          resolve(0); // No events
        }
      };
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
} 