import { z } from 'zod'
import { KSync } from '../src/core'
import { KSyncEvent } from '../src/types'
import { MemoryStorage } from '../src/storage/memory'
import { WebSocketSyncClient } from '../src/sync/websocket-client'

// Example: AI Chat with Streaming Responses
async function streamingExample() {
  console.log('🤖 Starting AI Streaming Example...\n')

  // Create kSync instance
  const ksync = new KSync({
    clientId: 'ai-client',
    debug: true
  })

  // Initialize with memory storage and WebSocket sync
  const storage = new MemoryStorage()
  const sync = new WebSocketSyncClient('ws://localhost:8081', 5, 1000, true)
  
  await ksync.initialize(storage, sync)

  // Define schemas
  ksync.defineSchema('user-message', z.object({
    id: z.string(),
    content: z.string(),
    author: z.string(),
    timestamp: z.number()
  }))

  ksync.defineSchema('ai-response-start', z.object({
    id: z.string(),
    streamId: z.string(),
    prompt: z.string(),
    timestamp: z.number()
  }))

  // Listen for user messages to trigger AI responses
  ksync.on('user-message', async (event: KSyncEvent) => {
    const data = event.data as { content: string; [key: string]: any }
    console.log(`👤 User: ${data.content}`)
    
    // Start AI response stream
    const streamId = await ksync.startStream({
      onChunk: (chunk) => {
        process.stdout.write(chunk) // Real-time display
      },
      onComplete: (fullResponse) => {
        console.log(`\n🤖 AI Response Complete: ${fullResponse.length} characters\n`)
      }
    })

    // Send AI response start event
    await ksync.send('ai-response-start', {
      id: `ai-${Date.now()}`,
      streamId,
      prompt: data.content,
      timestamp: Date.now()
    })

    // Simulate AI streaming response
    await simulateAIResponse(ksync, streamId, data.content)
  })

  // Send some test messages
  console.log('📝 Sending user messages...\n')
  
  await ksync.send('user-message', {
    id: 'msg-1',
    content: 'What is TypeScript?',
    author: 'Alice',
    timestamp: Date.now()
  })

  await new Promise(resolve => setTimeout(resolve, 3000))

  await ksync.send('user-message', {
    id: 'msg-2', 
    content: 'How does real-time sync work?',
    author: 'Bob',
    timestamp: Date.now()
  })

  // Keep running
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  await ksync.close()
}

async function simulateAIResponse(ksync: KSync, streamId: string, prompt: string): Promise<void> {
  const responses: Record<string, string> = {
    'What is TypeScript?': 'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. It adds static type definitions to JavaScript, which helps catch errors early in development and provides excellent IDE support with features like autocompletion, refactoring, and navigation.',
    'How does real-time sync work?': 'Real-time synchronization works by establishing persistent connections (like WebSockets) between clients and servers. When data changes on one client, it immediately sends the update to the server, which then broadcasts it to all other connected clients. This creates the illusion of instant updates across all users.',
  }

  const response = responses[prompt] || 'I understand your question. Let me provide a comprehensive response that addresses your specific needs and concerns in a helpful and informative way.'
  const words = response.split(' ')
  
  console.log('🤖 AI: ')
  
  // Stream word by word with realistic delays
  for (let i = 0; i < words.length; i++) {
    const chunk = i === 0 ? words[i] : ` ${words[i]}`
    if (chunk) {
      await ksync.streamChunk(streamId, chunk)
    }
    
    // Realistic typing delay
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))
  }
  
  await ksync.completeStream(streamId)
}

// Presence tracking example
async function presenceExample() {
  console.log('👥 Starting Presence Example...\n')

  const ksync = new KSync({
    clientId: 'presence-client',
    debug: true
  })

  const storage = new MemoryStorage()
  const sync = new WebSocketSyncClient('ws://localhost:8081', 5, 1000, true)
  
  await ksync.initialize(storage, sync)

  // Listen for presence updates
  ksync.onPresence((presence) => {
    const users = Object.keys(presence).length
    console.log(`👥 ${users} users online:`)
    
    Object.entries(presence).forEach(([clientId, data]) => {
      console.log(`  - ${(data as any).username || clientId}: ${(data as any).data?.status || 'online'}`)
    })
    console.log()
  })

  // Update our presence
  ksync.updatePresence({
    username: 'AI Assistant',
    status: 'active',
    capabilities: ['chat', 'streaming', 'analysis']
  })

  // Simulate status changes
  setTimeout(() => {
    ksync.updatePresence({ status: 'thinking' })
  }, 2000)

  setTimeout(() => {
    ksync.updatePresence({ status: 'responding' })
  }, 4000)

  setTimeout(() => {
    ksync.updatePresence({ status: 'idle' })
  }, 6000)

  await new Promise(resolve => setTimeout(resolve, 10000))
  await ksync.close()
}

// Run examples
async function main() {
  try {
    await streamingExample()
    await new Promise(resolve => setTimeout(resolve, 2000))
    await presenceExample()
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

if (require.main === module) {
  main()
} 