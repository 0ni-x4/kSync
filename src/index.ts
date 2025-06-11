// Core exports (new easy-to-use API)
export { KSync, createKSync, createChat, createTodos, createGame, createAI, KSyncConfig } from './core.js';
export * from './types.js';

// Server-side API exports are in separate ./server export

// Storage implementations
export { MemoryStorage } from './storage/memory.js';
export { IndexedDBStorage } from './storage/indexeddb.js';

// Sync implementations
export { WebSocketSyncClient } from './sync/websocket-client.js';

// React hooks exports (CRITICAL FIX)
export * from './react/index.js';

// Utilities
export { generateId } from './utils.js';

// New feature exports - TODO: Fix import issues
// export * from './crdt/index.js';
// export * from './drizzle/index.js';
// TODO: Fix these modules to work with new API
// export * from './multistore';
// export * from './sync/git-sync';
// export * from './simple';

// Legacy exports (use createKSync from core instead)
// export const ksync = createKSync(); // Available via main exports 