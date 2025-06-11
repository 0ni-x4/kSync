#!/usr/bin/env npx tsx

/**
 * 🔍 Connection Debugging Example
 * 
 * This example shows how to diagnose and fix common connection issues.
 * Run this if you're having trouble connecting to your kSync server.
 */

import { KSync } from '../src/core.js';
import { diagnoseConnection, testConnection } from '../src/utils.js';

async function debugConnectionIssues() {
  console.log('🔍 kSync Connection Debugging Guide');
  console.log('===================================\n');

  // Common server URLs to test
  const testUrls = [
    'ws://localhost:8080',      // Most common development setup
    'ws://localhost:3000',      // Alternative development port
    'ws://127.0.0.1:8080',     // Explicit localhost
    'wss://your-domain.com/ws'  // Production example
  ];

  console.log('📋 Quick Tests for Common Setups');
  console.log('---------------------------------');

  for (const url of testUrls.slice(0, 3)) { // Test local URLs only
    console.log(`\n🔗 Testing: ${url}`);
    const result = await testConnection(url, 2000); // Quick 2s timeout
    
    if (result.success) {
      console.log(`   ✅ ${result.message}`);
    } else {
      console.log(`   ❌ ${result.message}`);
    }
  }

  console.log('\n\n🛠️ Detailed Diagnosis');
  console.log('======================');
  
  // Let user specify their server URL
  const serverUrl = process.env.KSYNC_SERVER_URL || 'ws://localhost:8080';
  console.log(`Using server URL: ${serverUrl}`);
  console.log('(Set KSYNC_SERVER_URL environment variable to test different URL)\n');

  await diagnoseConnection(serverUrl);

  console.log('\n\n🎯 Common Solutions');
  console.log('==================');
  console.log('1. **Server Not Running**');
  console.log('   • Start your kSync server: npm run server');
  console.log('   • Or use a different port: ws://localhost:3000');
  console.log('');
  console.log('2. **Wrong URL Format**');
  console.log('   • Use ws:// for HTTP servers');
  console.log('   • Use wss:// for HTTPS servers');
  console.log('   • Include /ws path if required: ws://localhost:8080/ws');
  console.log('');
  console.log('3. **Development vs Production**');
  console.log('   • Development: ws://localhost:8080');
  console.log('   • Production: wss://your-domain.com/ws');
  console.log('');
  console.log('4. **Firewall/Network Issues**');
  console.log('   • Check browser console for security errors');
  console.log('   • Ensure CORS is configured on server');
  console.log('   • Try different ports or networks');
  console.log('');

  console.log('📚 Next Steps');
  console.log('=============');
  console.log('• If connection works, try creating a KSync instance:');
  console.log('  const ksync = new KSync({ serverUrl: "ws://localhost:8080", debug: true });');
  console.log('');
  console.log('• Enable debug mode to see detailed connection logs:');
  console.log('  const ksync = new KSync({ debug: true });');
  console.log('');
  console.log('• Check server logs for connection attempts');
  console.log('• Visit https://docs.ksync.dev for complete setup guide');
}

// Example of using KSync with better error handling
async function exampleWithErrorHandling() {
  console.log('\n\n🚀 Example: KSync with Error Handling');
  console.log('=====================================');

  const serverUrl = 'ws://localhost:8080';
  
  try {
    const ksync = new KSync({
      serverUrl,
      room: 'debug-test',
      debug: true // Enable detailed logging
    });

    console.log('⏳ Attempting connection...');
    await ksync.connect();
    
    console.log('✅ Connected successfully!');
    console.log('📡 Sending test event...');
    
    await ksync.send('test', { message: 'Hello from debug example!' });
    console.log('✅ Event sent successfully!');
    
    await ksync.disconnect();
    console.log('✅ Disconnected cleanly');
    
  } catch (error: any) {
    console.log('❌ Connection failed with detailed error:');
    console.log(error.message || error);
    
    if (error.message && error.message.includes('Failed to connect')) {
      console.log('\n💡 Quick fix: Make sure your server is running!');
      console.log('   Try: npm run server');
    }
  }
}

// Run the debugging examples
debugConnectionIssues()
  .then(() => exampleWithErrorHandling())
  .catch(console.error);