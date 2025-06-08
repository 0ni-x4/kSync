// Core exports
export { KSync } from './core';
export * from './types';

// Storage implementations
export { MemoryStorage } from './storage/memory';
export { IndexedDBStorage } from './storage/indexeddb';

// Sync implementations
export { WebSocketSyncClient } from './sync/websocket-client';

// Utilities
export { generateId } from './utils';

// Factory function for easy setup
export function createKSync(config: import('./types').KSyncConfig = {}) {
  const { KSync } = require('./core');
  return new KSync(config);
}

// Default instance for simple usage
export const ksync = createKSync(); 