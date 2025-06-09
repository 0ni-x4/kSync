import { z } from 'zod'
import { createAI, KSyncEvent } from '../src/index'

// Example: AI Chat with Streaming Responses
async function streamingExample() {
  console.log('🤖 Starting AI Streaming Example...\n')

  // Create kSync instance for AI
  const ksync = createAI('ai-chat');

  // Listen for user messages to trigger AI responses
  ksync.on('user-message', async (data: any) => {
    console.log(`👤 User: ${data.content}`)
    
    // Start AI response stream
    const streamId = `ai-response-${Date.now()}`;
    await ksync.startStream(streamId, {
      type: 'ai-response',
      metadata: { prompt: data.content }
    });

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
}

async function simulateAIResponse(ksync: any, streamId: string, prompt: string): Promise<void> {
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
      await ksync.streamChunk(streamId, { data: chunk })
    }
    
    // Realistic typing delay
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))
  }
  
  await ksync.endStream(streamId, { complete: true })
}

// Presence tracking example
async function presenceExample() {
  console.log('👥 Starting Presence Example...\n')

  const ksync = createAI('presence-demo');

  // Listen for presence updates
  ksync.on('presence-update', (presence: any) => {
    console.log(`👥 User presence updated:`, presence);
  })

  // Update our presence
  await ksync.setPresence({
    userId: 'ai-assistant',
    status: 'online',
    metadata: {
      username: 'AI Assistant',
      capabilities: ['chat', 'streaming', 'analysis']
    }
  })

  // Simulate status changes
  setTimeout(() => {
    ksync.setPresence({ status: 'away', metadata: { activity: 'thinking' } })
  }, 2000)

  setTimeout(() => {
    ksync.setPresence({ status: 'online', metadata: { activity: 'responding' } })
  }, 4000)

  setTimeout(() => {
    ksync.setPresence({ status: 'away', metadata: { activity: 'idle' } })
  }, 6000)

  await new Promise(resolve => setTimeout(resolve, 10000))
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