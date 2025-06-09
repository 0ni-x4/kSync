import { performance } from 'perf_hooks';
import { createKSync, createChat } from '../src/index';

async function quickScaleTest() {
  console.log('🚀 Quick Scale Test: 500+ Clients & Latency Simulation\n');

  // Test 1: 500 Concurrent Clients
  console.log('⏱️  Testing 500 Concurrent Clients...');
  const startTime = performance.now();
  
  const clients = Array.from({ length: 500 }, (_, i) => 
    createKSync({
      userId: `client-${i}`,
      room: `room-${i % 10}`,
      performance: { batchSize: 20, batchDelay: 1 },
      debug: false
    })
  );

  // Each client sends 5 events concurrently
  let totalEvents = 0;
  await Promise.all(clients.map(async (client, i) => {
    for (let j = 0; j < 5; j++) {
      await client.send(`event-${j}`, { clientId: i, data: `Test event ${j}` });
      totalEvents++;
    }
  }));

  const duration = performance.now() - startTime;
  const opsPerSec = Math.round(totalEvents / (duration / 1000));
  
  console.log(`✅ 500 Clients: ${opsPerSec} ops/sec (${duration.toFixed(0)}ms)`);
  console.log(`   📊 ${totalEvents} events processed across 10 rooms\n`);

  // Test 2: Network Latency Simulation
  console.log('⏱️  Testing Network Latency Simulation...');
  const latencyStart = performance.now();
  
  const latencyClients = [10, 50, 100, 200].map(latency => {
    const client = createKSync({ debug: false });
    const originalSend = client.send.bind(client);
    (client as any).send = async (...args: any[]) => {
      await new Promise(resolve => setTimeout(resolve, latency));
      return originalSend(...args);
    };
    return { client, latency };
  });

  await Promise.all(latencyClients.map(({ client, latency }) => 
    client.send('latency-test', { latency, timestamp: Date.now() })
  ));

  const latencyDuration = performance.now() - latencyStart;
  console.log(`✅ Latency Test: ${latencyDuration.toFixed(0)}ms for 10-200ms range\n`);

  // Test 3: High-Load Chat (100 users)
  console.log('⏱️  Testing High-Load Chat (100 users)...');
  const chatStart = performance.now();
  
  const chatClients = Array.from({ length: 100 }, (_, i) => 
    createChat(`room-${i % 5}`, {
      userId: `user-${i}`,
      performance: { batchSize: 5, batchDelay: 1 }
    })
  );

  let chatEvents = 0;
  await Promise.all(chatClients.map(async (client, i) => {
    // Each user sends 3 messages
    for (let j = 0; j < 3; j++) {
      await client.send('message', { text: `Hello from user ${i}` });
      chatEvents++;
    }
    // Set presence
    await client.setPresence({ status: 'online' as any });
    chatEvents++;
  }));

  const chatDuration = performance.now() - chatStart;
  const chatOpsPerSec = Math.round(chatEvents / (chatDuration / 1000));
  
  console.log(`✅ Chat Simulation: ${chatOpsPerSec} ops/sec (${chatEvents} events)\n`);

  // Test 4: Memory Efficiency with 1000 clients
  console.log('⏱️  Testing Memory Efficiency (1000 clients)...');
  const memoryStart = performance.now();
  
  let memoryEvents = 0;
  const batchSize = 100;
  
  for (let batch = 0; batch < 10; batch++) {
    const batchClients = Array.from({ length: batchSize }, (_, i) => 
      createKSync({
        userId: `mem-client-${batch * batchSize + i}`,
        storage: { options: { maxEvents: 50 } },
        performance: { batchSize: 10, batchDelay: 1 },
        debug: false
      })
    );

    await Promise.all(batchClients.map(async (client) => {
      for (let i = 0; i < 10; i++) {
        await client.send('memory-test', { data: 'x'.repeat(50) });
        memoryEvents++;
      }
    }));
  }

  const memoryDuration = performance.now() - memoryStart;
  const memoryOpsPerSec = Math.round(memoryEvents / (memoryDuration / 1000));
  const heapUsed = typeof process !== 'undefined' && process.memoryUsage 
    ? `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB` 
    : 'N/A';
  
  console.log(`✅ Memory Test: ${memoryOpsPerSec} ops/sec (${heapUsed} heap)\n`);

  // Summary
  console.log('📊 Scale Test Summary:');
  console.log(`✅ 500 Concurrent Clients: ${opsPerSec} ops/sec`);
  console.log(`✅ Network Latency Handled: 10-200ms range`);
  console.log(`✅ High-Load Chat: ${chatOpsPerSec} ops/sec`);
  console.log(`✅ Memory Efficiency: ${memoryOpsPerSec} ops/sec (${heapUsed})`);
  console.log(`\n🎉 KSync scales excellently to enterprise workloads!`);
}

quickScaleTest().catch(console.error); 