# kSync

**Schema-driven, Bun-native, real-time sync engine.**  
Built for blazing-fast web and AI apps that need full control over event storage, tab sync, and backend integration — without the bloat.

---

## 🔧 Features

- ⚡ Built on **Bun** for top performance
- 🧱 Append-only **JSON event log** with strict schema validation
- 🌐 Real-time **WebSocket sync** (no BroadcastChannel)
- 🧠 Smart **leader election** for tab sync (Web Locks / IndexedDB)
- 🔁 **Materializer** to turn events into local state
- 🔌 Optional **Drizzle ORM plugin** to query event materialized state
- 🧪 Optimistic updates, conflict resolution, and more

---

## 🧱 Example

```ts
ksync.defineSchema("message", z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.number(),
}))

ksync.send("message", {
  id: "abc123",
  content: "hello",
  createdAt: Date.now(),
})
