// @ts-ignore - Jest types from globals
import { KSync, createKSync, createChat, createTodos, createGame, createAI } from '../core';
import { MemoryStorage } from '../storage/memory';
import { KSyncEvent, PresenceInfo, StreamChunk, KSyncError } from '../types';

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  readyState: 1, // OPEN
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
})) as any;

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
});

// Mock performance.now for consistent timing
global.performance = {
  now: jest.fn(() => Date.now()),
} as any;

describe('KSync Core Functionality', () => {
  let ksync: KSync;
  let mockStorage: MemoryStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = new MemoryStorage();
  });

  afterEach(async () => {
    if (ksync) {
      await ksync.disconnect();
    }
  });

  describe('Configuration & Initialization', () => {
    test('should initialize with default configuration', () => {
      ksync = new KSync();
      const status = ksync.getStatus();
      
      expect(status.room).toBe('default');
      expect(status.userId).toMatch(/^user-\d+-[a-z0-9]+$/);
      expect(status.events).toBe(0);
      expect(status.connected).toBe(false);
      expect(status.online).toBe(true);
    });

    test('should initialize with custom configuration', () => {
      ksync = new KSync({
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

    test('should use custom storage instance', () => {
      const customStorage = new MemoryStorage();
      ksync = new KSync({
        storage: {
          instance: customStorage
        }
      });
      
      expect(ksync).toBeDefined();
    });

    test('should configure sync options properly', () => {
      ksync = new KSync({
        serverUrl: 'ws://test.com',
        sync: {
          mode: 'manual',
          options: {
            autoReconnect: false,
            maxReconnectAttempts: 3,
            reconnectDelay: 2000
          }
        }
      });

      const status = ksync.getStatus();
      expect(status.features.syncEnabled).toBe(true);
    });
  });

  describe('Event Handling', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage },
        debug: false
      });
    });

    test('should send and receive events', async () => {
      const eventData = { message: 'Hello World', timestamp: Date.now() };
      const receivedEvents: any[] = [];

      ksync.on('test-event', (data, event) => {
        receivedEvents.push({ data, event });
      });

      await ksync.send('test-event', eventData);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].data).toEqual(eventData);
      expect(receivedEvents[0].event).toMatchObject({
        type: 'test-event',
        data: eventData,
        userId: expect.any(String),
        version: 1
      });
    });

    test('should handle event with options', async () => {
      const metadata = { source: 'test', priority: 'high' };
      const receivedEvents: KSyncEvent[] = [];

      ksync.on('priority-event', (data, event) => {
        receivedEvents.push(event!);
      });

      await ksync.send('priority-event', { test: true }, {
        priority: 'high',
        ttl: 5000,
        metadata
      });

      expect(receivedEvents[0]).toMatchObject({
        priority: 'high',
        ttl: 5000,
        metadata
      });
    });

    test('should handle event listeners properly', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const onceListener = jest.fn();

      ksync.on('test', listener1);
      ksync.on('test', listener2);
      ksync.once('test', onceListener);

      await ksync.send('test', { first: true });
      await ksync.send('test', { second: true });

      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);
      expect(onceListener).toHaveBeenCalledTimes(1);

      ksync.off('test', listener1);
      await ksync.send('test', { third: true });

      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(3);
    });

    test('should batch events for performance', async () => {
      ksync = new KSync({
        storage: { instance: mockStorage },
        performance: { batchSize: 3, batchDelay: 10 }
      });

      const events: any[] = [];
      ksync.on('batch-test', (data) => events.push(data));

      // Send multiple events quickly
      await Promise.all([
        ksync.send('batch-test', { id: 1 }),
        ksync.send('batch-test', { id: 2 }),
        ksync.send('batch-test', { id: 3 }),
      ]);

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(events).toHaveLength(3);
      expect(ksync.getStatus().events).toBe(3);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage },
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
    });

    test('should materialize state from events', async () => {
      await ksync.send('increment', { value: 5 });
      await ksync.send('set-name', { name: 'Test' });
      await ksync.send('increment', { value: 3 });

      // Wait for auto-materialization
      await new Promise(resolve => setTimeout(resolve, 20));

      const state = ksync.getState();
      expect(state).toEqual({
        count: 8,
        name: 'Test'
      });
    });

    test('should cache materialization results', async () => {
      await ksync.send('increment', { value: 1 });
      
      const state1 = ksync.getState();
      const state2 = ksync.getState();
      
      expect(state1).toBe(state2); // Same reference due to caching
    });

    test('should force rematerialization', async () => {
      await ksync.send('increment', { value: 1 });
      
      const state1 = ksync.getState();
      const state2 = ksync.getState(true); // Force rematerialization
      
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different reference
    });

    test('should handle state without materializer', () => {
      const basicKSync = new KSync();
      const state = basicKSync.getState();
      
      expect(state).toEqual({ events: [] });
    });
  });

  describe('Presence System', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage },
        features: { presence: true }
      });
    });

    test('should set and get presence', async () => {
      const presenceInfo: Partial<PresenceInfo> = {
        status: 'online',
        metadata: { location: 'New York', mood: 'happy' }
      };

      await ksync.setPresence(presenceInfo);
      
      const presence = ksync.getPresence();
      expect(presence).toHaveLength(1);
      expect(presence[0]).toMatchObject({
        userId: expect.any(String),
        status: 'online',
        lastSeen: expect.any(Number),
        metadata: { location: 'New York', mood: 'happy' }
      });
    });

    test('should filter presence information', async () => {
      await ksync.setPresence({ status: 'online' });
      
      const onlineUsers = ksync.getPresence(p => p.status === 'online');
      const awayUsers = ksync.getPresence(p => p.status === 'away');
      
      expect(onlineUsers).toHaveLength(1);
      expect(awayUsers).toHaveLength(0);
    });

    test('should throw error when presence is disabled', async () => {
      const noPresenceKSync = new KSync({
        features: { presence: false }
      });

      await expect(noPresenceKSync.setPresence({ status: 'online' }))
        .rejects.toThrow('Presence feature is disabled');
    });
  });

  describe('Streaming Support', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage },
        features: { streaming: true }
      });
    });

    test('should start, chunk, and end stream', async () => {
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
      expect(streamEvents[0]).toMatchObject({
        type: 'start',
        data: { streamId, type: 'ai-response' }
      });
      expect(streamEvents[1]).toMatchObject({
        type: 'chunk',
        data: { streamId, data: 'Hello' }
      });
      expect(streamEvents[3]).toMatchObject({
        type: 'end',
        data: { streamId, data: { final: true } }
      });
    });

    test('should auto-end stream after timeout', async () => {
      const endEvents: any[] = [];
      ksync.on('stream-end', (data) => endEvents.push(data));

      await ksync.startStream('auto-end-stream', {
        autoEnd: 50 // 50ms
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(endEvents).toHaveLength(1);
    });

    test('should track active streams', async () => {
      await ksync.startStream('stream1', { type: 'chat' });
      await ksync.startStream('stream2', { type: 'ai' });

      const activeStreams = ksync.getActiveStreams();
      expect(activeStreams).toHaveLength(2);

      await ksync.endStream('stream1');

      const remainingStreams = ksync.getActiveStreams();
      expect(remainingStreams).toHaveLength(1);
      expect(remainingStreams[0].streamId).toBe('stream2');
    });

    test('should throw error for unknown stream', async () => {
      await expect(ksync.streamChunk('unknown-stream', { data: 'test' }))
        .rejects.toThrow('Stream not found');
    });

    test('should throw error when streaming is disabled', async () => {
      const noStreamKSync = new KSync({
        features: { streaming: false }
      });

      await expect(noStreamKSync.startStream('test', {}))
        .rejects.toThrow('Streaming feature is disabled');
    });
  });

  describe('Room Management', () => {
    beforeEach(() => {
      ksync = new KSync({
        room: 'initial-room',
        storage: { instance: mockStorage }
      });
    });

    test('should join room', async () => {
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

    test('should join room with options', async () => {
      await ksync.joinRoom('test-room', {
        leaveCurrentRoom: true,
        syncHistory: false
      });

      expect(ksync.getStatus().room).toBe('test-room');
    });
  });

  describe('Sync Operations', () => {
    beforeEach(() => {
      ksync = new KSync({
        serverUrl: 'ws://localhost:8080',
        storage: { instance: mockStorage },
        sync: {
          enabled: true,
          mode: 'manual'
        }
      });
    });

    test('should handle manual sync', async () => {
      await ksync.send('test-event', { data: 'test' });
      
      // Manual sync should return results
      const result = await ksync.sync();
      expect(result).toEqual({ synced: 0, errors: 0 }); // No connection, so 0 synced
    });

    test('should throw error when sync is disabled', async () => {
      const noSyncKSync = new KSync({
        sync: { enabled: false }
      });

      await expect(noSyncKSync.sync())
        .rejects.toThrow('Sync is disabled');
    });

    test('should throw error when offline', async () => {
      // Mock offline state
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
      });

      const offlineKSync = new KSync({
        serverUrl: 'ws://localhost:8080'
      });

      await expect(offlineKSync.sync())
        .rejects.toThrow('Cannot sync while offline');
    });
  });

  describe('Offline Support', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage },
        offline: {
          enabled: true,
          queueSize: 100,
          persistence: true
        }
      });
    });

    test('should queue events when offline', async () => {
      await ksync.send('offline-event', { data: 'test' });
      
      const status = ksync.getStatus();
      expect(status.events).toBe(1);
    });

    test('should limit queue size', async () => {
      const smallQueueKSync = new KSync({
        offline: { queueSize: 2 }
      });

      await smallQueueKSync.send('event1', {});
      await smallQueueKSync.send('event2', {});
      await smallQueueKSync.send('event3', {});

      const status = smallQueueKSync.getStatus();
      expect(status.queued).toBeLessThanOrEqual(2);
    });
  });

  describe('Performance & Monitoring', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage },
        debug: { performance: false }, // Disable logs for testing
        performance: {
          batchSize: 10,
          batchDelay: 5,
          materializationCaching: true
        }
      });
    });

    test('should track performance metrics', async () => {
      await ksync.send('perf-test', { data: 1 });
      await ksync.send('perf-test', { data: 2 });

      const status = ksync.getStatus();
      expect(status.performance.eventsProcessed).toBeGreaterThanOrEqual(2);
      expect(status.performance.averageProcessingTime).toBeGreaterThan(0);
    });

    test('should provide comprehensive status', () => {
      const status = ksync.getStatus();
      
      expect(status).toMatchObject({
        connected: expect.any(Boolean),
        online: expect.any(Boolean),
        serverUrl: expect.any(String),
        events: expect.any(Number),
        queued: expect.any(Number),
        version: expect.any(Number),
        room: expect.any(String),
        userId: expect.any(String),
        performance: expect.objectContaining({
          eventsProcessed: expect.any(Number),
          averageProcessingTime: expect.any(Number)
        }),
        features: expect.objectContaining({
          syncEnabled: expect.any(Boolean),
          offlineEnabled: expect.any(Boolean),
          presenceEnabled: expect.any(Boolean),
          streamingEnabled: expect.any(Boolean)
        })
      });
    });
  });

  describe('Data Management', () => {
    beforeEach(() => {
      ksync = new KSync({
        storage: { instance: mockStorage }
      });
    });

    test('should clear data with options', async () => {
      await ksync.send('test', { data: 1 });
      await ksync.send('test', { data: 2 });

      expect(ksync.getStatus().events).toBe(2);

      await ksync.clear({ events: true, state: true });

      expect(ksync.getStatus().events).toBe(0);
    });

    test('should clear specific data types', async () => {
      await ksync.send('test', { data: 1 });
      
      // Clear only queue, not events
      await ksync.clear({ events: false, queue: true });
      
      expect(ksync.getStatus().events).toBe(1);
    });

    test('should emit clear event', async () => {
      const clearEvents: any[] = [];
      ksync.on('cleared', (data) => clearEvents.push(data));

      await ksync.clear();

      expect(clearEvents).toHaveLength(1);
    });
  });

  describe('Authentication', () => {
    test('should handle token authentication', () => {
      ksync = new KSync({
        serverUrl: 'ws://localhost:8080',
        auth: {
          token: 'test-token',
          type: 'bearer'
        }
      });

      expect(ksync).toBeDefined();
    });

    test('should handle provider authentication', () => {
      ksync = new KSync({
        serverUrl: 'ws://localhost:8080',
        auth: {
          provider: async () => 'dynamic-token',
          type: 'jwt'
        }
      });

      expect(ksync).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle connection errors gracefully', async () => {
      ksync = new KSync({
        serverUrl: 'ws://invalid-url',
        sync: { enabled: true }
      });

      // Should not throw during construction
      expect(ksync).toBeDefined();
    });

    test('should throw KSyncError for invalid operations', async () => {
      ksync = new KSync({
        sync: { enabled: false }
      });

      await expect(ksync.connect())
        .rejects.toThrow(KSyncError);
    });
  });
});

describe('Factory Functions', () => {
  describe('createKSync', () => {
    test('should create basic KSync instance', () => {
      const ksync = createKSync();
      expect(ksync).toBeInstanceOf(KSync);
    });

    test('should create with configuration', () => {
      const ksync = createKSync({
        room: 'factory-room',
        debug: true
      });
      
      expect(ksync.getStatus().room).toBe('factory-room');
    });
  });

  describe('createChat', () => {
    test('should create chat-optimized instance', () => {
      const chat = createChat('chat-room');
      const status = chat.getStatus();
      
      expect(status.room).toBe('chat-room');
      expect(status.features.presenceEnabled).toBe(true);
    });

    test('should accept additional configuration', () => {
      const chat = createChat('custom-chat', {
        debug: { events: true }
      });
      
      expect(chat.getStatus().room).toBe('custom-chat');
    });
  });

  describe('createTodos', () => {
    test('should create todo-optimized instance', () => {
      const todos = createTodos();
      const status = todos.getStatus();
      
      expect(status.room).toBe('todos');
      expect(status.features.offlineEnabled).toBe(true);
    });

    test('should configure for offline usage', () => {
      const todos = createTodos({
        offline: { queueSize: 10000 }
      });
      
      expect(todos.getStatus().features.offlineEnabled).toBe(true);
    });
  });

  describe('createGame', () => {
    test('should create game-optimized instance', () => {
      const game = createGame('game-123');
      const status = game.getStatus();
      
      expect(status.room).toBe('game-game-123');
      expect(status.features.presenceEnabled).toBe(true);
      expect(status.features.streamingEnabled).toBe(true);
    });
  });

  describe('createAI', () => {
    test('should create AI-optimized instance', () => {
      const ai = createAI();
      const status = ai.getStatus();
      
      expect(status.room).toBe('ai-chat');
      expect(status.features.streamingEnabled).toBe(true);
      expect(status.features.presenceEnabled).toBe(false);
    });

    test('should accept custom conversation ID', () => {
      const ai = createAI('conversation-456');
      
      expect(ai.getStatus().room).toBe('conversation-456');
    });
  });
});

describe('Integration Tests', () => {
  test('should handle complete chat flow', async () => {
    const chat = createChat('integration-test');
    const messages: any[] = [];
    
    // Set up message listener
    chat.on('message', (data) => messages.push(data));
    
    // Set presence
    await chat.setPresence({
      status: 'online',
      metadata: { name: 'Test User' }
    });
    
    // Send messages
    await chat.send('message', {
      text: 'Hello everyone!',
      timestamp: Date.now()
    });
    
    await chat.send('message', {
      text: 'How is everyone doing?',
      timestamp: Date.now()
    });
    
    // Verify results
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe('Hello everyone!');
    
    const presence = chat.getPresence();
    expect(presence).toHaveLength(1);
    expect(presence[0].metadata?.name).toBe('Test User');
    
    const status = chat.getStatus();
    expect(status.events).toBe(3); // 2 messages + 1 presence update
  });

  test('should handle AI streaming conversation', async () => {
    const ai = createAI('ai-test');
    const chunks: string[] = [];
    
    // Set up stream listener
    ai.on('stream-chunk', (data) => {
      chunks.push(data.data);
    });
    
    // Start AI response stream
    await ai.startStream('ai-response-1');
    
    // Stream response chunks
    await ai.streamChunk('ai-response-1', { data: 'Hello! ' });
    await ai.streamChunk('ai-response-1', { data: 'I am ' });
    await ai.streamChunk('ai-response-1', { data: 'an AI assistant.' });
    
    // End stream
    await ai.endStream('ai-response-1');
    
    expect(chunks).toEqual(['Hello! ', 'I am ', 'an AI assistant.']);
    
    const activeStreams = ai.getActiveStreams();
    expect(activeStreams).toHaveLength(0);
  });

  test('should handle game with presence and real-time updates', async () => {
    const game = createGame('shooter-match');
    const gameEvents: any[] = [];
    
    // Set up game event listeners
    game.on('player-move', (data) => gameEvents.push({ type: 'move', data }));
    game.on('player-shoot', (data) => gameEvents.push({ type: 'shoot', data }));
    
    // Set player presence
    await game.setPresence({
      status: 'online',
      metadata: { 
        playerName: 'Player1',
        position: { x: 100, y: 200 },
        health: 100
      }
    });
    
    // Send game events
    await game.send('player-move', {
      playerId: 'player1',
      position: { x: 150, y: 200 },
      timestamp: Date.now()
    });
    
    await game.send('player-shoot', {
      playerId: 'player1',
      target: { x: 300, y: 150 },
      weaponType: 'rifle'
    });
    
    expect(gameEvents).toHaveLength(2);
    expect(gameEvents[0].type).toBe('move');
    expect(gameEvents[1].type).toBe('shoot');
    
    const presence = game.getPresence();
    expect(presence[0].metadata?.playerName).toBe('Player1');
  });
});

describe('Performance Tests', () => {
  test('should handle high event throughput', async () => {
    const ksync = new KSync({
      performance: {
        batchSize: 100,
        batchDelay: 1,
        materializationCaching: true
      }
    });

    const startTime = performance.now();
    
    // Send 1000 events
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(ksync.send('throughput-test', { index: i }));
    }
    
    await Promise.all(promises);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Should process 1000 events in reasonable time
    expect(duration).toBeLessThan(1000); // Less than 1 second
    
    const status = ksync.getStatus();
    expect(status.events).toBe(1000);
    expect(status.performance.eventsProcessed).toBe(1000);
  });

  test('should efficiently batch events', async () => {
    const ksync = new KSync({
      performance: { batchSize: 10, batchDelay: 5 }
    });

    const batchSizes: number[] = [];
    const originalFlush = (ksync as any).flushPendingEvents;
    
    (ksync as any).flushPendingEvents = async function() {
      batchSizes.push(this.pendingEvents.length);
      return originalFlush.call(this);
    };

    // Send 25 events quickly
    for (let i = 0; i < 25; i++) {
      await ksync.send('batch-test', { index: i });
    }

    // Wait for all batches to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should have created batches of size 10, 10, 5
    expect(batchSizes.filter(size => size === 10)).toHaveLength(2);
    expect(batchSizes.filter(size => size === 5)).toHaveLength(1);
  });

  test('should cache materialization efficiently', async () => {
    let materializationCount = 0;
    
    const ksync = new KSync({
      state: {
        materializer: (events) => {
          materializationCount++;
          return { count: events.length };
        },
        enableCaching: true
      }
    });

    await ksync.send('test', { data: 1 });

    // Get state multiple times
    ksync.getState();
    ksync.getState();
    ksync.getState();

    // Should only materialize once due to caching
    expect(materializationCount).toBe(1);

    // Force rematerialization
    ksync.getState(true);
    expect(materializationCount).toBe(2);
  });

  test('should handle memory efficiently with large event counts', async () => {
    const ksync = new KSync({
      storage: {
        options: {
          maxEvents: 100 // Small limit for testing
        }
      }
    });

    // Send more events than the limit
    for (let i = 0; i < 150; i++) {
      await ksync.send('memory-test', { index: i });
    }

    // Wait for trimming
    await new Promise(resolve => setTimeout(resolve, 50));

    const status = ksync.getStatus();
    
    // Should have trimmed to the max limit
    expect(status.events).toBeLessThanOrEqual(100);
  });
});

describe('Edge Cases & Error Conditions', () => {
  test('should handle rapid event sending', async () => {
    const ksync = new KSync();
    
    // Send many events simultaneously
    const promises = Array.from({ length: 100 }, (_, i) =>
      ksync.send('rapid-test', { index: i })
    );
    
    await expect(Promise.all(promises)).resolves.not.toThrow();
    
    expect(ksync.getStatus().events).toBe(100);
  });

  test('should handle event with null/undefined data', async () => {
    const ksync = new KSync();
    
    await expect(ksync.send('null-test', null)).resolves.not.toThrow();
    await expect(ksync.send('undefined-test', undefined)).resolves.not.toThrow();
    
    expect(ksync.getStatus().events).toBe(2);
  });

  test('should handle very large event data', async () => {
    const ksync = new KSync();
    const largeData = {
      content: 'x'.repeat(10000), // 10KB string
      metadata: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
    };
    
    await expect(ksync.send('large-data', largeData)).resolves.not.toThrow();
    
    expect(ksync.getStatus().events).toBe(1);
  });

  test('should handle circular references in event data', async () => {
    const ksync = new KSync();
    const circularData: any = { name: 'test' };
    circularData.self = circularData;
    
    // Should handle circular references gracefully
    await expect(ksync.send('circular-test', circularData)).resolves.not.toThrow();
  });

  test('should handle invalid stream operations', async () => {
    const ksync = new KSync({ features: { streaming: true } });
    
    // Try to chunk to non-existent stream
    await expect(ksync.streamChunk('non-existent', { data: 'test' }))
      .rejects.toThrow('Stream not found');
    
    // Try to end non-existent stream
    await expect(ksync.endStream('non-existent'))
      .rejects.toThrow('Stream not found');
  });

  test('should handle materialization errors gracefully', async () => {
    const ksync = new KSync({
      state: {
        materializer: (events) => {
          if (events.length > 2) {
            throw new Error('Materialization failed');
          }
          return { count: events.length };
        }
      }
    });

    await ksync.send('test1', {});
    await ksync.send('test2', {});
    
    // Should work fine
    expect(ksync.getState()).toEqual({ count: 2 });
    
    await ksync.send('test3', {}); // This should trigger the error
    
    // Should handle the error gracefully (not crash the system)
    expect(() => ksync.getState()).not.toThrow();
  });
}); 