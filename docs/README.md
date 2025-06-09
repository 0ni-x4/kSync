# kSync v0.2 Documentation

This directory contains comprehensive documentation for kSync v0.2, built with [Mintlify](https://mintlify.com/).

## 📁 Documentation Structure

```
docs/
├── docs.json                # Mintlify configuration
├── introduction.mdx         # Main introduction page
├── installation.mdx         # Installation and setup  
├── quickstart.mdx          # 2-minute quickstart guide
├── benchmarks.mdx          # Performance benchmarks
├── guides/                 # v0.2 Feature guides
│   ├── factory-functions.mdx # createChat(), createGame(), etc.
│   ├── streaming.mdx       # AI streaming support
│   ├── presence.mdx        # User presence system
│   ├── configuration.mdx   # 50+ config options
│   ├── performance.mdx     # Performance optimization
│   ├── react-integration.mdx # React hooks and components
│   ├── production.mdx      # Production deployment
│   └── migration.mdx       # v0.1 → v0.2 migration
├── api-reference/          # Complete API docs
│   ├── core.mdx           # Core KSync v0.2 API
│   ├── factory-functions.mdx # Factory function APIs
│   ├── configuration.mdx   # Configuration interface
│   ├── streaming.mdx       # Streaming API
│   ├── presence.mdx        # Presence API
│   └── [legacy files]      # v0.1 compatibility docs
├── examples/               # Real-world examples
│   ├── chat-app-v2.mdx     # Modern chat with presence
│   ├── ai-streaming-v2.mdx # AI streaming application
│   ├── multiplayer-game-v2.mdx # Real-time game
│   ├── react-app.mdx       # React integration
│   └── [legacy examples]   # v0.1 examples
└── concepts/               # Legacy v0.1 concepts
    ├── architecture.mdx    # Original architecture
    ├── events.mdx         # Event system
    └── storage.mdx        # Storage backends
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Mintlify CLI

### Local Development

1. **Install Mintlify CLI**:
   ```bash
   npm i -g mintlify
   ```

2. **Start development server**:
   ```bash
   cd docs
   mintlify dev
   ```

3. **Open in browser**:
   ```
   http://localhost:3000
   ```

### Building for Production

```bash
mintlify build
```

## 📝 Writing Documentation

### File Format

All documentation files use MDX format (`.mdx`), which allows:
- Markdown syntax
- React components
- Interactive elements
- Code syntax highlighting

### Frontmatter

Each file starts with YAML frontmatter:

```yaml
---
title: 'Page Title'
description: 'Brief description for SEO and navigation'
---
```

### v0.2 Examples

Always showcase the new v0.2 APIs with factory functions:

```typescript
import { createChat, createGame, createAI } from '@klastra/ksync';

// Chat application
const chat = createChat('my-room', {
  serverUrl: 'ws://localhost:8080'
});

// Multiplayer game
const game = createGame('game-123', {
  performance: { batchDelay: 5 }
});

// AI streaming
const ai = createAI('assistant', {
  features: { streaming: true }
});
```

### Mintlify Components

Use Mintlify's built-in components for rich documentation:

#### Performance Callouts

```mdx
<Callout type="info">
**Performance**: kSync v0.2 delivers 600k+ ops/sec with only 2MB memory for 1000 clients.
</Callout>
```

#### Feature Cards

```mdx
<CardGroup cols={2}>
  <Card title="Factory Functions" icon="magic-wand" href="/guides/factory-functions">
    Instant setup with createChat(), createGame(), createAI()
  </Card>
  <Card title="600k+ ops/sec" icon="bolt" href="/benchmarks">
    Enterprise-scale performance with memory efficiency
  </Card>
</CardGroup>
```

#### Code Groups

```mdx
<CodeGroup>

```typescript Chat Application
import { createChat } from '@klastra/ksync';

const chat = createChat('my-room');
await chat.setPresence({ status: 'online' });
```

```typescript AI Application
import { createAI } from '@klastra/ksync';

const ai = createAI('assistant', {
  features: { streaming: true }
});
```

</CodeGroup>
```

#### Tabs for Different Use Cases

```mdx
<Tabs>
  <Tab title="Chat Apps">
    Use createChat() for instant presence and messaging
  </Tab>
  <Tab title="Games">
    Use createGame() for low-latency real-time updates
  </Tab>
  <Tab title="AI Apps">
    Use createAI() for streaming responses and conversations
  </Tab>
</Tabs>
```

## 🎯 Content Guidelines

### Writing Style

- **Enterprise-focused**: Emphasize production-ready performance
- **Developer-friendly**: Show working code examples
- **Results-oriented**: Include benchmark data and metrics
- **Migration-aware**: Help users transition from v0.1

### Code Examples

Always include complete, runnable v0.2 examples:

```typescript
import { createKSync } from '@klastra/ksync';

// Complete example users can copy and run
const ksync = createKSync({
  serverUrl: 'ws://localhost:8080',
  features: { presence: true, streaming: true }
});

// Listen for events
ksync.on('message', (data, event) => {
  console.log(`${event.userId}: ${data.text}`);
});

// Send events with optimized batching
await ksync.send('message', {
  text: 'Hello world!',
  timestamp: Date.now()
});
```

### Performance Focus

Always mention performance benefits:

- **600k+ ops/sec** throughput
- **2MB memory** for 1000 clients
- **Sub-5ms latency** with smart batching
- **Network resilient** - handles 10-200ms delays

### Backward Compatibility

Note v0.1 compatibility where relevant:

```typescript
// v0.1 code still works
const ksync = new KSync({ serverUrl: 'ws://localhost:8080' });
await ksync.initialize();

// v0.2 recommended approach  
const ksync = createKSync({ serverUrl: 'ws://localhost:8080' });
// Auto-connects, no initialization needed!
```

## 🚀 Key Documentation Priorities

### 1. Factory Functions
Document the core value proposition - instant setup with optimized presets.

### 2. Performance Benchmarks
Showcase the enterprise-grade performance with real metrics.

### 3. Configuration
Document the 50+ configuration options with TypeScript IntelliSense.

### 4. Streaming Support
Highlight the new AI streaming capabilities.

### 5. Migration Guide
Help users transition smoothly from v0.1 to v0.2.

## 📊 Documentation Metrics

Track these metrics for documentation effectiveness:
- Time to first success (target: <2 minutes)
- Code example completeness (target: 100% runnable)
- Performance claims verification (benchmarks included)
- Migration path clarity (v0.1 → v0.2)

---

**kSync v0.2 Documentation: Enterprise performance, developer-friendly APIs.** 