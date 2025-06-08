import { z } from 'zod';
import { createKSync, KSyncEvent } from '../src/index';

// Define schemas
const TodoSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
  createdAt: z.number(),
});

const TodoCompletedSchema = z.object({
  id: z.string(),
  completed: z.boolean(),
});

// Create two kSync instances to simulate different clients
const client1 = createKSync({
  clientId: 'client-1',
  serverUrl: 'ws://localhost:8080',
  debug: true,
});

const client2 = createKSync({
  clientId: 'client-2', 
  serverUrl: 'ws://localhost:8080',
  debug: true,
});

// Define schemas for both clients
[client1, client2].forEach(client => {
  client.defineSchema('todo-created', TodoSchema);
  client.defineSchema('todo-completed', TodoCompletedSchema);
});

// Define materializers for both clients
interface TodoState {
  todos: Map<string, {
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
  }>;
}

const todoMaterializer = (events: KSyncEvent[]) => {
  const state: TodoState = {
    todos: new Map(),
  };

  for (const event of events) {
    switch (event.type) {
      case 'todo-created':
        state.todos.set((event.data as any).id, event.data as any);
        break;
      case 'todo-completed':
        const todo = state.todos.get((event.data as any).id);
        if (todo) {
          todo.completed = (event.data as any).completed;
        }
        break;
    }
  }

  return state;
};

client1.defineMaterializer('todos', todoMaterializer);
client2.defineMaterializer('todos', todoMaterializer);

// Set up event listeners
client1.on('todo-created', (event: KSyncEvent) => {
  const data = event.data as z.infer<typeof TodoSchema>;
  console.log(`[Client 1] 📝 Todo created: ${data.text}`);
});

client1.on('todo-completed', (event: KSyncEvent) => {
  const data = event.data as z.infer<typeof TodoCompletedSchema>;
  console.log(`[Client 1] ✅ Todo completed: ${data.id}`);
});

client2.on('todo-created', (event: KSyncEvent) => {
  const data = event.data as z.infer<typeof TodoSchema>;
  console.log(`[Client 2] 📝 Todo created: ${data.text}`);
});

client2.on('todo-completed', (event: KSyncEvent) => {
  const data = event.data as z.infer<typeof TodoCompletedSchema>;
  console.log(`[Client 2] ✅ Todo completed: ${data.id}`);
});

async function runSyncExample() {
  console.log('🚀 Starting kSync real-time sync example...\n');
  console.log('Make sure the kSync server is running on port 8080');
  console.log('Run: bun run server/websocket-server.ts\n');

  try {
    // Initialize both clients
    await Promise.all([
      client1.initialize(),
      client2.initialize(),
    ]);

    console.log('✅ Both clients initialized\n');

    // Wait a bit for connections to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Client 1 creates a todo
    console.log('📝 Client 1 creating todos...');
    await client1.send('todo-created', {
      id: 'todo-1',
      text: 'Learn kSync',
      completed: false,
      createdAt: Date.now(),
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    await client1.send('todo-created', {
      id: 'todo-2',
      text: 'Build awesome app',
      completed: false,
      createdAt: Date.now(),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Client 2 completes a todo
    console.log('\n✅ Client 2 completing todo...');
    await client2.send('todo-completed', {
      id: 'todo-1',
      completed: true,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Client 2 creates another todo
    console.log('\n📝 Client 2 creating todo...');
    await client2.send('todo-created', {
      id: 'todo-3',
      text: 'Test real-time sync',
      completed: false,
      createdAt: Date.now(),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Show final state from both clients
    console.log('\n📊 Final state comparison:');
    
    const state1 = client1.getState('todos') as TodoState | undefined;
    const state2 = client2.getState('todos') as TodoState | undefined;

    console.log('\nClient 1 todos:');
    state1?.todos.forEach((todo: any, id: string) => {
      console.log(`  ${todo.completed ? '✅' : '⭕'} ${todo.text} (${id})`);
    });

    console.log('\nClient 2 todos:');
    state2?.todos.forEach((todo: any, id: string) => {
      console.log(`  ${todo.completed ? '✅' : '⭕'} ${todo.text} (${id})`);
    });

    // Verify sync worked
    const todos1 = Array.from(state1?.todos.values() || []);
    const todos2 = Array.from(state2?.todos.values() || []);
    
    if (todos1.length === todos2.length) {
      console.log('\n🎉 Sync successful! Both clients have the same state.');
    } else {
      console.log('\n❌ Sync issue: Clients have different states.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await Promise.all([
      client1.disconnect(),
      client2.disconnect(),
    ]);
    console.log('\n🔌 Clients disconnected');
  }
}

// Run the example
runSyncExample().catch(console.error); 