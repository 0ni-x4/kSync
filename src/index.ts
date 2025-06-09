// Core exports (new easy-to-use API)
export { KSync, createKSync, createChat, createTodos, createGame, createAI, KSyncConfig } from './core';
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
// TODO: Fix these modules to work with new API
// export * from './multistore';
// export * from './sync/git-sync';
// export * from './react';
// export * from './simple';

// Legacy factory (deprecated - use new createKSync from core)
export function legacyCreateKSync(config: import('./types').KSyncConfig = {}) {
  const { KSync } = require('./core');
  return new KSync(config);
}

// TODO: Enable these when modules are fixed
// // Factory for multistore
// export function createMultistore(config: import('./multistore').MultistoreConfig) {
//   const { createMultistore } = require('./multistore');
//   return createMultistore(config);
// }

// // Factory for git sync
// export function createGitSync(config: import('./sync/git-sync').GitSyncConfig, clientId: string) {
//   const { createGitSync } = require('./sync/git-sync');
//   return createGitSync(config, clientId);
// }

// Default instance for simple usage
export const ksync = legacyCreateKSync(); 