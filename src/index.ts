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

// New feature exports
export * from './crdt';
export * from './drizzle';
export * from './multistore';
export * from './sync/git-sync';

// React hooks (optional peer dependency)
export * from './react';

// Factory function for easy setup
export function createKSync(config: import('./types').KSyncConfig = {}) {
  const { KSync } = require('./core');
  return new KSync(config);
}

// Factory for multistore
export function createMultistore(config: import('./multistore').MultistoreConfig) {
  const { createMultistore } = require('./multistore');
  return createMultistore(config);
}

// Factory for git sync
export function createGitSync(config: import('./sync/git-sync').GitSyncConfig, clientId: string) {
  const { createGitSync } = require('./sync/git-sync');
  return createGitSync(config, clientId);
}

// Default instance for simple usage
export const ksync = createKSync(); 