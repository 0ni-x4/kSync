#!/usr/bin/env tsx

import { createKSync } from './src/core';
import { KSyncServer } from './server/ksync-server';

async function testRealSync() {
  console.log('🚀 Testing REAL Data Sync\n');

  // Start a real server
  const server = new KSyncServer({ port: 8081, debug: false });
  await server.start();
  console.log('📡 Server started on port 8081');

  try {
    // Create two clients
    const client1 = createKSync({
      serverUrl: 'ws://localhost:8081',
      room: 'test-sync',
      userId: 'client1',
      debug: { events: true, sync: true }
    });

    const client2 = createKSync({
      serverUrl: 'ws://localhost:8081', 
      room: 'test-sync',
      userId: 'client2',
      debug: { events: true, sync: true }
    });

    // Track received events
    const client1Events: any[] = [];
    const client2Events: any[] = [];

    client1.on('test-message', (data: any) => {
      client1Events.push({ from: 'client1', data });
    });

    client2.on('test-message', (data: any) => {
      client2Events.push({ from: 'client2', data });
    });

    // Connect both clients
    console.log('🔌 Connecting clients...');
    await Promise.all([
      client1.connect(),
      client2.connect()
    ]);

    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 200));

    // Client1 sends a message
    console.log('📤 Client1 sending message...');
    await client1.send('test-message', {
      text: 'Hello from client1!',
      timestamp: Date.now()
    });

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 100));

    // Client2 sends a message
    console.log('📤 Client2 sending message...');
    await client2.send('test-message', {
      text: 'Hello from client2!', 
      timestamp: Date.now()
    });

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check results
    console.log('\n📊 SYNC RESULTS:');
    console.log(`Client1 received: ${client1Events.length} events`);
    console.log(`Client2 received: ${client2Events.length} events`);
    
    client1Events.forEach((event, i) => {
      console.log(`  Client1[${i}]: ${JSON.stringify(event.data)}`);
    });
    
    client2Events.forEach((event, i) => {
      console.log(`  Client2[${i}]: ${JSON.stringify(event.data)}`);
    });

    // Verify sync worked
    const syncWorked = client1Events.length > 0 && client2Events.length > 0;
    
    if (syncWorked) {
      console.log('\n✅ DATA SYNC WORKS! Both clients received events.');
    } else {
      console.log('\n❌ DATA SYNC FAILED! Events not received properly.');
    }

    // Clean up
    await client1.disconnect();
    await client2.disconnect();
    
    return syncWorked;

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    return false;
  } finally {
    await server.stop();
    console.log('\n📡 Server stopped');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testRealSync()
    .then(success => {
      if (success) {
        console.log('\n🎉 REAL SYNC TEST PASSED!');
        process.exit(0);
      } else {
        console.log('\n💥 REAL SYNC TEST FAILED!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Test crashed:', error);
      process.exit(1);
    });
}

export { testRealSync };