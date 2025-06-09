# kSync

**Schema-driven, Bun-native, real-time sync engine.**  
Built for blazing-fast web and AI apps that need full control over event storage, tab sync, and backend integration — without the bloat.

---

## 🔧 Features
- 🔒 **Typesafe TypeScript** with Zod schema validation
- ⚡ Built on **Bun** for top performance
- 🧱 Append-only **JSON event log** with strict schema validation
- 🌐 **Dual sync modes**: WebSocket real-time OR git-like pull/push
- 🧠 Smart **leader election** for tab sync (Web Locks / IndexedDB)
- 🔁 **Materializer** to turn events into local state
- 💾 **Local-first** with IndexedDB persistence
- 🧪 Optimistic updates, conflict resolution, and more

### 🚀 **New Advanced Features**
- 🔀 **CRDT Integration** - True conflict-free sync with LWWRegister, GSet, GCounter
- 🗄️ **Drizzle ORM Plugin** - Query events like a normal database with SQL-like syntax
- 🏪 **Multistore Support** - Multiple isolated stores per app with cross-store operations
- 📡 **Git-like Sync** - Pull/push model without persistent WebSocket connections
- ⚛️ **React Hooks** - Full React integration with reactive components

---

## 🚀 Quick Start

### Installation

```bash
bun add @klastra/ksync zod
# For React support
bun add react
```

### 1. Basic Usage

```ts
import { z } from 'zod';
import { createKSync } from '@klastra/ksync';

const ksync = createKSync();

// Define schema for your events
ksync.defineSchema("message", z.object({
  id: z.string(),
  content: z.string(),
  author: z.string(),
  createdAt: z.number(),
}));

// Listen to events
ksync.on("message", (event) => {
  console.log(`New message: ${event.data.content}`);
});

// Send events (stored locally first, then synced)
await ksync.send("message", {
  id: "msg-1",
  content: "Hello world!",
  author: "Alice",
  createdAt: Date.now(),
});
```

### 2. Multistore with Drizzle ORM

```ts
import { createMultistore } from '@klastra/ksync';

const multistore = createMultistore({
  stores: {
    'users': { serverUrl: 'ws://localhost:8080' },
    'messages': { serverUrl: 'ws://localhost:8081' }
  }
});

await multistore.initialize();

// Use like a database
const db = multistore.getDrizzle('users');
const users = db.table('user');

// Send events that become database records
await multistore.getStore('users').send('user:created', {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com'
});

// Query like SQL
const allUsers = await users.findMany({
  where: { name: 'Alice' },
  orderBy: { name: 'asc' },
  limit: 10
});
```

### 3. Git-like Sync (No WebSockets)

```ts
import { createGitSync } from '@klastra/ksync';

const gitSync = createGitSync({
  remoteUrl: 'https://api.yourapp.com/sync',
  pullInterval: 30000, // Pull every 30s
  authToken: 'your-token'
}, 'client-id');

await gitSync.connect();

// Manual operations
await gitSync.pull();   // Fetch remote changes
await gitSync.push();   // Send local changes  
await gitSync.sync();   // Pull then push
```

### 4. CRDT Conflict-Free Sync

```ts
import { LWWRegister, GSet } from '@klastra/ksync';

// Last Write Wins for simple values
const title = new LWWRegister('My Document', Date.now(), 'client-1');

// Grow-only Sets for collections
const tags = new GSet(new Set(['react', 'typescript']));

await ksync.send('doc-updated', {
  id: 'doc-1',
  title: title.toJSON(),
  tags: tags.toJSON()
});
```

### 5. React Hooks

```tsx
import { useKSync, useKSyncEvent, useKSyncLiveQuery } from '@klastra/ksync/react';

function ChatApp() {
  const { ksync, isConnected } = useKSync(myKSyncInstance);
  const messages = useKSyncEvent(ksync, 'message');
  
  // Live database queries that auto-update
  const { data: users } = useKSyncLiveQuery(
    ksync,
    drizzleAdapter,
    'users',
    async (table) => table.findMany({ limit: 50 })
  );

  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Offline'}</div>
      <div>Users: {users.length}</div>
      <div>Messages: {messages.length}</div>
    </div>
  );
}
```

---

## 🏗️ Architecture

kSync follows a **local-first, event-sourced** architecture:

1. **Events** are stored locally first (IndexedDB/Memory)
2. **Leader election** ensures only one tab syncs with server
3. **WebSocket sync** keeps all clients in real-time sync
4. **Materializers** transform events into queryable state
5. **Schema validation** ensures data integrity

---

## 📖 Examples

### Run Basic Example
```bash
bun run examples/basic.ts
```

### Run Sync Example (requires server)
```bash
# Terminal 1: Start server
bun run server/websocket-server.ts

# Terminal 2: Run sync example
bun run examples/sync.ts
```

---

## 🔧 API Reference

### Core Methods

- `defineSchema(type, schema)` - Define Zod schema for event type
- `send(type, data)` - Send an event (local-first)
- `on(type, listener)` - Listen to events of a type
- `defineMaterializer(name, fn)` - Define state materializer
- `getState(name)` - Get materialized state
- `getEvents(fromVersion?)` - Get raw events

### Configuration

```ts
const ksync = createKSync({
  clientId: 'custom-client-id',
  serverUrl: 'ws://localhost:8080',
  storage: 'indexeddb', // or 'memory'
  debug: true
});
```

---

## 🎯 Why kSync?

**Simple**: A 15-year-old could understand and implement it  
**Fast**: Built on Bun with minimal overhead  
**Local-first**: Works offline, syncs when online  
**Type-safe**: Full TypeScript support with runtime validation  
**Minimal**: No bloat, just the essentials  

---

## 📝 License

MIT
