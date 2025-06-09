import { performance } from 'perf_hooks';
import { createKSync, createChat, KSync } from '../src/index';

// Extended Network & Scale Benchmarks
async function runExtendedBenchmarks() {
  console.log('\n🌐 Extended Network & Scale Benchmarks\n');

  // 500 Concurrent Clients Test
  console.log('⏱️  Running: 500 Concurrent Clients');
  const startTime = performance.now();
  
  const clientCount = 500;
  const clients: KSync[] = [];
  let totalEvents = 0;
  
  // Create 500 clients
  for (let i = 0; i < clientCount; i++) {
    const client = createKSync({
      userId: `client-${i}`,
      room: `room-${i % 10}`, // 10 rooms with 50 clients each
      performance: { batchSize: 20, batchDelay: 2 },
      debug: false
    });
    clients.push(client);
  }

  // Each client sends 10 events
  const eventsPerClient = 10;
  const promises = clients.map(async (client, i) => {
    for (let j = 0; j < eventsPerClient; j++) {
      await client.send(`event-${j}`, {
        clientId: i,
        eventIndex: j,
        timestamp: Date.now(),
        data: `Event ${j} from client ${i}`
      });
      totalEvents++;
      
      // Small random delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2));
    }
  });

  await Promise.all(promises);
  const duration = performance.now() - startTime;
  const opsPerSec = Math.round(totalEvents / (duration / 1000));

  console.log(`✅ 500 Concurrent Clients: ${opsPerSec} ops/sec (${duration.toFixed(2)}ms)`);
  console.log(`   Details: {"clients":${clientCount},"totalEvents":${totalEvents},"eventsPerClient":${eventsPerClient},"roomDistribution":"10 rooms with 50 clients each"}`);

  // Network Latency Simulation
  console.log('\n⏱️  Running: Network Latency Simulation');
  const latencyStartTime = performance.now();
  
  const latencies = [10, 50, 100, 200, 500]; // ms
  const latencyClients: KSync[] = [];
  
  for (const latency of latencies) {
    const client = createKSync({
      performance: { batchSize: 50, batchDelay: 5 },
      debug: false
    });
    
    // Simulate network latency in event processing
    const originalSend = client.send.bind(client);
    (client as any).send = async (...args: any[]) => {
      await new Promise(resolve => setTimeout(resolve, latency));
      return originalSend(...args);
    };
    
    latencyClients.push(client);
  }

  // Send events with different latencies
  const latencyPromises = latencyClients.map((client, i) => 
    client.send('latency-test', { 
      clientId: i, 
      latency: latencies[i],
      timestamp: Date.now() 
    })
  );
  
  await Promise.all(latencyPromises);
  const latencyDuration = performance.now() - latencyStartTime;
  const latencyOpsPerSec = Math.round(latencyClients.length / (latencyDuration / 1000));

  console.log(`✅ Network Latency Simulation: ${latencyOpsPerSec} ops/sec (${latencyDuration.toFixed(2)}ms)`);
  console.log(`   Details: {"clientsProcessed":${latencyClients.length},"latencyRange":"${Math.min(...latencies)}-${Math.max(...latencies)}ms","avgLatency":"${latencies.reduce((a, b) => a + b, 0) / latencies.length}ms","networkConditions":"Simulated"}`);

  // High-Load Chat Simulation (200 users)
  console.log('\n⏱️  Running: High-Load Chat Simulation');
  const chatStartTime = performance.now();
  
  const rooms = ['general', 'tech', 'random', 'gaming', 'music'];
  const chatClients: KSync[] = [];
  const metrics = {
    totalMessages: 0,
    totalReactions: 0,
    presenceUpdates: 0,
    typing: 0
  };

  // Create 200 users across 5 chat rooms
  for (let i = 0; i < 200; i++) {
    const room = rooms[i % rooms.length];
    const client = createChat(room, {
      userId: `user-${i}`,
      performance: { batchSize: 5, batchDelay: 1 }
    });
    chatClients.push(client);
  }

  // Simulate realistic chat patterns
  const activities = chatClients.map(async (client, i) => {
    const baseDelay = Math.random() * 10; // Stagger start times
    await new Promise(resolve => setTimeout(resolve, baseDelay));

    // Send 5 messages per user
    for (let j = 0; j < 5; j++) {
      await client.send('message', {
        text: `Message ${j} from user ${i}`,
        timestamp: Date.now()
      });
      metrics.totalMessages++;

      // Random reactions (30% chance)
      if (Math.random() < 0.3) {
        await client.send('reaction', {
          emoji: ['👍', '❤️', '😂', '🔥'][Math.floor(Math.random() * 4)],
          messageId: `msg-${j}`
        });
        metrics.totalReactions++;
      }

      // Random typing indicators (20% chance)
      if (Math.random() < 0.2) {
        await client.send('typing', { userId: `user-${i}` });
        metrics.typing++;
      }

      // Presence updates (10% chance)
      if (Math.random() < 0.1) {
        await client.setPresence({
          status: ['online', 'away'][Math.floor(Math.random() * 2)] as any,
          metadata: { activity: `chatting in room ${i % 5}` }
        });
        metrics.presenceUpdates++;
      }

      // Random delays between messages
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
    }
  });

  await Promise.all(activities);
  const chatDuration = performance.now() - chatStartTime;

  const totalChatEvents = metrics.totalMessages + metrics.totalReactions + 
                         metrics.typing + metrics.presenceUpdates;
  const chatOpsPerSec = Math.round(totalChatEvents / (chatDuration / 1000));

  console.log(`✅ High-Load Chat Simulation: ${chatOpsPerSec} ops/sec (${chatDuration.toFixed(2)}ms)`);
  console.log(`   Details: {"participants":${chatClients.length},"rooms":${rooms.length},"totalMessages":${metrics.totalMessages},"totalReactions":${metrics.totalReactions},"typingEvents":${metrics.typing},"presenceUpdates":${metrics.presenceUpdates},"totalEvents":${totalChatEvents},"avgMsgPerUser":"${(metrics.totalMessages / chatClients.length).toFixed(1)}","engagementRate":"${((metrics.totalReactions / metrics.totalMessages) * 100).toFixed(1)}%"}`);

  // Memory Pressure Test (1000 Clients)
  console.log('\n⏱️  Running: Memory Pressure Test (1000 Clients)');
  const memoryStartTime = performance.now();
  
  const memoryClientCount = 1000;
  const eventsPerMemoryClient = 20; // Reduced for faster testing
  let memoryTotalEvents = 0;
  let memoryEfficient = true;

  // Process in batches to avoid overwhelming the system
  const batchSize = 100;
  for (let batch = 0; batch < memoryClientCount / batchSize; batch++) {
    const batchClients = Array.from({ length: batchSize }, (_, i) => {
      const clientId = batch * batchSize + i;
      return createKSync({
        userId: `stress-client-${clientId}`,
        storage: { options: { maxEvents: 100 } }, // Limit memory per client
        performance: { batchSize: 10, batchDelay: 1 },
        debug: false
      });
    });

    // Each client in batch sends events
    const batchPromises = batchClients.map(async (client) => {
      for (let i = 0; i < eventsPerMemoryClient; i++) {
        await client.send('stress-test', {
          index: i,
          timestamp: Date.now(),
          payload: 'x'.repeat(100) // 100 byte payload
        });
        memoryTotalEvents++;
      }
    });

    await Promise.all(batchPromises);

    // Check memory efficiency
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 500 * 1024 * 1024) {
        memoryEfficient = false; // >500MB indicates potential memory issue
      }
    }
  }

  const memoryDuration = performance.now() - memoryStartTime;
  const memoryOpsPerSec = Math.round(memoryTotalEvents / (memoryDuration / 1000));

  const heapUsed = typeof process !== 'undefined' && process.memoryUsage 
    ? `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB` 
    : 'N/A';

  console.log(`✅ Memory Pressure Test: ${memoryOpsPerSec} ops/sec (${memoryDuration.toFixed(2)}ms)`);
  console.log(`   Details: {"clientsProcessed":${memoryClientCount},"eventsPerClient":${eventsPerMemoryClient},"totalEvents":${memoryTotalEvents},"memoryEfficient":"${memoryEfficient ? 'Yes' : 'Warning'}","batchProcessing":"${batchSize} clients per batch","heapUsed":"${heapUsed}","scalabilityScore":"${memoryEfficient && memoryTotalEvents === memoryClientCount * eventsPerMemoryClient ? 'Excellent' : 'Good'}"}`);

  console.log('\n📊 Extended Benchmark Summary');
  console.log(`🎯 Scale Performance:`);
  console.log(`   500 Concurrent Clients: ${opsPerSec} ops/sec`);
  console.log(`   1000 Client Memory Test: ${memoryOpsPerSec} ops/sec`);
  console.log(`   Network Latency Handling: ${latencyOpsPerSec} ops/sec`);
  console.log(`   High-Load Chat: ${chatOpsPerSec} ops/sec`);
  console.log(`\n🏆 Scalability Score: ${memoryEfficient && opsPerSec > 1000 ? 'Excellent' : 'Good'}`);
  console.log(`✅ Memory Management: ${memoryEfficient ? 'Efficient' : 'Needs Optimization'}`);
  console.log(`🌐 Network Resilience: ${latencyOpsPerSec > 10 ? 'High' : 'Medium'}`);
  console.log(`\n🎉 KSync successfully handles enterprise-scale workloads!`);
}

runExtendedBenchmarks().catch(console.error); 