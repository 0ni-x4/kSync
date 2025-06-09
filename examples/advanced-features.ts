import { z } from 'zod';
import { 
  createKSync,
  createChat,
  createTodos,
  createGame,
  createAI,
  KSyncEvent
} from '../src'

// Advanced Features Example
async function advancedExample() {
  console.log('🚀 Advanced kSync Features Demo\n')

  // 1. Chat with optimized configuration
  console.log('💬 Creating optimized chat...')
  const chat = createChat('advanced-chat', {
    performance: {
      batchSize: 50,
      batchDelay: 5,
      materializationCaching: true
    },
    offline: {
      enabled: true,
      queueSize: 500,
      persistence: true
    },
    features: {
      presence: true,
      streaming: true
    },
    debug: true
  })

  // Define materializer for chat state
  chat.defineMaterializer('chat-state', (events: KSyncEvent[]) => {
    const state = {
      messages: [] as any[],
      users: new Set<string>(),
      lastActivity: Date.now()
    }

    events.forEach(event => {
      switch (event.type) {
        case 'message':
          state.messages.push(event.data)
          state.users.add(event.data.author)
          break
        case 'user-joined':
          state.users.add(event.data.username)
          break
      }
    })

    return state
  })

  // Listen for events
  chat.on('message', (data: any) => {
    console.log(`📨 ${data.author}: ${data.content}`)
  })

  // Send some messages
  await chat.send('message', {
    id: 'msg-1',
    content: 'Hello from advanced features!',
    author: 'System',
    timestamp: Date.now()
  })

  // Get materialized state
  const state = chat.getState()
  console.log('📊 Chat state:', state)

  // Set presence
  await chat.setPresence({
    userId: 'advanced-user',
    status: 'online',
    metadata: { feature: 'advanced-demo' }
  })

  console.log('✅ Advanced features demo completed!\n')
}

// Performance testing
async function performanceTest() {
  console.log('⚡ Performance Test\n')

  const ksync = createKSync({
    performance: {
      batchSize: 100,
      batchDelay: 1,
      materializationCaching: true
    },
    debug: false
  })

  console.log('📈 Sending 1000 events...')
  const startTime = Date.now()

  // Send events in parallel
  const promises = []
  for (let i = 0; i < 1000; i++) {
    promises.push(ksync.send('perf-test', {
      id: `perf-${i}`,
      value: i,
      timestamp: Date.now()
    }))
  }

  await Promise.all(promises)
  const endTime = Date.now()

  console.log(`⏱️  Completed in ${endTime - startTime}ms`)
  console.log(`📊 Events stored: ${ksync.getStatus().events}`)
  console.log(`🚀 Throughput: ${Math.round(1000 / (endTime - startTime) * 1000)} events/sec`)
}

// Factory function comparison
async function factoryComparison() {
  console.log('🏭 Factory Functions Comparison\n')

  // Create different optimized instances
  const chat = createChat('demo-chat')
  const todos = createTodos({ room: 'demo-todos' })
  const game = createGame('demo-game')
  const ai = createAI('demo-ai')

  console.log('Chat status:', chat.getStatus())
  console.log('Todos status:', todos.getStatus())  
  console.log('Game status:', game.getStatus())
  console.log('AI status:', ai.getStatus())

  // Test different configurations
  await chat.send('message', { text: 'Hello chat!' })
  await todos.send('todo-added', { text: 'Buy groceries', completed: false })
  await game.send('player-move', { x: 100, y: 200 })
  await ai.send('user-message', { content: 'What is KSync?' })

  console.log('✅ Factory comparison completed!\n')
}

// Streaming and presence demo
async function streamingPresenceDemo() {
  console.log('🎥 Streaming & Presence Demo\n')

  const ai = createAI('streaming-demo', {
    features: { streaming: true, presence: true }
  })

  // Start a stream
  const streamId = 'demo-stream'
  await ai.startStream(streamId, {
    type: 'ai-response',
    metadata: { model: 'gpt-4' }
  })

  // Send some chunks
  const chunks = ['Hello ', 'from ', 'the ', 'AI ', 'stream!']
  for (const chunk of chunks) {
    await ai.streamChunk(streamId, { data: chunk })
    console.log(`Streamed: "${chunk}"`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  // End stream
  await ai.endStream(streamId, { complete: true })

  // Update presence
  await ai.setPresence({
    userId: 'ai-demo',
    status: 'online',
    metadata: { activity: 'streaming' }
  })

  console.log('✅ Streaming & presence demo completed!\n')
}

// TODO: These examples will be enabled when the modules are fixed
function todoExamples() {
  console.log('📝 TODO Examples (to be implemented):')
  console.log('  - Multistore with CRDT')
  console.log('  - Drizzle ORM Integration') 
  console.log('  - Git-like Sync')
  console.log('  - Cross-store Operations')
  console.log('')
}

// Main execution
async function main() {
  try {
    await advancedExample()
    await performanceTest()
    await factoryComparison()
    await streamingPresenceDemo()
    todoExamples()
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

if (require.main === module) {
  main()
} 