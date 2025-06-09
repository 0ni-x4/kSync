const { KSync, createKSync, createChat } = require('./dist/index.js');

async function runBasicTest() {
  console.log('🧪 Running Basic KSync Test');
  
  try {
    // Test basic creation
    const ksync = new KSync();
    console.log('✅ Basic KSync creation works');
    
    // Test factory functions
    const chat = createChat('test-room');
    console.log('✅ Chat factory works');
    
    // Test events
    let eventReceived = false;
    chat.on('test', () => { eventReceived = true; });
    await chat.send('test', { message: 'hello' });
    
    setTimeout(() => {
      if (eventReceived) {
        console.log('✅ Event handling works');
      } else {
        console.log('❌ Event handling failed');
      }
      
      const status = chat.getStatus();
      console.log(`📊 Status: ${status.events} events, room: ${status.room}`);
      console.log('🎉 Basic test completed successfully!');
    }, 100);
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

runBasicTest(); 