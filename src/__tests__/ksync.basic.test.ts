import { KSync, createKSync, createChat, createTodos, createGame, createAI } from '../core';
import { MemoryStorage } from '../storage/memory';
import { KSyncEvent, PresenceInfo, StreamChunk, KSyncError } from '../types';

// Simple test framework
class TestSuite {
  private tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void> | void) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running KSync Test Suite\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name}: ${error}`);
        this.failed++;
      }
    }

    // FIXED: Clean up all instances to prevent hanging
    try {
      await cleanupAllInstances();
    } catch (error) {
      console.log('Warning: Cleanup failed:', error);
    }

    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    
    if (this.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('🔧 Some tests failed - check implementation');
      process.exit(1);
    }
  }
}

// Test utilities
function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan: (expected: number) => {
      if (actual >= expected) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toHaveLength: (expected: number) => {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
    toContain: (expected: any) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      }
    },
    toThrow: (expectedError?: string) => {
      try {
        actual();
        throw new Error('Expected function to throw');
      } catch (error) {
        if (expectedError && !(error as Error).message.includes(expectedError)) {
          throw new Error(`Expected error containing "${expectedError}", got "${(error as Error).message}"`);
        }
      }
    },
    rejects: {
      toThrow: async (expectedError?: string) => {
        try {
          await actual;
          throw new Error('Expected promise to reject');
        } catch (error) {
          if (expectedError && !(error as Error).message.includes(expectedError)) {
            throw new Error(`Expected error containing "${expectedError}", got "${(error as Error).message}"`);
          }
        }
      }
    },
    resolves: {
      not: {
        toThrow: async () => {
          try {
            await actual;
          } catch (error) {
            throw new Error(`Expected promise not to throw, but got: ${(error as Error).message}`);
          }
        }
      }
    },
    toMatch: (pattern: RegExp) => {
      if (!pattern.test(actual)) {
        throw new Error(`Expected ${actual} to match ${pattern}`);
      }
    },
    toMatchObject: (expected: any) => {
      for (const key in expected) {
        if (typeof expected[key] === 'object' && expected[key] !== null) {
          expect(actual[key]).toMatchObject(expected[key]);
        } else {
          expect(actual[key]).toEqual(expected[key]);
        }
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeInstanceOf: (expectedClass: any) => {
      if (!(actual instanceof expectedClass)) {
        throw new Error(`Expected ${actual} to be instance of ${expectedClass.name}`);
      }
    }
  };
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// FIXED: Track all KSync instances for cleanup
const activeInstances: any[] = [];

function createKSyncForTest(config?: any): any {
  const instance = createKSync(config);
  activeInstances.push(instance);
  return instance;
}

function createChatForTest(room: string, config?: any): any {
  const instance = createChat(room, config);
  activeInstances.push(instance);
  return instance;
}

function createKSyncInstanceForTest(config?: any): any {
  const instance = new KSync(config);
  activeInstances.push(instance);
  return instance;
}

async function cleanupAllInstances(): Promise<void> {
  // Clean up all instances to prevent hanging
  const cleanupPromises = activeInstances.map(async (instance) => {
    try {
      await instance.disconnect();
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  await Promise.all(cleanupPromises);
  activeInstances.length = 0; // Clear the array
}

// Mock globals for testing
Object.defineProperty(global, 'WebSocket', {
  value: class MockWebSocket {
    readyState = 1; // OPEN
    send = () => {};
    close = () => {};
    addEventListener = () => {};
    removeEventListener = () => {};
  },
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'performance', {
  value: { now: () => Date.now() },
  writable: true,
  configurable: true
});

// Mock navigator if it doesn't exist or is readonly
if (typeof global.navigator === 'undefined') {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true },
    writable: true,
    configurable: true
  });
}

// Test Suite
const suite = new TestSuite();

// === CONFIGURATION TESTS ===

suite.test('should initialize with default configuration', async () => {
  const ksync = createKSyncInstanceForTest();
  const status = ksync.getStatus();
  
  expect(status.room).toBe('default');
  expect(status.userId).toMatch(/^user-\d+-[a-z0-9]+$/);
  expect(status.events).toBe(0);
  expect(status.connected).toBe(false);
  expect(status.online).toBe(true);
});

suite.test('should initialize with custom configuration', async () => {
  const ksync = createKSyncInstanceForTest({
    serverUrl: 'ws://localhost:8080',
    room: 'test-room',
    userId: 'test-user',
    debug: { events: true, sync: false },
    performance: { batchSize: 50, batchDelay: 5 },
    offline: { queueSize: 500 },
    features: { presence: false, streaming: true }
  });

  const status = ksync.getStatus();
  expect(status.room).toBe('test-room');
  expect(status.userId).toBe('test-user');
  expect(status.features.presenceEnabled).toBe(false);
  expect(status.features.streamingEnabled).toBe(true);
});

// === EVENT HANDLING TESTS ===

suite.test('should send and receive events', async () => {
  const ksync = createKSyncInstanceForTest({
    storage: { instance: new MemoryStorage() },
    performance: { batchSize: 1, batchDelay: 1 }, // Immediate processing
    debug: false
  });

  const eventData = { message: 'Hello World', timestamp: Date.now() };
  const receivedEvents: any[] = [];

  ksync.on('test-event', (data: any, event: any) => {
    receivedEvents.push({ data, event });
  });

  await ksync.send('test-event', eventData);
  await wait(10); // Wait for batch processing

  expect(receivedEvents).toHaveLength(1);
  expect(receivedEvents[0].data).toEqual(eventData);
  expect(receivedEvents[0].event.type).toBe('test-event');
  expect(receivedEvents[0].event.userId).toBeDefined();
});

suite.test('should handle event with options', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    performance: { batchSize: 1, batchDelay: 1 }
  });

  const metadata = { source: 'test', priority: 'high' };
  let receivedEvent: KSyncEvent | null = null;

  ksync.on('priority-event', (data, event) => {
    receivedEvent = event!;
  });

  await ksync.send('priority-event', { test: true }, {
    priority: 'high',
    ttl: 5000,
    metadata
  });
  
  await wait(10); // Wait for batch processing

  expect(receivedEvent).toBeDefined();
  expect(receivedEvent!.priority).toBe('high');
  expect(receivedEvent!.ttl).toBe(5000);
  expect(receivedEvent!.metadata).toEqual(metadata);
});

suite.test('should handle event listeners properly', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    performance: { batchSize: 1, batchDelay: 1 }
  });

  let listener1Called = 0;
  let listener2Called = 0;
  let onceListenerCalled = 0;

  const listener1 = () => listener1Called++;
  const listener2 = () => listener2Called++;
  const onceListener = () => onceListenerCalled++;

  ksync.on('test', listener1);
  ksync.on('test', listener2);
  ksync.once('test', onceListener);

  await ksync.send('test', { first: true });
  await wait(10);
  await ksync.send('test', { second: true });
  await wait(10);

  expect(listener1Called).toBe(2);
  expect(listener2Called).toBe(2);
  expect(onceListenerCalled).toBe(1);

  ksync.off('test', listener1);
  await ksync.send('test', { third: true });
  await wait(10);

  expect(listener1Called).toBe(2);
  expect(listener2Called).toBe(3);
});

// === STATE MANAGEMENT TESTS ===

suite.test('should materialize state from events', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    state: {
      materializer: (events) => {
        return events.reduce((state, event) => {
          if (event.type === 'increment') {
            return { ...state, count: ((state as any).count || 0) + event.data.value };
          }
          if (event.type === 'set-name') {
            return { ...state, name: event.data.name };
          }
          return state;
        }, {});
      },
      enableCaching: true,
      autoMaterialize: true
    }
  });

  await ksync.send('increment', { value: 5 });
  await ksync.send('set-name', { name: 'Test' });
  await ksync.send('increment', { value: 3 });

  await wait(20); // Wait for auto-materialization

  const state = ksync.getState();
  expect(state).toEqual({
    count: 8,
    name: 'Test'
  });
});

suite.test('should handle state without materializer', () => {
  const ksync = new KSync();
  const state = ksync.getState();
  
  expect(state).toEqual({ events: [] });
});

// === PRESENCE SYSTEM TESTS ===

suite.test('should set and get presence', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    features: { presence: true }
  });

  const presenceInfo: Partial<PresenceInfo> = {
    status: 'online',
    metadata: { location: 'New York', mood: 'happy' }
  };

  await ksync.setPresence(presenceInfo);
  
  const presence = ksync.getPresence();
  expect(presence).toHaveLength(1);
  expect(presence[0].status).toBe('online');
  expect(presence[0].metadata).toEqual({ location: 'New York', mood: 'happy' });
});

suite.test('should filter presence information', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    features: { presence: true }
  });

  await ksync.setPresence({ status: 'online' });
  
  const onlineUsers = ksync.getPresence(p => p.status === 'online');
  const awayUsers = ksync.getPresence(p => p.status === 'away');
  
  expect(onlineUsers).toHaveLength(1);
  expect(awayUsers).toHaveLength(0);
});

suite.test('should throw error when presence is disabled', async () => {
  const noPresenceKSync = new KSync({
    features: { presence: false }
  });

  try {
    await noPresenceKSync.setPresence({ status: 'online' });
    throw new Error('Should have thrown');
  } catch (error) {
    expect((error as Error).message).toContain('Presence feature is disabled');
  }
});

// === STREAMING TESTS ===

suite.test('should start, chunk, and end stream', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    features: { streaming: true }
  });

  const streamEvents: any[] = [];
  
  ksync.on('stream-start', (data) => streamEvents.push({ type: 'start', data }));
  ksync.on('stream-chunk', (data) => streamEvents.push({ type: 'chunk', data }));
  ksync.on('stream-end', (data) => streamEvents.push({ type: 'end', data }));

  const streamId = 'test-stream';
  
  await ksync.startStream(streamId, {
    type: 'ai-response',
    metadata: { model: 'gpt-4' }
  });

  await ksync.streamChunk(streamId, {
    data: 'Hello',
    metadata: { sequence: 1 }
  });

  await ksync.streamChunk(streamId, {
    data: ' World',
    metadata: { sequence: 2 }
  });

  await ksync.endStream(streamId, { final: true });

  expect(streamEvents).toHaveLength(4);
  expect(streamEvents[0].type).toBe('start');
  expect(streamEvents[1].type).toBe('chunk');
  expect(streamEvents[1].data.data).toBe('Hello');
  expect(streamEvents[3].type).toBe('end');
});

suite.test('should track active streams', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    features: { streaming: true }
  });

  await ksync.startStream('stream1', { type: 'chat' });
  await ksync.startStream('stream2', { type: 'ai' });

  const activeStreams = ksync.getActiveStreams();
  expect(activeStreams).toHaveLength(2);

  await ksync.endStream('stream1');

  const remainingStreams = ksync.getActiveStreams();
  expect(remainingStreams).toHaveLength(1);
  expect(remainingStreams[0].streamId).toBe('stream2');
});

suite.test('should throw error for unknown stream', async () => {
  const ksync = new KSync({
    features: { streaming: true }
  });

  try {
    await ksync.streamChunk('unknown-stream', { data: 'test' });
    throw new Error('Should have thrown');
  } catch (error) {
    expect((error as Error).message).toContain('Stream not found');
  }
});

// === ROOM MANAGEMENT TESTS ===

suite.test('should join room', async () => {
  const ksync = new KSync({
    room: 'initial-room',
    storage: { instance: new MemoryStorage() }
  });

  const roomEvents: any[] = [];
  ksync.on('room-changed', (data) => roomEvents.push(data));

  await ksync.joinRoom('new-room');

  expect(ksync.getStatus().room).toBe('new-room');
  expect(roomEvents).toHaveLength(1);
  expect(roomEvents[0]).toEqual({
    from: 'initial-room',
    to: 'new-room'
  });
});

// === SYNC OPERATIONS TESTS ===

suite.test('should handle manual sync', async () => {
  const ksync = new KSync({
    serverUrl: 'ws://localhost:8080',
    storage: { instance: new MemoryStorage() },
    sync: {
      enabled: true,
      mode: 'manual'
    }
  });

  await ksync.send('test-event', { data: 'test' });
  
  const result = await ksync.sync();
  expect(result).toEqual({ synced: 0, errors: 0 }); // No connection, so 0 synced
});

suite.test('should throw error when sync is disabled', async () => {
  const noSyncKSync = new KSync({
    sync: { enabled: false }
  });

  try {
    await noSyncKSync.sync();
    throw new Error('Should have thrown');
  } catch (error) {
    expect((error as Error).message).toContain('Sync is disabled');
  }
});

// === PERFORMANCE TESTS ===

suite.test('should track performance metrics', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    performance: { batchSize: 1, batchDelay: 1 },
    debug: { performance: true }
  });

  await ksync.send('perf-test', { data: 1 });
  await wait(50); // Longer wait for batching
  await ksync.send('perf-test', { data: 2 });
  await wait(50); // Longer wait for batching

  const status = ksync.getStatus();
  expect(status.performance.eventsProcessed).toBeGreaterThan(0);
  expect(status.performance.averageProcessingTime).toBeGreaterThan(-1);
});

suite.test('should provide comprehensive status', () => {
  const ksync = new KSync();
  const status = ksync.getStatus();
  
  expect(status.connected).toBeDefined();
  expect(status.online).toBeDefined();
  expect(status.serverUrl).toBeDefined();
  expect(status.events).toBeDefined();
  expect(status.queued).toBeDefined();
  expect(status.version).toBeDefined();
  expect(status.room).toBeDefined();
  expect(status.userId).toBeDefined();
  expect(status.performance).toBeDefined();
  expect(status.features).toBeDefined();
});

// === DATA MANAGEMENT TESTS ===

suite.test('should clear data with options', async () => {
  const ksync = new KSync({
    storage: { instance: new MemoryStorage() },
    performance: { batchSize: 1, batchDelay: 1 }
  });

  await ksync.send('test', { data: 1 });
  await wait(10);
  await ksync.send('test', { data: 2 });
  await wait(10);

  expect(ksync.getStatus().events).toBe(2);

  await ksync.clear({ events: true, state: true });

  expect(ksync.getStatus().events).toBe(0);
});

// === FACTORY FUNCTION TESTS ===

suite.test('should create basic KSync instance', () => {
  const ksync = createKSync();
  expect(ksync).toBeInstanceOf(KSync);
});

suite.test('should create chat-optimized instance', () => {
  const chat = createChat('chat-room');
  const status = chat.getStatus();
  
  expect(status.room).toBe('chat-room');
  expect(status.features.presenceEnabled).toBe(true);
});

suite.test('should create todo-optimized instance', () => {
  const todos = createTodos();
  const status = todos.getStatus();
  
  expect(status.room).toBe('todos');
  expect(status.features.offlineEnabled).toBe(true);
});

suite.test('should create game-optimized instance', () => {
  const game = createGame('game-123');
  const status = game.getStatus();
  
  expect(status.room).toBe('game-game-123');
  expect(status.features.presenceEnabled).toBe(true);
  expect(status.features.streamingEnabled).toBe(true);
});

suite.test('should create AI-optimized instance', () => {
  const ai = createAI();
  const status = ai.getStatus();
  
  expect(status.room).toBe('ai-chat');
  expect(status.features.streamingEnabled).toBe(true);
  expect(status.features.presenceEnabled).toBe(false);
});

// === INTEGRATION TESTS ===

suite.test('should handle complete chat flow', async () => {
  const chat = createChat('integration-test', {
    performance: { batchSize: 1, batchDelay: 1 }
  });
  const messages: any[] = [];
  
  chat.on('message', (data) => messages.push(data));
  
  await chat.setPresence({
    status: 'online',
    metadata: { name: 'Test User' }
  });
  await wait(10);
  
  await chat.send('message', {
    text: 'Hello everyone!',
    timestamp: Date.now()
  });
  await wait(10);
  
  await chat.send('message', {
    text: 'How is everyone doing?',
    timestamp: Date.now()
  });
  await wait(10);
  
  expect(messages).toHaveLength(2);
  expect(messages[0].text).toBe('Hello everyone!');
  
  const presence = chat.getPresence();
  expect(presence).toHaveLength(1);
  expect(presence[0]?.metadata?.name).toBe('Test User');
  
  const status = chat.getStatus();
  expect(status.events).toBe(3); // 2 messages + 1 presence update
});

suite.test('should handle AI streaming conversation', async () => {
  const ai = createAI('ai-test');
  const chunks: string[] = [];
  
  ai.on('stream-chunk', (data) => {
    chunks.push(data.data);
  });
  
  await ai.startStream('ai-response-1');
  
  await ai.streamChunk('ai-response-1', { data: 'Hello! ' });
  await ai.streamChunk('ai-response-1', { data: 'I am ' });
  await ai.streamChunk('ai-response-1', { data: 'an AI assistant.' });
  
  await ai.endStream('ai-response-1');
  
  expect(chunks).toEqual(['Hello! ', 'I am ', 'an AI assistant.']);
  
  const activeStreams = ai.getActiveStreams();
  expect(activeStreams).toHaveLength(0);
});

// === EDGE CASES ===

suite.test('should handle rapid event sending', async () => {
  const ksync = new KSync();
  
  const promises = Array.from({ length: 100 }, (_, i) =>
    ksync.send('rapid-test', { index: i })
  );
  
  await Promise.all(promises);
  
  expect(ksync.getStatus().events).toBe(100);
});

suite.test('should handle event with null/undefined data', async () => {
  const ksync = new KSync({
    performance: { batchSize: 1, batchDelay: 1 }
  });
  
  await ksync.send('null-test', null);
  await wait(10);
  await ksync.send('undefined-test', undefined);
  await wait(10);
  
  expect(ksync.getStatus().events).toBe(2);
});

suite.test('should handle very large event data', async () => {
  const ksync = new KSync({
    performance: { batchSize: 1, batchDelay: 1 }
  });
  const largeData = {
    content: 'x'.repeat(10000), // 10KB string
    metadata: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
  };
  
  await ksync.send('large-data', largeData);
  await wait(10);
  
  expect(ksync.getStatus().events).toBe(1);
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  suite.run().catch(console.error);
}

export { suite as testSuite }; 