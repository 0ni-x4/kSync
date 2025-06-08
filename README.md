# kSync

**Schema-driven, Bun-native, real-time sync engine.**  
Built for blazing-fast web and AI apps that need full control over event storage, tab sync, and backend integration — without the bloat.

---

## 🔧 Features
- 🔒 **Typesafe TypeScript** with Zod schema validation
- ⚡ Built on **Bun** for top performance
- 🧱 Append-only **JSON event log** with strict schema validation
- 🌐 Real-time **WebSocket sync** (no BroadcastChannel)
- 🧠 Smart **leader election** for tab sync (Web Locks / IndexedDB)
- 🔁 **Materializer** to turn events into local state
- 💾 **Local-first** with IndexedDB persistence
- 🧪 Optimistic updates, conflict resolution, and more

---

## 🚀 Quick Start

### Installation

```bash
bun add @klastra/ksync zod
```

### Basic Usage

```ts
import { z } from 'zod';
import { ksync } from '@klastra/ksync';

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

### With Real-time Sync

```ts
import { createKSync } from '@klastra/ksync';

const client = createKSync({
  serverUrl: 'ws://localhost:8080',
  debug: true
});

await client.initialize();
```

### State Materialization

```ts
// Define how events become state
ksync.defineMaterializer('chat', (events) => {
  const messages = events
    .filter(e => e.type === 'message')
    .map(e => e.data)
    .sort((a, b) => a.createdAt - b.createdAt);
  
  return { messages };
});

// Get materialized state
const chatState = ksync.getState('chat');
console.log(chatState.messages);
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
