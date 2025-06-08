# kSync Examples

This directory contains examples demonstrating kSync's capabilities for real-time, schema-driven applications.

## 📁 Examples

### 1. Basic Usage (`basic.ts`)
Simple chat application showing core kSync concepts:
- Schema definition with Zod
- Event sending and listening
- State materialization
- Local event storage

```bash
bun run examples/basic.ts
```

### 2. Real-time Sync (`sync.ts`)
Multi-client todo application demonstrating:
- WebSocket synchronization
- Multiple client instances
- Real-time state updates
- Conflict resolution

```bash
# Terminal 1: Start server
bun run server/websocket-server.ts

# Terminal 2: Run sync example
bun run examples/sync.ts
```

### 3. Next.js Multiplayer Game (`nextjs-game/`)
**🎮 Full-featured multiplayer game supporting 100+ concurrent players**

Features:
- ✅ **Real-time chat** with typing indicators
- ✅ **Multiplayer game** with mouse-controlled players  
- ✅ **Coin collection** mechanics with scoring
- ✅ **Schema validation** with Zod
- ✅ **Optimistic updates** for smooth UX
- ✅ **Modern UI** with Tailwind CSS

```bash
cd examples/nextjs-game

# Install dependencies
bun install

# Terminal 1: Start game server
bun run server

# Terminal 2: Start Next.js app
bun run dev

# Visit http://localhost:3000
```

**Demo Instructions:**
1. Open multiple browser tabs to `http://localhost:3000`
2. Enter different usernames and join the game
3. Move your mouse in the game area - see real-time player movement
4. Chat between tabs with typing indicators
5. Collect coins to increase your score

## 🏗️ Architecture Patterns

### Event-Sourced Design
All examples follow event-sourcing principles:
- Actions become events (user-joined, message-sent, player-moved)
- Events are stored in append-only log
- State is materialized from events
- Schema validation ensures data integrity

### Real-time Synchronization
- WebSocket connections for low-latency updates
- Automatic reconnection handling
- Optimistic updates for responsive UX
- Conflict resolution strategies

### Schema-Driven Development
- Zod schemas define event structure
- Runtime validation prevents data corruption
- TypeScript integration for compile-time safety
- Clear API contracts between client/server

## 🚀 Running Examples

### Prerequisites
- Bun runtime installed
- Node.js 18+ (for Next.js example)

### Basic Examples
```bash
# From project root
bun run examples/basic.ts
bun run examples/sync.ts
```

### Next.js Game
```bash
cd examples/nextjs-game
bun install
bun run server    # Terminal 1
bun run dev       # Terminal 2
```

## 📊 Performance Notes

### Scaling Considerations
- **Memory Management**: Events are pruned to prevent memory leaks
- **Connection Pooling**: WebSocket connections are efficiently managed
- **Event Batching**: Multiple events can be batched for efficiency
- **State Compression**: Game state is optimized for network transfer

### Tested Scenarios
- ✅ 100+ concurrent WebSocket connections
- ✅ High-frequency events (mouse movement at 60fps)
- ✅ Large chat message volumes
- ✅ Automatic reconnection under network issues
- ✅ Memory stability over extended periods

## 🔧 Customization

### Adding New Event Types
1. Define Zod schema
2. Register with `ksync.defineSchema()`
3. Add event listeners with `ksync.on()`
4. Send events with `ksync.send()`

### Server-side Logic
Extend the WebSocket server to add:
- Custom game mechanics
- Persistence to database
- Authentication/authorization
- Rate limiting
- Analytics

### Client-side Features
Enhance the client with:
- Offline support
- State persistence
- Advanced UI components
- Performance optimizations

## 📝 Next Steps

1. **Try the basic example** to understand core concepts
2. **Run the sync example** to see real-time capabilities
3. **Play the multiplayer game** to experience full-scale application
4. **Build your own** using kSync as foundation

Each example builds on the previous, demonstrating progressively more advanced kSync features and real-world usage patterns. 