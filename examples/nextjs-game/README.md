# kSync Next.js Multiplayer Game

A real-time multiplayer game built with Next.js and kSync, demonstrating:

- ✅ **Real-time chat** with typing indicators
- ✅ **Multiplayer game** with mouse-controlled players
- ✅ **Coin collection** mechanics with scoring
- ✅ **100+ concurrent players** support
- ✅ **Schema validation** with Zod
- ✅ **Optimistic updates** for smooth UX

## 🎮 Features

### Chat System
- Real-time messaging between all players
- Typing indicators that show when someone is typing
- Auto-scroll to latest messages
- Message validation and sanitization

### Multiplayer Game
- Mouse-controlled player movement
- Real-time position synchronization
- Randomly spawning coins to collect
- Score tracking and leaderboard
- Player colors and usernames
- Smooth animations and transitions

### Technical Features
- Event-sourced architecture with kSync
- WebSocket real-time synchronization
- Schema-driven validation with Zod
- Optimistic updates for responsiveness
- Automatic reconnection handling
- Memory-efficient event storage

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd examples/nextjs-game
bun install
```

### 2. Start the Game Server

```bash
# Terminal 1: Start the WebSocket server
bun run server
```

The server will start on `ws://localhost:8080` and handle:
- Real-time event synchronization
- Player state management
- Coin spawning mechanics
- Connection management for 100+ players

### 3. Start the Next.js App

```bash
# Terminal 2: Start the Next.js development server
bun run dev
```

The app will be available at `http://localhost:3000`

### 4. Play the Game

1. **Enter your username** and click "Join Game"
2. **Move your mouse** in the game area to control your player
3. **Click on coins** to collect them and increase your score
4. **Chat with other players** using the chat panel
5. **See typing indicators** when others are typing

## 🏗️ Architecture

### Event Types

The game uses several event types, all validated with Zod schemas:

```typescript
// Chat events
'chat-message'        // User sends a chat message
'typing-indicator'    // User starts/stops typing

// Game events  
'player-joined'       // New player joins the game
'player-move'         // Player moves their character
'game-action'         // Player performs an action (collect coin)
'game-state-update'   // Server broadcasts game state
'coin-spawned'        // Server spawns a new coin
```

### Real-time Sync Flow

1. **Client Action**: User moves mouse or types message
2. **Local Update**: UI updates immediately (optimistic)
3. **Event Sent**: kSync sends event to server via WebSocket
4. **Server Processing**: Server validates and broadcasts to all clients
5. **State Sync**: All clients receive and apply the update

### Scaling for 100+ Players

The architecture is designed to handle high concurrency:

- **Event Batching**: Multiple events are batched for efficiency
- **Memory Management**: Only last 1000 events kept per client
- **Connection Pooling**: WebSocket connections are efficiently managed
- **State Compression**: Game state is optimized for network transfer
- **Heartbeat System**: Automatic cleanup of stale connections

## 📁 Project Structure

```
examples/nextjs-game/
├── app/
│   ├── globals.css          # Tailwind styles + game animations
│   ├── layout.tsx           # Root layout with fonts
│   └── page.tsx             # Main game component
├── lib/
│   └── ksync-client.ts      # Browser-optimized kSync client
├── server.ts                # Enhanced WebSocket game server
├── package.json             # Dependencies and scripts
├── next.config.js           # Next.js configuration
├── tailwind.config.js       # Tailwind CSS setup
└── tsconfig.json            # TypeScript configuration
```

## 🎯 Game Mechanics

### Player Movement
- **Mouse Control**: Move mouse in game area to control player
- **Real-time Sync**: Position updates sent 60fps to server
- **Smooth Interpolation**: Other players move smoothly between positions
- **Boundary Checking**: Players can't move outside game area

### Coin Collection
- **Random Spawning**: Server spawns coins every 2 seconds
- **Click to Collect**: Click on coins to collect them
- **Score System**: Each coin gives 10 points
- **Optimistic Updates**: Coins disappear immediately when clicked

### Chat System
- **Real-time Messages**: Instant delivery to all players
- **Typing Indicators**: See when others are typing
- **Auto-scroll**: Chat automatically scrolls to latest messages
- **Message Limits**: 200 character limit per message

## 🔧 Customization

### Adding New Game Features

1. **Define Schema** in `app/page.tsx`:
```typescript
const NewFeatureSchema = z.object({
  // your schema here
})
```

2. **Register Schema**:
```typescript
ksync.defineSchema('new-feature', NewFeatureSchema)
```

3. **Add Event Listener**:
```typescript
ksync.on('new-feature', (event) => {
  // handle the event
})
```

4. **Send Events**:
```typescript
await ksync.send('new-feature', {
  // your data here
})
```

### Server-side Game Logic

Modify `server.ts` to add new game mechanics:

```typescript
private async processGameEvent(sender: Client, event: KSyncEvent): Promise<void> {
  switch (event.type) {
    case 'your-new-event':
      // Handle your custom game logic
      break
  }
}
```

## 🚀 Deployment

### Production Server

For production deployment:

1. **Build the Next.js app**:
```bash
bun run build
bun run start
```

2. **Deploy the WebSocket server**:
```bash
# Set production port
PORT=8080 bun run server
```

3. **Update WebSocket URL** in the client:
```typescript
const ksync = createKSync({
  serverUrl: 'wss://your-domain.com:8080',
  debug: false,
})
```

### Scaling Considerations

For 100+ concurrent players:

- **Load Balancing**: Use multiple server instances behind a load balancer
- **Redis Pub/Sub**: Share events between server instances
- **Database**: Persist important events to database
- **CDN**: Serve static assets from CDN
- **Monitoring**: Add metrics and logging for performance monitoring

## 🐛 Troubleshooting

### Common Issues

**WebSocket Connection Failed**
- Ensure server is running on port 8080
- Check firewall settings
- Verify WebSocket URL in client

**Players Not Syncing**
- Check browser console for errors
- Verify event schemas match between client/server
- Ensure server is broadcasting events correctly

**Performance Issues**
- Reduce event frequency for mouse movement
- Implement event batching
- Add client-side interpolation

### Debug Mode

Enable debug logging:

```typescript
const ksync = createKSync({
  serverUrl: 'ws://localhost:8080',
  debug: true, // Enable debug logs
})
```

## 📝 License

MIT - Same as kSync main project 