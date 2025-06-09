#!/usr/bin/env ts-node

import { KSync, createKSync, createChat, createTodos, createGame, createAI } from '../src/core';
import { MemoryStorage } from '../src/storage/memory';
import { KSyncEvent } from '../src/types';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

interface BenchmarkResult {
  name: string;
  duration: number;
  operations: number;
  opsPerSecond: number;
  memoryUsed?: number;
  success: boolean;
  details?: any;
}

class BenchmarkSuite {
  private results: BenchmarkResult[] = [];

  async run(): Promise<void> {
    console.log(`${colors.bright}${colors.cyan}🚀 KSync Performance Benchmark Suite${colors.reset}\n`);

    // Core Performance Tests
    await this.runBenchmark('Basic Event Throughput', () => this.benchmarkEventThroughput());
    await this.runBenchmark('Event Batching Performance', () => this.benchmarkEventBatching());
    await this.runBenchmark('State Materialization', () => this.benchmarkMaterialization());
    await this.runBenchmark('Memory Efficiency', () => this.benchmarkMemoryEfficiency());
    await this.runBenchmark('Concurrent Operations', () => this.benchmarkConcurrentOperations());
    
    // Storage Performance Tests
    await this.runBenchmark('Storage Performance', () => this.benchmarkStoragePerformance());
    
    // Feature Performance Tests
    await this.runBenchmark('Presence System Performance', () => this.benchmarkPresenceSystem());
    await this.runBenchmark('Streaming Performance', () => this.benchmarkStreamingPerformance());
    
    // Real-world Scenarios
    await this.runBenchmark('Chat Application Simulation', () => this.benchmarkChatApplication());
    await this.runBenchmark('Game Application Simulation', () => this.benchmarkGameApplication());
    await this.runBenchmark('AI Streaming Simulation', () => this.benchmarkAIStreaming());
    
    // Edge Cases & Stress Tests
    await this.runBenchmark('Large Payload Handling', () => this.benchmarkLargePayloads());
    await this.runBenchmark('Rapid Event Generation', () => this.benchmarkRapidEvents());
    await this.runBenchmark('Long Running Stress Test', () => this.benchmarkStressTest());

    this.printSummary();
  }

  private async runBenchmark(name: string, benchmarkFn: () => Promise<BenchmarkResult>): Promise<void> {
    console.log(`${colors.yellow}⏱️  Running: ${name}${colors.reset}`);
    
    try {
      const result = await benchmarkFn();
      this.results.push(result);
      
      const color = result.success ? colors.green : colors.red;
      const status = result.success ? '✅' : '❌';
      
      console.log(`${color}${status} ${name}: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms)${colors.reset}`);
      
      if (result.details) {
        console.log(`   ${colors.blue}Details: ${JSON.stringify(result.details)}${colors.reset}`);
      }
      
    } catch (error) {
      console.log(`${colors.red}❌ ${name}: Failed - ${error}${colors.reset}`);
      this.results.push({
        name,
        duration: 0,
        operations: 0,
        opsPerSecond: 0,
        success: false
      });
    }
    
    console.log();
  }

  // === CORE PERFORMANCE BENCHMARKS ===

  private async benchmarkEventThroughput(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      performance: { batchSize: 100, batchDelay: 1 },
      debug: false
    });

    const eventCount = 10000;
    const startTime = performance.now();

    // Send events as fast as possible
    const promises = [];
    for (let i = 0; i < eventCount; i++) {
      promises.push(ksync.send('throughput-test', {
        index: i,
        timestamp: Date.now(),
        data: `Event ${i}`
      }));
    }

    await Promise.all(promises);
    
    // Wait for all events to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (eventCount / duration) * 1000;

    const status = ksync.getStatus();
    
    return {
      name: 'Event Throughput',
      duration,
      operations: eventCount,
      opsPerSecond,
      success: status.events === eventCount && opsPerSecond > 10000, // Target: >10k ops/sec
      details: {
        eventsProcessed: status.events,
        averageProcessingTime: status.performance.averageProcessingTime
      }
    };
  }

  private async benchmarkEventBatching(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      performance: { batchSize: 50, batchDelay: 5 },
      debug: false
    });

    const batchSizes: number[] = [];
    const originalFlush = (ksync as any).flushPendingEvents;
    
    // Monitor batch sizes
    (ksync as any).flushPendingEvents = async function() {
      batchSizes.push(this.pendingEvents.length);
      return originalFlush.call(this);
    };

    const eventCount = 1000;
    const startTime = performance.now();

    // Send events rapidly to trigger batching
    for (let i = 0; i < eventCount; i++) {
      await ksync.send('batch-test', { index: i });
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (eventCount / duration) * 1000;

    const averageBatchSize = batchSizes.reduce((a, b) => a + b, 0) / batchSizes.length;
    const maxBatchSize = Math.max(...batchSizes);

    return {
      name: 'Event Batching',
      duration,
      operations: eventCount,
      opsPerSecond,
      success: opsPerSecond > 15000 && averageBatchSize > 20, // Target: >15k ops/sec with good batching
      details: {
        batchCount: batchSizes.length,
        averageBatchSize: averageBatchSize.toFixed(1),
        maxBatchSize,
        efficiency: `${((averageBatchSize / 50) * 100).toFixed(1)}%`
      }
    };
  }

  private async benchmarkMaterialization(): Promise<BenchmarkResult> {
    let materializationCount = 0;
    
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      state: {
        materializer: (events: KSyncEvent[]) => {
          materializationCount++;
          // Complex materialization logic
          return events.reduce((state, event) => {
            if (event.type === 'user-action') {
              const userId = event.data.userId;
              if (!state.users) state.users = {};
              if (!state.users[userId]) state.users[userId] = { actions: 0, score: 0 };
              state.users[userId].actions++;
              state.users[userId].score += event.data.points || 1;
              state.totalActions = (state.totalActions || 0) + 1;
              state.totalScore = (state.totalScore || 0) + (event.data.points || 1);
            }
            return state;
          }, {} as any);
        },
        enableCaching: true,
        autoMaterialize: false
      },
      debug: false
    });

    // Generate events
    const eventCount = 5000;
    for (let i = 0; i < eventCount; i++) {
      await ksync.send('user-action', {
        userId: `user-${i % 100}`, // 100 different users
        action: 'click',
        points: Math.floor(Math.random() * 10) + 1,
        timestamp: Date.now()
      });
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    // Benchmark materialization
    const startTime = performance.now();
    const state = ksync.getState();
    const endTime = performance.now();

    const duration = endTime - startTime;
    const opsPerSecond = (eventCount / duration) * 1000;

    // Test caching
    const cacheStart = performance.now();
    ksync.getState();
    const cacheDuration = performance.now() - cacheStart;

    return {
      name: 'State Materialization',
      duration,
      operations: eventCount,
      opsPerSecond,
      success: duration < 100 && cacheDuration < 5 && materializationCount === 1, // Target: <100ms materialization, <5ms cache access
      details: {
        materializationTime: duration.toFixed(2) + 'ms',
        cacheAccessTime: cacheDuration.toFixed(2) + 'ms',
        materializationCount,
        usersProcessed: Object.keys(state.users || {}).length,
        totalActions: state.totalActions,
        cacheEfficiency: materializationCount === 1 ? 'Perfect' : 'Poor'
      }
    };
  }

  private async benchmarkMemoryEfficiency(): Promise<BenchmarkResult> {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    const ksync = new KSync({
      storage: {
        instance: new MemoryStorage(),
        options: { maxEvents: 1000 } // Limit for memory test
      },
      debug: false
    });

    const eventCount = 2000; // More than maxEvents to test trimming
    const startTime = performance.now();

    // Generate events with varying payload sizes
    for (let i = 0; i < eventCount; i++) {
      await ksync.send('memory-test', {
        index: i,
        data: 'x'.repeat(i % 100 + 10), // Variable payload size
        metadata: {
          batch: Math.floor(i / 100),
          timestamp: Date.now()
        }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (eventCount / duration) * 1000;

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryUsed = finalMemory - initialMemory;

    const status = ksync.getStatus();
    const memoryPerEvent = status.events > 0 ? memoryUsed / status.events : 0;

    return {
      name: 'Memory Efficiency',
      duration,
      operations: eventCount,
      opsPerSecond,
      memoryUsed,
      success: status.events <= 1000 && memoryPerEvent < 2048, // Target: Memory trimming works, <2KB per event
      details: {
        eventsStored: status.events,
        eventsGenerated: eventCount,
        memoryUsedMB: (memoryUsed / 1024 / 1024).toFixed(2),
        memoryPerEventBytes: memoryPerEvent.toFixed(0),
        trimmingWorking: status.events < eventCount
      }
    };
  }

  private async benchmarkConcurrentOperations(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      features: { presence: true, streaming: true },
      debug: false
    });

    const startTime = performance.now();

    // Run multiple types of operations concurrently
    const operations = [
      // Send 500 events concurrently
      ...Array.from({ length: 500 }, (_, i) => 
        ksync.send('concurrent-event', { worker: 'sender', index: i })
      ),
      
      // Read state 100 times concurrently
      ...Array.from({ length: 100 }, () => 
        Promise.resolve(ksync.getStatus())
      ),
      
      // Set presence 50 times concurrently
      ...Array.from({ length: 50 }, (_, i) => 
        ksync.setPresence({ status: 'online', metadata: { activity: i } })
      ),
      
      // Start and manage 20 streams concurrently
      ...Array.from({ length: 20 }, async (_, i) => {
        await ksync.startStream(`stream-${i}`, { type: 'concurrent-test' });
        await ksync.streamChunk(`stream-${i}`, { data: `chunk-${i}` });
        await ksync.endStream(`stream-${i}`);
      })
    ];

    await Promise.all(operations);
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const totalOps = operations.length;
    const opsPerSecond = (totalOps / duration) * 1000;

    const status = ksync.getStatus();

    return {
      name: 'Concurrent Operations',
      duration,
      operations: totalOps,
      opsPerSecond,
      success: opsPerSecond > 1000 && status.events >= 500, // Target: >1k concurrent ops/sec
      details: {
        eventsGenerated: status.events,
        presenceUpdates: ksync.getPresence().length,
        operationTypes: 4,
        concurrencyLevel: totalOps
      }
    };
  }

  // === STORAGE PERFORMANCE ===

  private async benchmarkStoragePerformance(): Promise<BenchmarkResult> {
    const storage = new MemoryStorage();
    const eventCount = 5000;

    // Generate test events
    const events: KSyncEvent[] = Array.from({ length: eventCount }, (_, i) => ({
      id: `event-${i}`,
      type: 'storage-test',
      data: { 
        index: i, 
        message: `Event ${i}`.repeat(5), // Some payload
        metadata: { batch: Math.floor(i / 100) }
      },
      timestamp: Date.now() + i,
      version: i + 1,
      userId: `user-${i % 50}`
    }));

    // Benchmark storage operations
    const storeStart = performance.now();
    await storage.saveEvents(events);
    const storeEnd = performance.now();

    const retrieveStart = performance.now();
    const retrievedEvents = await storage.loadEvents();
    const retrieveEnd = performance.now();

    const storeDuration = storeEnd - storeStart;
    const retrieveDuration = retrieveEnd - retrieveStart;
    const totalDuration = storeDuration + retrieveDuration;

    const storeOpsPerSec = (eventCount / storeDuration) * 1000;
    const retrieveOpsPerSec = (retrievedEvents.length / retrieveDuration) * 1000;
    const avgOpsPerSec = (eventCount * 2 / totalDuration) * 1000;

    return {
      name: 'Storage Performance',
      duration: totalDuration,
      operations: eventCount * 2, // Store + retrieve
      opsPerSecond: avgOpsPerSec,
      success: storeOpsPerSec > 50000 && retrieveOpsPerSec > 100000, // Target: >50k store, >100k retrieve ops/sec
      details: {
        storeOpsPerSec: storeOpsPerSec.toFixed(0),
        retrieveOpsPerSec: retrieveOpsPerSec.toFixed(0),
        storeDuration: storeDuration.toFixed(2) + 'ms',
        retrieveDuration: retrieveDuration.toFixed(2) + 'ms',
        eventsStored: eventCount,
        eventsRetrieved: retrievedEvents.length
      }
    };
  }

  // === FEATURE PERFORMANCE ===

  private async benchmarkPresenceSystem(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      features: { presence: true },
      debug: false
    });

    const userCount = 1000;
    const startTime = performance.now();

    // Simulate many users setting presence
    const presenceOps = [];
    for (let i = 0; i < userCount; i++) {
      const userKSync = new KSync({
        userId: `user-${i}`,
        storage: { instance: new MemoryStorage() },
        features: { presence: true }
      });
      
      presenceOps.push(userKSync.setPresence({
        status: i % 3 === 0 ? 'online' : i % 3 === 1 ? 'away' : 'offline',
        metadata: {
          name: `User ${i}`,
          location: `Location ${i % 10}`,
          activity: `Activity ${i % 5}`
        }
      }));
    }

    await Promise.all(presenceOps);

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (userCount / duration) * 1000;

    // Test presence filtering
    const filterStart = performance.now();
    const onlineUsers = ksync.getPresence(p => p.status === 'online');
    const filterDuration = performance.now() - filterStart;

    return {
      name: 'Presence System',
      duration,
      operations: userCount,
      opsPerSecond,
      success: opsPerSecond > 5000 && filterDuration < 10, // Target: >5k presence ops/sec, <10ms filtering
      details: {
        usersProcessed: userCount,
        filterDuration: filterDuration.toFixed(2) + 'ms',
        onlineUsers: onlineUsers.length,
        presenceUpdatesPerSec: opsPerSecond.toFixed(0)
      }
    };
  }

  private async benchmarkStreamingPerformance(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      features: { streaming: true },
      debug: false
    });

    const streamCount = 100;
    const chunksPerStream = 50;
    const totalChunks = streamCount * chunksPerStream;

    const startTime = performance.now();

    // Start many streams and send chunks
    const streamOps = [];
    for (let i = 0; i < streamCount; i++) {
      const streamId = `stream-${i}`;
      
      streamOps.push((async () => {
        await ksync.startStream(streamId, { type: 'performance-test' });
        
        for (let j = 0; j < chunksPerStream; j++) {
          await ksync.streamChunk(streamId, {
            data: `Chunk ${j} for stream ${i}`,
            metadata: { sequence: j }
          });
        }
        
        await ksync.endStream(streamId);
      })());
    }

    await Promise.all(streamOps);

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (totalChunks / duration) * 1000;

    const activeStreams = ksync.getActiveStreams();

    return {
      name: 'Streaming Performance',
      duration,
      operations: totalChunks,
      opsPerSecond,
      success: opsPerSecond > 10000 && activeStreams.length === 0, // Target: >10k chunks/sec, proper cleanup
      details: {
        streamsProcessed: streamCount,
        chunksPerStream,
        totalChunks,
        activeStreamsAfter: activeStreams.length,
        chunksPerSecond: opsPerSecond.toFixed(0)
      }
    };
  }

  // === REAL-WORLD SIMULATIONS ===

  private async benchmarkChatApplication(): Promise<BenchmarkResult> {
    const userCount = 50;
    const messagesPerUser = 20;
    const totalMessages = userCount * messagesPerUser;

    const chatInstances = Array.from({ length: userCount }, (_, i) => 
      createChat(`chat-room-${Math.floor(i / 10)}`, { // 5 rooms, 10 users each
        userId: `user-${i}`,
        debug: false
      })
    );

    const startTime = performance.now();

    // Simulate chat activity
    const chatOps = [];
    
    // Set presence for all users
    chatInstances.forEach((chat, i) => {
      chatOps.push(chat.setPresence({
        status: 'online',
        metadata: { name: `User ${i}`, joinedAt: Date.now() }
      }));
    });

    // Send messages
    for (let i = 0; i < messagesPerUser; i++) {
      chatInstances.forEach((chat, userIndex) => {
        chatOps.push(chat.send('message', {
          text: `Message ${i} from user ${userIndex}`,
          timestamp: Date.now(),
          messageId: `msg-${userIndex}-${i}`
        }));
      });
    }

    await Promise.all(chatOps);
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = ((totalMessages + userCount) / duration) * 1000; // Messages + presence updates

    const sampleChat = chatInstances[0];
    const status = sampleChat.getStatus();
    const presence = sampleChat.getPresence();

    return {
      name: 'Chat Application',
      duration,
      operations: totalMessages + userCount,
      opsPerSecond,
      success: opsPerSecond > 2000 && status.events > 0, // Target: >2k ops/sec for chat
      details: {
        users: userCount,
        rooms: 5,
        messagesPerUser,
        totalMessages,
        presenceUpdates: userCount,
        sampleChatEvents: status.events,
        samplePresenceCount: presence.length
      }
    };
  }

  private async benchmarkGameApplication(): Promise<BenchmarkResult> {
    const playerCount = 20;
    const actionsPerPlayer = 100;
    const totalActions = playerCount * actionsPerPlayer;

    const gameInstances = Array.from({ length: playerCount }, (_, i) => 
      createGame('match-123', {
        userId: `player-${i}`,
        debug: false
      })
    );

    const startTime = performance.now();

    // Simulate game activity
    const gameOps = [];

    // Set player presence
    gameInstances.forEach((game, i) => {
      gameOps.push(game.setPresence({
        status: 'online',
        metadata: {
          playerName: `Player ${i}`,
          position: { x: Math.random() * 1000, y: Math.random() * 1000 },
          health: 100,
          level: Math.floor(Math.random() * 50) + 1
        }
      }));
    });

    // Send game actions
    for (let i = 0; i < actionsPerPlayer; i++) {
      gameInstances.forEach((game, playerIndex) => {
        const actionType = ['move', 'shoot', 'pickup', 'ability'][i % 4];
        
        gameOps.push(game.send(`player-${actionType}`, {
          playerId: `player-${playerIndex}`,
          position: { 
            x: Math.random() * 1000, 
            y: Math.random() * 1000 
          },
          timestamp: Date.now(),
          actionId: `action-${playerIndex}-${i}`
        }));
      });
    }

    await Promise.all(gameOps);
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = ((totalActions + playerCount) / duration) * 1000;

    const sampleGame = gameInstances[0];
    const status = sampleGame.getStatus();

    return {
      name: 'Game Application',
      duration,
      operations: totalActions + playerCount,
      opsPerSecond,
      success: opsPerSecond > 5000, // Target: >5k ops/sec for games (higher requirement)
      details: {
        players: playerCount,
        actionsPerPlayer,
        totalActions,
        actionTypes: 4,
        sampleGameEvents: status.events,
        gameSessionDuration: duration.toFixed(2) + 'ms'
      }
    };
  }

  private async benchmarkAIStreaming(): Promise<BenchmarkResult> {
    const conversationCount = 20;
    const responsesPerConversation = 10;
    const chunksPerResponse = 25; // Typical AI response length
    const totalChunks = conversationCount * responsesPerConversation * chunksPerResponse;

    const aiInstances = Array.from({ length: conversationCount }, (_, i) => 
      createAI(`conversation-${i}`, { debug: false })
    );

    const startTime = performance.now();

    // Simulate AI streaming conversations
    const aiOps = [];

    for (let convIndex = 0; convIndex < conversationCount; convIndex++) {
      const ai = aiInstances[convIndex];
      
      for (let respIndex = 0; respIndex < responsesPerConversation; respIndex++) {
        const streamId = `ai-response-${convIndex}-${respIndex}`;
        
        aiOps.push((async () => {
          await ai.startStream(streamId, { 
            type: 'ai-response',
            metadata: { model: 'benchmark-model', conversation: convIndex }
          });

          const words = ['Hello', 'I', 'am', 'an', 'AI', 'assistant', 'here', 'to', 'help', 'you', 'with', 'your', 'questions', 'and', 'tasks', 'today', 'Please', 'let', 'me', 'know', 'how', 'I', 'can', 'assist', 'you'];
          
          for (let chunkIndex = 0; chunkIndex < chunksPerResponse; chunkIndex++) {
            await ai.streamChunk(streamId, {
              data: words[chunkIndex % words.length] + ' ',
              metadata: { sequence: chunkIndex }
            });
          }

          await ai.endStream(streamId, { complete: true });
        })());
      }
    }

    await Promise.all(aiOps);
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (totalChunks / duration) * 1000;

    const sampleAI = aiInstances[0];
    const activeStreams = sampleAI.getActiveStreams();

    return {
      name: 'AI Streaming',
      duration,
      operations: totalChunks,
      opsPerSecond,
      success: opsPerSecond > 15000 && activeStreams.length === 0, // Target: >15k chunks/sec for AI streaming
      details: {
        conversations: conversationCount,
        responsesPerConversation,
        chunksPerResponse,
        totalChunks,
        activeStreamsAfter: activeStreams.length,
        avgResponseTime: (duration / (conversationCount * responsesPerConversation)).toFixed(2) + 'ms'
      }
    };
  }

  // === STRESS TESTS ===

  private async benchmarkLargePayloads(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      debug: false
    });

    const payloadSizes = [1024, 5120, 10240, 51200]; // 1KB, 5KB, 10KB, 50KB
    const eventsPerSize = 100;
    const totalEvents = payloadSizes.length * eventsPerSize;

    const startTime = performance.now();

    const payloadOps = [];
    payloadSizes.forEach((size, sizeIndex) => {
      for (let i = 0; i < eventsPerSize; i++) {
        const largeData = {
          content: 'x'.repeat(size),
          metadata: Array.from({ length: size / 100 }, (_, j) => ({ 
            id: j, 
            value: `item-${j}` 
          })),
          size,
          index: i
        };

        payloadOps.push(ksync.send(`large-payload-${size}`, largeData));
      }
    });

    await Promise.all(payloadOps);
    await new Promise(resolve => setTimeout(resolve, 100));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (totalEvents / duration) * 1000;

    const status = ksync.getStatus();

    return {
      name: 'Large Payloads',
      duration,
      operations: totalEvents,
      opsPerSecond,
      success: opsPerSecond > 1000 && status.events === totalEvents, // Target: >1k ops/sec even with large payloads
      details: {
        payloadSizes: payloadSizes.map(s => `${s}B`).join(', '),
        eventsPerSize,
        totalEvents,
        eventsProcessed: status.events,
        avgPayloadSize: payloadSizes.reduce((a, b) => a + b, 0) / payloadSizes.length + 'B'
      }
    };
  }

  private async benchmarkRapidEvents(): Promise<BenchmarkResult> {
    const ksync = new KSync({
      storage: { instance: new MemoryStorage() },
      performance: { batchSize: 200, batchDelay: 1 }, // Optimized for rapid events
      debug: false
    });

    const eventCount = 50000; // Very high event count
    const startTime = performance.now();

    // Send events as rapidly as possible without awaiting
    const promises = [];
    for (let i = 0; i < eventCount; i++) {
      promises.push(ksync.send('rapid-event', {
        index: i,
        timestamp: Date.now(),
        batch: Math.floor(i / 1000)
      }));
    }

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 200)); // Allow processing

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (eventCount / duration) * 1000;

    const status = ksync.getStatus();

    return {
      name: 'Rapid Events',
      duration,
      operations: eventCount,
      opsPerSecond,
      success: opsPerSecond > 25000 && status.events === eventCount, // Target: >25k ops/sec for rapid events
      details: {
        eventsGenerated: eventCount,
        eventsProcessed: status.events,
        processingEfficiency: `${((status.events / eventCount) * 100).toFixed(1)}%`,
        avgProcessingTime: status.performance.averageProcessingTime.toFixed(2) + 'ms'
      }
    };
  }

  private async benchmarkStressTest(): Promise<BenchmarkResult> {
    // Multi-faceted stress test
    const instances = {
      chat: createChat('stress-chat', { debug: false }),
      game: createGame('stress-game', { debug: false }),
      ai: createAI('stress-ai', { debug: false }),
      todos: createTodos({ debug: false })
    };

    const startTime = performance.now();
    const stressOps = [];

    // Stress each instance type
    Object.entries(instances).forEach(([type, instance]) => {
      // Send various event types
      for (let i = 0; i < 1000; i++) {
        stressOps.push(instance.send(`${type}-event-${i % 10}`, {
          index: i,
          type,
          timestamp: Date.now(),
          stress: true
        }));
      }

      // Set presence (if supported)
      if (instance.getStatus().features.presenceEnabled) {
        stressOps.push(instance.setPresence({
          status: 'online',
          metadata: { stressTest: true }
        }));
      }

      // Streaming (if supported)
      if (instance.getStatus().features.streamingEnabled) {
        for (let i = 0; i < 50; i++) {
          const streamId = `stress-stream-${type}-${i}`;
          stressOps.push((async () => {
            await instance.startStream(streamId);
            await instance.streamChunk(streamId, { data: `chunk-${i}` });
            await instance.endStream(streamId);
          })());
        }
      }
    });

    await Promise.all(stressOps);
    await new Promise(resolve => setTimeout(resolve, 200));

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (stressOps.length / duration) * 1000;

    // Collect stats from all instances
    const stats = Object.fromEntries(
      Object.entries(instances).map(([type, instance]) => [type, instance.getStatus()])
    );

    const totalEvents = Object.values(stats).reduce((sum, stat) => sum + stat.events, 0);

    return {
      name: 'Stress Test',
      duration,
      operations: stressOps.length,
      opsPerSecond,
      success: opsPerSecond > 3000 && totalEvents > 4000, // Target: >3k ops/sec under stress
      details: {
        instanceTypes: Object.keys(instances).length,
        operationsPerInstance: stressOps.length / Object.keys(instances).length,
        totalEvents,
        chatEvents: stats.chat.events,
        gameEvents: stats.game.events,
        aiEvents: stats.ai.events,
        todoEvents: stats.todos.events
      }
    };
  }

  // === SUMMARY ===

  private printSummary(): void {
    console.log(`${colors.bright}${colors.cyan}📊 Benchmark Summary${colors.reset}\n`);

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);

    console.log(`${colors.green}✅ Passed: ${successful.length}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${failed.length}${colors.reset}`);
    console.log(`${colors.yellow}📈 Total Tests: ${this.results.length}${colors.reset}\n`);

    // Performance targets summary
    const targets = [
      { name: 'Basic Event Throughput', target: '> 10,000 ops/sec', actual: this.results.find(r => r.name === 'Event Throughput')?.opsPerSecond.toFixed(0) + ' ops/sec' },
      { name: 'Event Batching', target: '> 15,000 ops/sec', actual: this.results.find(r => r.name === 'Event Batching')?.opsPerSecond.toFixed(0) + ' ops/sec' },
      { name: 'State Materialization', target: '< 100ms', actual: this.results.find(r => r.name === 'State Materialization')?.duration.toFixed(2) + 'ms' },
      { name: 'Memory Per Event', target: '< 2KB', actual: this.results.find(r => r.name === 'Memory Efficiency')?.details?.memoryPerEventBytes + 'B' },
      { name: 'Concurrent Operations', target: '> 1,000 ops/sec', actual: this.results.find(r => r.name === 'Concurrent Operations')?.opsPerSecond.toFixed(0) + ' ops/sec' }
    ];

    console.log(`${colors.bright}🎯 Performance Targets:${colors.reset}`);
    targets.forEach(({ name, target, actual }) => {
      console.log(`   ${name}: ${target} → ${actual || 'N/A'}`);
    });

    console.log();

    // Top performers
    const topPerformers = this.results
      .filter(r => r.success)
      .sort((a, b) => b.opsPerSecond - a.opsPerSecond)
      .slice(0, 5);

    if (topPerformers.length > 0) {
      console.log(`${colors.bright}🏆 Top Performers:${colors.reset}`);
      topPerformers.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.name}: ${result.opsPerSecond.toFixed(0)} ops/sec`);
      });
      console.log();
    }

    // Failed tests
    if (failed.length > 0) {
      console.log(`${colors.bright}${colors.red}❌ Failed Tests:${colors.reset}`);
      failed.forEach(result => {
        console.log(`   ${result.name}: ${result.opsPerSecond.toFixed(0)} ops/sec`);
      });
      console.log();
    }

    const overallScore = (successful.length / this.results.length) * 100;
    const scoreColor = overallScore >= 90 ? colors.green : overallScore >= 70 ? colors.yellow : colors.red;
    
    console.log(`${colors.bright}🎯 Overall Score: ${scoreColor}${overallScore.toFixed(1)}%${colors.reset}\n`);
    
    if (overallScore >= 90) {
      console.log(`${colors.green}🎉 Excellent performance! KSync is ready for production.${colors.reset}`);
    } else if (overallScore >= 70) {
      console.log(`${colors.yellow}⚠️  Good performance with room for improvement.${colors.reset}`);
    } else {
      console.log(`${colors.red}🔧 Performance needs optimization before production use.${colors.reset}`);
    }
  }
}

// Run the benchmark suite
if (require.main === module) {
  const suite = new BenchmarkSuite();
  suite.run().catch(console.error);
}

export { BenchmarkSuite }; 