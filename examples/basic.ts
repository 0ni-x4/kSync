import { z } from 'zod';
import { createKSync, KSyncEvent } from '../src/index';

// Create a kSync instance instead of using the default
const ksync = createKSync();

// Define schemas for our events
const MessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  author: z.string(),
  createdAt: z.number(),
});

const UserJoinedSchema = z.object({
  userId: z.string(),
  username: z.string(),
  timestamp: z.number(),
});

// Define our event schemas
ksync.defineSchema('message', MessageSchema);
ksync.defineSchema('user-joined', UserJoinedSchema);

// Define a materializer to create a chat state from events
interface ChatState {
  messages: Array<{
    id: string;
    content: string;
    author: string;
    createdAt: number;
  }>;
  users: Set<string>;
}

ksync.defineMaterializer('chat', (events: KSyncEvent[]) => {
  const state: ChatState = {
    messages: [],
    users: new Set(),
  };

  for (const event of events) {
    switch (event.type) {
      case 'message':
        state.messages.push(event.data as z.infer<typeof MessageSchema>);
        break;
      case 'user-joined':
        state.users.add((event.data as z.infer<typeof UserJoinedSchema>).username);
        break;
    }
  }

  // Sort messages by creation time
  state.messages.sort((a, b) => a.createdAt - b.createdAt);

  return state;
});

// Listen to events
ksync.on('message', (event: KSyncEvent) => {
  const data = event.data as z.infer<typeof MessageSchema>;
  console.log(`📨 New message from ${data.author}: ${data.content}`);
});

ksync.on('user-joined', (event: KSyncEvent) => {
  const data = event.data as z.infer<typeof UserJoinedSchema>;
  console.log(`👋 ${data.username} joined the chat`);
});

async function runExample() {
  console.log('🚀 Starting kSync basic example...\n');

  // Initialize kSync
  await ksync.initialize();

  // Simulate a user joining
  await ksync.send('user-joined', {
    userId: 'user-1',
    username: 'Alice',
    timestamp: Date.now(),
  });

  // Send some messages
  await ksync.send('message', {
    id: 'msg-1',
    content: 'Hello everyone!',
    author: 'Alice',
    createdAt: Date.now(),
  });

  await new Promise(resolve => setTimeout(resolve, 100));

  await ksync.send('message', {
    id: 'msg-2',
    content: 'How is everyone doing?',
    author: 'Alice',
    createdAt: Date.now(),
  });

  // Another user joins
  await ksync.send('user-joined', {
    userId: 'user-2',
    username: 'Bob',
    timestamp: Date.now(),
  });

  await ksync.send('message', {
    id: 'msg-3',
    content: 'Hey Alice! I\'m doing great!',
    author: 'Bob',
    createdAt: Date.now(),
  });

  // Get the materialized chat state
  const chatState = ksync.getState() as ChatState | undefined;
  
  console.log('\n📊 Current chat state:');
  console.log(`Users: ${Array.from(chatState?.users || []).join(', ')}`);
  console.log(`Messages: ${chatState?.messages.length || 0}`);
  
  console.log('\n💬 Message history:');
  chatState?.messages.forEach((msg: any, i: number) => {
    console.log(`${i + 1}. [${msg.author}]: ${msg.content}`);
  });

  // Get all events
  const events = await ksync.getEvents();
  console.log(`\n📝 Total events stored: ${events.length}`);

  console.log('\n✅ Example completed!');
}

// Run the example
runExample().catch(console.error); 