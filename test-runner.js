import { KSync, createKSync } from './dist/index.js';
import * as fs from 'fs';
import * as path from 'path';

async function runBasicTest() {
  console.log('🧪 Running Basic KSync Test');
  
  try {
    // Test basic creation
    const ksync = new KSync();
    console.log('✅ Basic KSync creation works');
    
    // Test factory functions  
    const simple = createKSync({ serverUrl: undefined }); // Don't try to connect
    console.log('✅ Simple factory works');
    
    // Test events without connection
    let eventReceived = false;
    simple.on('test', () => { eventReceived = true; });
    await simple.send('test', { message: 'hello' });
    
    setTimeout(() => {
      if (eventReceived) {
        console.log('✅ Event handling works');
      } else {
        console.log('❌ Event handling failed');
      }
      
      const status = simple.getStatus();
      console.log(`📊 Status: online: ${status.online}, room: ${status.room}`);
      console.log('🎉 Basic test completed successfully!');
    }, 100);
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

runBasicTest(); 